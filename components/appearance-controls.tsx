'use client';
import {Switch} from '@/components/ui/switch';
import {gammaExponent,type VideoAppearance} from '@/lib/video-appearance';
export function VideoGrade({id,value,index}:{id:string;value:VideoAppearance;index:number}){
 const color=index===0?[.8,.98,.41]:[.77,.69,1];
 return <svg width="0" height="0" className="video-grade-definitions" aria-hidden="true"><defs><filter id={id} x="0%" y="0%" width="100%" height="100%" colorInterpolationFilters="sRGB"><feComponentTransfer><feFuncR type="gamma" amplitude="1" exponent={gammaExponent(value.gamma)} offset="0"/><feFuncG type="gamma" amplitude="1" exponent={gammaExponent(value.gamma)} offset="0"/><feFuncB type="gamma" amplitude="1" exponent={gammaExponent(value.gamma)} offset="0"/></feComponentTransfer>{value.tint&&<feColorMatrix type="matrix" values={`0 0 0 0 ${color[0]} 0 0 0 0 ${color[1]} 0 0 0 0 ${color[2]} 0 0 0 1 0`}/>}</filter></defs></svg>;
}
export function AppearanceControls({value,change,disabled=false}:{value:VideoAppearance;change:(value:VideoAppearance)=>void;disabled?:boolean}){
 return <div className="appearance-controls"><label className="setting-row"><span>骨格を表示</span><Switch aria-label="骨格を表示" checked={value.skeleton} disabled={disabled} onCheckedChange={skeleton=>change({...value,skeleton})}/></label>
 <label>暗部の明るさ（ガンマ）<output>{value.gamma.toFixed(2)}</output><input type="range" aria-label="暗部の明るさ（ガンマ）" min="0.6" max="2.4" step="0.05" value={value.gamma} disabled={disabled} onChange={e=>change({...value,gamma:Number(e.target.value)})}/></label>
 <label>コントラスト<output>{value.contrast.toFixed(2)}</output><input type="range" aria-label="コントラスト" min="0.6" max="1.6" step="0.05" value={value.contrast} disabled={disabled} onChange={e=>change({...value,contrast:Number(e.target.value)})}/></label>
 <label className="setting-row"><span>切り抜いた人物を色分け</span><Switch aria-label="切り抜いた人物を色分け" checked={value.tint} disabled={disabled} onCheckedChange={tint=>change({...value,tint})}/></label>
 <p className="config-hint">{disabled?'YouTubeの骨格・人物切り抜きは利用できません。':'骨格は再生中も表示できます。見えない関節は表示せず、検出できない場面では線を消します。色分けは下の「背景」で切り抜きをONにすると反映されます。'} 明るさ・色分けは表示用で、元動画や録画は変わりません。</p></div>;
}
