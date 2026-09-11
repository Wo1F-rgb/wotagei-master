/** Nearest analysed beat or midpoint. The anchor is independent of the movable dance 1. */
export function fitBeatOrigin(position:number,bpm:number,anchor:number,duration:number){
 if(![position,bpm,anchor,duration].every(Number.isFinite)||bpm<40||bpm>300||duration<=0||anchor<0||anchor>duration)return null;
 const half=30/bpm,min=Math.ceil(-anchor/half),max=Math.floor((duration-anchor)/half);
 if(min>max)return null;
 const index=Math.max(min,Math.min(max,Math.round((position-anchor)/half)));
 const time=anchor+index*half;
 return {time:Math.max(0,Math.min(duration,time)),kind:Math.abs(index%2)===0?'beat' as const:'midpoint' as const};
}
