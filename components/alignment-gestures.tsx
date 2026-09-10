import {useEffect,useRef,useState,type PointerEvent} from 'react';
import type {Alignment} from '@/lib/use-studio';
import {gestureAlignment,zoomAlignment,type TouchPoint} from '@/lib/alignment-gesture';

type Props={value:Alignment;change:(a:Alignment)=>void;start:()=>void;target:number;scope:string};
export function AlignmentGestures({value,change,start,target,scope}:Props){
 const element=useRef<HTMLDivElement>(null),current=useRef(value),callbacks=useRef({change,start});current.current=value;callbacks.current={change,start};
 const points=useRef(new Map<number,TouchPoint>()),baseline=useRef<{value:Alignment;points:TouchPoint[]}|null>(null),[active,setActive]=useState(false);
 const cancel=()=>{const ids=[...points.current.keys()];points.current.clear();baseline.current=null;setActive(false);for(const id of ids)if(element.current?.hasPointerCapture(id))element.current.releasePointerCapture(id);};
 useEffect(()=>{cancel();return cancel;},[scope]);
 const rebase=()=>{baseline.current={value:{...current.current},points:[...points.current.values()]};};
 const publish=(a:Alignment)=>{current.current=a;callbacks.current.change(a);};
 const local=(e:PointerEvent)=>{const r=e.currentTarget.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};};
 function down(e:PointerEvent<HTMLDivElement>){if(e.pointerType==='mouse'&&e.button!==0||points.current.size>=2)return;e.preventDefault();if(!points.current.size)callbacks.current.start();points.current.set(e.pointerId,local(e));e.currentTarget.setPointerCapture(e.pointerId);rebase();setActive(true);}
 function move(e:PointerEvent<HTMLDivElement>){if(!points.current.has(e.pointerId)||!baseline.current)return;e.preventDefault();points.current.set(e.pointerId,local(e));const rect=e.currentTarget.getBoundingClientRect();publish(gestureAlignment(baseline.current.value,baseline.current.points,[...points.current.values()],rect));}
 function up(e:PointerEvent<HTMLDivElement>){if(!points.current.delete(e.pointerId))return;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);rebase();setActive(points.current.size>0);}
 useEffect(()=>{const el=element.current;if(!el)return;const wheel=(e:WheelEvent)=>{e.preventDefault();if(points.current.size)return;callbacks.current.start();const r=el.getBoundingClientRect(),delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?r.height:1);const next=zoomAlignment(current.current,{x:e.clientX-r.left,y:e.clientY-r.top},Math.exp(Math.max(-.4,Math.min(.4,-delta*.002))),r);current.current=next;callbacks.current.change(next);};el.addEventListener('wheel',wheel,{passive:false});return()=>el.removeEventListener('wheel',wheel);},[]);
 const label=target===0?'お手本':'自分';
 return <div ref={element} className={'alignment-gestures target-'+target+(active?' active':'')} role="group" aria-label={`${label}を画面で移動・拡大縮小`} tabIndex={0} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up} onKeyDown={e=>{const r=e.currentTarget.getBoundingClientRect(),step=e.shiftKey?5:1,a={...current.current};if(e.key==='ArrowLeft')a.x=Math.max(-100,a.x-step);else if(e.key==='ArrowRight')a.x=Math.min(100,a.x+step);else if(e.key==='ArrowUp')a.y=Math.max(-100,a.y-step);else if(e.key==='ArrowDown')a.y=Math.min(100,a.y+step);else if(['+','=','-'].includes(e.key)){Object.assign(a,zoomAlignment(a,{x:r.width/2,y:r.height/2},e.key==='-'?1/1.05:1.05,r));}else return;e.preventDefault();callbacks.current.start();publish(a);}}>
  <span className="gesture-hint">{label}{active?`を調整 · ${value.scale.toFixed(2)}×`:'をドラッグ／2本指で拡縮'}</span>
 </div>;
}
