import type {Point,Size} from './pose-geometry';

export type PoseSample={time:number;points:Point[]|null};
export type PoseTimeline={samples:PoseSample[];size:Size;step:number;duration:number};

/** Sample in source seconds, independent of BPM, playback rate and the other video. */
export function poseSamplingPlan(duration:number){
 if(!Number.isFinite(duration)||duration<=0)throw new Error('動画の長さを確認できません。');
 // Keep long clips bounded without losing their end. At most 9,001 samples per video.
 const end=Math.max(0,duration-.02),intervals=Math.max(1,Math.min(9000,Math.ceil(end*15))),step=end/intervals;
 return {times:Array.from({length:intervals+1},(_,i)=>i*step),step};
}

/** Interpolate both neighboring frames; never hold an old pose through a detection gap. */
export function poseAt(timeline:PoseTimeline|null|undefined,time:number):Point[]|null{
 if(!timeline||!Number.isFinite(time)||time<0||time>timeline.duration)return null;
 const frames=timeline.samples;if(!frames.length)return null;
 let lo=0,hi=frames.length;while(lo<hi){const mid=(lo+hi)>>>1;if(frames[mid].time<time)lo=mid+1;else hi=mid;}
 const a=frames[Math.max(0,lo-1)],b=frames[Math.min(frames.length-1,lo)];
 if(Math.abs(time-a.time)<1e-6)return a.points;
 if(Math.abs(time-b.time)<1e-6)return b.points;
 if(a===b)return Math.abs(time-a.time)<=Math.max(.04,timeline.step)?a.points:null;
 if(!a.points||!b.points||b.time-a.time>Math.min(.25,timeline.step*1.6))return null;
 const f=Math.max(0,Math.min(1,(time-a.time)/(b.time-a.time)));
 return a.points.map((p,i)=>{
  const q=b.points![i];if(!q)return {...p,visibility:0};
  const visible=Math.min(p.visibility??0,q.visibility??0);
  return {x:p.x+(q.x-p.x)*f,y:p.y+(q.y-p.y)*f,visibility:Number.isFinite(p.x+p.y+q.x+q.y)?visible:0};
 });
}
