export type BeatFrameCaptureOptions={signal:AbortSignal;mirror?:boolean;maxDimension?:number};
export const beatFrameAborted=()=>new DOMException('画像の作成を中止しました。','AbortError');
export function checkBeatFrameAbort(signal?:AbortSignal){if(signal?.aborted)throw beatFrameAborted();}

/** A dedicated, paused decoder; never reads or changes the user's player. */
export async function createBeatFrameCapture(source:string|Blob,options:BeatFrameCaptureOptions){
 const {signal,mirror=false}=options;
 checkBeatFrameAbort(signal);
 const maxDimension=Math.min(1280,options.maxDimension??1280);
 if(!Number.isFinite(maxDimension)||maxDimension<1)throw new RangeError('画像サイズが正しくありません。');
 const video=document.createElement('video'),canvas=document.createElement('canvas');
 video.muted=true;video.playsInline=true;video.preload='auto';video.crossOrigin='anonymous';
 video.setAttribute('aria-hidden','true');
 video.style.cssText='position:fixed;left:-20px;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
 document.body.appendChild(video);
 let disposed=false,busy=false;
 const ownedUrl=typeof source==='string'?null:URL.createObjectURL(source);
 const lifetime=new AbortController();
 const dispose=()=>{
  if(disposed)return;disposed=true;lifetime.abort();signal.removeEventListener('abort',dispose);
  video.pause();video.removeAttribute('src');video.load();video.remove();canvas.width=0;canvas.height=0;
  if(ownedUrl)URL.revokeObjectURL(ownedUrl);
 };
 signal.addEventListener('abort',dispose,{once:true});
 const check=(requestSignal?:AbortSignal)=>{checkBeatFrameAbort(signal);checkBeatFrameAbort(requestSignal);if(disposed)throw beatFrameAborted();};
 const wait=(action:()=>void,needsSeek:boolean,requestSignal?:AbortSignal)=>new Promise<void>((resolve,reject)=>{
  let seeked=!needsSeek;
  const events=['loadedmetadata','loadeddata','canplay','seeked'];
  const cleanup=()=>{clearTimeout(timer);events.forEach(name=>video.removeEventListener(name,update));video.removeEventListener('error',fail);lifetime.signal.removeEventListener('abort',cancel);requestSignal?.removeEventListener('abort',cancel);};
  const cancel=()=>{cleanup();reject(beatFrameAborted());};
  const fail=()=>{cleanup();reject(new Error('動画の画像を読み取れません。動画ファイル、または画像の読み取りを許可した動画URLを使用してください。'));};
  const update=(event?:Event)=>{
   if(event?.type==='seeked')seeked=true;
   if(seeked&&!video.seeking&&video.readyState>=2&&video.videoWidth>0){cleanup();resolve();}
  };
  const timer=setTimeout(fail,20000);
  events.forEach(name=>video.addEventListener(name,update));video.addEventListener('error',fail);
  lifetime.signal.addEventListener('abort',cancel,{once:true});requestSignal?.addEventListener('abort',cancel,{once:true});
  try{check(requestSignal);action();update();}catch(error){cleanup();reject(error);}
 });
 try{
  await wait(()=>{video.src=ownedUrl??source as string;video.load();},false);
  check();
  const duration=video.duration,width=video.videoWidth,height=video.videoHeight;
  if(!Number.isFinite(duration)||duration<=0)throw new Error('長さが確定した動画を使用してください。');
  const ratio=Math.min(1,maxDimension/Math.max(width,height));
  canvas.width=Math.max(1,Math.round(width*ratio));canvas.height=Math.max(1,Math.round(height*ratio));
  const context=canvas.getContext('2d');if(!context)throw new Error('画像を作成できません。');
  return {duration,width:canvas.width,height:canvas.height,dispose,async capture(time:number,requestSignal?:AbortSignal):Promise<Blob>{
   check(requestSignal);
   if(!Number.isFinite(time)||time<0||time>=duration)throw new RangeError('画像の時刻が動画の範囲外です。');
   if(busy)throw new Error('画像を作成中です。');
   busy=true;
   try{
    // Setting currentTime alone is insufficient. The seeked event is queued only
    // after the new playback position has decoded data (HTML seeking algorithm).
    // An already-decoded identical time needs no new seek or frame callback.
    if(video.seeking||video.currentTime!==time)await wait(()=>{video.currentTime=time;},true,requestSignal);
    else if(video.readyState<2)await wait(()=>{},false,requestSignal);
    check(requestSignal);
    context.setTransform(mirror?-1:1,0,0,1,mirror?canvas.width:0,0);
    context.drawImage(video,0,0,canvas.width,canvas.height);
    const blob=await new Promise<Blob>((resolve,reject)=>{
     const cancel=()=>{cleanup();reject(beatFrameAborted());};
     const cleanup=()=>{clearTimeout(timer);lifetime.signal.removeEventListener('abort',cancel);requestSignal?.removeEventListener('abort',cancel);};
     const timer=setTimeout(()=>{cleanup();reject(new Error('JPEGの作成がタイムアウトしました。'));},20000);
     lifetime.signal.addEventListener('abort',cancel,{once:true});requestSignal?.addEventListener('abort',cancel,{once:true});
     try{canvas.toBlob(value=>{cleanup();if(value?.size&&value.type==='image/jpeg')resolve(value);else reject(new Error('JPEG画像を作成できません。'));},'image/jpeg',.88);}catch(error){cleanup();reject(error);}
    });
    check(requestSignal);return blob;
   }catch(error){
    if(error instanceof DOMException&&error.name==='SecurityError')throw new Error('この動画URLは画像の保存を許可していません。動画ファイルを選択してください。');
    throw error;
   }finally{busy=false;}
  }};
 }catch(error){dispose();throw error;}
}

export type BeatFrameCapture=Awaited<ReturnType<typeof createBeatFrameCapture>>;
