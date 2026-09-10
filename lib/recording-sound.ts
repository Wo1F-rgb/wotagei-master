export type RecordingSound='music'|'microphone'|'tab'|'none';
export const recordingSoundLabel:Record<RecordingSound,string>={music:'曲入り',microphone:'マイク',tab:'タブの音',none:'映像のみ'};
type CaptureEnvironment={mediaDevices:Pick<MediaDevices,'getUserMedia'|'getDisplayMedia'>;audioSession?:{type:string}};
const stopped=(stream:MediaStream)=>stream.getTracks().forEach(track=>track.stop());
const aborted=()=>new DOMException('録音の準備を中止しました。','AbortError');

/** Cancel the app promptly, and dispose of permission grants that arrive after cancellation. */
function captureRequest(request:Promise<MediaStream>,signal:AbortSignal):Promise<MediaStream>{
 return new Promise((resolve,reject)=>{
  const cancel=()=>reject(aborted());
  signal.addEventListener('abort',cancel,{once:true});
  request.then(stream=>{signal.removeEventListener('abort',cancel);if(signal.aborted){stopped(stream);reject(aborted());}else resolve(stream);},error=>{signal.removeEventListener('abort',cancel);reject(error);});
  if(signal.aborted)cancel();
 });
}

/** Each source is requested from an explicit button. Microphone audio is never played back. */
export async function requestRecordingSound(kind:'microphone'|'tab',signal:AbortSignal,env:CaptureEnvironment=navigator){
 if(signal.aborted)throw aborted();
 let stream:MediaStream|null=null,released=false,previousSession:string|undefined;
 const release=()=>{
  if(released)return;released=true;
  if(stream)stopped(stream);
  try{if(previousSession!==undefined&&env.audioSession?.type==='play-and-record')env.audioSession.type=previousSession;}catch{}
  signal.removeEventListener('abort',release);
 };
 signal.addEventListener('abort',release,{once:true});
 try{
  if(kind==='microphone'){
   if(!env.mediaDevices?.getUserMedia)throw new Error('このブラウザではマイクを利用できません。');
   try{if(env.audioSession){previousSession=env.audioSession.type;env.audioSession.type='play-and-record';}}catch{}
   // Speech processing would otherwise try to remove the music coming from the speaker.
   stream=await captureRequest(env.mediaDevices.getUserMedia({video:false,audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}}),signal);
  }else{
   if(!env.mediaDevices?.getDisplayMedia)throw new Error('タブの音の録音はPCのChrome・Edgeで利用してください。iPhoneではマイク録音を選べます。');
   const options={video:{displaySurface:'browser'},audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false,suppressLocalAudioPlayback:false,restrictOwnAudio:false},preferCurrentTab:true,selfBrowserSurface:'include',systemAudio:'exclude',monitorTypeSurfaces:'exclude',surfaceSwitching:'exclude'};
   stream=await captureRequest(env.mediaDevices.getDisplayMedia(options),signal);
   if(stream.getVideoTracks()[0]?.getSettings().displaySurface!=='browser')throw new Error('画面やウィンドウではなく、このヲタ芸マスターの「タブ」を選んでください。');
  }
  if(signal.aborted){stopped(stream);throw aborted();}
  if(!stream.getAudioTracks().some(track=>track.readyState==='live'))throw new Error(kind==='tab'?'音声が共有されていません。このタブを選び「タブの音声も共有」をオンにしてください。':'マイクの音声を取得できませんでした。');
  return {stream,release};
 }catch(error){release();throw error;}
}

export function recordingSoundError(error:unknown,kind:RecordingSound){
 if(error instanceof DOMException&&error.name==='NotAllowedError')return kind==='microphone'?'マイクが許可されていません。ブラウザのマイク設定を確認して、もう一度押してください。':'共有を中止したか、許可されませんでした。音は録音していません。';
 return error instanceof Error?error.message:'録画の音を準備できませんでした。';
}
