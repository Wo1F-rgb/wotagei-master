'use client';
import {Slider} from '@/components/ui/slider';
import type {BackgroundSettings} from '@/lib/background';
export function BackgroundControls({settings:s,change,disabled}:{settings:BackgroundSettings;change:(settings:BackgroundSettings)=>void;disabled:boolean}){
  const hint=disabled?'切り抜きには動画ファイル・X動画を選択':s.mode==='green'?'緑の服・サイリウムも消える場合があります。重ねるでは透明。':s.mode==='person'?'速い動きやサイリウムは欠ける場合があります。重ねるでは透明。':'';
  return <div className="background-controls"><label>背景 <select aria-label="背景の切り抜き方式" value={s.mode} disabled={disabled} onChange={e=>change({...s,mode:e.target.value as BackgroundSettings['mode']})}><option value="off">OFF</option><option value="person">人物</option><option value="green">緑背景</option></select></label>
  {s.mode!=='off'&&<><label>{s.mode==='person'?'輪郭':'緑除去'}<span>{Math.round(s.threshold*100)}</span></label><Slider aria-label={s.mode==='person'?'人物の輪郭の絞り込み':'緑を消す強さ'} min={.1} max={.9} step={.02} value={[s.threshold]} onValueChange={v=>change({...s,threshold:Array.isArray(v)?v[0]:v})}/><div className="background-preview-options"><span>背景プレビュー</span>{(['green','transparent'] as const).map(value=><button className="button mini" key={value} aria-pressed={s.preview===value} onClick={()=>change({...s,preview:value})}>{value==='green'?'緑':'透明'}</button>)}</div></>}
  {hint&&<p className="config-hint">{hint}</p>}{s.mode!=='off'&&<small className="config-hint">表示のみ。録画には反映しません。</small>}</div>;
}
