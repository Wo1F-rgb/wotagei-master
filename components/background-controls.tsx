'use client';
import {Slider} from '@/components/ui/slider';
import type {BackgroundSettings} from '@/lib/background';
export function BackgroundControls({settings:s,change,disabled}:{settings:BackgroundSettings;change:(settings:BackgroundSettings)=>void;disabled:boolean}){
 return <div className="background-controls"><label>背景 <select aria-label="背景の切り抜き方式" value={s.mode} disabled={disabled} onChange={e=>change({...s,mode:e.target.value as BackgroundSettings['mode']})}><option value="off">OFF（元の動画）</option><option value="person">人物を自動で切り抜く</option><option value="green">撮影した緑背景を消す</option></select></label>
 {s.mode!=='off'&&<><label>{s.mode==='person'?'輪郭の絞り込み':'緑を消す強さ'}<span>{Math.round(s.threshold*100)}</span></label><Slider aria-label={s.mode==='person'?'人物の輪郭の絞り込み':'緑を消す強さ'} min={.1} max={.9} step={.02} value={[s.threshold]} onValueChange={v=>change({...s,threshold:Array.isArray(v)?v[0]:v})}/><div className="background-preview-options"><span>確認用の背景</span>{(['green','transparent'] as const).map(value=><button className="button mini" key={value} aria-pressed={s.preview===value} onClick={()=>change({...s,preview:value})}>{value==='green'?'緑':'透明'}</button>)}</div></>}
 <p className="config-hint">{disabled?'YouTubeの埋め込み動画は切り抜けません。動画ファイルを選ぶと使えます。':s.mode==='green'?'緑の服・サイリウムも消える場合があります。重ねる画面では背景は透明になります。':s.mode==='person'?'緑背景で輪郭を確認できます。「重ねる」では透明に。速い動きやサイリウムは欠ける場合があります。':'動画とカメラの背景を消して、人物を見やすくできます。'}</p>
 {s.mode!=='off'&&<small className="config-hint">表示用の切り抜きです。保存する録画には反映しません。</small>}</div>;
}
