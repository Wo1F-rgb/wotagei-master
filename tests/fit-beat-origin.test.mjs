import test from 'node:test';
import assert from 'node:assert/strict';
import {fitBeatOrigin} from '../lib/fit-beat-origin.ts';

test('selects the nearest analysed beat or midpoint from a fixed anchor',()=>{
 const bpm=120,anchor=1,duration=10;
 assert.deepEqual(fitBeatOrigin(1.12,bpm,anchor,duration),{time:1,kind:'beat'});
 assert.deepEqual(fitBeatOrigin(1.13,bpm,anchor,duration),{time:1.25,kind:'midpoint'});
 assert.deepEqual(fitBeatOrigin(1.39,bpm,anchor,duration),{time:1.5,kind:'beat'});
});

test('moving the proposed origin never moves the anchor and fitting is idempotent',()=>{
 const bpm=150,anchor=2.34,duration=8;
 const fitted=fitBeatOrigin(2.51,bpm,anchor,duration);
 assert.ok(fitted);
 assert.equal(fitted.kind,'midpoint');
 assert.ok(Math.abs(fitted.time-2.54)<1e-12);
 assert.deepEqual(fitBeatOrigin(fitted.time,bpm,anchor,duration),fitted);
 assert.deepEqual(fitBeatOrigin(anchor,bpm,anchor,duration),{time:anchor,kind:'beat'});
});

test('recomputes beat and midpoint spacing when BPM is adjusted',()=>{
 const anchor=1,duration=10;
 assert.deepEqual(fitBeatOrigin(1.31,120,anchor,duration),{time:1.25,kind:'midpoint'});
 assert.deepEqual(fitBeatOrigin(1.31,150,anchor,duration),{time:1.4,kind:'beat'});
});

test('keeps negative-index candidates before the analysed anchor',()=>{
 const bpm=120,anchor=2,duration=10;
 assert.deepEqual(fitBeatOrigin(1.58,bpm,anchor,duration),{time:1.5,kind:'beat'}); // index -2
 assert.deepEqual(fitBeatOrigin(1.76,bpm,anchor,duration),{time:1.75,kind:'midpoint'}); // index -1
});

test('clips the candidate search to the file rather than returning off-file times',()=>{
 const bpm=120,anchor=1,duration=1.1;
 const before=fitBeatOrigin(-100,bpm,anchor,duration);
 const after=fitBeatOrigin(100,bpm,anchor,duration);
 assert.deepEqual(before,{time:0,kind:'beat'});
 assert.deepEqual(after,{time:1,kind:'beat'}); // 1.25 is beyond this file
 for(const position of [-100,-1,0,1,2,100]){
  const result=fitBeatOrigin(position,bpm,anchor,duration);
  assert.ok(result && result.time>=0 && result.time<=duration);
 }
});

test('rejects non-finite, out-of-range, and structurally invalid inputs',()=>{
 const invalid=[
  [NaN,120,1,10],[Infinity,120,1,10],[0,NaN,1,10],[0,Infinity,1,10],
  [0,39,1,10],[0,301,1,10],[0,120,-.01,10],[0,120,1,0],[0,120,1,-1],
  ['1',120,1,10],[0,'120',1,10],[0,120,1,'10'],
  [0,120,2,1]
 ];
 for(const args of invalid) assert.equal(fitBeatOrigin(...args),null,`expected null for ${args.join(',')}`);
});

test('preserves sub-millisecond precision for fractional BPM and anchor values',()=>{
 const bpm=123.456,anchor=.123456,duration=120,index=7;
 const candidate=anchor+index*(30/bpm);
 const result=fitBeatOrigin(candidate+1e-9,bpm,anchor,duration);
 assert.ok(result);
 assert.equal(result.kind,'midpoint');
 assert.ok(Math.abs(result.time-candidate)<1e-12);
});
