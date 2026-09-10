export const MIN_PRACTICE_RATE=.25;
export const MAX_PRACTICE_RATE=2.5;
export const PRACTICE_RATE_PRESETS=Array.from({length:10},(_,i)=>(i+1)/4);
/** Keep a fine/YouTube-adjusted current value visible without rounding the actual setting. */
export function practiceRateOptions(current:number){
 return Number.isFinite(current)&&current>0&&!PRACTICE_RATE_PRESETS.includes(current)?[...PRACTICE_RATE_PRESETS,current].sort((a,b)=>a-b):PRACTICE_RATE_PRESETS;
}
