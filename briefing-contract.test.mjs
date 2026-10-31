import test from 'node:test';
import assert from 'node:assert/strict';
import { demoOrder, validateOrder, reviewReport, exportCloseout, BRIEFING_SECTIONS, BRIEFING_LIMITS } from './public/engine.js';
import { OperationsStore } from './lib/operations.mjs';

const legacyOrder = () => { const order = structuredClone(demoOrder); order.id = 'DEMO-WO-1042'; delete order.briefing; return order; };
const note = (id = 'fictional-note', kind = 'context') => ({
  id, text: 'Fictional planning context, not an observed field outcome.', kind,
  source: { id: 'fictional-source', title: 'Fictional briefing record', revision: 'DEMO-1', page: 2 },
});
const orderWith = briefing => ({ ...legacyOrder(), briefing });
const report = { technician: 'Fictional technician', summary: 'Visit not yet performed.', recordedAt: '2026-10-31T10:00:00-05:00', entries: {} };

test('old work orders keep their exact normalized shape without an optional briefing', () => {
  const old = legacyOrder(), validated = validateOrder(old);
  assert.deepEqual(validated, old);
  assert.equal(Object.hasOwn(validated, 'briefing'), false);
  assert.equal(Object.hasOwn(JSON.parse(exportCloseout(old, reviewReport(old, report))).workOrder, 'briefing'), false);
});

test('source-linked fictional briefing survives validation and closeout export without becoming field evidence', () => {
  const order = validateOrder(demoOrder);
  assert.deepEqual(order.briefing, demoOrder.briefing);
  const review = reviewReport(order, report);
  assert.equal(review.openCount, order.checks.length);
  assert.deepEqual(JSON.parse(exportCloseout(order, review)).workOrder.briefing, order.briefing);
  order.briefing.system[0].source.title = 'Changed local copy';
  assert.notEqual(order.briefing.system[0].source.title, demoOrder.briefing.system[0].source.title);
  for (const section of BRIEFING_SECTIONS) {
    assert.ok(demoOrder.briefing[section].every(item => item.source.title.includes('Fictional')));
  }
});

test('briefing permits twenty bounded notes, four per section, with canonical section ordering', () => {
  const briefing = Object.fromEntries(BRIEFING_SECTIONS.slice(0, 5).reverse().map(section => [section,
    Array.from({length:4}, (_, index) => note(`${section}-${index}`)),
  ]));
  briefing.system[0].text = 'x'.repeat(BRIEFING_LIMITS.noteText);
  briefing.system[0].source.page = BRIEFING_LIMITS.sourcePage;
  const order = validateOrder(orderWith(briefing));
  assert.equal(Object.values(order.briefing).flat().length, 20);
  assert.deepEqual(Object.keys(order.briefing), BRIEFING_SECTIONS.slice(0, 5));
  assert.deepEqual(validateOrder(orderWith({})).briefing, {});
  assert.deepEqual(validateOrder(orderWith({access:[]})).briefing, {access:[]});
});

test('briefing refuses malformed containers, excess notes, duplicate IDs and unknown sections', () => {
  const twentyOne = Object.fromEntries(BRIEFING_SECTIONS.map(section => [section,
    Array.from({length:3}, (_, index) => note(`${section}-${index}`, ['safety','ladder'].includes(section) ? 'reference' : 'context')),
  ]));
  for (const briefing of [null, [], 'brief', {access:'gate'}, {weather:[]},
    {system:Array.from({length:5}, (_, index) => note(`n-${index}`))}, twentyOne,
    {system:[note('same'),note('same')]}, {system:[note('same')],access:[note('same')]}]) {
    assert.throws(() => validateOrder(orderWith(briefing)));
  }
});

test('every note needs bounded text, a recognized kind and complete source metadata', () => {
  const invalid = [null, [], {...note(),id:''}, {...note(),id:'i'.repeat(101)},
    {...note(),text:' '}, {...note(),text:'x'.repeat(1501)}, {...note(),kind:'verified'},
    {...note(),source:null}, {...note(),source:{}}, {...note(),source:{...note().source,id:''}},
    {...note(),source:{...note().source,title:'t'.repeat(201)}},
    {...note(),source:{...note().source,revision:'r'.repeat(101)}},
    ...[0,1.5,100001,'2'].map(page => ({...note(),source:{...note().source,page}}))];
  for (const item of invalid) assert.throws(() => validateOrder(orderWith({system:[item]})));
  const noSource = note(); delete noSource.source;
  assert.throws(() => validateOrder(orderWith({access:[noSource]})), /source/);
});

test('imported safety and ladder notes remain unapproved references and reject approval injection', () => {
  for (const section of ['safety','ladder']) {
    for (const kind of ['reported','context','hypothesis']) {
      assert.throws(() => validateOrder(orderWith({[section]:[note('fictional',kind)]})), /unapproved references/);
    }
    const accepted = validateOrder(orderWith({[section]:[note('fictional','reference')]}));
    assert.deepEqual(Object.keys(accepted.briefing[section][0]), ['id','text','kind','source']);
    for (const approval of ['approved','approvedForGuidance','approval','trusted','instructions']) {
      assert.throws(() => validateOrder(orderWith({[section]:[{...note('fictional','reference'),[approval]:true}]})), /unsupported field/);
      assert.throws(() => validateOrder(orderWith({[section]:[{...note('fictional','reference'),source:{...note().source,[approval]:true}}]})), /unsupported field/);
    }
  }
  assert.throws(() => validateOrder(orderWith({system:[note()],approved:true})), /unsupported field/);
});

test('immutable assignment identity includes briefing text and source revisions without silently upgrading old jobs', () => {
  const store = new OperationsStore();
  try {
    const old = store.assign(legacyOrder());
    assert.throws(() => store.assign({...demoOrder,id:old.externalId}), /different scope/);
    assert.equal(Object.hasOwn(store.status(old.jobId).order, 'briefing'), false);
    const fresh = structuredClone(demoOrder);
    const admitted = store.assign(fresh);
    assert.notEqual(admitted.jobId, old.jobId);
    assert.equal(admitted.externalId, 'DEMO-WO-1043');
    assert.deepEqual(admitted.order.briefing, validateOrder(fresh).briefing);
    assert.equal(store.assign(fresh).jobId, admitted.jobId);
    const revisedText = structuredClone(fresh); revisedText.briefing.access[0].text += ' Further fictional clarification.';
    assert.throws(() => store.assign(revisedText), /different scope/);
    const revisedSource = structuredClone(fresh); revisedSource.briefing.system[0].source.revision = 'DEMO-2';
    assert.throws(() => store.assign(revisedSource), /different scope/);
  } finally { store.close(); }
});
