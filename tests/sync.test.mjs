import test from 'node:test';import assert from 'node:assert/strict';
import {resetSync,syncAction} from '../lib/sync.ts';
import {restoreTempo} from '../lib/tempo-model.ts';
test('smooth playback removes persistent drift without repeated seeks',()=>{
 const state=resetSync();let current=-.1,rate=1.25,seeks=0;
 for(let now=0;now<20000;now+=16){current+=rate*.016;const action=syncAction(state,{now,target:(now+16)/1000*1.25,current,baseRate:1.25,seeking:false,ready:true},'smooth');if(action.kind==='rate'){rate=action.rate;assert.ok(Math.abs(rate/1.25-1)<=.020001);}if(action.kind==='seek')seeks++;}
 assert.equal(seeks,0);assert.ok(Math.abs(current-20*1.25)<.05);
});
test('a slower 120 BPM self video runs continuously at 1.25x against 150 BPM',()=>{
 const state=resetSync();let current=0,rate=1.25,seeks=0;
 for(let now=0;now<30000;now+=16){current+=rate*.016;const action=syncAction(state,{now,target:now/1000*1.25+.13,current,baseRate:1.25,seeking:false,ready:true});if(action.kind==='rate')rate=action.rate;if(action.kind==='seek'){current=action.time;seeks++;}}
 assert.equal(seeks,0);assert.ok(Math.abs(current-30*1.25-.13)<.08);
});
test('large drift seeks once, then allows decoding time before another correction',()=>{
 const state=resetSync();const args={target:8,current:3,baseRate:1.25,seeking:false,ready:true};
 assert.equal(syncAction(state,{...args,now:500}).kind,'hold');
 assert.equal(syncAction(state,{...args,now:2000}).kind,'seek');
 for(let now=2016;now<2900;now+=16)assert.equal(syncAction(state,{...args,now}).kind,'hold');
 assert.notEqual(syncAction(state,{...args,now:3100}).kind,'seek');
 assert.equal(syncAction(state,{...args,now:4000,seeking:true}).kind,'hold');
 assert.equal(syncAction(state,{...args,now:5000,ready:false}).kind,'hold');
});
test('small positive and negative drift only adjusts rates within 4%, at most 4 times per second',()=>{
 for(const baseRate of [.25,.5,1,1.25,2,4])for(const drift of [-.2,.2]){const state=resetSync();const a=syncAction(state,{now:1000,target:5+drift*baseRate,current:5,baseRate,seeking:false,ready:true});assert.equal(a.kind,'rate');assert.ok(a.rate>=.25&&a.rate<=4);assert.ok(Math.abs(a.rate/baseRate-1)<.04001);assert.equal(syncAction(state,{now:1016,target:5,current:5,baseRate,seeking:false,ready:true}).kind,'hold');}
});
test('unmeasured default and legacy values cannot masquerade as detected BPM',()=>{
 for(const input of [null,{}, {bpm:120}, {bpm:150}, {bpm:NaN,kind:'analysis'}, {bpm:0,kind:'manual'}])assert.equal(restoreTempo(input).kind,'unset');
 assert.deepEqual(restoreTempo({bpm:150,kind:'analysis'}),{bpm:150,kind:'analysis'});
 assert.deepEqual(restoreTempo({bpm:120,kind:'manual'}),{bpm:120,kind:'manual'});
});
