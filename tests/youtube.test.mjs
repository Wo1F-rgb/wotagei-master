import test from 'node:test';
import assert from 'node:assert/strict';
import {parseYouTubeLink,YouTubeMedia,youtubeError} from '../lib/youtube.ts';
import {startComparison} from '../lib/start-playback.ts';

test('YouTube watch, shared, Shorts and mobile links resolve to the same video',()=>{
 for(const url of ['https://www.youtube.com/watch?v=M7lc1UVf-VE&list=ignored','https://youtu.be/M7lc1UVf-VE?si=ignored','https://youtube.com/shorts/M7lc1UVf-VE','https://m.youtube.com/watch?v=M7lc1UVf-VE','https://youtube.com/live/M7lc1UVf-VE','https://www.youtube.com/embed/M7lc1UVf-VE']){
  assert.deepEqual(parseYouTubeLink(url),{id:'M7lc1UVf-VE',start:0,url:'https://www.youtube.com/watch?v=M7lc1UVf-VE'});
 }
});
test('shared timestamps preserve position without retaining tracking parameters',()=>{
 assert.equal(parseYouTubeLink('https://youtu.be/M7lc1UVf-VE?t=1h2m3s&si=secret').start,3723);
 assert.equal(parseYouTubeLink('https://youtube.com/watch?v=M7lc1UVf-VE&start=90').start,90);
 assert.equal(parseYouTubeLink('https://youtu.be/M7lc1UVf-VE#t=1m30s').url,'https://www.youtube.com/watch?v=M7lc1UVf-VE&t=90s');
 assert.equal(parseYouTubeLink('https://youtu.be/M7lc1UVf-VE?t=99999999999').start,0);
});
test('reject playlists, channel links, invalid video IDs and lookalike hosts',()=>{
 for(const url of ['https://youtube.com/playlist?list=abc','https://youtube.com/@channel','https://youtube.com/watch?v=short','https://youtube.com.evil.test/watch?v=M7lc1UVf-VE','https://youtube.com@evil.test/watch?v=M7lc1UVf-VE','https://user:pass@youtube.com/watch?v=M7lc1UVf-VE','http://youtube.com/watch?v=M7lc1UVf-VE','javascript:alert(1)','https://youtu.be/M7lc1UVf-VE/extra'])assert.throws(()=>parseYouTubeLink(url));
});
function fakePlayer(){
 return {time:10,duration:200,state:5,rate:1,muted:false,seeks:[],starts:0,
  getCurrentTime(){return this.time;},getDuration(){return this.duration;},getPlayerState(){return this.state;},
  getPlaybackRate(){return this.rate;},getAvailablePlaybackRates(){return [.5,1,1.5,2];},
  setPlaybackRate(n){this.rate=n;},playVideo(){this.starts++;},pauseVideo(){this.state=2;},
  seekTo(n,ahead){this.time=n;this.seeks.push([n,ahead]);},isMuted(){return this.muted;},mute(){this.muted=true;},unMute(){this.muted=false;},destroy(){}
 };
}
test('comparison waits for the iframe PLAYING event and corrects startup latency only once',async()=>{
 const player=fakePlayer(),media=new YouTubeMedia(player);
 let ownTime=10,seeks=0,done=false;
 const self={duration:300,get currentTime(){return ownTime;},set currentTime(t){ownTime=t;seeks++;},async play(){ownTime=10.1;}};
 const task=startComparison(media,self,t=>t*1.25,1.25,()=>true).then(n=>{done=true;return n;});
 await Promise.resolve();assert.equal(done,false);
 player.state=3;media.stateChanged(3);await Promise.resolve();assert.equal(done,false);
 player.time=11;player.state=1;media.stateChanged(1);assert.equal(await task,true);assert.equal(ownTime,13.75);assert.equal(seeks,1);
 for(let i=0;i<60;i++){player.time+=.01;void media.currentTime;media.stateChanged(1);}
 assert.equal(seeks,1);assert.equal(player.seeks.length,0);
});
test('pausing or replacing an iframe rejects its pending play without hanging',async()=>{
 const player=fakePlayer(),media=new YouTubeMedia(player);
 const pending=media.play();const rejected=assert.rejects(pending,/中止/);media.pause();await rejected;assert.equal(player.state,2);
 const next=media.play();const blocked=assert.rejects(next,/再生ボタン/);media.cancel('再生ボタンを押してください');await blocked;
});
test('iframe adapter forwards seeks and actual speed, mute and buffering state',()=>{
 const player=fakePlayer(),media=new YouTubeMedia(player);
 media.currentTime=45;assert.deepEqual(player.seeks,[[45,true]]);
 media.playbackRate=1.5;assert.equal(media.playbackRate,1.5);assert.deepEqual(media.rates,[.5,1,1.5,2]);
 media.muted=true;assert.equal(player.muted,true);media.muted=false;assert.equal(player.muted,false);
 player.state=3;assert.equal(media.seeking,true);assert.equal(media.readyState,2);
 assert.match(youtubeError(150),/許可/);assert.match(youtubeError(100),/非公開/);
});
