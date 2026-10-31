import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const worker=new URL('../public/sw.js',import.meta.url);
let source=await readFile(worker,'utf8');
const assets=JSON.parse(source.match(/const SHELL=(\[[^;]+\]);/)[1]);
const hash=createHash('sha256');
for(const path of assets)hash.update(await readFile(new URL('../public/'+(path==='/'?'index.html':path.slice(1)),import.meta.url)));
source=source.replace(/carryforward-shell-[a-f0-9]{16}/,'carryforward-shell-'+hash.digest('hex').slice(0,16));
await writeFile(worker,source);
