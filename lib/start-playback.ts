type Media={currentTime:number;duration:number;play:()=>Promise<void>};
/** Start together, then correct startup latency once. Continuous playback must not repeat this seek. */
export async function startComparison(reference:Media,self:Media|null,targetSelf:(t:number)=>number,selfRate:number,isCurrent:()=>boolean){
 const referenceStart=reference.play();
 const target=targetSelf(reference.currentTime);
 const selfStart=self&&target>=0&&target<self.duration?self.play():Promise.resolve();
 await Promise.all([referenceStart,selfStart]);
 if(!isCurrent())return false;
 if(self)correctFollower(reference,self,targetSelf,selfRate);
 return true;
}
export function correctFollower(reference:Media,self:Media,targetSelf:(t:number)=>number,selfRate:number){
 const target=targetSelf(reference.currentTime);
 if(target>=0&&target<self.duration&&Math.abs(target-self.currentTime)>selfRate*.025)self.currentTime=target;
}
/** A resumed decoder must catch up to the running reference, including after its play promise resolves. */
export async function resumeFollower(reference:Media,self:Media,targetSelf:(t:number)=>number,selfRate:number,isCurrent:()=>boolean){
 if(!isCurrent())return;
 correctFollower(reference,self,targetSelf,selfRate);
 await self.play();
 if(isCurrent())correctFollower(reference,self,targetSelf,selfRate);
}
