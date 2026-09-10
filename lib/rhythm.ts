export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
export function beatAt(time: number, origin: number, bpm: number) {
  const index = Math.floor((time - origin) * bpm / 60 + 1e-7);
  return { index, beat: ((index % 8) + 8) % 8 + 1, measure: index>=0?Math.floor(index / 4) + 1:0, technique: index>=0?Math.floor(index / 32) + 1:0 };
}
export function mapSelfTime(referenceTime: number, referenceOrigin: number, selfOrigin: number, referenceBpm: number, selfBpm: number) {
  return selfOrigin + (referenceTime - referenceOrigin) * referenceBpm / selfBpm;
}
export function synchronizedRate(referenceRate: number, referenceBpm: number, selfBpm: number) {
  return referenceRate * referenceBpm / selfBpm;
}
export function comparisonRates(rate:number,referenceBpm:number,selfBpm:number,soundSource:0|1=0){
  return soundSource===1?{reference:rate*selfBpm/referenceBpm,self:rate}:{reference:rate,self:synchronizedRate(rate,referenceBpm,selfBpm)};
}
export function tapTempo(timestamps: number[]) {
  const times=timestamps.slice(-24);
  if(times.length<6)return null;
  const median=(a:number[])=>{a.sort((x,y)=>x-y);const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2;};
  const intervals=times.slice(1).map((t,i)=>t-times[i]);
  if(intervals.some(t=>!Number.isFinite(t)||t<=0))return null;
  const period=median([...intervals]);if(period<180||period>1600)return null;
  const beats=[0];for(const dt of intervals)beats.push(beats[beats.length-1]+Math.max(1,Math.round(dt/period)));
  const slopes:number[]=[];
  for(let i=0;i<times.length;i++)for(let j=i+1;j<times.length;j++)if(beats[j]-beats[i]>=4)slopes.push((times[j]-times[i])/(beats[j]-beats[i]));
  return slopes.length?Math.round(600000/median(slopes))/10:null;
}
export function measureLoop(time: number, origin: number, bpm: number, measures: number, duration: number) {
  const measure = Math.floor((time - origin) * bpm / 240 + 1e-7);
  const rawStart = origin + Math.max(0, measure) * 240 / bpm;
  const start = clamp(rawStart, 0, duration);
  const end = clamp(rawStart + measures * 240 / bpm, 0, duration);
  return { start, end };
}
export function timeLabel(value: number) {
  const n = Math.max(0, Number.isFinite(value) ? value : 0);
  return `${Math.floor(n / 60).toString().padStart(2, '0')}:${(n % 60).toFixed(1).padStart(4, '0')}`;
}
