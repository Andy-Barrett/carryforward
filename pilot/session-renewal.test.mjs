import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('./public/app.js',import.meta.url),'utf8');
const start=source.indexOf('function resumeSession() {'),end=source.indexOf('async function revalidateVisible()',start);
function fixture(refresh){
  const calls=[],context=vm.createContext({sessionRenewal:null,cache:{scope:'company-a:user-a'},current:{id:'visit-a'},
    refresh:async()=>refresh(context),field:async id=>calls.push(['field',id]),lock:()=>{context.cache=null;calls.push(['lock']);},
    authScreen:()=>calls.push(['auth']),page:async name=>calls.push(['page',name]),message:text=>calls.push(['message',text])});
  new vm.Script(source.slice(start,end)).runInContext(context);return {context,calls};
}
test('offline lease renewal reuses server authentication and restores only the same company visit',async()=>{
  let release;const f=fixture(context=>new Promise(resolve=>{release=()=>{context.cache={scope:'company-a:user-a'};resolve();};}));
  const first=f.context.resumeSession(),second=f.context.resumeSession();assert.equal(first,second);
  release();await first;assert.deepEqual(f.calls,[['field','visit-a']]);assert.equal(f.context.sessionRenewal,null);
});
test('expired or changed server identity cannot reopen the old company visit',async()=>{
  for(const cache of [null,{scope:'company-b:user-b'}]){
    const f=fixture(context=>{context.cache=cache;});await f.context.resumeSession();assert.deepEqual(f.calls,[]);
  }
});
test('offline renewal failure keeps saved work locked and requests reconnection',async()=>{
  const f=fixture(()=>{throw Error('Network unavailable');});await f.context.resumeSession();
  assert.equal(f.context.cache,null);assert.deepEqual(f.calls.slice(0,2),[['lock'],['auth']]);assert.match(f.calls[2][1],/Reconnect.*Network unavailable/);
});
test('a removed visit returns to assignments without asking a valid account to sign in again',async()=>{
  const f=fixture(()=>{});f.context.field=async()=>{throw Error('Assignment changed');};await f.context.resumeSession();
  assert.deepEqual(f.calls[0],['page','jobs']);assert.match(f.calls[1][1],/Assignment changed/);assert.equal(f.context.cache.scope,'company-a:user-a');
});
