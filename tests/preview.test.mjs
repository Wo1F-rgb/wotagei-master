import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareSoloPlayback,restoreComparisonAudio} from '../lib/solo.ts';
function video(rate,muted){return {playbackRate:rate,muted,paused:false,pause(){this.paused=true;}};}
test('BPM preview uses the selected video audio at original speed, irrespective of practice tempo',()=>{
 const reference=video(.5,false),self=video(.4,true);
 prepareSoloPlayback(self,reference);
 assert.equal(reference.paused,true);
 assert.equal(reference.muted,true);
 assert.equal(self.muted,false);
 assert.equal(self.playbackRate,1);
 restoreComparisonAudio(reference,self);
 assert.equal(reference.muted,false);
 assert.equal(self.muted,true);
});
test('reference-only preview does not require or pause a live camera',()=>{
 const reference=video(1.75,false);
 prepareSoloPlayback(reference,null);
 assert.equal(reference.playbackRate,1);
 assert.equal(reference.muted,false);
 assert.equal(reference.paused,false);
});
