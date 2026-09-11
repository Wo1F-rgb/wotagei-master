import {publicAsset} from './public-assets';
import {displayPose,perspectivePose,transformPose,type Point,type Size,type PoseAlignment} from './pose-geometry';
import {fitPoseSequence,samplingPlan,selectSubject,subjectFromPose,visiblePose,type PosePair,type Subject} from './pose-registration';
import {projectPoint,sceneMatrix,type SceneCalibration} from './scene-calibration';
import {motionSamplingPlan,type MotionAnalysis,type MotionSample} from './motion-alignment';

const aborted=()=>new DOMException('解析を中止しました。','AbortError');
function check(signal:AbortSignal){if(signal.aborted)throw aborted();}
export type AnalysisSource={url:string;time:number;mirror:boolean;scene:SceneCalibration|null};
export type SubjectPreview={image:string;poses:Point[][];width:number;height:number};
export type SequenceOptions={sources:[AnalysisSource,AnalysisSource];origins:number[];bpm:number[];stage:Size;alignment:PoseAlignment;master?:0|1;masterAlignment?:PoseAlignment;motion?:boolean};

export function createPoseWorker(signal:AbortSignal){
 if(typeof Worker==='undefined'||typeof OffscreenCanvas==='undefined'||typeof createImageBitmap==='undefined')throw new Error('このブラウザでは複数場面の解析を使えません。「今の1コマで合わせる」を使ってください。');
 const worker=new Worker(new URL('./pose.worker.ts',import.meta.url));
 let pending:{resolve:(value:Point[][])=>void;reject:(e:Error)=>void}|null=null,timer:ReturnType<typeof setTimeout>|undefined,closed=false;
 const dispose=()=>{if(closed)return;closed=true;clearTimeout(timer);worker.terminate();pending?.reject(aborted());pending=null;signal.removeEventListener('abort',dispose);};
 const fail=(e:Error)=>{clearTimeout(timer);pending?.reject(e);pending=null;dispose();};
 const request=(data:unknown,transfer:Transferable[]=[],timeout=15000)=>new Promise<Point[][]>((resolve,reject)=>{
  if(closed||signal.aborted){for(const value of transfer)if('close' in value)(value as ImageBitmap).close();reject(aborted());return;}
  if(pending){reject(new Error('骨格解析が実行中です。'));return;}
  pending={resolve,reject};timer=setTimeout(()=>fail(new Error('骨格解析に時間がかかっています。もう一度試してください。')),timeout);
  try{worker.postMessage(data,transfer);}catch(e){for(const value of transfer)if('close' in value)(value as ImageBitmap).close();fail(e instanceof Error?e:new Error('解析を開始できませんでした。'));}
 });
 worker.onerror=()=>fail(new Error('骨格解析を起動できませんでした。ページを再読み込みしてください。'));
 worker.onmessage=e=>{if(e.data.type==='error'){fail(new Error(e.data.message));return;}if(e.data.type==='ready'||e.data.type==='poses'){clearTimeout(timer);const current=pending;pending=null;current?.resolve(e.data.poses||[]);}};
 signal.addEventListener('abort',dispose,{once:true});
 const ready=request({type:'init',wasm:new URL(publicAsset('pose/wasm'),document.baseURI).href,model:new URL(publicAsset('pose/pose_landmarker_lite.task'),document.baseURI).href},[],60000);
 return {ready,dispose,detect:(frame:ImageBitmap)=>request({type:'frame',frame},[frame])};
}

export function videoReader(url:string,signal:AbortSignal){
 const video=document.createElement('video');video.muted=true;video.playsInline=true;video.preload='auto';video.setAttribute('aria-hidden','true');video.style.cssText='position:fixed;width:1px;height:1px;left:-20px;top:0;opacity:0;pointer-events:none';document.body.appendChild(video);
 let disposed=false;
 const wait=(ready:()=>boolean,action:()=>void)=>new Promise<void>((resolve,reject)=>{
  let timer:ReturnType<typeof setTimeout>;const events=['loadedmetadata','loadeddata','canplay','seeked'];
  const cleanup=()=>{clearTimeout(timer);events.forEach(e=>video.removeEventListener(e,update));video.removeEventListener('error',error);signal.removeEventListener('abort',cancel);};
  const update=()=>{if(ready()){cleanup();resolve();}};const error=()=>{cleanup();reject(new Error('動画を読み取れませんでした。MP4の動画で試してください。'));};const cancel=()=>{cleanup();reject(aborted());};
  events.forEach(e=>video.addEventListener(e,update));video.addEventListener('error',error);signal.addEventListener('abort',cancel,{once:true});timer=setTimeout(error,15000);
  if(signal.aborted){cancel();return;}try{action();update();}catch(e){cleanup();reject(e);}
 });
 const ready=wait(()=>video.readyState>=2&&video.videoWidth>0,()=>{video.src=url;video.load();});
 const dispose=()=>{if(disposed)return;disposed=true;video.pause();video.removeAttribute('src');video.load();video.remove();signal.removeEventListener('abort',dispose);};signal.addEventListener('abort',dispose,{once:true});
 return {ready,dispose,video,async capture(time:number,preview=false){
  check(signal);await wait(()=>!video.seeking&&video.readyState>=2,()=>{if(Math.abs(video.currentTime-time)>.0001)video.currentTime=time;});check(signal);
  const canvas=document.createElement('canvas'),ratio=Math.min(1,640/Math.max(video.videoWidth,video.videoHeight));canvas.width=Math.max(1,Math.round(video.videoWidth*ratio));canvas.height=Math.max(1,Math.round(video.videoHeight*ratio));
  try{const context=canvas.getContext('2d');if(!context)throw new Error('動画の画像を取得できません。');context.drawImage(video,0,0,canvas.width,canvas.height);const frame=await createImageBitmap(canvas);if(signal.aborted){frame.close();throw aborted();}return {frame,image:preview?canvas.toDataURL('image/jpeg',.8):''};}
  finally{canvas.width=0;canvas.height=0;}
 }};
}

/** Independent muted decoders leave the visible players' positions, rates and sound untouched. */
export async function preparePoseAnalysis(options:SequenceOptions,signal:AbortSignal){
 check(signal);const worker=createPoseWorker(signal),readers=options.sources.map(s=>videoReader(s.url,signal));
 const dispose=()=>{worker.dispose();readers.forEach(r=>r.dispose());};
 try{
  await Promise.all([worker.ready,...readers.map(r=>r.ready)]);check(signal);
  const durations=readers.map(r=>r.video.duration),plan=options.motion?motionSamplingPlan(durations,options.origins,options.bpm):samplingPlan(durations,options.origins,options.bpm,32,options.sources[0].time),previews:SubjectPreview[]=[];
  for(let i=0;i<2;i++){const reader=readers[i],t=Math.max(0,Math.min(options.sources[i].time,durations[i]-.05)),capture=await reader.capture(t,true),poses=(await worker.detect(capture.frame)).map(visiblePose);check(signal);previews.push({image:capture.image,poses:poses.filter(p=>subjectFromPose(p)!==null),width:reader.video.videoWidth,height:reader.video.videoHeight});}
  return {previews,dispose,async analyzeMotion(indices:[number,number],progress:(done:number,total:number,accepted:number)=>void):Promise<MotionAnalysis>{
   try{
    const tracked=indices.map((index,i)=>subjectFromPose(previews[i].poses[index]||[]));if(tracked.some(v=>!v))throw new Error('2本それぞれで対象の人を選んでください。');
    const samples:MotionSample[]=[];let accepted=0;
    for(let k=0;k<plan.length;k++){
     check(signal);const poses:[Point[]|null,Point[]|null]=[null,null];
     for(let i=0;i<2;i++){
      const capture=await readers[i].capture(plan[k][i]),candidates=await worker.detect(capture.frame);check(signal);
      poses[i]=selectSubject(candidates,tracked[i] as Subject);
      if(poses[i])tracked[i]=subjectFromPose(poses[i]!);
     }
     samples.push({time:plan[k][0],poses});if(poses.every(Boolean))accepted++;
     progress(k+1,plan.length,accepted);
    }
    if(accepted<8)throw new Error('同じ人を追える場面が不足しています。対象人物とBPM・拍の位置を確認してください。');
    return {samples,sizes:previews.map(p=>({width:p.width,height:p.height})) as [Size,Size],anchor:Math.max(plan[0][0],Math.min(plan.at(-1)![0],options.sources[0].time)),step:plan[1][0]-plan[0][0]};
   }finally{dispose();}
  },async analyze(indices:[number,number],progress:(done:number,total:number,accepted:number)=>void){
   try{
    const seeds=indices.map((index,i)=>subjectFromPose(previews[i].poses[index]||[]));if(seeds.some(s=>!s))throw new Error('2本それぞれで対象の人を選んでください。');
    const pairs:PosePair[]=[];const matrices=options.sources.map(s=>sceneMatrix(s.scene));
    for(let k=0;k<plan.length;k++){
     check(signal);const detected:(Point[]|null)[]=[];
     for(let i=0;i<2;i++){const {frame}=await readers[i].capture(plan[k][i]),poses=(await worker.detect(frame)).map(visiblePose);check(signal);detected.push(selectSubject(poses,seeds[i] as Subject));}
     if(detected.every(Boolean)){
      const points=detected.map((p,i)=>displayPose(p!.map(point=>projectPoint(matrices[i],point)),{width:previews[i].width,height:previews[i].height},options.stage,options.sources[i].mirror));
      const master=options.master??0;const fixed=options.masterAlignment?transformPose(points[master],options.masterAlignment,options.stage):points[master];
      pairs.push({reference:fixed,self:perspectivePose(points[1-master],options.alignment,options.stage)});
     }
     progress(k+1,plan.length,pairs.length);
    }
    const result=fitPoseSequence(pairs,options.stage,options.alignment.rotation,options.alignment.scale);
    return {...result,sampled:plan.length};
   }finally{dispose();}
  }};
 }catch(e){dispose();throw e;}
}
export type PoseAnalysisSession=Awaited<ReturnType<typeof preparePoseAnalysis>>;
