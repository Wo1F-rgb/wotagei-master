import detect from '@audio/beat-detect';
import tempo from '@audio/beat-tempo';
export type AnalysisWindow={samples:Float32Array;sampleRate:number;start:number};
export type BpmCandidate={bpm:number;support:number;total:number;strength:number};
export type BpmAnalysis={candidates:BpmCandidate[];windows:number;status:'consistent'|'uncertain';engine:string};
function median(values:number[]){const a=[...values].sort((x,y)=>x-y);return a.length?a[Math.floor(a.length/2)]:0;}
function onsetWeights(onsets:Float64Array,w:AnalysisWindow){return Array.from(onsets,t=>{let energy=0;const start=Math.max(0,Math.floor((t+.01)*w.sampleRate)),end=Math.min(w.samples.length,start+Math.floor(w.sampleRate*.09));for(let i=start;i<end;i++)energy+=w.samples[i]*w.samples[i];return energy/Math.max(1,end-start);});}
function periodicity(onsets:Float64Array,weights:number[],bpm:number){let x=0,y=0,total=0;for(let i=0;i<onsets.length;i++){const a=onsets[i]*bpm/60*Math.PI*2,weight=weights[i];x+=Math.cos(a)*weight;y+=Math.sin(a)*weight;total+=weight;}return Math.hypot(x,y)/Math.max(1e-12,total);}
function refine(onsets:Float64Array,bpm:number){const periods:number[]=[];for(let i=0;i<onsets.length;i++){for(let j=i+1;j<Math.min(i+24,onsets.length);j++){const dt=onsets[j]-onsets[i],beats=Math.round(dt*bpm/60);if(beats>=4&&beats<=24&&Math.abs(dt-beats*60/bpm)<60/bpm*.13)periods.push(dt/beats);}}return periods.length>=6?60/median(periods):bpm;}
function fitGrid(onsets:Float64Array,weights:number[],initial:number){
 let bpm=initial;
 for(let pass=0;pass<2;pass++){
  let x=0,y=0;for(let i=0;i<onsets.length;i++){const angle=onsets[i]*bpm/60*2*Math.PI;x+=Math.cos(angle)*weights[i];y+=Math.sin(angle)*weights[i];}
  const period=60/bpm,phase=Math.atan2(y,x)/(2*Math.PI)*period;
  let sum=0,sn=0,st=0,snn=0,snt=0,count=0;
  for(let i=0;i<onsets.length;i++){const t=onsets[i],n=Math.round((t-phase)/period),weight=weights[i];if(Math.abs(t-phase-n*period)>period*.16)continue;sum+=weight;sn+=n*weight;st+=t*weight;snn+=n*n*weight;snt+=n*t*weight;count++;}
  const denominator=sum*snn-sn*sn;if(count<8||denominator<=0)break;
  const fitted=60/((sum*snt-sn*st)/denominator);if(!Number.isFinite(fitted)||Math.abs(fitted/bpm-1)>.025)break;bpm=fitted;
 }
 return bpm;
}
export function analyzeWindows(windows:AnalysisWindow[]):BpmAnalysis{
 const evidence:{bpm:number;strength:number;window:number;vote:number}[]=[];let usable=0;
 for(const [wi,w] of windows.entries()){
  if(w.samples.length/w.sampleRate<8)continue;
  let energy=0;for(const n of w.samples)energy+=n*n;if(energy/w.samples.length<1e-7)continue;
  const options={fs:w.sampleRate,frameSize:1024,hopSize:256,minBpm:55,maxBpm:250};
  const d=detect(w.samples,options),t=tempo(w.samples,{...options,candidates:4});
  if(d.onsets.length<8)continue;usable++;const weights=onsetWeights(d.onsets,w);
  const initial=[{bpm:d.bpm,vote:1},{bpm:t.bpm,vote:1.1},...(t.candidates||[]).slice(0,3).map(c=>({bpm:c.bpm,vote:.4}))];
  const candidates=new Map<number,number>();
  for(const c of initial)for(const multiplier of [1,.5,2]){const b=c.bpm*multiplier;if(b>=40&&b<=300){const key=Math.round(b);candidates.set(key,Math.max(candidates.get(key)||0,c.vote*(multiplier===1?1:.7)));}}
  for(const [b,vote] of candidates){const refined=fitGrid(d.onsets,weights,refine(d.onsets,b)),strength=periodicity(d.onsets,weights,refined);if(strength>.23)evidence.push({bpm:refined,strength,window:wi,vote});}
 }
 if(!usable||!evidence.length)throw new Error('拍を安定して検出できませんでした。ドラムが聞こえる音源か、別の区間で試してください。');
 const groups:{entries:typeof evidence;bpm:number}[]=[];
 for(const e of evidence.sort((a,b)=>b.strength*b.vote-a.strength*a.vote)){let g=groups.find(g=>Math.abs(g.bpm-e.bpm)<Math.max(1,g.bpm*.012));if(!g){g={bpm:e.bpm,entries:[]};groups.push(g);}if(!g.entries.some(x=>x.window===e.window))g.entries.push(e);g.bpm=median(g.entries.map(x=>x.bpm));}
 const ranked=groups.map(g=>({bpm:Math.round(g.bpm*10)/10,support:g.entries.length,total:usable,strength:g.entries.reduce((n,e)=>n+e.strength,0)/g.entries.length,score:g.entries.reduce((n,e)=>n+e.strength*e.vote,0)})).sort((a,b)=>b.score-a.score);
 const best=ranked[0];if(!best||best.strength<.3)throw new Error('解析候補が安定しませんでした。音が明瞭なMP3・M4A・WAVか、曲ライブラリを使ってください。');
 const candidates=ranked.slice(0,3).map(({score,...c})=>c);
 // Half/double tempo ambiguity is musical, not a probability; never label the normalized library score as accuracy.
 return {candidates,windows:usable,status:best.support===usable&&usable>=2&&best.strength>.55?'consistent':'uncertain',engine:'@audio/beat-detect + @audio/beat-tempo'};
}
