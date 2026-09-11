'use client';
import {Slider} from '@/components/ui/slider';
import type {MotionCurve} from '@/lib/motion-alignment';

export function MotionControls({target,curve,bothMoving,strength,enabled,toggle,changeStrength,start,disabled,hint}:{target:0|1;curve:MotionCurve|null;bothMoving:boolean;strength:number;enabled:boolean;toggle:()=>void;changeStrength:(v:number)=>void;start:()=>void;disabled:boolean;hint:string}){
 const name=target===0?'お手本':'自分';
 return <div className="motion-controls" aria-label="手持ち動画の追従">
  <div><strong>{name}の手持ち補正</strong><button className="button" disabled={disabled||!!hint} onClick={start}>{curve?.frames.length?'追従を再解析':'追従を解析'}</button></div>
  {curve?.frames.length?<button className="button" onClick={toggle} disabled={disabled}>{enabled?'追従を解除':'追従を再開'}</button>:null}
  <p>{hint|| (curve?.frames.length?enabled?`追従準備済み · 有効な場面 ${Math.round(curve.accepted/curve.total*100)}%。再生すると位置・倍率が追従します。`:'追従を解除しました。手動で合わせた位置はそのままです。再開すると同じ解析結果を使えます。':'BPM・拍と基本の位置を合わせてから解析してください。再生中に骨格解析は行いません。')}</p>
  <p>{bothMoving?'両方が三脚OFFなので、位置の主役を基準に相手が追従します。':'三脚ON側を固定し、OFF側だけを補正します。'} 肩・腰の中心を追い、姿勢が大きく違う場面では倍率を固定します。傾き・遠近は固定。検出できない場面は補正を弱めます。</p>
  {curve?.frames.length?<div className="motion-strength"><label id="motion-strength-label">追従の強さ <span>{Math.round(strength*100)}%</span></label><Slider aria-labelledby="motion-strength-label" value={[strength]} min={0} max={1} step={.05} disabled={disabled} onValueChange={v=>changeStrength(Array.isArray(v)?v[0]:v)}/></div>:null}
 </div>;
}
