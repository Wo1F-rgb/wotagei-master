export function clampMediaTime(time:number,duration:number){
 const limit=Number.isFinite(duration)&&duration>0?duration:0;
 if(!Number.isFinite(time))return 0;
 return Math.min(limit,Math.max(0,time));
}

export function formatMediaTime(time:number){
 const seconds=Math.max(0,Math.floor(Number.isFinite(time)?time:0));
 const minutes=Math.floor(seconds/60);
 return `${minutes}:${String(seconds%60).padStart(2,'0')}`;
}
