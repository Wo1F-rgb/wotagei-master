export type BeatGrid={bpm:number;period:number;origin:number;count:number;used:number;missed:number;errorMs:number;provisional:boolean;points:{time:number;beat:number;snapped:number;used:boolean}[]};
const median=(a:number[])=>{const s=[...a].sort((x,y)=>x-y),m=Math.floor(s.length/2);return s.length%2?s[m]:(s[m-1]+s[m])/2;};
type Pair={time:number;beat:number;index:number};
function regress(points:Pair[],period:number){
 const slopes:number[]=[];for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++)if(points[j].beat>points[i].beat)slopes.push((points[j].time-points[i].time)/(points[j].beat-points[i].beat));
 const p=slopes.length?median(slopes):period;return {period:p,origin:median(points.map(t=>t.time-t.beat*p))};
}
/** Jointly fit tempo AND phase in media seconds. First intended tap labels beat 1. */
export function fitBeatGrid(times:number[]):BeatGrid|null{
 if(times.length<2||times.some((t,i)=>!Number.isFinite(t)||t<0||(i>0&&t<=times[i-1])))return null;
 const gaps=times.slice(1).map((t,i)=>t-times[i]),seed=median(gaps.filter(g=>g>=.1));if(!Number.isFinite(seed))return null;
 let best:{fit:BeatGrid;score:number}|null=null;
 for(const initial of [seed,seed*.5,seed*2,seed*.85,seed*1.15]){
  if(initial<.19||initial>1.55)continue;
  let period=initial,origin=times[0],points:Pair[]=[];
  for(let pass=0;pass<5;pass++){
   const unique=new Map<number,Pair>();
   times.forEach((time,index)=>{const beat=Math.round((time-origin)/period),old=unique.get(beat);if(!old||Math.abs(time-origin-beat*period)<Math.abs(old.time-origin-beat*period))unique.set(beat,{time,beat,index});});
   points=[...unique.values()].sort((a,b)=>a.beat-b.beat);if(points.length<2)break;
   const fitted=regress(points,period);period=fitted.period;origin=fitted.origin;
   const residuals=points.map(p=>Math.abs(p.time-origin-p.beat*period));
   const threshold=Math.min(period*.28,Math.max(.035,median(residuals)*2.8));
   const inliers=points.filter((p,i)=>residuals[i]<=threshold);if(inliers.length>=2){const fit=regress(inliers,period);period=fit.period;origin=fit.origin;points=inliers;}
  }
  if(period<.2-1e-8||period>1.5||points.length<Math.min(3,times.length))continue;
  // Refit least squares only after outlier rejection, reducing timing jitter across all good taps.
  const meanBeat=points.reduce((n,p)=>n+p.beat,0)/points.length,meanTime=points.reduce((n,p)=>n+p.time,0)/points.length;
  const denominator=points.reduce((n,p)=>n+(p.beat-meanBeat)**2,0);
  if(denominator){period=points.reduce((n,p)=>n+(p.beat-meanBeat)*(p.time-meanTime),0)/denominator;origin=meanTime-period*meanBeat;}
  if(period<.2-1e-8||period>1.5)continue;
  const rms=Math.sqrt(points.reduce((n,p)=>n+(p.time-origin-p.beat*period)**2,0)/points.length);
  if(rms>period*.22)continue;
  const firstBeat=Math.round((times[0]-origin)/period);origin+=firstBeat*period;points=points.map(p=>({...p,beat:p.beat-firstBeat}));
  const used=new Set(points.map(p=>p.index)),maxBeat=Math.max(...points.map(p=>p.beat)),minBeat=Math.min(...points.map(p=>p.beat));
  const missed=Math.max(0,maxBeat-minBeat+1-points.length);
  const score=points.length-(times.length-points.length)*.8-missed*.55-rms/period*3;
  const fit:BeatGrid={bpm:60/period,period,origin:Math.max(0,origin),count:times.length,used:points.length,missed,errorMs:rms*1000,provisional:points.length<6,points:times.map((time,index)=>{const beat=Math.round((time-origin)/period);return {time,beat,snapped:Math.max(0,origin)+beat*period,used:used.has(index)};})};
  if(!best||score>best.score)best={fit,score};
 }
 return best?.fit||null;
}
