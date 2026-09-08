export type SyncState = {nextCheck:number;lastSeek:number};
export type SyncAction = {kind:'hold'} | {kind:'rate';rate:number} | {kind:'seek';time:number;rate:number};
export function resetSync(now=0):SyncState{return {nextCheck:now+800,lastSeek:now};}
/** Keep playback continuous. Seeking is a recovery operation, never a frame-by-frame servo. */
export function syncAction(state:SyncState,{now,target,current,baseRate,seeking,ready}:{now:number;target:number;current:number;baseRate:number;seeking:boolean;ready:boolean},mode:'smooth'|'precise'='precise'):SyncAction{
 if(now<state.nextCheck||seeking||!ready)return {kind:'hold'};
 state.nextCheck=now+250;
 const drift=(target-current)/baseRate;
 if(mode==='precise'&&Math.abs(drift)>.65&&now-state.lastSeek>=1800){state.lastSeek=now;state.nextCheck=now+900;return {kind:'seek',time:target,rate:baseRate};}
 const limit=mode==='smooth'?.02:.04;
 const correction=Math.abs(drift)<.025?0:Math.max(-limit,Math.min(limit,drift*.3));
 return {kind:'rate',rate:Math.max(.25,Math.min(4,baseRate*(1+correction)))};
}
