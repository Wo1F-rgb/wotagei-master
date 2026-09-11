import {displayPose,transformPose,type Point,type Size,type PoseAlignment} from './pose-geometry.ts';
import {weightedMedian} from './pose-registration.ts';
import {projectPoint,sceneMatrix,type SceneCalibration} from './scene-calibration.ts';

export type MotionSample={time:number;poses:[Point[]|null,Point[]|null]};
export type MotionAnalysis={samples:MotionSample[];sizes:[Size,Size];anchor:number;step:number};
export type MotionFrame={time:number;x:number;y:number;logScale:number};
export type MotionCurve={frames:MotionFrame[];target:0|1;accepted:number;total:number;maxGap:number};
const limit=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
// Position follow is an offline measurement, so a short symmetric window keeps
// the phase centered while retaining enough high-frequency movement. Keep the
// sampling cadence independent from these response parameters.
const MOTION_SMOOTH_WINDOW=.4;
const MOTION_SMOOTH_SIGMA=.2;
const visible=(p:Point|undefined)=>!!p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&(p.visibility??0)>=.65;
const midpoint=(p:Point[],a:number,b:number)=>({x:(p[a].x+p[b].x)/2,y:(p[a].y+p[b].y)/2});
export const identityMotion=()=>({x:0,y:0,scale:1});
/** A fixed tripod is always an anchor. When both move, keep the chosen spatial master. */
export function motionTarget(tripods:readonly boolean[],master:0|1):0|1|null{
 if(tripods[0]&&tripods[1])return null;
 if(tripods[0])return 1;if(tripods[1])return 0;return master===0?1:0;
}
/** Six measurements per reference second; playback interpolates every displayed frame. */
export function motionSamplingPlan(durations:number[],origins:number[],bpm:number[]):[number,number][]{
 if([durations,origins,bpm].some(a=>a.length!==2)||durations.some(v=>!Number.isFinite(v)||v<=0)||origins.some(v=>!Number.isFinite(v)||v<0)||bpm.some(v=>!Number.isFinite(v)||v<40||v>300))throw new Error('2本のBPMと拍の位置を先に設定してください。');
 const rate=bpm[0]/bpm[1],offset=origins[1]-origins[0]*rate,start=Math.max(0,-offset/rate),end=Math.min(durations[0]-.06,(durations[1]-.06-offset)/rate);
 if(end-start<1)throw new Error('同期して比較できる区間が短すぎます。');
 const intervals=Math.min(1800,Math.ceil((end-start)*6));
 return Array.from({length:intervals+1},(_,i)=>{const t=start+(end-start)*i/intervals;return [t,rate*t+offset];});
}
/** Fit only torso size and body centre: no limb warp, roll, or stance-derived perspective. */
type MotionFit=Omit<MotionFrame,'time'>&{scaleReliable:boolean;unitX:number;unitY:number};
type RawMotionFrame=MotionFrame&{scaleReliable:boolean;unitX:number;unitY:number};
function measureMotionPairDetailed(anchor:Point[],moving:Point[],stage:Size):MotionFit|null{
 if(![11,12,23,24].every(i=>visible(anchor[i])&&visible(moving[i])))return null;
 const ratios:[number,number][]=[],minLength=Math.max(2,Math.min(stage.width,stage.height)*.015);
 const qh=midpoint(anchor,23,24),ph=midpoint(moving,23,24),qs=midpoint(anchor,11,12),ps=midpoint(moving,11,12);
 const q={x:.8*qh.x+.2*qs.x,y:.8*qh.y+.2*qs.y},p={x:.8*ph.x+.2*ps.x,y:.8*ph.y+.2*ps.y};
 // Translation is still useful when the dancer bends or the two takes use different
 // poses. Require a visible torso span, but let scale fall back to the baseline.
 const qSpan=Math.max(Math.hypot(qs.x-qh.x,qs.y-qh.y),Math.hypot(anchor[11].x-anchor[12].x,anchor[11].y-anchor[12].y),Math.hypot(anchor[23].x-anchor[24].x,anchor[23].y-anchor[24].y));
 const pSpan=Math.max(Math.hypot(ps.x-ph.x,ps.y-ph.y),Math.hypot(moving[11].x-moving[12].x,moving[11].y-moving[12].y),Math.hypot(moving[23].x-moving[24].x,moving[23].y-moving[24].y));
 if(Math.min(qSpan,pSpan)<minLength)return null;
 let scaleReliable=true;
 for(const [a,b,weight] of [[11,23,1],[12,24,1],[11,12,.35]]){
  const q={x:anchor[b].x-anchor[a].x,y:anchor[b].y-anchor[a].y},p={x:moving[b].x-moving[a].x,y:moving[b].y-moving[a].y};
  const ql=Math.hypot(q.x,q.y),pl=Math.hypot(p.x,p.y);
  if(Math.min(ql,pl)<minLength){scaleReliable=false;continue;}
  // A different bend/pose is not camera shake. Shoulder direction may flip with mirroring.
  if(b!==12&&(q.x*p.x+q.y*p.y)/(ql*pl)<.7){scaleReliable=false;continue;}
  ratios.push([Math.log(ql/pl),weight]);
 }
 let logScale=0;
 if(scaleReliable&&ratios.length===3){
  logScale=weightedMedian(ratios);
  if(Math.abs(logScale)>Math.log(2.5)||ratios.slice(0,2).some(([v])=>Math.abs(v-logScale)>.18))scaleReliable=false;
 }
 const scale=scaleReliable?Math.exp(logScale):1;
 const torso=Math.max(minLength,Math.hypot(qs.x-qh.x,qs.y-qh.y));
 const error=Math.hypot(qs.x-qh.x-scale*(ps.x-ph.x),qs.y-qh.y-scale*(ps.y-ph.y))/torso;
 if(scaleReliable&&error>.3)scaleReliable=false;
 const unitX=q.x-stage.width/2-(p.x-stage.width/2),unitY=q.y-stage.height/2-(p.y-stage.height/2),translationScale=scaleReliable?scale:1,x=q.x-stage.width/2-translationScale*(p.x-stage.width/2),y=q.y-stage.height/2-translationScale*(p.y-stage.height/2);
 if(!Number.isFinite(x+y)||Math.abs(x)>stage.width||Math.abs(y)>stage.height)return null;
 return {x,y,unitX,unitY,logScale:scaleReliable?logScale:0,scaleReliable};
}
/** Public measurement shape remains the original x/y/scale triplet. */
export function measureMotionPair(anchor:Point[],moving:Point[],stage:Size):Omit<MotionFrame,'time'>|null{
 const fit=measureMotionPairDetailed(anchor,moving,stage);if(!fit)return null;
 return {x:fit.x,y:fit.y,logScale:fit.logScale};
}

type CurveOptions={stage:Size;alignments:readonly PoseAlignment[];mirrors:readonly boolean[];scenes:readonly (SceneCalibration|null)[];target:0|1};
function smoothPosition(neighbors:MotionFrame[],time:number,key:'x'|'y',noiseFloor:number){
 const center=weightedMedian(neighbors.map(v=>[v[key],1])),mad=weightedMedian(neighbors.map(v=>[Math.abs(v[key]-center),1]));
 const accepted=neighbors.filter(v=>Math.abs(v[key]-center)<=Math.max(noiseFloor,3.5*mad));
 let w=0,wt=0,wtt=0,wy=0,wty=0;
 for(const v of accepted){const t=v.time-time,weight=Math.exp(-.5*(t/MOTION_SMOOTH_SIGMA)**2);w+=weight;wt+=weight*t;wtt+=weight*t*t;wy+=weight*v[key];wty+=weight*t*v[key];}
 const determinant=w*wtt-wt*wt,predicted=determinant>1e-8?(wy*wtt-wty*wt)/determinant:wy/w;
 // Local regression compensates for uneven detections without extrapolating beyond nearby motion.
 return limit(predicted,Math.min(...accepted.map(v=>v[key])),Math.max(...accepted.map(v=>v[key])));
}
export function buildMotionCurve(data:MotionAnalysis,options:CurveOptions):MotionCurve{
 const {stage,target}=options;
 if(!Number.isFinite(stage.width+stage.height)||stage.width<=0||stage.height<=0)return {frames:[],target,accepted:0,total:data.samples.length,maxGap:.5};
 const matrices=options.scenes.map(sceneMatrix),measured:RawMotionFrame[]=[];
 for(const sample of data.samples){
  if(!sample.poses.every(Boolean))continue;
  const poses=sample.poses.map((points,i)=>transformPose(displayPose(points!.map(p=>projectPoint(matrices[i],p)),data.sizes[i],stage,options.mirrors[i]),options.alignments[i],stage));
  const fit=measureMotionPairDetailed(poses[1-target],poses[target],stage);if(fit)measured.push({time:sample.time,...fit});
 }
 // One geometrically plausible frame is not enough to infer camera zoom. Require
 // three nearby, mutually consistent scale measurements before allowing scale to
 // influence either zoom or translation; position falls back to unit scale.
 const scaleWindow=Math.max(.45,data.step*3.1),scaleSpread=Math.log(1.18),reliable=measured.filter(v=>v.scaleReliable),scaleEvidence=new Set(measured.filter(frame=>{
  if(!frame.scaleReliable)return false;
  const neighbors=reliable.filter(v=>Math.abs(v.time-frame.time)<=scaleWindow);if(neighbors.length<3)return false;
  const center=weightedMedian(neighbors.map(v=>[v.logScale,1]));return neighbors.every(v=>Math.abs(v.logScale-center)<=scaleSpread);
 }));
 const hasScaleAnchor=measured.filter(v=>scaleEvidence.has(v)&&Math.abs(v.time-data.anchor)<=scaleWindow).length>=3;
 const raw=measured.map(frame=>hasScaleAnchor&&scaleEvidence.has(frame)?frame:{...frame,x:frame.unitX,y:frame.unitY,logScale:0,scaleReliable:false});
 // Symmetric offline smoothing avoids introducing a playback lag. Never smooth across a long loss.
 const maxGap=Math.max(.5,data.step*2.1),groups:RawMotionFrame[][]=[];
 for(const f of raw){const group=groups.at(-1);if(!group||f.time-group.at(-1)!.time>maxGap)groups.push([f]);else group.push(f);}
 const smooth=groups.flatMap(group=>{let left=0,right=0;return group.map(frame=>{
  const window=Math.max(MOTION_SMOOTH_WINDOW,data.step*1.1);while(group[left].time<frame.time-window)left++;while(right<group.length&&group[right].time<=frame.time+window)right++;
  const neighbors=group.slice(left,right),scaleNeighbors=neighbors.filter(v=>v.scaleReliable&&Math.abs(v.time-frame.time)<=Math.max(.26,data.step*1.1));
   return {time:frame.time,x:smoothPosition(neighbors,frame.time,'x',stage.width*.005),y:smoothPosition(neighbors,frame.time,'y',stage.height*.005),logScale:scaleNeighbors.length>=2?weightedMedian(scaleNeighbors.map(v=>[v.logScale,1])):0,scaleReliable:scaleNeighbors.length>=2};
 });});
 if(smooth.length<8)return {frames:[],target,accepted:smooth.length,total:data.samples.length,maxGap};
 const nearby=smooth.filter(v=>Math.abs(v.time-data.anchor)<=Math.max(.26,data.step));
 const baseline=nearby.length?nearby:[smooth.reduce((a,b)=>Math.abs(a.time-data.anchor)<=Math.abs(b.time-data.anchor)?a:b)];
 const base=(key:'x'|'y'|'logScale',values=baseline)=>weightedMedian(values.map(v=>[v[key],1])),bx=base('x'),by=base('y'),scaleBaseline=smooth.filter(v=>v.scaleReliable&&Math.abs(v.time-data.anchor)<=scaleWindow),useScaleBaseline=scaleBaseline.length>=3,bs=useScaleBaseline?base('logScale',scaleBaseline):0;
 const frames=smooth.map(v=>({time:v.time,x:limit((v.x-bx)/Math.exp(bs)/stage.width*100,-20,20),y:limit((v.y-by)/Math.exp(bs)/stage.height*100,-20,20),logScale:useScaleBaseline&&v.scaleReliable?limit(v.logScale-bs,-Math.log(1.35),Math.log(1.35)):0}));
 return {frames,target,accepted:frames.length,total:data.samples.length,maxGap};
}

/** Stateless lookup works identically on pause, seek, loops and any playback speed. */
export function motionWeightAt(curve:MotionCurve|null,time:number,strength=1){
 const frames=curve?.frames;if(!frames?.length||!Number.isFinite(time)||!Number.isFinite(strength))return 0;
 let lo=0,hi=frames.length;while(lo<hi){const mid=(lo+hi)>>>1;if(frames[mid].time<time)lo=mid+1;else hi=mid;}
 const left=frames[lo-1],right=frames[lo],fade=.25;
 let weight=1;
 if(!(left&&right&&right.time-left.time<=curve!.maxGap)){const nearest=!left?right:!right?left:time-left.time<right.time-time?left:right;if(!nearest)return 0;weight=limit(1-Math.abs(time-nearest.time)/fade,0,1);weight=weight*weight*(3-2*weight);}
 return weight*limit(strength,0,1);
}
export function motionAt(curve:MotionCurve|null,time:number,strength=1){
 const frames=curve?.frames;if(!frames?.length||!Number.isFinite(time)||!Number.isFinite(strength))return identityMotion();
 let lo=0,hi=frames.length;while(lo<hi){const mid=(lo+hi)>>>1;if(frames[mid].time<time)lo=mid+1;else hi=mid;}
 const left=frames[lo-1],right=frames[lo],fade=.25;
 let x=0,y=0,logScale=0,weight=1;
 if(left&&right&&right.time-left.time<=curve!.maxGap){const t=(time-left.time)/(right.time-left.time);x=left.x+(right.x-left.x)*t;y=left.y+(right.y-left.y)*t;logScale=left.logScale+(right.logScale-left.logScale)*t;}
 else {const nearest=!left?right:!right?left:time-left.time<right.time-time?left:right;if(!nearest)return identityMotion();weight=limit(1-Math.abs(time-nearest.time)/fade,0,1);weight=weight*weight*(3-2*weight);({x,y,logScale}=nearest);}
 weight*=limit(strength,0,1);if(weight===0)return identityMotion();return {x:x*weight,y:y*weight,scale:Math.exp(logScale*weight)};
}
