'use client';
import {useEffect,useState} from 'react';
import {practiceRateOptions} from '@/lib/practice-rate';
import {nudgeSecondsLabel,type NudgeResult} from '@/lib/manual-timing';

export type TrackControls={master:0|1;rate:number;changeMaster:(n:0|1)=>void;changeRate:(n:number)=>void;canSelf:boolean;disabled:boolean;nudgeDisabled:boolean;nudgeStep:number;nudge:(direction:-1|1)=>NudgeResult;scope:string};
export function TrackToolbar({master,rate,changeMaster,changeRate,canSelf,disabled,nudgeDisabled,nudgeStep,nudge,scope}:TrackControls){
 const [feedback,setFeedback]=useState<{count:number;total:number;direction:-1|1;reason?:string}|null>(null),[flash,setFlash]=useState(false);
 useEffect(()=>{setFeedback(null);setFlash(false);},[master,scope]);
 useEffect(()=>{if(!feedback)return;setFlash(true);const timer=setTimeout(()=>setFlash(false),1200);return()=>clearTimeout(timer);},[feedback]);
 const target=master===0?'自分':'お手本',stepLabel=nudgeSecondsLabel(nudgeStep);
 function move(direction:-1|1){const result=nudge(direction);setFeedback(old=>({count:(old?.count||0)+1,total:Math.round(((old?.total||0)-result.delta)*1e6)/1e6,direction,reason:result.reason}));}
 const total=feedback?`${feedback.total>0?'+':feedback.total<0?'−':'±'}${Math.abs(feedback.total).toFixed(Math.round(feedback.total*1e4)%10===0?3:4)}`:'';
 return <div className="track-toolbar compact-toolbar" data-target={master===0?'self':'reference'}>
  <span>曲</span>
  {([0,1] as const).map(i=><button key={i} className="track-sound" data-source={i} aria-label={`${i===0?'お手本':'自分'}の曲を主役にする`} aria-pressed={master===i} disabled={disabled||(i===1&&!canSelf)} onClick={()=>{if(i!==master)changeMaster(i);}}>{i===0?'お手本':'自分'}</button>)}
  {([-1,1] as const).map(direction=><button key={direction} className="track-nudge" data-fine={stepLabel.length>5} aria-label={`${target}を${stepLabel}秒${direction===-1?'早める':'遅らせる'}`} title={`${target}だけを${stepLabel}秒${direction===-1?'早く':'遅く'}する`} disabled={nudgeDisabled} data-feedback={flash&&feedback?.direction===direction?(feedback.reason?'blocked':'applied'):undefined} onClick={()=>move(direction)}><span key={feedback?.direction===direction?feedback.count:0}>{direction===-1?`←−${stepLabel}`:`+${stepLabel}→`}</span></button>)}
  <select aria-label="練習速度を選ぶ" value={rate} disabled={disabled} onChange={e=>changeRate(Number(e.target.value))}>{practiceRateOptions(rate).map(n=><option key={n} value={n}>×{Number(n.toFixed(4))}</option>)}</select>
  <output className="track-nudge-feedback" data-visible={flash} data-blocked={!!feedback?.reason} aria-live="polite" aria-atomic="true">{feedback?`${feedback.reason||`${target} ${total}秒`} · ${feedback.count}回`:''}</output>
 </div>;
}
