/**
 * Observe the timestamp of the frame currently presented by a video.
 *
 * requestVideoFrameCallback is the only browser API that gives us the media
 * timestamp for the frame that was actually presented. A single entry is
 * shared for each video so overlay consumers do not each create their own
 * callback loop. The observer never changes media playback state.
 */

export type VideoFrameListener = (mediaTime:number)=>void;

type FrameCallback = (now:number,metadata:VideoFrameCallbackMetadata)=>void;

interface SourceIdentity {
 currentSrc:string;
 src:string;
 srcObject:unknown;
}

interface FrameEntry {
 video:HTMLVideoElement;
 listeners:Set<VideoFrameListener>;
 source:SourceIdentity;
 lastMediaTime:number;
 invalidated:boolean;
 generation:number;
 scheduled:boolean;
 pendingKind:'video'|'raf'|null;
 pendingId:number|null;
 useVideoFrameCallback:boolean;
 eventHandlers:Map<string,EventListener>;
 active:boolean;
}

const entries=new WeakMap<HTMLVideoElement,FrameEntry>();
const LOOP_EPSILON=1e-4;

function sourceIdentity(video:HTMLVideoElement):SourceIdentity{
 return {
  currentSrc:String(video.currentSrc||''),
  src:String(video.src||''),
  srcObject:video.srcObject,
 };
}

function sameSource(a:SourceIdentity,b:SourceIdentity){
 return a.currentSrc===b.currentSrc&&a.src===b.src&&a.srcObject===b.srcObject;
}

function currentTime(video:HTMLVideoElement){
 if(video.seeking)return NaN;
 const value=Number(video.currentTime);
 if(!Number.isFinite(value))return NaN;
 // A currentTime value before the first decoded frame is a seek target, not
 // evidence that a frame is on screen. Mocks without readyState are treated
 // as ready to keep this small observer easy to use outside a browser.
 const readyState=Number(video.readyState);
 if(Number.isFinite(readyState)&&readyState<2)return NaN;
 return value;
}

function emit(entry:FrameEntry,time:number,force=false){
 if(!entry.listeners.size)return;
 if(!force&&entry.invalidated===false&&Object.is(time,entry.lastMediaTime))return;
 entry.lastMediaTime=time;
 entry.invalidated=!Number.isFinite(time);
 for(const listener of [...entry.listeners])listener(time);
}

function cancelPending(entry:FrameEntry){
 if(!entry.scheduled)return;
 const {video,pendingKind,pendingId}=entry;
 entry.scheduled=false;
 entry.pendingKind=null;
 entry.pendingId=null;
 if(pendingId===null)return;
 if(pendingKind==='video'){
  try{video.cancelVideoFrameCallback?.(pendingId);}catch{/* A browser may reject an already-fired callback. */}
 }else if(pendingKind==='raf')cancelRaf(video,pendingId);
}

function invalidate(entry:FrameEntry){
 entry.generation++;
 cancelPending(entry);
 if(!entry.invalidated)emit(entry,NaN,true);
 else entry.lastMediaTime=NaN;
}

function refreshSource(entry:FrameEntry){
 const next=sourceIdentity(entry.video);
 if(sameSource(entry.source,next))return false;
 entry.source=next;
 invalidate(entry);
 return true;
}

function rafWindow(video:HTMLVideoElement):Window|typeof globalThis|undefined{
 return video.ownerDocument?.defaultView||globalThis;
}

function requestRaf(video:HTMLVideoElement,callback:FrameRequestCallback){
 const host=rafWindow(video),request=host?.requestAnimationFrame;
 if(typeof request==='function')return request.call(host,callback);
 return setTimeout(()=>callback(performance.now()),16) as unknown as number;
}

function cancelRaf(video:HTMLVideoElement,id:number){
 const host=rafWindow(video),cancel=host?.cancelAnimationFrame;
 if(typeof cancel==='function')cancel.call(host,id);
 else clearTimeout(id);
}

function shouldContinue(entry:FrameEntry){
 const video=entry.video;
 // HTMLVideoElement.paused is always boolean in the browser. The permissive
 // check also makes plain test doubles behave as playing videos by default.
 return video.paused!==true&&!video.ended;
}

function schedule(entry:FrameEntry){
 if(!entry.listeners.size||entry.video.seeking)return;
 if(entry.scheduled)return;
 const {video}=entry,generation=entry.generation;
 if(entry.useVideoFrameCallback){
  const callback:FrameCallback=(_now,metadata)=>{
   if(!isLive(entry)||generation!==entry.generation)return;
   entry.scheduled=false;entry.pendingKind=null;entry.pendingId=null;
   if(refreshSource(entry)){schedule(entry);return;}
   const time=Number(metadata.mediaTime);
   const actual=Number.isFinite(time)?time:currentTime(video);
   if(Number.isFinite(actual)&&Number.isFinite(entry.lastMediaTime)&&actual+LOOP_EPSILON<entry.lastMediaTime)invalidate(entry);
   if(Number.isFinite(actual))emit(entry,actual,true);
   else emit(entry,NaN,true);
   if(isLive(entry)&&shouldContinue(entry))schedule(entry);
  };
  try{
   entry.scheduled=true;entry.pendingKind='video';
   entry.pendingId=video.requestVideoFrameCallback!(callback);
   return;
  }catch{
   entry.scheduled=false;entry.pendingKind=null;entry.pendingId=null;entry.useVideoFrameCallback=false;
  }
 }
 const callback:FrameRequestCallback=()=>{
  if(!isLive(entry)||generation!==entry.generation)return;
  entry.scheduled=false;entry.pendingKind=null;entry.pendingId=null;
  if(refreshSource(entry)){schedule(entry);return;}
  const actual=currentTime(video);
  if(Number.isFinite(actual)&&Number.isFinite(entry.lastMediaTime)&&actual+LOOP_EPSILON<entry.lastMediaTime)invalidate(entry);
  emit(entry,actual);
  if(isLive(entry)&&shouldContinue(entry))schedule(entry);
 };
 entry.scheduled=true;entry.pendingKind='raf';entry.pendingId=requestRaf(video,callback);
}

function isLive(entry:FrameEntry){return entry.listeners.size>0&&entry.active&&entries.get(entry.video)===entry;}

function eventHandler(entry:FrameEntry,name:string){
 return ()=>{
  if(!isLive(entry))return;
  if(refreshSource(entry)){
   schedule(entry);
   return;
  }
  if(name==='seeking'||name==='emptied'||name==='loadstart'){
   invalidate(entry);
   if(name!=='seeking')schedule(entry);
   return;
  }
  if(name==='seeked'){
   // seeked is also the recovery path for a paused video: rVFC may wait for
   // playback to resume, while the seeked frame is already drawable now.
   emit(entry,currentTime(entry.video),true);
   schedule(entry);
   return;
  }
  if(name==='pause'||name==='ended'){
   invalidate(entry);emit(entry,currentTime(entry.video),true);return;
  }
  if(!entry.useVideoFrameCallback&&(name==='timeupdate'||name==='loadeddata'||name==='canplay'||name==='progress'||name==='durationchange'||name==='pause')){
   const actual=currentTime(entry.video);
   if(name==='timeupdate'&&Number.isFinite(actual)&&Number.isFinite(entry.lastMediaTime)&&actual+LOOP_EPSILON<entry.lastMediaTime){
    invalidate(entry);emit(entry,actual,true);
   }else emit(entry,actual);
  }
  schedule(entry);
 };
}

/** Return the latest displayed media timestamp known for this video. */
export function displayedVideoTime(video:HTMLVideoElement){
 const entry=entries.get(video);
 if(entry){
  if(entry.invalidated)return NaN;
  return entry.lastMediaTime;
 }
 return currentTime(video);
}

/**
 * Subscribe to displayed video frames. The first notification is synchronous
 * and uses the ready video's current frame timestamp. Unsubscribe removes all
 * event listeners and pending frame callbacks when it is the final listener.
 */
export function subscribeVideoFrames(video:HTMLVideoElement,listener:VideoFrameListener){
 let entry=entries.get(video);
 if(!entry){
  entry={
   video,listeners:new Set(),source:sourceIdentity(video),lastMediaTime:NaN,
   invalidated:true,generation:0,scheduled:false,pendingKind:null,pendingId:null,
   useVideoFrameCallback:typeof video.requestVideoFrameCallback==='function',eventHandlers:new Map(),active:true,
  };
  entries.set(video,entry);
  const initial=currentTime(video);
  entry.lastMediaTime=initial;entry.invalidated=!Number.isFinite(initial);
  const events=['loadstart','emptied','loadedmetadata','loadeddata','canplay','durationchange','progress','seeking','seeked','timeupdate','play','playing','pause','ended','ratechange'];
  for(const name of events){const handler=eventHandler(entry,name);entry.eventHandlers.set(name,handler);video.addEventListener(name,handler);}
 }
 if(!entry)throw new Error('Unable to create video frame observer');
 const subscribedEntry=entry;
 subscribedEntry.listeners.add(listener);
 // A second consumer immediately receives the already displayed timestamp.
 listener(displayedVideoTime(video));
 schedule(subscribedEntry);
 return ()=>{
  if(!subscribedEntry.listeners.delete(listener))return;
  if(subscribedEntry.listeners.size)return;
  subscribedEntry.active=false;subscribedEntry.generation++;cancelPending(subscribedEntry);
  for(const [name,handler] of subscribedEntry.eventHandlers)subscribedEntry.video.removeEventListener(name,handler);
  subscribedEntry.eventHandlers.clear();entries.delete(subscribedEntry.video);
 };
}
