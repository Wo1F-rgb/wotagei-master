// Run after npm run build; executes the emitted worker bundle without a browser.
import {readdir,readFile} from 'node:fs/promises';import vm from 'node:vm';import assert from 'node:assert/strict';import {rhythmFixture} from './audio-fixtures.mjs';
const folder=new URL('../dist-pages/assets/',import.meta.url);
const files=(await readdir(folder)).filter(n=>/^bpm\.worker-.*\.js$/.test(n));assert.equal(files.length,1);
let message;const context={self:{postMessage(value){message=value;}},Float32Array,Float64Array,Uint32Array,Math,Map};
vm.runInNewContext(await readFile(new URL(files[0],folder),'utf8'),context,{timeout:10000});
const samples=rhythmFixture(150,{seconds:20});context.self.onmessage({data:{windows:[{samples,start:0,sampleRate:22050}]}});
assert.ok(!message.error,message.error);assert.ok(message.result.candidates.some(c=>Math.abs(c.bpm-150)<1));
context.self.onmessage({data:{windows:[{samples:new Float32Array(22050*18),start:0,sampleRate:22050}]}});assert.ok(message.error);
console.log('Built worker: 150 BPM candidate and silence error both verified.');
