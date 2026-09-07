export function timelineShift(originalOrigin:number,dragPixels:number,pixelsPerSecond:number,sourceBpm:number,referenceBpm:number,duration:number){
 // Moving a source track right delays its contents, so source time at the reference origin decreases.
 return Math.max(0,Math.min(duration,originalOrigin-dragPixels/pixelsPerSecond*referenceBpm/sourceBpm));
}
export function trackBounds(duration:number,origin:number,sourceBpm:number,referenceBpm:number,referenceOrigin:number){return {start:referenceOrigin-origin*sourceBpm/referenceBpm,end:referenceOrigin+(duration-origin)*sourceBpm/referenceBpm};}
