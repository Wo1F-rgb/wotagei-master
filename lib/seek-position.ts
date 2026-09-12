type Media={currentTime:number;seeking?:boolean;src?:string;currentSrc?:string};
const identity=(media:Media)=>`${media.src||''}\n${media.currentSrc||''}`;
/** Preserve an explicit seek destination while the native clock still reports
 * the old frame. Used for coordinating commands, never as a displayed clock. */
export class SeekPositions {
 private pending=new WeakMap<Media,{time:number;source:string}>();
 seek(media:Media,time:number){
  this.pending.set(media,{time,source:identity(media)});
  try{media.currentTime=time;}catch(error){this.pending.delete(media);throw error;}
 }
 read(media:Media){
  const target=this.pending.get(media);
  if(target&&target.source===identity(media))return target.time;
  this.pending.delete(media);return media.currentTime;
 }
 clear(media:Media){this.pending.delete(media);}
 settled(media:Media){
  const target=this.pending.get(media);
  if(target&&(target.source!==identity(media)||(!media.seeking&&Math.abs(media.currentTime-target.time)<.001)))this.pending.delete(media);
 }
}
