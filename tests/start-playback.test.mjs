import test from 'node:test';import assert from 'node:assert/strict';import {startComparison,resumeFollower} from '../lib/start-playback.ts';
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
test('resuming after buffering or a loop catches up before and after decoder startup',async()=>{
 const r={currentTime:4,duration:20,async play(){}},s={currentTime:1,duration:20,async play(){assert.equal(this.currentTime,5);r.currentTime+=.2;}};
 await resumeFollower(r,s,t=>t*1.25,1.25,()=>true);assert.equal(s.currentTime,5.25);
});
test('a canceled recovery cannot overwrite a newly selected video',async()=>{
 let current=true;const r={currentTime:4,duration:20,async play(){}},s={currentTime:0,duration:20,async play(){current=false;this.currentTime=2;r.currentTime=9;}};
 await resumeFollower(r,s,t=>t,1,()=>current);assert.equal(s.currentTime,2);
});
