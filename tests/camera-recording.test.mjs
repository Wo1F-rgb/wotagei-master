import test from 'node:test';
import assert from 'node:assert/strict';
import {cameraConstraints,cameraFrame,captureCameraFrame} from '../lib/camera-recording.ts';

function fixture(t,{frameCallbacks=true}={}){
 const drawing=[],clears=[],frames=new Map(),animations=new Map();let id=0;
 const track={readyState:'live',stop(){this.readyState='ended';}};
 const output={getTracks:()=>[track],getVideoTracks:()=>[track]};
 const canvas={width:0,height:0,getContext:()=>({fillRect:(...v)=>clears.push(v),drawImage:(...v)=>drawing.push(v)}),captureStream:()=>output};
 const video={videoWidth:720,videoHeight:1280,readyState:2,paused:false,playbackRate:1,currentTime:12};
 if(frameCallbacks){video.requestVideoFrameCallback=fn=>{const key=id++;frames.set(key,fn);return key;};video.cancelVideoFrameCallback=key=>frames.delete(key);}
 for(const [key,value] of Object.entries({document:{createElement:()=>canvas},requestAnimationFrame:fn=>{const key=id++;animations.set(key,fn);return key;},cancelAnimationFrame:key=>animations.delete(key)})){
  const prior=globalThis[key];globalThis[key]=value;t.after(()=>{if(prior===undefined)delete globalThis[key];else globalThis[key]=prior;});
 }
 let now=0;function tick(map=animations,time=now+=34){const [key,fn]=map.entries().next().value;map.delete(key);fn(time);}
 return {canvas,video,track,drawing,clears,frames,animations,tick};
}

test('request landscape camera framing without rejecting a camera that can only offer another aspect ratio',()=>{
 const c=cameraConstraints('landscape');assert.equal(c.audio,false);assert.equal(c.video.facingMode,'user');
 assert.deepEqual(c.video.aspectRatio,{ideal:16/9});assert.deepEqual(c.video.width,{ideal:1280});
 assert.deepEqual(cameraFrame('portrait'),{width:720,height:1280});
});

test('landscape recording keeps the entire portrait/square/landscape image upright across device rotations',t=>{
 const f=fixture(t),recording=captureCameraFrame(f.video,'landscape');
 assert.deepEqual([f.canvas.width,f.canvas.height],[1280,720]);
 assert.deepEqual(f.drawing.at(-1).slice(1),[437.5,0,405,720]);
 f.video.videoWidth=960;f.video.videoHeight=960;f.tick();
 assert.deepEqual(f.drawing.at(-1).slice(1),[280,0,720,720]);
 f.video.videoWidth=1920;f.video.videoHeight=1080;f.tick();
 assert.deepEqual(f.drawing.at(-1).slice(1),[0,0,1280,720]);
 assert.deepEqual([f.canvas.width,f.canvas.height],[1280,720]);
 assert.ok(f.clears.every(r=>JSON.stringify(r)==='[0,0,1280,720]'),'clear letterboxing after rotation');
 const calls=f.drawing.length;f.video.videoWidth=0;f.tick();assert.equal(f.drawing.length,calls,'briefly unavailable frame preserves the last image');
 assert.equal(f.video.paused,false);assert.equal(f.video.currentTime,12);assert.equal(f.video.playbackRate,1);
 assert.equal(f.frames.size,0,'recording must not wait for presentation of the preview');
 recording.release();assert.equal(f.animations.size,0);assert.equal(f.track.readyState,'ended');
});

test('portrait is explicit, and cleanup cancels even callback ID zero without stopping the source video',t=>{
 const f=fixture(t);f.video.videoWidth=1280;f.video.videoHeight=720;
 const recording=captureCameraFrame(f.video,'portrait');
 assert.deepEqual([f.canvas.width,f.canvas.height],[720,1280]);assert.deepEqual(f.drawing.at(-1).slice(1),[0,437.5,720,405]);
 const pending=f.animations.get(0);recording.release();recording.release();pending(0);
 assert.equal(f.animations.size,0);assert.equal(f.video.paused,false);assert.equal(f.drawing.length,1);
});

test('recording stays capped near 30fps without presentation callbacks and releases its loop',t=>{
 const f=fixture(t,{frameCallbacks:false}),recording=captureCameraFrame(f.video,'landscape');
 f.tick(f.animations,0);const count=f.drawing.length;
 f.tick(f.animations,16);assert.equal(f.drawing.length,count);
 f.tick(f.animations,33);assert.equal(f.drawing.length,count+1);
 recording.release();assert.equal(f.animations.size,0);assert.equal(f.track.readyState,'ended');
});

test('unavailable frames/canvas capture fail before recording instead of silently saving portrait or black video',t=>{
 const f=fixture(t);f.video.readyState=1;assert.throws(()=>captureCameraFrame(f.video,'landscape'),/映像が表示/);
 f.video.readyState=2;f.canvas.captureStream=undefined;assert.throws(()=>captureCameraFrame(f.video,'landscape'),/固定して録画/);
 assert.equal(f.frames.size,0);assert.equal(f.animations.size,0);
});

test('rear requests cannot silently fall back to a front lens; front switch is exact while initial webcam is preferred',()=>{
 assert.deepEqual(cameraConstraints('landscape','environment').video.facingMode,{exact:'environment'});
 assert.deepEqual(cameraConstraints('portrait','user',true).video.facingMode,{exact:'user'});
 assert.deepEqual(cameraConstraints('portrait','environment').video.aspectRatio,{ideal:9/16});
});
