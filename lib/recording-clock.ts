/** Let the newly connected WebAudio and camera streams establish their clocks before muxing. */
export function prepareRecordingClock(context:AudioContext,signal:AbortSignal){
 return new Promise<void>((resolve,reject)=>{
  let done=false,tick:ReturnType<typeof setTimeout>|undefined,start:number|undefined;
  const finish=(error?:unknown)=>{if(done)return;done=true;clearTimeout(tick);clearTimeout(deadline);signal.removeEventListener('abort',abort);if(error)reject(error);else resolve();};
  const abort=()=>finish(signal.reason||new DOMException('録画を中止しました。','AbortError'));
  const deadline=setTimeout(()=>finish(new Error('録音する音の準備ができませんでした。もう一度録画してください。')),4000);
  const check=()=>{
   if(done)return;
   if(context.state==='running'){
    start??=context.currentTime;
    if(context.currentTime-start>=1){finish();return;}
   }
   tick=setTimeout(check,16);
  };
  signal.addEventListener('abort',abort,{once:true});
  if(signal.aborted){abort();return;}
  try{void context.resume().then(check,finish);}catch(error){finish(error);}
 });
}
