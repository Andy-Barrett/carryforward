import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import vm from 'node:vm';
const source=await readFile(new URL('./public/sw.js',import.meta.url),'utf8');
function harness({fail=false}={}){const handlers={},deleted=[],stored=[];let fetches=0;
 const cache={addAll:async paths=>{if(fail)throw Error('network lost');stored.push(...paths);},match:async path=>stored.includes(path)?{cached:path}:undefined};
 const caches={open:async()=>cache,delete:async key=>deleted.push(key),keys:async()=>['carryforward-shell-old','unrelated-app-cache']};
 const scope={self:{location:{origin:'http://127.0.0.1:4315'},addEventListener:(type,fn)=>handlers[type]=fn},caches,URL,fetch:async()=>{fetches++;return{network:true};}};
 vm.runInNewContext(source,scope);return{handlers,deleted,stored,fetches:()=>fetches};}
async function lifecycle(fn){let pending;fn({waitUntil:p=>pending=p});await pending;}
test('offline cache is content-versioned and contains only existing explicit shell assets',async()=>{
 const assets=JSON.parse(source.match(/const SHELL=(\[[^;]+\]);/)[1]);const hash=createHash('sha256');
 for(const path of assets){assert.ok(path==='/'||/^\/[a-z.-]+\.(js|css|svg|webmanifest)$/.test(path)||['/football-mark-v1.png','/app-icon-192.png','/app-icon-512.png','/apple-touch-icon.png','/favicon-32.png'].includes(path));assert.ok(!path.startsWith('/api/'));hash.update(await readFile(new URL('./public/'+(path==='/'?'index.html':path.slice(1)),import.meta.url)));}
 assert.ok(source.includes('carryforward-shell-'+hash.digest('hex').slice(0,16)),'Run node scripts/refresh-shell-version.mjs after shell changes');
});
test('offline worker serves shell only and never intercepts APIs, evidence or external URLs',async()=>{
 const h=harness();await lifecycle(h.handlers.install);
 for(const [url,method] of [['http://127.0.0.1:4315/api/config','GET'],['http://127.0.0.1:4315/api/review','POST'],['http://127.0.0.1:4315/evidence/secret','GET'],['https://other.example/app.js','GET'],['http://127.0.0.1:4315/?token=test','GET']]){
 let intercepted=false;h.handlers.fetch({request:{url,method},respondWith:()=>intercepted=true});assert.equal(intercepted,false);}
 let result;h.handlers.fetch({request:{url:'http://127.0.0.1:4315/',method:'GET'},respondWith:p=>result=p});assert.equal((await result).cached,'/');assert.equal(h.fetches(),0);
 await lifecycle(h.handlers.activate);assert.deepEqual(h.deleted,['carryforward-shell-old']);
});
test('partial installation is discarded instead of advertising offline readiness',async()=>{
 const h=harness({fail:true});await assert.rejects(lifecycle(h.handlers.install),/network lost/);assert.equal(h.deleted.length,1);assert.deepEqual(h.stored,[]);
});
