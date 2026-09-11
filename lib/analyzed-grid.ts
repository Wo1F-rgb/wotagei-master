export type AnalyzedGrid={bpm:number;origin:number;errorMs:number;driftMs:number;coverage:number;variable:boolean;beatCount:number};
export type RhythmAnalysisResult={engine:string;duration:number;beats:number[];downbeats:number[];waveform:number[];grid:AnalyzedGrid|null};
const median=(values:number[])=>{const a=[...values].sort((a,b)=>a-b),i=Math.floor(a.length/2);return a.length%2?a[i]:(a[i-1]+a[i])/2;};
type BeatPoint={time:number;index:number};
function line(points:BeatPoint[]){
 const n=points.length,x=points.reduce((s,p)=>s+p.index,0)/n,y=points.reduce((s,p)=>s+p.time,0)/n;
 const denominator=points.reduce((s,p)=>s+(p.index-x)**2,0),period=points.reduce((s,p)=>s+(p.index-x)*(p.time-y),0)/denominator;
 return {period,origin:y-period*x};
}
/** Fit audio-detected beats across the whole file. Never round BPM or anchor to one noisy onset. */
export function analyzeDetectedGrid(beats:number[],downbeats:number[],duration:number):AnalyzedGrid|null{
 if(!Number.isFinite(duration)||duration<8)return null;
 const times=beats.filter(t=>Number.isFinite(t)&&t>=0&&t<duration).sort((a,b)=>a-b).filter((t,i,a)=>!i||t-a[i-1]>.08);
 if(times.length<12)return null;
 const gaps=times.slice(1).map((t,i)=>t-times[i]).filter(d=>d>=.2&&d<=1.5);if(gaps.length<8)return null;
 const seed=median(gaps),points:BeatPoint[]=[{time:times[0],index:0}];
 for(const time of times.slice(1)){const previous=points.at(-1)!,gap=time-previous.time;if(gap<seed*.55)continue;points.push({time,index:previous.index+Math.max(1,Math.round(gap/seed))});}
 if(points.length<12||points.at(-1)!.time-points[0].time<6)return null;
 // A median of long-baseline slopes gives missed/spurious detections little influence.
 const slopes:number[]=[];
 for(let i=0;i<points.length;i+=Math.max(1,Math.floor(points.length/80)))for(let j=i+4;j<points.length;j+=Math.max(1,Math.floor(points.length/80)))slopes.push((points[j].time-points[i].time)/(points[j].index-points[i].index));
 let period=median(slopes),origin=median(points.map(p=>p.time-p.index*period));
 let inliers=points;
 for(let pass=0;pass<3;pass++){
  const residuals=points.map(p=>Math.abs(p.time-origin-p.index*period));
  const tolerance=Math.min(period*.22,Math.max(.04,median(residuals)*2.8));
  inliers=points.filter((p,i)=>residuals[i]<=tolerance);if(inliers.length<8)return null;
  ({period,origin}=line(inliers));
 }
 const bpm=60/period;if(!Number.isFinite(bpm)||bpm<40||bpm>300)return null;
 const errorMs=Math.sqrt(inliers.reduce((s,p)=>s+(p.time-origin-p.index*period)**2,0)/inliers.length)*1000;
 const thirds=Array.from({length:3},(_,i)=>points.filter(p=>p.time>=duration*i/3&&p.time<duration*(i+1)/3));
 const offsets=thirds.filter(p=>p.length>=3).map(ps=>median(ps.map(p=>p.time-origin-p.index*period)));
 const driftMs=offsets.length>1?(Math.max(...offsets)-Math.min(...offsets))*1000:0;
 const localPeriods=thirds.filter(p=>p.length>=5).map(p=>line(p).period);
 const tempoSpread=localPeriods.length>1?(Math.max(...localPeriods)-Math.min(...localPeriods))/period:0;
 const coverage=Math.min(1,inliers.length/Math.max(points.length,duration/period));
 const variable=coverage<.75||thirds.some(p=>p.length<3)||driftMs>Math.max(65,period*170)||tempoSpread>.025||errorMs>45;
 // Choose a musical bar boundary when available; dance 1 can still be relabelled by the user.
 const validDownbeats=downbeats.filter(t=>Number.isFinite(t)&&t>=0&&t<duration&&Math.abs((t-origin)/period-Math.round((t-origin)/period))<.2);
 if(validDownbeats.length){
  const bins=[0,1,2,3].map(phase=>({phase,count:validDownbeats.filter(t=>((Math.round((t-origin)/period)%4)+4)%4===phase).length})).sort((a,b)=>b.count-a.count);
  if(bins[0].count>=Math.max(2,validDownbeats.length*.6))origin+=bins[0].phase*period;
 }
 // Extend the same 4-beat grid towards the file start without inventing a negative start marker.
 origin=((origin%(4*period))+4*period)%(4*period);
 return {bpm,origin,errorMs,driftMs,coverage,variable,beatCount:inliers.length};
}
export function waveformPeaks(samples:Float32Array,bins=512):number[]{
 const out=Array.from({length:bins},()=>0),step=samples.length/bins;let max=0;
 for(let i=0;i<bins;i++){let peak=0;for(let j=Math.floor(i*step);j<Math.min(samples.length,Math.ceil((i+1)*step));j++)peak=Math.max(peak,Math.abs(samples[j]));out[i]=peak;max=Math.max(max,peak);}
 return out.map(v=>max>0?v/max:0);
}
