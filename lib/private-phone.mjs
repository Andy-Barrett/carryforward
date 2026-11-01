import {timingSafeEqual} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {isIP} from 'node:net';

export async function phoneConfig(env=process.env) {
  if(env.CARRYFORWARD_PHONE_HTTPS!=='1') return null;
  const host=env.CARRYFORWARD_PHONE_HOST||'';
  if(isIP(host)!==4 || !/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) throw Error('Phone HTTPS requires an explicit private IPv4 interface');
  if(env.CARRYFORWARD_META_ENABLED==='1' && env.CARRYFORWARD_PHONE_META_TRIAL!=='synthetic-live-voice') throw Error('Phone capture trial must keep Meta inference disabled unless the synthetic live-voice trial is explicitly selected');
  if(!env.CARRYFORWARD_OPERATIONS_DB) throw Error('Phone trial requires a separate explicit Operations database');
  const [key,cert,code]=await Promise.all([readFile(env.CARRYFORWARD_PHONE_KEY),readFile(env.CARRYFORWARD_PHONE_CERT),readFile(env.CARRYFORWARD_PHONE_CODE,'utf8')]);
  const pairingCode=code.trim();
  if(!/^[a-f0-9]{32}$/.test(pairingCode)) throw Error('Phone pairing requires a random 128-bit code');
  return {host,key,cert,pairingCode};
}

export function phoneGate({code,session,now=Date.now}) {
  const attempts=new Map();
  return async(req,res,path,origin)=>{
    const cookie=`carryforward_session=${session}`;
    if((req.headers.cookie||'').split('; ').includes(cookie)) return false;
    const send=(status,body,type='text/plain')=>{res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",'X-Content-Type-Options':'nosniff'});res.end(body);};
    if(path==='/pair' && req.method==='GET'){
      send(200,'<!doctype html><html lang="en"><meta name="viewport" content="width=device-width, initial-scale=1"><title>CarryForward phone trial</title><h1>Pair this phone</h1><p>Private fictional-data test. Enter the code shown on your Mac.</p><form method="post" action="/pair"><label>Pairing code <input name="code" type="password" required maxlength="32" autocomplete="off" autocapitalize="none"></label><button>Open CarryForward</button></form></html>','text/html');return true;
    }
    if(path==='/pair' && req.method==='POST'){
      if(req.headers.origin!==origin || req.headers['content-type']!=='application/x-www-form-urlencoded'){send(403,'Pair from this HTTPS page');return true;}
      const address=req.socket.remoteAddress||'unknown',at=now();
      for(const [id,value] of attempts) if(at-value.at>900000)attempts.delete(id);
      const entry=attempts.get(address)||{count:0,at};
      if(entry.count>=5 || (!attempts.has(address)&&attempts.size>=128)){send(429,'Too many pairing attempts. Wait 15 minutes.');return true;}
      entry.count++;attempts.set(address,entry);
      let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>256){send(413,'Pairing request too large');return true;}}
      const supplied=new URLSearchParams(body).get('code')||'';
      if(!/^[a-f0-9]{32}$/.test(supplied) || !timingSafeEqual(Buffer.from(supplied),Buffer.from(code))){send(403,'Pairing code did not match');return true;}
      attempts.delete(address);
      res.writeHead(303,{'Location':'/','Cache-Control':'no-store','Set-Cookie':`${cookie}; HttpOnly; Secure; SameSite=Strict; Path=/`});res.end();return true;
    }
    if(req.method==='GET' && path==='/'){res.writeHead(303,{'Location':'/pair','Cache-Control':'no-store'});res.end();return true;}
    send(401,'Pair this phone at /pair');return true;
  };
}
