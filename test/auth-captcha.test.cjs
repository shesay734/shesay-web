const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '../auth.html'), 'utf8');

function setup({width = 380, fail = false, pending = false} = {}) {
  const elements = new Map();
  for (const [, id] of html.matchAll(/id="([^"]+)"/g)) {
    const classes = new Set();
    elements.set(id, {value: '', clientWidth: width, classList: {
      toggle(n, v) { v ? classes.add(n) : classes.delete(n); },
      add(n) { classes.add(n); }, remove(n) { classes.delete(n); },
      contains(n) { return classes.has(n); },
    }});
  }
  let config, settle;
  const calls = [], renders = [], resets = [], timers = [];
  const window = {turnstile: {
    render(selector, value) { config = value; renders.push(value); return 'widget'; },
    reset(id) { resets.push(id); },
  }};
  const request = async args => {
    calls.push(args);
    if (pending) await new Promise(resolve => { settle = resolve; });
    return fail ? {error: new Error('Request failed')} : {};
  };
  // auth-guard: the first successful request returns a human pass.
  let pass = null;
  const codeRequests = [];
  const sendCode = async args => {
    codeRequests.push(args);
    if (fail) throw Object.assign(new Error('Request failed'), {code: 'send_failed'});
    pass = {pass: 'human-pass', expiresAt: Infinity};
    return {ok: true};
  };
  const context = vm.createContext({
    document: {getElementById: id => elements.get(id)}, window,
    URLSearchParams, setTimeout(fn) { timers.push(fn); }, history: {replaceState() {}},
    location: {search: '', hash: '', replace() {}},
    SheSay: {
      client: {auth: {signInWithPassword: request}},
      sendCode, humanPass: () => pass,
    },
  });
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], context);
  const get = id => elements.get(id);
  get('email').value = 'fixture@example.invalid';
  get('password').value = 'test-only';
  // Turnstile's script calls the onload hook once it is ready.
  context.window.renderCaptcha();
  const verify = token => { config.callback(token); };
  const tick = () => timers.shift()();
  return {context, window, get, calls, codeRequests, renders, resets, verify, tick,
    config: () => config, settle: () => settle()};
}

test('Cloudflare widget renders directly, with no extra button, and never refreshes on its own', () => {
  const s = setup();
  assert.equal(s.get('verifyHuman'), undefined);
  assert.equal(s.renders.length, 1);
  assert.equal(s.config().sitekey, '0x4AAAAAAFiIwYxQwNiepNxZ');
  assert.equal(s.config().size, 'flexible');
  assert.equal(s.config()['refresh-expired'], 'manual');
  assert.equal(s.config()['refresh-timeout'], 'manual');
  assert.equal(s.get('sendCode').disabled, true);
  assert.equal(s.get('submit').disabled, true);
  s.context.window.renderCaptcha();
  assert.equal(s.renders.length, 1);
});

test('send code is enabled only after the check passes, and switching mode keeps it', () => {
  const s = setup();
  s.get('otpLoginTab').onclick();
  assert.equal(s.get('sendCode').disabled, true);
  s.verify('fresh-token');
  assert.equal(s.get('sendCode').disabled, false);
  s.get('registerTab').onclick();
  s.get('otpLoginTab').onclick();
  assert.equal(s.get('sendCode').disabled, false);
  assert.equal(s.resets.length, 0);
});

for (const callback of ['expired-callback', 'timeout-callback']) {
  test(`${callback} keeps the widget for a manual refresh and blocks authentication`, async () => {
    const s = setup();
    s.verify('old-token');
    s.config()[callback]();
    assert.equal(s.resets.length, 0);
    assert.equal(s.get('submit').disabled, true);
    await s.get('form').onsubmit({preventDefault() {}});
    assert.equal(s.calls.length, 0);
    assert.match(s.get('notice').textContent, /Complete the human verification/);
  });
}

test('a sent code keeps the check verified and resends without asking again', async () => {
  const s = setup();
  s.get('otpLoginTab').onclick();
  s.verify('fresh-token');
  await s.get('sendCode').onclick();
  assert.equal(s.codeRequests[0].captchaToken, 'fresh-token');
  assert.equal(s.codeRequests[0].purpose, 'login');
  assert.equal(s.get('captchaArea').classList.contains('hidden'), false);
  assert.equal(s.get('captchaVerified').classList.contains('hidden'), false);
  assert.equal(s.get('captcha').classList.contains('hidden'), true);
  assert.equal(s.resets.length, 0);
  assert.equal(s.get('sendCode').disabled, true);
  assert.match(s.get('sendCode').textContent, /Resend in 60s/);
  for (let i = 0; i < 60; i++) s.tick();
  assert.equal(s.get('sendCode').textContent, 'Send code');
  assert.equal(s.get('sendCode').disabled, false);
  await s.get('sendCode').onclick();
  assert.equal(s.codeRequests.length, 2);
  assert.equal(s.codeRequests[1].captchaToken, '');
  assert.equal(s.resets.length, 0);
});

test('password sign-in after a code request gets a fresh check', async () => {
  const s = setup();
  s.get('otpLoginTab').onclick();
  s.verify('fresh-token');
  await s.get('sendCode').onclick();
  s.get('passwordLoginTab').onclick();
  assert.deepEqual(s.resets, ['widget']);
  assert.equal(s.get('captcha').classList.contains('hidden'), false);
  assert.equal(s.get('submit').disabled, true);
});

test('a failed send needs a new check because the token was used', async () => {
  const s = setup({fail: true});
  s.get('otpLoginTab').onclick();
  s.verify('fresh-token');
  await s.get('sendCode').onclick();
  assert.equal(s.codeRequests.length, 1);
  assert.equal(s.get('captchaArea').classList.contains('hidden'), false);
  assert.deepEqual(s.resets, ['widget']);
  assert.equal(s.get('sendCode').disabled, true);
});

test('a pending password request consumes its token before another action can reuse it', async () => {
  const s = setup({pending: true});
  s.verify('fresh-token');
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
  s.window.onTurnstileLoadError();
  assert.match(s.get('notice').textContent, /reload this page/);
  assert.equal(s.calls.length, 0);
});
