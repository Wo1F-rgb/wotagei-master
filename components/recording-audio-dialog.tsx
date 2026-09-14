'use client';
import {useEffect,useState} from 'react';
import {Dialog,DialogContent,DialogDescription,DialogTitle} from '@/components/ui/dialog';
import type {RecordingSound} from '@/lib/recording-sound';

export function RecordingAudioDialog({open,busy,error,start,close}:{open:boolean;busy:boolean;error:string;start:(sound:RecordingSound)=>Promise<boolean>;close:()=>void}){
 const [tabAvailable,setTabAvailable]=useState(false);
 useEffect(()=>{if(open){const appleMobile=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);setTabAvailable(!appleMobile&&typeof navigator.mediaDevices?.getDisplayMedia==='function');}},[open]);
 async function begin(sound:RecordingSound){if(await start(sound))close();}
 return <Dialog open={open} onOpenChange={value=>{if(!value)close();}}><DialogContent className="practice-dialog recording-audio-dialog"><DialogTitle>YouTubeの録画音</DialogTitle><DialogDescription>{tabAvailable?'自分のカメラ映像と、再生中の曲を保存。':'このYouTube動画は音付き録画に未対応です。音声付きの動画ファイルかX動画を選んでください。'}</DialogDescription>
   {tabAvailable&&<div className="recording-audio-option"><button className="button primary wide" disabled={busy} onClick={()=>void begin('tab')}>タブの音で録画</button><p>このタブと「タブの音声も共有」を選択。マイクは使いません。</p></div>}
  <button className="button wide" disabled={busy} onClick={()=>void begin('none')}>音なしで録画</button>
  {busy&&<p role="status">音声の許可を待っています…</p>}{error&&<p className="warning" role="alert">{error}</p>}
  <button className="button wide" onClick={close}>{busy?'準備を中止':'戻る'}</button>
 </DialogContent></Dialog>;
}
