'use client';
import {Slider} from '@/components/ui/slider';
import type {MotionCurve} from '@/lib/motion-alignment';

export function MotionControls({target,curve,bothMoving,strength,enabled,toggle,changeStrength,start,disabled,hint}:{target:0|1;curve:MotionCurve|null;bothMoving:boolean;strength:number;enabled:boolean;toggle:()=>void;changeStrength:(v:number)=>void;start:()=>void;disabled:boolean;hint:string}){
  const name=target===0?'お手本':'自分';

  return <div className="motion-controls" aria-label="手持ち動画の追従">
   <div><strong>{name}の手持ち補正</strong><button className="button" disabled={disabled||!!hint} onClick={start}>{curve?.frames.length?'追従を再解析':'追従を解析'}</button></div>
   {curve?.frames.length?<button className="button" onClick={toggle} disabled={disabled}>{enabled?'追従を解除':'追従を再開'}</button>:null}
   {hint&&<p>{hint}</p>}
   <p>{bothMoving?'基準：位置の主役':'基準：三脚ON側'}</p>
  {curve?.frames.length?<div className="motion-strength"><label id="motion-strength-label">追従の強さ <span>{Math.round(strength*100)}%</span></label><Slider aria-labelledby="motion-strength-label" value={[strength]} min={0} max={1} step={.05} disabled={disabled} onValueChange={v=>changeStrength(Array.isArray(v)?v[0]:v)}/></div>:null}
 </div>;
}
