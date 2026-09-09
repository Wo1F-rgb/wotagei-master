import {transformPose,type Point,type Size,type PoseAlignment} from './pose-geometry.ts';

export type PosePair={reference:Point[];self:Point[]};
export type Subject={hip:Point;height:number};
const finite=(p:Point|undefined)=>!!p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
const visible=(p:Point|undefined,threshold=.7)=>finite(p)&&(p!.visibility??0)>=threshold;
const mid=(p:Point[],a:number,b:number)=>({x:(p[a].x+p[b].x)/2,y:(p[a].y+p[b].y)/2});
export function weightedMedian(values:[number,number][]):number{
 const sorted=values.filter(([v,w])=>Number.isFinite(v)&&Number.isFinite(w)&&w>0).sort((a,b)=>a[0]-b[0]);
 const half=sorted.reduce((s,[,w])=>s+w,0)/2;let sum=0;
 for(const [value,weight] of sorted){sum+=weight;if(sum>=half)return value;}
 throw new Error('有効な測定が不足しています。肩と腰が見える場面で試してください。');
}
/** Identity is measured in original, unmirrored video coordinates, before scene corrections. */
export function subjectFromPose(points:Point[]):Subject|null{
 if(![23,24].every(i=>visible(points[i])))return null;
 const ys=[0,11,12,23,24,25,26,27,28].filter(i=>visible(points[i],.5)).map(i=>points[i].y);
 const height=Math.max(...ys)-Math.min(...ys);
 return ys.length>=5&&height>=.12?{hip:mid(points,23,24),height}:null;
}
export function selectSubject(candidates:Point[][],seed:Subject):Point[]|null{
 const ranked=candidates.map(points=>({points,subject:subjectFromPose(points)})).filter(v=>v.subject!==null).filter(({subject:s})=>
  Math.abs(s!.hip.x-seed.hip.x)<=.18&&Math.abs(s!.hip.y-seed.hip.y)<=.3&&s!.height>=seed.height*.45&&s!.height<=seed.height*2.2
 ).map(v=>({...v,score:Math.hypot((v.subject!.hip.x-seed.hip.x)/.18,(v.subject!.hip.y-seed.hip.y)/.3)+.25*Math.abs(Math.log(v.subject!.height/seed.height))})).sort((a,b)=>a.score-b.score);
 // Never replace a missing target with the only remaining spectator; ambiguous identities are skipped.
 if(!ranked.length||(ranked[1]&&ranked[1].score-ranked[0].score<.2))return null;
 return ranked[0].points;
}
export function samplingPlan(durations:number[],origins:number[],bpm:number[],count=32):[number,number][]{
 if(durations.length!==2||origins.length!==2||bpm.length!==2||durations.some(v=>!Number.isFinite(v)||v<=0)||origins.some(v=>!Number.isFinite(v)||v<0)||bpm.some(v=>!Number.isFinite(v)||v<=0)||!Number.isInteger(count)||count<6||count>64)throw new Error('2本の動画のBPMと拍の位置を先に設定してください。');
 const rate=bpm[0]/bpm[1],offset=origins[1]-origins[0]*rate;
 const start=Math.max(0,-offset/rate),end=Math.min(durations[0],(durations[1]-offset)/rate);
 if(end-start<1)throw new Error('同期して比較できる区間が短すぎます。BPMと拍の位置を確認してください。');
 return Array.from({length:count},(_,i)=>{const t=start+(end-start)*(i+.5)/count;return [t,rate*t+offset];});
}
/** Fixed similarity transform. No stance-dependent rotation, per-limb warp, or frame-wise fitting. */
export function fitPoseSequence(samples:PosePair[],stage:Size,rotation=0){
 if(!Number.isFinite(stage.width)||!Number.isFinite(stage.height)||stage.width<=0||stage.height<=0||!Number.isFinite(rotation)||Math.abs(rotation)>60)throw new Error('映像の表示サイズを確認してください。');
 const pairs=samples.map(s=>({...s,self:transformPose(s.self,{x:0,y:0,scale:1,rotation},stage)})).filter(s=>[23,24].every(i=>visible(s.reference[i])&&visible(s.self[i])));
 const edges:[number,number,number][]=[[11,23,1],[12,24,1],[11,12,.5]],measurements:{value:number;weight:number;frame:number;torso:boolean}[]=[];
 const minLength=Math.max(2,Math.min(stage.width,stage.height)*14/540);
 pairs.forEach(({reference:q,self:p},frame)=>{for(const [a,b,w] of edges){if(![q[a],q[b],p[a],p[b]].every(v=>visible(v)))continue;const r=Math.hypot(q[a].x-q[b].x,q[a].y-q[b].y),s=Math.hypot(p[a].x-p[b].x,p[a].y-p[b].y);if(Math.min(r,s)<minLength)continue;const v=Math.min(q[a].visibility!,q[b].visibility!,p[a].visibility!,p[b].visibility!);measurements.push({value:Math.log(r/s),weight:w*v*v,frame,torso:b!==12});}});
 const center=weightedMedian(measurements.map(m=>[m.value,m.weight]));
 const inliers=measurements.filter(m=>Math.abs(m.value-center)<=Math.log(1.4));
 const accepted=new Set(inliers.filter(m=>m.torso).map(m=>m.frame));
 if(accepted.size<6)throw new Error('同じ人の肩と腰を確認できた場面が不足しています。対象の人と、BPM・拍の位置を確認してください。');
 const scale=Math.exp(weightedMedian(inliers.map(m=>[m.value,m.weight])));
 const spread=Math.exp(weightedMedian(inliers.map(m=>[Math.abs(m.value-center),m.weight])))-1;
 if(scale<=.5||scale>=2||spread>.22)throw new Error('倍率のばらつきが大きいため補正を見送りました。対象人物とタイミングを確認してください。');
 const xs:[number,number][]=[],ys:[number,number][]=[],cx=stage.width/2,cy=stage.height/2;
 for(const frame of accepted){const {reference:q,self:p}=pairs[frame];let r=mid(q,23,24),s=mid(p,23,24);const w=Math.min(q[23].visibility!,q[24].visibility!,p[23].visibility!,p[24].visibility!);
  if([q[27],q[28],p[27],p[28]].every(v=>visible(v))){const rf=mid(q,27,28),sf=mid(p,27,28);r={x:r.x*.75+rf.x*.25,y:r.y*.75+rf.y*.25};s={x:s.x*.75+sf.x*.25,y:s.y*.75+sf.y*.25};}
  xs.push([r.x-cx-scale*(s.x-cx),w*w]);ys.push([r.y-cy-scale*(s.y-cy),w*w]);
 }
 const x=weightedMedian(xs)/stage.width*100,y=weightedMedian(ys)/stage.height*100;
 if(!Number.isFinite(x)||!Number.isFinite(y)||Math.abs(x)>100||Math.abs(y)>100)throw new Error('位置のずれが大きいため補正を見送りました。対象の人を選び直してください。');
 return {alignment:{x,y,scale,rotation} satisfies PoseAlignment,frames:accepted.size,spread};
}
/** Preserve a registration when contain letterboxing or the alignment panel changes dimensions. */
export function resizeRegistration(a:PoseAlignment,before:Size,after:Size,reference:Size,self:Size):PoseAlignment{
 if([before.width,before.height,after.width,after.height,reference.width,reference.height,self.width,self.height].some(v=>!Number.isFinite(v)||v<=0))return a;
 const factor=(video:Size)=>Math.min(after.width/video.width,after.height/video.height)/Math.min(before.width/video.width,before.height/video.height);
 const r=factor(reference),s=factor(self),safe=(v:number)=>Math.max(-.3,Math.min(.3,v));
 return {...a,x:a.x*before.width*r/after.width,y:a.y*before.height*r/after.height,scale:a.scale*r/s,perspectiveX:safe((a.perspectiveX||0)*after.width/(before.width*s)),perspectiveY:safe((a.perspectiveY||0)*after.height/(before.height*s))};
}
