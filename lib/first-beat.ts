/** Both manually chosen downbeats describe the same musical instant. */
export function firstBeatStart(origins:number[],bpm:number[],durations:number[],leadBeats=0):[number,number]{
 if(origins.length!==2||bpm.length!==2||durations.length!==2||!Number.isFinite(leadBeats)||leadBeats<0||origins.some((v,i)=>!Number.isFinite(v)||v<0||!Number.isFinite(durations[i])||v>=durations[i])||bpm.some(v=>!Number.isFinite(v)||v<=0))throw new Error('2本の動画の範囲内で1拍目とBPMを設定してください。');
 const lead=Math.min(leadBeats,origins[0]*bpm[0]/60,origins[1]*bpm[1]/60);
 return [origins[0]-lead*60/bpm[0],origins[1]-lead*60/bpm[1]];
}
