import test from 'node:test';import assert from 'node:assert/strict';import {parseRekordbox} from '../lib/song-library.ts';
test('rekordbox title, artist and fractional BPM import without copying file paths or video origins',()=>{
 const songs=parseRekordbox(`<DJ_PLAYLISTS><COLLECTION Entries="2"><TRACK TrackID="1" Name="星 &amp; 光" Artist="Artist" AverageBpm="150.25" Location="file://private/path.mp3"><TEMPO Inizio="1.5" Bpm="150.25"/></TRACK><TRACK Name="No analysis" AverageBpm="0"/></COLLECTION></DJ_PLAYLISTS>`);
 assert.equal(songs.length,1);assert.equal(songs[0].name,'星 & 光');assert.equal(songs[0].bpm,150.25);assert.equal(songs[0].variable,false);assert.ok(!JSON.stringify(songs).includes('private'));assert.ok(!('origin' in songs[0]));
});
test('tempo changes are flagged and collection duplicates removed',()=>{
 const track=`<TRACK Name="Changing" AverageBpm="140"><TEMPO Bpm="120"/><TEMPO Bpm="160"/></TRACK>`;
 const songs=parseRekordbox(`<DJ_PLAYLISTS><COLLECTION>${track}${track}</COLLECTION></DJ_PLAYLISTS>`);assert.equal(songs.length,1);assert.equal(songs[0].variable,true);
});
test('malformed XML, playlist-only XML, entities and unanalysed tracks fail clearly',()=>{
 for(const xml of ['<broken>','<DJ_PLAYLISTS><PLAYLISTS/></DJ_PLAYLISTS>','<!DOCTYPE test [<!ENTITY x "value">]><DJ_PLAYLISTS/>','<DJ_PLAYLISTS><COLLECTION><TRACK Name="x" AverageBpm="NaN"/></COLLECTION></DJ_PLAYLISTS>'])assert.throws(()=>parseRekordbox(xml));
});
