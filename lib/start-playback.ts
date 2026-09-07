type Media={currentTime:number;duration:number;play:()=>Promise<void>};
/** Start together, then correct startup latency once. Continuous playback must not repeat this seek. */
export async function startComparison(reference:Media,self:Media|null,targetSelf:(t:number)=>number,selfRate:number,isCurrent:()=>boolean){
 const referenceStart=reference.play();
 const target=targetSelf(reference.currentTime);
 const selfStart=self&&target>=0&&target<self.duration?self.play():Promise.resolve();
 await Promise.all([referenceStart,selfStart]);
 if(!isCurrent())return false;
 if(self){const currentTarget=targetSelf(reference.currentTime);if(currentTarget>=0&&currentTarget<self.duration&&Math.abs(currentTarget-self.currentTime)>selfRate*.12)self.currentTime=currentTarget;}
 return true;
}
