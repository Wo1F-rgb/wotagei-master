'use client';
import {useEffect,useRef,useState} from 'react';
import {Slider} from '@/components/ui/slider';
import {timelineShift,trackBounds} from '@/lib/timeline';
import {timeLabel} from '@/lib/rhythm';
type Props={master:0|1;durations:number[];origins:number[];bpm:number[];known:boolean[];time:number;playing:boolean;camera:boolean;disabled:boolean;seek:(t:number)=>void;adjust:(i:number,t:number)=>void;pause:()=>void;save:()=>void};
export function VideoTracks({master,durations,origins,bpm,known,time,playing,camera,disabled,seek,adjust,pause,save}:Props){
 const selected=master===0?1:0;const [span,setSpan]=useState(8),[start,setStart]=useState(-2);
 const dragging=useRef<{i:number;x:number;origin:number;pps:number}|null>(null);
 const cursor=time-origins[0];
 useEffect(()=>{if(!dragging.current)setStart(time-origins[0]-span*.3);},[durations[0],durations[1]]);
 useEffect(()=>{if(!dragging.current&&playing)setStart(cursor-span*.3);},[cursor,playing,span]);
 const effective=bpm.map((n,i)=>known[i]?n:120),refBpm=known[0]?bpm[0]:120;
 const ticks=Array.from({length:Math.ceil(span*refBpm/60)+2},(_,i)=>(Math.floor(start*refBpm/60)+i)*60/refBpm).filter(t=>t>=start&&t<=start+span);
 return <div className="video-tracks">
  <div className="track-toolbar follower-toolbar"><span>{selected===0?'お手本':'自分'}だけをドラッグ · 主役は固定</span><button onClick={()=>{const n=span===8?2:span===2?16:8;setSpan(n);setStart(cursor-n*.3);}} aria-label="トラックの表示範囲を切り替え">{span}秒幅</button><button disabled={disabled||!durations.some(n=>n>0)} onClick={save}>保存</button></div>
  {[0,1].map(i=>{const bounds=trackBounds(durations[i],origins[i],effective[i],refBpm,0),enabled=durations[i]>0&&!(i===1&&camera)&&!disabled;return <div className={`track-row track-${i}`} key={i}>
   <span className="track-name">{i===0?'お手本':'自分'}<small>{i===master?'主役':i===1&&camera?'LIVE':timeLabel(origins[i])}</small></span>
   <div className="track-ruler">
    {ticks.map(t=><span className={'track-tick '+(Math.round(t*refBpm/60)%8===0?'downbeat':'')} key={t} style={{left:`${(t-start)/span*100}%`}}>{known[0]?((Math.round(t*refBpm/60)%8+8)%8)+1:''}</span>)}
    {enabled?<button className="track-clip" disabled={i===master} style={{left:`${(bounds.start-start)/span*100}%`,width:`${Math.max(.2,(bounds.end-bounds.start)/span*100)}%`}} aria-label={i===master?`${i===0?'お手本':'自分'}は主役のため固定`:`${i===0?'お手本':'自分'}のトラックを左右にずらす`} role="slider" aria-valuemin={0} aria-valuemax={durations[i]} aria-valuenow={origins[i]} aria-valuetext={`最初の1は${origins[i].toFixed(3)}秒`} onPointerDown={e=>{if(e.button!==0||i===master)return;pause();const width=e.currentTarget.parentElement!.getBoundingClientRect().width;dragging.current={i,x:e.clientX,origin:origins[i],pps:width/span};e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{const d=dragging.current;if(d?.i===i)adjust(i,timelineShift(d.origin,e.clientX-d.x,d.pps,effective[i],refBpm,durations[i]));}} onPointerUp={e=>{dragging.current=null;e.currentTarget.releasePointerCapture(e.pointerId);}} onPointerCancel={()=>{dragging.current=null;}} onKeyDown={e=>{if(i!==master&&(e.key==='ArrowLeft'||e.key==='ArrowRight')){e.preventDefault();adjust(i,Math.max(0,Math.min(durations[i],origins[i]+(e.key==='ArrowLeft'?.005:-.005))));}}}><span>{i===0?'お手本':'自分'} {known[i]?`${bpm[i]} BPM`:'BPM未設定'}</span></button>:<span className="track-empty">{i===1&&camera?'インカメは移動できません':'動画を選ぶ'}</span>}
    <span className="track-one" style={{left:`${-start/span*100}%`}}>1</span><span className="track-cursor" style={{left:`${(cursor-start)/span*100}%`}}/>
   </div>
  </div>;})}
  <div className="track-seek"><span>{timeLabel(time)}</span><Slider aria-label="2つの動画の再生位置" value={[time]} min={0} max={Math.max(.001,durations[0])} step={.01} disabled={!durations[0]||disabled} onValueChange={v=>{const t=Array.isArray(v)?v[0]:v;seek(t);setStart(t-origins[0]-span*.3);}}/><span>{timeLabel(durations[0])}</span></div>
 </div>;
}
