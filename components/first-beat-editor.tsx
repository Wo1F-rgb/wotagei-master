'use client';
import {useState} from 'react';
type Props={origins:number[];bpm:number[];durations:number[];playing:boolean;preparing:boolean;seek:(index:number,time:number)=>void;pause:()=>void;preview:(origins:number[],lead?:number)=>void;save:(origins:number[])=>void;close:()=>void};
export function FirstBeatEditor({origins,bpm,durations,playing,preparing,seek,pause,preview,save,close}:Props){
 const [draft,setDraft]=useState([...origins]),[text,setText]=useState(origins.map(String));
 function move(index:number,time:number){if(!Number.isFinite(time)){setText(v=>v.map((n,i)=>i===index?String(draft[i]):n));return;}const value=Math.round(Math.max(0,Math.min(durations[index]-.001,time))*1000)/1000;setDraft(v=>v.map((n,i)=>i===index?value:n));setText(v=>v.map((n,i)=>i===index?String(value):n));seek(index,value);}
 return <section className="alignment-editor first-beat-editor" aria-label="1拍目を合わせる">
  <header><strong>1拍目を合わせる</strong><button className="button mini" onClick={()=>{pause();close();}}>閉じる</button></header>
  <div className="first-beat-body"><p>両方の映像を、同じ「1」の瞬間に合わせます。各行のボタンで、その動画だけを前後できます。</p>
   {[0,1].map(i=>{const label=i===0?'お手本':'自分';return <div className={'first-beat-row first-beat-'+i} key={i}><label><strong>{label}</strong><input type="number" aria-label={`${label}の1拍目（秒）`} min={0} max={durations[i]-.001} step={.01} value={text[i]} onChange={e=>setText(v=>v.map((n,j)=>i===j?e.target.value:n))} onBlur={()=>move(i,text[i].trim()?Number(text[i]):NaN)} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/><span>秒</span></label><div>{[-1,1].map(n=><button key={n} className="button" aria-label={`${label}の1拍目を1拍${n<0?'前':'後'}へ`} onClick={()=>move(i,draft[i]+n*60/bpm[i])}>1拍{n<0?'前':'後'}</button>)}{[-.02,.02].map(n=><button key={n} className="button" aria-label={`${label}の1拍目を0.02秒${n<0?'前':'後'}へ`} onClick={()=>move(i,draft[i]+n)}>{n<0?'−':'＋'}0.02秒</button>)}</div></div>;})}
   <button className="button" onClick={()=>playing||preparing?pause():preview(draft,2)}>{preparing?'開始を中止':playing?'確認を止める':'2拍前から拍音で確認'}</button>
  </div>
  <footer className="first-beat-actions"><button className="button" onClick={()=>preview(draft,0)}>1拍目から再生</button><button className="button primary" onClick={()=>save(draft)}>この2点を保存</button></footer>
 </section>;
}
