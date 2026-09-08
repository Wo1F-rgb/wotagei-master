import test from 'node:test';import assert from 'node:assert/strict';
import {fitPoses,alignPoses,displayPose,transformPose,jointAngle,perspectivePose,perspectiveMatrix} from '../lib/pose-geometry.ts';
const stage={width:640,height:480};
function person(){const p=Array.from({length:33},()=>({x:320,y:240,visibility:1}));p[0]={x:300,y:70,visibility:1};p[11]={x:240,y:150,visibility:1};p[12]={x:360,y:150,visibility:1};p[23]={x:260,y:260,visibility:1};p[24]={x:340,y:260,visibility:1};p[27]={x:190,y:420,visibility:1};p[28]={x:410,y:420,visibility:1};p[13]={x:200,y:220,visibility:1};p[15]={x:230,y:290,visibility:1};return p;}
test('standing registration recovers translation and scale without rotating or warping limbs',()=>{
 const reference=person(),self=transformPose(reference,{x:10,y:-5,scale:.7,rotation:0},stage);
 const fit=alignPoses(reference,self,stage),result=transformPose(self,fit,stage);
 for(const i of [11,12,23,24,13,15]){assert.ok(Math.abs(result[i].x-reference[i].x)<1e-6);assert.ok(Math.abs(result[i].y-reference[i].y)<1e-6);}
 assert.ok(Math.abs(jointAngle(self,11,13,15)-jointAngle(result,11,13,15))<1e-6);
 assert.equal(fit.rotation,0);
});
test('wide stance, shoulder tilt and arm movements never change the camera fit',()=>{
 const reference=person(),self=person();self[27].x-=80;self[28].x+=80;
 self[11].y+=50;self[12].y-=50;self[13].x+=150;self[15].y-=130;
 const fit=alignPoses(reference,self,stage);
 assert.deepEqual(fit,{x:0,y:0,scale:1,rotation:0});
});
test('user-selected rotation is preserved while position and size are fitted',()=>{
 const reference=person(),self=transformPose(reference,{x:5,y:-3,scale:.8,rotation:10},stage);
 const fit=alignPoses(reference,self,stage,-10),result=transformPose(self,fit,stage);
 assert.equal(fit.rotation,-10);
 for(const i of [0,23,24,27,28]){assert.ok(Math.abs(result[i].x-reference[i].x)<1e-8);assert.ok(Math.abs(result[i].y-reference[i].y)<1e-8);}
});
test('bent torso and lifted foot use a bounded approximate fit instead of a stance error',()=>{
 for(const change of [p=>{p[0].x+=100;},p=>{p[27].y-=90;}]){
  const self=person();change(self);const fit=fitPoses(person(),self,stage);
  assert.equal(fit.approximate,true);assert.equal(fit.alignment.rotation,0);
  assert.ok(Math.abs(fit.alignment.scale-1)<1e-6);
  const aligned=transformPose(self,fit.alignment,stage);
  for(const i of [23,24]){assert.ok(Math.abs(aligned[i].x-person()[i].x)<1e-6);assert.ok(Math.abs(aligned[i].y-person()[i].y)<1e-6);}
 }
 const tiny=transformPose(person(),{x:0,y:0,scale:.4,rotation:0},stage),fit=fitPoses(person(),tiny,stage);
 assert.equal(fit.limited,true);assert.equal(fit.alignment.scale,2);
});
test('approximate registration recovers scale and hip location across different joint bends',()=>{
 const reference=person(),posed=person();posed[0].x+=110;
 // Rotate one lower leg around its knee without changing the bone length.
 const dx=posed[27].x-posed[25].x,dy=posed[27].y-posed[25].y;
 posed[27].x=posed[25].x-dy;posed[27].y=posed[25].y+dx;
 const self=transformPose(posed,{x:9,y:-7,scale:.75,rotation:12},stage);
 const fit=fitPoses(reference,self,stage,-12),aligned=transformPose(self,fit.alignment,stage);
 assert.equal(fit.approximate,true);assert.equal(fit.alignment.rotation,-12);
 assert.ok(Math.abs(fit.alignment.scale-1/.75)<1e-8);
 for(const i of [23,24]){assert.ok(Math.abs(aligned[i].x-reference[i].x)<1e-8);assert.ok(Math.abs(aligned[i].y-reference[i].y)<1e-8);}
 assert.ok(Math.abs(jointAngle(aligned,23,25,27)-jointAngle(self,23,25,27))<1e-8);
});
test('different aspect ratios and mirroring use the actual contained video rectangle',()=>{
 const points=[{x:.25,y:.5,visibility:1}];
 assert.deepEqual(displayPose(points,{width:1920,height:1080},stage,false)[0],{x:160,y:240,visibility:1});
 assert.deepEqual(displayPose(points,{width:1080,height:1920},stage,true)[0],{x:387.5,y:240,visibility:1});
});
test('partial visibility can use torso landmarks but absent or degenerate bodies still fail',()=>{
 for(const hidden of [[0],[27,28],[23]]){
  const p=person();for(const i of hidden)p[i].visibility=.2;
  const fit=fitPoses(person(),p,stage);assert.equal(fit.approximate,true);
  assert.ok(Math.abs(fit.alignment.scale-1)<1e-8);
 }
 const absent=person().map(p=>({...p,visibility:.1}));assert.throws(()=>alignPoses(person(),absent,stage),/肩か腰/);
 assert.throws(()=>alignPoses(person(),Array.from({length:33},()=>({x:0,y:0,visibility:1})),stage),/大きさ/);
 const malformed=person().map(p=>({...p,x:NaN}));assert.throws(()=>alignPoses(person(),malformed,stage));
 assert.throws(()=>alignPoses(person(),person(),{width:0,height:480}));
 assert.throws(()=>alignPoses(person(),person(),stage,Infinity));
});
test('an occluded limb cannot set the approximate body scale',()=>{
 const own=person();own[0].x+=110;own[25]={x:1e6,y:-1e6,visibility:.1};
 const fit=fitPoses(person(),own,stage);assert.equal(fit.approximate,true);assert.ok(Math.abs(fit.alignment.scale-1)<1e-8);
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
 const fit=alignPoses(reference,warped,stage,8),result=transformPose(own,{...fit,...perspective},stage);
 for(const i of [11,12,23,24,13,15]){assert.ok(Math.abs(result[i].x-reference[i].x)<1e-8);assert.ok(Math.abs(result[i].y-reference[i].y)<1e-8);}
 assert.deepEqual(perspectivePose(own,{perspectiveX:0,perspectiveY:0},stage),own);
});
