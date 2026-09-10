import test from 'node:test';import assert from 'node:assert/strict';
import {PracticeRecordingAudio,recordingMime} from '../lib/practice-recording.ts';

function fixture(t){
 class Track{constructor(kind){this.kind=kind;this.readyState='live';}clone(){return new Track(this.kind);}stop(){this.readyState='ended';}}
 class Stream{constructor(tracks=[]){this.tracks=tracks;}getVideoTracks(){return this.tracks.filter(t=>t.kind==='video');}getAudioTracks(){return this.tracks.filter(t=>t.kind==='audio');}getTracks(){return this.tracks;}}
 const prior=globalThis.MediaStream;globalThis.MediaStream=Stream;t.after(()=>{if(prior)globalThis.MediaStream=prior;else delete globalThis.MediaStream;});
 const nodes=[],context={destination:{},createMediaElementSource(video){const node={video,connections:new Set(),connect(destination){this.connections.add(destination);},disconnect(destination){if(destination)this.connections.delete(destination);else this.connections.clear();}};nodes.push(node);return node;},createMediaStreamDestination(){return {stream:new Stream([new Track('audio')])};}};
 return {camera:new Stream([new Track('video')]),context,nodes};
}

test('recording cleanup stops only owned tracks, leaving the live camera and audible speaker route intact',t=>{
 const {camera,context,nodes}=fixture(t),bus=new PracticeRecordingAudio(),video={currentTime:3,playbackRate:.5};
 const recording=bus.capture(camera,video,context);
 assert.equal(recording.hasMusic,true);assert.equal(recording.stream.getAudioTracks().length,1);
 assert.notEqual(recording.stream.getVideoTracks()[0],camera.getVideoTracks()[0]);
 recording.release();recording.release();
 assert.ok(recording.stream.getTracks().every(t=>t.readyState==='ended'));
 assert.equal(camera.getVideoTracks()[0].readyState,'live');assert.deepEqual([...nodes[0].connections],[context.destination]);
 assert.deepEqual(video,{currentTime:3,playbackRate:.5});
});

test('repeated recordings reuse the element audio source; replacing the video creates a separate source',t=>{
 const {camera,context,nodes}=fixture(t),bus=new PracticeRecordingAudio(),video={};
 const first=bus.capture(camera,video,context);first.release();
 const second=bus.capture(camera,video,context);assert.equal(nodes.length,1);assert.equal(nodes[0].connections.size,2);second.release();
 const third=bus.capture(camera,{},context);assert.equal(nodes.length,2);third.release();bus.dispose();assert.ok(nodes.every(n=>n.connections.size===0));
});

test('camera-only recording never requests or creates an audio source for an inaccessible embed',t=>{
 const {camera,context,nodes}=fixture(t),bus=new PracticeRecordingAudio(),recording=bus.capture(camera,null,context);
 assert.equal(recording.hasMusic,false);assert.equal(recording.stream.getAudioTracks().length,0);assert.equal(nodes.length,0);
 recording.release();assert.equal(camera.getVideoTracks()[0].readyState,'live');
 camera.getVideoTracks()[0].stop();assert.throws(()=>bus.capture(camera,null),/カメラを起動/);
});

test('prefer H264/AAC MP4 and fall back to a browser-supported recording format',()=>{
 assert.equal(recordingMime(()=>true),'video/mp4;codecs=avc1.42E01E,mp4a.40.2');
 assert.equal(recordingMime(mime=>mime==='video/webm'),'video/webm');assert.equal(recordingMime(()=>false),undefined);
});

test('external sound is recorded without a speaker connection or using the shared screen as the video',t=>{
 const {camera,context,nodes}=fixture(t),bus=new PracticeRecordingAudio(),external=context.createMediaStreamDestination().stream;
 const recording=bus.capture(camera,null,context,external);
 assert.equal(nodes.length,0);assert.equal(recording.stream.getVideoTracks().length,1);assert.equal(recording.stream.getAudioTracks().length,1);
 assert.notEqual(recording.stream.getAudioTracks()[0],external.getAudioTracks()[0]);
 recording.release();assert.equal(camera.getVideoTracks()[0].readyState,'live');assert.equal(external.getAudioTracks()[0].readyState,'live');
 external.getAudioTracks()[0].stop();assert.throws(()=>bus.capture(camera,null,context,external),/音声が終了/);
});
