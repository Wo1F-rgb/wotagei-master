import test from 'node:test';
import assert from 'node:assert/strict';
import {createBeatFrameCapture} from '../lib/beat-frame-capture.ts';
import {exportBeatFrames} from '../lib/beat-frame-export.ts';
import {createBeatFrameGrid} from '../lib/beat-frames.ts';

function installDOM({loadError=false,encodeError=false,drawError=false,encodedBytes=4}={}){
 const old=globalThis.document,videos=[],canvases=[],draws=[],transforms=[];
 class Video extends EventTarget{
  readyState=0;videoWidth=1920;videoHeight=1080;duration=2;seeking=false;style={};decoded=0;_time=0;src='';removed=false;seeks=0;
  setAttribute(){} removeAttribute(){this.src='';} pause(){this.paused=true;} remove(){this.removed=true;}
  load(){if(!this.src)return;setTimeout(()=>{if(this.removed)return;if(loadError){this.dispatchEvent(new Event('error'));return;}this.readyState=2;this.dispatchEvent(new Event('loadeddata'));},0);}
  get currentTime(){return this._time;}
  set currentTime(time){this.seeks++;this._time=time;this.seeking=true;this.readyState=1;setTimeout(()=>{if(this.removed)return;this.decoded=time;this.readyState=2;this.seeking=false;this.dispatchEvent(new Event('seeked'));},5);}
 }
 globalThis.document={body:{appendChild(){}},createElement(kind){
  if(kind==='video'){const v=new Video();videos.push(v);return v;}
  const canvas={width:0,height:0,getContext(){return {setTransform(...values){transforms.push(values);},drawImage(video){if(drawError)throw new DOMException('tainted','SecurityError');assert.equal(video.seeking,false);assert.equal(video.readyState,2);assert.equal(video.currentTime,video.decoded);draws.push(video.decoded);}};},toBlob(callback){setTimeout(()=>callback(encodeError?null:new Blob([new Uint8Array(encodedBytes)],{type:'image/jpeg'})),0);}};
  canvases.push(canvas);return canvas;
 }};
 return {videos,canvases,draws,transforms,restore(){if(old===undefined)delete globalThis.document;else globalThis.document=old;}};
}

test('independent decoder waits for decoded seek, supports zero/repeat/last timestamps, caps size and mirrors',async()=>{
 const dom=installDOM(),controller=new AbortController();
 try{
  const reader=await createBeatFrameCapture('https://example.com/video.mp4',{signal:controller.signal,mirror:true,maxDimension:4000});
  assert.equal(reader.width,1280);assert.equal(reader.height,720);assert.equal(dom.videos.length,1);assert.equal(dom.videos[0].muted,true);assert.equal(dom.videos[0].playsInline,true);assert.equal(dom.videos[0].crossOrigin,'anonymous');
  for(const time of [0,1,1,1.999,0])assert.equal((await reader.capture(time)).type,'image/jpeg');
  assert.deepEqual(dom.draws,[0,1,1,1.999,0]);assert.equal(dom.videos[0].seeks,3);
  assert.deepEqual(dom.transforms[0],[-1,0,0,1,1280,0]);
  await assert.rejects(reader.capture(2),RangeError);
  reader.dispose();reader.dispose();assert.equal(dom.videos[0].removed,true);assert.equal(dom.canvases[0].width,0);
  await assert.rejects(reader.capture(0),{name:'AbortError'});
 }finally{dom.restore();}
});

test('abort interrupts a pending seek and releases decoder and owned object URL',async()=>{
 const dom=installDOM(),controller=new AbortController(),originalCreate=URL.createObjectURL,originalRevoke=URL.revokeObjectURL;let revoked='';
 URL.createObjectURL=()=> 'blob:owned';URL.revokeObjectURL=url=>{revoked=url;};
 try{
  const reader=await createBeatFrameCapture(new Blob(['video']),{signal:controller.signal});
  const pending=reader.capture(1);controller.abort();await assert.rejects(pending,{name:'AbortError'});
  assert.equal(dom.videos[0].removed,true);assert.equal(revoked,'blob:owned');assert.deepEqual(dom.draws,[]);
 }finally{URL.createObjectURL=originalCreate;URL.revokeObjectURL=originalRevoke;dom.restore();}
});

test('decoder load errors dispose resources; encoding and CORS failures never return a photo',async()=>{
 for(const options of [{loadError:true},{encodeError:true},{drawError:true}]){
  const dom=installDOM(options);let reader;
  try{
   const pending=createBeatFrameCapture('video.mp4',{signal:new AbortController().signal});
   if(options.loadError){await assert.rejects(pending,/読み取れません/);assert.equal(dom.videos[0].removed,true);}
   else{reader=await pending;await assert.rejects(reader.capture(0),options.drawError?/許可/:/JPEG/);}
  }finally{reader?.dispose();dom.restore();}
 }
});

test('full export returns every beat as JPEG files plus ZIP and always disposes',async()=>{
 const dom=installDOM(),progress=[];
 try{
  const output=await exportBeatFrames({source:'video.mp4',grid:createBeatFrameGrid({duration:2,bpm:120,origin:.1}),signal:new AbortController().signal,onProgress:p=>progress.push(p)});
  assert.equal(output.files.length,4);assert.ok(output.files.every(f=>f instanceof File&&f.type==='image/jpeg'));
  assert.deepEqual(dom.draws,[.1,.6,1.1,1.6]);assert.deepEqual(progress.map(p=>p.done),[0,1,2,3,4]);assert.equal(output.zip.type,'application/zip');assert.equal(dom.videos[0].removed,true);
 }finally{dom.restore();}
});

test('mid-export cancellation/error returns no partial success and disposes',async()=>{
 for(const mode of ['abort','memory']){
  const dom=installDOM({encodedBytes:1000}),controller=new AbortController();
  try{
   const pending=exportBeatFrames({source:'video.mp4',grid:createBeatFrameGrid({duration:2,bpm:120,origin:0}),signal:controller.signal,maxBytes:mode==='memory'?1100:undefined,onProgress:p=>{if(mode==='abort'&&p.done===1)controller.abort();}});
   await assert.rejects(pending,mode==='abort'?{name:'AbortError'}:/容量/);assert.equal(dom.videos[0].removed,true);
  }finally{dom.restore();}
 }
});
