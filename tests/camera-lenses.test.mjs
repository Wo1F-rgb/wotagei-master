import test from 'node:test';
import assert from 'node:assert/strict';
import {cameraKind,cameraDevices,readCameraLens,cameraZoomTarget,applyCameraZoom} from '../lib/camera-lenses.ts';
import {cameraCrop,cameraZoomClip} from '../lib/camera-recording.ts';
const device=(id,label)=>({kind:'videoinput',deviceId:id,label});
function track({label='Back Wide Angle Camera',id='wide',range,zoom,ignore=false,fail=false}={}){
 const calls=[];return {label,readyState:'live',calls,getSettings:()=>({deviceId:id,zoom}),getCapabilities:()=>({zoom:range}),getConstraints:()=>({width:{ideal:1280},frameRate:{max:30}}),applyConstraints:async c=>{calls.push(c);if(fail)throw new DOMException('denied','OverconstrainedError');if(!ignore)zoom=c.zoom.exact;}};
}
test('identify physical rear ultra-wide without trusting device order or virtual camera labels',()=>{
 const t=track(),list=cameraDevices([device('front','Front Ultra Wide Camera'),device('tele','背面望遠カメラ'),device('virtual','Back Triple Camera'),device('ultra','背面超広角カメラ'),device('wide','Back Wide Angle Camera'),device('wide','duplicate')],t,'environment');
 assert.equal(list.length,5);assert.equal(cameraKind('Back Dual Wide Camera'),'other');
 const lens=readCameraLens(t,list);assert.equal(cameraZoomTarget(.5,list,lens,'environment').deviceId,'ultra');assert.equal(cameraZoomTarget(2,list,lens,'environment').deviceId,'wide');
 assert.equal(cameraZoomTarget(.5,list,lens,'user'),null,'never switch selfie to rear via zoom');
 assert.equal(cameraZoomTarget(.5,[],lens,'environment'),null,'cannot invent wider pixels');
});
test('unknown localized labels remain available for manual selection; missing capability methods are allowed',()=>{
 const t=track({id:'opaque',label:'カメラ'}),list=cameraDevices([device('opaque',''),device('other','レンズ B'),device('unknown-ultra','Ultra Wide Camera')],t,'environment');
 assert.equal(list[0].label,'カメラ 1');assert.equal(list[0].facing,'environment');assert.equal(list[1].facing,undefined);
 assert.equal(cameraZoomTarget(.5,list,readCameraLens(t,list),'environment'),null);
});
test('camera-supported zoom preserves constraints and reads the actual result',async()=>{
 const t=track({range:{min:1,max:4,step:.1},zoom:1}),lens=readCameraLens(t,[]),next=await applyCameraZoom(t,lens,2);
 assert.equal(next.zoom,2);assert.equal(next.digital,1);assert.deepEqual(t.calls[0].width,{ideal:1280});assert.deepEqual(t.calls[0].frameRate,{max:30});
 assert.equal((await applyCameraZoom(t,next,1)).zoom,1);
});
test('a virtual camera can expose a genuine 0.5x zoom range without separately named physical lenses',async()=>{
 const t=track({label:'Back Triple Camera',range:{min:.5,max:10,step:.1},zoom:1}),lens=readCameraLens(t,[]);
 assert.equal(lens.base,1);assert.equal(lens.canWiden,true);assert.equal(cameraZoomTarget(.5,[],lens,'environment').deviceId,'wide');
 const next=await applyCameraZoom(t,lens,.5);assert.equal(next.zoom,.5);assert.equal(next.digital,1);assert.equal(t.calls[0].zoom.exact,.5);
});
test('missing, ignored or rejected hardware zoom falls back to real central cropping, never fake 0.5x',async()=>{
 for(const options of [{},{range:{min:1,max:4},zoom:1,ignore:true},{range:{min:1,max:4},zoom:1,fail:true}]){
  const t=track(options),lens=readCameraLens(t,[]);assert.equal((await applyCameraZoom(t,lens,2)).digital,2);await assert.rejects(applyCameraZoom(t,lens,.5),/広くできません/);
 }
});
test('ultrawide native 1x corresponds to 0.5x; hardware-limited zoom uses only the remaining digital factor',async()=>{
 const t=track({id:'ultra',label:'背面超広角カメラ',range:{min:1,max:2,step:.1},zoom:1}),lens=readCameraLens(t,[]);
 assert.equal(lens.zoom,.5);assert.equal((await applyCameraZoom(t,lens,.5)).digital,1);
 const next=await applyCameraZoom(t,lens,2);assert.equal(next.zoom,2);assert.equal(next.digital,2);
 t.readyState='ended';await assert.rejects(applyCameraZoom(t,lens,1),/停止/);
});
test('digital crop preserves input aspect ratio and preview letterboxing in either orientation',()=>{
 assert.deepEqual(cameraCrop(1280,720,2),{x:320,y:180,width:640,height:360});
 assert.deepEqual(cameraCrop(720,1280,2),{x:180,y:320,width:360,height:640});
 assert.equal(cameraZoomClip(1280,720,{width:1280,height:720},2),'inset(180px 320px)');
 assert.equal(cameraZoomClip(720,1280,{width:1280,height:720},2),'inset(180px 538.75px)');
 assert.equal(cameraZoomClip(1280,720,{width:1280,height:720},1),undefined);
});
