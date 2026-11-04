import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDocumentLibrary } from './documents.mjs';

// Metadata and synthetic equipment only. The copyrighted manufacturer original is intentionally not in Git.
export const SETAPP_MANUAL=Object.freeze({
  title:'Single Phase Inverter with HD-Wave Technology with SetApp Configuration — North America',
  issuer:'SolarEdge',revision:'MAN-01-00541-1.4 · August 2020',mime:'application/pdf',
  sourceUrl:'https://knowledge-center.solaredge.com/sites/kc/files/se_hd_wave_inverter_with_SetApp_installation_guide_na.pdf',
  sha256:'6b88da3b09cba263b89bf7921b7f3e889385fe3a4a303ce0563c23ff45ab82b2',
  applicability:{kind:'manufacturer',manufacturer:'SolarEdge',models:['SE7600H-US'],fullPartNumbers:['SE7600H-US000BNU4'],variant:'SetApp',region:'North America',requiredIdentityFields:['manufacturer','model','fullPartNumber','variant','region'],scopeNote:'Fictional exact-variant fixture only. General guide plus official SetApp-enabled part-number equivalency; company approval is a separate recorded action. No applicability is inferred for the older unresolved demo unit.'},
  partNumberSource:'https://knowledge-center.solaredge.com/sites/kc/files/SetApp-enabled-PN-EquivalencyList-NA.pdf',
  pageChecks:[{pageIndex:7,pdfPage:8,printedLabel:'7',contains:'IMPORTANT SAFETY INSTRUCTIONS'}, {pageIndex:51,pdfPage:52,printedLabel:'51',contains:'Removing the Inverter Cover'}, {pageIndex:60,pdfPage:61,printedLabel:'60',contains:'Verifying the Connection'}],
});
export const MATCHED_EQUIPMENT=Object.freeze({equipmentRef:'synthetic-setapp-inverter-01',manufacturer:'SolarEdge',model:'SE7600H-US',fullPartNumber:'SE7600H-US000BNU4',variant:'SetApp',configuration:'SetApp',region:'North America',serial:'FICTIONAL-SETAPP-0001',identityBasis:'Explicitly specified synthetic equipment fixture; not a real nameplate observation.'});
export const UNRESOLVED_EQUIPMENT=Object.freeze({equipmentRef:'older-unresolved-demo',manufacturer:'SolarEdge',model:'SE7600H-US',fullPartNumber:null,configuration:null,region:'North America',identityBasis:'Historical fictional assignment; full part and LCD versus SetApp remain unverified.'});
export async function manufacturerFixtureUpload(manualPath) {
  const bytes=await readFile(manualPath),sha256=createHash('sha256').update(bytes).digest('hex');
  if(sha256!==SETAPP_MANUAL.sha256)throw new Error('Manufacturer fixture hash differs from the inspected revision. Inspect and pin it deliberately before use.');
  const {pageChecks,partNumberSource,sha256:expectedHash,...input}=SETAPP_MANUAL;
  return {...input,bytes};
}
export async function registerManufacturerFixture({library,companyId,actor,manualPath,approve=false}) {
  const version=await library.upload(companyId,actor,await manufacturerFixtureUpload(manualPath));
  if(version.processing.status!=='ready')throw new Error(`Manufacturer fixture extraction is ${version.processing.status}.`);
  for(const expected of SETAPP_MANUAL.pageChecks) {
    const page=library.getPages(companyId,version.versionId,{pageIndices:[expected.pageIndex]})[0];
    if(!page||page.pdfPage!==expected.pdfPage||page.printedLabel!==expected.printedLabel||!page.text.includes(expected.contains))throw new Error('Manufacturer source page/revision verification failed.');
  }
  return approve?library.approve(companyId,actor,version.versionId):version;
}
// Explicit local fixture registration only. Never fetches a URL and never touches the contest database.
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const manualPath=process.argv[2],target=process.argv[3];
  if(!manualPath||!target)throw new Error('Usage: node pilot/manual-fixture.mjs <downloaded official PDF> <new ignored destination directory>');
  const destination=resolve(target);await mkdir(destination,{recursive:true,mode:0o700});
  const library=createDocumentLibrary({databasePath:resolve(destination,'documents.sqlite'),storageDir:resolve(destination,'originals')});
  const companyId='fictional-manual-company',actor={id:'fictional-manual-admin',companyId,role:'admin'};
  const version=await registerManufacturerFixture({library,companyId,actor,manualPath,approve:true});
  const base={references:[{versionId:version.versionId}],equipment:[MATCHED_EQUIPMENT]};
  const status=library.retrieve(companyId,{...base,query:'Where is S_OK shown under Server Comm in Status?'});
  const recall=library.retrieve(companyId,{...base,query:'Show that page again',previousCitation:status.lastCitation});
  const warning=library.retrieve(companyId,{...base,query:'What was the warning before removing the inverter cover?'});
  const missingVariant=library.retrieve(companyId,{...base,equipment:[UNRESOLVED_EQUIPMENT],query:'Where is the status setting?'});
  const unsupported=library.retrieve(companyId,{...base,query:'Where is quantumflux antiwarp?'});
  const receipt={recordedAt:new Date().toISOString(),actualManufacturerBytes:true,providersCalled:false,source:SETAPP_MANUAL.sourceUrl,sha256:SETAPP_MANUAL.sha256,pageCount:version.processing.pageCount,versionId:version.versionId,equipment:MATCHED_EQUIPMENT,
    checks:{statusFound:status.status==='found'&&status.citations.some(x=>x.pageIndex===60),recallSamePage:recall.lastCitation?.pageIndex===status.lastCitation?.pageIndex,coverWarningComplete:warning.status==='found'&&warning.excerpts.some(x=>x.text.includes('qualified service personnel')&&x.text.includes('Wait five minutes')),missingVariantBlocked:missingVariant.code==='equipment_identity_required',unsupportedSettingBlocked:unsupported.code==='unsupported_question'},
    status,recall,warning,missingVariant,unsupported};
  const output=resolve(destination,'manual-retrieval.private.json');await writeFile(output,JSON.stringify(receipt,null,2),{flag:'wx',mode:0o600});library.close();
  console.log(JSON.stringify({receipt:output,sourceHash:SETAPP_MANUAL.sha256,pageCount:receipt.pageCount,checks:receipt.checks},null,2));
  if(!Object.values(receipt.checks).every(Boolean))process.exitCode=1;
}
