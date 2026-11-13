// Copyright (c) 2026 AlbertTheBlogger. Project-authored code: MIT; third-party resources excluded. See LICENSE-SCOPE.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import {clampCompanionBox,zoomCompanionBox} from '../frontend/companion-map.js';
test('companion camera zoom preserves a chosen clearing anchor until the map boundary',()=>{
 const base=[0,0,1200,720],anchor=[600,360];const zoomed=zoomCompanionBox(base,base,2,anchor);
 assert.deepEqual(zoomed,[300,180,600,360]);
 assert.equal((anchor[0]-zoomed[0])/zoomed[2],.5);assert.equal((anchor[1]-zoomed[1])/zoomed[3],.5);
 assert.deepEqual(zoomCompanionBox(zoomed,base,.5,anchor),base);
});
test('panning and repeated pinch zoom remain inside the board with a four-times limit',()=>{
 const base=[15,20,1170,720];let box=[...base];
 for(let i=0;i<20;i++)box=zoomCompanionBox(box,base,2);
 assert.equal(box[2],base[2]/4);assert.equal(box[3],base[3]/4);
 const pan=clampCompanionBox([-10000,10000,...box.slice(2)],base);
 assert.equal(pan[0],base[0]);assert.equal(pan[1],base[1]+base[3]-box[3]);
 for(let i=0;i<20;i++)box=zoomCompanionBox(box,base,.5);
 assert.deepEqual(box,base);
 assert.throws(()=>zoomCompanionBox(base,base,0));assert.throws(()=>clampCompanionBox([NaN,0,10,10],base));
});
