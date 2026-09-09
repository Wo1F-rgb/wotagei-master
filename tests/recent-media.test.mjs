import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {recentStore,fileKey,HISTORY_LIMITS} from '../lib/recent-media.ts';

test('video bytes and original identity survive closing and reopening the database',async()=>{
 const factory=new IDBFactory(),file=new File(['video-content'],'practice.mp4',{type:'video/mp4',lastModified:12345});
 await recentStore(factory).saveFile(file);
 const reopened=recentStore(factory),items=await reopened.list();assert.equal(items.length,1);assert.equal(items[0].name,file.name);assert.equal(items[0].blob,undefined);
 const restored=await reopened.getFile(items[0].id);assert.equal(await restored.text(),'video-content');assert.equal(fileKey(restored),fileKey(file));assert.equal(restored.type,'video/mp4');
 await reopened.saveFile(restored);assert.equal((await reopened.list()).length,1);
});
test('independent browser storage does not share any videos or URL history',async()=>{
 const a=recentStore(new IDBFactory()),b=recentStore(new IDBFactory());
 await a.saveLink('https://www.youtube.com/watch?v=M7lc1UVf-VE','youtube');
 assert.equal((await a.list()).length,1);assert.deepEqual(await b.list(),[]);
});
test('an eleventh recent item replaces only the oldest copy, and reusing a file moves it to the front',async()=>{
 const store=recentStore(new IDBFactory());
 const files=Array.from({length:11},(_,i)=>new File([`video ${i}`],`${i}.mp4`,{lastModified:i}));
 for(const file of files.slice(0,10))await store.saveFile(file);
 await store.saveFile(files[0]);assert.equal((await store.list())[0].name,'0.mp4');
 await store.saveFile(files[10]);const items=await store.list();assert.equal(items.length,HISTORY_LIMITS.items);assert.equal(items[0].name,'10.mp4');
 assert.equal(await (await store.getFile('file:'+fileKey(files[0]))).text(),'video 0');await assert.rejects(store.getFile('file:'+fileKey(files[1])),/見つかりません/);
});
test('an oversized file leaves all existing history intact',async()=>{
 const store=recentStore(new IDBFactory());for(let i=0;i<10;i++)await store.saveFile(new File(['original'],`${i}.mp4`,{lastModified:i}));
 const before=await store.list(),file=new File(['too big'],'large.mp4');Object.defineProperty(file,'size',{value:HISTORY_LIMITS.oneFile+1});
 await assert.rejects(store.saveFile(file),/500MB/);assert.deepEqual(await store.list(),before);assert.equal(await (await store.getFile(before[9].id)).text(),'original');
});
test('deleting one stored copy leaves other items and full clear removes both metadata and blobs',async()=>{
 const store=recentStore(new IDBFactory()),file=new File(['bytes'],'mine.mp4',{lastModified:1});await store.saveFile(file);await store.saveLink('https://x.com/example/status/1','link');
 const id='file:'+fileKey(file);await store.remove(id);assert.equal((await store.list()).length,1);await assert.rejects(store.getFile(id),/見つかりません/);
 await store.saveFile(file);await store.clear();assert.deepEqual(await store.list(),[]);await assert.rejects(store.getFile(id),/見つかりません/);
});
test('files and links share ten recent entries; invalid links do not evict anything',async()=>{
 const store=recentStore(new IDBFactory());await assert.rejects(store.saveLink('javascript:alert(1)','link'));
 const file=new File(['original'],'mine.mp4',{lastModified:1});await store.saveFile(file);
 for(let i=0;i<9;i++)await store.saveLink(`https://x.com/example/status/${i}`,'link');
 assert.equal((await store.list()).length,10);assert.equal(await (await store.getFile('file:'+fileKey(file))).text(),'original');
 await assert.rejects(store.saveLink('https://invalid.test','link'));assert.equal((await store.list()).length,10);
 await store.saveLink('https://x.com/example/status/9','link');const items=await store.list();assert.equal(items.length,10);assert.ok(items.every(i=>i.kind==='link'));await assert.rejects(store.getFile('file:'+fileKey(file)),/見つかりません/);
});
