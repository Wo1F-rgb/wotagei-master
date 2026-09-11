import test from 'node:test';
import assert from 'node:assert/strict';
import {displayedVideoTime,subscribeVideoFrames} from '../lib/video-frame-clock.ts';

function videoFixture({rvfc=true,currentTime=1,paused=true}={}){
 const events=new Map(),pending=new Map();let next=1,cancelled=0;
 const video={currentTime,readyState:4,paused,ended:false,src:'first.mp4',currentSrc:'first.mp4',srcObject:null,
  addEventListener(name,fn){const handlers=events.get(name)||new Set();handlers.add(fn);events.set(name,handlers);},
  removeEventListener(name,fn){events.get(name)?.delete(fn);},
  dispatch(name){for(const fn of [...(events.get(name)||[])])fn(new Event(name));},
 };
 if(rvfc){
  video.requestVideoFrameCallback=fn=>{const id=next++;pending.set(id,fn);return id;};
  video.cancelVideoFrameCallback=id=>{cancelled++;pending.delete(id);};
 }
 return {video,pending,runVideoFrame:(mediaTime,id=[...pending.keys()][0])=>{const fn=pending.get(id);assert.ok(fn,`missing video callback ${id}`);pending.delete(id);fn(0,{mediaTime,presentationTime:0});},cancelled:()=>cancelled,
  runRaf:()=>{throw Error('rAF not installed for this fixture');}};
}

test('rVFC metadata follows the displayed frame when currentTime is ahead',()=>{
 const f=videoFixture({currentTime:1.25}),times=[];
 const stop=subscribeVideoFrames(f.video,time=>times.push(time));
 assert.deepEqual(times,[1.25]);
 f.video.currentTime=1.4;
 f.runVideoFrame(1.3);
 assert.deepEqual(times,[1.25,1.3]);
 assert.equal(displayedVideoTime(f.video),1.3);
 stop();
});

test('one shared callback serves simultaneous subscribers and is cancelled after the last unsubscribe',()=>{
 const f=videoFixture({paused:false}),a=[],b=[];
 const stopA=subscribeVideoFrames(f.video,time=>a.push(time));
 const stopB=subscribeVideoFrames(f.video,time=>b.push(time));
 assert.equal(f.pending.size,1);
 f.runVideoFrame(2);
 assert.deepEqual(a,[1,2]);assert.deepEqual(b,[1,2]);
 assert.equal(f.pending.size,1,'playing video has one next callback');
 stopA();assert.equal(f.pending.size,1);
 stopB();assert.equal(f.pending.size,0);assert.equal(f.cancelled(),1);
});

test('seek and source transitions invalidate stale callbacks and restore a paused seeked frame',()=>{
 const f=videoFixture({paused:false}),times=[];
 const stop=subscribeVideoFrames(f.video,time=>times.push(time));
 const firstId=[...f.pending.keys()][0];
 f.runVideoFrame(2,firstId);
 const staleId=[...f.pending.keys()][0],stale=f.pending.get(staleId);
 f.video.dispatch('seeking');
 assert.equal(times.at(-1),NaN);
 assert.equal(f.pending.size,0);
 stale?.(0,{mediaTime:2.5,presentationTime:0});
 assert.equal(times.at(-1),NaN,'cancelled seek callback cannot restore old transform');
 f.video.currentTime=7;f.video.paused=true;f.video.dispatch('seeked');
 assert.equal(times.at(-1),7);

 const staleAfterSeek=[...f.pending.values()][0];
 f.video.src='second.mp4';f.video.currentSrc='second.mp4';f.video.dispatch('loadstart');
 assert.equal(times.at(-1),NaN);
 staleAfterSeek?.(0,{mediaTime:7.5,presentationTime:0});
 assert.equal(times.at(-1),NaN,'source change invalidates callbacks from the previous source');
 stop();
});

test('loop boundary clears the previous frame before publishing the wrapped frame',()=>{
 const f=videoFixture({paused:false}),times=[];
 const stop=subscribeVideoFrames(f.video,time=>times.push(time));
 f.runVideoFrame(9);
 f.runVideoFrame(.02);
 assert.deepEqual(times.slice(-3),[9,NaN,.02]);
 stop();
});

test('late canceled callback cannot erase the pending handle for the new seek generation',()=>{
 const f=videoFixture({paused:false}),times=[];
 const stop=subscribeVideoFrames(f.video,time=>times.push(time));
 const old=[...f.pending.values()][0];
 f.video.seeking=true;f.video.dispatch('seeking');f.video.currentTime=8;f.video.dispatch('timeupdate');
 assert.equal(f.pending.size,0,'no display lookup while seeking');assert.ok(Number.isNaN(times.at(-1)));
 f.video.seeking=false;f.video.dispatch('seeked');assert.equal(f.pending.size,1);
 old(0,{mediaTime:1.2});assert.equal(times.at(-1),8);
 f.video.dispatch('playing');assert.equal(f.pending.size,1,'stale callback cannot create duplicate loops');
 stop();assert.equal(f.pending.size,0,'new callback remains cancellable');
});

test('a new subscriber during seeking never receives the seek target as a displayed frame',()=>{
 const f=videoFixture();f.video.seeking=true;f.video.currentTime=10;const times=[];
 const stop=subscribeVideoFrames(f.video,time=>times.push(time));
 assert.ok(Number.isNaN(times[0]));assert.equal(f.pending.size,0);
 f.video.seeking=false;f.video.dispatch('seeked');assert.equal(times.at(-1),10);stop();
});

test('pause publishes the frame reached at the pause point',()=>{
 const f=videoFixture({paused:false}),times=[];
 const stop=subscribeVideoFrames(f.video,time=>times.push(time));
 f.runVideoFrame(1.5);
 f.video.currentTime=1.75;f.video.paused=true;f.video.dispatch('pause');
 assert.equal(times.at(-1),1.75);
 stop();
});

test('pause and ended invalidate late callbacks from the last playing generation',()=>{
 for(const event of ['pause','ended']){
  const f=videoFixture({paused:false}),times=[];
  const stop=subscribeVideoFrames(f.video,t=>times.push(t)),old=[...f.pending.values()][0];
  f.video.currentTime=2;f.video.paused=true;f.video.dispatch(event);
  old(0,{mediaTime:1.5});assert.equal(times.at(-1),2);assert.equal(f.pending.size,0);
  f.video.paused=false;f.video.dispatch('playing');assert.equal(f.pending.size,1);f.runVideoFrame(2.1);assert.equal(times.at(-1),2.1);stop();
 }
});

test('fallback rAF observes currentTime and stops its pending callback on unsubscribe',()=>{
 const previousRequest=globalThis.requestAnimationFrame,previousCancel=globalThis.cancelAnimationFrame;
 const pending=new Map();let next=1,cancelled=0;
 globalThis.requestAnimationFrame=fn=>{const id=next++;pending.set(id,fn);return id;};
 globalThis.cancelAnimationFrame=id=>{cancelled++;pending.delete(id);};
 try{
  const f=videoFixture({rvfc:false,paused:false}),times=[];
  const stop=subscribeVideoFrames(f.video,time=>times.push(time));
  assert.deepEqual(times,[1]);assert.equal(pending.size,1);
  f.video.currentTime=2;const id=[...pending.keys()][0],frame=pending.get(id);pending.delete(id);frame(0);assert.deepEqual(times,[1,2]);
  const staleId=[...pending.keys()][0],stale=pending.get(staleId);stop();assert.equal(pending.size,0);assert.equal(cancelled,1);
  f.video.currentTime=3;stale?.(0);assert.deepEqual(times,[1,2]);
 }finally{
  if(previousRequest===undefined)delete globalThis.requestAnimationFrame;else globalThis.requestAnimationFrame=previousRequest;
  if(previousCancel===undefined)delete globalThis.cancelAnimationFrame;else globalThis.cancelAnimationFrame=previousCancel;
 }
});
