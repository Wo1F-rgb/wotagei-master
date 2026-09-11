import {containRect} from './background.ts';

export type CameraFormat='landscape'|'portrait';
export type CameraFacing='user'|'environment';
export const cameraFacingLabel={user:'インカメ',environment:'外カメ'};
export const cameraFormatLabel={landscape:'横 16:9',portrait:'縦 9:16'};
export function cameraFrame(format:CameraFormat){return format==='portrait'?{width:720,height:1280}:{width:1280,height:720};}
export function cameraConstraints(format:CameraFormat,facing:CameraFacing='user',exact=false):MediaStreamConstraints{
 const {width,height}=cameraFrame(format);
 // Ideal constraints let Safari choose a working camera even if its current orientation differs.
 // A rear-camera request must not silently reopen the front camera on unsupported devices.
 return {video:{facingMode:exact||facing==='environment'?{exact:facing}:facing,width:{ideal:width},height:{ideal:height},aspectRatio:{ideal:width/height},frameRate:{ideal:30,max:30}},audio:false};
}

/** Normalize only while recording. Preview stays on the original low-latency camera stream. */
export function captureCameraFrame(video:HTMLVideoElement,format:CameraFormat){
 if(!video.videoWidth||!video.videoHeight||video.readyState<2)throw new Error('カメラの映像が表示されてから録画してください。');
 const canvas=document.createElement('canvas'),size=cameraFrame(format);
 canvas.width=size.width;canvas.height=size.height;
 const ctx=canvas.getContext('2d',{alpha:false});
 if(!ctx||typeof canvas.captureStream!=='function')throw new Error('このブラウザでは横・縦を固定して録画できません。Safariを更新して再度お試しください。');
 let stopped=false,raf:number|null=null,output:MediaStream|undefined,lastDraw=-Infinity;
 let captureTrack:CanvasCaptureMediaStreamTrack|undefined;
 const draw=()=>{
  if(video.readyState<2||!video.videoWidth||!video.videoHeight)return;
  // Read current dimensions on every frame: iOS may swap them after a device rotation.
  // Contain, never rotate/stretch/crop the dancer. The recording dimensions stay fixed.
  const rect=containRect(video.videoWidth,video.videoHeight,canvas.width,canvas.height);
  ctx.fillStyle='#000';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(video,rect.x,rect.y,rect.width,rect.height);
  captureTrack?.requestFrame?.();
 };
 const release=()=>{
  if(stopped)return;stopped=true;
  if(raf!==null)cancelAnimationFrame(raf);
  output?.getTracks().forEach(track=>track.stop());
 };
 try{
  draw();output=canvas.captureStream(30);
  if(!output.getVideoTracks().some(track=>track.readyState==='live'))throw new Error('録画する映像を準備できませんでした。');
  captureTrack=output.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
  captureTrack.contentHint='motion';
  // Sample independently of the preview's presentation/occlusion and UI redraws.
  const onAnimation=(now:number)=>{if(stopped)return;if(now-lastDraw>=1000/30-1){draw();lastDraw=now;}raf=requestAnimationFrame(onAnimation);};
  raf=requestAnimationFrame(onAnimation);
  return {stream:output,release};
 }catch(error){release();throw error;}
}
