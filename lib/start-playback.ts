type Media={currentTime:number;duration:number;play:()=>Promise<void>};
type PreparedMedia=Media&{pause:()=>void;muted:boolean;readyState:number;seeking:boolean;playbackRate:number;addEventListener:unknown};
const preparable=(media:Media):media is PreparedMedia=>typeof (media as PreparedMedia).pause==='function'&&typeof (media as PreparedMedia).addEventListener==='function';
class CanceledStart extends Error{}
/** Keep cancellation responsive even when an iPhone decoder's play promise is still pending. */
function waitCurrent<T>(work:Promise<T>,isCurrent:()=>boolean):Promise<T>{
 return new Promise((resolve,reject)=>{
  const poll=setInterval(()=>{if(!isCurrent())finish(new CanceledStart());},20);
  const timeout=setTimeout(()=>finish(new Error('開始位置の読み込みが間に合いませんでした。動画を短くするか軽量化して試してください。')),8000);
  let finished=false;
  function finish(error?:unknown,value?:T){if(finished)return;finished=true;clearInterval(poll);clearTimeout(timeout);if(error)reject(error);else resolve(value as T);}
  work.then(value=>finish(undefined,value),error=>finish(error));
 });
}
function waitReady(media:PreparedMedia,target:number,isCurrent:()=>boolean):Promise<void>{
 return new Promise((resolve,reject)=>{
  const deadline=Date.now()+8000;
  const check=()=>{
   if(!isCurrent()){reject(new CanceledStart());return;}
   if(!media.seeking&&media.readyState>=2&&Math.abs(media.currentTime-target)<.035){resolve();return;}
   if(Date.now()>=deadline){reject(new Error('動画の開始フレームを準備できませんでした。動画を軽量化して試してください。'));return;}
   setTimeout(check,20);
  };
  // A seek may update currentTime before its decoding/seek events have started.
  setTimeout(check,20);
 });
}
/** Prepare the requested positions once. Do not retry/rewind to chase clock differences. */
async function startPrepared(reference:PreparedMedia,self:PreparedMedia,targetSelf:(t:number)=>number,isCurrent:()=>boolean){
 const start=reference.currentTime,ownStart=targetSelf(start),muted=[reference.muted,self.muted];
 let accepted=false;
 reference.pause();self.pause();reference.muted=true;self.muted=true;
 try{
  // Invoke both play() calls synchronously, before awaiting, to retain iPhone gesture authorization.
  const warm=(media:PreparedMedia)=>media.play().then(()=>{if(isCurrent())media.pause();});
  await waitCurrent(Promise.all([warm(reference),warm(self)]),isCurrent);
  if(!isCurrent())throw new CanceledStart();
  reference.pause();self.pause();reference.currentTime=start;self.currentTime=ownStart;
  await Promise.all([waitReady(reference,start,isCurrent),waitReady(self,ownStart,isCurrent)]);
  if(!isCurrent())throw new CanceledStart();
  await waitCurrent(Promise.all([reference.play(),self.play()]),isCurrent);
  if(!isCurrent())throw new CanceledStart();
  accepted=true;return true;
 }catch(error){if(error instanceof CanceledStart)return false;throw error;}
 finally{
  if(isCurrent()){
   if(!accepted){reference.pause();self.pause();reference.currentTime=start;self.currentTime=ownStart;}
   reference.muted=muted[0];self.muted=muted[1];
  }
 }
}
/** Local files use a preparation barrier. An embedded player exposes no decoded-frame readiness. */
export async function startComparison(reference:Media,self:Media|null,targetSelf:(t:number)=>number,selfRate:number,isCurrent:()=>boolean,rateReady?:Promise<void>){
 if(!isCurrent())return false;
 const initialTarget=targetSelf(reference.currentTime);
 if(self&&initialTarget>=0&&initialTarget<self.duration&&preparable(reference)&&preparable(self))return startPrepared(reference,self,targetSelf,isCurrent);
 const referenceStart=reference.play();
 const target=targetSelf(reference.currentTime);
 const selfStart=self&&target>=0&&target<self.duration?self.play():Promise.resolve();
 await Promise.all([referenceStart,selfStart,rateReady]);
 if(!isCurrent())return false;
 if(self)correctFollower(reference,self,targetSelf,selfRate);
 return true;
}
export function correctFollower(reference:Media,self:Media,targetSelf:(t:number)=>number,selfRate:number){
 const target=targetSelf(reference.currentTime);
 if(target>=0&&target<self.duration&&Math.abs(target-self.currentTime)>selfRate*.025)self.currentTime=target;
}
