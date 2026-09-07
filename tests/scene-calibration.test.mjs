import test from 'node:test';
import assert from 'node:assert/strict';
import {sceneMatrix,sceneCss,projectPoint,restoreScene} from '../lib/scene-calibration.ts';
import {body,wall,frame,photograph,positionAndScale,errorPixels} from './calibration-fixtures.mjs';
const config=(camera)=>({mode:'rectangle',points:photograph(wall,camera),aspect:.65,videoAspect:4/3,strength:1});
for(const camera of [{pitch:20},{yaw:25},{pitch:18,yaw:22,roll:9}])test(`wall rectangle removes planar distortion for ${JSON.stringify(camera)} without fitting the body`,()=>{
 const input=photograph(body,camera),reference=photograph(body),h=sceneMatrix(config(camera));
 const before=errorPixels(positionAndScale(input,reference),reference),after=errorPixels(positionAndScale(input.map(p=>projectPoint(h,p)),reference),reference);
 assert.ok(before>2);assert.ok(after<1e-7,`${after}`);
 // Camera correction remains fixed for a changed stance and bent/raised arm pose.
 const changed=body.map(p=>[...p]);changed[5][0]-=.2;changed[6][0]+=.2;changed[9][1]-=.9;
 const changedReference=photograph(changed),result=photograph(changed,camera).map(p=>projectPoint(h,p));
 assert.ok(errorPixels(positionAndScale(result,changedReference),changedReference)<1e-7);
});
test('one-pixel corner selection errors remain small in a moderate view',()=>{
 const camera={pitch:18,yaw:22,roll:9},s=config(camera);s.points=s.points.map((p,i)=>({x:p.x+(i%2?1:-1)/640,y:p.y+(i<2?1:-1)/480}));
 const ref=photograph(body),result=photograph(body,camera).map(p=>projectPoint(sceneMatrix(s),p));assert.ok(errorPixels(positionAndScale(result,ref),ref)<3);
});
test('a level line corrects roll without changing lengths or deriving rotation from feet',()=>{
 const input=photograph([[-.8,0,0],[.8,0,0]],{roll:12}),s={mode:'level',points:input,aspect:1,videoAspect:4/3,strength:1},h=sceneMatrix(s),out=input.map(p=>projectPoint(h,p));
 assert.ok(Math.abs(out[0].y-out[1].y)<1e-10);
 const distance=ps=>Math.hypot((ps[1].x-ps[0].x)*640,(ps[1].y-ps[0].y)*480);assert.ok(Math.abs(distance(input)-distance(out))<1e-7);
 assert.deepEqual(sceneMatrix({...s,strength:0}),[1,0,0,0,1,0,0,0,1]);
});
test('crossed, small, nonfinite and extreme rectangles are rejected and bad saved values ignored',()=>{
 const s=config({pitch:10});assert.throws(()=>sceneMatrix({...s,points:[s.points[0],s.points[2],s.points[1],s.points[3]]}));
 assert.throws(()=>sceneMatrix({...s,points:[{x:.49,y:.49},{x:.51,y:.49},{x:.51,y:.51},{x:.49,y:.51}]}));
 assert.throws(()=>sceneMatrix({...s,points:[{x:NaN,y:0},...s.points.slice(1)]}));
 assert.throws(()=>sceneMatrix({...s,aspect:0}));assert.throws(()=>sceneMatrix({...s,strength:3}));
 assert.throws(()=>sceneMatrix({...s,points:[{x:.42,y:.2},{x:.58,y:.2},{x:.9,y:.8},{x:.1,y:.8}]}),/極端/);
 assert.equal(restoreScene({mode:'bogus'}),null);assert.equal(restoreScene({points:null}),null);assert.deepEqual(restoreScene(s),s);
});
test('CSS centered matrix matches normalized projection for portrait/landscape letterboxing and mirrors',()=>{
 for(const videoAspect of [9/16,4/3,16/9]){
 const s={...config({pitch:18,yaw:22,roll:9}),videoAspect},h=sceneMatrix(s);
 for(const stage of [frame,{width:390,height:270},{width:700,height:200}])for(const mirror of [false,true]){
  const m=sceneCss(s,stage).slice(9,-1).split(',').map(Number),w=Math.min(stage.width,stage.height*s.videoAspect),height=w/s.videoAspect;
  for(const p of [{x:.1,y:.1},{x:.9,y:.9},{x:.5,y:.5}]){
   const x=(p.x-.5)*w,y=(p.y-.5)*height,den=m[3]*x+m[7]*y+m[15],px=(m[0]*x+m[4]*y+m[12])/den,py=(m[1]*x+m[5]*y+m[13])/den,q=projectPoint(h,p);
   assert.ok(Math.abs((mirror?-px:px)-(mirror?-(q.x-.5)*w:(q.x-.5)*w))<1e-7);assert.ok(Math.abs(py-(q.y-.5)*height)<1e-7);
  }
 }
 }
});
test('off-plane limbs retain parallax: rectangle correction cannot promise a new 3D viewpoint',()=>{
 const camera={pitch:18,yaw:22},nonplanar=body.map((p,i)=>[p[0],p[1],i>=7?-.45:0]),ref=photograph(nonplanar),h=sceneMatrix(config(camera));
 const result=photograph(nonplanar,camera).map(p=>projectPoint(h,p)),error=errorPixels(positionAndScale(result,ref),ref);assert.ok(error>8);
});
