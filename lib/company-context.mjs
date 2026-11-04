import {readFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const bounded=(value,max)=>typeof value==='string'&&value.trim()&&value.length<=max;
const terms=value=>String(value).toLowerCase().replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(w=>w.length>2&&!new Set(['the','and','for','can','what','how','this','that','with','our','are','you','about','does','have','should','would']).has(w)).map(w=>w.replace(/s$/,''));
export function validateCompanyContext(value){
  if(value?.version!=='carryforward.company-context.v1'||!bounded(value.title,300)||!bounded(value.revision,100)||!bounded(value.sourceRevision,300)||!bounded(value.sourceUrl,500)||!bounded(value.approvalBasis,1000)||value.approvalStatus!=='owner_and_safety_officer_approved'||!/^\d{4}-\d{2}-\d{2}$/.test(value.confirmedAt||''))throw Error('Company context requires a dated, recorded approved source');
  const url=new URL(value.sourceUrl);if(url.protocol!=='https:'||url.username||url.password)throw Error('Invalid company source URL');
  if(!Array.isArray(value.sections)||!value.sections.length||value.sections.length>60)throw Error('Invalid company context sections');
  const ids=new Set();let total=0;
  for(const section of value.sections){
    if(!/^company-safety-[a-z0-9-]{1,80}$/.test(section.id||'')||ids.has(section.id)||!bounded(section.title,200)||!bounded(section.text,12000)||!Array.isArray(section.keywords)||section.keywords.length>40||section.keywords.some(k=>!bounded(k,50))||typeof section.alwaysInclude!=='boolean')throw Error('Invalid company context section');
    if(section.headingId!=null&&!/^h\.[a-zA-Z0-9_-]{1,100}$/.test(section.headingId))throw Error('Invalid source heading');
    ids.add(section.id);total+=section.text.length;
  }
  if(total>80000||value.sections.filter(s=>s.alwaysInclude).length>2)throw Error('Company context exceeds bounds');
  return structuredClone(value);
}
// This path is server configuration, never a browser-supplied file or import.
// An explicit bad file fails startup rather than silently losing company policy.
export async function loadCompanyContext(path){
  if(!path)return null;
  if((await stat(path)).size>150000)throw Error('Company context file exceeds limit');
  const bytes=await readFile(path),bundle=validateCompanyContext(JSON.parse(bytes.toString('utf8')));
  return {...bundle,sha256:createHash('sha256').update(bytes).digest('hex')};
}
export function selectCompanyReferences(bundle,{text='',history=[]}={}){
  if(!bundle)return [];
  const query=terms(text),previous=terms(history.at(-1)?.question||'');
  const ranked=bundle.sections.map((section,index)=>{
    const title=new Set(terms(section.title)),tags=new Set(section.keywords.flatMap(terms)),body=new Set(terms(section.text));
    const score=words=>words.reduce((n,w)=>n+(title.has(w)?8:tags.has(w)?6:body.has(w)?1:0),0);
    return {section,index,score:score(query)*3+score(previous)};
  }).sort((a,b)=>b.score-a.score||a.index-b.index);
  const chosen=bundle.sections.filter(s=>s.alwaysInclude);
  for(const item of ranked){if(chosen.length>=6)break;if(item.score>0&&!chosen.includes(item.section))chosen.push(item.section);}
  if(chosen.length<3){const general=bundle.sections.find(s=>/10 General safety rules/.test(s.title));if(general&&!chosen.includes(general))chosen.push(general);}
  let total=0;
  return chosen.map(section=>{
    total+=section.text.length;if(total>24000)throw Error('Selected company context exceeds limit');
    return {id:section.id,kind:'approved_company_safety_policy_not_equipment_procedure',title:bundle.title,section:section.title,revision:bundle.revision,sourceRevision:bundle.sourceRevision,url:bundle.sourceUrl+(section.headingId?'#heading='+section.headingId:''),approvalStatus:bundle.approvalStatus,approvalBasis:bundle.approvalBasis,confirmedAt:bundle.confirmedAt,text:section.text};
  });
}
