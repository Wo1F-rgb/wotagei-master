export type RecordedVideo={url:string;name:string;key:string;file:File};
export type ShareHost={share?:(data:ShareData)=>Promise<void>;canShare?:(data:ShareData)=>boolean;userActivation?:{isActive:boolean};userAgent?:string;maxTouchPoints?:number};
export type RecordingShareResult='handed-off'|'cancelled'|'needs-tap'|'unsupported'|'failed';

// Share a typed file, not its private blob URL. Photos recognizes the MP4 type;
// MediaRecorder's codec parameters belong to encoding, not the shared MIME type.
export function recordingFile(parts:Blob[],mime:string,date=new Date()){
 const type=(mime||parts.find(p=>p.type)?.type||'video/webm').split(';')[0].trim().toLowerCase();
 const extension=type==='video/mp4'?'mp4':type==='video/quicktime'?'mov':'webm';
 return new File(parts,`wotagei-${date.toISOString().replace(/[:.]/g,'-')}.${extension}`,{type,lastModified:date.getTime()});
}
export function canShareRecording(file:File,host:ShareHost){
 if(!file.size||!host.share||!host.canShare)return false;
 try{return host.canShare({files:[file]});}catch{return false;}
}
export function usesPhotoLibrary(file:File,host:ShareHost){
 return /iPhone|iPad|iPod/.test(host.userAgent||'')||(/Macintosh/.test(host.userAgent||'')&&(host.maxTouchPoints||0)>1)
  ?['video/mp4','video/quicktime'].includes(file.type):false;
}
export async function shareRecording(file:File,host:ShareHost,automatic=false):Promise<RecordingShareResult>{
 if(!canShareRecording(file,host))return 'unsupported';
 if(automatic&&host.userActivation?.isActive===false)return 'needs-tap';
 try{await host.share!({files:[file]});return 'handed-off';}
 catch(error){const name=error instanceof Error?error.name:'';return name==='AbortError'?'cancelled':name==='NotAllowedError'?'needs-tap':name==='TypeError'?'unsupported':'failed';}
}
