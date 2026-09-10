import {comparisonRates} from './rhythm.ts';
import {MIN_PRACTICE_RATE,MAX_PRACTICE_RATE} from './practice-rate.ts';

type RateMedia={playbackRate:number;confirmedPlaybackRate?:number;rates:number[]};
export function closestYouTubeRate(available:number[],referenceBpm:number,selfBpm:number,sound:0|1,preferred=1){
 if(![referenceBpm,selfBpm,preferred].every(n=>Number.isFinite(n)&&n>0))return null;
 return available.filter(n=>Number.isFinite(n)&&n>0).map(reference=>{
  const rate=reference*(sound===1?referenceBpm/selfBpm:1);
  return {rate,...comparisonRates(rate,referenceBpm,selfBpm,sound),reference};
 }).filter(v=>v.rate>=MIN_PRACTICE_RATE&&v.rate<=MAX_PRACTICE_RATE&&v.reference>=.25&&v.reference<=4&&v.self>=.25&&v.self<=4)
 .sort((a,b)=>Math.abs(a.rate-preferred)-Math.abs(b.rate-preferred)||a.rate-b.rate)[0]||null;
}

/** The advertised presets are not exhaustive on all players. Verify the requested rate first. */
export async function resolveYouTubeRate(media:RateMedia,referenceBpm:number,selfBpm:number,sound:0|1,preferred:number,isCurrent:()=>boolean){
 const desired=comparisonRates(preferred,referenceBpm,selfBpm,sound);
 async function accepted(value:number){
  if(!isCurrent())return false;
  media.playbackRate=value;
  const deadline=Date.now()+650;
  do{
   await new Promise(resolve=>setTimeout(resolve,25));
   if(!isCurrent())return false;
   if(Math.abs((media.confirmedPlaybackRate??media.playbackRate)-value)<.0001&&Math.abs(media.playbackRate-value)<.0001)return true;
  }while(Date.now()<deadline);
  return false;
 }
 if(desired.reference>=.25&&desired.reference<=4&&desired.self>=.25&&desired.self<=4&&await accepted(desired.reference))return {rate:preferred,...desired,fallback:false};
 if(!isCurrent())return null;
 // Current players can accept 0.05 steps omitted from their preset list, but round finer ratios.
 // Confirm the closest step, and use it for BOTH media rates so rounding cannot accumulate drift.
 const fine=closestYouTubeRate([Math.round(desired.reference*20)/20],referenceBpm,selfBpm,sound,preferred);
 if(fine&&await accepted(fine.reference))return {...fine,fallback:true};
 if(!isCurrent())return null;
 const fallback=closestYouTubeRate(media.rates,referenceBpm,selfBpm,sound,preferred);
 if(!fallback||!await accepted(fallback.reference)){
  if(!isCurrent())return null;
  throw new Error('YouTubeの速度を確認できませんでした。動画内で一度再生してから、もう一度試してください。');
 }
 return {...fallback,fallback:true};
}
