import test from 'node:test';
import assert from 'node:assert/strict';
import {practiceRateOptions,PRACTICE_RATE_PRESETS} from '../lib/practice-rate.ts';
import {validateConfig} from '../lib/webmcp.ts';
import {closestYouTubeRate,resolveYouTubeRate} from '../lib/youtube-rate.ts';

test('quarter-step choices span 0.25 through 2.5 and all pass the app configuration boundary',()=>{
 assert.deepEqual(PRACTICE_RATE_PRESETS,[.25,.5,.75,1,1.25,1.5,1.75,2,2.25,2.5]);
 for(const rate of practiceRateOptions(1))assert.equal(validateConfig({rate}).rate,rate);
 assert.throws(()=>validateConfig({rate:2.5001}));assert.throws(()=>validateConfig({rate:.2499}));
});
test('fine and YouTube-adjusted values remain visible without replacing the quarter-step choices',()=>{
 for(const current of [1.037,.9974999999999999]){
  const options=practiceRateOptions(current);assert.ok(options.includes(current));assert.equal(options.length,11);
  for(const rate of PRACTICE_RATE_PRESETS)assert.ok(options.includes(rate));
 }
 assert.equal(practiceRateOptions(2.5).length,10);
});
test('YouTube negotiation and closest-rate fallback permit the expanded practice speed range',async()=>{
 const media={playbackRate:1,rates:[.5,1,2]};
 const exact=await resolveYouTubeRate(media,120,120,0,2.5,()=>true);
 assert.equal(exact.rate,2.5);assert.equal(exact.reference,2.5);assert.equal(exact.self,2.5);assert.equal(exact.fallback,false);
 assert.equal(closestYouTubeRate([2,2.25,2.5],120,120,0,2.5).rate,2.5);
 const near=closestYouTubeRate([1,2,2.5],120,126,1,2.5);
 assert.equal(near.reference,2.5);assert.ok(Math.abs(near.self-2.380952380952381)<1e-10);
});
