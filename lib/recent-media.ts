export type RecentMedia={id:string;kind:'file'|'youtube'|'link';name:string;url?:string;size:number;type?:string;lastModified?:number;usedAt:number};
const DB_NAME='wotagei-recent-v1';
export const HISTORY_LIMITS={files:10,bytes:1024*1024*1024,oneFile:500*1024*1024,links:30};
export const fileKey=(file:Pick<File,'name'|'size'|'lastModified'>)=>`${file.name}|${file.size}|${file.lastModified}`;
export function historyEnabled(){try{return localStorage.getItem('wotagei:remember')!=='off';}catch{return true;}}
export function setHistoryEnabled(value:boolean){localStorage.setItem('wotagei:remember',value?'on':'off');}
export function historyError(error:unknown){return error instanceof DOMException&&error.name==='QuotaExceededError'?'端末の空き容量が足りず履歴に保存できません。履歴から不要な動画を削除してください。':error instanceof Error?error.message:'履歴を保存できません。このブラウザの保存設定を確認してください。';}
function openDatabase(factory:IDBFactory,name:string):Promise<IDBDatabase>{
 return new Promise((resolve,reject)=>{const request=factory.open(name,1);let settled=false;const timer=setTimeout(()=>{settled=true;reject(new Error('履歴を開けません。ほかのタブを閉じて再試行してください。'));},5000);
  request.onupgradeneeded=()=>{const db=request.result;db.createObjectStore('items',{keyPath:'id'});db.createObjectStore('files');};
  request.onsuccess=()=>{clearTimeout(timer);if(settled){request.result.close();return;}settled=true;request.result.onversionchange=()=>request.result.close();resolve(request.result);};
  request.onerror=()=>{clearTimeout(timer);settled=true;reject(request.error||new Error('履歴を開けません。'));};
 });
}
/** Separate metadata from blobs so opening the history never loads all videos into memory. */
export function recentStore(factory:IDBFactory,name=DB_NAME){
 async function transaction<T>(mode:IDBTransactionMode,run:(tx:IDBTransaction,set:(value:T)=>void,fail:(e:Error)=>void)=>void):Promise<T>{
  const db=await openDatabase(factory,name);
  return new Promise((resolve,reject)=>{const tx=db.transaction(['items','files'],mode);let value:T,error:Error|null=null;
   tx.oncomplete=()=>{db.close();resolve(value);};tx.onabort=()=>{db.close();reject(error||tx.error||new Error('履歴への保存を完了できませんでした。'));};tx.onerror=()=>{};
   try{run(tx,v=>{value=v;},e=>{error=e;tx.abort();});}catch(e){error=e instanceof Error?e:new Error('履歴を更新できませんでした。');tx.abort();}
  });
 }
 return {
  list:()=>transaction<RecentMedia[]>('readonly',(tx,set)=>{const r=tx.objectStore('items').getAll();r.onsuccess=()=>set((r.result as RecentMedia[]).sort((a,b)=>b.usedAt-a.usedAt));}),
  saveFile:(file:File)=>transaction<void>('readwrite',(tx,set,fail)=>{
   const id='file:'+fileKey(file),items=tx.objectStore('items'),r=items.getAll();
   r.onsuccess=()=>{const others=(r.result as RecentMedia[]).filter(x=>x.kind==='file'&&x.id!==id);
    if(file.size>HISTORY_LIMITS.oneFile){fail(new Error('500MBを超える動画は履歴に保存できません。今回の再生には使えます。'));return;}
    if(others.length>=HISTORY_LIMITS.files||others.reduce((n,x)=>n+x.size,0)+file.size>HISTORY_LIMITS.bytes){fail(new Error('動画履歴は10本・合計1GBまでです。履歴から不要な動画を削除してください。'));return;}
    const existing=(r.result as RecentMedia[]).some(x=>x.id===id);
    if(!existing)tx.objectStore('files').put(file,id);
    items.put({id,kind:'file',name:file.name,size:file.size,type:file.type,lastModified:file.lastModified,usedAt:Date.now()} satisfies RecentMedia);set();
   };
  }),
  saveLink:(url:string,kind:'youtube'|'link',title?:string)=>transaction<void>('readwrite',(tx,set,fail)=>{
   let parsed:URL;try{parsed=new URL(url);}catch{fail(new Error('動画のURLを確認してください。'));return;}
   if(parsed.protocol!=='https:'||!['youtube.com','www.youtube.com','youtu.be','x.com','www.x.com','twitter.com','www.twitter.com'].includes(parsed.hostname)){fail(new Error('対応していない動画URLです。'));return;}
   const items=tx.objectStore('items'),id=kind+':'+url,r=items.getAll();
   r.onsuccess=()=>{const others=(r.result as RecentMedia[]).filter(x=>x.kind!=='file'&&x.id!==id).sort((a,b)=>b.usedAt-a.usedAt);for(const item of others.slice(HISTORY_LIMITS.links-1))items.delete(item.id);
    items.put({id,kind,name:title||url,url,size:0,usedAt:Date.now()} satisfies RecentMedia);set();};
  }),
  getFile:(id:string)=>transaction<File>('readonly',(tx,set,fail)=>{const meta=tx.objectStore('items').get(id);meta.onsuccess=()=>{const item=meta.result as RecentMedia|undefined;if(!item||item.kind!=='file'){fail(new Error('動画の履歴が見つかりません。もう一度動画を選んでください。'));return;}const r=tx.objectStore('files').get(id);r.onsuccess=()=>{const blob=r.result as Blob|undefined;if(!blob){fail(new Error('ブラウザから動画が削除されています。もう一度動画を選んでください。'));return;}set(new File([blob],item.name,{type:item.type||blob.type,lastModified:item.lastModified||0}));};};}),
  remove:(id:string)=>transaction<void>('readwrite',(tx,set)=>{tx.objectStore('items').delete(id);tx.objectStore('files').delete(id);set();}),
  clear:()=>transaction<void>('readwrite',(tx,set)=>{tx.objectStore('items').clear();tx.objectStore('files').clear();set();}),
 };
}
function browserStore(){if(typeof indexedDB==='undefined')throw new Error('このブラウザでは動画履歴を保存できません。');return recentStore(indexedDB);}
export const getRecentMedia=()=>browserStore().list();
export const getRecentFile=(id:string)=>browserStore().getFile(id);
export const deleteRecentMedia=(id:string)=>browserStore().remove(id);
export const clearRecentMedia=()=>browserStore().clear();
export async function rememberFile(file:File){if(!historyEnabled())return;await browserStore().saveFile(file);window.dispatchEvent(new Event('wotagei-history'));}
export async function rememberLink(url:string,kind:'youtube'|'link',title?:string){if(!historyEnabled())return;await browserStore().saveLink(url,kind,title);window.dispatchEvent(new Event('wotagei-history'));}
