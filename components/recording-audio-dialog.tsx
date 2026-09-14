'use client';
import {useEffect,useState} from 'react';
import {Dialog,DialogContent,DialogDescription,DialogTitle} from '@/components/ui/dialog';
import type {RecordingSound} from '@/lib/recording-sound';

export function RecordingAudioDialog({open,busy,error,start,close,screenGuide=false,screenView}:{open:boolean;busy:boolean;error:string;start:(sound:RecordingSound)=>Promise<boolean>;close:()=>void;screenGuide?:boolean;screenView:()=>void}){
 const [tabAvailable,setTabAvailable]=useState(false),[guide,setGuide]=useState(false);
 useEffect(()=>{if(open){setGuide(screenGuide);const appleMobile=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);setTabAvailable(!appleMobile&&typeof navigator.mediaDevices?.getDisplayMedia==='function');}},[open,screenGuide]);
 async function begin(sound:RecordingSound){if(await start(sound))close();}
 return <Dialog open={open} onOpenChange={value=>{if(!value)close();}}><DialogContent className="practice-dialog recording-audio-dialog"><DialogTitle>{guide?'iPhoneの画面収録':'YouTubeの録画音'}</DialogTitle><DialogDescription>{guide?'比較・重ねる画面と、再生中の曲を残します。':'音と映像の残し方を選択。'}</DialogDescription>
  {guide?<>
   <ol className="screen-recording-steps"><li>下のボタンで練習画面を開く。</li><li>コントロールセンターの「画面収録」●を押す。</li><li>3秒待ってアプリに戻り、▶で再生。</li><li>終了はiPhone上部の赤い録画表示から。動画は「写真」に保存。</li></ol>
   <p className="screen-recording-note">曲だけなら画面収録のマイクはOFF。声・足音も入れるならON。</p>
   <button className="button primary wide" disabled={busy} onClick={screenView}>練習画面を開く</button>
   <p className="screen-recording-note">録画の開始・停止はiPhone側で操作します。</p>
   <button className="button wide" onClick={close}>閉じる</button>
  </>:<>
   {tabAvailable&&<div className="recording-audio-option"><button className="button primary wide" disabled={busy} onClick={()=>void begin('tab')}>タブの音で録画</button><p>PCのChrome・Edge向け。このタブと「タブの音声も共有」を選択。</p></div>}
   <div className="recording-audio-option"><button className={`button wide${tabAvailable?'':' primary'}`} disabled={busy} onClick={()=>setGuide(true)}>iPhoneの画面収録を使う</button><p>比較・重ねる画面と曲を「写真」に保存。</p></div>
   <div className="recording-audio-option"><button className="button wide" disabled={busy} onClick={()=>void begin('microphone')}>マイクで音を入れて録画</button><p>自分の映像だけを保存。スピーカーの曲・声・足音を拾います。イヤホン音は入りません。</p></div>
  <button className="button wide" disabled={busy} onClick={()=>void begin('none')}>音なしで録画</button>
  {busy&&<p role="status">音声の許可を待っています…</p>}{error&&<p className="warning" role="alert">{error}</p>}
  <button className="button wide" onClick={close}>{busy?'準備を中止':'戻る'}</button>
  </>}
 </DialogContent></Dialog>;
}
