'use client';
import {useEffect,useRef,useState} from 'react';
import {analyzeRecordedPoses} from './recorded-pose-analysis';
import {subjectFromPose,type Subject} from './pose-registration';
import type {Point} from './pose-geometry';
import type {PoseTimeline} from './pose-timeline';

export type RecordedPoseState={key:string;status:'idle'|'loading'|'ready'|'error';done:number;total:number;timeline?:PoseTimeline;message?:string};
const idle=(key=''):RecordedPoseState=>({key,status:'idle',done:0,total:0});

/** One analysis at a time; completed source-time data survives seeks, speed and view changes. */
export function useRecordedPoses(urls:readonly (string|null)[],enabled:readonly boolean[],suspended:boolean){
 const cache=useRef(new Map<string,RecordedPoseState>()),seeds=useRef(new Map<string,Subject>());
 const [states,setStates]=useState<RecordedPoseState[]>([idle(),idle()]),[revision,setRevision]=useState(0);
 // The same footage may be used in both decks with different selected people.
 const keys=urls.map((url,i)=>url?JSON.stringify([i,url]):'');
 const refresh=()=>setStates(keys.map(key=>cache.current.get(key)||idle(key)));
 useEffect(()=>{
  const controller=new AbortController();let disposed=false;
  for(const key of cache.current.keys())if(!keys.includes(key))cache.current.delete(key);
  for(const key of seeds.current.keys())if(!keys.includes(key))seeds.current.delete(key);
  const publish=(i:number,state:RecordedPoseState)=>{if(disposed)return;cache.current.set(keys[i],state);setStates(keys.map(key=>cache.current.get(key)||idle(key)));};
  // Canceled partial analyses restart explicitly when that video's switch is enabled again.
  for(const [key,state] of cache.current)if(state.status==='loading')cache.current.delete(key);
  refresh();
  if(!suspended)void (async()=>{
   for(let i=0;i<2;i++){
    const key=keys[i];if(disposed||!key||!enabled[i]||cache.current.has(key))continue;
    publish(i,{...idle(key),status:'loading'});
    try{
     const timeline=await analyzeRecordedPoses(urls[i]!,controller.signal,(done,total)=>publish(i,{key,status:'loading',done,total}),seeds.current.get(key));
     publish(i,{key,status:'ready',done:timeline.samples.length,total:timeline.samples.length,timeline});
    }catch(e){if(!disposed)publish(i,{key,status:'error',done:0,total:0,message:e instanceof Error?e.message:'骨格を解析できませんでした。'});}
   }
  })();
  return()=>{disposed=true;controller.abort();};
 },[keys[0],keys[1],enabled[0],enabled[1],suspended,revision]);
 return {
  states:states.map((state,i)=>state.key===keys[i]?state:idle(keys[i])),
  retry:(i:number)=>{cache.current.delete(keys[i]);setRevision(v=>v+1);},
  selectSubjects:(points:readonly (Point[]|null)[])=>{
   points.forEach((p,i)=>{const subject=p&&subjectFromPose(p);if(subject&&keys[i]){seeds.current.set(keys[i],subject);cache.current.delete(keys[i]);}});
   setRevision(v=>v+1);
  },
 };
}
