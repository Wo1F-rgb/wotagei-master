import test from 'node:test';
import assert from 'node:assert/strict';
import {clampMediaTime,formatMediaTime} from '../lib/fullscreen-player-controls.ts';

test('fullscreen seek values stay inside a finite media duration',()=>{
 assert.equal(clampMediaTime(-1,20),0);
 assert.equal(clampMediaTime(4.25,20),4.25);
 assert.equal(clampMediaTime(30,20),20);
 assert.equal(clampMediaTime(Number.NaN,20),0);
 assert.equal(clampMediaTime(4,Number.NaN),0);
});

test('fullscreen controls use compact elapsed and duration labels',()=>{
 assert.equal(formatMediaTime(0),'0:00');
 assert.equal(formatMediaTime(65.9),'1:05');
 assert.equal(formatMediaTime(Number.NaN),'0:00');
});
