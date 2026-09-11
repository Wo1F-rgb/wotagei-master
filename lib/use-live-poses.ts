'use client';
import {useEffect,useRef,useState,type RefObject} from 'react';
import {createPoseWorker} from './pose-analysis';
import {selectSubject,subjectFromPose,visiblePose,type Subject} from './pose-registration';
import type {Point} from './pose-geometry';
export type LivePose={points:Point[];time:number;status:'loading'|'visible'|'missing'|'error';message?:string};
const empty=(status:LivePose['status']='missing'):LivePose=>({points:[],time:NaN,status});
/** One worker, one in-flight frame. Pose display never changes media playback. */
export function useLivePoses(videos:readonly RefObject<HTMLVideoElement|null>[],enabled:readonly boolean[],scope:string){
 const [frames,setFrames]=useState<LivePose[]>([empty(),empty()]);
 const current=useRef(videos);current.current=videos;
 useEffect(()=>{
  const active=[...enabled],controller=new AbortController(),seeds:(Subject|null)[]=[null,null];
  let disposed=false,timer:ReturnType<typeof setTimeout>|undefined,index=0,worker:ReturnType<typeof createPoseWorker>|undefined;
  const last=[NaN,NaN];
  const publish=(i:number,value:LivePose)=>{if(!disposed)setFrames(v=>v.map((p,j)=>i===j?value:p));};
  setFrames(active.map(on=>empty(on?'loading':'missing')));
  if(!active.some(Boolean))return;
  const pump=async()=>{
   if(disposed)return;
   const i=active[index%2]?index%2:1-index%2;index=i+1;
   const video=current.current[i]?.current;
   if(!document.hidden&&video&&video.readyState>=2&&video.videoWidth&&!video.seeking&&video.currentTime!==last[i]){
    const time=video.currentTime,ratio=Math.min(1,640/Math.max(video.videoWidth,video.videoHeight));
    if(!Number.isFinite(last[i])||time<last[i]||time-last[i]>2)seeds[i]=null;
    last[i]=time;
    try{
     const bitmap=await createImageBitmap(video,{resizeWidth:Math.round(video.videoWidth*ratio),resizeHeight:Math.round(video.videoHeight*ratio)});
     if(disposed){bitmap.close();return;}
     const candidates=(await worker!.detect(bitmap)).map(visiblePose);
     if(disposed)return;
     if(video.seeking||Math.abs(video.currentTime-time)>.08+.12*video.playbackRate){publish(i,empty());last[i]=NaN;}
     else{
      const points=seeds[i]?selectSubject(candidates,seeds[i]!):candidates.filter(p=>subjectFromPose(p)).sort((a,b)=>subjectFromPose(b)!.height-subjectFromPose(a)!.height)[0];
      if(points){seeds[i]=subjectFromPose(points);publish(i,{points,time,status:'visible'});}else publish(i,{points:[],time,status:'missing'});
     }
    }catch(e){if(!disposed){publish(i,{...empty('error'),message:e instanceof Error?e.message:'骨格を表示できませんでした。'});active[i]=false;}}
   }else if(video?.seeking)publish(i,empty());
   if(!disposed&&active.some(Boolean))timer=setTimeout(()=>void pump(),active.every(Boolean)?16:33);
  };
  try{worker=createPoseWorker(controller.signal);void worker.ready.then(()=>pump()).catch(e=>{if(!disposed)setFrames(active.map(on=>on?{...empty('error'),message:e.message}:empty()));});}
  catch(e){setFrames(active.map(on=>on?{...empty('error'),message:e instanceof Error?e.message:'骨格を表示できませんでした。'}:empty()));}
  return()=>{disposed=true;clearTimeout(timer);controller.abort();worker?.dispose();};
 },[enabled[0],enabled[1],scope]);
 return frames;
}
