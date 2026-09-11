import type {AnalyzedGrid} from './analyzed-grid.ts';

/** A mono PCM signal in media seconds. */
export type SpectralPcmInput={samples:Float32Array|Float64Array|number[];sampleRate:number};
/** The log-mel layout emitted by rhythm-features.ts (one row per frame). */
export type SpectralLogMelInput={spectrogram:Float32Array|Float64Array|number[];frames:number;bins?:number;frameRate?:number};
export type SpectralGridInput=SpectralPcmInput|SpectralLogMelInput;
export type SpectralGridResult={beats:number[];grid:AnalyzedGrid|null};

type Envelope={full:Float64Array;low:Float64Array;rate:number;duration:number;timeOffset:number};
type Event={frame:number;time:number;weight:number};
type Candidate={period:number;phase:number;score:number;fullScore:number;lowScore:number;coverage:number;periodicity:number;concentration:number};

const MIN_PERIOD=60/300,MAX_PERIOD=60/40;
const finite=(v:number)=>Number.isFinite(v)&&v>=0;

function median(values:number[]):number{
 const a=values.filter(Number.isFinite).sort((x,y)=>x-y);
 if(!a.length)return NaN;
 const i=Math.floor(a.length/2);return a.length%2?a[i]:(a[i-1]+a[i])/2;
}
function quantile(values:number[],q:number):number{
 const a=values.filter(Number.isFinite).sort((x,y)=>x-y);if(!a.length)return NaN;
 return a[Math.min(a.length-1,Math.max(0,Math.floor((a.length-1)*q)))];
}
function normalize(values:Float64Array):Float64Array{
 const base=median(Array.from(values));
 if(!Number.isFinite(base))return new Float64Array(values.length);
 const differences=Array.from(values,v=>Math.max(0,v-base));
 const scale=Math.max(quantile(differences,.75),quantile(differences,.9)*.5,1e-12);
 return Float64Array.from(differences,v=>Math.min(1,v/scale));
}

/* Radix-2 FFT. This deliberately stays local so this fallback does not add a
 * DSP dependency to the browser worker. */
function fft(real:Float64Array,imag:Float64Array):void{
 const n=real.length;
 for(let i=1,j=0;i<n;i++){
  let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;
  if(i<j){let t=real[i];real[i]=real[j];real[j]=t;t=imag[i];imag[i]=imag[j];imag[j]=t;}
 }
 for(let length=2;length<=n;length<<=1){
  const angle=-2*Math.PI/length,wr0=Math.cos(angle),wi0=Math.sin(angle);
  for(let start=0;start<n;start+=length){
   let wr=1,wi=0;
   for(let j=0;j<length/2;j++){
    const a=start+j,b=a+length/2,tr=real[b]*wr-imag[b]*wi,ti=real[b]*wi+imag[b]*wr;
    real[b]=real[a]-tr;imag[b]=imag[a]-ti;real[a]+=tr;imag[a]+=ti;
    const next=wr*wr0-wi*wi0;wi=wr*wi0+wi*wr0;wr=next;
   }
  }
 }
}

function resample(samples:Float32Array|Float64Array|number[],sampleRate:number):{samples:Float32Array;sampleRate:number}{
 const source=Float32Array.from(samples,v=>Number.isFinite(v)?v:0);
 if(Math.abs(sampleRate-22050)<1e-6)return {samples:source,sampleRate};
 const rate=22050,length=Math.max(1,Math.floor(source.length*rate/sampleRate));
 const output=new Float32Array(length),ratio=sampleRate/rate;
 for(let i=0;i<length;i++){
  const at=i*ratio,left=Math.floor(at),fraction=at-left;
  output[i]=(source[Math.min(source.length-1,left)]??0)*(1-fraction)+(source[Math.min(source.length-1,left+1)]??0)*fraction;
 }
 return {samples:output,sampleRate:rate};
}

function pcmEnvelope(input:SpectralPcmInput):Envelope|null{
 if(!Number.isFinite(input.sampleRate)||input.sampleRate<=0||input.samples.length<1)return null;
 const {samples,sampleRate}=resample(input.samples,input.sampleRate);
 const duration=samples.length/sampleRate;if(duration<8)return null;
 const targetRate=22050,hop=256,size=1024;
 const frames=Math.floor((samples.length-size)/hop)+1;if(frames<40)return null;
 const full=new Float64Array(frames),low=new Float64Array(frames),real=new Float64Array(size),imag=new Float64Array(size),previous=new Float64Array(size/2+1);
 const window=Float64Array.from({length:size},(_,i)=>.5-.5*Math.cos(2*Math.PI*i/size));
 const lowEdge=Math.max(1,Math.floor(180*size/sampleRate));
 const midEdge=Math.max(lowEdge+1,Math.floor(700*size/sampleRate));
 for(let frame=0;frame<frames;frame++){
  const offset=frame*hop;
  for(let i=0;i<size;i++){real[i]=(samples[offset+i]??0)*window[i];imag[i]=0;}
  fft(real,imag);
  let all=0,bass=0;
  for(let k=1;k<=size/2;k++){
   const magnitude=Math.hypot(real[k],imag[k]),change=magnitude-previous[k];
   if(change>0){all+=change;if(k<=lowEdge)bass+=change;}
   previous[k]=magnitude;
  }
  full[frame]=all;low[frame]=bass;
 }
 return {full:normalize(full),low:normalize(low),rate:targetRate/hop,duration,timeOffset:size/(2*sampleRate)};
}

function logMelEnvelope(input:SpectralLogMelInput):Envelope|null{
 const bins=input.bins??128,frames=input.frames,frameRate=input.frameRate??50;
 if(!Number.isInteger(frames)||frames<40||!Number.isInteger(bins)||bins<4||!Number.isFinite(frameRate)||frameRate<=0||input.spectrogram.length<frames*bins)return null;
 const full=new Float64Array(frames),low=new Float64Array(frames),data=input.spectrogram;
 for(let frame=1;frame<frames;frame++){
  let all=0,bass=0;
  for(let bin=0;bin<bins;bin++){
   const previous=Number(data[(frame-1)*bins+bin])||0,current=Number(data[frame*bins+bin])||0,d=Math.max(0,current-previous);
   all+=d;if(bin<Math.max(2,Math.floor(bins*.25)))bass+=d;
  }
  full[frame]=all;low[frame]=bass;
 }
 return {full:normalize(full),low:normalize(low),rate:frameRate,duration:frames/frameRate,timeOffset:0};
}

function events(envelope:Float64Array,rate:number):Event[]{
 const values=Array.from(envelope),base=median(values),upper=quantile(values,.75),maximum=Math.max(...values);
 if(!Number.isFinite(base)||maximum<=1e-9)return [];
 // A low threshold keeps sparse drum patterns usable; isolated low-level noise
 // is later rejected by the whole-file periodicity and third coverage checks.
 const threshold=Math.max(.08,Math.min(.42,Math.max(upper*.45,maximum*.06)));
 const result:Event[]=[];
 for(let i=2;i<values.length-2;i++){
  if(values[i]<threshold||values[i]<values[i-1]||values[i]<values[i+1]||values[i]<values[i-2]||values[i]<values[i+2])continue;
  const left=values[i-1],right=values[i+1],denominator=left-2*values[i]+right;
  const offset=denominator?Math.max(-.5,Math.min(.5,.5*(left-right)/denominator)):0;
  result.push({frame:i+offset,time:(i+offset)/rate,weight:values[i]});
 }
 return result;
}
function boundedEvents(source:Event[],limit=600):Event[]{
 if(source.length<=limit)return source;
 // Keep one strong transient in each time bucket. This bounds the search on
 // long uploads while retaining first/middle/end evidence for the fit.
 const result:Event[]=[];
 for(let bucket=0;bucket<limit;bucket++){
  const from=Math.floor(bucket*source.length/limit),to=Math.max(from+1,Math.floor((bucket+1)*source.length/limit));
  let best=source[from];for(let i=from+1;i<to;i++)if(source[i].weight>best.weight)best=source[i];
  result.push(best);
 }
 return result;
}

function alignment(candidatePeriod:number,source:Event[],rate:number,phaseCount=64):{phase:number;score:number;coverage:number}{
 if(!source.length)return {phase:0,score:0,coverage:0};
 const phases=phaseCount,phaseStep=candidatePeriod/phases;
 let best={phase:0,score:-Infinity,coverage:0};
 for(let p=0;p<phases;p++){
  const phase=p*phaseStep;let total=0,aligned=0,covered=0;
  for(const event of source){
   const distance=Math.abs(event.time-phase-Math.round((event.time-phase)/candidatePeriod)*candidatePeriod);
   const d=Math.min(distance,candidatePeriod-distance),weight=event.weight;
   total+=weight;aligned+=weight*Math.exp(-.5*(d/(candidatePeriod*.16))**2);if(d<=candidatePeriod*.2)covered+=weight;
  }
  const score=aligned/Math.max(1e-12,total),coverage=covered/Math.max(1e-12,total);
  if(score>best.score)best={phase,score,coverage};
 }
 return best;
}

function circularPhase(a:number,b:number,period:number):number{
 const aa=2*Math.PI*a/period,bb=2*Math.PI*b/period,x=Math.cos(aa)+2*Math.cos(bb),y=Math.sin(aa)+2*Math.sin(bb);
 return ((Math.atan2(y,x)/(2*Math.PI))*period+period)%period;
}

function autocorrelation(period:number,envelope:Float64Array,rate:number):number{
 const lag=Math.max(1,Math.round(period*rate));if(lag>=envelope.length-2)return 0;
 let xx=0,yy=0,xy=0;
 for(let i=0;i<envelope.length-lag;i++){const a=envelope[i],b=envelope[i+lag];xx+=a*a;yy+=b*b;xy+=a*b;}
 return xy/Math.sqrt(Math.max(1e-12,xx*yy));
}
function eventAutocorrelation(period:number,source:Event[]):number{
 if(source.length<8)return 0;
 const times=source.map(event=>event.time),tolerance=period*.13;
 let matched=0,total=0;
 let cursor=0;
 for(const time of times){
  const target=time+period;
  while(cursor<times.length&&times[cursor]<target-tolerance)cursor++;
  if(cursor<times.length&&Math.abs(times[cursor]-target)<=tolerance)matched++;
  total++;
 }
 return matched/Math.max(1,total);
}
function phaseConcentration(period:number,source:Event[]):number{
 if(source.length<8)return 0;
 let x=0,y=0,total=0;
 for(const event of source){const angle=2*Math.PI*event.time/period;x+=Math.cos(angle)*event.weight;y+=Math.sin(angle)*event.weight;total+=event.weight;}
 return Math.hypot(x,y)/Math.max(1e-12,total);
}
function search(full:Event[],low:Event[],rate:number,duration:number,fullEnvelope:Float64Array,lowEnvelope:Float64Array):Candidate|null{
 if(full.length<8&&low.length<8)return null;
 const mergedEvents=[...full,...low].sort((a,b)=>a.time-b.time);
 const coarse:Candidate[]=[];
 for(let bpm=40;bpm<=300.0001;bpm+=.5){
  const period=60/bpm,f=alignment(period,full,rate,32),l=alignment(period,low,rate,32),envelopeCorrelation=autocorrelation(period,fullEnvelope,rate)*.45+autocorrelation(period,lowEnvelope,rate)*.55,eventCorrelation=eventAutocorrelation(period,mergedEvents);
  const concentration=phaseConcentration(period,full)*.45+phaseConcentration(period,low)*.55;
  const correlation=(envelopeCorrelation*.3+eventCorrelation*.35+concentration*.35);
  coarse.push({period,phase:circularPhase(f.phase,l.phase,period),score:(f.score*.45+l.score*.55)*.85+correlation*.15,fullScore:f.score,lowScore:l.score,coverage:f.coverage*.45+l.coverage*.55,periodicity:correlation,concentration});
 }
 coarse.sort((a,b)=>b.score-a.score);
 const refined:Candidate[]=[];
 const seeds:Candidate[]=[];
 for(const candidate of coarse){
  if(seeds.every(existing=>Math.abs(existing.period-candidate.period)/existing.period>.008))seeds.push(candidate);
  if(seeds.length>=6)break;
 }
 const refinementStep=duration>240?.1:duration>90?.06:.03;
 for(const seed of seeds){
  const from=Math.max(40,60/(seed.period+.006)),to=Math.min(300,60/(seed.period-.006));
  for(let bpm=from;bpm<=to+.0001;bpm+=refinementStep){
   const period=60/bpm,f=alignment(period,full,rate),l=alignment(period,low,rate),envelopeCorrelation=autocorrelation(period,fullEnvelope,rate)*.45+autocorrelation(period,lowEnvelope,rate)*.55,eventCorrelation=eventAutocorrelation(period,mergedEvents);
   const concentration=phaseConcentration(period,full)*.45+phaseConcentration(period,low)*.55;
   const correlation=(envelopeCorrelation*.3+eventCorrelation*.35+concentration*.35);
   refined.push({period,phase:circularPhase(f.phase,l.phase,period),score:(f.score*.45+l.score*.55)*.85+correlation*.15,fullScore:f.score,lowScore:l.score,coverage:f.coverage*.45+l.coverage*.55,periodicity:correlation,concentration});
  }
 }
 refined.sort((a,b)=>b.score-a.score);
 if(!refined.length)return null;
 let best=refined[0];
 // Beat and sub-beat are both valid musical interpretations. A very fast
 // candidate whose low-band evidence is nearly unchanged at half tempo is
 // folded once; callers can still ask the user to relabel 1/2 afterwards.
 const half=refined.find(c=>Math.abs(c.period-best.period*2)<best.period*.025);
 if(best.period<.3&&half&&half.score>=best.score*.55&&half.lowScore>=best.lowScore*.65)best=half;
 return best;
}

function fitGrid(candidate:Candidate,full:Event[],low:Event[],duration:number):SpectralGridResult{
 const period=candidate.period,phase=candidate.phase;
 const source=[...full.map(e=>({...e,weight:e.weight*.45})),...low.map(e=>({...e,weight:e.weight*.55}))].sort((a,b)=>a.time-b.time);
 const byBeat=new Map<number,Event>();
 for(const event of source){
  const beat=Math.round((event.time-phase)/period),distance=Math.abs(event.time-phase-beat*period);
  if(distance>period*.22)continue;
  const old=byBeat.get(beat);if(!old||event.weight>old.weight)byBeat.set(beat,event);
 }
 let points=[...byBeat.entries()].map(([index,event])=>({index,time:event.time})).sort((a,b)=>a.index-b.index);
 if(points.length<12||points.at(-1)!.time-points[0].time<8)return {beats:points.map(p=>p.time),grid:null};
 const thirds=Array.from({length:3},(_,i)=>points.filter(p=>p.time>=duration*i/3&&p.time<duration*(i+1)/3));
 if(thirds.some(part=>part.length<3))return {beats:points.map(p=>p.time),grid:null};
 let origin=0;
 for(let pass=0;pass<3;pass++){
  const n=points.length,meanIndex=points.reduce((s,p)=>s+p.index,0)/n,meanTime=points.reduce((s,p)=>s+p.time,0)/n;
  const denominator=points.reduce((s,p)=>s+(p.index-meanIndex)**2,0);
  if(!denominator)return {beats:points.map(p=>p.time),grid:null};
  const fittedPeriod=points.reduce((s,p)=>s+(p.index-meanIndex)*(p.time-meanTime),0)/denominator;
  if(!Number.isFinite(fittedPeriod)||fittedPeriod<MIN_PERIOD||fittedPeriod>MAX_PERIOD)return {beats:points.map(p=>p.time),grid:null};
  origin=meanTime-fittedPeriod*meanIndex;
  const residuals=points.map(p=>Math.abs(p.time-origin-p.index*fittedPeriod)),threshold=Math.min(fittedPeriod*.22,Math.max(.045,median(residuals)*2.8));
  points=points.filter((p,i)=>residuals[i]<=threshold);
  if(points.length<12)return {beats:points.map(p=>p.time),grid:null};
  candidate.period=fittedPeriod;
 }
 const n=points.length,meanIndex=points.reduce((s,p)=>s+p.index,0)/n,meanTime=points.reduce((s,p)=>s+p.time,0)/n;
 const denominator=points.reduce((s,p)=>s+(p.index-meanIndex)**2,0),fittedPeriod=points.reduce((s,p)=>s+(p.index-meanIndex)*(p.time-meanTime),0)/denominator;
 origin=meanTime-fittedPeriod*meanIndex;
 const residuals=points.map(p=>p.time-origin-p.index*fittedPeriod),errorMs=Math.sqrt(residuals.reduce((s,r)=>s+r*r,0)/n)*1000;
 const offsets=thirds.map(part=>median(part.map(p=>p.time-origin-p.index*fittedPeriod))).filter(Number.isFinite);
 const driftMs=offsets.length>1?(Math.max(...offsets)-Math.min(...offsets))*1000:0;
 const span=Math.max(duration/fittedPeriod,points.at(-1)!.index-points[0].index+1),coverage=points.length/Math.max(1,span);
 const thirdCoverage=Array.from({length:3},(_,i)=>points.filter(p=>p.time>=duration*i/3&&p.time<duration*(i+1)/3).length/(duration/3/fittedPeriod));
 const stable=errorMs<=45&&driftMs<=Math.max(80,fittedPeriod*220)&&candidate.score>=.34&&candidate.coverage>=.42&&candidate.periodicity>=.35&&candidate.concentration>=.12&&coverage>=.75&&thirdCoverage.every(c=>c>=.65);
 const normalized=((origin%(4*fittedPeriod))+4*fittedPeriod)%(4*fittedPeriod);
 const bpm=60/fittedPeriod;
 const grid:AnalyzedGrid={bpm,origin:normalized,errorMs,driftMs,coverage,variable:!stable,beatCount:points.length};
 return {beats:points.map(p=>p.time).sort((a,b)=>a-b),grid:stable?grid:null};
}

/**
 * Estimate a fixed full-track grid from transient evidence. `beats` contains
 * selected measured transients; the ideal equally spaced grid is reported only
 * in `grid`, so consumers never mistake generated markers for zero-error audio
 * detections. Returns a null grid for silence, unstructured noise, short input,
 * missing thirds, or an unstable fit.
 */
export function analyzeSpectralGrid(input:SpectralGridInput):SpectralGridResult{
 const envelope='samples' in input?pcmEnvelope(input):logMelEnvelope(input);
 if(!envelope)return {beats:[],grid:null};
 const locate=(source:Float64Array)=>events(source,envelope.rate).map(e=>({...e,time:e.time+envelope.timeOffset})).filter(e=>e.time<envelope.duration);
 const full=locate(envelope.full),low=locate(envelope.low),candidate=search(boundedEvents(full),boundedEvents(low),envelope.rate,envelope.duration,envelope.full,envelope.low);
 if(!candidate)return {beats:[...new Set([...full,...low].map(e=>e.time))].sort((a,b)=>a-b),grid:null};
 return fitGrid(candidate,full,low,envelope.duration);
}

/** Short alias for callers that already describe the operation as grid fit. */
export const estimateSpectralGrid=analyzeSpectralGrid;
