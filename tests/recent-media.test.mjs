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
test('history capacity failures preserve previous videos and do not partially save a new file',async()=>{
 const store=recentStore(new IDBFactory());
 for(let i=0;i<HISTORY_LIMITS.files;i++)await store.saveFile(new File(['bytes'],`${i}.mp4`,{lastModified:i}));
 await assert.rejects(store.saveFile(new File(['new'],'too-many.mp4')),/10本/);
 assert.equal((await store.list()).length,10);assert.equal(await (await store.getFile((await store.list())[0].id)).text(),'bytes');
});
test('deleting one stored copy leaves other items and full clear removes both metadata and blobs',async()=>{
 const store=recentStore(new IDBFactory()),file=new File(['bytes'],'mine.mp4',{lastModified:1});await store.saveFile(file);await store.saveLink('https://x.com/example/status/1','link');
 const id='file:'+fileKey(file);await store.remove(id);assert.equal((await store.list()).length,1);await assert.rejects(store.getFile(id),/見つかりません/);
 await store.saveFile(file);await store.clear();assert.deepEqual(await store.list(),[]);await assert.rejects(store.getFile(id),/見つかりません/);
});
test('invalid URLs cannot be stored and link history is bounded independently of videos',async()=>{
 const store=recentStore(new IDBFactory());await assert.rejects(store.saveLink('javascript:alert(1)','link'));
 const file=new File(['original'],'mine.mp4',{lastModified:1});await store.saveFile(file);
 for(let i=0;i<35;i++)await store.saveLink(`https://x.com/example/status/${i}`,'link');
 const items=await store.list();assert.equal(items.filter(i=>i.kind==='link').length,30);assert.equal(items.filter(i=>i.kind==='file').length,1);
});
