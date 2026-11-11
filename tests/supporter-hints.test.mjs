import test from 'node:test';
import assert from 'node:assert/strict';
import { paymentSupporters } from '../frontend/experience.js';

test('fox clearing uses a bird hint when only a bird supporter can pay',()=>{
 const cards=[{id:'b',suit:'wild'},{id:'m',suit:'mouse'}];
 assert.deepEqual(paymentSupporters(cards,'fox',1).map(c=>c.id),['b']);
});
test('automatic preview preserves birds until matching supporters are spent',()=>{
 const cards=[{id:'b1',suit:'wild'},{id:'f',suit:'fox'},{id:'b2',suit:'wild'},{id:'m',suit:'mouse'}];
 assert.deepEqual(paymentSupporters(cards,'fox',1).map(c=>c.id),['f']);
 assert.deepEqual(paymentSupporters(cards,'fox',2).map(c=>c.id),['f','b1']);
 assert.deepEqual(paymentSupporters(cards,'fox',3).map(c=>c.id),['f','b1','b2']);
 assert.deepEqual(cards.map(c=>c.id),['b1','f','b2','m']);
});
