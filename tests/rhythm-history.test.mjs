import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {createRhythmHistoryStore,validRhythmHistory} from '../lib/rhythm-history.ts';

const entry=(key,changes={})=>({key,source:'video',audio:null,bpmText:'149.987654321',originText:'1.234567890123',position:8.125,
 result:{engine:'synthetic test',duration:12,beats:[.2,.6,1],downbeats:[.2],waveform:[.1,.7,.3],grid:{bpm:150,origin:.2,errorMs:2,driftMs:1,coverage:.98,variable:false,beatCount:30}},...changes});

test('full analysis and unrounded draft survive leaving/reopening the database without applying them',async()=>{
 const factory=new IDBFactory(),a=createRhythmHistoryStore(factory),value=entry('original-video');
 assert.equal(await a.save(value),true);
 const restored=await createRhythmHistoryStore(factory).load(value.key);
 for(const key of Object.keys(value))assert.deepEqual(restored[key],value[key]);
 assert.equal(await a.load('different-video'),null);
});
test('external audio identity and bytes are retained with BPM-only source semantics',async()=>{
 const factory=new IDBFactory(),audio={blob:new Blob(['music bytes'],{type:'audio/wav'}),name:'practice.wav',lastModified:789};
 await createRhythmHistoryStore(factory).save(entry('youtube:123',{source:'audio',audio}));
 const restored=await createRhythmHistoryStore(factory).load('youtube:123');
 assert.equal(restored.source,'audio');assert.equal(restored.audio.name,audio.name);assert.equal(restored.audio.lastModified,789);assert.equal(await restored.audio.blob.text(),'music bytes');
});
test('new drafts win racing saves and reopened history retains the final touch',async()=>{
 const factory=new IDBFactory(),store=createRhythmHistoryStore(factory);
 await Promise.all(Array.from({length:12},(_,i)=>store.save(entry('same-video',{originText:String(.25+i*.001)}))));
 assert.equal((await createRhythmHistoryStore(factory).load('same-video')).originText,String(.261));
});
test('retention cannot discard a newer queued update to an evicted old row',async()=>{
 const factory=new IDBFactory(),store=createRhythmHistoryStore(factory);
 for(let i=0;i<10;i++)await store.save(entry(`video-${i}`));
 await Promise.all([store.save(entry('new-video')),store.save(entry('video-0',{originText:'9.87654321'}))]);
 const fresh=createRhythmHistoryStore(factory);
 assert.equal((await fresh.load('video-0')).originText,'9.87654321');assert.ok(await fresh.load('new-video'));assert.equal(await fresh.load('video-1'),null);
});
test('save failures and history OFF still retain results within the tab',async()=>{
 const broken=createRhythmHistoryStore(undefined);assert.equal(await broken.save(entry('x')),false);assert.ok(await broken.load('x'));
 const factory=new IDBFactory(),store=createRhythmHistoryStore(factory);
 assert.equal(await store.save(entry('private'),false),false);assert.ok(await store.load('private'));assert.equal(await createRhythmHistoryStore(factory).load('private'),null);
});
test('delete and clear remove audio, results and queued writes without reviving old history',async()=>{
 const factory=new IDBFactory(),store=createRhythmHistoryStore(factory);
 await store.save(entry('a'));await store.save(entry('b'));
 await store.remove('a');assert.equal(await store.load('a'),null);assert.ok(await store.load('b'));
 const pending=store.save(entry('c'));await store.clear();await pending;
 const fresh=createRhythmHistoryStore(factory);assert.equal(await fresh.load('b'),null);assert.equal(await fresh.load('c'),null);
});
test('invalid versions, nonfinite data and corrupted rows are never restored as results',async()=>{
 const factory=new IDBFactory(),store=createRhythmHistoryStore(factory);await store.save(entry('valid'));
 const good=await store.load('valid');assert.ok(validRhythmHistory(good));
 for(const value of [{...good,version:2},{...good,position:NaN},{...good,result:{...good.result,beats:[Infinity]}},{...good,audio:{blob:'not bytes'}},null])assert.equal(validRhythmHistory(value),false);
 assert.equal(await store.save(entry('bad',{result:{...good.result,waveform:[NaN]}})),false);assert.equal(await store.load('bad'),null);
});
test('independent browser profiles have independent analysis history',async()=>{
 await createRhythmHistoryStore(new IDBFactory()).save(entry('same-name'));
 assert.equal(await createRhythmHistoryStore(new IDBFactory()).load('same-name'),null);
});
test('byte-budget eviction clears an old durable cache but preserves a newer session-only draft',async()=>{
 const bigAudio=()=>{const blob=new Blob(['synthetic']);Object.defineProperty(blob,'size',{value:100*1024*1024});return {blob,name:'large.wav',lastModified:1};};
 const durable=createRhythmHistoryStore(new IDBFactory());await durable.save(entry('a',{source:'audio',audio:bigAudio()}));await durable.save(entry('b',{source:'audio',audio:bigAudio()}));assert.equal(durable.peek('a'),null);assert.equal(await durable.load('a'),null);
 const memoryOnly=createRhythmHistoryStore(new IDBFactory());await memoryOnly.save(entry('a',{source:'audio',audio:bigAudio()}));await memoryOnly.save(entry('a',{originText:'4.321'}),false);await memoryOnly.save(entry('b',{source:'audio',audio:bigAudio()}));assert.equal((await memoryOnly.load('a')).originText,'4.321');
});
