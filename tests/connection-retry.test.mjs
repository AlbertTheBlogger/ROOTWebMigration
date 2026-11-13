// Copyright (c) 2026 AlbertTheBlogger. Project-authored code: MIT; third-party artwork/text excluded. See LICENSE-SCOPE.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source=readFileSync(new URL('../frontend/app.js',import.meta.url),'utf8');
const apiSource=source.slice(source.indexOf('async function api('),source.indexOf('function closeStream()'));

function client({failFirst=true,storageFails=false}={}) {
  const requests=[];
  const indicator={hidden:true};
  const api=runInNewContext(apiSource+';api',{
    performance,AbortController,TypeError,Error,JSON,Object,controllerId:'test-controller-identity',companionMode:false,
    document:{querySelector:()=>indicator},
    sessionStorage:{getItem:()=>{if(storageFails)throw new Error('Storage unavailable');return '[]';},setItem:()=>{}},
    setTimeout:(callback,ms)=>setTimeout(callback,Math.min(ms,10)),clearTimeout,
    fetch:(path,options)=>{
      requests.push({path,body:options.body,controller:options.headers['X-Woodland-Controller']});
      if(failFirst&&requests.length===1)return new Promise((resolve,reject)=>{
        options.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});
      });
      return Promise.resolve({ok:true,headers:{get:()=>null},json:async()=>({ok:true})});
    },
  });
  return {api,requests,indicator};
}

test('a stalled read is cancelled and retried once',async()=>{
  const c=client();assert.equal((await c.api('/api/rooms')).ok,true);
  assert.equal(c.requests.length,2);
});
test('room command retry preserves the unique ID and exact payload',async()=>{
  const c=client();const body={commandId:'same-command-123',version:7,command:{type:'ready',ready:true}};
  assert.equal((await c.api('/api/rooms/123456/command',body)).ok,true);
  assert.equal(c.requests.length,2);assert.equal(c.requests[0].body,c.requests[1].body);
  assert.equal(c.requests[0].controller,c.requests[1].controller);
  assert.equal(c.indicator.hidden,true);
});
test('account creation is not automatically replayed after an ambiguous timeout',async()=>{
  const c=client();await assert.rejects(c.api('/api/auth/register',{username:'test',password:'test-only-123'}));
  assert.equal(c.requests.length,1);assert.equal(c.indicator.hidden,true);
});
test('diagnostic storage failure does not hide a successfully committed result',async()=>{
  const c=client({failFirst:false,storageFails:true});
  assert.equal((await c.api('/api/rooms/123456/command',{commandId:'safe-id-123',command:{type:'ready'}})).ok,true);
  assert.equal(c.requests.length,1);
});
