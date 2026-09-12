import test from 'node:test';import assert from 'node:assert/strict';import {SeekPositions} from '../lib/seek-position.ts';
test('coordinate with the latest requested time while a native seek is pending',()=>{
 const positions=new SeekPositions();let clock=12;
 const media={src:'clip.mp4',currentSrc:'clip.mp4',seeking:true,get currentTime(){return clock;},set currentTime(_time){}};
 positions.seek(media,3.9);assert.equal(media.currentTime,12);assert.equal(positions.read(media),3.9);
 positions.seek(media,14.8);clock=3.9;positions.settled(media);assert.equal(positions.read(media),14.8,'an earlier seek cannot consume the newest destination');
 media.seeking=false;clock=14.8;positions.settled(media);clock=15;assert.equal(positions.read(media),15);
});
test('replacing a source or completing playback drops a previous seek destination',()=>{
 const positions=new SeekPositions();let clock=2;const media={src:'first.mp4',currentSrc:'first.mp4',get currentTime(){return clock;},set currentTime(_time){}};
 positions.seek(media,10);media.src='second.mp4';assert.equal(positions.read(media),2);
 positions.seek(media,5);positions.clear(media);clock=6;assert.equal(positions.read(media),6);
});
test('failed native seeks cannot leave a fabricated destination behind',()=>{
 const positions=new SeekPositions(),media={get currentTime(){return 4;},set currentTime(_time){throw new Error('not loaded');}};
 assert.throws(()=>positions.seek(media,10));assert.equal(positions.read(media),4);
});
