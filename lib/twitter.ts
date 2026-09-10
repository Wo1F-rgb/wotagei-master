export type TwitterLink={id:string;url:string;video:number|null};
export type TwitterSource=TwitterLink&{videos:number[]};
export type TwitterVideo={link:TwitterSource;title:string;mediaUrl:string};
export const MAX_TWITTER_BYTES=100*1024*1024;
const hosts=['x.com','www.x.com','mobile.x.com','twitter.com','www.twitter.com','mobile.twitter.com'];
export function isTwitterUrl(value:string){try{return hosts.includes(new URL(value.trim()).hostname);}catch{return false;}}
export function parseTwitterLink(value:string):TwitterLink{
 let url:URL;try{url=new URL(value.trim());}catch{throw new Error('Xの投稿URLを https:// から貼ってください。');}
 const match=url.pathname.match(/^\/(?:[A-Za-z0-9_]{1,15}|i\/web)\/status\/(\d{2,20})(?:\/video\/([1-4]))?\/?$/);
 if(url.protocol!=='https:'||!hosts.includes(url.hostname)||url.username||url.password||url.port||!match)throw new Error('動画のあるXの投稿URLを貼ってください（プロフィール・ライブ配信は未対応）。');
 const id=match[1],video=match[2]?Number(match[2]):null;
 return {id,video,url:`https://x.com/i/status/${id}${video?`/video/${video}`:''}`};
}
type Item={type?:string;url?:string;formats?:{url?:string;container?:string;codec?:string;bitrate?:number}[]};
type Payload={code?:number;status?:{id?:string;type?:string;author?:{screen_name?:string;protected?:boolean};media?:{all?:Item[];videos?:Item[]}}};
function mp4Url(value:unknown):string|null{
 if(typeof value!=='string')return null;
 try{const url=new URL(value);return url.protocol==='https:'&&url.hostname==='video.twimg.com'&&!url.port&&!url.username&&!url.password&&url.pathname.endsWith('.mp4')?url.href:null;}catch{return null;}
}
/** Only use media belonging to this public post, never quoted or unrelated content. */
export function twitterVideoFromResponse(link:TwitterLink,data:unknown):TwitterVideo{
 const result=data as Payload|null,post=result?.status;
 if(result?.code===429)throw new Error('Xの読込が混み合っています。少し待ってから試してください。');
 if(result?.code!==200||!post||post.type!=='status'||post.author?.protected||post.id!==link.id)throw new Error('このX投稿を取得できません。非公開・削除済みの投稿は読み込めません。');
 const all=Array.isArray(post.media?.all)?post.media.all:Array.isArray(post.media?.videos)?post.media.videos:[];
 const index=link.video===null?all.findIndex(v=>v?.type==='video'||v?.type==='gif'):link.video-1;
 const item=all[index];if(!item||!['video','gif'].includes(item.type||''))throw new Error('この投稿・指定位置に動画が見つかりません。動画のある投稿URLを選んでください。');
 const formats=(Array.isArray(item.formats)?item.formats:[]).filter(v=>v&&mp4Url(v.url)&&(!v.codec||v.codec==='h264')&&Number.isFinite(v.bitrate)&&v.bitrate!>0).sort((a,b)=>a.bitrate!-b.bitrate!);
 // A moderate H.264 rendition avoids downloading a 4K clip on an iPhone.
 const selected=formats.filter(v=>v.bitrate!<=3_000_000).at(-1)||formats[0];
 const mediaUrl=mp4Url(selected?.url)||mp4Url(item.url);
 if(!mediaUrl)throw new Error('このX動画のMP4を取得できません。動画ファイルを選んでください。');
 const video=index+1;
 const videos=all.flatMap((entry,i)=>entry&&['video','gif'].includes(entry.type||'')?[i+1]:[]);
 const title=`X · @${String(post.author?.screen_name||'投稿者').slice(0,40)}${videos.length>1?` · 動画${videos.indexOf(video)+1}/${videos.length}`:''}`;
 return {link:{id:link.id,video,url:`https://x.com/i/status/${link.id}/video/${video}`,videos},title,mediaUrl};
}
/** Use attachment indices rather than video ordinals, so photos between clips are skipped. */
export function adjacentTwitterVideo(source:TwitterSource,direction:-1|1):TwitterLink|null{
 const current=source.videos.indexOf(source.video??-1),video=source.videos[current+direction];
 if(current<0||video===undefined)return null;
 return {id:source.id,video,url:`https://x.com/i/status/${source.id}/video/${video}`};
}
export async function readTwitterVideo(response:Response,limit=MAX_TWITTER_BYTES):Promise<Blob>{
 if(!response.ok||!response.body)throw new Error('Xの動画を取得できません。投稿URLからもう一度読み込んでください。');
 const tooLarge=()=>new Error('X動画は100MBまで読み込めます。大きい動画はファイルから選んでください。');
 if(Number(response.headers.get('content-length'))>limit){await response.body.cancel();throw tooLarge();}
 const reader=response.body.getReader(),parts:ArrayBuffer[]=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit)throw tooLarge();parts.push(Uint8Array.from(value).buffer);}}
 catch(e){await reader.cancel().catch(()=>{});throw e;}finally{reader.releaseLock();}
 if(!size)throw new Error('Xの動画が空です。別の投稿を選んでください。');
 return new Blob(parts,{type:'video/mp4'});
}
export async function fetchTwitterVideo(link:TwitterLink,signal:AbortSignal,fetcher:typeof fetch=fetch){
 const options={signal,credentials:'omit' as const,referrerPolicy:'no-referrer' as const};
 const response=await fetcher(`https://api.fxtwitter.com/2/status/${link.id}`,options);
 if(!response.ok&&response.status!==404&&response.status!==429)throw new Error('Xの取得サービスに接続できません。少し待ってから試してください。');
 const video=twitterVideoFromResponse(link,await response.json());
 const blob=await readTwitterVideo(await fetcher(video.mediaUrl,options));
 signal.throwIfAborted();
 return {...video,file:new File([blob],`X-${link.id}-${video.link.video}.mp4`,{type:'video/mp4',lastModified:0})};
}
