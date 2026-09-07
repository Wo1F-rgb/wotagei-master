import test from 'node:test';
import assert from 'node:assert/strict';
import {beatAt,mapSelfTime,synchronizedRate,tapTempo,phraseLoop} from '../lib/rhythm.ts';
import {registerStudioTools,validateConfig} from '../lib/webmcp.ts';
test('8-count changes its leading number every eight beats, including exact boundaries',()=>{
 assert.deepEqual(beatAt(3,3,120),{index:0,beat:1,phrase:1});
 assert.deepEqual(beatAt(6.5,3,120),{index:7,beat:8,phrase:1});
 assert.deepEqual(beatAt(7,3,120),{index:8,beat:1,phrase:2});
 assert.deepEqual(beatAt(11,3,120),{index:16,beat:1,phrase:3});
 assert.equal(beatAt(2.9,3,120).phrase,0);
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
test('phrase loops use the marked one and clamp to video end',()=>{
 assert.deepEqual(phraseLoop(8,3,120,1,60),{start:7,end:11});
 assert.deepEqual(phraseLoop(8,3,120,2,60),{start:7,end:15});
 assert.deepEqual(phraseLoop(8,3,120,4,12),{start:7,end:12});
 assert.deepEqual(phraseLoop(1,3,120,1,60),{start:3,end:7});
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
