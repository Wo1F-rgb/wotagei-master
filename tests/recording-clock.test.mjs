import test from 'node:test';import assert from 'node:assert/strict';
import {prepareRecordingClock} from '../lib/recording-clock.ts';

test('recording waits for actual running audio time, without changing media playback',async()=>{
 const job=new AbortController(),context={state:'suspended',currentTime:12,resume:async()=>{context.state='running';}};
 let ready=false;const pending=prepareRecordingClock(context,job.signal).then(()=>{ready=true;});
 await new Promise(resolve=>setTimeout(resolve,30));assert.equal(ready,false);
 context.currentTime+=.99;await new Promise(resolve=>setTimeout(resolve,30));assert.equal(ready,false);
 context.currentTime+=.02;await pending;assert.equal(ready,true);
});

test('canceling while audio resume is pending releases the wait and a late resume does not restart it',async()=>{
 const job=new AbortController();let resume;
 const context={state:'suspended',currentTime:0,resume:()=>new Promise(resolve=>{resume=resolve;})};
 const pending=prepareRecordingClock(context,job.signal);job.abort();await assert.rejects(pending,{name:'AbortError'});
 context.state='running';resume();
});

test('pre-cancel and failed audio resume fail before any recording starts',async()=>{
 const job=new AbortController();job.abort();let calls=0;
 await assert.rejects(prepareRecordingClock({resume:async()=>{calls++;}},job.signal),{name:'AbortError'});assert.equal(calls,0);
 await assert.rejects(prepareRecordingClock({resume:async()=>{throw new Error('audio interrupted');}},new AbortController().signal),/audio interrupted/);
});
