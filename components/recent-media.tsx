'use client';
import {useEffect,useRef,useState} from 'react';
import {History,Trash2} from 'lucide-react';
import {Dialog,DialogContent,DialogDescription,DialogTitle} from '@/components/ui/dialog';
import {Switch} from '@/components/ui/switch';
import {clearRecentMedia,deleteRecentMedia,getRecentFile,getRecentMedia,historyEnabled,historyError,setHistoryEnabled,type RecentMedia} from '@/lib/recent-media';
type Props={index:number;loadFile:(file:File)=>void;loadLink:(url:string)=>void;disabled?:boolean;pause:()=>void};
export function RecentMediaPicker({index,loadFile,loadLink,disabled,pause}:Props){
 const [open,setOpen]=useState(false),[items,setItems]=useState<RecentMedia[]>([]),[remember,setRemember]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[clearConfirm,setClearConfirm]=useState(false),[message,setMessage]=useState('');
 const active=useRef(true),request=useRef(0);
 useEffect(()=>{active.current=true;return()=>{active.current=false;request.current++;};},[]);
 async function refresh(){try{const all=await getRecentMedia();if(active.current)setItems(all);}catch(e){if(active.current)setError(historyError(e));}}
 useEffect(()=>{if(open){setRemember(historyEnabled());void refresh();}const change=()=>{if(open)void refresh();};window.addEventListener('wotagei-history',change);return()=>window.removeEventListener('wotagei-history',change);},[open]);
 async function choose(item:RecentMedia){const id=++request.current;setBusy(true);setError('');try{if(item.kind==='file'){const file=await getRecentFile(item.id);if(!active.current||id!==request.current)return;loadFile(file);}else if(index===0&&item.url)loadLink(item.url);setOpen(false);}catch(e){if(active.current&&id===request.current)setError(historyError(e));}finally{if(active.current&&id===request.current)setBusy(false);}}
 async function remove(id?:string){setBusy(true);setError('');try{if(id)await deleteRecentMedia(id);else await clearRecentMedia();await refresh();setClearConfirm(false);}catch(e){if(active.current)setError(historyError(e));}finally{if(active.current)setBusy(false);}}
 const visible=items.filter(item=>index===0||item.kind==='file').slice(0,10);
 return <><button className="button" aria-label={`${index===0?'お手本':'自分'}の履歴を開く`} disabled={disabled} onClick={()=>{pause();setError('');setMessage('');setClearConfirm(false);setOpen(true);}}><History size={17}/>履歴</button>
 <Dialog open={open} onOpenChange={v=>{setOpen(v);if(!v){request.current++;setBusy(false);}}}><DialogContent className="practice-dialog history-dialog"><DialogTitle>{index===0?'お手本':'自分'}の履歴</DialogTitle><DialogDescription>この端末・ブラウザだけに保存。動画はアップロードされず、ほかの利用者には見えません。</DialogDescription>
 <label className="setting-row"><span>選んだ動画・URLを履歴に残す</span><Switch checked={remember} onCheckedChange={v=>{try{setHistoryEnabled(v);setRemember(v);}catch(e){setError(historyError(e));}}}/></label>
 <div className="recent-items">{visible.map(item=><div className="recent-item" key={item.id}><button disabled={busy} onClick={()=>void choose(item)}><strong>{item.name}</strong><small>{item.kind==='file'?`${(item.size/1024/1024).toFixed(1)} MB`:item.kind==='youtube'?'YouTube':'参考リンク'} · {new Date(item.usedAt).toLocaleDateString('ja-JP')}</small></button><button className="icon-button" disabled={busy} aria-label={`${item.name}を履歴から削除`} onClick={()=>void remove(item.id)}><Trash2 size={17}/></button></div>)}{!visible.length&&<p>履歴はまだありません。動画ファイルやYouTubeリンクを選ぶと、ここから再び使えます。</p>}</div>
 {error&&<p className="warning" role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
 <p className="config-hint">動画・URLを合わせて最近10件を保存します。11件目から古い履歴を入れ替えます。動画は合計1GB・1本500MBまで。ブラウザのデータ削除や空き容量不足で消える場合があります。元動画は写真アプリなどにも残してください。別端末とは同期しません。</p>
 <div className="source-actions"><button className="button" onClick={()=>void(async()=>{try{const granted=await navigator.storage?.persist?.();setMessage(granted?'このブラウザで保存領域の保護が有効です。':'保存領域の保護は許可されませんでした。通常の保存は使えます。');}catch{setMessage('このブラウザでは保存領域を保護できません。');}})()}>保存領域を保護</button>{items.length>0&&!clearConfirm&&<button className="button" onClick={()=>setClearConfirm(true)}>履歴をすべて削除</button>}{clearConfirm&&<><button className="button" disabled={busy} onClick={()=>void remove()}>全履歴を削除する</button><button className="button" onClick={()=>setClearConfirm(false)}>やめる</button></>}</div>
 <p className="config-hint">削除するのはこのアプリ内のコピーです。写真アプリの元動画は削除しません。履歴をOFFにしても既存の履歴は残ります。</p>
 </DialogContent></Dialog></>;
}
