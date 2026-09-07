export type OnlineSong={id:string;title:string;artist:string;album:string;bpm:number|null;url:string;provider:'Deezer'|'GetSongBPM'};
export type MusicSearch={songs:OnlineSong[];query:string;apple?:{title:string;artist:string;url:string};message?:string};
type Fetcher=typeof fetch;
type ApiTrack={id:number|string;title?:string;artist?:{name?:string};album?:{title?:string};tempo?:unknown;bpm?:unknown};
type ApiResponse={error?:unknown;results?:{kind?:string;trackName?:string;artistName?:string}[];search?:ApiTrack[];data?:ApiTrack[];bpm?:unknown};
async function json(url:string,fetcher:Fetcher,headers?:HeadersInit){const r=await fetcher(url,{headers,signal:AbortSignal.timeout(12000)});if(!r.ok)throw new Error('曲データベースに接続できませんでした。少し待ってから検索してください。');return await r.json() as ApiResponse;}
export function appleSongId(value:string){
 if(!/^https?:/i.test(value))return null;
 let u:URL;try{u=new URL(value);}catch{throw new Error('共有リンクを確認してください。');}
 if(u.protocol!=='https:'||u.hostname!=='music.apple.com')throw new Error('Apple Musicの曲の共有リンク、または曲名を入力してください。');
 const id=u.searchParams.get('i')||(/\/song\//.test(u.pathname)?u.pathname.split('/').pop():null);
 if(!id||!/^\d{1,20}$/.test(id))throw new Error('アルバムではなく曲の「共有」でコピーしたリンクを使ってください。');return {id,country:u.pathname.split('/')[1]?.match(/^[a-z]{2}$/)?.[0]||'jp'};
}
export async function searchMusic(value:string,fetcher:Fetcher=fetch,key?:string):Promise<MusicSearch>{
 let query=value.trim();if(query.length<2||query.length>500)throw new Error('曲名を2〜500文字で入力してください。');
 let apple:MusicSearch['apple'];const appleId=appleSongId(query);
 if(appleId){const data=await json(`https://itunes.apple.com/lookup?id=${appleId.id}&entity=song&country=${appleId.country}`,fetcher);const t=data.results?.find((x:{kind?:string})=>x.kind==='song');if(!t||typeof t.trackName!=='string'||typeof t.artistName!=='string')throw new Error('Apple Musicの曲名を取得できませんでした。曲名とアーティスト名で検索してください。');apple={title:String(t.trackName),artist:String(t.artistName),url:value};query=`${apple.title} ${apple.artist}`;}
 if(key){const lookup=apple?`song:${apple.title} artist:${apple.artist}`:query;const data=await json(`https://api.getsong.co/search/?type=${apple?'both':'song'}&lookup=${encodeURIComponent(lookup)}&limit=8`,fetcher,{'X-API-KEY':key});if(data.error)throw new Error('BPMデータベースから結果を取得できませんでした。');const songs=(Array.isArray(data.search)?data.search:[]).map((t:ApiTrack):OnlineSong=>({id:String(t.id),title:String(t.title||''),artist:String(t.artist?.name||''),album:'',bpm:validBpm(t.tempo),url:`https://getsongbpm.com/song/${encodeURIComponent(String(t.title||'song'))}/${encodeURIComponent(String(t.id))}`,provider:'GetSongBPM'}));return {songs,query,apple};}
 const data=await json(`https://api.deezer.com/search?q=${encodeURIComponent(apple?apple.title:query)}&limit=8`,fetcher);
 if(data.error)throw new Error('曲データベースが検索に応答しませんでした。');
 const tracks=Array.isArray(data.data)?data.data:[];
 const songs=await Promise.all(tracks.filter((t:{id?:unknown})=>Number.isSafeInteger(t.id)&&Number(t.id)>0).map(async (t:ApiTrack):Promise<OnlineSong>=>{let bpm:number|null=null;try{const detail=await json(`https://api.deezer.com/track/${t.id}`,fetcher);bpm=validBpm(detail.bpm);}catch{}return {id:String(t.id),title:String(t.title||''),artist:String(t.artist?.name||''),album:String(t.album?.title||''),bpm,url:`https://www.deezer.com/track/${t.id}`,provider:'Deezer'};}));
 return {songs,query,apple,message:songs.some(s=>s.bpm!==null)?undefined:'この検索結果にはBPMの登録がありません。原曲・アーティスト名を変えて検索するか、XML・手入力を使ってください。'};
}
export function validBpm(value:unknown){const n=Number(value);return Number.isFinite(n)&&n>=40&&n<=300?Math.round(n*10)/10:null;}
