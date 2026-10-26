const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '../auth.html'), 'utf8');

function setup({width = 380, fail = false, pending = false} = {}) {
  const elements = new Map();
  for (const [, id] of html.matchAll(/id="([^"]+)"/g)) {
    elements.set(id, {value: '', clientWidth: width, classList: {
      toggle() {}, add() {}, remove() {},
    }});
  }
  let config, resize, settle;
  const calls = [], resets = [], removals = [];
  const window = {turnstile: {
    render(selector, value) { config = value; return 'widget'; },
    reset(id) { resets.push(id); },
    remove(id) { removals.push(id); },
  }, ResizeObserver: true};
  const request = async args => {
    calls.push(args);
    if (pending) await new Promise(resolve => { settle = resolve; });
    return fail ? {error: new Error('Request failed')} : {};
  };
  const context = vm.createContext({
    document: {getElementById: id => elements.get(id)}, window,
    ResizeObserver: class { constructor(callback) { resize = callback; } observe() {} },
    URLSearchParams, setTimeout() {}, history: {replaceState() {}},
    location: {search: '', hash: '', replace() {}},
    SheSay: {client: {auth: {signInWithOtp: request, signInWithPassword: request}}},
  });
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], context);
  window.onTurnstileLoaded();
  const get = id => elements.get(id);
  get('email').value = 'fixture@example.invalid';
  get('password').value = 'test-only';
  return {context, window, get, calls, resets, removals, resize,
    config: () => config, settle: () => settle()};
}

test('loads Turnstile once and replaces its widget when the form becomes narrow', () => {
  const s = setup();
  assert.equal(s.config().sitekey, '0x4AAAAAAFiIwYxQwNiepNxZ');
  assert.equal(s.config().size, 'normal');
  s.config().callback('old-token');
  s.get('captcha').clientWidth = 220;
  s.resize();
  assert.deepEqual(s.removals, ['widget']);
  assert.equal(s.config().size, 'compact');
  assert.equal(vm.runInContext('captchaToken', s.context), '');
  s.resize();
  s.window.onTurnstileLoaded();
  assert.equal(s.removals.length, 1);
});

for (const callback of ['expired-callback', 'timeout-callback', 'error-callback']) {
  test(`${callback} invalidates the token and blocks authentication`, async () => {
    const s = setup();
    s.config().callback('old-token');
    s.config()[callback]();
    await s.get('form').onsubmit({preventDefault() {}});
    assert.equal(s.calls.length, 0);
    assert.match(s.get('notice').textContent, /Complete the human verification/);
  });
}

for (const fail of [false, true]) {
  test(`email-code attempt resets the widget after ${fail ? 'failure' : 'success'} and forbids token reuse`, async () => {
    const s = setup({fail});
    s.get('otpLoginTab').onclick();
    s.config().callback('fresh-token');
    await s.get('sendCode').onclick();
    assert.equal(s.calls[0].options.captchaToken, 'fresh-token');
    assert.equal(s.resets.length, 2); // Mode change, then completed request.
    await s.get('sendCode').onclick();
    assert.equal(s.calls.length, 1);
    assert.match(s.get('notice').textContent, /Complete the human verification/);
  });
}

test('a pending password request consumes its token before another action can reuse it', async () => {
  const s = setup({pending: true});
  s.config().callback('fresh-token');
  const first = s.get('form').onsubmit({preventDefault() {}});
  await s.get('sendCode').onclick();
  assert.equal(s.calls.length, 1);
  assert.equal(s.calls[0].options.captchaToken, 'fresh-token');
  s.settle();
  await first;
  assert.deepEqual(s.resets, ['widget']);
});

test('script load failure reports a recoverable error without submitting credentials', () => {
  const s = setup();
  s.config().callback('old-token');
  s.window.onTurnstileLoadError();
  assert.equal(vm.runInContext('captchaToken', s.context), '');
  assert.match(s.get('notice').textContent, /reload this page/);
  assert.equal(s.calls.length, 0);
});
