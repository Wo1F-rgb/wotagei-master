import test from 'node:test';
import assert from 'node:assert/strict';
import {gestureAlignment,zoomAlignment} from '../lib/alignment-gesture.ts';
const stage={width:400,height:300},start={x:10,y:-5,scale:1.2,rotation:12,perspectiveX:.1,perspectiveY:-.07,opacity:.6};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('drag moves the displayed image by the finger distance without changing rotation, scale or perspective',()=>{
 const end=gestureAlignment(start,[{x:20,y:40}],[{x:60,y:70}],stage);
 near(end.x,20);near(end.y,5);near(end.scale,1.2);near(end.rotation,12);near(end.perspectiveX,.1);near(end.opacity,.6);assert.equal(start.x,10);
});
test('pinch keeps its focal point stable and includes two-finger translation',()=>{
 const a=[{x:100,y:70},{x:200,y:70}],b=[{x:75,y:95},{x:275,y:95}],end=gestureAlignment(start,a,b,stage);
 near(end.scale,2.4);
 // A visible point at the original midpoint must finish at the new midpoint.
 const content={x:(150-stage.width/2-start.x*4)/start.scale,y:(70-stage.height/2-start.y*3)/start.scale};
 near(stage.width/2+end.x*4+end.scale*content.x,175);near(stage.height/2+end.y*3+end.scale*content.y,95);
});
test('zoom limits use the applied ratio instead of shifting the image beyond its maximum scale',()=>{
 const point={x:120,y:90},large=zoomAlignment(start,point,100,stage);near(large.scale,4);
 const again=zoomAlignment(large,point,2,stage);near(again.x,large.x);near(again.y,large.y);near(again.scale,4);
 const small=zoomAlignment(start,point,.001,stage);near(small.scale,.25);
});
test('lifting a finger and rebasing continues the drag without a jump',()=>{
 const two=gestureAlignment(start,[{x:100,y:100},{x:200,y:100}],[{x:80,y:100},{x:220,y:100}],stage);
 const one=gestureAlignment(two,[{x:220,y:100}],[{x:230,y:120}],stage);near(one.x,two.x+2.5);near(one.y,two.y+20/3);near(one.scale,two.scale);
});
test('invalid or unfinished gestures cannot produce nonfinite transforms',()=>{
 assert.deepEqual(gestureAlignment(start,[],[],stage),start);
 assert.deepEqual(gestureAlignment(start,[{x:0,y:0}],[{x:1,y:1}],{width:0,height:0}),start);
 assert.deepEqual(gestureAlignment(start,[{x:0,y:0}],[{x:NaN,y:1}],stage),start);
 assert.deepEqual(zoomAlignment(start,{x:20,y:20},NaN,stage),start);
 const end=gestureAlignment(start,[{x:0,y:0}],[{x:100000,y:-100000}],stage);assert.equal(end.x,100);assert.equal(end.y,-100);
});
