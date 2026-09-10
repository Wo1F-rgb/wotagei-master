import test from 'node:test';import assert from 'node:assert/strict';import {startComparison,startDelayedFollower} from '../lib/start-playback.ts';
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
