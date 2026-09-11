import {createPoseWorker,videoReader} from './pose-analysis';
import {selectSubject,subjectFromPose,visiblePose,type Subject} from './pose-registration';
import {poseSamplingPlan,type PoseTimeline} from './pose-timeline';

/** Decode silently in a separate element. No inference is needed during subsequent playback. */
export async function analyzeRecordedPoses(url:string,signal:AbortSignal,progress:(done:number,total:number)=>void,seed?:Subject|null):Promise<PoseTimeline>{
 const reader=videoReader(url,signal);let worker:ReturnType<typeof createPoseWorker>|undefined;
 // If worker construction fails, disposal can also reject the reader's startup promise.
 void reader.ready.catch(()=>{});
 try{
  worker=createPoseWorker(signal);await Promise.all([reader.ready,worker.ready]);
  const duration=reader.video.duration,{times,step}=poseSamplingPlan(duration);
  const result:PoseTimeline={samples:[],size:{width:reader.video.videoWidth,height:reader.video.videoHeight},step,duration};
  let subject=seed||null;progress(0,times.length);
  for(let i=0;i<times.length;i++){
   if(signal.aborted)throw new DOMException('解析を中止しました。','AbortError');
   const {frame}=await reader.capture(times[i]),candidates=(await worker.detect(frame)).map(visiblePose);
   const points=subject?selectSubject(candidates,subject):candidates.filter(p=>subjectFromPose(p)).sort((a,b)=>subjectFromPose(b)!.height-subjectFromPose(a)!.height)[0]||null;
   if(points)subject=subjectFromPose(points);
   result.samples.push({time:times[i],points:points||null});
   if(i%5===0||i===times.length-1)progress(i+1,times.length);
  }
  return result;
 }finally{reader.dispose();worker?.dispose();}
}
