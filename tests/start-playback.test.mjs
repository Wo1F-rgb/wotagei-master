import test from 'node:test';import assert from 'node:assert/strict';import {correctFollower,startComparison,startDelayedFollower} from '../lib/start-playback.ts';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
class ResumeMedia {
 duration=60;readyState=4;seeking=false;playbackRate=1;muted=false;paused=true;value=2;since=0;starts=0;seeks=0;pauses=0;src='clip.mp4';currentSrc='clip.mp4';playDelay=0;
 addEventListener(){}
 get currentTime(){return this.value+(this.paused?0:Math.max(0,(performance.now()-this.since)/1000)*this.playbackRate);}
 set currentTime(value){this.value=value;this.since=performance.now();this.seeks++;}
 pause(){this.value=this.currentTime;this.paused=true;this.pauses++;}
 async play(){this.starts++;if(this.playDelay)await delay(this.playDelay);this.since=performance.now();this.paused=false;}
}
test('a prepared pair resumes repeatedly immediately without muted warmups or rewinds',async()=>{
 const r=new ResumeMedia(),s=new ResumeMedia();s.playbackRate=150.119/139.879;
 const map=t=>1+(t-2)*s.playbackRate;
 assert.equal(await startComparison(r,s,map,s.playbackRate,()=>true),true);r.pause();s.pause();
 for(let i=0;i<5;i++){
  const before=[r.starts,s.starts,r.seeks,s.seeks,r.pauses,s.pauses];
  const work=startComparison(r,s,map,s.playbackRate,()=>true);
  assert.equal(r.paused,false,'reference starts immediately, before the clock audit finishes');
  assert.equal(s.paused,false,'follower starts immediately, before the clock audit finishes');
  assert.equal(await work,true);
  assert.deepEqual([r.starts,s.starts,r.seeks,s.seeks,r.pauses,s.pauses],[before[0]+1,before[1]+1,...before.slice(2)]);
  await delay(20);r.pause();s.pause();assert.ok(Math.abs(map(r.currentTime)-s.currentTime)<.025*s.playbackRate);
 }
 // A new source in the same video element must receive its own preparation.
 s.src='replacement.mp4';const before=s.seeks;
 assert.equal(await startComparison(r,s,map,s.playbackRate,()=>true),true);assert.equal(s.seeks,before+1);r.pause();s.pause();
});
test('warm resume corrects asymmetric decoder launch once, without another seek',async()=>{
 const r=new ResumeMedia(),s=new ResumeMedia();s.playbackRate=1.25;const map=t=>t*1.25;
 await startComparison(r,s,map,1.25,()=>true);r.pause();s.pause();s.playDelay=80;
 const seeks=[r.seeks,s.seeks],starts=[r.starts,s.starts];await startComparison(r,s,map,1.25,()=>true);
 assert.deepEqual([r.seeks,s.seeks],seeks);assert.deepEqual([r.starts,s.starts],[starts[0]+2,starts[1]+1]);
 assert.ok(Math.abs(map(r.currentTime)-s.currentTime)<.03);r.pause();s.pause();
});
test('warm resume observes an audio-clock stall after play has already resolved',async()=>{
 const r=new ResumeMedia(),s=new ResumeMedia();s.playbackRate=1.25;const map=t=>t*1.25;
 await startComparison(r,s,map,1.25,()=>true);r.pause();s.pause();
 // The promise resolves immediately, but the audio clock starts 110ms later.
 s.play=async()=>{s.starts++;s.since=performance.now()+110;s.paused=false;};
 const seeks=[r.seeks,s.seeks],starts=[r.starts,s.starts];
 const work=startComparison(r,s,map,1.25,()=>true);assert.equal(r.paused,false);assert.equal(s.paused,false);
 await work;await delay(150);
 assert.ok(Math.abs(map(r.currentTime)-s.currentTime)<.03,'late clock start must not leave a persistent phase error');
 assert.deepEqual([r.seeks,s.seeks],seeks);assert.deepEqual([r.starts,s.starts],[starts[0]+2,starts[1]+1]);r.pause();s.pause();
});
test('canceling a warm start leaves replacement media untouched',async()=>{
 const r=new ResumeMedia(),s=new ResumeMedia();await startComparison(r,s,t=>t,1,()=>true);r.pause();s.pause();
 let current=true,release;const waiting=new Promise(resolve=>release=resolve);s.play=()=>waiting;
 const seeks=[r.seeks,s.seeks],task=startComparison(r,s,t=>t,1,()=>current);current=false;
 assert.equal(await task,false);r.pause();s.pause();r.value=9;s.value=10;release();await delay(30);
 assert.deepEqual([r.seeks,s.seeks],seeks);assert.equal(r.currentTime,9);assert.equal(s.currentTime,10);
});
test('unequal decoder startup delays are corrected once after both play promises resolve',async()=>{
 let value=0,seeks=0;const reference={currentTime:0,duration:20,async play(){await Promise.resolve();this.currentTime=.4;}};
 const self={duration:20,async play(){value=.05;},get currentTime(){return value;},set currentTime(t){value=t;seeks++;}};
 assert.equal(await startComparison(reference,self,t=>t*1.25,1.25,()=>true),true);assert.equal(value,.5);assert.equal(seeks,1);
});
test('a canceled start cannot seek a newly loaded or newly playing video',async()=>{
 const r={currentTime:1,duration:20,async play(){}},s={currentTime:0,duration:20,async play(){}};
 assert.equal(await startComparison(r,s,t=>t,1,()=>false),false);assert.equal(s.currentTime,0);
});
test('a self video whose mapped start is in the future stays paused',async()=>{
 let played=false;const r={currentTime:0,duration:20,async play(){}},s={currentTime:0,duration:20,async play(){played=true;}};
 await startComparison(r,s,t=>t-2,1,()=>true);assert.equal(played,false);assert.equal(s.currentTime,0);
});

test('a prepared local pair waits for decoded frames and aligns delayed clocks without a second seek',async()=>{
 const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 class Prepared {
  duration=30;readyState=4;seeking=false;playbackRate=1;muted=false;paused=true;value=2;since=0;starts=0;seeks=[];
  constructor(playDelay=0,seekDelay=0){this.playDelay=playDelay;this.seekDelay=seekDelay;}
  addEventListener(){}
  get currentTime(){return this.value+(this.paused||this.seeking?0:(performance.now()-this.since)/1000*this.playbackRate);}
  set currentTime(value){this.seeks.push({value,paused:this.paused,muted:this.muted});this.value=value;this.since=performance.now();this.seeking=true;this.readyState=2;void delay(this.seekDelay).then(()=>{this.since=performance.now();this.seeking=false;this.readyState=4;});}
  pause(){this.value=this.currentTime;this.paused=true;}
  async play(){this.starts++;await delay(this.playDelay);this.since=performance.now();this.paused=false;}
 }
 const reference=new Prepared(2,8),self=new Prepared(80,140);self.value=1.7;self.playbackRate=1.25;
 const started=await startComparison(reference,self,t=>3+(t-2)*1.25,1.25,()=>true);
 assert.equal(started,true);assert.equal(reference.starts,3);assert.equal(self.starts,2);
 assert.ok(reference.seeks.every(seek=>seek.paused&&seek.muted));
 assert.equal(self.seeks.length,1,'the slow player is positioned once, with no new decode delay from a correction seek');
 assert.ok(self.seeks[0].paused&&self.seeks[0].muted);
 const phaseError=Math.abs(self.currentTime-(3+(reference.currentTime-2)*1.25));
 assert.ok(phaseError<.07,`a 140ms decode seek must not leave that delay behind: ${phaseError}s`);
 assert.equal(reference.muted,false);assert.equal(self.muted,false);
});

test('a normal pair waits for rateReady before its single correction seek',async()=>{
 let release;const rateReady=new Promise(resolve=>{release=resolve});let selfTime=.8,seeks=0;
 const reference={currentTime:1,duration:20,async play(){}},self={duration:20,async play(){},get currentTime(){return selfTime;},set currentTime(value){selfTime=value;seeks++;}};
 const task=startComparison(reference,self,t=>t,1,()=>true,rateReady);
 await Promise.resolve();assert.equal(seeks,0);release();assert.equal(await task,true);assert.equal(seeks,1);assert.equal(selfTime,1);
});

test('success waits for an asynchronous final seek instead of exposing the old follower time',async()=>{
 let value=.8,seeking=false,settle;const done=new Promise(resolve=>{settle=resolve});
 const reference={currentTime:1,duration:20,async play(){}},self={duration:20,playbackRate:1,get currentTime(){return value;},set currentTime(next){seeking=true;setTimeout(()=>{value=next;seeking=false;settle();},35);},async play(){}};
 const task=startComparison(reference,self,t=>t,1,()=>true);await Promise.resolve();assert.equal(value,.8);assert.equal(await task,true);assert.equal(value,1);assert.equal(seeking,false);
});

test('canceling while the final seek is pending does not touch a replacement position',async()=>{
 let current=true,value=.8,resolveSeek,correctionStarted;const pending=new Promise(resolve=>{resolveSeek=resolve});const correction=new Promise(resolve=>{correctionStarted=resolve});let seeks=0;
 const reference={currentTime:1,duration:20,async play(){}},self={duration:20,playbackRate:1,get currentTime(){return value;},set currentTime(next){seeks++;correctionStarted();void pending.then(()=>{if(current)value=next;});},async play(){}};
 const task=startComparison(reference,self,t=>t,1,()=>current);await correction;current=false;value=9;resolveSeek();assert.equal(await task,false);await Promise.resolve();assert.equal(seeks,1);assert.equal(value,9);
});

test('a replacement detected at the correction boundary receives no final seek',async()=>{
 let current=true,seeks=0;
 const reference={currentTime:1,duration:20},self={duration:20,playbackRate:1,get currentTime(){current=false;return .8;},set currentTime(_next){seeks++;}};
 await assert.rejects(correctFollower(reference,self,t=>t,1,undefined,()=>current));assert.equal(seeks,0);
});

test('an 80ms startup lag is corrected instead of being silently accepted',async()=>{
 const r={currentTime:1,duration:20,async play(){}},s={currentTime:.92,duration:20,async play(){}};
 await startComparison(r,s,t=>t,1,()=>true);assert.equal(s.currentTime,1);
});

test('live practice starts only the reference without warmup pauses or synchronization seeks',async()=>{
 const events=[],reference={currentTime:4,duration:30,muted:false,readyState:4,seeking:false,playbackRate:.5,addEventListener(){},pause(){events.push('pause');},async play(){events.push('play');}};
 assert.equal(await startComparison(reference,null,()=>{throw new Error('No camera time mapping');},.5,()=>false),false);
 assert.deepEqual(events,[]);
 assert.equal(await startComparison(reference,null,t=>t,.5,()=>true),true);
 assert.deepEqual(events,['play']);assert.equal(reference.currentTime,4);assert.equal(reference.playbackRate,.5);assert.equal(reference.muted,false);
});

test('a follower entering after pre-roll corrects its own launch latency once',async()=>{
 let value=0;const seeks=[],reference={currentTime:2,duration:20,async play(){assert.fail('reference must keep playing');}};
 const self={duration:20,playbackRate:1.25,get currentTime(){return value;},set currentTime(t){value=t;seeks.push(t);},async play(){reference.currentTime=2.5;value=.01;}};
 assert.equal(await startDelayedFollower(reference,self,t=>(t-2)*1.25,1.25,()=>true),true);
 assert.deepEqual(seeks,[.625]);assert.equal(value,.625);
});
test('canceling a delayed follower never seeks a replacement video',async()=>{
 let current=true,resolve;const ref={currentTime:2,duration:20,async play(){}},self={currentTime:0,duration:20,play:()=>new Promise(r=>resolve=r)};
 const work=startDelayedFollower(ref,self,t=>t-2,1,()=>current);current=false;assert.equal(await work,false);self.currentTime=9;resolve();await Promise.resolve();assert.equal(self.currentTime,9);
});
