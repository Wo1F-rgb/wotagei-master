import test from 'node:test';import assert from 'node:assert/strict';import {searchMusic,appleSongId,validBpm} from '../lib/music-search.ts';
test('Apple Music song links resolve only through an allowlisted catalog endpoint',()=>{
 assert.deepEqual(appleSongId('https://music.apple.com/jp/album/title/123?i=456'),{id:'456',country:'jp'});
 assert.deepEqual(appleSongId('https://music.apple.com/us/song/title/789'),{id:'789',country:'us'});
 assert.equal(appleSongId('星間飛行'),null);
 for(const value of ['https://evil.example/song/123','http://music.apple.com/jp/song/123','https://music.apple.com/jp/album/123'])assert.throws(()=>appleSongId(value));
});
test('registered BPM can be selected, but zero/missing BPM is never guessed',async()=>{
 const requests=[];const fetcher=async url=>{requests.push(url);if(url.includes('/search?'))return Response.json({data:[{id:1,title:'Original',artist:{name:'Singer'},album:{title:'Album'}},{id:2,title:'Cover',artist:{name:'Other'}}]});return Response.json({bpm:url.endsWith('/1')?150:0});};
 const result=await searchMusic('Original Singer',fetcher);assert.equal(result.songs[0].bpm,150);assert.equal(result.songs[1].bpm,null);assert.equal(result.songs[1].artist,'Other');assert.ok(requests.every(url=>url.startsWith('https://api.deezer.com/')));
 for(const bpm of [0,null,undefined,'unknown',999])assert.equal(validBpm(bpm),null);
});
test('Apple Music metadata never becomes downloaded audio or an assumed BPM',async()=>{
 const requests=[];const fetcher=async url=>{requests.push(url);return Response.json(url.includes('itunes.apple.com')?{results:[{kind:'song',trackName:'Song',artistName:'Artist',previewUrl:'do-not-download'}]}:{data:[]});};
 const result=await searchMusic('https://music.apple.com/jp/song/song/123',fetcher);assert.equal(result.apple.title,'Song');assert.equal(result.songs.length,0);assert.equal(requests.length,2);assert.ok(requests.every(url=>!url.includes('do-not-download')));
});
test('GetSongBPM uses its server key header and returns source-attributed values',async()=>{
 const fetcher=async (url,init)=>{assert.ok(!url.includes('secret'));assert.equal(init.headers['X-API-KEY'],'secret');return Response.json({search:[{id:'id1',title:'Title',tempo:'131',artist:{name:'Artist'}}]});};
 const result=await searchMusic('Title',fetcher,'secret');assert.equal(result.songs[0].bpm,131);assert.equal(result.songs[0].provider,'GetSongBPM');
});
