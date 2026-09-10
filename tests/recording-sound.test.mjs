import test from 'node:test';import assert from 'node:assert/strict';
import {requestRecordingSound} from '../lib/recording-sound.ts';

function stream({audio=true,surface='browser'}={}){
 const track=kind=>({kind,readyState:'live',stop(){this.readyState='ended';},getSettings(){return kind==='video'?{displaySurface:surface}:{}}});
 const tracks=[track('video'),...(audio?[track('audio')]:[])];
 return {getTracks:()=>tracks,getAudioTracks:()=>tracks.filter(t=>t.kind==='audio'),getVideoTracks:()=>tracks.filter(t=>t.kind==='video')};
}
test('microphone mode disables speech filtering, never requests another camera, and restores the audio session',async()=>{
 const input=stream(),calls=[],env={audioSession:{type:'auto'},mediaDevices:{async getUserMedia(options){calls.push(options);return input;}}};
 const result=await requestRecordingSound('microphone',new AbortController().signal,env);
 assert.deepEqual(calls,[{video:false,audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}}]);assert.equal(env.audioSession.type,'play-and-record');
 result.release();result.release();assert.equal(env.audioSession.type,'auto');assert.ok(input.getTracks().every(t=>t.readyState==='ended'));
});
test('canceling a microphone prompt returns immediately and stops a later permission grant',async()=>{
 let grant;const input=stream(),job=new AbortController(),env={audioSession:{type:'playback'},mediaDevices:{getUserMedia(){return new Promise(resolve=>grant=resolve);}}};
 const result=requestRecordingSound('microphone',job.signal,env);job.abort();await assert.rejects(result,{name:'AbortError'});assert.equal(env.audioSession.type,'playback');
 grant(input);await Promise.resolve();assert.ok(input.getTracks().every(t=>t.readyState==='ended'));
});
test('permission rejection restores the session and does not silently fall back to a different input',async()=>{
 let calls=0;const env={audioSession:{type:'auto'},mediaDevices:{getUserMedia(){calls++;return Promise.reject(new DOMException('denied','NotAllowedError'));}}};
 await assert.rejects(requestRecordingSound('microphone',new AbortController().signal,env),{name:'NotAllowedError'});assert.equal(calls,1);assert.equal(env.audioSession.type,'auto');
});
test('tab capture keeps local playback audible and requires the selected surface to contain live audio',async()=>{
 const input=stream(),calls=[],env={mediaDevices:{async getDisplayMedia(options){calls.push(options);return input;}}};
 const result=await requestRecordingSound('tab',new AbortController().signal,env);
 assert.equal(calls[0].preferCurrentTab,true);assert.equal(calls[0].audio.suppressLocalAudioPlayback,false);assert.equal(calls[0].audio.restrictOwnAudio,false);assert.equal(calls[0].systemAudio,'exclude');
 result.release();assert.ok(input.getTracks().every(t=>t.readyState==='ended'));
});
test('a screen/window selection or a tab without audio is rejected and all sharing tracks are released',async()=>{
 for(const options of [{surface:'monitor'},{surface:'window'},{audio:false}]){
  const input=stream(options),env={mediaDevices:{async getDisplayMedia(){return input;}}};
  await assert.rejects(requestRecordingSound('tab',new AbortController().signal,env),/タブ/);assert.ok(input.getTracks().every(t=>t.readyState==='ended'));
 }
});
test('canceling before the request never opens a permission prompt',async()=>{
 const job=new AbortController();job.abort();let called=false;
 await assert.rejects(requestRecordingSound('tab',job.signal,{mediaDevices:{getDisplayMedia(){called=true;}}}),{name:'AbortError'});assert.equal(called,false);
});
