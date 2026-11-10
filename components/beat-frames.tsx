"use client";
import {useEffect,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {ChevronLeft,ChevronRight,Download,ImagePlus,SkipBack,X} from 'lucide-react';
import {createBeatFrameGrid,beatFrameTime} from '@/lib/beat-frames';
import {createBeatFrameCapture} from '@/lib/beat-frame-capture';
import {exportBeatFrames,type BeatFrameProgress} from '@/lib/beat-frame-export';

type Props={source:string;name:string;duration:number;bpm:number;origin:number;known:boolean;remote:boolean;mirror:boolean;stage:HTMLElement|null;seek:(time:number)=>void;configure:()=>void};
type Result={files:File[];zipUrl:string};
export function BeatFrames({source,name,duration,bpm,origin,known,remote,mirror,stage,seek,configure}:Props){
 const grid=useMemo(()=>{if(!known)return null;try{return createBeatFrameGrid({duration,bpm,origin});}catch{return null;}},[duration,bpm,origin,known]);
 const [index,setIndex]=useState(0),[image,setImage]=useState<{url:string;index:number}|null>(null),[previewError,setPreviewError]=useState('');
 const [progress,setProgress]=useState<BeatFrameProgress|null>(null),[result,setResult]=useState<Result|null>(null),[error,setError]=useState(''),[sharing,setSharing]=useState(false);
 const job=useRef<AbortController|null>(null),mounted=useRef(true),seekRef=useRef(seek);seekRef.current=seek;
 const current=grid?Math.min(index,grid.count-1):0,time=grid?beatFrameTime(grid,current):0,busy=progress!==null;
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;job.current?.abort();};},[]);
 useEffect(()=>{return()=>{if(result)URL.revokeObjectURL(result.zipUrl);};},[result]);
 useEffect(()=>{
  if(!grid||!source)return;
  const task=new AbortController();let url='';setPreviewError('');seekRef.current(time);
  if(!remote)void (async()=>{
   const reader=await createBeatFrameCapture(source,{signal:task.signal,mirror});
   try{const blob=await reader.capture(time);if(task.signal.aborted)return;url=URL.createObjectURL(blob);setImage({url,index:current});}finally{reader.dispose();}
  })().catch(e=>{if(!task.signal.aborted)setPreviewError(e instanceof Error?e.message:'画像を読み取れませんでした。');});
  return()=>{task.abort();if(url)URL.revokeObjectURL(url);};
 },[grid,source,remote,mirror,current,time]);
 function move(next:number){if(!grid||busy||sharing)return;setIndex(Math.max(0,Math.min(grid.count-1,next)));}
 async function generate(){
  if(!grid||remote||job.current)return;
  const task=new AbortController();job.current=task;setError('');setResult(null);setProgress({done:0,total:grid.count,bytes:0});
  try{const output=await exportBeatFrames({source,grid,mirror,signal:task.signal,prefix:'wotagei',onProgress:p=>{if(mounted.current&&!task.signal.aborted)setProgress(p);}});
   if(!mounted.current||task.signal.aborted)return;setResult({files:output.files,zipUrl:URL.createObjectURL(output.zip)});
  }catch(e){if(mounted.current&&!task.signal.aborted)setError(e instanceof Error?e.message:'画像を作成できませんでした。');}
  finally{if(job.current===task){job.current=null;if(mounted.current)setProgress(null);}}
 }
 function cancel(){job.current?.abort();job.current=null;setProgress(null);setError('書き出しを中止しました。');}
 let shareable=false;try{shareable=!!result&&!!navigator.share&&!!navigator.canShare?.({files:result.files});}catch{}
 async function savePhotos(){
  if(!result||sharing)return;setSharing(true);setError('');
  try{await navigator.share({files:result.files});}
  catch(e){if(mounted.current&&!(e instanceof Error&&e.name==='AbortError'))setError('写真の保存メニューを開けませんでした。もう一度押すか、ZIPで保存してください。');}
  finally{if(mounted.current)setSharing(false);}
 }
 if(!grid)return <div className="beat-frames-empty"><p>{known?'1拍目を動画の範囲内に設定してください。':'今の動画のBPM・1拍目を設定してください。'}</p><button className="button primary" onClick={configure}>拍の設定へ</button></div>;
 return <section className="beat-frames" aria-label="拍の白線に沿ってコマ送り" data-frame-index={current} data-frame-time={time} data-frame-count={grid.count} onKeyDown={e=>{if((e.key==='ArrowLeft'||e.key==='ArrowRight')&&!(e.target instanceof HTMLInputElement)){e.preventDefault();move(current+(e.key==='ArrowLeft'?-1:1));}}}>
  {!remote&&stage&&createPortal(<div className="beat-frame-still" aria-busy={!image||image.index!==current}>
   {image?.index===current&&!previewError?<img src={image.url} alt={`${name}の${current+1}拍目の画像`} draggable={false}/>:<p role="status">{previewError||'画像を準備中…'}</p>}
   <span>{current+1}拍目 · {time.toFixed(3)}秒</span>
  </div>,stage)}
  <div className="beat-frame-navigation"><button className="button" aria-label="前の拍へ" disabled={current===0||busy||sharing} onClick={()=>move(current-1)}><ChevronLeft/></button><div aria-live="polite"><strong>{current+1}<small> / {grid.count}枚</small></strong><span>{time.toFixed(3)}秒 · {Math.floor(current/4)+1}小節 / {Math.floor(current/32)+1}技</span></div><button className="button" aria-label="次の拍へ" disabled={current===grid.count-1||busy||sharing} onClick={()=>move(current+1)}><ChevronRight/></button></div>
  {!result&&!busy&&<div className="beat-frame-ruler" aria-label="設定済みの拍線">{Array.from({length:9},(_,n)=>current+n-4).map(n=><button key={n} className={n===current?'current':''} disabled={n<0||n>=grid.count||busy||sharing} onClick={()=>move(n)} aria-label={`${n+1}拍目へ`}>{n>=0&&n<grid.count?(n%8)+1:''}</button>)}</div>}
  {!result&&!busy&&<input className="beat-frame-range" type="range" aria-label="表示する拍" min={0} max={grid.count-1} step={1} value={current} disabled={busy||sharing} onChange={e=>move(Number(e.target.value))}/>}
  {!result&&<div className="beat-frame-actions"><button className="button" disabled={current===0||busy||sharing} onClick={()=>move(0)}><SkipBack size={16}/>1拍目</button><button className="button primary" disabled={remote||busy||sharing} onClick={()=>void generate()}><Download size={16}/>エクスポート</button></div>}
  {!result&&(remote?<p className="beat-frame-note">YouTubeの埋め込みは画像保存に未対応。保存には動画ファイルを選択。</p>:<p className="beat-frame-note">今の拍線で、1拍目から全{grid.count}枚の写真。</p>)}
  {progress&&<div className="beat-frame-progress" role="status"><progress max={progress.total} value={progress.done}/><span>{progress.done} / {progress.total}枚</span><button className="button" onClick={cancel}><X size={15}/>中止</button></div>}
  {result&&<div className="beat-frame-save"><strong>{result.files.length}枚の写真を用意しました</strong>{shareable&&<><button className="button primary" disabled={sharing} onClick={()=>void savePhotos()}><ImagePlus size={16}/>写真に保存</button><small>共有メニューの「画像を保存」から保存。</small></>}<a className="button" href={result.zipUrl} download="wotagei-beat-photos.zip"><Download size={16}/>全画像をZIPで保存</a><button className="beat-frame-reset" onClick={()=>setResult(null)} disabled={sharing}>コマ送りに戻る</button></div>}
  {error&&<p className="warning" role="status">{error}</p>}
 </section>;
}
