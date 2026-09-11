import test from 'node:test';
import assert from 'node:assert/strict';
import {placeAnalysisAudio,decodeAnalysisAudio,ANALYSIS_SAMPLE_RATE as sr} from '../lib/analysis-audio.ts';
function buffer(channels){return {length:channels[0].length,sampleRate:sr,numberOfChannels:channels.length,getChannelData:i=>channels[i]};}
test('audio extraction restores a leading empty edit on the movie timeline',()=>{
 const channel=new Float32Array(sr);channel[0]=1;channel[sr-1]=.5;
 const {samples,duration}=placeAnalysisAudio(buffer([channel]),.4,10);
 assert.equal(duration,10);assert.equal(samples[0],0);assert.equal(samples[Math.round(.4*sr)],1);assert.equal(samples[Math.round(1.4*sr)-1],.5);
});
test('negative AAC priming is clipped without shifting the remaining beat',()=>{
 const channel=new Float32Array(sr);channel[0]=.9;channel[512]=.7;channel[1024]=1;
 const {samples}=placeAnalysisAudio(buffer([channel]),-512/sr,8);
 assert.ok(Math.abs(samples[0]-.7)<1e-6);assert.equal(samples[512],1);assert.equal(samples[sr],0);
});
test('mono mix retains timing and trims samples at the movie end',()=>{
 const a=new Float32Array(sr*9).fill(.8),b=new Float32Array(sr*9).fill(.2);
 const {samples}=placeAnalysisAudio(buffer([a,b]),0,8);assert.equal(samples.length,sr*8);assert.ok(samples.every(n=>Math.abs(n-.5)<1e-6));
});
test('invalid lengths and clock rates cannot silently produce a grid',()=>{
 for(const duration of [NaN,Infinity,0,7.9,601])assert.throws(()=>placeAnalysisAudio(buffer([new Float32Array(1)]),0,duration));
 assert.throws(()=>placeAnalysisAudio({...buffer([new Float32Array(1)]),sampleRate:44100},0,8));
});
test('cancelled extraction does not start a decoder',async()=>{
 const controller=new AbortController();controller.abort();let stages=0;
 await assert.rejects(decodeAnalysisAudio(new Blob(['test']),controller.signal,()=>stages++),{name:'AbortError'});assert.equal(stages,0);
});
