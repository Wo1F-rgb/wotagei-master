import {searchMusic} from './music-search';
let sequence=0;
/** Only the public catalog's documented data endpoints may supply JSONP. */
export function catalogJsonpUrl(input:string,callback:string){
 const url=new URL(input);
 if(url.origin!=='https://api.deezer.com'||!(url.pathname==='/search'||/^\/track\/\d+$/.test(url.pathname))||!/^wt_catalog_\d+_\d+$/.test(callback))throw new Error('対応していない曲データの取得先です。');
 url.searchParams.set('output','jsonp');url.searchParams.set('callback',callback);return url.href;
}
function catalogRequest(input:string,signal:AbortSignal):Promise<Response>{
 const u=new URL(input);
 if(u.origin==='https://itunes.apple.com'&&u.pathname==='/lookup')return fetch(u,{signal,credentials:'omit'});
 return new Promise((resolve,reject)=>{
  const callback=`wt_catalog_${Date.now()}_${++sequence}`,src=catalogJsonpUrl(input,callback),script=document.createElement('script');
  const globals=window as unknown as Record<string,unknown>;
  const cleanup=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);script.remove();delete globals[callback];};
  const abort=()=>{cleanup();reject(new DOMException('中止しました','AbortError'));};
  const timer=setTimeout(()=>{cleanup();reject(new Error('曲検索に時間がかかっています。音源解析・曲ライブラリも利用できます。'));},12000);
  globals[callback]=(data:unknown)=>{cleanup();resolve(new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}}));};
  script.src=src;script.async=true;script.referrerPolicy='no-referrer';script.onerror=()=>{cleanup();reject(new Error('曲データベースに接続できませんでした。'));};
  if(signal.aborted){abort();return;}signal.addEventListener('abort',abort,{once:true});document.head.appendChild(script);
 });
}
export function searchMusicInBrowser(query:string,signal:AbortSignal){
 const fetcher:typeof fetch=(input,init)=>catalogRequest(String(input),init?.signal?AbortSignal.any([signal,init.signal]):signal);
 return searchMusic(query,fetcher);
}
