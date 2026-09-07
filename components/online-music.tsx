'use client';
import {useEffect,useRef,useState} from 'react';
import {Dialog,DialogContent,DialogDescription,DialogTitle} from '@/components/ui/dialog';
import type {MusicSearch,OnlineSong} from '@/lib/music-search';
export function OnlineMusic({onChoose,disabled}:{onChoose:(song:OnlineSong)=>void;disabled:boolean}){
 const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[busy,setBusy]=useState(false),[result,setResult]=useState<MusicSearch|null>(null),[error,setError]=useState('');
 const controller=useRef<AbortController|null>(null);useEffect(()=>()=>controller.current?.abort(),[]);
 async function search(){controller.current?.abort();const task=new AbortController();controller.current=task;setBusy(true);setError('');setResult(null);try{let data:MusicSearch;if(import.meta.env.VITE_STATIC_SITE==='true'){const {searchMusicInBrowser}=await import('@/lib/music-browser');data=await searchMusicInBrowser(query.trim(),task.signal);}else{const response=await fetch(`/api/music?q=${encodeURIComponent(query.trim())}`,{signal:task.signal});const body=await response.json() as MusicSearch & {error?:string};if(!response.ok)throw new Error(body.error||'検索できませんでした。');data=body;}if(!task.signal.aborted)setResult(data);}catch(e){if(!task.signal.aborted)setError(e instanceof Error?e.message:'検索できませんでした。');}finally{if(controller.current===task)setBusy(false);}}
 return <><button className="button primary wide" disabled={disabled} onClick={()=>setOpen(true)}>曲名・Apple MusicリンクからBPM検索</button>
 <Dialog open={open} onOpenChange={v=>{setOpen(v);if(!v){controller.current?.abort();setBusy(false);}}}><DialogContent className="practice-dialog music-dialog"><DialogTitle>曲を選んでBPMを設定</DialogTitle><DialogDescription>原曲・アーティスト・バージョンを確認して選びます。BPMが登録された曲は入力不要です。</DialogDescription>
 <form className="music-search" onSubmit={e=>{e.preventDefault();void search();}}><input type="search" aria-label="曲名またはApple Musicの曲共有リンク" placeholder="曲名・歌手名、またはApple Musicリンク" value={query} onChange={e=>setQuery(e.target.value)} maxLength={500}/><button className="button primary" disabled={busy||query.trim().length<2}>{busy?'検索中':'検索'}</button></form>
 {error&&<p className="warning" role="alert">{error}</p>}
 {result?.apple&&<a className="saved-link" href={result.apple.url} target="_blank" rel="noreferrer">Apple Musicで「{result.apple.title} / {result.apple.artist}」を開く</a>}
 {result&&<div className="online-songs">{result.songs.map(song=><div className="online-song" key={`${song.provider}:${song.id}`}><div><strong>{song.title}</strong><span>{song.artist}{song.album&&` / ${song.album}`}</span><a href={song.url} target="_blank" rel="noreferrer">{song.provider}で確認</a></div><button className="button" disabled={song.bpm===null} onClick={()=>{onChoose(song);setOpen(false);}}>{song.bpm===null?'BPM未収録':`${song.bpm} BPMを使う`}</button></div>)}{!result.songs.length&&<p>一致する曲がありません。歌手名や原曲名で検索してください。</p>}{result.message&&<p className="config-hint">{result.message}</p>}</div>}
 <p className="config-hint">Apple Musicのリンクは曲名の確認に使います。サブスク音源の取り出し・動画との同期再生には対応していません。スロー編集した動画は原曲のBPMと異なります。</p>
 {result?.songs.some(s=>s.provider==='GetSongBPM')&&<a className="saved-link" href="https://getsongbpm.com" target="_blank" rel="noreferrer">BPM data by GetSongBPM</a>}
 </DialogContent></Dialog></>;
}
