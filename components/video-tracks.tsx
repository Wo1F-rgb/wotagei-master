'use client';
import {useEffect,useRef,useState} from 'react';
import {Slider} from '@/components/ui/slider';
import {timelineShift,trackBounds,trackBeatGrid} from '@/lib/timeline';
import {timeLabel} from '@/lib/rhythm';
import {TrackToolbar,type TrackControls} from '@/components/track-toolbar';
type Props=Omit<TrackControls,'disabled'>&{controlsDisabled:boolean;durations:number[];origins:number[];bpm:number[];known:boolean[];time:number;selfTime:number;playing:boolean;camera:boolean;disabled:boolean;seek:(t:number)=>void;adjust:(i:number,t:number)=>void;pause:()=>void;save:()=>void};
export function VideoTracks({master,rate,changeMaster,changeRate,canSelf,controlsDisabled,nudgeDisabled,nudgeStep,nudge,scope,durations,origins,bpm,known,time,selfTime,playing,camera,disabled,seek,adjust,pause,save}:Props){
 const selected=master===0?1:0,span=8;const [start,setStart]=useState(-2);
 const dragging=useRef<{i:number;x:number;origin:number;pps:number}|null>(null);
 const cursor=time;
 useEffect(()=>{if(!dragging.current)setStart(time-span*.3);},[durations[0],durations[1]]);
 useEffect(()=>{if(!dragging.current&&playing)setStart(cursor-span*.3);},[cursor,playing,span]);
 const effective=bpm.map((n,i)=>known[i]?n:120),refBpm=known[0]?bpm[0]:120;
 const times=[time,selfTime];
 return <div className="video-tracks">
  <TrackToolbar master={master} rate={rate} changeMaster={changeMaster} changeRate={changeRate} canSelf={canSelf} disabled={controlsDisabled} nudgeDisabled={nudgeDisabled} nudge={nudge} nudgeStep={nudgeStep} scope={scope}/>
  {[0,1].map(i=>{const bounds=trackBounds(durations[i],times[i],effective[i],refBpm,cursor),grid=trackBeatGrid(times[i],origins[i],effective[i],refBpm,cursor,start,span),enabled=durations[i]>0&&!(i===1&&camera)&&!disabled;return <div className={`track-row track-${i}`} key={i}>
   <span className="track-name" data-selected={selected===i} title={`1拍目：${origins[i].toFixed(4)}秒`}>{i===0?'お手本':'自分'}<small>{i===1&&camera?'LIVE':timeLabel(origins[i])}</small></span>
   <div className="track-ruler">
    {enabled?<><span className="track-clip" style={{left:`${(bounds.start-start)/span*100}%`,width:`${Math.max(.2,(bounds.end-bounds.start)/span*100)}%`}}/><button className="track-grid-adjust" disabled={i===master||nudgeDisabled} aria-label={i===master?`${i===0?'お手本':'自分'}の拍は主役のため固定`:`${i===0?'お手本':'自分'}の曲に対する拍をずらす`} title="白い拍線をドラッグして調整・自動保存。次の同期再生で合わせます。" role="slider" aria-valuemin={0} aria-valuemax={durations[i]} aria-valuenow={origins[i]} aria-valuetext={`1拍目は${origins[i].toFixed(4)}秒`} onPointerDown={e=>{if(e.button!==0||i===master)return;pause();const width=e.currentTarget.parentElement!.getBoundingClientRect().width;dragging.current={i,x:e.clientX,origin:origins[i],pps:width/span};e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{const d=dragging.current;if(d?.i===i)adjust(i,timelineShift(d.origin,e.clientX-d.x,d.pps,effective[i],refBpm,durations[i]));}} onPointerUp={e=>{dragging.current=null;e.currentTarget.releasePointerCapture(e.pointerId);save();}} onPointerCancel={()=>{dragging.current=null;save();}} onKeyDown={e=>{if(i!==master&&(e.key==='ArrowLeft'||e.key==='ArrowRight')){e.preventDefault();nudge(e.key==='ArrowLeft'?-1:1);}}}/></>:<span className="track-empty">{i===1&&camera?'カメラ · ライブ':'動画を選ぶ'}</span>}
    {grid.ticks.map(t=><span className={'track-tick '+(t.index%8===0?'downbeat':'')} key={t.index} style={{left:`${(t.time-start)/span*100}%`}}>{known[i]?((t.index%8+8)%8)+1:''}</span>)}
    {known[i]&&<span className="track-one" style={{left:`${(grid.one-start)/span*100}%`}}>1</span>}<span className="track-cursor" style={{left:`${(cursor-start)/span*100}%`}}/>
   </div>
  </div>;})}
  <div className="track-seek"><span>{timeLabel(time)}</span><Slider aria-label={camera?"お手本の再生位置":"2つの動画の再生位置"} value={[time]} min={0} max={Math.max(.001,durations[0])} step={.01} disabled={!durations[0]||disabled} onValueChange={v=>{const t=Array.isArray(v)?v[0]:v;seek(t);setStart(t-span*.3);}}/><span>{timeLabel(durations[0])}</span></div>
 </div>;
}
