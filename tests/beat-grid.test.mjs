import test from 'node:test';
import assert from 'node:assert/strict';
import {fitBeatGrid} from '../lib/beat-grid.ts';
test('partial takes fit BOTH media phase and BPM without requiring 64 taps',()=>{
 for(const count of [2,3,4,8,13,32,64]){const fit=fitBeatGrid(Array.from({length:count},(_,i)=>8.25+i*.4));assert.ok(fit);assert.ok(Math.abs(fit.bpm-150)<1e-7);assert.ok(Math.abs(fit.origin-8.25)<1e-7);assert.equal(fit.count,count);}
 assert.equal(fitBeatGrid([8]),null);
});
test('uneven taps smooth onto equal intervals and do not pin the grid to an inaccurate first tap',()=>{
 const jitter=[.065,-.025,.012,-.032,.018,-.014,.005,.023,-.03,.019,.001,-.007];
 const fit=fitBeatGrid(jitter.map((n,i)=>4.2+i*.4+n));assert.ok(fit);assert.ok(Math.abs(fit.bpm-150)<1.3);assert.ok(Math.abs(fit.origin-4.2)<.025);
 for(let i=1;i<fit.points.length;i++)assert.ok(Math.abs((fit.points[i].snapped-fit.points[i-1].snapped)-(fit.points[i].beat-fit.points[i-1].beat)*fit.period)<1e-9);
});
test('missed beats and accidental double taps do not shift all following eight-count boundaries',()=>{
 const times=Array.from({length:16},(_,i)=>3+i*.4).filter((_,i)=>i!==5&&i!==10);times.splice(3,0,times[2]+.08);
 const fit=fitBeatGrid(times);assert.ok(fit);assert.ok(Math.abs(fit.bpm-150)<.1);assert.ok(Math.abs(fit.origin-3)<.01);assert.equal(fit.points.at(-1).beat,15);assert.ok(fit.used<fit.count);assert.equal(fit.missed,2);
});
test('a single late touch is rejected instead of moving the whole beat grid',()=>{
 const times=Array.from({length:12},(_,i)=>2+i*.5);times[5]+=.18;
 const fit=fitBeatGrid(times);assert.ok(fit);assert.ok(Math.abs(fit.bpm-120)<.5);assert.ok(Math.abs(fit.origin-2)<.02);assert.ok(!fit.points[5].used);
});
test('media seconds determine the original tempo regardless of wall-clock playback speed',()=>{
 const fit=fitBeatGrid([10,10.4,10.8,11.2]);assert.ok(fit);assert.ok(Math.abs(fit.bpm-150)<1e-6);
 assert.equal(fitBeatGrid([2,1,3]),null);assert.equal(fitBeatGrid([2,2,3]),null);assert.equal(fitBeatGrid([NaN,3]),null);
});
