'use client';
import {useEffect,useRef,useState,type RefObject} from 'react';
import {createPortal} from 'react-dom';
import {Slider} from '@/components/ui/slider';
import {containRect} from '@/lib/background';
import {initialScenePoints,sceneMatrix,type SceneCalibration as Calibration} from '@/lib/scene-calibration';
type Props={video:RefObject<HTMLVideoElement|null>;saved:Calibration|null;preview:(value:Calibration|null)=>void;save:(value:Calibration|null)=>void};
export function SceneCalibrationEditor({video,saved,preview:showPreview,save}:Props){
 const el=video.current!,aspect=el.videoWidth/el.videoHeight;
 const [draft,setDraft]=useState<Calibration>(()=>saved||{mode:'level',points:initialScenePoints('level'),aspect:1,videoAspect:aspect,strength:1});
 const [ratio,setRatio]=useState(saved?.mode==='rectangle'?String(saved.aspect):''),[previewing,setPreviewing]=useState(false),[selected,setSelected]=useState(0);
 const callbacks=useRef({showPreview,save});callbacks.current={showPreview,save};
 const dragging=useRef<number|null>(null),settings={...draft,aspect:draft.mode==='rectangle'?Number(ratio):1};
 const adopted=JSON.stringify(saved)===JSON.stringify(settings);
 let error='';try{sceneMatrix(settings);}catch(e){error=e instanceof Error?e.message:'基準点を確認してください。';}
 if(draft.mode==='rectangle'&&!ratio.trim())error='実物の横÷縦を入力するか、実物が正方形なら「正方形」を選んでください。';
 useEffect(()=>{callbacks.current.showPreview(previewing&&!error?settings:null);},[previewing,draft,ratio,error]);
 useEffect(()=>()=>callbacks.current.showPreview(null),[]);
 const chooseMode=(mode:Calibration['mode'])=>{setPreviewing(false);setSelected(0);setRatio('');setDraft({mode,points:initialScenePoints(mode),aspect:1,videoAspect:aspect,strength:1});};
 const move=(index:number,x:number,y:number)=>setDraft(v=>({...v,points:v.points.map((p,i)=>i===index?{x:Math.max(0,Math.min(1,x)),y:Math.max(0,Math.min(1,y))}:p)}));
 const handles=!previewing&&el.parentElement?createPortal(<svg className="scene-handles" viewBox={`0 0 1000 ${1000/aspect}`} aria-label="画角補正の基準点" onPointerDown={e=>{if(e.button!==0)return;const node=e.target as Element,raw=node.closest('[data-point]')?.getAttribute('data-point'),index=raw===undefined||raw===null?selected:Number(raw);dragging.current=index;setSelected(index);e.currentTarget.setPointerCapture(e.pointerId);if(raw!==null&&raw!==undefined)return;const b=e.currentTarget.getBoundingClientRect(),r=containRect(el.videoWidth,el.videoHeight,b.width,b.height);move(index,(e.clientX-b.left-r.x)/r.width,(e.clientY-b.top-r.y)/r.height);}} onPointerMove={e=>{if(dragging.current===null)return;const b=e.currentTarget.getBoundingClientRect(),r=containRect(el.videoWidth,el.videoHeight,b.width,b.height);move(dragging.current,(e.clientX-b.left-r.x)/r.width,(e.clientY-b.top-r.y)/r.height);}} onPointerUp={e=>{dragging.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}} onPointerCancel={()=>{dragging.current=null;}}>
  <polyline points={draft.points.map(p=>`${p.x*1000},${p.y*1000/aspect}`).concat(draft.mode==='rectangle'?[`${draft.points[0].x*1000},${draft.points[0].y*1000/aspect}`]:[]).join(' ')} fill={draft.mode==='rectangle'?'#cdfa690c':'none'} stroke="#cdfa69" strokeWidth="4"/>
  {draft.points.map((p,i)=><g key={i} data-point={i} role="button" tabIndex={0} aria-label={`${i+1}番の基準点。矢印キーで微調整`} onKeyDown={e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const d=e.shiftKey?.01:.002;move(i,p.x+(e.key==='ArrowLeft'?-d:e.key==='ArrowRight'?d:0),p.y+(e.key==='ArrowUp'?-d:e.key==='ArrowDown'?d:0));}}><circle cx={p.x*1000} cy={p.y*1000/aspect} r="55" fill="transparent"/><circle cx={p.x*1000} cy={p.y*1000/aspect} r="24" fill={i===selected?'#cdfa69':'#142030'} stroke="#cdfa69" strokeWidth="3"/><text x={p.x*1000} y={p.y*1000/aspect+11} textAnchor="middle" fontSize="33" fill={i===selected?'#15220b':'#fff'}>{i+1}</text></g>)}
 </svg>,el.parentElement):null;
 return <div className="scene-editor">{handles}<div className="scene-methods"><button className="button mini" aria-pressed={draft.mode==='level'} onClick={()=>chooseMode('level')}>水平線2点</button><button className="button mini" aria-pressed={draft.mode==='rectangle'} onClick={()=>chooseMode('rectangle')}>壁の四隅</button></div>
  <p className="config-hint">{draft.mode==='level'?'水平線の左端①→右端②。足先や床線は除外。':'実物の長方形の四隅を①左上→②右上→③右下→④左下。人体・床面は除外。'}</p>
  {draft.mode==='rectangle'&&<label className="scene-ratio">実物の横÷縦<input aria-label="基準の長方形の実物の横幅を高さで割った値" type="number" inputMode="decimal" min=".2" max="5" step=".01" value={ratio} placeholder="例 0.5" onChange={e=>{setRatio(e.target.value);setPreviewing(false);}}/><button className="button mini" onClick={()=>{setRatio('1');setPreviewing(false);}}>正方形</button></label>}
 <label className="scene-strength">補正の強さ <span>{Math.round(draft.strength*100)}%</span></label><Slider aria-label="画角補正の強さ" min={0} max={1} step={.05} value={[draft.strength]} onValueChange={v=>setDraft(s=>({...s,strength:Array.isArray(v)?v[0]:v}))}/>
 <div className="scene-actions"><button className="button" disabled={!previewing&&!!error} onClick={()=>setPreviewing(v=>!v)}>{previewing?'元映像で点を調整':'補正を試す'}</button><button className="button primary" disabled={!previewing||!!error} onClick={()=>{save(settings);}}>採用して保存</button><button className="button mini" disabled={!saved} onClick={()=>{setPreviewing(false);save(null);}}>補正を解除</button></div>
  <p className="config-hint" role="status">{error|| (previewing?adopted?'採用済み。練習画面で使用中。':'補正後を表示中。保存すると反映。':'元映像。点を動かして補正を試してください。')}</p>
  <details><summary>採用後の位置合わせ</summary><p className="config-hint">採用・解除で位置・倍率・回転・遠近をリセット。必要なら自動補正か手動調整を行います。</p></details>
 </div>;
}
