'use client';
import {Switch} from '@/components/ui/switch';
import type {ReactNode} from 'react';
import {gammaExponent,type VideoAppearance} from '@/lib/video-appearance';
export function VideoGrade({id,value,index}:{id:string;value:VideoAppearance;index:number}){
 const color=index===0?[.8,.98,.41]:[.77,.69,1];
 return <svg width="0" height="0" className="video-grade-definitions" aria-hidden="true"><defs><filter id={id} x="0%" y="0%" width="100%" height="100%" colorInterpolationFilters="sRGB"><feComponentTransfer><feFuncR type="gamma" amplitude="1" exponent={gammaExponent(value.gamma)} offset="0"/><feFuncG type="gamma" amplitude="1" exponent={gammaExponent(value.gamma)} offset="0"/><feFuncB type="gamma" amplitude="1" exponent={gammaExponent(value.gamma)} offset="0"/></feComponentTransfer>{value.tint&&<feColorMatrix type="matrix" values={`0 0 0 0 ${color[0]} 0 0 0 0 ${color[1]} 0 0 0 0 ${color[2]} 0 0 0 1 0`}/>}</filter></defs></svg>;
}
export function AppearanceControls({value,change,disabled=false,analysis,live=false}:{value:VideoAppearance;change:(value:VideoAppearance)=>void;disabled?:boolean;analysis?:ReactNode;live?:boolean}){
  return <div className="appearance-controls"><label className="setting-row"><span>骨格を表示</span><Switch aria-label="骨格を表示" checked={value.skeleton} disabled={disabled} onCheckedChange={skeleton=>change({...value,skeleton})}/></label>
  <label>ガンマ<output>{value.gamma.toFixed(2)}</output><input type="range" aria-label="暗部の明るさ（ガンマ）" min="0.6" max="2.4" step="0.05" value={value.gamma} disabled={disabled} onChange={e=>change({...value,gamma:Number(e.target.value)})}/></label>
 <label>コントラスト<output>{value.contrast.toFixed(2)}</output><input type="range" aria-label="コントラスト" min="0.6" max="1.6" step="0.05" value={value.contrast} disabled={disabled} onChange={e=>change({...value,contrast:Number(e.target.value)})}/></label>
 <label className="setting-row"><span>切り抜いた人物を色分け</span><Switch aria-label="切り抜いた人物を色分け" checked={value.tint} disabled={disabled} onCheckedChange={tint=>change({...value,tint})}/></label>
  {value.skeleton&&!disabled&&analysis}{disabled?<p className="config-hint">映像を読み取れる動画を選択</p>:value.tint&&<p className="config-hint">色分けは背景切り抜きON時に反映</p>}</div>;
}
