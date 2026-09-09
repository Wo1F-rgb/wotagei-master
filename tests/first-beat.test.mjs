import test from 'node:test';import assert from 'node:assert/strict';
import {firstBeatStart} from '../lib/first-beat.ts';
import {mapSelfTime,comparisonRates,beatAt} from '../lib/rhythm.ts';
import {restoreTempo} from '../lib/tempo-model.ts';

test('different clip starts use the two marked first beats, with no extra beat or file-start offset',()=>{
 const origins=[2.34,1.12],bpm=[150,120];
 assert.deepEqual(firstBeatStart(origins,bpm,[30,25]),origins);
 assert.equal(mapSelfTime(origins[0],...origins,...bpm),origins[1]);
 for(const source of [0,1])for(const rate of [.5,1,1.25]){
  const rates=comparisonRates(rate,...bpm,source);
  for(const elapsed of [0,.5,1,5])assert.ok(Math.abs(mapSelfTime(origins[0]+elapsed*rates.reference,...origins,...bpm)-(origins[1]+elapsed*rates.self))<1e-10);
 }
});
test('a one-beat manual correction moves only the selected source first beat',()=>{
 const bpm=[150,120],before=[2.34,1.12],after=[before[0],before[1]+60/bpm[1]];
 const target=firstBeatStart(after,bpm,[30,25]);assert.equal(target[0],before[0]);assert.equal(target[1],1.62);
 assert.equal(beatAt(target[0],after[0],bpm[0]).beat,1);assert.equal(beatAt(target[1],after[1],bpm[1]).beat,1);
});
test('pre-roll reaches both first beats together, including a clip with little lead-in',()=>{
 for(const origins of [[2.34,1.12],[.1,2],[3,0]]){
  const bpm=[150,120],start=firstBeatStart(origins,bpm,[30,25],2);
  assert.ok(start.every(t=>t>=0));assert.ok(Math.abs(mapSelfTime(start[0],...origins,...bpm)-start[1])<1e-10);
  assert.ok(Math.abs((origins[0]-start[0])*bpm[0]-(origins[1]-start[1])*bpm[1])<1e-8);
 }
});
test('invalid first-beat anchors fail instead of silently clamping one side out of phase',()=>{
 for(const origins of [[0,30],[-.1,1],[NaN,1],[1]])assert.throws(()=>firstBeatStart(origins,[150,120],[30,30]));
 assert.throws(()=>firstBeatStart([0,0],[0,120],[30,30]));
});
test('unmeasured default and legacy values cannot masquerade as detected BPM',()=>{
 for(const input of [null,{}, {bpm:120}, {bpm:150}, {bpm:NaN,kind:'analysis'}, {bpm:0,kind:'manual'}])assert.equal(restoreTempo(input).kind,'unset');
 assert.deepEqual(restoreTempo({bpm:150,kind:'analysis'}),{bpm:150,kind:'analysis'});
});
