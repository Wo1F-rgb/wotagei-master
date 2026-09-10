import test from 'node:test';
import assert from 'node:assert/strict';
import {parseTwitterLink,twitterVideoFromResponse,fetchTwitterVideo,readTwitterVideo,MAX_TWITTER_BYTES} from '../lib/twitter.ts';
const id='2095890073031966734',link=parseTwitterLink(`https://x.com/NASA/status/${id}`);
const url=n=>`https://video.twimg.com/amplify_video/123/vid/avc1/${n}.mp4?tag=29`;
const video={type:'video',url:url('4k'),formats:[{url:url('4k'),codec:'h264',bitrate:25000000},{url:url('720'),codec:'h264',bitrate:2176000},{url:url('360'),codec:'h264',bitrate:832000}]};
const payload={code:200,status:{type:'status',id,author:{screen_name:'NASA'},media:{all:[video]}}};
test('X desktop, mobile, legacy and video links normalize without tracking parameters',()=>{
 for(const host of ['x.com','www.x.com','mobile.x.com','twitter.com','mobile.twitter.com'])assert.deepEqual(parseTwitterLink(`https://${host}/NASA/status/${id}?s=20&t=tracking`),link);
 assert.equal(parseTwitterLink(`https://x.com/i/web/status/${id}/video/2`).video,2);
 assert.equal(parseTwitterLink(`https://x.com/i/status/${id}/video/2`).url,`https://x.com/i/status/${id}/video/2`);
 for(const bad of ['https://x.com/NASA','https://x.com/i/broadcasts/abc',`https://x.com.evil.test/NASA/status/${id}`,`https://user:pass@x.com/NASA/status/${id}`,`http://x.com/NASA/status/${id}`,`https://x.com/NASA/status/${id}/video/0`,`https://x.com/NASA/status/${id}/video/5`])assert.throws(()=>parseTwitterLink(bad));
});
test('select a moderate H.264 rendition and preserve media identity across reloads',()=>{
 const result=twitterVideoFromResponse(link,payload);assert.equal(result.mediaUrl,url('720'));assert.equal(result.link.video,1);assert.equal(result.link.id,id);assert.equal(result.title,'X · @NASA');
 const mixed={...payload,status:{...payload.status,media:{all:[{type:'photo'},video,{...video,url:url('third'),formats:[]}]}}};
 assert.equal(twitterVideoFromResponse(link,mixed).link.video,2);
 assert.equal(twitterVideoFromResponse({...link,video:3},mixed).mediaUrl,url('third'));
 assert.throws(()=>twitterVideoFromResponse({...link,video:1},mixed),/動画が見つかりません/);
});
test('unavailable, private, unrelated, no-video and hostile media responses cannot load a clip',()=>{
 for(const data of [null,{code:404},{code:200,status:{...payload.status,id:'20'}},{code:200,status:{...payload.status,type:'tombstone'}},{code:200,status:{...payload.status,author:{protected:true}}},{code:200,status:{...payload.status,media:{}}}])assert.throws(()=>twitterVideoFromResponse(link,data));
 for(const bad of ['https://evil.test/clip.mp4','https://video.twimg.com.evil.test/clip.mp4','http://video.twimg.com/clip.mp4','https://user:pass@video.twimg.com/clip.mp4','https://video.twimg.com/clip.m3u8'])assert.throws(()=>twitterVideoFromResponse(link,{...payload,status:{...payload.status,media:{all:[{type:'video',url:bad}]}}}));
 assert.throws(()=>twitterVideoFromResponse(link,{code:429}),/混み合/);
});
test('only the public post ID and its allowlisted media are requested, with no credentials',async()=>{
 const requests=[],signal=new AbortController().signal;
 const result=await fetchTwitterVideo(link,signal,async(url,options)=>{requests.push({url,options});return requests.length===1?Response.json(payload):new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'video/mp4'}});});
 assert.deepEqual(requests.map(v=>v.url),[`https://api.fxtwitter.com/2/status/${id}`,url('720')]);
 for(const {options} of requests){assert.equal(options.credentials,'omit');assert.equal(options.referrerPolicy,'no-referrer');assert.equal(options.signal,signal);}
 assert.equal(result.file.type,'video/mp4');assert.equal(result.file.size,3);assert.equal(result.file.lastModified,0);
});
test('download errors, empty clips and oversized bodies fail without loading incomplete video',async()=>{
 await assert.rejects(()=>readTwitterVideo(new Response(null,{status:503})),/取得できません/);
 await assert.rejects(()=>readTwitterVideo(new Response(new Uint8Array())),/空です/);
 await assert.rejects(()=>readTwitterVideo(new Response('x',{headers:{'content-length':String(MAX_TWITTER_BYTES+1)}})),/100MB/);
 let cancelled=false;
 const body=new ReadableStream({start(c){c.enqueue(new Uint8Array(5));c.enqueue(new Uint8Array(5));},cancel(){cancelled=true;}});
 await assert.rejects(()=>readTwitterVideo(new Response(body),8),/100MB/);assert.equal(cancelled,true);
});
test('aborted requests and rate limiting do not request or return usable video',async()=>{
 let calls=0;await assert.rejects(()=>fetchTwitterVideo(link,new AbortController().signal,async()=>{calls++;return Response.json({code:429},{status:429});}),/混み合/);assert.equal(calls,1);
 const controller=new AbortController();calls=0;
 await assert.rejects(()=>fetchTwitterVideo(link,controller.signal,async()=>{if(++calls===1)return Response.json(payload);controller.abort();return new Response('video');}),{name:'AbortError'});
});
