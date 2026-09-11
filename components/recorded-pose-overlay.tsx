'use client';
import {useLayoutEffect,useRef,type RefObject} from 'react';
import {poseAt,type PoseTimeline} from '@/lib/pose-timeline';
import {subscribeVideoFrames} from '@/lib/video-frame-clock';
import {displayPose,poseEdges,transformPose,type PoseAlignment,type Size} from '@/lib/pose-geometry';
import {projectPoint,sceneMatrix,type SceneCalibration} from '@/lib/scene-calibration';

/** Apply precomputed joints directly on the displayed video frame, outside React's render clock. */
export function RecordedPoseOverlay({video,timeline,stage,color,mirror,scene,alignment}:{video:RefObject<HTMLVideoElement|null>;timeline:PoseTimeline;stage:Size;color:string;mirror:boolean;scene:SceneCalibration|null;alignment:PoseAlignment|null}){
 const svg=useRef<SVGSVGElement>(null),missing=useRef<HTMLSpanElement>(null);
 useLayoutEffect(()=>{
  const element=video.current,root=svg.current;if(!element||!root)return;
  const lines=[...root.querySelectorAll('line')],circles=[...root.querySelectorAll('circle')],matrix=sceneMatrix(scene);
  return subscribeVideoFrames(element,time=>{
   const raw=element.seeking?null:poseAt(timeline,time);
   let points=raw?displayPose(raw.map(p=>projectPoint(matrix,p)),timeline.size,stage,mirror):[];
   if(alignment)points=transformPose(points,alignment,stage);
   let count=0;
   const visible=(i:number)=>!!points[i]&&(points[i].visibility??0)>.65&&Number.isFinite(points[i].x+points[i].y);
   lines.forEach((line,i)=>{const [a,b]=poseEdges[i],show=visible(a)&&visible(b);line.style.display=show?'':'none';if(show){count++;for(const [name,value] of Object.entries({x1:points[a].x,y1:points[a].y,x2:points[b].x,y2:points[b].y}))line.setAttribute(name,String(value));}});
   circles.forEach((circle,i)=>{const id=joints[i],show=visible(id);circle.style.display=show?'':'none';if(show){circle.setAttribute('cx',String(points[id].x));circle.setAttribute('cy',String(points[id].y));}});
   root.dataset.poseTime=Number.isFinite(time)?String(time):'';root.dataset.poseVisible=String(count>0);
   if(missing.current)missing.current.hidden=count>0||element.seeking;
  });
 },[video,timeline,stage.width,stage.height,mirror,scene,alignment]);
 return <><svg ref={svg} className="pose-overlay" viewBox={`0 0 ${stage.width} ${stage.height}`} preserveAspectRatio="none" aria-label="事前解析した骨格">{poseEdges.map(([a,b])=><line key={`${a}:${b}`} style={{display:'none'}} stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke"/>)}{joints.map(i=><circle key={i} style={{display:'none'}} r={3} fill={color}/>)}</svg><span ref={missing} hidden className="stage-badge skeleton-status" role="status">骨格を検出できない場面</span></>;
}
const joints=[11,12,13,14,15,16,23,24,25,26,27,28];
