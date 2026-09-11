import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeSpectralGrid} from '../lib/spectral-grid.ts';
import {rhythmFixture} from './audio-fixtures.mjs';

for(const bpm of [120,131,150,174,199])test(`fallback recovers ${bpm} BPM and audio phase across a full synthetic track`,()=>{
 const samples=rhythmFixture(bpm),r=analyzeSpectralGrid({samples,sampleRate:22050});
 assert.ok(r.grid&&!r.grid.variable);assert.ok(Math.abs(r.grid.bpm-bpm)<.04);
 const period=60/bpm,error=r.grid.origin-.173;
 assert.ok(Math.abs(error-Math.round(error/period)*period)<.018,'STFT analysis must report media time at the frame centre');
 assert.ok(r.grid.coverage>.9);assert.ok(r.grid.driftMs<8);
 assert.ok(r.grid.errorMs>0,'measured transients must not be replaced with manufactured perfect-grid evidence');
});
test('sub-beat ambiguity stays in the same tempo family and can be halved in preview',()=>{
 const r=analyzeSpectralGrid({samples:rhythmFixture(90),sampleRate:22050});assert.ok(r.grid);
 assert.ok([90,180].some(b=>Math.abs(r.grid.bpm-b)<.04));
});
test('silence, random noise and a short isolated passage do not produce approved whole-song grids',()=>{
 assert.equal(analyzeSpectralGrid({samples:new Float32Array(22050*10),sampleRate:22050}).grid,null);
 let seed=50;const noise=Float32Array.from({length:22050*20},()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return(seed/4294967296-.5)*.5;});
 assert.equal(analyzeSpectralGrid({samples:noise,sampleRate:22050}).grid,null);
 const partial=new Float32Array(22050*35);partial.set(rhythmFixture(150,{seconds:8}),22050*12);
 assert.equal(analyzeSpectralGrid({samples:partial,sampleRate:22050}).grid,null);
});
test('tempo change is rejected by whole-file residual and coverage checks',()=>{
 const samples=new Float32Array(22050*40);samples.set(rhythmFixture(120,{seconds:20}));samples.set(rhythmFixture(145,{seconds:20}),22050*20);
 assert.equal(analyzeSpectralGrid({samples,sampleRate:22050}).grid,null);
});
