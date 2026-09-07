import test from 'node:test';
import assert from 'node:assert/strict';
import {maskAlpha,removeGreen,restoreBackground,containRect} from '../lib/background.ts';
test('person mask removes background, retains subject and feathers uncertain edges',()=>{
 const rgba=maskAlpha(new Float32Array([0,.1,.5,.9,1,NaN]),.5);
 assert.deepEqual([rgba[3],rgba[7],rgba[15],rgba[19],rgba[23]],[0,0,255,255,0]);assert.ok(rgba[11]>=127&&rgba[11]<=128);
 const tighter=maskAlpha(new Float32Array([.5]),.7);assert.equal(tighter[3],0);
});
test('green screen key removes bright and shaded green but preserves skin and neutral colors',()=>{
 const pixels=new Uint8ClampedArray([0,255,0,255,20,110,25,255,200,145,115,255,128,128,128,255,255,255,255,255,0,0,0,255,0,30,220,255]);
 removeGreen(pixels,.5);assert.equal(pixels[3],0);assert.equal(pixels[7],0);
 for(const alpha of [11,15,19,23,27])assert.equal(pixels[alpha],255);
 assert.deepEqual([...pixels.slice(8,12)],[200,145,115,255]);
});
test('green strength adjusts edges gradually and never increases existing opacity',()=>{
 const input=[60,100,65,100],gentle=removeGreen(new Uint8ClampedArray(input),.1),strong=removeGreen(new Uint8ClampedArray(input),.9);
 assert.ok(strong[3]<gentle[3]);assert.ok(gentle[3]<=100);assert.ok(strong[1]<gentle[1]);
});
test('cutout uses the same contained source rectangle for portrait and landscape videos',()=>{
 assert.deepEqual(containRect(1920,1080,640,480),{x:0,y:60,width:640,height:360});
 assert.deepEqual(containRect(1080,1920,640,480),{x:185,y:0,width:270,height:480});
});
test('saved background preferences reject invalid modes and clamp numeric values',()=>{
 assert.deepEqual(restoreBackground(null),{mode:'off',threshold:.5,preview:'green'});
 assert.deepEqual(restoreBackground({mode:'person',threshold:4,preview:'transparent'}),{mode:'person',threshold:.9,preview:'transparent'});
 assert.deepEqual(restoreBackground({mode:'unknown',threshold:NaN}),{mode:'off',threshold:.5,preview:'green'});
});
