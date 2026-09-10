export const NUDGE_SECONDS=.001;
type Media={currentTime:number;duration:number};
export type NudgeResult={index:0|1;delta:number;origin?:number;time?:number;reason?:string};

/** Advance/delay only the silent follower. Never seek or pause the audible master. */
export function nudgeFollower(media:(Media|null)[],origins:number[],master:0|1,direction:-1|1,pendingTime?:number):NudgeResult{
 const index=master===0?1:0,el=media[index],delta=-direction*NUDGE_SECONDS;
 if(!el||![origins[index],el.currentTime,el.duration].every(Number.isFinite)||el.duration<=0)return {index,delta:0,reason:'動画の準備が必要です'};
 const origin=Math.round((origins[index]+delta)*1e9)/1e9,time=Math.round(((pendingTime??el.currentTime)+delta)*1e6)/1e6;
 if(!Number.isFinite(time))return {index,delta:0,reason:'動画の準備が必要です'};
 // Reject a whole step at the edge instead of silently applying less than 1 ms.
 if(origin<0||time<0)return {index,delta:0,reason:'先頭です · 変更なし'};
 if(origin>=el.duration||time>=el.duration)return {index,delta:0,reason:'末尾です · 変更なし'};
 try{el.currentTime=time;}catch{return {index,delta:0,reason:'移動できませんでした'};}
 return {index,delta,origin,time};
}
