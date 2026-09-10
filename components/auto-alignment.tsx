'use client';
import {useEffect,useRef,useState} from 'react';
import {Dialog,DialogContent,DialogDescription,DialogTitle} from '@/components/ui/dialog';
import {preparePoseAnalysis,type SequenceOptions,type PoseAnalysisSession,type SubjectPreview} from '@/lib/pose-analysis';
import {subjectFromPose} from '@/lib/pose-registration';
import {containRect} from '@/lib/background';
import type {PoseAlignment} from '@/lib/pose-geometry';
import type {MotionAnalysis} from '@/lib/motion-alignment';

type Props={options:SequenceOptions;close:()=>void;apply:(alignment:PoseAlignment,summary:string)=>void;applyMotion?:(data:MotionAnalysis)=>void};
function SubjectPicker({preview,index,mirror,selected,select}:{preview:SubjectPreview;index:number;mirror:boolean;selected:number;select:(value:number)=>void}){
 const box=useRef<HTMLDivElement>(null),[size,setSize]=useState({width:0,height:0});
 useEffect(()=>{const el=box.current;if(!el)return;const observer=new ResizeObserver(()=>setSize({width:el.clientWidth,height:el.clientHeight}));observer.observe(el);return()=>observer.disconnect();},[]);
 const rect=containRect(preview.width,preview.height,size.width,size.height),label=index===0?'お手本':'自分';
 return <div className="subject-preview"><strong>{label}</strong><div ref={box} className="subject-image" style={{aspectRatio:`${preview.width}/${preview.height}`}}><img src={preview.image} alt={`${label}の対象人物を選ぶ画像`} style={{transform:mirror?'scaleX(-1)':undefined}}/>{size.width>0&&preview.poses.map((pose,j)=>{const subject=subjectFromPose(pose)!;return <button key={j} className="subject-target" style={{left:rect.x+Math.max(.04,Math.min(.96,mirror?1-subject.hip.x:subject.hip.x))*rect.width,top:rect.y+Math.max(.07,Math.min(.93,subject.hip.y))*rect.height}} aria-label={`${label}の人物${j+1}`} aria-pressed={selected===j} onClick={()=>select(j)}>{j+1}</button>;})}</div>{!preview.poses.length&&<p>人物を確認できません。閉じて、肩か腰が見える場面に移動してください。</p>}</div>;
}
export function AutoAlignment({options,close,apply,applyMotion}:Props){
 const [previews,setPreviews]=useState<SubjectPreview[]|null>(null),[selection,setSelection]=useState<[number,number]>([-1,-1]),[error,setError]=useState(''),[running,setRunning]=useState(false),[progress,setProgress]=useState({done:0,total:32,accepted:0});
 const [attempt,setAttempt]=useState(0);
 const session=useRef<PoseAnalysisSession|null>(null),abort=useRef<AbortController|null>(null);
 const callbacks=useRef({close,apply,applyMotion});callbacks.current={close,apply,applyMotion};
 useEffect(()=>{
  const controller=new AbortController();abort.current=controller;setPreviews(null);setSelection([-1,-1]);setError('');setRunning(false);setProgress({done:0,total:32,accepted:0});
  void preparePoseAnalysis(options,controller.signal).then(value=>{if(controller.signal.aborted){value.dispose();return;}session.current=value;setPreviews(value.previews);setSelection(value.previews.map(p=>p.poses.length?p.poses.map((pose,index)=>({index,height:subjectFromPose(pose)!.height})).sort((a,b)=>b.height-a.height)[0].index:-1) as [number,number]);}).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:'解析を準備できませんでした。');});
  return()=>{controller.abort();session.current?.dispose();session.current=null;};
 },[options,attempt]);
 const cancel=()=>{abort.current?.abort();callbacks.current.close();};
 async function run(){
  const current=session.current,signal=abort.current?.signal;if(!current||!signal||running)return;setRunning(true);setError('');
  try{
   const progress=(done:number,total:number,accepted:number)=>{if(!signal.aborted)setProgress({done,total,accepted});};
   if(options.motion){const result=await current.analyzeMotion(selection,progress);if(!signal.aborted)callbacks.current.applyMotion?.(result);}
   else{const result=await current.analyze(selection,progress);if(!signal.aborted){
    const summary=`確認できた ${result.frames} / ${result.sampled} 場面${result.limited?'の見える部分':''}で${result.positionOnly?'位置を合わせました。倍率は維持しています。':'倍率と位置を合わせました。'} 傾き・遠近は維持しています。${result.limited||result.frames<result.sampled?'重ねて確認し、必要なら手動で微調整してください。':'同期再生で確認できます。'}`;
    callbacks.current.apply(result.alignment,summary);
   }}
  }
  catch(e){if(!signal.aborted){setError(e instanceof Error?e.message:'解析できませんでした。');setRunning(false);}}
 }
 return <Dialog open onOpenChange={open=>{if(!open)cancel();}}><DialogContent className="practice-dialog auto-alignment-dialog"><DialogTitle>{options.motion?'手持ち動画の追従を解析':'動画全体で自動サイズ補正'}</DialogTitle><DialogDescription>{running?'同じ人を確認できる場面から、倍率と位置を計算しています。':'番号をタップして、2本それぞれの対象人物を確認してください。'}</DialogDescription>
  <div className="auto-alignment-body">
   {!previews&&!error&&<p role="status">動画と骨格を準備中… 初回はモデルを読み込みます。</p>}
   {previews&&!running&&<div className="subject-previews">{previews.map((preview,i)=><SubjectPicker key={i} preview={preview} index={i} mirror={options.sources[i].mirror} selected={selection[i]} select={j=>setSelection(v=>i===0?[j,v[1]]:[v[0],j])}/>)}</div>}
   {running&&<div className="pose-progress" role="status"><progress value={progress.done} max={progress.total}/><strong>{progress.done} / {progress.total} 場面</strong><span>対象を確認できた場面：{progress.accepted}</span><p>映像の再生位置は変わりません。</p></div>}
   {error&&<p role="alert" className="pose-error">{error}</p>}
   {!running&&!error&&<p className="config-hint">{options.motion?'先にBPM・拍と基本の位置を合わせて使います。同じ拍の場面を細かく解析し、三脚OFF側の左右・上下・倍率の変化を滑らかに補正します。長い動画は解析に時間がかかります。':'先にBPMと拍を合わせてください。32場面のうち、人物と共通の体の部分が見える場面だけを使います。全身・仁王立ちは不要です。倍率を判断できないときは位置だけ合わせ、傾き・遠近は維持します。'}</p>}
  </div>
  <div className="auto-alignment-actions"><button className="button" onClick={cancel}>{running?'解析を中止':'閉じる'}</button><button className="button primary" disabled={running||(!error&&(!previews||selection.some(i=>i<0)))} onClick={()=>error?setAttempt(v=>v+1):void run()}>{error?'読み直して選び直す':'この2人で解析'}</button></div>
 </DialogContent></Dialog>;
}
