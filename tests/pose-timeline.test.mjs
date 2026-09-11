import test from 'node:test';import assert from 'node:assert/strict';
import {poseSamplingPlan,poseAt} from '../lib/pose-timeline.ts';
const point=(time,visibility=1)=>[{x:time*2,y:time*3,visibility}];
const timeline={samples:Array.from({length:31},(_,i)=>({time:i/15,points:point(i/15)})),step:1/15,duration:2,size:{width:640,height:360}};
test('recorded pose sampling is bounded, spans the entire video and targets 15 Hz',()=>{
 const plan=poseSamplingPlan(30);assert.ok(plan.step<=1/15);assert.equal(plan.times[0],0);assert.equal(plan.times.at(-1),29.98);
 assert.equal(poseSamplingPlan(10000).times.length,9001);assert.equal(poseSamplingPlan(.01).times[0],0);
 for(const value of [0,-1,NaN,Infinity])assert.throws(()=>poseSamplingPlan(value));
});
test('interpolation has no causal hold lag at arbitrary displayed source times and rate/seek order',()=>{
 for(const time of [.15,.333,1.131,1.9,.01,1.4,0,2,.15]){
  const result=poseAt(timeline,time);assert.ok(Math.abs(result[0].x-time*2)<1e-12);assert.ok(Math.abs(result[0].y-time*3)<1e-12);
 }
 for(const time of [NaN,-.1,2.01,Infinity])assert.equal(poseAt(timeline,time),null);
});
test('lost detections hide bones immediately instead of holding or bridging old poses',()=>{
 const missing={...timeline,samples:timeline.samples.map((sample,i)=>i===10?{...sample,points:null}:sample)};
 assert.equal(poseAt(missing,9.5/15),null);assert.equal(poseAt(missing,10/15),null);assert.equal(poseAt(missing,10.5/15),null);assert.ok(poseAt(missing,11/15));
 const gap={...timeline,samples:timeline.samples.filter((s,i)=>i<10||i>20)};
 assert.equal(poseAt(gap,1),null);
});
test('uncertain or absent joints cannot become visible through interpolation',()=>{
 const partial={...timeline,samples:[{time:0,points:point(0)},{time:.06,points:point(.06,.1)}]};
 assert.equal(poseAt(partial,.03)[0].visibility,.1);
 partial.samples[1].points=[];assert.equal(poseAt(partial,.03)[0].visibility,0);
});
