'use client';
import {useLayoutEffect,type RefObject} from 'react';
import {motionAt,type MotionCurve} from './motion-alignment';
import {subscribeVideoFrames} from './video-frame-clock';

/** Only CSS changes during playback. Never seek, pause, change rate or run pose detection here. */
export function useMotionPlayback(reference:RefObject<HTMLVideoElement|null>,layers:readonly RefObject<HTMLDivElement|null>[],curve:MotionCurve|null,active:boolean,strength:number){
 const first=layers[0],second=layers[1];
 useLayoutEffect(()=>{
  const elements=[first.current,second.current];
  const clear=()=>elements.forEach(el=>{if(el){el.style.transform='';delete el.dataset.tracking;}});
  if(!active||!curve?.frames.length){clear();return;}
  const video=reference.current;
  if(!video){clear();return;}
  const update=(mediaTime:number)=>{
   // The frame clock emits NaN while a seek/source transition is unresolved.
   // motionAt's identity result clears any transform until the new frame is
   // actually displayed, preventing a stale correction from lingering.
   const correction=motionAt(curve,Number.isFinite(mediaTime)?mediaTime:NaN,strength);
   elements.forEach((el,i)=>{if(!el)return;el.style.transform=i===curve.target?`translate(${correction.x}%, ${correction.y}%) scale(${correction.scale})`:'';el.dataset.tracking=i===curve.target?'true':'false';});
  };
  const unsubscribe=subscribeVideoFrames(video,update);
  return()=>{unsubscribe();clear();};
 },[reference,first,second,curve,active,strength]);
}
