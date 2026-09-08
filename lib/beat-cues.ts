/** The same source-time grid used by the white markers. Delays are real playback seconds. */
export function upcomingBeatCues(time:number,origin:number,bpm:number,rate:number,horizon=.09){
 if(![time,origin,bpm,rate,horizon].every(Number.isFinite)||bpm<=0||rate<=0||horizon<0)return [];
 const period=60/bpm,first=Math.max(0,Math.ceil((time-origin-.005*rate)/period));
 const cues:{index:number;delay:number}[]=[];
 for(let index=first;index<first+16;index++){
  const delay=(origin+index*period-time)/rate;
  if(delay>horizon)break;
  cues.push({index,delay:Math.max(0,delay)});
 }
 return cues;
}
