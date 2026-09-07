import test from 'node:test';import assert from 'node:assert/strict';import {timelineShift,trackBounds} from '../lib/timeline.ts';import {mapSelfTime} from '../lib/rhythm.ts';
test('dragging a 120 BPM recording one reference second later adjusts its origin by 1.25 source seconds',()=>{
 const original=10,shifted=timelineShift(original,100,100,120,150,60);assert.equal(shifted,8.75);
 const before=trackBounds(60,original,120,150,0),after=trackBounds(60,shifted,120,150,0);assert.equal(after.start-before.start,1);assert.equal(after.end-before.end,1);
 assert.equal(mapSelfTime(5,2,shifted,150,120),12.5);
});
test('track origins are clamped, including dragging before the first frame',()=>{
 assert.equal(timelineShift(0,20,100,120,150,60),0);assert.equal(timelineShift(59,-1000,100,150,120,60),60);
 assert.deepEqual(trackBounds(20,4,150,150,0),{start:-4,end:16});
});
