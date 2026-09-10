import {transformPose,type Point,type Size,type PoseAlignment} from './pose-geometry.ts';

export type PosePair={reference:Point[];self:Point[]};
export type Subject={hip:Point;height:number;landmarks:Point[]};
const finite=(p:Point|undefined)=>!!p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
const visible=(p:Point|undefined,threshold=.7)=>finite(p)&&(p!.visibility??0)>=threshold;
const mid=(p:Point[],a:number,b:number)=>({x:(p[a].x+p[b].x)/2,y:(p[a].y+p[b].y)/2});
const core=[11,12,23,24];
const mean=(points:Point[],ids:number[])=>({x:ids.reduce((s,i)=>s+points[i].x,0)/ids.length,y:ids.reduce((s,i)=>s+points[i].y,0)/ids.length});
/** A detector can extrapolate joints outside the image; they are not visible evidence. */
export function visiblePose(points:Point[]):Point[]{return points.map(p=>({...p,visibility:finite(p)&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1?p.visibility:0}));}
export function weightedMedian(values:[number,number][]):number{
 const sorted=values.filter(([v,w])=>Number.isFinite(v)&&Number.isFinite(w)&&w>0).sort((a,b)=>a[0]-b[0]);
 const half=sorted.reduce((s,[,w])=>s+w,0)/2;let sum=0;
 for(const [value,weight] of sorted){sum+=weight;if(sum>=half)return value;}
 throw new Error('有効な測定が不足しています。肩と腰が見える場面で試してください。');
}
/** Identity is measured in original, unmirrored video coordinates, before scene corrections. */
export function subjectFromPose(points:Point[]):Subject|null{
 const landmarks=visiblePose(points),ids=core.filter(i=>visible(landmarks[i]));if(ids.length<2)return null;
 const body=ids.map(i=>landmarks[i]),span=Math.max(...body.flatMap(a=>body.map(b=>Math.hypot(a.x-b.x,a.y-b.y))));if(span<.025)return null;
 const ys=[0,11,12,23,24,25,26,27,28].filter(i=>visible(landmarks[i],.5)).map(i=>landmarks[i].y);
 return {hip:[23,24].every(i=>ids.includes(i))?mid(landmarks,23,24):mean(landmarks,ids),height:Math.max(span,Math.max(...ys)-Math.min(...ys)),landmarks};
}
export function selectSubject(candidates:Point[][],seed:Subject):Point[]|null{
 const ranked=candidates.flatMap(points=>{
  const subject=subjectFromPose(points);if(!subject)return [];
  const common=core.filter(i=>visible(seed.landmarks[i])&&visible(subject.landmarks[i]));if(common.length<2)return [];
  // Compare the SAME visible joints: cropping a hip must not turn a shoulder into a hip.
  const anchor=[23,24].every(i=>common.includes(i))?[23,24]:common;
  const a=mean(seed.landmarks,anchor),b=mean(subject.landmarks,anchor),dx=b.x-a.x,dy=b.y-a.y;
  const span=(p:Point[])=>Math.max(...common.flatMap(i=>common.map(j=>Math.hypot(p[i].x-p[j].x,p[i].y-p[j].y))));
  const before=span(seed.landmarks),after=span(subject.landmarks),ratio=after/before;
  if(Math.min(before,after)<.025||Math.abs(dx)>.18||Math.abs(dy)>.3||ratio<.45||ratio>2.2)return [];
  return [{points,score:Math.hypot(dx/.18,dy/.3)+.25*Math.abs(Math.log(ratio))}];
 }).sort((a,b)=>a.score-b.score);
 // Never replace a missing target with the only remaining spectator; ambiguous identities are skipped.
 if(!ranked.length||(ranked[1]&&ranked[1].score-ranked[0].score<.2))return null;
 return ranked[0].points;
}
export function samplingPlan(durations:number[],origins:number[],bpm:number[],count=32,anchor?:number):[number,number][]{
 if(durations.length!==2||origins.length!==2||bpm.length!==2||durations.some(v=>!Number.isFinite(v)||v<=0)||origins.some(v=>!Number.isFinite(v)||v<0)||bpm.some(v=>!Number.isFinite(v)||v<=0)||!Number.isInteger(count)||count<6||count>64)throw new Error('2本の動画のBPMと拍の位置を先に設定してください。');
 const rate=bpm[0]/bpm[1],offset=origins[1]-origins[0]*rate;
 const start=Math.max(0,-offset/rate),end=Math.min(durations[0],(durations[1]-offset)/rate);
 if(end-start<1)throw new Error('同期して比較できる区間が短すぎます。BPMと拍の位置を確認してください。');
 const times=Array.from({length:count},(_,i)=>start+(end-start)*(i+.5)/count);
 // Include the selected scene when it is in the synchronized overlap, even in a short appearance.
 if(anchor!==undefined&&Number.isFinite(anchor)&&anchor>=start&&anchor<end)times[Math.min(count-1,Math.floor((anchor-start)/(end-start)*count))]=anchor;
 return times.map(t=>[t,rate*t+offset]);
}
/** Fixed similarity transform. No stance-dependent rotation, per-limb warp, or frame-wise fitting. */
export function fitPoseSequence(samples:PosePair[],stage:Size,rotation=0,currentScale=1){
 if(!Number.isFinite(stage.width)||!Number.isFinite(stage.height)||stage.width<=0||stage.height<=0||!Number.isFinite(rotation)||Math.abs(rotation)>60)throw new Error('映像の表示サイズを確認してください。');
 if(!Number.isFinite(currentScale)||currentScale<=0)throw new Error('現在の倍率を確認してください。');
 const pairs=samples.map(s=>({...s,self:transformPose(s.self,{x:0,y:0,scale:1,rotation},stage)}));
 const edges:[number,number,number][]=[[11,23,1],[12,24,1],[11,12,.5]],measurements:{value:number;weight:number;frame:number}[]=[];
 const minLength=Math.max(2,Math.min(stage.width,stage.height)*14/540);
 pairs.forEach(({reference:q,self:p},frame)=>{for(const [a,b,w] of edges){if(![q[a],q[b],p[a],p[b]].every(v=>visible(v)))continue;const r=Math.hypot(q[a].x-q[b].x,q[a].y-q[b].y),s=Math.hypot(p[a].x-p[b].x,p[a].y-p[b].y);if(Math.min(r,s)<minLength)continue;const v=Math.min(q[a].visibility!,q[b].visibility!,p[a].visibility!,p[b].visibility!);measurements.push({value:Math.log(r/s),weight:w*v*v,frame});}});
 const center=measurements.length?weightedMedian(measurements.map(m=>[m.value,m.weight])):0;
 const inliers=measurements.filter(m=>Math.abs(m.value-center)<=Math.log(1.4));
 const spread=inliers.length?Math.exp(weightedMedian(inliers.map(m=>[Math.abs(m.value-center),m.weight])))-1:0;
 const measuredScale=inliers.length?Math.exp(weightedMedian(inliers.map(m=>[m.value,m.weight]))):NaN;
 const positionOnly=!Number.isFinite(measuredScale)||measuredScale<=.5||measuredScale>=2||spread>.22;
 const scale=positionOnly?currentScale:measuredScale;
 const accepted=new Set(positionOnly?pairs.map((_,i)=>i):inliers.map(m=>m.frame));
 const xs:[number,number][]=[],ys:[number,number][]=[],cx=stage.width/2,cy=stage.height/2;
 let partialBody=false;
 for(const frame of accepted){const {reference:q,self:p}=pairs[frame],common=core.filter(i=>visible(q[i])&&visible(p[i]));if(!common.length)continue;
  const hips=[23,24].every(i=>common.includes(i)),shoulders=[11,12].every(i=>common.includes(i)),anchor=hips?[23,24]:shoulders?[11,12]:common;
  let r=mean(q,anchor),s=mean(p,anchor);const w=Math.min(...anchor.flatMap(i=>[q[i].visibility!,p[i].visibility!]));
  const feet=[q[27],q[28],p[27],p[28]].every(v=>visible(v));partialBody ||= common.length<4||!feet;
  if(hips&&feet){const rf=mid(q,27,28),sf=mid(p,27,28);r={x:r.x*.75+rf.x*.25,y:r.y*.75+rf.y*.25};s={x:s.x*.75+sf.x*.25,y:s.y*.75+sf.y*.25};}
  xs.push([r.x-cx-scale*(s.x-cx),w*w]);ys.push([r.y-cy-scale*(s.y-cy),w*w]);
 }
 if(!xs.length)throw new Error('2人に共通して見える肩や腰が見つかりませんでした。別の場面で人物を選び直すか、手動で位置を合わせてください。');
 const x=weightedMedian(xs)/stage.width*100,y=weightedMedian(ys)/stage.height*100;
 if(!Number.isFinite(x)||!Number.isFinite(y)||Math.abs(x)>100||Math.abs(y)>100)throw new Error('位置のずれが大きいため補正を見送りました。対象の人を選び直してください。');
 return {alignment:{x,y,scale,rotation} satisfies PoseAlignment,frames:xs.length,spread,positionOnly,limited:positionOnly||partialBody||xs.length<6};
}
/** Preserve a registration when contain letterboxing or the alignment panel changes dimensions. */
export function resizeRegistration(a:PoseAlignment,before:Size,after:Size,reference:Size,self:Size):PoseAlignment{
 if([before.width,before.height,after.width,after.height,reference.width,reference.height,self.width,self.height].some(v=>!Number.isFinite(v)||v<=0))return a;
 const factor=(video:Size)=>Math.min(after.width/video.width,after.height/video.height)/Math.min(before.width/video.width,before.height/video.height);
 const r=factor(reference),s=factor(self),safe=(v:number)=>Math.max(-.3,Math.min(.3,v));
 return {...a,x:a.x*before.width*r/after.width,y:a.y*before.height*r/after.height,scale:a.scale*r/s,perspectiveX:safe((a.perspectiveX||0)*after.width/(before.width*s)),perspectiveY:safe((a.perspectiveY||0)*after.height/(before.height*s))};
}
