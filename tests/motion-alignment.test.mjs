import test from 'node:test';import assert from 'node:assert/strict';
import {buildMotionCurve,measureMotionPair,motionAt,motionSamplingPlan,motionTarget,motionWeightAt} from '../lib/motion-alignment.ts';
import {restoreVideoDisplay} from '../lib/video-display.ts';
import {displayPose,transformPose} from '../lib/pose-geometry.ts';
import {resizeRegistration} from '../lib/pose-registration.ts';
const stage={width:960,height:540},identity={x:0,y:0,scale:1,rotation:0};
function dancer(t){
 const p=Array.from({length:33},()=>({x:.5,y:.5,visibility:1})),dx=.07*Math.sin(t*3),dy=.015*Math.cos(t*4);
 for(const [i,x,y] of [[0,.5,.12],[11,.43,.3],[12,.57,.3],[23,.46,.56],[24,.54,.56],[27,.3,.92],[28,.7,.92]])p[i]={x:x+dx,y:y+dy,visibility:1};
 return p;
}
const shake=t=>({x:6*Math.sin(Math.PI*t/2),y:2*Math.sin(Math.PI*t/2),scale:1+.08*Math.sin(Math.PI*t/2),rotation:0});
function fixture(target=1){
 return {samples:Array.from({length:49},(_,i)=>{const t=i/6,p=dancer(t),q=transformPose(displayPose(p,stage,stage,false),shake(t),stage).map(p=>({...p,x:p.x/stage.width,y:p.y/stage.height}));return {time:t,poses:target===1?[p,q]:[q,p]};}),sizes:[stage,stage],anchor:2,step:1/6};
}
const options=target=>({stage,alignments:[identity,identity],mirrors:[false,false],scenes:[null,null],target});
test('new videos default to tripod ON and mirror OFF; explicit saved choices still restore',()=>{
 for(const value of [null,undefined,{},'bad',{mirror:'true',tripod:0}])assert.deepEqual(restoreVideoDisplay(value),{mirror:false,tripod:true});
 assert.deepEqual(restoreVideoDisplay({mirror:true,tripod:false}),{mirror:true,tripod:false});
 assert.deepEqual(restoreVideoDisplay({mirror:false}),{mirror:false,tripod:true});
});
test('only non-tripod footage moves; two moving cameras respect either chosen spatial master',()=>{
 for(const master of [0,1]){assert.equal(motionTarget([true,true],master),null);assert.equal(motionTarget([true,false],master),1);assert.equal(motionTarget([false,true],master),0);assert.equal(motionTarget([false,false],master),1-master);}
});
test('dense samples use corresponding beats with unequal BPM and both first-beat origins',()=>{
 const plan=motionSamplingPlan([30,20],[2,.5],[150,120]);assert.ok(plan.length>90);assert.ok(plan[1][0]-plan[0][0]<=1/6);
 for(const [a,b] of plan){assert.ok(a>=0&&a<30&&b>=0&&b<20);assert.ok(Math.abs((a-2)*150-(b-.5)*120)<1e-8);}
 assert.ok(plan.at(-1)[1]>19.8);assert.ok(motionSamplingPlan([600,600],[0,0],[120,120]).length<=1801);
 assert.throws(()=>motionSamplingPlan([1,1],[0,2],[120,120]));assert.throws(()=>motionSamplingPlan([30,20],[0,0],[0,120]));
});
test('paired dancing poses cancel dance motion and recover small camera translation and zoom in either video',()=>{
 for(const target of [0,1]){
  const data=fixture(target),curve=buildMotionCurve(data,options(target));assert.equal(curve.accepted,49);
  let before=0,after=0;
  for(const sample of data.samples){const correction=motionAt(curve,sample.time),moving=displayPose(sample.poses[target],stage,stage,false),fixed=displayPose(sample.poses[1-target],stage,stage,false),fitted=transformPose(moving,{...correction,rotation:0},stage);
   for(const i of [11,12,23,24]){before+=Math.hypot(moving[i].x-fixed[i].x,moving[i].y-fixed[i].y);after+=Math.hypot(fitted[i].x-fixed[i].x,fitted[i].y-fixed[i].y);}
  }
  assert.ok(after<before*.1,`camera residual ${after/before}`);
  assert.ok(motionAt(curve,3).scale>1.05,'sustained synthetic zoom should remain available');
  assert.deepEqual(motionAt(curve,2),{x:0,y:0,scale:1});
 }
});
test('arms, stance width and invisible joints cannot drive roll or fitting of individual body parts',()=>{
 const a=displayPose(dancer(0),stage,stage,false),b=a.map(p=>({...p}));for(const i of [0,13,14,15,16,27,28])b[i]={x:9000,y:-9000,visibility:1};
 assert.deepEqual(measureMotionPair(a,b,stage),{x:0,y:0,logScale:0});
 b[11].visibility=.1;assert.equal(measureMotionPair(a,b,stage),null);
 const rotated=transformPose(a,{...identity,rotation:90},stage),fallback=measureMotionPair(a,rotated,stage);assert.ok(fallback);assert.equal(fallback.logScale,0);
});
test('pose-dependent torso gates keep a bounded translation while holding scale at baseline',()=>{
 const anchor=displayPose(dancer(0),stage,stage,false),moving=anchor.map(p=>({...p}));
 for(const i of [23,24])moving[i]={...moving[i],x:moving[i].x+90};
 const fit=measureMotionPair(anchor,moving,stage);assert.ok(fit);assert.equal(fit.logScale,0);assert.ok(Math.abs(fit.x+72)<1e-8);assert.equal(fit.y,0);
});
test('isolated scale evidence cannot invent zoom without a reliable anchor baseline',()=>{
 const samples=Array.from({length:25},(_,i)=>{const p=dancer(i/6),alignment=i===12?{x:0,y:0,scale:1.25,rotation:0}:{x:0,y:0,scale:1,rotation:90};const q=transformPose(displayPose(p,stage,stage,false),alignment,stage).map(v=>({...v,x:v.x/stage.width,y:v.y/stage.height}));return {time:i/6,poses:[p,q]};});
 const curve=buildMotionCurve({samples,sizes:[stage,stage],anchor:1,step:1/6},options(1));assert.equal(curve.accepted,25);
 for(const t of [0,1,2,3,4])assert.equal(motionAt(curve,t).scale,1);
});
test('a later run of plausible scale cannot affect translation when the anchor has no scale evidence',()=>{
 const p=dancer(0),samples=Array.from({length:37},(_,i)=>{const q=transformPose(displayPose(p,stage,stage,false),{x:0,y:0,scale:i<12?1:1.25,rotation:i<12?90:0},stage).map(v=>({...v,x:v.x/stage.width,y:v.y/stage.height}));return {time:i/6,poses:[p,q]};});
 const data={samples,sizes:[stage,stage],anchor:1,step:1/6},curve=buildMotionCurve(data,options(1));
 const center=points=>({x:.4*(points[23].x+points[24].x)+.1*(points[11].x+points[12].x),y:.4*(points[23].y+points[24].y)+.1*(points[11].y+points[12].y)});
 const first=center(samples[0].poses[1]),later=center(samples[24].poses[1]),fit=motionAt(curve,4);
 assert.equal(fit.scale,1);assert.ok(Math.abs(fit.x-(first.x-later.x)*100)<1e-8);assert.ok(Math.abs(fit.y-(first.y-later.y)*100)<1e-8);
});
test('an isolated bad measurement is suppressed, and a long detection loss does not bridge to a spectator',()=>{
 const data=fixture(),bad=data.samples[20];bad.poses[1]=bad.poses[1].map(p=>({...p,x:p.x+.3}));
 const curve=buildMotionCurve(data,options(1));assert.ok(Math.abs(motionAt(curve,20/6).x)<10);
 for(const sample of data.samples)if(sample.time>=3&&sample.time<=5)sample.poses=[null,null];
 const gaps=buildMotionCurve(data,options(1));assert.deepEqual(motionAt(gaps,4),{x:0,y:0,scale:1});
 assert.deepEqual(motionAt(gaps,-1),{x:0,y:0,scale:1});assert.deepEqual(motionAt(gaps,99),{x:0,y:0,scale:1});
});
test('each-frame interpolation has no history or playback-speed dependency and strength zero is a true bypass',()=>{
 const curve=buildMotionCurve(fixture(),options(1)),first=motionAt(curve,1.08);motionAt(curve,7);assert.deepEqual(motionAt(curve,1.08),first);
 const a=motionAt(curve,1),b=motionAt(curve,1+1/6),m=motionAt(curve,1+1/12);assert.ok(Math.abs(m.x-(a.x+b.x)/2)<1e-9);
 const half=motionAt(curve,1.08,.5);assert.equal(half.x,first.x*.5);assert.ok(Math.abs(half.scale**2-first.scale)<1e-10);
 assert.deepEqual(motionAt(curve,1.08,0),{x:0,y:0,scale:1});assert.deepEqual(motionAt(curve,NaN),{x:0,y:0,scale:1});
});
test('motion coverage reports interpolation, faded gaps and strength without changing motionAt',()=>{
 const curve={frames:[{time:0,x:2,y:0,logScale:0},{time:1,x:4,y:0,logScale:0}],target:1,accepted:2,total:2,maxGap:1.5};
 assert.equal(motionWeightAt(curve,.5),1);assert.equal(motionWeightAt(curve,1,.5),.5);assert.ok(Math.abs(motionWeightAt(curve,1.2)-.104)<1e-12);assert.equal(motionWeightAt(curve,1.3),0);assert.equal(motionWeightAt(curve,1.5),0);assert.equal(motionWeightAt(null,1),0);
});
test('rotation of the phone preserves the camera correction in contained video coordinates',()=>{
 const data=fixture(),before=buildMotionCurve(data,options(1)),after={width:390,height:480},a=resizeRegistration(identity,stage,after,stage,stage),next=buildMotionCurve(data,{...options(1),stage:after,alignments:[a,a]});
 const factor=Math.min(after.width/stage.width,after.height/stage.height);
 for(const t of [1,2,3,5]){const p=motionAt(before,t),q=motionAt(next,t);assert.ok(Math.abs(p.x*stage.width*factor-q.x*after.width)<1e-7);assert.ok(Math.abs(p.y*stage.height*factor-q.y*after.height)<1e-7);assert.ok(Math.abs(p.scale-q.scale)<1e-8);}
});
