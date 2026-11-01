import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {phoneConfig,phoneGate} from './lib/private-phone.mjs';
const code='1'.repeat(32),session='test-session',origin='https://192.168.1.10:4316';
async function call(gate,{path='/',method='GET',body='',headers={},address='192.168.1.20'}={}){
 const req=Readable.from([Buffer.from(body)]);Object.assign(req,{method,headers,socket:{remoteAddress:address}});
 const res={writeHead(status,headers){this.status=status;this.headers=headers;},end(body){this.body=body;}};
 const handled=await gate(req,res,path,origin);return{handled,...res};
}
test('private phone config fails closed for public interfaces, inference and shared storage',async()=>{
 assert.equal(await phoneConfig({}),null);
 for(const host of ['0.0.0.0','127.0.0.1','8.8.8.8','192.168.bad','172.32.0.1'])await assert.rejects(phoneConfig({CARRYFORWARD_PHONE_HTTPS:'1',CARRYFORWARD_PHONE_HOST:host}),/private IPv4/);
 const base={CARRYFORWARD_PHONE_HTTPS:'1',CARRYFORWARD_PHONE_HOST:'192.168.1.10'};
 await assert.rejects(phoneConfig({...base,CARRYFORWARD_META_ENABLED:'1'}),/inference disabled/);
 await assert.rejects(phoneConfig(base),/separate explicit/);
 await assert.rejects(phoneConfig({...base,CARRYFORWARD_META_ENABLED:'1',CARRYFORWARD_PHONE_META_TRIAL:'yes'}),/inference disabled/);
 await assert.rejects(phoneConfig({...base,CARRYFORWARD_META_ENABLED:'1',CARRYFORWARD_PHONE_META_TRIAL:'synthetic-live-voice'}),/separate explicit/);
});
test('phone pairing protects application shell, config, evidence and simulator routes',async()=>{
 const gate=phoneGate({code,session});
 assert.equal((await call(gate)).headers.Location,'/pair');
 for(const path of ['/api/config','/app.js','/job-assets/visit-reference.pdf','/api/v1/simulator/inbox'])assert.equal((await call(gate,{path})).status,401);
 const form=await call(gate,{path:'/pair'});assert.equal(form.status,200);assert.ok(!form.body.includes(code));assert.equal(form.headers['Cache-Control'],'no-store');
 const headers={origin,'content-type':'application/x-www-form-urlencoded'};
 assert.equal((await call(gate,{path:'/pair',method:'POST',body:`code=${code}`,headers:{...headers,origin:'https://other.example'}})).status,403);
 assert.equal((await call(gate,{path:'/pair',method:'POST',body:'code='+encodeURIComponent('é'.repeat(32)),headers})).status,403);
 const paired=await call(gate,{path:'/pair',method:'POST',body:`code=${code}`,headers});
 assert.equal(paired.status,303);assert.match(paired.headers['Set-Cookie'],/HttpOnly; Secure; SameSite=Strict/);
 assert.equal((await call(gate,{path:'/api/config',headers:{cookie:`carryforward_session=${session}`}})).handled,false);
 assert.equal((await call(gate,{path:'/api/config',headers:{cookie:`carryforward_session=${session}extra`}})).status,401);
});
test('pairing attempts are bounded and oversized bodies cannot establish a session',async()=>{
 let clock=0;const gate=phoneGate({code,session,now:()=>clock});
 const input={path:'/pair',method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:'code=wrong'};
 for(let i=0;i<5;i++)assert.equal((await call(gate,input)).status,403);
 assert.equal((await call(gate,{...input,body:`code=${code}`})).status,429);
 clock=900001;assert.equal((await call(gate,{...input,body:`code=${code}`})).status,303);
 assert.equal((await call(gate,{...input,body:'x'.repeat(300)})).status,413);
});
