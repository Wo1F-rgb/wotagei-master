import test from 'node:test';import assert from 'node:assert/strict';
import {restoreAppearance,gammaExponent,defaultAppearance} from '../lib/video-appearance.ts';
test('appearance restores only finite bounded values and explicit display choices',()=>{
 assert.deepEqual(restoreAppearance(null),defaultAppearance);assert.deepEqual(restoreAppearance({gamma:NaN,contrast:Infinity,skeleton:'yes',tint:1}),defaultAppearance);
 assert.deepEqual(restoreAppearance({gamma:9,contrast:-1,skeleton:true,tint:true}),{gamma:2.4,contrast:.6,skeleton:true,tint:true});
});
test('gamma correction lifts dark clothes without lifting pure black or crushing white',()=>{
 const exponent=gammaExponent(1.5);assert.ok(Math.pow(.1,exponent)>.1);assert.equal(Math.pow(0,exponent),0);assert.equal(Math.pow(1,exponent),1);assert.equal(gammaExponent(1),1);
});
