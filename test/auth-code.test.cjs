const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require('node:path').join(__dirname, '../auth.html'), 'utf8');
test('password/code switch sends and verifies OTP through existing auth methods', async () => {
  const elements = new Map();
  for (const [, id] of html.matchAll(/id="([^"]+)"/g)) {
    const classes = new Set();
    elements.set(id, {value: '', classList: {
      toggle(n, v) { v ? classes.add(n) : classes.delete(n); },
      add(n) { classes.add(n); }, remove(n) { classes.delete(n); },
      contains(n) { return classes.has(n); },
    }});
  }
  const calls = [];
  let destination;
  const context = vm.createContext({
    document: {getElementById: id => elements.get(id)},
    window: {}, URLSearchParams, setTimeout() {}, history: {replaceState() {}},
    location: {search: '?next=/post.html?id=post', hash: '', replace(v) { destination = v; }},
    SheSay: {client: {auth: {
      async signInWithOtp(args) { calls.push(['send', args]); return {}; },
      async verifyOtp(args) { calls.push(['verify', args]); return {}; },
    }}},
  });
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], context);
  const get = id => elements.get(id);
  assert.equal(get('passwordField').classList.contains('hidden'), false);
  get('otpLoginTab').onclick();
  assert.equal(get('passwordField').classList.contains('hidden'), true);
  assert.equal(get('verifyFields').classList.contains('hidden'), false);
  assert.equal(get('registrationNote').classList.contains('hidden'), true);
  get('email').value = 'reader@example.com';
  vm.runInContext("captchaToken = 'test-captcha'", context);
  await get('sendCode').onclick();
  assert.equal(calls[0][0], 'send');
  assert.equal(calls[0][1].email, 'reader@example.com');
  get('code').value = '123456';
  await get('form').onsubmit({preventDefault() {}});
  assert.equal(calls[1][0], 'verify');
  assert.equal(calls[1][1].token, '123456');
  assert.equal(destination, '/post.html?id=post');
  get('passwordLoginTab').onclick();
  assert.equal(get('passwordField').classList.contains('hidden'), false);
  assert.equal(get('verifyFields').classList.contains('hidden'), true);
});
