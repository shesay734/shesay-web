const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../post.html'), 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
async function sharedPost(row) {
  const classes = new Set(['hidden']);
  const elements = new Map();
  const button = {dataset: {scope: 'post', contentId: row.id}, disabled: false};
  const calls = [];
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, {innerHTML: '', textContent: '', appendChild() {}, focus() {}, classList: {
        toggle(name, force) { force ? classes.add(name) : classes.delete(name); },
        remove(name) { classes.delete(name); },
      }});
      return elements.get(id);
    },
    querySelectorAll: () => [button],
    createElement() { return {textContent: '', get innerHTML() { return this.textContent.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'); }}; },
  };
  vm.runInNewContext(source, {document, location: {search: '?id=post', pathname: '/post.html'}, URLSearchParams,
    setTimeout, crypto: require('node:crypto').webcrypto,
    SheSay: {client: {auth: {getSession: async () => ({data: {session: null}}), onAuthStateChange() {}},
      rpc: async (name, args) => {calls.push({name, args}); return {data: row};}}},
  });
  await new Promise(resolve => setImmediate(resolve));
  return {elements, button, calls, classes};
}
test('anonymous paid body displays its subscription price and the login card', async () => {
  const page = await sharedPost({id: 'post', title: '付费帖', locked: true, scope: 'post', price: 3.5});
  assert.match(page.elements.get('post').innerHTML, /Subscribe to post.*Price: \$3.50/s);
  assert.equal(page.classes.has('hidden'), false);
  await page.button.onclick();
  assert.match(page.elements.get('notice').textContent, /请先登录/);
  assert.deepEqual(page.calls.map(c => c.name), ['get_shared_post']);
});
test('updates-only pricing appears below the readable free body', async () => {
  const page = await sharedPost({id: 'post', title: '追编帖', content: '免费正文', locked: false,
    updates: [{id:'update', created_at:'2026-09-11T00:00:00Z', locked:true, scope:'update', price:2}]});
  assert.match(page.elements.get('post').innerHTML, /免费正文.*Later updates.*Subscribe to update.*Price: \$2.00/s);
});
const openSource = fs.readFileSync(path.join(__dirname, '../open-app.js'), 'utf8');
for (const appOpened of [false, true]) test(`app fallback ${appOpened ? 'cancels when app opens' : 'navigates to download homepage'}`, () => {
  const events = new Map(); let timer; let destination; let cancelled = false;
  const document = {hidden:false, addEventListener:(name,fn)=>events.set(name,fn), removeEventListener:(name)=>events.delete(name)};
  const location = {assign:value=>destination=value};
  vm.runInNewContext(openSource,{document,location,window:{addEventListener(){},removeEventListener(){}},
    setTimeout:fn=>{timer=fn;return 1;},clearTimeout:()=>{cancelled=true;}});
  events.get('click')({preventDefault(){},target:{closest:()=>({href:'shesay://post?id=post'})}});
  assert.equal(location.href, 'shesay://post?id=post');
  if (appOpened) { document.hidden = true; events.get('visibilitychange')(); }
  if (!cancelled) timer();
  assert.equal(destination, appOpened ? undefined : 'index.html');
});

const authSource = fs.readFileSync(path.join(__dirname, '../auth.html'), 'utf8');
test('login form exposes password/code switch and code send control', () => {
  assert.match(authSource, /id="passwordLoginTab"/);
  assert.match(authSource, /id="sendCode"/);
  assert.match(authSource, /signInWithOtp/);
  assert.match(authSource, /signInWithPassword/);
});
