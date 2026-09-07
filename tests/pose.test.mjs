import test from 'node:test';import assert from 'node:assert/strict';
import {alignPoses,displayPose,transformPose,jointAngle,perspectivePose,perspectiveMatrix} from '../lib/pose-geometry.ts';
const stage={width:640,height:480};
function person(){const p=Array.from({length:33},()=>({x:320,y:240,visibility:1}));p[11]={x:240,y:150,visibility:1};p[12]={x:360,y:150,visibility:1};p[23]={x:260,y:300,visibility:1};p[24]={x:340,y:300,visibility:1};p[13]={x:200,y:220,visibility:1};p[15]={x:230,y:290,visibility:1};return p;}
test('body registration recovers translation, scale and rotation without warping limbs',()=>{
 const reference=person(),self=transformPose(reference,{x:10,y:-5,scale:.7,rotation:12},stage);
 const fit=alignPoses(reference,self,stage),result=transformPose(self,fit,stage);
 for(const i of [11,12,23,24,13,15]){assert.ok(Math.abs(result[i].x-reference[i].x)<1e-6);assert.ok(Math.abs(result[i].y-reference[i].y)<1e-6);}
 assert.ok(Math.abs(jointAngle(self,11,13,15)-jointAngle(result,11,13,15))<1e-6);
});
test('different aspect ratios and mirroring use the actual contained video rectangle',()=>{
 const points=[{x:.25,y:.5,visibility:1}];
 assert.deepEqual(displayPose(points,{width:1920,height:1080},stage,false)[0],{x:160,y:240,visibility:1});
 assert.deepEqual(displayPose(points,{width:1080,height:1920},stage,true)[0],{x:387.5,y:240,visibility:1});
});
test('uncertain or tiny shoulders/hips never produce a misleading alignment',()=>{
 const p=person();p[23].visibility=.2;assert.throws(()=>alignPoses(person(),p,stage));
 assert.throws(()=>alignPoses(person(),Array.from({length:33},()=>({x:0,y:0,visibility:1})),stage));
 assert.equal(jointAngle(p,11,23,25),null);
});
test('vertical and horizontal perspective change near/far size while the center stays fixed',()=>{
 const points=[{x:320,y:240},{x:220,y:80},{x:420,y:80},{x:220,y:400},{x:420,y:400}];
 const vertical=perspectivePose(points,{perspectiveY:.25},stage);
 assert.deepEqual(vertical[0],points[0]);
 assert.ok(vertical[2].x-vertical[1].x>200);assert.ok(vertical[4].x-vertical[3].x<200);
 const horizontal=perspectivePose([{x:100,y:140},{x:100,y:340},{x:540,y:140},{x:540,y:340}],{perspectiveX:.25},stage);
 assert.ok(horizontal[1].y-horizontal[0].y>200);assert.ok(horizontal[3].y-horizontal[2].y<200);
});
test('the CSS projective matrix and skeleton calculation agree for mirrors, aspect ratios and corners',()=>{
 for(const size of [{width:390,height:300},{width:700,height:220}])for(const mirror of [false,true])for(const px of [-.3,0,.3])for(const py of [-.3,0,.3]){
  const a={x:8,y:-4,scale:1.2,rotation:13,perspectiveX:px,perspectiveY:py};
  const matrix=perspectiveMatrix(a,size,mirror),cx=size.width/2,cy=size.height/2;
  for(const point of [{x:0,y:0},{x:size.width,y:size.height},{x:cx,y:cy},{x:100,y:180}]){
   const x=point.x-cx,y=point.y-cy,w=matrix[3]*x+matrix[7]*y+matrix[15];assert.ok(w>=.4-1e-9);
   const projectedX=(matrix[0]*x+matrix[4]*y)/w,projectedY=(matrix[1]*x+matrix[5]*y)/w,angle=a.rotation*Math.PI/180;
   const expected={x:cx+a.x*size.width/100+a.scale*(projectedX*Math.cos(angle)-projectedY*Math.sin(angle)),y:cy+a.y*size.height/100+a.scale*(projectedX*Math.sin(angle)+projectedY*Math.cos(angle))};
   const [actual]=transformPose([{...point,x:mirror?size.width-point.x:point.x}],a,size);
   assert.ok(Math.abs(actual.x-expected.x)<1e-8);assert.ok(Math.abs(actual.y-expected.y)<1e-8);
  }
 }
});
test('body registration preserves a manually calibrated perspective instead of undoing it',()=>{
 const own=person(),perspective={perspectiveX:.14,perspectiveY:-.2},warped=perspectivePose(own,perspective,stage);
 const reference=transformPose(warped,{x:3,y:-4,rotation:8,scale:1.3},stage);
 const fit=alignPoses(reference,warped,stage),result=transformPose(own,{...fit,...perspective},stage);
 for(const i of [11,12,23,24,13,15]){assert.ok(Math.abs(result[i].x-reference[i].x)<1e-8);assert.ok(Math.abs(result[i].y-reference[i].y)<1e-8);}
 assert.deepEqual(perspectivePose(own,{perspectiveX:0,perspectiveY:0},stage),own);
});
