import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { validateOrder, reviewReport } from '../public/engine.js';
import { inspectWav, validateAudioOriginal, AUDIO_LIMITS } from '../public/audio.js';
import { reportRevision, evidenceRevision } from '../public/evidence.js';
import { createInvestigation, reduceInvestigation, interviewHandoff } from '../public/investigation.js';
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
// These checks reject caller input or a conflicting requested transition.
// Unexpected database/runtime exceptions remain untyped and are sanitized by
// the HTTP boundary rather than being exposed as client validation failures.
export class OperationsValidationError extends Error {
  constructor(message) { super(message); this.name='OperationsValidationError'; this.status=400; }
}
const check = (condition,message) => { if (!condition) throw new OperationsValidationError(message); };
const plainText = (value,max=300)=>typeof value==='string' && value.trim() && value.length<=max;
const parse = row => row ? {...row,order:JSON.parse(row.assignment),events:JSON.parse(row.events),candidate:row.candidate?JSON.parse(row.candidate):null,confirmation:row.confirmation?JSON.parse(row.confirmation):null} : null;

export class OperationsStore {
  constructor(path=':memory:') {
    this.db=new DatabaseSync(path);
    this.db.exec(`CREATE TABLE IF NOT EXISTS audio_evidence (id TEXT PRIMARY KEY, job_id TEXT NOT NULL, sha256 TEXT NOT NULL, mime TEXT NOT NULL, name TEXT NOT NULL, wav_sha256 TEXT, bytes BLOB NOT NULL, wav_bytes BLOB);
      PRAGMA foreign_keys=ON; PRAGMA busy_timeout=3000;
      CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, external_id TEXT UNIQUE NOT NULL, assignment TEXT NOT NULL, assignment_hash TEXT NOT NULL, events TEXT NOT NULL DEFAULT '[]', candidate TEXT, revision TEXT, confirmation TEXT, queued_revision TEXT, received_revision TEXT, accepted_revision TEXT, decision TEXT);
      CREATE TABLE IF NOT EXISTS evidence (id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id), sha256 TEXT NOT NULL, mime TEXT NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL, bytes BLOB NOT NULL);`);
  }
  close(){this.db.close();}
  job(id){const job=parse(this.db.prepare('SELECT * FROM jobs WHERE id=?').get(id));check(job,'Unknown job');return job;}
  assign(input){
    const order=validateOrder(input);
    const hash=digest(order);
    const prior=this.db.prepare('SELECT * FROM jobs WHERE external_id=?').get(order.id);
    if(prior){check(prior.assignment_hash===hash,'Assignment identity already exists with different scope; a new assignment revision is required');return this.status(prior.id);}
    check(this.db.prepare('SELECT count(*) AS n FROM jobs').get().n<100,'Local simulator job limit reached');
    const id=randomUUID();
    this.db.prepare('INSERT INTO jobs(id,external_id,assignment,assignment_hash) VALUES(?,?,?,?)').run(id,order.id,JSON.stringify(order),hash);
    return this.status(id);
  }
  status(id){const j=this.job(id);return {jobId:j.id,sourceSystem:'local-operations-simulator',externalId:j.external_id,assignmentRevision:j.assignment_hash,order:j.order,eventRevision:j.events.length,closeoutRevision:j.revision,technicianConfirmed:!!j.confirmation,queued:j.queued_revision===j.revision&&!!j.revision,received:j.received_revision===j.revision&&!!j.revision,accepted:j.accepted_revision===j.revision&&!!j.revision,decision:j.accepted_revision===j.revision?j.decision:null};}
  admitEvidence(id,photos){
    this.job(id);check(Array.isArray(photos)&&photos.length<=10,'At most 10 photos per job');
    const records=[];let total=0;const seen=new Set();
    for(const p of photos){
      check(plainText(p.id,200)&&!seen.has(p.id),'Invalid or duplicate evidence ID');seen.add(p.id);
      check(p.jobId===this.job(id).external_id,'Wrong-job evidence');
      check(['image/png','image/jpeg','image/webp'].includes(p.mime)&&typeof p.dataBase64==='string'&&/^[A-Za-z0-9+/]*={0,2}$/.test(p.dataBase64),'Unsupported evidence encoding');
      const bytes=Buffer.from(p.dataBase64,'base64');total+=bytes.length;
      check(bytes.length>0&&bytes.length<=5000000&&total<=25000000,'Evidence exceeds photo/job limits');
      check(createHash('sha256').update(bytes).digest('hex')===p.sha256,'Evidence digest mismatch');
      const existing=this.db.prepare('SELECT job_id,sha256 FROM evidence WHERE id=?').get(p.id);
      check(!existing||(existing.job_id===id&&existing.sha256===p.sha256),'Evidence identity conflict or wrong job');
      records.push({...p,bytes,status:p.status==='excluded'?'excluded':'included',name:String(p.name||p.id).slice(0,300)});
    }
    const existing=this.db.prepare('SELECT id,length(bytes) AS size FROM evidence WHERE job_id=?').all(id);
    const newRows=records.filter(r=>!existing.some(e=>e.id===r.id));
    check(existing.length+newRows.length<=10&&existing.reduce((n,p)=>n+p.size,0)+newRows.reduce((n,p)=>n+p.bytes.length,0)<=25000000,'Stored evidence exceeds job limits');
    const changed=records.some(p=>{const prior=this.db.prepare('SELECT sha256,status FROM evidence WHERE id=?').get(p.id);return !prior||prior.status!==p.status;});
    this.db.exec('BEGIN IMMEDIATE');
    try{
      const insert=this.db.prepare('INSERT INTO evidence(id,job_id,sha256,mime,name,status,bytes) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status');
      for(const p of records)insert.run(p.id,id,p.sha256,p.mime,p.name,p.status,p.bytes);
      if(changed)this.db.prepare('UPDATE jobs SET candidate=NULL,revision=NULL,confirmation=NULL,queued_revision=NULL,received_revision=NULL,accepted_revision=NULL,decision=NULL WHERE id=?').run(id);
      this.db.exec('COMMIT');
    }catch(e){this.db.exec('ROLLBACK');throw e;}
    return {admitted:records.map(p=>({id:p.id,sha256:p.sha256,status:p.status}))};
  }
  admitAudio(id,clips){
    const job=this.job(id);check(Array.isArray(clips)&&clips.length<=AUDIO_LIMITS.clipsPerJob,'Voice clip count exceeds the bounded job limit');
    const seen=new Set();const records=clips.map(c=>{
      check(plainText(c.id,200)&&!seen.has(c.id)&&c.jobId===job.external_id,'Invalid or wrong-job voice clip');seen.add(c.id);
      check(typeof c.dataBase64==='string'&&/^[A-Za-z0-9+/]*={0,2}$/.test(c.dataBase64),'Invalid voice encoding');
      const bytes=Buffer.from(c.dataBase64,'base64');validateAudioOriginal(c.mime,bytes.length);check(bytes.length>0&&bytes.length<=5000000&&createHash('sha256').update(bytes).digest('hex')===c.sha256,'Voice clip hash or size mismatch');
      let wav=null;if(c.wavBase64){check(typeof c.wavBase64==='string'&&/^[A-Za-z0-9+/]*={0,2}$/.test(c.wavBase64),'Invalid transcription WAV encoding');wav=Buffer.from(c.wavBase64,'base64');inspectWav(wav);check(createHash('sha256').update(wav).digest('hex')===c.wavSha256,'Transcription WAV hash mismatch');}
      const prior=this.db.prepare('SELECT job_id,sha256,wav_sha256 FROM audio_evidence WHERE id=?').get(c.id);
      check(!this.db.prepare('SELECT id FROM evidence WHERE id=?').get(c.id)&&(!prior||(prior.job_id===id&&prior.sha256===c.sha256&&prior.wav_sha256===(wav?c.wavSha256:null))),'Voice identity conflict or wrong job');
      return {...c,bytes,wav,existing:!!prior};
    });
    const count=this.db.prepare('SELECT count(*) AS n FROM audio_evidence WHERE job_id=?').get(id).n;
    check(count+records.filter(c=>!c.existing).length<=AUDIO_LIMITS.clipsPerJob,'Stored voice clip limit reached');
    this.db.exec('BEGIN IMMEDIATE');try{
      const stmt=this.db.prepare('INSERT OR IGNORE INTO audio_evidence(id,job_id,sha256,mime,name,wav_sha256,bytes,wav_bytes) VALUES(?,?,?,?,?,?,?,?)');
      for(const c of records)stmt.run(c.id,id,c.sha256,c.mime,String(c.name||c.id).slice(0,300),c.wav?c.wavSha256:null,c.bytes,c.wav);
      if(records.some(c=>!c.existing))this.db.prepare('UPDATE jobs SET candidate=NULL,revision=NULL,confirmation=NULL,queued_revision=NULL,received_revision=NULL,accepted_revision=NULL,decision=NULL WHERE id=?').run(id);
      this.db.exec('COMMIT');
    }catch(error){this.db.exec('ROLLBACK');throw error;}
    return {admitted:records.map(c=>({id:c.id,sha256:c.sha256}))};
  }
  audio(id,audioId){this.job(id);const clip=this.db.prepare('SELECT * FROM audio_evidence WHERE id=? AND job_id=?').get(audioId,id);check(clip,'Voice clip not available for this job');return clip;}
  syncEvents(id,events){
    const j=this.job(id);check(Array.isArray(events)&&events.length<=500,'Invalid event history');
    check(events.length>=j.events.length&&j.events.every((e,i)=>JSON.stringify(e)===JSON.stringify(events[i])),'Event history conflicts with admitted prefix');
    let state=createInvestigation(j.order);
    for(const e of events) state=reduceInvestigation(state,e);
    for(const s of Object.values(state.sources).filter(s=>s.kind==='audio')){const clip=this.audio(id,s.id);check(clip.sha256===s.sha256&&(!s.wavSha256||clip.wav_sha256===s.wavSha256),'Event voice source hash mismatch');}
    for(const s of Object.values(state.sources).filter(s=>s.kind==='photo')){
      const photo=this.db.prepare('SELECT job_id,sha256 FROM evidence WHERE id=?').get(s.id);
      check(photo?.job_id===id&&photo.sha256===s.sha256,'Event references unadmitted or wrong-job photo');
    }
    if(events.length!==j.events.length)this.db.prepare('UPDATE jobs SET events=?,candidate=NULL,revision=NULL,confirmation=NULL,queued_revision=NULL,received_revision=NULL,accepted_revision=NULL,decision=NULL WHERE id=?').run(JSON.stringify(events),id);
    return {eventRevision:events.length};
  }
  candidate(id,report,expectedEventRevision){
    const j=this.job(id);check(j.events.length===expectedEventRevision,'Stale event revision');
    check(report&&typeof report==='object'&&!Array.isArray(report),'Invalid field report');
    let state=createInvestigation(j.order);for(const e of j.events)state=reduceInvestigation(state,e);
    const review=reviewReport(j.order,report,interviewHandoff(state));
    check((report.interviewRevision??0)===state.seq,'Report does not match saved interview revision');
    for(const entry of Object.values(report.entries||{}))for(const evidenceId of entry.evidenceIds||[]){
      const photo=this.db.prepare('SELECT job_id,status FROM evidence WHERE id=?').get(evidenceId);
      check(photo?.job_id===id&&photo.status==='included'&&!state.sources[evidenceId]?.excluded,'Report references missing/excluded/wrong-job evidence');
    }
    review.findings=review.findings.map(f=>({...f,evidenceIds:report.entries?.[f.id]?.evidenceIds||[]}));
    review.interview=interviewHandoff(state);
    const manifest=this.db.prepare('SELECT id,sha256,mime,name,status,length(bytes) AS bytes FROM evidence WHERE job_id=? ORDER BY id').all(id);
    const audio=this.db.prepare('SELECT id,sha256,mime,name,wav_sha256 AS wavSha256,length(bytes) AS bytes,length(wav_bytes) AS wavBytes FROM audio_evidence WHERE job_id=? ORDER BY id').all(id);
    const mediaRevision=evidenceRevision(manifest,audio);
    check((report.evidenceRevision || evidenceRevision()) === mediaRevision,'Report confirmation does not cover the current original evidence');
    const packet={audio,version:'carryforward.api-closeout.v1',jobId:id,sourceSystem:'local-operations-simulator',assignmentRevision:j.assignment_hash,workOrder:j.order,reportRevision:reportRevision(report),eventRevision:j.events.length,closeout:review,evidence:manifest};
    const revision=digest(packet);
    if(revision!==j.revision)this.db.prepare('UPDATE jobs SET candidate=?,revision=?,confirmation=NULL,queued_revision=NULL,received_revision=NULL,accepted_revision=NULL,decision=NULL WHERE id=?').run(JSON.stringify(packet),revision,id);
    return {...packet,revision};
  }
  confirm(id,input){
    const j=this.job(id);check(j.candidate&&input.revision===j.revision,'Stale closeout revision');
    check(input.reportRevision===j.candidate.reportRevision,'Technician confirmation belongs to another report');
    check(input.name===j.candidate.closeout.technician&&plainText(input.name,200),'Confirming technician differs from report');
    check(typeof input.confirmedAt==='string'&&Number.isFinite(Date.parse(input.confirmedAt)),'Invalid confirmation time');
    const confirmation={name:input.name,confirmedAt:input.confirmedAt,revision:j.revision,statement:'Technician attestation; not authenticated identity or Operations acceptance'};
    if(j.confirmation)check(JSON.stringify(j.confirmation)===JSON.stringify(confirmation),'Conflicting confirmation retry');
    else this.db.prepare('UPDATE jobs SET confirmation=? WHERE id=?').run(JSON.stringify(confirmation),id);
    return confirmation;
  }
  queue(id,revision){const j=this.job(id);check(j.revision===revision&&j.confirmation,'Confirm the exact revision before delivery');this.db.prepare('UPDATE jobs SET queued_revision=? WHERE id=?').run(revision,id);return {jobId:id,revision,status:'queued_for_local_simulator'};}
  evidence(id,evidenceId){this.job(id);const photo=this.db.prepare('SELECT * FROM evidence WHERE id=? AND job_id=?').get(evidenceId,id);check(photo&&photo.status==='included','Evidence not available for this job');return photo;}
  closeout(id){const j=this.job(id);check(j.candidate,'No current closeout');return {...j.candidate,revision:j.revision,confirmation:j.confirmation};}
  inbox(){return this.db.prepare('SELECT id FROM jobs WHERE queued_revision=revision AND revision IS NOT NULL').all().map(row=>{const j=this.job(row.id);return {packet:{...j.candidate,revision:j.revision,confirmation:j.confirmation},status:this.status(j.id)};});}
  receipt(id,revision){const j=this.job(id);check(j.revision===revision&&j.queued_revision===revision,'Stale or undelivered revision');this.db.prepare('UPDATE jobs SET received_revision=? WHERE id=?').run(revision,id);return this.status(id);}
  accept(id,revision){
    const j=this.job(id);check(j.revision===revision&&j.received_revision===revision,'Receipt required for this exact current revision');
    const remaining=j.candidate.closeout.openCount>0||j.candidate.closeout.interview.branches.some(b=>b.state!=='supported')||!!j.candidate.closeout.promises;
    this.db.prepare('UPDATE jobs SET accepted_revision=?,decision=? WHERE id=?').run(revision,remaining?'accepted_with_followups':'accepted_for_review',id);
    return this.status(id);
  }
}
