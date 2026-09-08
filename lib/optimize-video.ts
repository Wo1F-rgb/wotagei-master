export async function optimizeVideo(file:File,signal:AbortSignal,onProgress:(n:number)=>void):Promise<Blob>{
 if(typeof VideoEncoder==='undefined'||typeof VideoDecoder==='undefined')throw new Error('このブラウザは動画の軽量化に未対応です。新しいSafariかChromeで試してください。');
 const {Input,BlobSource,ALL_FORMATS,Output,BufferTarget,Mp4OutputFormat,Conversion,Quality}=await import('mediabunny');
 signal.throwIfAborted();const input=new Input({source:new BlobSource(file),formats:ALL_FORMATS});
 let conversion:Awaited<ReturnType<typeof Conversion.init>>|undefined;
 const cancel=()=>{void conversion?.cancel();};signal.addEventListener('abort',cancel,{once:true});
 try{
  const track=await input.getPrimaryVideoTrack();if(!track)throw new Error('動画の映像トラックがありません。');
  const originalAudio=await input.getPrimaryAudioTrack();
  const duration=await input.computeDuration();if(duration>600)throw new Error('10分以内の練習動画に切り出してから軽量化してください。');
  const ratio=Math.min(1,720/Math.max(track.displayWidth,track.displayHeight));
  const output=new Output({format:new Mp4OutputFormat(),target:new BufferTarget()});
  conversion=await Conversion.init({input,output,trim:{start:0},video:{width:Math.max(2,Math.floor(track.displayWidth*ratio/2)*2),height:Math.max(2,Math.floor(track.displayHeight*ratio/2)*2),fit:'contain',frameRate:30,codec:'avc',quality:new Quality('medium'),keyFrameInterval:.5,forceTranscode:true,hardwareAcceleration:'prefer-hardware'},audio:{codec:'aac'}});
  if(!conversion.isValid)throw new Error('この動画の形式を軽量化できません。MP4（H.264）の動画を使ってください。');
  if(originalAudio&&conversion.discardedTracks.some(item=>item.track===originalAudio))throw new Error('音声を保持して軽量化できませんでした。元の動画を使います。');
  signal.throwIfAborted();conversion.onProgress=n=>{if(!signal.aborted)onProgress(n);};await conversion.execute();signal.throwIfAborted();
  if(!output.target.buffer)throw new Error('軽量動画を作成できませんでした。');
  const blob=new Blob([output.target.buffer],{type:'video/mp4'}),check=new Input({source:new BlobSource(blob),formats:ALL_FORMATS});
  try{const resultVideo=await check.getPrimaryVideoTrack(),resultAudio=await check.getPrimaryAudioTrack();if(!resultVideo||Math.abs(await resultVideo.getFirstTimestamp()-Math.max(0,await track.getFirstTimestamp()))>.04||(originalAudio&&(!resultAudio||Math.abs(await resultAudio.getFirstTimestamp()-Math.max(0,await originalAudio.getFirstTimestamp()))>.05)))throw new Error('軽量化で映像・音声の開始位置が変わったため、元の動画を使います。');if(Math.abs(await check.computeDuration()-duration)>.15)throw new Error('軽量化で動画の長さが変わったため適用しませんでした。元の動画を使います。');}finally{check.dispose();}
  return blob;
 }finally{signal.removeEventListener('abort',cancel);if(conversion&&conversion.state!=='done')await conversion.cancel();input.dispose();}
}
