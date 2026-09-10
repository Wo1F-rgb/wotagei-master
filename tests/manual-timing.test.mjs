import test from 'node:test';
import assert from 'node:assert/strict';
import {nudgeBeatOrigin,NUDGE_STEPS,restoreNudgeStep,nudgeSecondsLabel} from '../lib/manual-timing.ts';
import {mapSelfTime,beatAt} from '../lib/rhythm.ts';
import {upcomingBeatCues} from '../lib/beat-cues.ts';

test('arrows edit only the other song beat origin, in the displayed direction',()=>{
 for(const master of [0,1])for(const direction of [-1,1]){
  const origins=[2,3],result=nudgeBeatOrigin(origins,[60,60],master,direction);
  assert.equal(result.index,1-master);assert.equal(result.delta,direction*.001);
  assert.equal(result.origin,origins[1-master]+direction*.001);assert.deepEqual(origins,[2,3]);
 }
});
test('rapid taps use saved beat metadata rather than an outdated iframe playback clock',()=>{
 for(const master of [0,1]){
  let origins=[2,3];
  for(const direction of [1,-1])for(let i=0;i<21;i++){
   const result=nudgeBeatOrigin(origins,[60,60],master,direction,.0005);origins[result.index]=result.origin;
   if(direction===1&&i===20)assert.equal(origins[result.index],[2,3][result.index]+.0105);
  }
  assert.deepEqual(origins,[2,3]);
 }
});
test('a saved grid change drives later seeks, audio click previews and the beat count',()=>{
 const bpm=[150,120],origins=[2,3];const result=nudgeBeatOrigin(origins,[60,60],0,1,.1);origins[1]=result.origin;
 const restored=JSON.parse(JSON.stringify(origins));
 for(const referenceTime of [2,7,15]){
  const own=mapSelfTime(referenceTime,...restored,...bpm);
  assert.equal(beatAt(own,restored[1],bpm[1]).index,beatAt(referenceTime,restored[0],bpm[0]).index);
 }
 const next=upcomingBeatCues(3,restored[1],120,1,.2)[0];assert.equal(next.index,0);assert.ok(Math.abs(next.delay-.1)<1e-9);
 assert.equal(mapSelfTime(2,...restored,...bpm),3.1);
});
test('all configured steps are reversible and work at a paused source time of zero',()=>{
 for(const step of NUDGE_STEPS)for(const master of [0,1]){
  const origins=[0,0];
  for(const direction of [1,-1])for(let n=0;n<21;n++){
   const result=nudgeBeatOrigin(origins,[60,60],master,direction,step);assert.equal(result.delta,direction*step);origins[result.index]=result.origin;
  }
  assert.deepEqual(origins,[0,0]);
 }
});
test('only beat-origin boundaries reject movement; transient decoder positions cannot',()=>{
 for(const step of NUDGE_STEPS){
  for(const [origin,direction] of [[0,-1],[step/2,-1],[60-step/2,1],[60-step,1]]){
   const result=nudgeBeatOrigin([2,origin],[60,60],0,direction,step);assert.equal(result.delta,0);assert.match(result.reason,/変更なし/);
  }
  assert.equal(nudgeBeatOrigin([1,1],[60,60],0,-1,step).delta,-step);
 }
});
test('unavailable sources cannot claim a successful grid edit',()=>{
 for(const duration of [0,NaN,Infinity,undefined])assert.equal(nudgeBeatOrigin([1,1],[60,duration],0,1).delta,0);
 for(const origin of [NaN,Infinity,undefined])assert.equal(nudgeBeatOrigin([1,origin],[60,60],0,1).delta,0);
});
test('stored steps restore only supported values and labels preserve half milliseconds',()=>{
 for(const step of NUDGE_STEPS){assert.equal(restoreNudgeStep(step),step);assert.equal(Number(nudgeSecondsLabel(step)),step);}
 for(const invalid of [null,undefined,NaN,Infinity,-.001,0,.00001,10,'oops','.0005',{}])assert.equal(restoreNudgeStep(invalid),.001);
 assert.equal(nudgeSecondsLabel(.0005),'0.0005');assert.equal(nudgeSecondsLabel(.001),'0.001');
});
