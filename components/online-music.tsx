'use client';
import {useEffect,useRef,useState} from 'react';
import {Dialog,DialogContent,DialogDescription,DialogTitle} from '@/components/ui/dialog';
import type {MusicSearch,OnlineSong} from '@/lib/music-search';
export function OnlineMusic({onChoose,disabled}:{onChoose:(song:OnlineSong)=>void;disabled:boolean}){
 const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[busy,setBusy]=useState(false),[result,setResult]=useState<MusicSearch|null>(null),[error,setError]=useState('');
 const controller=useRef<AbortController|null>(null);useEffect(()=>()=>controller.current?.abort(),[]);
 async function search(){controller.current?.abort();const task=new AbortController();controller.current=task;setBusy(true);setError('');setResult(null);try{let data:MusicSearch;if(import.meta.env.VITE_STATIC_SITE==='true'){const {searchMusicInBrowser}=await import('@/lib/music-browser');data=await searchMusicInBrowser(query.trim(),task.signal);}else{const response=await fetch(`/api/music?q=${encodeURIComponent(query.trim())}`,{signal:task.signal});const body=await response.json() as MusicSearch & {error?:string};if(!response.ok)throw new Error(body.error||'検索できませんでした。');data=body;}if(!task.signal.aborted)setResult(data);}catch(e){if(!task.signal.aborted)setError(e instanceof Error?e.message:'検索できませんでした。');}finally{if(controller.current===task)setBusy(false);}}
  return <><button className="button primary wide" disabled={disabled} onClick={()=>setOpen(true)}>曲名・Apple MusicからBPM検索</button>
  <Dialog open={open} onOpenChange={v=>{setOpen(v);if(!v){controller.current?.abort();setBusy(false);}}}><DialogContent className="practice-dialog music-dialog"><DialogTitle>曲を選んでBPMを設定</DialogTitle><DialogDescription>曲・アーティストを確認して選択。BPM登録済みなら入力不要。</DialogDescription>
  <form className="music-search" onSubmit={e=>{e.preventDefault();void search();}}><input type="search" aria-label="曲名またはApple Musicの曲共有リンク" placeholder="曲名・歌手名 / Apple Musicリンク" value={query} onChange={e=>setQuery(e.target.value)} maxLength={500}/><button className="button primary" disabled={busy||query.trim().length<2}>{busy?'検索中':'検索'}</button></form>
 {error&&<p className="warning" role="alert">{error}</p>}
 {result?.apple&&<a className="saved-link" href={result.apple.url} target="_blank" rel="noreferrer">Apple Musicで「{result.apple.title} / {result.apple.artist}」を開く</a>}
  {result&&<div className="online-songs">{result.songs.map(song=><div className="online-song" key={`${song.provider}:${song.id}`}><div><strong>{song.title}</strong><span>{song.artist}{song.album&&` / ${song.album}`}</span><a href={song.url} target="_blank" rel="noreferrer">{song.provider}で確認</a></div><button className="button" disabled={song.bpm===null} onClick={()=>{onChoose(song);setOpen(false);}}>{song.bpm===null?'BPM未収録':`${song.bpm} BPMを使う`}</button></div>)}{!result.songs.length&&<p>一致なし。曲名・歌手名を確認してください。</p>}{result.message&&<p className="config-hint">BPMなし。手入力またはXMLを使えます。</p>}</div>}
  <p className="config-hint">Apple Musicは曲名確認用。音源の取り込み・同期再生には対応しません。</p>
 {result?.songs.some(s=>s.provider==='GetSongBPM')&&<a className="saved-link" href="https://getsongbpm.com" target="_blank" rel="noreferrer">BPM data by GetSongBPM</a>}
 </DialogContent></Dialog></>;
}
