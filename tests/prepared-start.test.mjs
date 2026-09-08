import test from 'node:test';import assert from 'node:assert/strict';
import {startComparison} from '../lib/start-playback.ts';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
class Decoder {
 duration=30;readyState=4;seeking=false;playbackRate=1;muted=false;paused=true;
 value=2;since=0;calls=0;seeks=[];starts=[];
 constructor(delays=[5,5],seekDelay=10){this.delays=delays;this.seekDelay=seekDelay;}
 addEventListener(){}
 get currentTime(){return this.value+(this.paused?0:(performance.now()-this.since)/1000*this.playbackRate);}
 set currentTime(value){this.seeks.push({value,paused:this.paused,muted:this.muted});this.value=value;this.since=performance.now();this.seeking=true;this.readyState=2;setTimeout(()=>{this.seeking=false;this.readyState=4;},this.seekDelay);}
 pause(){this.value=this.currentTime;this.paused=true;}
 async play(){
  this.starts.push({ready:this.readyState,paused:this.paused,muted:this.muted});
  const n=this.calls++;await delay(this.delays[n]??this.delays.at(-1));
  this.since=performance.now();this.paused=false;
 }
}
test('cold decoders prepare silently, wait for both seeks and start on the original beat',async()=>{
 const r=new Decoder([5,5],10),s=new Decoder([65,5],60);s.playbackRate=1.25;s.muted=true;
 assert.equal(await startComparison(r,s,t=>3+(t-2)*1.25,1.25,()=>true),true);
 assert.equal(r.calls,2);assert.equal(s.calls,2);
 for(const media of [r,s]){
  assert.ok(media.starts.every(start=>start.muted));
  assert.equal(media.starts[1].ready,4);
  assert.ok(media.seeks.every(seek=>seek.paused&&seek.muted));
 }
 assert.ok(Math.abs(s.currentTime-(3+(r.currentTime-2)*1.25))/1.25<=.025);
 assert.ok(r.currentTime<2.08);assert.equal(r.muted,false);assert.equal(s.muted,true);
 r.pause();s.pause();
});
test('a slow first launch is retried silently instead of seeking an audible video',async()=>{
 const r=new Decoder([5,5,5]),s=new Decoder([5,130,5]);r.muted=true;s.muted=false;
 assert.equal(await startComparison(r,s,t=>t,1,()=>true),true);
 assert.equal(r.calls,3);assert.equal(s.calls,3);
 assert.ok(r.seeks.every(seek=>seek.muted&&seek.paused));assert.ok(s.seeks.every(seek=>seek.muted&&seek.paused));
 assert.equal(r.muted,true);assert.equal(s.muted,false);
 assert.ok(Math.abs(r.currentTime-s.currentTime)<=.025);r.pause();s.pause();
});
test('permanent decoder skew stops at the original position after bounded attempts',async()=>{
 const r=new Decoder([5,5]),s=new Decoder([5,120]);s.muted=true;
 await assert.rejects(startComparison(r,s,t=>t,1,()=>true),/開始時のずれ/);
 assert.equal(r.calls,4);assert.equal(s.calls,4);assert.equal(r.paused,true);assert.equal(s.paused,true);
 assert.equal(r.currentTime,2);assert.equal(s.currentTime,2);assert.equal(r.muted,false);assert.equal(s.muted,true);
});
test('cancellation during a pending play does not rewind or mute replacement media',async()=>{
 let current=true,release;
 const r=new Decoder(),s=new Decoder();s.play=()=>new Promise(resolve=>{release=resolve;});
 const result=startComparison(r,s,t=>t,1,()=>current);
 await delay(10);current=false;r.pause();s.pause();r.value=9;s.value=11;r.muted=false;s.muted=true;
 assert.equal(await result,false);release();await delay(5);
 assert.equal(r.currentTime,9);assert.equal(s.currentTime,11);assert.equal(r.muted,false);assert.equal(s.muted,true);
});
