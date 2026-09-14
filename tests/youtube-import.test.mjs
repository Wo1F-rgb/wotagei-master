import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {importEndpoint,fetchYouTubeFile,MAX_YOUTUBE_IMPORT_BYTES} from '../lib/youtube-import.ts';
const link={id:'pUOZJDfM1wk',start:3,url:'https://www.youtube.com/watch?v=pUOZJDfM1wk&t=3s'};
const bytes=await readFile(new URL('./fixtures/sync-150.mp4',import.meta.url));
test('optional import accepts only HTTPS or loopback endpoints',()=>{
 assert.equal(importEndpoint(''),null);assert.equal(importEndpoint(undefined),null);
 assert.equal(importEndpoint('https://import.example/youtube'),'https://import.example/youtube');
 assert.equal(importEndpoint('http://127.0.0.1:8766/youtube'),'http://127.0.0.1:8766/youtube');
 for(const value of ['http://public.example/youtube','https://user:pass@example.com/youtube','https://example.com/youtube#x','file:///tmp/import'])assert.throws(()=>importEndpoint(value));
});
test('import sends only a public video ID, no camera file, cookies or timestamp trimming',async()=>{
 const signal=new AbortController().signal;
 const file=await fetchYouTubeFile(link,'https://import.example/youtube',signal,async(url,options)=>{
  assert.equal(url,'https://import.example/youtube');assert.equal(options.method,'POST');assert.equal(options.credentials,'omit');assert.equal(options.referrerPolicy,'no-referrer');assert.equal(options.signal,signal);assert.deepEqual(JSON.parse(options.body),{id:link.id});
  return new Response(bytes,{headers:{'content-type':'video/mp4'}});
 });
 assert.equal(file.type,'video/mp4');assert.equal(file.lastModified,0);assert.deepEqual(new Uint8Array(await file.arrayBuffer()),new Uint8Array(bytes));
});
test('errors, unexpected response types, empty files and oversize lengths never become playable sources',async()=>{
 for(const response of [new Response('busy',{status:429}),new Response('failed',{status:502}),new Response('<html/>',{headers:{'content-type':'text/html'}}),new Response(new Uint8Array(10),{headers:{'content-type':'video/mp4'}}),new Response(bytes,{headers:{'content-type':'video/mp4','content-length':String(MAX_YOUTUBE_IMPORT_BYTES+1)}})])await assert.rejects(fetchYouTubeFile(link,'https://import.example/youtube',new AbortController().signal,async()=>response));
});
test('streamed byte limit cancels a misleading response without retaining the oversized body',async()=>{
 let canceled=false;
 const response=new Response(new ReadableStream({pull(c){c.enqueue(new Uint8Array(1024*1024));},cancel(){canceled=true;}}),{headers:{'content-type':'video/mp4'}});
 await assert.rejects(fetchYouTubeFile(link,'https://import.example/youtube',new AbortController().signal,async()=>response),/100MB/);assert.equal(canceled,true);
});
test('aborted import does not return a replacement file',async()=>{
 const controller=new AbortController();controller.abort();
 await assert.rejects(fetchYouTubeFile(link,'https://import.example/youtube',controller.signal,async()=>new Response(bytes,{headers:{'content-type':'video/mp4'}})),{name:'AbortError'});
});
