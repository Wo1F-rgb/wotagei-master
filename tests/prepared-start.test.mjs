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
  this.starts.push({ready:this.readyState,paused:this.paused,muted:this.muted,time:this.currentTime});
  const n=this.calls++;await delay(this.delays[n]??this.delays.at(-1));
  this.since=performance.now();this.paused=false;
 }
}
test('cold decoders prepare silently, wait for both seeks and start on the original beat',async()=>{
 const r=new Decoder([5,5],10),s=new Decoder([65,5],60);s.playbackRate=1.25;s.muted=true;
 assert.equal(await startComparison(r,s,t=>3+(t-2)*1.25,1.25,()=>true),true);
 assert.equal(r.calls,2);assert.equal(s.calls,2);
 for(const media of [r,s]){
  assert.equal(media.starts[0].muted,true,'warmup is silent');
  assert.equal(media.starts[1].ready,4);
  assert.ok(media.seeks.every(seek=>seek.paused&&seek.muted));
 }
 assert.ok(Math.abs(s.currentTime-(3+(r.currentTime-2)*1.25))/1.25<=.025);
 assert.equal(r.starts[1].time,2);assert.equal(s.starts[1].time,3);
 assert.equal(r.starts[1].muted,false,'establish the actual soundtrack clock before measuring startup');assert.equal(s.starts[1].muted,true);
 assert.equal(r.muted,false);assert.equal(s.muted,true);
 r.pause();s.pause();
});

test('a half-second second-launch delay is corrected once against either chosen soundtrack',async()=>{
 for(const master of [0,1]){
  const r=new Decoder([5,5]),s=new Decoder([5,505]);s.playbackRate=1.25;
  const target=t=>3+(t-2)*1.25,reverse=t=>2+(t-3)/1.25;
  assert.equal(await startComparison(r,s,target,1.25,()=>true,undefined,master===1?reverse:undefined),true);
  assert.ok(Math.abs(s.currentTime-target(r.currentTime))/1.25<.035,'the first played beat must align without changing display mode');
  const audible=master===0?r:s,follower=master===0?s:r;
  assert.equal(audible.seeks.length,1,'no audible-clock correction after preparation');
  assert.equal(follower.seeks.length,1,'do not create a new decoder delay with a correction seek');
  assert.equal(r.calls,3,'ahead player is held at most once');assert.equal(s.calls,2);r.pause();s.pause();
 }
});
test('a slow second launch holds the ahead player once without another seek',async()=>{
 const r=new Decoder([5,5,5]),s=new Decoder([5,130,5]);r.muted=true;s.muted=false;
 assert.equal(await startComparison(r,s,t=>t,1,()=>true),true);
 assert.equal(r.calls,3);assert.equal(s.calls,2);assert.equal(r.seeks.length,1);assert.equal(s.seeks.length,1);
 assert.ok(r.seeks.every(seek=>seek.muted&&seek.paused));assert.ok(s.seeks[0].muted&&s.seeks[0].paused);
 assert.ok(Math.abs(r.currentTime-s.currentTime)<.035);
 assert.equal(r.muted,true);assert.equal(s.muted,false);
 r.pause();s.pause();
});
test('decoder clock skew never triggers repeated startup attempts or a forced stop',async()=>{
 const r=new Decoder([5,5]),s=new Decoder([5,120]);s.muted=true;
 assert.equal(await startComparison(r,s,t=>t,1,()=>true),true);
 assert.equal(r.calls,3);assert.equal(s.calls,2);assert.equal(r.paused,false);assert.equal(s.paused,false);
 assert.equal(r.seeks[0].value,2);assert.equal(s.seeks[0].value,2);assert.equal(r.muted,false);assert.equal(s.muted,true);r.pause();s.pause();
});
test('cancellation during a pending play does not rewind or mute replacement media',async()=>{
 let current=true,release;
 const r=new Decoder(),s=new Decoder();s.play=()=>new Promise(resolve=>{release=resolve;});
 const result=startComparison(r,s,t=>t,1,()=>current);
 await delay(10);current=false;r.pause();s.pause();r.value=9;s.value=11;r.muted=false;s.muted=true;
 assert.equal(await result,false);release();await delay(5);
 assert.equal(r.currentTime,9);assert.equal(s.currentTime,11);assert.equal(r.muted,false);assert.equal(s.muted,true);
});

test('play promises resolving before both media clocks move cannot hide a later one-beat skew',async()=>{
 class LateClock extends Decoder{
  constructor(freeze){super([2,2]);this.freeze=freeze;}
  get currentTime(){return this.value+(this.paused?0:Math.max(0,performance.now()-this.since)/1000*this.playbackRate);}
  set currentTime(value){super.currentTime=value;}
  async play(){await super.play();if(this.calls===2)this.since+=this.freeze;}
 }
 const r=new LateClock(300),s=new LateClock(650);s.playbackRate=1.25;s.muted=true;
 assert.equal(await startComparison(r,s,t=>3+(t-2)*1.25,1.25,()=>true),true);
 await delay(450);
 assert.ok(Math.abs(s.currentTime-(3+(r.currentTime-2)*1.25))/1.25<.04,'the asynchronous clock delay must be corrected before success');
 assert.equal(r.seeks.length,1);assert.equal(s.seeks.length,1);assert.ok(r.calls+s.calls<=5,'at most one hold/resume, never a retry loop');r.pause();s.pause();
});

test('cancellation during clock observation cannot resume or reposition replacement media',async()=>{
 const r=new Decoder(),s=new Decoder();let current=true;const work=startComparison(r,s,t=>t,1,()=>current);
 while(r.calls<2||s.calls<2||r.paused||s.paused)await delay(5);
 current=false;r.pause();s.pause();r.value=9;s.value=11;r.muted=false;s.muted=true;
 assert.equal(await work,false);await delay(280);assert.equal(r.currentTime,9);assert.equal(s.currentTime,11);assert.equal(r.calls,2);assert.equal(s.calls,2);assert.equal(r.muted,false);assert.equal(s.muted,true);
});

test('an explicitly requested restart waits for both slow seeks once',async()=>{
 const r=new Decoder([5,5],10),s=new Decoder([5,5],400);s.muted=true;s.playbackRate=1.25;
 await Promise.all([r.play(),s.play()]);s.value-=.5;
 assert.equal(await startComparison(r,s,t=>t*1.25,1.25,()=>true),true);
 assert.ok(Math.abs(r.currentTime-s.currentTime/1.25)<.025);
 assert.ok(r.seeks.every(seek=>seek.paused&&seek.muted));assert.ok(s.seeks.every(seek=>seek.paused&&seek.muted));
 r.pause();s.pause();
});

test('a paused decoder with the requested frame ready does not wait for future buffering',async()=>{
 const r=new Decoder(),s=new Decoder();s.muted=true;
 for(const media of [r,s])Object.defineProperty(media,'readyState',{get:()=>2,set:()=>{}});
 assert.equal(await startComparison(r,s,t=>t,1,()=>true),true);
 assert.equal(r.calls,2);assert.equal(s.calls,2);assert.equal(s.seeks.length,1);r.pause();s.pause();
});

test('an iframe pause acknowledgement is awaited before the ahead clock resumes',async()=>{
 class Iframe extends Decoder{
  addEventListener=undefined;
  pause(){setTimeout(()=>super.pause(),45);}
 }
 const r=new Iframe([5,5]),s=new Decoder([145,5]);s.muted=true;
 assert.equal(await startComparison(r,s,t=>t,1,()=>true),true);
 await delay(100);assert.ok(Math.abs(r.currentTime-s.currentTime)<.045);
 assert.equal(r.calls,2);assert.equal(s.calls,1);assert.equal(r.seeks.length,0);assert.equal(s.seeks.length,0);
 r.pause();s.pause();await delay(50);
});

test('a clip ending during startup is rejected instead of reporting synchronized playback',async()=>{
 const r=new Decoder(),s=new Decoder();
 const work=startComparison(r,s,t=>t,1,()=>true);
 while(r.calls<2||s.calls<2||r.paused||s.paused)await delay(5);
 s.pause();await assert.rejects(work,/動画が停止/);assert.equal(r.paused,true);assert.equal(s.paused,true);
});
