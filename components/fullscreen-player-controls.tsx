'use client';
import {useCallback,useEffect,useRef,useState,type ChangeEvent, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent, type SyntheticEvent} from 'react';
import {FastForward,Pause,Play,Rewind,X} from 'lucide-react';
import {clampMediaTime,formatMediaTime} from '@/lib/fullscreen-player-controls';
import './fullscreen-player-controls.css';

const HIDE_AFTER_MS=3000;

export type FullscreenPlayerControlsProps={
 active:boolean;
 playing:boolean;
 preparing?:boolean;
 time:number;
 duration:number;
 tracking?:{label:string;disabled:boolean;open:()=>void;toggle?:()=>void;enabled?:boolean};
 onPlay:()=>void;
 onPause:()=>void;
 onSeek:(time:number)=>void;
 onExit:()=>void;
};

export function FullscreenPlayerControls({active,playing,preparing=false,time,duration,tracking,onPlay,onPause,onSeek,onExit}:FullscreenPlayerControlsProps){
 const [visible,setVisible]=useState(false),[scrubTime,setScrubTime]=useState<number|null>(null),controls=useRef<HTMLDivElement>(null),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const scrubbing=useRef(false),scrubValue=useRef(0),scrubWasPlaying=useRef(false);
 const latestPlay=useRef(onPlay);latestPlay.current=onPlay;
 const clearTimer=useCallback(()=>{if(timer.current!==null){clearTimeout(timer.current);timer.current=null;}},[]);
 const scheduleHide=useCallback(()=>{
  clearTimer();
  if(!active||!playing||preparing||scrubbing.current)return;
  timer.current=setTimeout(()=>{timer.current=null;setVisible(false);},HIDE_AFTER_MS);
 },[active,playing,preparing,clearTimer]);
 const reveal=useCallback(()=>{
  if(!active)return;
  setVisible(true);
  scheduleHide();
 },[active,scheduleHide]);

 useEffect(()=>{
  if(!active){const resume=scrubbing.current&&scrubWasPlaying.current;clearTimer();scrubbing.current=false;scrubWasPlaying.current=false;scrubValue.current=0;setScrubTime(null);setVisible(false);if(resume)latestPlay.current();return;}
  setVisible(true);
  if(playing&&!preparing)scheduleHide();
  else clearTimer();
  return clearTimer;
 },[active,playing,preparing,scheduleHide,clearTimer]);

 useEffect(()=>{
  if(visible)return;
  const focused=document.activeElement;
  if(focused&&controls.current?.contains(focused)){
   (focused as HTMLElement).blur();
  }
 },[visible]);

  useEffect(()=>{
    if(!active)return;
    const onKeyDown=(event:KeyboardEvent)=>{
      const target=event.target;
      if(target instanceof Element&&target.closest('[data-fullscreen-player-tap]'))return;
      if(event.key==='Tab'||event.key==='Enter'||event.key===' '||event.key==='Escape'||event.key.startsWith('Arrow'))reveal();
    };
  window.addEventListener('keydown',onKeyDown);
  return()=>window.removeEventListener('keydown',onKeyDown);
 },[active,reveal]);

 const safeDuration=Number.isFinite(duration)&&duration>0?duration:0;
 const safeTime=clampMediaTime(time,safeDuration);
 const displayTime=scrubTime===null?safeTime:clampMediaTime(scrubTime,safeDuration);
 const disabled=preparing||safeDuration<=0;
 const togglePlayback=()=>{if(preparing||playing)onPause();else onPlay();};
 const seekBy=useCallback((delta:number)=>{
  const shouldResume=playing&&!preparing;
  if(shouldResume)onPause();
  onSeek(clampMediaTime(safeTime+delta,safeDuration));
  if(shouldResume){onPlay();scheduleHide();}
 },[playing,preparing,onPause,onSeek,safeTime,safeDuration,onPlay,scheduleHide]);
 const beginScrub=useCallback(()=>{
  if(!active||disabled||scrubbing.current)return;
  scrubbing.current=true;
  scrubWasPlaying.current=playing&&!preparing;
  scrubValue.current=displayTime;
  clearTimer();
  setVisible(true);
  if(scrubWasPlaying.current)onPause();
 },[active,disabled,playing,preparing,displayTime,clearTimer,onPause]);
 const finishScrub=useCallback((value:number)=>{
  if(!scrubbing.current)return;
  const next=clampMediaTime(value,safeDuration),shouldResume=scrubWasPlaying.current;
  scrubbing.current=false;
  scrubWasPlaying.current=false;
  scrubValue.current=next;
  setScrubTime(null);
  onSeek(next);
  if(shouldResume){onPlay();scheduleHide();}
 },[safeDuration,onSeek,onPlay,scheduleHide]);
 const changeScrub=(event:ChangeEvent<HTMLInputElement>)=>{
  if(!scrubbing.current)beginScrub();
  const next=clampMediaTime(Number(event.currentTarget.value),safeDuration);
  scrubValue.current=next;setScrubTime(next);
 };
 const startPointerScrub=(event:PointerEvent<HTMLInputElement>)=>{
  beginScrub();
  event.currentTarget.setPointerCapture?.(event.pointerId);
  stopInteraction(event);
 };
 const endPointerScrub=(event:PointerEvent<HTMLInputElement>)=>{
  finishScrub(scrubValue.current);
  stopInteraction(event);
 };
 const startKeyboardScrub=(event:ReactKeyboardEvent<HTMLInputElement>)=>{
  if(['ArrowLeft','ArrowRight','Home','End','PageUp','PageDown'].includes(event.key))beginScrub();
 };
 const endKeyboardScrub=(event:ReactKeyboardEvent<HTMLInputElement>)=>{
  if(['ArrowLeft','ArrowRight','Home','End','PageUp','PageDown'].includes(event.key))finishScrub(scrubValue.current);
 };
 const stopInteraction=(event:SyntheticEvent)=>{reveal();event.stopPropagation();};
  const tapStage=(event:SyntheticEvent)=>{
    event.stopPropagation();
    if(!active)return;
    if(visible){clearTimer();setVisible(false);}
    else{setVisible(true);scheduleHide();}
  };
  if(!active)return null;
  return <div className="fullscreen-player-controls" data-visible={visible}>
    <button type="button" className="fullscreen-player-controls__tap" tabIndex={0} data-fullscreen-player-tap aria-expanded={visible} aria-label={visible?'再生コントロールを隠す':'再生コントロールを表示'} onClick={tapStage}/>
  <div ref={controls} className="fullscreen-player-controls__panel" role="toolbar" aria-label="全画面動画の操作" aria-hidden={!visible} onClick={stopInteraction} onPointerDown={stopInteraction}>
   <div className="fullscreen-player-controls__buttons">
    <button type="button" tabIndex={visible?0:-1} className="fullscreen-player-controls__button" aria-label={preparing?'再生準備を中止':playing?'一時停止':'再生'} disabled={preparing?false:!safeDuration} onClick={togglePlayback}>
     {playing||preparing?<Pause aria-hidden="true"/>:<Play aria-hidden="true"/>}
    </button>
    <button type="button" tabIndex={visible?0:-1} className="fullscreen-player-controls__button" aria-label="10秒戻す" title="10秒戻す" disabled={disabled} onClick={()=>seekBy(-10)}><Rewind aria-hidden="true"/></button>
    <span className="fullscreen-player-controls__time"><span>{formatMediaTime(displayTime)}</span><span aria-hidden="true"> / </span><span>{formatMediaTime(safeDuration)}</span></span>
    <button type="button" tabIndex={visible?0:-1} className="fullscreen-player-controls__button" aria-label="10秒進める" title="10秒進める" disabled={disabled} onClick={()=>seekBy(10)}><FastForward aria-hidden="true"/></button>
    <button type="button" tabIndex={visible?0:-1} className="fullscreen-player-controls__button" aria-label="全画面を終了" onClick={onExit}><X aria-hidden="true"/></button>
   </div>
   <label className="fullscreen-player-controls__seek-label"><span className="sr-only">動画の再生位置</span><input type="range" tabIndex={visible?0:-1} min={0} max={safeDuration||1} step={.01} value={displayTime} disabled={disabled} aria-label="動画の再生位置" aria-valuetext={`${formatMediaTime(displayTime)} / ${formatMediaTime(safeDuration)}`} onClick={stopInteraction} onPointerDown={startPointerScrub} onPointerUp={endPointerScrub} onPointerCancel={endPointerScrub} onKeyDown={startKeyboardScrub} onKeyUp={endKeyboardScrub} onBlur={event=>finishScrub(scrubValue.current)} onChange={changeScrub}/></label>
   {tracking&&<div className="fullscreen-player-controls__tracking-row"><button type="button" className="fullscreen-player-controls__tracking" aria-label="位置追従を設定" tabIndex={visible?0:-1} disabled={tracking.disabled} onClick={tracking.open}>{tracking.label} · 設定</button>{tracking.toggle&&<button type="button" className="fullscreen-player-controls__tracking" tabIndex={visible?0:-1} disabled={tracking.disabled} onClick={tracking.toggle}>{tracking.enabled?'追従を解除':'追従を再開'}</button>}</div>}
  </div>
 </div>;
}
