import test from 'node:test';import assert from 'node:assert/strict';
import {timelineShift,trackBounds,trackBeatGrid} from '../lib/timeline.ts';
import {mapSelfTime} from '../lib/rhythm.ts';
test('drag moves only white beats over fixed song contents at a normalized tempo',()=>{
 const origin=10,next=timelineShift(origin,100,100,120,150,60);assert.equal(next,11.25);
 const before=trackBeatGrid(8,origin,120,150,6,0,12),after=trackBeatGrid(8,next,120,150,6,0,12);
 assert.equal(after.one-before.one,1);const bounds=trackBounds(60,8,120,150,6);assert.ok(Math.abs(bounds.start+.4)<1e-9);assert.ok(Math.abs(bounds.end-47.6)<1e-9);
 assert.equal(mapSelfTime(5,2,next,150,120),15);
});
test('beat origins are clamped at the source boundaries',()=>{
 assert.equal(timelineShift(0,-20,100,120,150,60),0);assert.equal(timelineShift(59,1000,100,150,120,60),60);
});
test('tracks reveal an actual one-beat playback lag instead of drawing falsely aligned grids',()=>{
 const ref=trackBeatGrid(7,2,150,150,5,2,8),self=trackBeatGrid(8.75,3,120,150,5,2,8);
 assert.ok(Math.abs(self.one-ref.one-.4)<1e-9);
 const synced=trackBeatGrid(mapSelfTime(7,2,3,150,120),3,120,150,5,2,8);
 assert.ok(Math.abs(synced.one-ref.one)<1e-9);assert.deepEqual(synced.ticks,ref.ticks);
});
test('changing a beat origin shifts that row immediately without moving its source clock',()=>{
 const before=trackBeatGrid(7,2,150,150,5,2,8),after=trackBeatGrid(7,2.5,150,150,5,2,8);
 assert.equal(after.one-before.one,.5);assert.ok(Math.abs(after.ticks[1].time-after.ticks[0].time-.4)<1e-9);
});
