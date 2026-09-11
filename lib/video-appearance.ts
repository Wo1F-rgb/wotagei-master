export type VideoAppearance={gamma:number;contrast:number;skeleton:boolean;tint:boolean};
export const defaultAppearance:VideoAppearance={gamma:1,contrast:1,skeleton:false,tint:false};
export function restoreAppearance(value:unknown):VideoAppearance{
 const v=value as Partial<VideoAppearance>|null;
 const number=(n:unknown,min:number,max:number)=>typeof n==='number'&&Number.isFinite(n)?Math.max(min,Math.min(max,n)):1;
 return {gamma:number(v?.gamma,.6,2.4),contrast:number(v?.contrast,.6,1.6),skeleton:v?.skeleton===true,tint:v?.tint===true};
}
/** A larger gamma brightens shadows while preserving black/white endpoints. */
export function gammaExponent(gamma:number){return 1/restoreAppearance({gamma}).gamma;}
