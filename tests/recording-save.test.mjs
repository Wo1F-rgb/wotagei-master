import {test} from 'node:test';
import assert from 'node:assert/strict';
import {recordingFile,canShareRecording,shareRecording,usesPhotoLibrary} from '../lib/recording-save.ts';

const recorded=()=>recordingFile([new Blob(['movie'])],'video/mp4;codecs=avc1.42E01E,mp4a.40.2',new Date('2026-09-14T01:02:03Z'));
test('share a correctly typed named video file without codec parameters or blob URLs',async()=>{
 const file=recorded();assert.equal(file.type,'video/mp4');assert.equal(file.name,'wotagei-2026-09-14T01-02-03-000Z.mp4');assert.equal(await file.text(),'movie');
 let data;const host={canShare:d=>d.files[0]===file,share:async d=>{data=d;}};
 assert.equal(await shareRecording(file,host,true),'handed-off');assert.deepEqual(Object.keys(data),['files']);assert.equal(data.files[0],file);
 // Handoff is deliberately not a "saved to Photos" result.
 assert.equal(recordingFile([new Blob(['movie'])],'video/webm;codecs=vp8,opus').type,'video/webm');
 assert.match(recordingFile([new Blob(['movie'])],'video/webm').name,/\.webm$/);
});
test('expired stop gesture offers a new tap without invoking the OS or downloading',async()=>{
 let calls=0;const host={canShare:()=>true,share:async()=>{calls++;},userActivation:{isActive:false}};
 assert.equal(await shareRecording(recorded(),host,true),'needs-tap');assert.equal(calls,0);
 host.userActivation.isActive=true;assert.equal(await shareRecording(recorded(),host),'handed-off');assert.equal(calls,1);
});
test('unsupported or empty recordings are kept for explicit fallback',async()=>{
 for(const host of [{},{share:async()=>{},canShare:()=>false},{share:async()=>{},canShare:()=>{throw Error('policy');}}]){
  assert.equal(canShareRecording(recorded(),host),false);assert.equal(await shareRecording(recorded(),host),'unsupported');
 }
 assert.equal(canShareRecording(new File([],'empty.mp4',{type:'video/mp4'}),{share:async()=>{},canShare:()=>true}),false);
});
test('cancel, activation loss and failures remain retryable without claiming a save',async()=>{
 for(const [name,result] of [['AbortError','cancelled'],['NotAllowedError','needs-tap'],['TypeError','unsupported'],['DataError','failed']]){
  const file=recorded(),host={canShare:()=>true,share:async()=>{throw new DOMException('failed',name);}};
  assert.equal(await shareRecording(file,host),result);assert.equal(await file.text(),'movie');
  host.share=async()=>{};assert.equal(await shareRecording(file,host),'handed-off');
 }
});
test('Photos wording is limited to iPhone/iPad and compatible file types',()=>{
 const mp4=recorded(),webm=recordingFile([new Blob(['video'])],'video/webm');
 assert.equal(usesPhotoLibrary(mp4,{userAgent:'iPhone'}),true);
 assert.equal(usesPhotoLibrary(mp4,{userAgent:'Macintosh',maxTouchPoints:5}),true);
 assert.equal(usesPhotoLibrary(mp4,{userAgent:'Macintosh',maxTouchPoints:0}),false);
 assert.equal(usesPhotoLibrary(webm,{userAgent:'iPhone'}),false);
 assert.equal(usesPhotoLibrary(mp4,{userAgent:'Android'}),false);
});
