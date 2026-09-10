'use client';
import {useEffect,useState} from 'react';
import {Dialog,DialogContent,DialogDescription,DialogTitle} from '@/components/ui/dialog';
import type {RecordingSound} from '@/lib/recording-sound';

export function RecordingAudioDialog({open,busy,error,start,close}:{open:boolean;busy:boolean;error:string;start:(sound:RecordingSound)=>Promise<boolean>;close:()=>void}){
 const [tabAvailable,setTabAvailable]=useState(false);
 useEffect(()=>{if(open)setTabAvailable(typeof navigator.mediaDevices?.getDisplayMedia==='function');},[open]);
 async function begin(sound:RecordingSound){if(await start(sound))close();}
 return <Dialog open={open} onOpenChange={value=>{if(!value)close();}}><DialogContent className="practice-dialog recording-audio-dialog"><DialogTitle>YouTubeの録画音</DialogTitle><DialogDescription>自分のカメラ映像に入れる音を選びます。お手本はそのまま再生できます。</DialogDescription>
  <div className="recording-audio-option"><button className="button primary wide" disabled={busy} onClick={()=>void begin('microphone')}>マイクで音を入れて録画</button><p>iPhoneではスピーカーで曲を流してください。周囲の声・足音も入ります。イヤホンの曲はマイクで録れません。</p></div>
  {tabAvailable&&<div className="recording-audio-option"><button className="button wide" disabled={busy} onClick={()=>void begin('tab')}>タブの音で録画</button><p>PCのChrome・Edge向け。このヲタ芸マスターのタブを選び「タブの音声も共有」をオンにします。マイクは使いません。</p></div>}
  <button className="button wide" disabled={busy} onClick={()=>void begin('none')}>音なしで録画</button>
  {busy&&<p role="status">音声の許可を待っています…</p>}{error&&<p className="warning" role="alert">{error}</p>}
  <button className="button wide" onClick={close}>{busy?'準備を中止':'戻る'}</button>
 </DialogContent></Dialog>;
}
