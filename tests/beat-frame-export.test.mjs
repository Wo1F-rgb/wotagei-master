import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createStoredZip,crc32,exportBeatFrames} from '../lib/beat-frame-export.ts';
import {createBeatFrameGrid} from '../lib/beat-frames.ts';

test('CRC32 matches the standard vector and generated ZIP round-trips with Python zipfile',async()=>{
 assert.equal(crc32(new TextEncoder().encode('123456789')),0xcbf43926);assert.equal(crc32(new Uint8Array()),0);
 const files=[new File([new Uint8Array([255,216,1,2,255,217])],'beat-000001.jpg',{type:'image/jpeg'}),new File(['second photograph'],'写真-2.jpg',{type:'image/jpeg'})];
 const zip=await createStoredZip(files),data=Buffer.from(await zip.arrayBuffer());
 assert.equal(zip.type,'application/zip');
 const python=process.platform==='win32'?'py':'python3';
 const script='import sys,base64,zipfile,io,json; z=zipfile.ZipFile(io.BytesIO(base64.b64decode(sys.stdin.read()))); assert z.testzip() is None; print(json.dumps([{ "name": i.filename, "stored": i.compress_type == 0, "data": base64.b64encode(z.read(i)).decode()} for i in z.infolist()]))';
 const args=process.platform==='win32'?['-3','-c',script]:['-c',script];
 const decoded=JSON.parse(execFileSync(python,args,{input:data.toString('base64'),encoding:'utf8'}));
 assert.deepEqual(decoded,await Promise.all(files.map(async f=>({name:f.name,stored:true,data:Buffer.from(await f.arrayBuffer()).toString('base64')}))));
});

test('ZIP rejects memory overflow, count overflow and cancellation without a partial result',async()=>{
 const files=[new File(['a'.repeat(100)],'one.jpg')];
 await assert.rejects(createStoredZip(files,{maxBytes:100}),/容量/);
 await assert.rejects(createStoredZip(Array(65536).fill(files[0])),/65,535/);
 const controller=new AbortController();controller.abort();
 await assert.rejects(createStoredZip(files,{signal:controller.signal}),{name:'AbortError'});
 const mid=new AbortController(),zip=createStoredZip(Array.from({length:20},(_,i)=>new File(['frame'],`${i}.jpg`)),{signal:mid.signal});
 setTimeout(()=>mid.abort(),0);await assert.rejects(zip,{name:'AbortError'});
});

test('export rejects impossible full sequences before creating a decoder',async()=>{
 const signal=new AbortController().signal;
 await assert.rejects(exportBeatFrames({source:'unused.mp4',grid:createBeatFrameGrid({duration:40000,bpm:120,origin:0}),signal}),/65,535/);
 await assert.rejects(exportBeatFrames({source:'unused.mp4',grid:createBeatFrameGrid({duration:20,bpm:120,origin:0}),signal,maxBytes:10}),/容量/);
 const aborted=new AbortController();aborted.abort();
 await assert.rejects(exportBeatFrames({source:'unused.mp4',grid:createBeatFrameGrid({duration:2,bpm:120,origin:0}),signal:aborted.signal}),{name:'AbortError'});
});
