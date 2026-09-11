import test from 'node:test';import assert from 'node:assert/strict';
import {buildMotionCurve,motionAt} from '../lib/motion-alignment.ts';

const stage={width:960,height:540},identity={x:0,y:0,scale:1,rotation:0};
const options={stage,alignments:[identity,identity],mirrors:[false,false],scenes:[null,null],target:1};

function body(shift=0){
 const p=Array.from({length:33},()=>({x:.5+shift,y:.5,visibility:1}));
 for(const [i,x,y] of [[11,.43,.3],[12,.57,.3],[23,.46,.56],[24,.54,.56],[27,.4,.9],[28,.6,.9]])p[i]={x:x+shift,y,visibility:1};
 return p;
}
function dataAt(time,shift){return {time,poses:[body(),body(shift)]};}
function curveFor(samples){return buildMotionCurve({samples,sizes:[stage,stage],anchor:2,step:1/6},options);}
function harmonicResponse(curve,frequency,amplitude,start=4,end=16){
 const omega=2*Math.PI*frequency;let ss=0,cc=0,sc=0,ys=0,yc=0;
 for(let t=start;t<=end+1e-9;t+=1/6){const s=Math.sin(omega*t),c=Math.cos(omega*t),y=motionAt(curve,t).x;ss+=s*s;cc+=c*c;sc+=s*c;ys+=y*s;yc+=y*c;}
 const determinant=ss*cc-sc*sc,a=(ys*cc-yc*sc)/determinant,b=(yc*ss-ys*sc)/determinant;
 return {gain:Math.hypot(a,b)/(amplitude*100),phase:Math.atan2(b,a)*180/Math.PI};
}

test('short symmetric smoothing keeps .5Hz position response centered and above .8 gain',()=>{
 const amplitude=.05,samples=Array.from({length:121},(_,i)=>{const t=i/6;return dataAt(t,-amplitude*Math.sin(2*Math.PI*.5*t));});
 const response=harmonicResponse(curveFor(samples),.5,amplitude);
 assert.ok(response.gain>.8&&response.gain<.95,`gain ${response.gain}`);
 assert.ok(Math.abs(response.phase)<2,`phase ${response.phase}deg`);
});

test('one isolated translated outlier does not move the position curve',()=>{
 const samples=Array.from({length:61},(_,i)=>dataAt(i/6,0));
 samples[30]=dataAt(30/6,.3);
 const value=motionAt(curveFor(samples),5).x;
 assert.ok(Math.abs(value)<2,`outlier residual ${value}%`);
});

test('a long detection gap fades to identity without bridging the two valid runs',()=>{
 const samples=Array.from({length:121},(_,i)=>{const t=i/6;return t>=8&&t<=9.5?{time:t,poses:[null,null]}:dataAt(t,0);});
 const curve=curveFor(samples);
 assert.deepEqual(motionAt(curve,8.5),{x:0,y:0,scale:1});
 assert.ok(curve.frames.some(frame=>frame.time<8)&&curve.frames.some(frame=>frame.time>9.5));
});
