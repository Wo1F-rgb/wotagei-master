import test from 'node:test';import assert from 'node:assert/strict';
import {upcomingBeatCues} from '../lib/beat-cues.ts';
import {comparisonRates,mapSelfTime,beatAt} from '../lib/rhythm.ts';
test('either soundtrack keeps equal beat phase while its own speed is the selected practice rate',()=>{
 for(const master of [0,1])for(const speed of [.5,1,1.25]){
  const rates=comparisonRates(speed,150,120,master);
  assert.equal(master===0?rates.reference:rates.self,speed);
  for(const elapsed of [0,.3,1,8,19]){
   const reference=2+elapsed*rates.reference,self=3+elapsed*rates.self;
   assert.ok(Math.abs(mapSelfTime(reference,2,3,150,120)-self)<1e-9);
  }
 }
});
test('preview clicks land on the configured white grid at original and changed playback speeds',()=>{
 for(const bpm of [120,150,174])for(const rate of [.5,1,1.25])for(const origin of [0,.237,3.456])for(const index of [0,1,7,8,20]){
  const at=origin+index*60/bpm,time=at-.05*rate,cues=upcomingBeatCues(time,origin,bpm,rate),cue=cues.find(c=>c.index===index);
  assert.ok(cue);assert.ok(Math.abs(cue.delay-.05)<1e-8);
  assert.equal(beatAt(time+cue.delay*rate,origin,bpm).index,index);
 }
});
test('starting off beat does not invent an immediate click and no negative beats are played',()=>{
 assert.deepEqual(upcomingBeatCues(.2,0,120,1),[]);
 assert.deepEqual(upcomingBeatCues(0,2,120,1),[]);
 assert.deepEqual(upcomingBeatCues(NaN,0,120,1),[]);
 assert.deepEqual(upcomingBeatCues(0,0,0,1),[]);
 assert.deepEqual(upcomingBeatCues(.48,0,120,1),[{index:1,delay:.020000000000000018}]);
});
