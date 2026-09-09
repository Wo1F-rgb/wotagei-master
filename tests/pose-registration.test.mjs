import test from 'node:test';import assert from 'node:assert/strict';
import {fitPoseSequence,samplingPlan,selectSubject,subjectFromPose,resizeRegistration} from '../lib/pose-registration.ts';
import {displayPose,transformPose,jointAngle} from '../lib/pose-geometry.ts';
const stage={width:960,height:540};
function person(phase=0){
 const p=Array.from({length:33},()=>({x:480,y:270,visibility:1}));
 for(const [i,x,y] of [[0,480,80],[11,425,155],[12,535,155],[23,445,300],[24,515,300],[25,405,390],[26,560,390],[27,365,500],[28,595,500],[13,390,230],[15,400,320]])p[i]={x:x+phase,y,visibility:1};
 return p;
}
test('multiple moving poses recover a single scale and position while preserving chosen roll and limb angles',()=>{
 const pairs=Array.from({length:12},(_,i)=>{const reference=person(i*2);reference[0].x+=i*10;reference[13].x-=i*3;return {reference,self:transformPose(reference,{x:8,y:-7,scale:.8,rotation:12},stage)};});
 const result=fitPoseSequence(pairs,stage,-12);assert.equal(result.frames,12);assert.equal(result.alignment.rotation,-12);assert.ok(Math.abs(result.alignment.scale-1.25)<1e-8);
 for(const pair of pairs){const aligned=transformPose(pair.self,result.alignment,stage);for(const i of [0,11,12,23,24,27,28]){assert.ok(Math.hypot(aligned[i].x-pair.reference[i].x,aligned[i].y-pair.reference[i].y)<1e-7);}assert.ok(Math.abs(jointAngle(aligned,11,13,15)-jointAngle(pair.self,11,13,15))<1e-8);}
});
test('a few misdetected sizes do not become the scale, and invisible feet do not set position',()=>{
 const good=Array.from({length:12},()=>({reference:person(),self:transformPose(person(),{x:7,y:-4,scale:.9,rotation:0},stage)}));
 const bad=Array.from({length:3},()=>({reference:person(),self:transformPose(person(),{x:80,y:10,scale:.25,rotation:0},stage)}));
 for(const pair of good)for(const i of [27,28])pair.self[i]={x:9e4,y:9e4,visibility:.1};
 const fit=fitPoseSequence([...good,...bad],stage);assert.equal(fit.frames,12);assert.ok(Math.abs(fit.alignment.scale-1/.9)<1e-8);
 const aligned=transformPose(good[0].self,fit.alignment,stage);assert.ok(Math.hypot(aligned[23].x-person()[23].x,aligned[23].y-person()[23].y)<1e-7);
});
test('insufficient, shoulder-only, nonfinite, and extreme corrections are rejected instead of adopted',()=>{
 const pair={reference:person(),self:person()};assert.throws(()=>fitPoseSequence(Array(5).fill(pair),stage));
 const noTorso=person();noTorso[11].visibility=.1;noTorso[12].visibility=.1;assert.throws(()=>fitPoseSequence(Array(8).fill({...pair,self:noTorso}),stage));
 const huge=transformPose(person(),{x:0,y:0,scale:.25,rotation:0},stage);assert.throws(()=>fitPoseSequence(Array(8).fill({...pair,self:huge}),stage),/倍率/);
 const invalid=person();invalid[23].x=NaN;assert.throws(()=>fitPoseSequence(Array(8).fill({...pair,self:invalid}),stage));
 assert.throws(()=>fitPoseSequence(Array(8).fill(pair),{width:0,height:540}));
});
const normalized=(p=person())=>p.map(v=>({...v,x:v.x/960,y:v.y/540}));
test('a missing dancer never falls back to a spectator, even if only one pose remains',()=>{
 const main=normalized(),seed=subjectFromPose(main);assert.ok(seed);
 const spectator=main.map(p=>({...p,x:.13+(p.x-.5)*.35,y:.6+(p.y-.5)*.35}));
 assert.equal(selectSubject([spectator],seed),null);assert.equal(selectSubject([spectator,main],seed),main);
 const bystander=main.map(p=>({...p,x:p.x+.005}));assert.equal(selectSubject([main,bystander],seed),null);
 const bent=main.map(p=>({...p}));bent[0].x+=.12;bent[27].x-=.06;bent[28].x+=.06;assert.equal(selectSubject([bent],seed),bent);
 assert.equal(subjectFromPose([]),null);
});
test('sampling uses beat-mapped overlap, includes late sections, and never clamps an unavailable self frame',()=>{
 const times=samplingPlan([30,20],[2,.5],[150,120]);assert.equal(times.length,32);
 for(const [r,s] of times){assert.ok(r>0&&r<30&&s>0&&s<20);assert.ok(Math.abs(s-(.5+(r-2)*1.25))<1e-10);}
 assert.ok(times.at(-1)[1]>19);assert.ok(times[0][0]>1.6);
 assert.throws(()=>samplingPlan([1,1],[0,2],[120,120]),/区間/);assert.throws(()=>samplingPlan([30,20],[0,0],[0,120]));
});
test('portrait, landscape and panel resizing retain the same alignment in video coordinates',()=>{
 const before={width:556,height:784},refSize={width:1278,height:720},ownSizes=[{width:1280,height:720},{width:720,height:1280}];
 const a={x:13,y:2,scale:.99,rotation:-3,perspectiveX:.01,perspectiveY:-.01};
 for(const selfSize of ownSizes)for(const after of [{width:276,height:540},{width:700,height:250}]){
  const changed=resizeRegistration(a,before,after,refSize,selfSize),k=Math.min(after.width/refSize.width,after.height/refSize.height)/Math.min(before.width/refSize.width,before.height/refSize.height);
  const p=normalized(),old=transformPose(displayPose(p,selfSize,before,false),a,before),next=transformPose(displayPose(p,selfSize,after,false),changed,after);
  for(let i=0;i<p.length;i++){assert.ok(Math.abs(next[i].x-(after.width/2+(old[i].x-before.width/2)*k))<1e-7);assert.ok(Math.abs(next[i].y-(after.height/2+(old[i].y-before.height/2)*k))<1e-7);}
 }
});
