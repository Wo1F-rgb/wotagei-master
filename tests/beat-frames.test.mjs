import test from 'node:test';
import assert from 'node:assert/strict';
import {createBeatFrameGrid,beatFrameTime,beatFrameIndexAtTime,beatFrameFilename} from '../lib/beat-frames.ts';
import {trackBeatGrid} from '../lib/timeline.ts';

test('source beat grid excludes the exact media endpoint and retains fractional BPM/origin',()=>{
 const exact=createBeatFrameGrid({duration:2,bpm:120,origin:0});
 assert.equal(exact.count,4);assert.equal(beatFrameTime(exact,3),1.5);
 for(const bpm of [73.17,123.456789,179.99999,300]){
  const grid=createBeatFrameGrid({duration:123.1,bpm,origin:.123456789});
  for(let i=0;i<grid.count;i++)assert.equal(beatFrameTime(grid,i),grid.origin+i*(60/bpm));
  assert.ok(beatFrameTime(grid,grid.count-1)<grid.duration);
  assert.ok(grid.origin+grid.count*grid.step>=grid.duration);
 }
 const justAfter=createBeatFrameGrid({duration:2+Number.EPSILON*2,bpm:120,origin:0});assert.equal(justAfter.count,5);
 const justBefore=createBeatFrameGrid({duration:2-Number.EPSILON,bpm:120,origin:0});assert.equal(justBefore.count,4);
});

test('source timestamps correspond to existing timeline lines independently of reference BPM',()=>{
 const origin=.713456789,bpm=147.123456,grid=createBeatFrameGrid({duration:100,bpm,origin});
 for(const referenceBpm of [80,180]){
  const sourceTime=4.3,cursor=8.6,track=trackBeatGrid(sourceTime,origin,bpm,referenceBpm,cursor,-2,20);
  for(const tick of track.ticks.filter(t=>t.index>=0)){
   const source=tick.time===track.one?origin:sourceTime+(tick.time-cursor)*referenceBpm/bpm;
   assert.ok(Math.abs(source-beatFrameTime(grid,tick.index))<1e-12);
  }
 }
});

test('half/double BPM alter beat spacing, with no practice playback rate in the grid',()=>{
 const params={duration:30,origin:2};
 const half=createBeatFrameGrid({...params,bpm:60}),normal=createBeatFrameGrid({...params,bpm:120}),double=createBeatFrameGrid({...params,bpm:240});
 assert.deepEqual([half.count,normal.count,double.count],[28,56,112]);
 assert.equal(beatFrameTime(half,1),beatFrameTime(normal,2));assert.equal(beatFrameTime(normal,1),beatFrameTime(double,2));
 assert.deepEqual(Object.keys(normal).sort(),['bpm','count','duration','origin','step']);
});

test('grid stays constant-space for long clips, and rejects invalid inputs/indexes',()=>{
 const grid=createBeatFrameGrid({duration:1e9,bpm:120,origin:0});assert.equal(grid.count,2e9);assert.ok(!Array.isArray(grid));
 for(const params of [{duration:0,bpm:120,origin:0},{duration:2,bpm:0,origin:0},{duration:2,bpm:Infinity,origin:0},{duration:2,bpm:120,origin:-1},{duration:2,bpm:120,origin:2},{duration:2,bpm:Number.MAX_VALUE,origin:0}])assert.throws(()=>createBeatFrameGrid(params));
 for(const index of [-1,.5,grid.count,NaN])assert.throws(()=>beatFrameTime(grid,index));
 assert.equal(beatFrameIndexAtTime(grid,-10),0);assert.equal(beatFrameIndexAtTime(grid,2e9),grid.count-1);assert.equal(beatFrameIndexAtTime(grid,1.02),2);
 assert.throws(()=>beatFrameIndexAtTime(grid,NaN));
});

test('photo filenames are ordered, unique and contain source milliseconds',()=>{
 assert.equal(beatFrameFilename(0,.123456789),'beat-000001-000000123ms.jpg');
 assert.equal(beatFrameFilename(12,64.5,'../dance /'),'___dance__-000013-000064500ms.jpg');
 const names=Array.from({length:100},(_,i)=>beatFrameFilename(i,i*.5));assert.deepEqual([...names].sort(),names);assert.equal(new Set(names).size,100);
});
