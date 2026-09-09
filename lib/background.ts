export type BackgroundSettings={mode:'off'|'person'|'green';threshold:number;preview:'green'|'transparent'};
export const defaultBackground:BackgroundSettings={mode:'off',threshold:.5,preview:'green'};
export function restoreBackground(value:unknown):BackgroundSettings{
 const v=value as Partial<BackgroundSettings>|null;
 return {mode:v?.mode==='person'||v?.mode==='green'?v.mode:'off',threshold:typeof v?.threshold==='number'&&Number.isFinite(v.threshold)?Math.max(.1,Math.min(.9,v.threshold)):.5,preview:v?.preview==='transparent'?'transparent':'green'};
}
const smooth=(low:number,high:number,value:number)=>{const t=Math.max(0,Math.min(1,(value-low)/(high-low)));return t*t*(3-2*t);};
/** Soft alpha from a foreground confidence mask; uncertain boundaries stay antialiased. */
export function maskAlpha(confidence:Float32Array,threshold:number){
 const rgba=new Uint8ClampedArray(confidence.length*4);
 for(let i=0;i<confidence.length;i++)rgba[i*4+3]=Number.isFinite(confidence[i])?255*smooth(threshold-.12,threshold+.12,confidence[i]):0;
 return rgba;
}
/** Chroma key preserves neutral/skin colors; strength controls green dominance required. */
export function removeGreen(rgba:Uint8ClampedArray,strength:number){
 const low=.30-strength*.28;
 for(let i=0;i<rgba.length;i+=4){
  const r=rgba[i]/255,g=rgba[i+1]/255,b=rgba[i+2]/255;
  const dominance=g-Math.max(r,b),key=smooth(low,low+.12,dominance)*smooth(.08,.22,g);
  rgba[i+3]*=1-key;
  // Reduce green fringing only where the key has actually removed some background.
  rgba[i+1]=255*(g-key*Math.max(0,g-(r+b)/2));
 }
 return rgba;
}
export function containRect(sw:number,sh:number,width:number,height:number){const scale=Math.min(width/sw,height/sh);return {x:(width-sw*scale)/2,y:(height-sh*scale)/2,width:sw*scale,height:sh*scale};}
/** Allow one source frame of quantization plus 80 ms of processing, never a beat-old picture. */
export function cutoutIsCurrent(frameTime:number,currentTime:number,rate:number){
 if(![frameTime,currentTime,rate].every(Number.isFinite)||rate<=0)return false;
 const lag=currentTime-frameTime;return lag>=-.04&&lag<=.04+.08*rate;
}
