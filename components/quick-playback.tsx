'use client';
import {useEffect,useState} from 'react';
import {ArrowLeft,ArrowRight,Minus,Plus} from 'lucide-react';
import type {NudgeResult} from '@/lib/manual-timing';

type Props={master:0|1;rate:number;changeMaster:(n:0|1)=>void;changeRate:(n:number)=>void;canSelf:boolean;disabled:boolean;nudgeDisabled:boolean;nudge:(direction:-1|1)=>NudgeResult;scope:string};
export function QuickPlayback({master,rate,changeMaster,changeRate,canSelf,disabled,nudgeDisabled,nudge,scope}:Props){
 const [text,setText]=useState(String(Number(rate.toFixed(4))));
 const [feedback,setFeedback]=useState<{count:number;total:number;direction:-1|1;reason?:string}|null>(null),[flash,setFlash]=useState(false);
 useEffect(()=>setText(String(Number(rate.toFixed(4)))),[rate]);
 useEffect(()=>{setFeedback(null);setFlash(false);},[master,scope]);
 useEffect(()=>{if(!feedback)return;setFlash(true);const timer=setTimeout(()=>setFlash(false),600);return()=>clearTimeout(timer);},[feedback]);
 const target=master===0?'自分':'お手本';
 function commit(){const value=Number(text);if(text.trim()&&Number.isFinite(value)){const next=Math.max(.25,Math.min(2,value));if(next!==rate)changeRate(next);setText(String(Number(next.toFixed(4))));}else setText(String(Number(rate.toFixed(4))));}
 function move(direction:-1|1){const result=nudge(direction);setFeedback(old=>({count:(old?.count||0)+1,total:Math.round(((old?.total||0)-result.delta)*1000)/1000,direction,reason:result.reason}));}
 const signed=(n:number)=>`${n>0?'+':n<0?'−':'±'}${Math.abs(n).toFixed(3)}`;
 return <>
  <div className="quick-playback">
   <div className="quick-sound" role="group" aria-label="主役の音"><span>主役<br/>の音</span>{([0,1] as const).map(i=><button key={i} aria-label={`${i===0?'お手本':'自分'}の音を主役にする`} aria-pressed={master===i} disabled={disabled||(i===1&&!canSelf)} onClick={()=>{if(i!==master)changeMaster(i);}}>{i===0?'お手本':'自分'}</button>)}</div>
   <div className="quick-rate" role="group" aria-label="主役の曲の倍率"><button aria-label="倍率を0.05下げる" disabled={disabled||rate<=.25} onClick={()=>changeRate(Math.max(.25,Math.round((rate-.05)*1e6)/1e6))}><Minus size={18}/></button><label><input aria-label="主役の曲の倍率" type="number" inputMode="decimal" min={.25} max={2} step="any" value={text} disabled={disabled} onChange={e=>setText(e.target.value)} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/><span>×</span></label><button aria-label="倍率を0.05上げる" disabled={disabled||rate>=2} onClick={()=>changeRate(Math.min(2,Math.round((rate+.05)*1e6)/1e6))}><Plus size={18}/></button></div>
  </div>
  <div className="quick-nudge" data-target={master===0?'self':'reference'}>
   <button aria-label={`${target}を0.005秒早める`} disabled={nudgeDisabled} data-feedback={flash&&feedback?.direction===-1?(feedback.reason?'blocked':'applied'):undefined} onClick={()=>move(-1)}><ArrowLeft key={feedback?.direction===-1?feedback.count:0}/></button>
   <output className={flash?'nudge-feedback active':'nudge-feedback'} aria-live="polite" aria-atomic="true"><strong>{feedback?(feedback.reason||`${target}を${feedback.direction===-1?'早く':'遅く'} · 0.005秒`):`${target}だけをずらす`}</strong><small>{feedback?`${feedback.count}回操作 · 合計 ${signed(feedback.total)}秒`:nudgeDisabled?'2本の動画とBPMを設定':'← 早く　0.005秒ずつ　遅く →'}</small></output>
   <button aria-label={`${target}を0.005秒遅らせる`} disabled={nudgeDisabled} data-feedback={flash&&feedback?.direction===1?(feedback.reason?'blocked':'applied'):undefined} onClick={()=>move(1)}><ArrowRight key={feedback?.direction===1?feedback.count:0}/></button>
  </div>
 </>;
}
