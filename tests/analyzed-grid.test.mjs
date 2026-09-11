import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeDetectedGrid,waveformPeaks} from '../lib/analyzed-grid.ts';
import {rhythmChunks,rhythmPeaks,downbeatsOnBeats} from '../lib/rhythm-features.ts';

const distance=(a,b,period)=>Math.abs(a-b-Math.round((a-b)/period)*period);
test('whole audio grid estimates slope and bar phase without anchoring a noisy first beat',()=>{
 const bpm=146.877,period=60/bpm,origin=.217,duration=90;
 const beats=Array.from({length:Math.floor((duration-origin)/period)},(_,i)=>origin+i*period+.006*Math.sin(i*2.1)+(i===0?.08:0));
 const result=analyzeDetectedGrid(beats,beats.filter((_,i)=>i%4===2),duration);
 assert.ok(result&&!result.variable);assert.ok(Math.abs(result.bpm-bpm)<.02);
 assert.ok(distance(result.origin,origin+2*period,4*period)<.002);
 assert.ok(result.errorMs<8&&result.driftMs<3&&result.coverage>.95);
});
test('occasional missing and extra detections do not shift the remaining grid by a beat',()=>{
 const beats=Array.from({length:72},(_,i)=>.18+i*.4).filter((_,i)=>i!==7&&i!==44);beats.splice(15,0,beats[14]+.1);
 const result=analyzeDetectedGrid(beats,[],29);
 assert.ok(result&&!result.variable);assert.ok(Math.abs(result.bpm-150)<1e-7);assert.ok(distance(result.origin,.18,.4)<1e-7);
});
test('a sparse section is not reported as a confident whole-song grid',()=>{
 const result=analyzeDetectedGrid(Array.from({length:25},(_,i)=>10+i*.4),[],40);
 assert.ok(result?.variable);assert.ok(result.coverage<.3);
});
test('tempo drift and a tempo change cannot silently become an approved fixed grid',()=>{
 for(const times of [Array.from({length:120},(_,i)=>.2+i*.4+i*i*.00016),Array.from({length:120},(_,i)=>.2+(i<60?i*.4:24+(i-60)*.43))]){
  const result=analyzeDetectedGrid(times,[],times.at(-1)+.3);assert.ok(!result||result.variable);
 }
});
test('no beats, invalid detections and short snippets have no fabricated default tempo',()=>{
 assert.equal(analyzeDetectedGrid([],[],30),null);
 assert.equal(analyzeDetectedGrid([NaN,Infinity,-1,3],[],30),null);
 assert.equal(analyzeDetectedGrid(Array.from({length:20},(_,i)=>i*.3),[],6),null);
});
test('ONNX windows cover every real frame including short clips and shifted last chunks',()=>{
 for(const frames of [401,1487,1488,1489,1500,1624,15001]){
  const counts=new Uint8Array(frames);
  for(const {start,length} of rhythmChunks(frames))for(let j=6;j<length-6;j++){const i=start+j;if(i>=0&&i<frames)counts[i]++;}
  assert.ok(counts.every(c=>c>=1),`uncovered frame with ${frames} frames`);
  assert.ok(rhythmChunks(frames).every(c=>c.length<=1500));
 }
});
test('logit peak decoding rejects negatives and snaps downbeats to detected beats',()=>{
 const x=new Float32Array(100).fill(-1);x[10]=2;x[11]=2;x[12]=1;x[50]=3;
 assert.deepEqual(rhythmPeaks(x),[.21,1]);
 assert.deepEqual(downbeatsOnBeats([.21,1],[.22,.3,1.01]),[.21,1]);
 assert.deepEqual(rhythmPeaks(new Float32Array(100)),[]);
});
test('waveform preview preserves silent parts and normalises finite nonempty audio',()=>{
 assert.deepEqual(waveformPeaks(new Float32Array(100),4),[0,0,0,0]);
 const data=new Float32Array(100);data[1]=.5;data[51]=1;
 assert.deepEqual(waveformPeaks(data,4),[.5,0,1,0]);
});
