import test from 'node:test';
import assert from 'node:assert/strict';
import {beatAt,mapSelfTime,synchronizedRate,tapTempo,measureLoop} from '../lib/rhythm.ts';
import {registerStudioTools,validateConfig} from '../lib/webmcp.ts';
test('measures use four beats and techniques use thirty-two beats while keeping eight-count cues',()=>{
 assert.deepEqual(beatAt(3,3,120),{index:0,beat:1,measure:1,technique:1});
 assert.deepEqual(beatAt(6.5,3,120),{index:7,beat:8,measure:2,technique:1});
 assert.deepEqual(beatAt(7,3,120),{index:8,beat:1,measure:3,technique:1});
 assert.deepEqual(beatAt(11,3,120),{index:16,beat:1,measure:5,technique:1});
 assert.deepEqual(beatAt(18.5,3,120),{index:31,beat:8,measure:8,technique:1});
 assert.deepEqual(beatAt(19,3,120),{index:32,beat:1,measure:9,technique:2});
 assert.deepEqual(beatAt(35,3,120),{index:64,beat:1,measure:17,technique:3});
 assert.equal(beatAt(2.9,3,120).measure,0);assert.equal(beatAt(2.9,3,120).technique,0);
 for(const bpm of [120,146.877,150]){assert.equal(beatAt(3+240/bpm,3,bpm).measure,2);assert.equal(beatAt(3+1920/bpm,3,bpm).technique,2);assert.equal(beatAt(3+1920/bpm-.0001,3,bpm).technique,1);}
});
test('different BPM and recording offsets land on the same beat at slow and fast practice rates',()=>{
 for(const rate of [.25,.5,1,1.25,2]){
  const refBpm=120,selfBpm=150,refOrigin=7,selfOrigin=2,wallSeconds=4;
  const target=mapSelfTime(refOrigin+rate*wallSeconds,refOrigin,selfOrigin,refBpm,selfBpm);
  assert.ok(Math.abs(target-(selfOrigin+synchronizedRate(rate,refBpm,selfBpm)*wallSeconds))<1e-9);
 }
 assert.equal(mapSelfTime(0,10,1,120,120),-9);
});
test('tap BPM tolerates an accidental extra long interval',()=>{
 assert.equal(tapTempo([0,500]),null);
 assert.equal(tapTempo([0,500,1000,1500]),null);
 assert.equal(tapTempo([0,500,1000,1500,2000,2500]),120);
 assert.equal(tapTempo([0,500,1000,2500,3000,3500]),120);
 assert.equal(tapTempo([0,400,800,1200,1600,2000]),150);
});
test('long-baseline tap estimation resists alternating human timing errors',()=>{
 const times=Array.from({length:24},(_,i)=>i*400+(i%2?35:-35));
 assert.ok(Math.abs(tapTempo(times)-150)<.5);
 const missed=times.filter((_,i)=>i!==10);assert.ok(Math.abs(tapTempo(missed)-150)<1);
});
test('measure and technique loops start on a four-beat boundary and clamp to video end',()=>{
 assert.deepEqual(measureLoop(8,3,120,1,60),{start:7,end:9});
 assert.deepEqual(measureLoop(8,3,120,2,60),{start:7,end:11});
 assert.deepEqual(measureLoop(8,3,120,4,12),{start:7,end:12});
 assert.deepEqual(measureLoop(1,3,120,1,60),{start:3,end:5});
 assert.deepEqual(measureLoop(6,3,120,8,60),{start:5,end:21});
});
test('structured tempo tools register, share state and reject invalid values atomically',()=>{
 const tools=new Map();let signal;
 let state={referenceBpm:120,selfBpm:120,rate:1,playing:true};
 const cleanup=registerStudioTools({registerTool(t,opts){tools.set(t.name,t);signal=opts.signal;}},()=>({...state}),config=>{state={...state,...config,playing:false};});
 assert.deepEqual([...tools.keys()],['read_practice_state','configure_practice_tempo']);
 assert.equal(tools.get('read_practice_state').annotations.readOnlyHint,true);
 assert.equal(tools.get('configure_practice_tempo').annotations.readOnlyHint,false);
 const changed=tools.get('configure_practice_tempo').execute({referenceBpm:131,selfBpm:145,rate:.75});
 assert.deepEqual(changed,{referenceBpm:131,selfBpm:145,rate:.75,playing:false});
 assert.deepEqual(tools.get('read_practice_state').execute({}),changed);
 for(const invalid of [null,{},[],{rate:0},{rate:NaN},{referenceBpm:1000},{rate:1,unknown:true}])assert.throws(()=>validateConfig(invalid));
 assert.deepEqual(tools.get('read_practice_state').execute({}),changed);
 cleanup();assert.equal(signal.aborted,true);
});
