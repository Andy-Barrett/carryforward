// Local capture-only backend for the development iOS wrapper. No provider key needed.
import {mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
const root=new URL('../',import.meta.url),data=new URL('.local/ios-simulator/',root);
await mkdir(data,{recursive:true,mode:0o700});
const child=spawn(process.execPath,['server.mjs'],{cwd:root,stdio:'inherit',env:{...process.env,
  PORT:'4350',CARRYFORWARD_PHONE_HTTPS:'0',CARRYFORWARD_META_ENABLED:'0',
  CARRYFORWARD_OPERATIONS_DB:new URL('operations.sqlite',data).pathname}});
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>child.kill(signal));
child.once('exit',code=>process.exit(code??1));
