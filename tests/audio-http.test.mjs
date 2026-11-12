// Copyright (c) 2026 AlbertTheBlogger. Project-authored code: MIT; original audio excluded. See LICENSE-SCOPE.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../backend/server.mjs';

test('new client modules and bounded audio whitelist serve valid media without exposing original resources',async t=>{
 const app=createApp({dbPath:':memory:',rateLimit:false});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>app.close());
 const base=`http://127.0.0.1:${app.server.address().port}`;
 for(const path of ['/motion.js','/map-camera.js','/sound.js','/presentation-model.js']){const r=await fetch(base+path);assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/javascript/);}
 const response=await fetch(base+'/audio-manifest.json');assert.equal(response.status,200);const manifest=await response.json();assert.equal(manifest.files.length,9);
 for(const file of manifest.files){const r=await fetch(base+file);assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/audio\/wav/);const bytes=Buffer.from(await r.arrayBuffer());assert.equal(bytes.subarray(0,4).toString(),'RIFF');assert.equal(bytes.subarray(8,12).toString(),'WAVE');assert.equal(Number(r.headers.get('content-length')),bytes.length);}
 for(const path of ['/assets/audio/unlisted.wav','/research/audio/index.json','/Root_Data/resources.assets'])assert.equal((await fetch(base+path)).status,404);
});
