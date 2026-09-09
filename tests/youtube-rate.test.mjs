import test from 'node:test';import assert from 'node:assert/strict';
import {closestYouTubeRate,resolveYouTubeRate} from '../lib/youtube-rate.ts';
import {startComparison} from '../lib/start-playback.ts';

test('a fine rate not advertised in presets keeps the chosen soundtrack at exactly 1x',async()=>{
 const media={rates:[.5,1,1.5,2],playbackRate:1};
 const result=await resolveYouTubeRate(media,120,126,1,1,()=>true);
 assert.equal(result.fallback,false);assert.equal(result.rate,1);assert.equal(result.self,1);assert.equal(result.reference,1.05);
 assert.equal(120*media.playbackRate,126);
});
test('rounding a fine ratio uses the confirmed 0.05 step for both tracks instead of accumulating drift',async()=>{
 let actual=1;const media={rates:[.5,1,1.5,2],get playbackRate(){return actual;},set playbackRate(n){actual=Math.round(n*20)/20;}};
 const result=await resolveYouTubeRate(media,126,120,1,1,()=>true);
 assert.equal(result.reference,.95);assert.ok(Math.abs(result.self-.9975)<1e-12);assert.equal(result.rate,result.self);assert.equal(result.fallback,true);
 assert.ok(Math.abs(126*result.reference-120*result.self)<1e-10);
});
test('a player rejecting fine rates selects the closest valid practice tempo automatically',async()=>{
 let actual=1;const media={rates:[.5,1,1.5,2],get playbackRate(){return actual;},set playbackRate(n){if(this.rates.includes(n))actual=n;}};
 const result=await resolveYouTubeRate(media,126,120,1,1,()=>true);
 assert.equal(result.fallback,true);assert.equal(result.rate,1.05);assert.equal(result.reference,1);assert.equal(result.self,1.05);
 assert.equal(126*result.reference,120*result.self);
 assert.equal(closestYouTubeRate([.5,1,1.25,1.5,2],100,120,1).reference,1.25);
 assert.equal(closestYouTubeRate([],100,120,1),null);
});
test('canceling speed negotiation does not issue a fallback request',async()=>{
 let current=true;const requests=[];const media={rates:[1],get playbackRate(){return 1;},set playbackRate(n){requests.push(n);}};
 const work=resolveYouTubeRate(media,126,120,1,1,()=>current);current=false;
 assert.equal(await work,null);assert.deepEqual(requests,[120/126]);
});
test('both play requests retain the user gesture while rate negotiation finishes before the single startup seek',async()=>{
 let finish;const ready=new Promise(resolve=>finish=resolve),events=[];
 const reference={currentTime:10,duration:100,async play(){events.push('reference play');}};
 const self={time:0,duration:100,get currentTime(){return this.time;},set currentTime(n){events.push('seek');this.time=n;},async play(){events.push('self play');}};
 const work=startComparison(reference,self,t=>t*1.05,1.05,()=>true,ready);
 assert.deepEqual(events,['reference play','self play']);await Promise.resolve();assert.ok(!events.includes('seek'));
 finish();assert.equal(await work,true);assert.deepEqual(events,['reference play','self play','seek']);assert.equal(self.currentTime,10.5);
});
