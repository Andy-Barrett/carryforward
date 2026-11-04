import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('./public/app.js', import.meta.url), 'utf8');
const start = source.indexOf('function authScreen() {');
const end = source.indexOf('function setup() {', start);
assert.ok(start >= 0 && end > start);

// Real login callbacks with DOM/I/O doubles. Rendered and native acceptance are
// separate; this checks that private login cannot accidentally submit signup.
function fixture(selfRegistration) {
  const nodes = new Map(), calls = [], signals = [];
  const $ = selector => {
    if (!nodes.has(selector)) nodes.set(selector, { hidden: false });
    return nodes.get(selector);
  };
  let refreshed = 0;
  const context = vm.createContext({
    app: {}, $, selfRegistration,
    run: fn => fn, recoveryRequest() {}, logoutIntent() {},
    accountSignal: { postMessage: value => signals.push(value) },
    refresh: async () => { refreshed++; },
    FormData: class {
      get(key) { return { email: 'fictional-tech@example.test', password: 'fictional-password-2026', name: 'Fictional Technician' }[key]; }
    },
    api: async (path, options) => { calls.push({ path, options }); },
  });
  new vm.Script(source.slice(start, end), { filename: 'actual-pilot-auth-screen.js' }).runInContext(context);
  context.authScreen();
  return { $, calls, signals, get refreshed() { return refreshed; } };
}

test('private profile offers sign-in and submits the existing account without signup', async () => {
  const f = fixture(false);
  assert.equal(f.$('#new-account').hidden, true);
  await f.$('#login').onsubmit();
  assert.equal(f.calls[0].path, '/api/auth/sign-in/email');
  assert.equal(f.calls[0].options.body.email, 'fictional-tech@example.test');
  assert.equal('name' in f.calls[0].options.body, false);
  assert.equal(f.signals[0].kind, 'signed-in');
  assert.equal(f.refreshed, 1);
});

test('local rehearsal retains explicit create-account and existing-account paths', async () => {
  const f = fixture(true);
  assert.equal(f.$('#new-account').hidden, false);
  f.$('#new-account').onclick();
  assert.equal(f.$('#name-label').hidden, false);
  await f.$('#login').onsubmit();
  assert.equal(f.calls[0].path, '/api/auth/sign-up/email');
  assert.equal(f.calls[0].options.body.name, 'Fictional Technician');
  f.$('#new-account').onclick();
  assert.equal(f.$('#name-label').hidden, true);
  await f.$('#login').onsubmit();
  assert.equal(f.calls[1].path, '/api/auth/sign-in/email');
});
