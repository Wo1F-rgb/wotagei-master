'use client';
import {useLayoutEffect,type RefObject} from 'react';
import {motionAt,type MotionCurve} from './motion-alignment';

/** Only CSS changes during playback. Never seek, pause, change rate or run pose detection here. */
export function useMotionPlayback(reference:RefObject<HTMLVideoElement|null>,layers:readonly RefObject<HTMLDivElement|null>[],curve:MotionCurve|null,active:boolean,strength:number){
 const first=layers[0],second=layers[1];
 useLayoutEffect(()=>{
  const elements=[first.current,second.current];let request=0;
  const clear=()=>elements.forEach(el=>{if(el){el.style.transform='';delete el.dataset.tracking;}});
  if(!active||!curve?.frames.length){clear();return;}
  const update=()=>{
   const correction=motionAt(curve,reference.current?.currentTime??NaN,strength);
   elements.forEach((el,i)=>{if(!el)return;el.style.transform=i===curve.target?`translate(${correction.x}%, ${correction.y}%) scale(${correction.scale})`:'';el.dataset.tracking=i===curve.target?'true':'false';});
   request=requestAnimationFrame(update);
  };
  update();return()=>{cancelAnimationFrame(request);clear();};
 },[reference,first,second,curve,active,strength]);
}
