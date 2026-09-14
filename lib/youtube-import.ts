import type {YouTubeLink} from './youtube';

export const MAX_YOUTUBE_IMPORT_BYTES=100*1024*1024;
export function importEndpoint(value:unknown){
 if(typeof value!=='string'||!value.trim())return null;
 const url=new URL(value);
 if(url.username||url.password||url.hash||!(url.protocol==='https:'||(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname))))throw new Error('YouTube取得先の設定を確認してください。');
 return url.href;
}
let config:Promise<string|null>|undefined;
export function configuredYouTubeImport(){
 // Empty on GitHub Pages until a separately hosted importer is configured.
 // Only public reference IDs go to that service; camera files stay local.
 return config??=fetch(new URL('runtime-config.json',document.baseURI),{credentials:'same-origin',cache:'no-cache'}).then(async response=>{
  if(response.status===404)return null;
  if(!response.ok)throw new Error('YouTube取得先の設定を読み込めませんでした。');
  const data:unknown=await response.json();
  if(!data||typeof data!=='object')throw new Error('YouTube取得先の設定を確認してください。');
  return importEndpoint('youtubeImportUrl' in data?data.youtubeImportUrl:undefined);
 }).catch(error=>{config=undefined;throw error;});
}
export async function fetchYouTubeFile(link:YouTubeLink,endpoint:string,signal:AbortSignal,fetcher:typeof fetch=fetch):Promise<File>{
 const target=importEndpoint(endpoint);if(!target||!/^[-\w]{11}$/.test(link.id))throw new Error('YouTubeの取得設定を確認してください。');
 const response=await fetcher(target,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:link.id}),credentials:'omit',referrerPolicy:'no-referrer',signal});
 if(!response.ok){await response.body?.cancel();throw new Error(response.status===429?'YouTubeの取得が混み合っています。少し待ってから試してください。':'YouTubeの音声付き動画を取得できませんでした。別の動画か動画ファイルを選んでください。');}
 if(!response.body||!response.headers.get('content-type')?.toLowerCase().startsWith('video/mp4')){await response.body?.cancel();throw new Error('YouTubeの取得先がMP4動画を返しませんでした。');}
 const tooLarge=()=>new Error('YouTubeの取り込みは100MBまでです。');
 if(Number(response.headers.get('content-length'))>MAX_YOUTUBE_IMPORT_BYTES){await response.body.cancel();throw tooLarge();}
 const reader=response.body.getReader(),parts:ArrayBuffer[]=[];let size=0;
 try{while(true){signal.throwIfAborted();const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_YOUTUBE_IMPORT_BYTES)throw tooLarge();parts.push(Uint8Array.from(value).buffer);}}
 catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
 signal.throwIfAborted();if(size<32)throw new Error('YouTubeの動画データが空です。');
 const file=new File(parts,`YouTube-${link.id}.mp4`,{type:'video/mp4',lastModified:0});
 if(await file.slice(4,8).text()!=='ftyp')throw new Error('YouTubeの動画データを読み取れませんでした。');
 return file;
}
