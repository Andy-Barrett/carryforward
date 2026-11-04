import test from 'node:test';
import assert from 'node:assert/strict';
import { bindNativeReminderEvents } from './public/native-reminder-events.js';

const settle = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function emit(target, detail) { target.dispatchEvent(new CustomEvent('carryforward-reminders', { detail })); }

test('only shop/site open hints trigger fresh revalidation; event scope is never forwarded', async () => {
  const target = new EventTarget(), checks = [], opens = [];
  const context = { principal: { companyId: 'current-company', userId: 'current-user' }, job: { id: 'server-job' } };
  const binding = bindNativeReminderEvents({ windowTarget: target, revalidate: async args => { checks.push(args); return context; }, open: (...args) => opens.push(args) });
  for (const detail of [null, {}, { status: 'armed', reason: 'shop' }, { status: 'open', reason: 'other' }, { status: 'open', reason: ['shop'] }]) emit(target, detail);
  await settle();
  assert.equal(checks.length, 0);
  emit(target, { status: 'open', reason: 'shop', jobId: 'attacker-job', companyId: 'other-company', reminderId: 'stale-id' });
  await settle();
  assert.deepEqual(Object.keys(checks[0]), ['signal']);
  assert.equal(checks[0].signal instanceof AbortSignal, true);
  assert.equal(opens[0][0], context);
  assert.equal(opens[0][1].kind, 'shop');
  assert.equal(opens[0][1].finish, false);
  assert.deepEqual(Object.keys(opens[0][1]).sort(), ['finish', 'kind', 'signal']);
  emit(target, { status: 'open', reason: 'site' });
  await settle();
  assert.equal(checks.length, 2);
  assert.equal(opens[1][1].finish, true);
  binding.dispose();
});

test('no current authorized assignment means no opening or cached fallback', async () => {
  for (const context of [null, undefined, false, true, 'job-from-cache', []]) {
    const target = new EventTarget(); let opens = 0;
    const binding = bindNativeReminderEvents({ windowTarget: target, revalidate: async () => context, open: () => opens++ });
    emit(target, { status: 'open', reason: 'site' });
    await settle();
    assert.equal(opens, 0);
    binding.dispose();
  }
});

test('a new tap invalidates an older pending account/assignment response', async () => {
  const target = new EventTarget(), first = deferred(), second = deferred(), requests = [], opened = [];
  const binding = bindNativeReminderEvents({ windowTarget: target, revalidate: args => { requests.push(args); return requests.length === 1 ? first.promise : second.promise; }, open: context => opened.push(context) });
  emit(target, { status: 'open', reason: 'shop' });
  emit(target, { status: 'open', reason: 'site' });
  assert.equal(requests[0].signal.aborted, true);
  second.resolve({ job: 'current-server-assignment' });
  await settle();
  first.resolve({ job: 'old-server-assignment' });
  await settle();
  assert.deepEqual(opened, [{ job: 'current-server-assignment' }]);
  binding.dispose();
});

test('stop/dispose abort and suppress late success, error and future events', async () => {
  for (const method of ['stop', 'dispose']) {
    const target = new EventTarget(), pending = deferred(); let checks = 0, opens = 0, errors = 0, signal;
    const binding = bindNativeReminderEvents({ windowTarget: target, revalidate: args => { checks++; signal = args.signal; return pending.promise; }, open: () => opens++, onError: () => errors++ });
    emit(target, { status: 'open', reason: 'site' });
    binding[method](); binding[method]();
    assert.equal(signal.aborted, true);
    if (method === 'stop') pending.resolve({ job: 'revoked-after-request' });
    else pending.reject(new Error('old account request failed'));
    emit(target, { status: 'open', reason: 'shop' });
    await settle();
    assert.deepEqual({ checks, opens, errors }, { checks: 1, opens: 0, errors: 0 });
  }
});

test('current validation failure reports an error without opening; reporter failure is contained', async () => {
  const target = new EventTarget(), errors = []; let opens = 0;
  const failure = new Error('session no longer valid');
  const binding = bindNativeReminderEvents({ windowTarget: target, revalidate: async () => { throw failure; }, open: () => opens++, onError: error => { errors.push(error); throw new Error('reporter unavailable'); } });
  emit(target, { status: 'open', reason: 'shop' });
  await settle();
  assert.deepEqual(errors, [failure]);
  assert.equal(opens, 0);
  binding.dispose();
});
