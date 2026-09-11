type Media={currentTime:number;duration:number;playbackRate?:number;play:()=>Promise<void>};
type ClockMedia=Media&{pause:()=>void;paused:boolean;readyState:number;seeking:boolean;playbackRate:number};
type PreparedMedia=ClockMedia&{muted:boolean;addEventListener:unknown};
type PositionMedia=Media&{readyState?:number;seeking?:boolean};
const preparable=(media:Media):media is PreparedMedia=>typeof (media as PreparedMedia).pause==='function'&&typeof (media as PreparedMedia).addEventListener==='function';
const clockMedia=(media:Media):media is ClockMedia=>typeof (media as ClockMedia).pause==='function'&&typeof (media as ClockMedia).paused==='boolean'&&typeof (media as ClockMedia).readyState==='number'&&typeof (media as ClockMedia).seeking==='boolean'&&typeof media.playbackRate==='number'&&Number.isFinite(media.playbackRate)&&media.playbackRate>0;
class CanceledStart extends Error{}
/** Keep cancellation responsive even when an iPhone decoder's play promise is still pending. */
function waitCurrent<T>(work:Promise<T>,isCurrent:()=>boolean):Promise<T>{
 return new Promise((resolve,reject)=>{
  const poll=setInterval(()=>{if(!isCurrent())finish(new CanceledStart());},20);
  const timeout=setTimeout(()=>finish(new Error('開始位置の読み込みが間に合いませんでした。動画を短くするか軽量化して試してください。')),8000);
  let finished=false;
  function finish(error?:unknown,value?:T){if(finished)return;finished=true;clearInterval(poll);clearTimeout(timeout);if(error)reject(error);else resolve(value as T);}
  work.then(value=>finish(undefined,value),error=>finish(error));
 });
}
function waitReady(media:PreparedMedia,target:number,isCurrent:()=>boolean):Promise<void>{
 return new Promise((resolve,reject)=>{
  const deadline=Date.now()+8000;
  const check=()=>{
   if(!isCurrent()){reject(new CanceledStart());return;}
   if(!media.seeking&&media.readyState>=2&&Math.abs(media.currentTime-target)<.035){resolve();return;}
   if(Date.now()>=deadline){reject(new Error('動画の開始フレームを準備できませんでした。動画を軽量化して試してください。'));return;}
   setTimeout(check,20);
  };
  // A seek may update currentTime before its decoding/seek events have started.
  setTimeout(check,20);
 });
}
function waitPosition(media:Media,target:number,isCurrent:()=>boolean):Promise<void>{
 return new Promise((resolve,reject)=>{
  let timer:ReturnType<typeof setTimeout>|undefined,finished=false,seekObserved=false;
  const deadline=Date.now()+8000,check=()=>{
   if(!isCurrent()){finish(new CanceledStart());return;}
   const positioned=media as PositionMedia;
   if(positioned.seeking===true)seekObserved=true;
   const settledWhilePlaying=positioned.seeking===false&&(positioned as PositionMedia&{paused?:boolean}).paused===false&&seekObserved;
   if(positioned.seeking!==true&&(positioned.readyState===undefined||positioned.readyState>=2)&&Number.isFinite(media.currentTime)&&(Math.abs(media.currentTime-target)<.035||settledWhilePlaying)){finish();return;}
   if(Date.now()>=deadline){finish(new Error('動画の開始フレームを準備できませんでした。動画を軽量化して試してください。'));return;}
   timer=setTimeout(check,20);
  };
  const finish=(error?:unknown)=>{if(finished)return;finished=true;if(timer)clearTimeout(timer);if(error)reject(error);else resolve();};
  // A native currentTime setter is synchronous but its decode/seek events are
  // not. Observe at least the next task before declaring the requested frame ready.
  timer=setTimeout(check,20);
 });
}
/** Prepare the requested positions once. Do not retry/rewind to chase clock differences. */
async function startPrepared(reference:PreparedMedia,self:PreparedMedia,targetSelf:(t:number)=>number,isCurrent:()=>boolean,rateReady?:Promise<void>){
 const start=reference.currentTime,ownStart=targetSelf(start),muted=[reference.muted,self.muted];
 let accepted=false;
 reference.pause();self.pause();reference.muted=true;self.muted=true;
 try{
  // Invoke both play() calls synchronously, before awaiting, to retain iPhone gesture authorization.
  const warm=(media:PreparedMedia)=>media.play().then(()=>{if(isCurrent())media.pause();});
  await waitCurrent(Promise.all([warm(reference),warm(self),rateReady]),isCurrent);
  if(!isCurrent())throw new CanceledStart();
  reference.pause();self.pause();reference.currentTime=start;self.currentTime=ownStart;
  await Promise.all([waitReady(reference,start,isCurrent),waitReady(self,ownStart,isCurrent)]);
  if(!isCurrent())throw new CanceledStart();
  reference.muted=muted[0];self.muted=muted[1];
  await waitCurrent(Promise.all([reference.play(),self.play()]),isCurrent);
  if(!isCurrent())throw new CanceledStart();
  await settleStartupClocks(reference,self,targetSelf,isCurrent);
  accepted=true;return true;
 }catch(error){if(error instanceof CanceledStart)return false;throw error;}
 finally{
  if(isCurrent()){
   if(!accepted){reference.pause();self.pause();reference.currentTime=start;self.currentTime=ownStart;}
   reference.muted=muted[0];self.muted=muted[1];
  }
 }
}
/** Local files use a preparation barrier. An embedded player exposes no decoded-frame readiness. */
export async function startComparison(reference:Media,self:Media|null,targetSelf:(t:number)=>number,selfRate:number,isCurrent:()=>boolean,rateReady?:Promise<void>,targetReference?: (t:number)=>number){
 if(!isCurrent())return false;
 const initialTarget=targetSelf(reference.currentTime);
 if(self&&initialTarget>=0&&initialTarget<self.duration&&preparable(reference)&&preparable(self))return startPrepared(reference,self,targetSelf,isCurrent,rateReady);
 try{
  const referenceStart=reference.play();
  const target=targetReference&&self?self.currentTime:targetSelf(reference.currentTime);
  const selfStart=self&&target>=0&&target<self.duration?self.play():Promise.resolve();
  await Promise.all([referenceStart,selfStart,rateReady]);
  if(!isCurrent())return false;
  if(self&&initialTarget>=0&&initialTarget<self.duration&&clockMedia(reference)&&clockMedia(self))await settleStartupClocks(reference,self,targetSelf,isCurrent);
  else if(self)await correctFollower(reference,self,targetSelf,selfRate,targetReference,isCurrent);
  return true;
 }catch(error){if(error instanceof CanceledStart)return false;throw error;}
}
/** play() can resolve before a native clock stalls briefly while its audio sink
 * starts. Observe that startup once, then hold the ahead player until the other
 * catches it. This avoids introducing another decode delay through a final seek.
 * There is no background drift correction after this startup barrier. */
async function settleStartupClocks(reference:ClockMedia,self:ClockMedia,targetSelf:(t:number)=>number,isCurrent:()=>boolean){
 const initial=[reference.currentTime,self.currentTime],began=Date.now();
 await new Promise<void>((resolve,reject)=>{
  const check=()=>{
   if(!isCurrent()){reject(new CanceledStart());return;}
   const elapsed=Date.now()-began;
   if(elapsed>=250&&[reference,self].every((m,i)=>!m.seeking&&m.readyState>=2&&((m.currentTime-initial[i])/m.playbackRate>=.08||m.paused))){resolve();return;}
   if(elapsed>=8000){reject(new Error('動画の再生時計が進みません。読み込みを待って再生し直してください。'));return;}
   setTimeout(check,12);
  };check();
 });
 if(!isCurrent())throw new CanceledStart();
 const gap=targetSelf(reference.currentTime)-self.currentTime;
 if(reference.paused||self.paused)throw new Error('動画が停止しました。再生位置を戻して、もう一度同期再生してください。');
 if(Math.abs(gap)<=self.playbackRate*.025)return;
 const ahead=gap>0?reference:self;ahead.pause();
 await new Promise<void>((resolve,reject)=>{
  const deadline=Date.now()+8000;
  const check=()=>{
   if(!isCurrent()){reject(new CanceledStart());return;}
   const behind=ahead===reference?self:reference;
   if(behind.paused||behind.currentTime>=behind.duration-.001){reject(new Error('動画の終端です。再生位置を戻して、もう一度同期再生してください。'));return;}
   const remaining=targetSelf(reference.currentTime)-self.currentTime;
   if(ahead.paused&&(gap>0?remaining<=0:remaining>=0)){resolve();return;}
   if(Date.now()>=deadline){reject(new Error('動画の再生時計が進みません。読み込みを待って再生し直してください。'));return;}
   setTimeout(check,4);
  };check();
 });
 if(!isCurrent())throw new CanceledStart();
 await waitCurrent(ahead.play(),isCurrent);
}
export async function correctFollower(reference:Media,self:Media,targetSelf:(t:number)=>number,selfRate:number,targetReference?: (t:number)=>number,isCurrent:()=>boolean=()=>true){
 const follower=targetReference?reference:self,target=targetReference?targetReference(self.currentTime):targetSelf(reference.currentTime);
 const rate=follower.playbackRate??selfRate;
 if(target>=0&&target<follower.duration&&Math.abs(target-follower.currentTime)>rate*.025){
  if(!isCurrent())throw new CanceledStart();
  const leader=targetReference?self:reference,hold=preparable(leader)&&!leader.paused;
  // A seek freezes the follower's decoder. Letting the master continue while
  // waiting for that seek simply creates a new lag equal to its decode time.
  // Hold a native master once during preparation, then resume; no ongoing chase.
  if(hold)leader.pause();
  const pinned=targetReference?targetReference(self.currentTime):targetSelf(reference.currentTime);
  if(!isCurrent())throw new CanceledStart();
  follower.currentTime=pinned;await waitPosition(follower,pinned,isCurrent);
  if(hold){if(!isCurrent())throw new CanceledStart();await waitCurrent(leader.play(),isCurrent);}
 }
}

/** A clip starting after pre-roll has its own cold-start delay, handled once too. */
export async function startDelayedFollower(reference:Media,self:Media,targetSelf:(t:number)=>number,selfRate:number,isCurrent:()=>boolean){
 if(!isCurrent())return false;
 try{await waitCurrent(self.play(),isCurrent);if(!isCurrent())return false;
  if(preparable(reference)&&preparable(self))await settleStartupClocks(reference,self,targetSelf,isCurrent);
  else await correctFollower(reference,self,targetSelf,selfRate,undefined,isCurrent);
  return true;
 }
 catch(error){if(error instanceof CanceledStart)return false;throw error;}
}
