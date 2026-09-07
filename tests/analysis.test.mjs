import test from 'node:test';import assert from 'node:assert/strict';
import {analyzeWindows} from '../lib/bpm-analysis.ts';import {rhythmFixture} from './audio-fixtures.mjs';
for(const bpm of [90,120,131,150,174,199])test(`audio library detects a ${bpm} BPM rhythm with shifted onset and background sound`,()=>{
 const fs=22050,pcm=rhythmFixture(bpm);const result=analyzeWindows([0,11,24].map(start=>({samples:pcm.slice(start*fs,(start+18)*fs),start,sampleRate:fs})));
 assert.ok(result.candidates.some(c=>Math.abs(c.bpm-bpm)<1.2),`Expected ${bpm}, got ${JSON.stringify(result)}`);
});
test('silence never becomes a default 120 BPM result',()=>assert.throws(()=>analyzeWindows([{samples:new Float32Array(22050*20),sampleRate:22050,start:0}])));
test('unstructured noise is rejected rather than presented as a confident beat',()=>{
 let seed=50;const samples=Float32Array.from({length:22050*20},()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return (seed/4294967296-.5)*.5;});
 assert.throws(()=>analyzeWindows([{samples,sampleRate:22050,start:0}]));
});
