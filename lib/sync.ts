export type SyncState = {nextCheck:number;lastSeek:number;driftSince:number|null;driftSign:number};
export type SyncAction = {kind:'hold'} | {kind:'rate';rate:number} | {kind:'seek';time:number;rate:number};
export function resetSync(now=0):SyncState{return {nextCheck:now+800,lastSeek:now,driftSince:null,driftSign:0};}
/** Keep playback continuous. Seeking is a recovery operation, never a frame-by-frame servo. */
export function syncAction(state:SyncState,{now,target,current,baseRate,seeking,ready}:{now:number;target:number;current:number;baseRate:number;seeking:boolean;ready:boolean},mode:'smooth'|'precise'='precise'):SyncAction{
 if(![now,target,current,baseRate].every(Number.isFinite)||baseRate<=0)return {kind:'hold'};
 if(seeking||!ready){state.driftSince=null;return {kind:'hold'};}
 if(now<state.nextCheck)return {kind:'hold'};
 state.nextCheck=now+250;
 const drift=(target-current)/baseRate;
 if(Math.abs(drift)>.12){if(state.driftSince===null||state.driftSign!==Math.sign(drift))state.driftSince=now;state.driftSign=Math.sign(drift);}else state.driftSince=null;
 // At 2%, a 400 ms (one-beat) lag takes 20 seconds to remove. Recover both decoders
 // once after sustained skew; callers must wait for their seeks before restarting.
 const persistent=state.driftSince!==null&&now-state.driftSince>=500;
 if((persistent||(mode==='precise'&&Math.abs(drift)>.65))&&now-state.lastSeek>=1800){state.lastSeek=now;state.nextCheck=now+900;state.driftSince=null;return {kind:'seek',time:target,rate:baseRate};}
 const limit=mode==='smooth'?.02:.04;
 const correction=Math.abs(drift)<.025?0:Math.max(-limit,Math.min(limit,drift*.3));
 return {kind:'rate',rate:Math.max(.25,Math.min(4,baseRate*(1+correction)))};
}
