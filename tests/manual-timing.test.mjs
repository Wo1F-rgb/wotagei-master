import test from 'node:test';
import assert from 'node:assert/strict';
import {nudgeFollower} from '../lib/manual-timing.ts';
import {comparisonRates,mapSelfTime} from '../lib/rhythm.ts';

function player(time=10,duration=60){let position=time;const seeks=[];return {seeks,duration,get currentTime(){return position;},set currentTime(value){seeks.push(value);position=value;},pause(){assert.fail('Manual nudges must not pause playback');},play(){assert.fail('Manual nudges must not restart playback');}};}
test('each direction moves only the non-master by a complete 5 ms step',()=>{
 for(const master of [0,1])for(const direction of [-1,1]){
  const media=[player(),player()],origins=[2,3],target=1-master;
  const result=nudgeFollower(media,origins,master,direction);
  assert.equal(result.index,target);assert.equal(result.delta,-direction*.005);
  assert.equal(result.origin,origins[target]-direction*.005);
  assert.equal(media[target].currentTime,10-direction*.005);
  assert.deepEqual(media[master].seeks,[]);assert.equal(media[master].currentTime,10);
  assert.deepEqual(origins,[2,3]);
 }
});
test('rapid taps accumulate without losing steps and reversing restores the same anchor',()=>{
 const media=[player(),player()];let origins=[2,3];
 for(const direction of [-1,1])for(let i=0;i<100;i++){
  const result=nudgeFollower(media,origins,0,direction);origins[result.index]=result.origin;
  if(direction===-1&&i===99)assert.equal(origins[1],3.5);
 }
 assert.deepEqual(origins,[2,3]);assert.equal(media[1].seeks.length,200);assert.equal(media[0].seeks.length,0);
 assert.ok(Math.abs(media[1].currentTime-10)<1e-10);
});
test('changing the audio master reverses the target without moving the new master',()=>{
 const media=[player(),player()],origins=[2,3];
 for(const master of [0,1]){const result=nudgeFollower(media,origins,master,-1);origins[result.index]=result.origin;}
 assert.deepEqual(origins,[2.005,3.005]);assert.deepEqual(media.map(v=>v.seeks.length),[1,1]);
});
test('a nudge keeps BPM mapping consistent at different speeds without moving the audible clock',()=>{
 const bpm=[150,120];
 for(const master of [0,1])for(const rate of [.5,1,1.05]){
  const origins=[2,3],rates=comparisonRates(rate,...bpm,master),media=[player(2+5*rates.reference),player(3+5*rates.self)];
  const result=nudgeFollower(media,origins,master,-1);origins[result.index]=result.origin;
  assert.ok(Math.abs(mapSelfTime(media[0].currentTime,...origins,...bpm)-media[1].currentTime)<1e-10);
  assert.deepEqual(media[master].seeks,[]);
 }
});
test('edge taps report no change instead of claiming a partial step',()=>{
 for(const [origin,time,direction] of [[0,10,1],[.003,10,1],[1,0,1],[1,.003,1],[59.999,10,-1],[1,59.999,-1]]){
  const media=[player(),player(time)];const result=nudgeFollower(media,[2,origin],0,direction);
  assert.equal(result.delta,0);assert.ok(result.reason.includes('変更なし'));assert.deepEqual(media[1].seeks,[]);
 }
});
test('microsecond media timestamps do not get stuck one step before returning to zero',()=>{
 let time=0;const media=[player(),{duration:60,get currentTime(){return time;},set currentTime(n){time=Math.trunc(n*1e6)/1e6;}}],origins=[0,0];
 for(const direction of [-1,1])for(let i=0;i<21;i++){
  const result=nudgeFollower(media,origins,0,direction);assert.notEqual(result.delta,0);origins[result.index]=result.origin;
 }
 assert.equal(origins[1],0);assert.equal(time,0);
});
test('unavailable or failed media never reports a successful nudge',()=>{
 assert.equal(nudgeFollower([player(),null],[1,1],0,-1).delta,0);
 const broken={duration:60,get currentTime(){return 10;},set currentTime(value){throw Error('seek failed');}};
 assert.equal(nudgeFollower([player(),broken],[1,1],0,-1).delta,0);
});
test('an iframe with a stale clock can accumulate rapid taps from a projected pending position',()=>{
 const requests=[],iframe={duration:60,get currentTime(){return 10;},set currentTime(value){requests.push(value);}},master=player(12.5),origins=[2,3],bpm=[150,120];
 const base={time:iframe.currentTime,masterTime:master.currentTime,origin:origins[0]};
 for(let i=0;i<20;i++){
  const pending=base.time+(master.currentTime-base.masterTime)*bpm[1]/bpm[0]+origins[0]-base.origin;
  const result=nudgeFollower([iframe,master],origins,1,-1,pending);origins[0]=result.origin;
 }
 assert.equal(origins[0],2.1);assert.equal(requests.length,20);assert.ok(Math.abs(requests.at(-1)-10.1)<1e-10);assert.deepEqual(master.seeks,[]);
});
