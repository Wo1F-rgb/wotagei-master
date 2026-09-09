'use client';
import {useEffect,useRef,useState} from 'react';
import {Dialog,DialogContent,DialogDescription,DialogTitle} from '@/components/ui/dialog';
import {preparePoseAnalysis,type SequenceOptions,type PoseAnalysisSession,type SubjectPreview} from '@/lib/pose-analysis';
import {subjectFromPose} from '@/lib/pose-registration';
import {containRect} from '@/lib/background';
import type {PoseAlignment} from '@/lib/pose-geometry';

type Props={options:SequenceOptions;close:()=>void;apply:(alignment:PoseAlignment,frames:number)=>void};
function SubjectPicker({preview,index,mirror,selected,select}:{preview:SubjectPreview;index:number;mirror:boolean;selected:number;select:(value:number)=>void}){
 const box=useRef<HTMLDivElement>(null),[size,setSize]=useState({width:0,height:0});
 useEffect(()=>{const el=box.current;if(!el)return;const observer=new ResizeObserver(()=>setSize({width:el.clientWidth,height:el.clientHeight}));observer.observe(el);return()=>observer.disconnect();},[]);
 const rect=containRect(preview.width,preview.height,size.width,size.height),label=index===0?'お手本':'自分';
 return <div className="subject-preview"><strong>{label}</strong><div ref={box} className="subject-image" style={{aspectRatio:`${preview.width}/${preview.height}`}}><img src={preview.image} alt={`${label}の対象人物を選ぶ画像`} style={{transform:mirror?'scaleX(-1)':undefined}}/>{size.width>0&&preview.poses.map((pose,j)=>{const subject=subjectFromPose(pose)!;return <button key={j} className="subject-target" style={{left:rect.x+Math.max(.04,Math.min(.96,mirror?1-subject.hip.x:subject.hip.x))*rect.width,top:rect.y+Math.max(.07,Math.min(.93,subject.hip.y))*rect.height}} aria-label={`${label}の人物${j+1}`} aria-pressed={selected===j} onClick={()=>select(j)}>{j+1}</button>;})}</div>{!preview.poses.length&&<p>肩と腰が見つかりません。閉じて、体が見える場面に移動してください。</p>}</div>;
}
export function AutoAlignment({options,close,apply}:Props){
 const [previews,setPreviews]=useState<SubjectPreview[]|null>(null),[selection,setSelection]=useState<[number,number]>([-1,-1]),[error,setError]=useState(''),[running,setRunning]=useState(false),[progress,setProgress]=useState({done:0,total:32,accepted:0});
 const session=useRef<PoseAnalysisSession|null>(null),abort=useRef<AbortController|null>(null);
 const callbacks=useRef({close,apply});callbacks.current={close,apply};
 useEffect(()=>{
  const controller=new AbortController();abort.current=controller;
  void preparePoseAnalysis(options,controller.signal).then(value=>{if(controller.signal.aborted){value.dispose();return;}session.current=value;setPreviews(value.previews);setSelection(value.previews.map(p=>p.poses.length?p.poses.map((pose,index)=>({index,height:subjectFromPose(pose)!.height})).sort((a,b)=>b.height-a.height)[0].index:-1) as [number,number]);}).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:'解析を準備できませんでした。');});
  return()=>{controller.abort();session.current?.dispose();session.current=null;};
 },[options]);
 const cancel=()=>{abort.current?.abort();callbacks.current.close();};
 async function run(){
  const current=session.current,signal=abort.current?.signal;if(!current||!signal||running)return;setRunning(true);setError('');
  try{const result=await current.analyze(selection,(done,total,accepted)=>{if(!signal.aborted)setProgress({done,total,accepted});});if(!signal.aborted)callbacks.current.apply(result.alignment,result.frames);}
  catch(e){if(!signal.aborted){setError(e instanceof Error?e.message:'解析できませんでした。');setRunning(false);}}
 }
 return <Dialog open onOpenChange={open=>{if(!open)cancel();}}><DialogContent className="practice-dialog auto-alignment-dialog"><DialogTitle>動画全体で自動サイズ補正</DialogTitle><DialogDescription>{running?'同じ人を確認できる場面から、倍率と位置を計算しています。':'番号をタップして、2本それぞれの対象人物を確認してください。'}</DialogDescription>
  <div className="auto-alignment-body">
   {!previews&&!error&&<p role="status">動画と骨格を準備中… 初回はモデルを読み込みます。</p>}
   {previews&&!running&&<div className="subject-previews">{previews.map((preview,i)=><SubjectPicker key={i} preview={preview} index={i} mirror={options.sources[i].mirror} selected={selection[i]} select={j=>setSelection(v=>i===0?[j,v[1]]:[v[0],j])}/>)}</div>}
   {running&&<div className="pose-progress" role="status"><progress value={progress.done} max={progress.total}/><strong>{progress.done} / {progress.total} 場面</strong><span>対象を確認できた場面：{progress.accepted}</span><p>映像の再生位置は変わりません。</p></div>}
   {error&&<p role="alert" className="pose-error">{error}</p>}
   {!running&&!error&&<p className="config-hint">BPMと拍の位置を先に合わせて使います。仁王立ちは不要です。動画全体の32場面を端末内で解析し、傾き・遠近は現在の設定を維持します。</p>}
  </div>
  <div className="auto-alignment-actions"><button className="button" onClick={cancel}>{running?'解析を中止':'閉じる'}</button><button className="button primary" disabled={running||!!error||!previews||selection.some(i=>i<0)} onClick={()=>void run()}>この2人で解析</button></div>
 </DialogContent></Dialog>;
}
