/** Keep the speaker route alive after recording: an element can only have one audio source. */
export class PracticeRecordingAudio {
 private sources=new Map<HTMLMediaElement,MediaElementAudioSourceNode>();
 capture(camera:MediaStream,music:HTMLMediaElement|null,context?:AudioContext){
  const video=camera.getVideoTracks().find(track=>track.readyState==='live');
  if(!video)throw new Error('カメラを起動してから録画してください。');
  const tracks:MediaStreamTrack[]=[video.clone()];
  let source:MediaElementAudioSourceNode|undefined,destination:MediaStreamAudioDestinationNode|undefined;
  let released=false;
  const release=()=>{
   if(released)return;released=true;
   if(source&&destination){try{source.disconnect(destination);}catch{}}
   tracks.forEach(track=>track.stop());
  };
  try{
   if(music&&context){
    source=this.sources.get(music);
    if(!source){source=context.createMediaElementSource(music);source.connect(context.destination);this.sources.set(music,source);}
    destination=context.createMediaStreamDestination();
    tracks.push(...destination.stream.getAudioTracks());source.connect(destination);
   }
   return {stream:new MediaStream(tracks),hasMusic:!!destination,release};
  }catch(error){release();throw error;}
 }
 dispose(){for(const source of this.sources.values())source.disconnect();this.sources.clear();}
}

export function recordingMime(supported:(mime:string)=>boolean){
 return ['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4','video/webm;codecs=vp8,opus','video/webm'].find(supported);
}
