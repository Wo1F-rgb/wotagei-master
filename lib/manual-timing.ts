export const NUDGE_SECONDS=.001;
export const NUDGE_STEPS=[.0005,.001,.005,.01,.05,.1] as const;
export const NUDGE_STEP_KEY='wotagei:nudge-step';
export function restoreNudgeStep(value:unknown):number{return NUDGE_STEPS.some(step=>step===value)?value as number:NUDGE_SECONDS;}
export function nudgeSecondsLabel(value:number):string{return value.toFixed(4).replace(/0+$/,'').replace(/\.$/,'');}
export type NudgeResult={index:0|1;delta:number;origin?:number;reason?:string};

/** Move a source's beat grid within its own song; playback positions are not inputs. */
export function nudgeBeatOrigin(origins:number[],durations:number[],master:0|1,direction:-1|1,step=NUDGE_SECONDS):NudgeResult{
 const index=master===0?1:0,delta=direction*restoreNudgeStep(step),duration=durations[index];
 if(![origins[index],duration].every(Number.isFinite)||duration<=0)return {index,delta:0,reason:'動画の準備が必要です'};
 const origin=Math.round((origins[index]+delta)*1e9)/1e9;
 if(origin<0)return {index,delta:0,reason:'先頭です · 変更なし'};
 if(origin>=duration)return {index,delta:0,reason:'末尾です · 変更なし'};
 return {index,delta,origin};
}
