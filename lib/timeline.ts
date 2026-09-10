export function timelineShift(originalOrigin:number,dragPixels:number,pixelsPerSecond:number,sourceBpm:number,referenceBpm:number,duration:number){
 // Drag the white beats over fixed source contents, in that source's seconds.
 return Math.max(0,Math.min(duration,originalOrigin+dragPixels/pixelsPerSecond*referenceBpm/sourceBpm));
}
export function trackBounds(duration:number,origin:number,sourceBpm:number,referenceBpm:number,referenceOrigin:number){return {start:referenceOrigin-origin*sourceBpm/referenceBpm,end:referenceOrigin+(duration-origin)*sourceBpm/referenceBpm};}

/** Project each source's actual clock onto the shared cursor, without assuming it is synced. */
export function trackBeatGrid(time:number,origin:number,bpm:number,referenceBpm:number,cursor:number,start:number,span:number){
 const scale=bpm/referenceBpm,one=cursor+(origin-time)*scale,period=60/referenceBpm;
 const first=Math.floor((start-one)/period),last=Math.ceil((start+span-one)/period);
 return {one,ticks:Array.from({length:Math.max(0,last-first+1)},(_,i)=>{const index=first+i;return {index,time:one+index*period};})};
}
