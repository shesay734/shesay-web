// =============================================================================
// Open-App fallback path — real JS execution tests (Requirement 22 zone A)
// -----------------------------------------------------------------------------
// What is REAL:
//   The actual inline <script> of each share page (post.html / publication.html
//   / tea-room.html) is extracted from the live repo files and EXECUTED in a
//   Node vm. Real functions/closures run; real addEventListener /
//   removeEventListener registration and dispatch happen for click,
//   visibilitychange and pagehide; real setTimeout/clearTimeout calls are made
//   through a controllable fake clock.
// What is STUBBED (declared honestly — this is NOT a browser):
//   - DOM nodes are lightweight objects (innerHTML is not parsed into a tree)
//   - network (Supabase client / fetch) is stubbed; pages never hit the network
//   - timers are a fake clock advanced manually
//   - navigator.userAgent is configurable (Android / iOS / desktop)
// The tests therefore prove the page JS executes the intended control flow:
//   navigation targets, timer cancellation, duplicate-click guarding and the
//   platform branches. They do NOT replace real-device verification.
// -----------------------------------------------------------------------------
// Run:
//   node --test test/openapp-fallback.test.cjs   (this file alone)
//   node --test                                  (from repo root: whole suite,
//                                                  incl. existing wallet tests)
// NOTE: `node --test test/` (directory argument) is NOT valid on Node 24 — the
// directory is treated as an entry module; run files explicitly instead.
// =============================================================================
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const REPO = path.join(__dirname, '..');

// --- platform user agents -----------------------------------------------------
const UA = {
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36',
  ios: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
  desktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
};

// --- fake clock ---------------------------------------------------------------
// Controllable setTimeout/clearTimeout. Every timer the page schedules is
// recorded; activeCount() counts timers that are neither cancelled nor fired.
function createTimers() {
  const pending = new Map();
  let nextId = 1;
  let now = 0;
  return {
    pending, now,
    setTimeout(fn, ms = 0) {
      const id = nextId++;
      pending.set(id, { fn, at: now + ms, cancelled: false, fired: false });
      return id;
    },
    clearTimeout(id) {
      const t = pending.get(id);
      if (t) t.cancelled = true;
    },
    advance(ms) {
      const target = now + ms;
      for (;;) {
        let best = null;
        for (const [id, t] of pending) {
          if (t.cancelled || t.fired || t.at > target) continue;
          if (!best || t.at < best.t.at) best = { id, t };
        }
        if (!best) break;
        best.t.fired = true;
        now = Math.max(now, best.t.at);
        best.t.fn();
      }
      now = target;
    },
    activeCount() {
      let n = 0;
      for (const t of pending.values()) if (!t.cancelled && !t.fired) n++;
      return n;
    },
  };
}

// --- DOM stub -----------------------------------------------------------------
function createDom({ userAgent }) {
  const elements = new Map();
  const registry = { document: new Map(), window: new Map() };
  const state = {
    hidden: false,
    visibilityState: 'visible',
    title: '',
    nav: [], // { kind: 'href' | 'assign', url }
  };
  const documentEl = null; // placeholder

  function makeElement(id) {
    const classes = new Set();
    const handlers = new Map();
    const cache = new Map();
    let innerHTML = '';
    const el = {
      id,
      tagName: 'DIV',
      className: '',
      textContent: '',
      value: '',
      href: '',
      style: {},
      dataset: {},
      disabled: false,
      hidden: false,
      children: [],
      onclick: null,
      classList: {
        add(n) { classes.add(n); },
        remove(n) { classes.delete(n); },
        toggle(n, force) { force ? classes.add(n) : classes.delete(n); },
        contains(n) { return classes.has(n); },
      },
      appendChild(child) {
        this.children.push(child);
        if (child && child.id) elements.set(child.id, child);
        if (child && child.textContent) this.textContent += child.textContent;
      },
      append(...nodes) { for (const n of nodes) this.appendChild(n); },
      replaceChildren() { this.children = []; },
      addEventListener(type, fn) {
        if (!handlers.has(type)) handlers.set(type, new Set());
        handlers.get(type).add(fn);
      },
      removeEventListener(type, fn) {
        const s = handlers.get(type);
        if (s) s.delete(fn);
      },
      dispatchEvent(type, event) {
        const s = handlers.get(type);
        if (s) for (const fn of [...s]) fn(event);
      },
      listenerCount(type) {
        const s = handlers.get(type);
        return s ? s.size : 0;
      },
      querySelector(sel) {
        if (cache.has(sel)) return cache.get(sel);
        if (sel === '.open-app') {
          // publication.html binds the fallback to a class-based anchor whose
          // href lives in the unparsed innerHTML string; expose a synthetic
          // element carrying that href.
          const m = /<a[^>]*class="[^"]*\bopen-app\b[^"]*"[^>]*href="([^"]*)"/.exec(innerHTML);
          const link = makeElement('__open-app-synthetic');
          link.href = m ? m[1] : '';
          cache.set(sel, link);
          return link;
        }
        const idm = /^#([A-Za-z0-9_-]+)$/.exec(sel);
        if (idm) return elements.get(idm[1]) || null;
        return null;
      },
      querySelectorAll() { return []; },
    };
    Object.defineProperty(el, 'innerHTML', {
      get: () => innerHTML,
      set(v) {
        innerHTML = v;
        // Discover id=... elements referenced by the rendered markup so
        // getElementById() returns the same node the page script binds to.
        const idRe = /\bid="([A-Za-z0-9_-]+)"/g;
        let m;
        while ((m = idRe.exec(v))) {
          if (!elements.has(m[1])) elements.set(m[1], makeElement(m[1]));
        }
      },
    });
    return el;
  }

  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, makeElement(id));
      return elements.get(id);
    },
    createElement(tag) { return makeElement('created-' + (Math.random() * 1e9 | 0)); },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener(type, fn) {
      if (!registry.document.has(type)) registry.document.set(type, new Set());
      registry.document.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      const s = registry.document.get(type);
      if (s) s.delete(fn);
    },
    dispatchEvent(type, event) {
      const s = registry.document.get(type);
      if (s) for (const fn of [...s]) fn(event);
    },
    listenerCount(type) {
      const s = registry.document.get(type);
      return s ? s.size : 0;
    },
  };
  Object.defineProperties(document, {
    hidden: { get: () => state.hidden, set: v => { state.hidden = v; } },
    visibilityState: { get: () => state.visibilityState, set: v => { state.visibilityState = v; } },
    title: { get: () => state.title, set: v => { state.title = v; } },
  });

  const window = {
    addEventListener(type, fn) {
      if (!registry.window.has(type)) registry.window.set(type, new Set());
      registry.window.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      const s = registry.window.get(type);
      if (s) s.delete(fn);
    },
    dispatchEvent(type, event) {
      const s = registry.window.get(type);
      if (s) for (const fn of [...s]) fn(event);
    },
    listenerCount(type) {
      const s = registry.window.get(type);
      return s ? s.size : 0;
    },
  };

  const location = {
    pathname: '/post.html',
    search: '?id=p1',
    get href() {
      return state.nav.length ? state.nav[state.nav.length - 1].url : 'https://xn--1uss88i.com/post.html';
    },
    set href(url) { state.nav.push({ kind: 'href', url }); },
    assign(url) { state.nav.push({ kind: 'assign', url }); },
    replace() {},
  };

  return { elements, document, window, location, state, registry };
}

// --- page script extraction ----------------------------------------------------
function extractPageScript(file) {
  const html = fs.readFileSync(path.join(REPO, file), 'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  assert.ok(scripts.length > 0, `${file} must contain an inline <script>`);
  const source = scripts[scripts.length - 1];
  assert.ok(source.includes('function launchApp'), `${file}: page script must define launchApp()`);
  return source;
}

// --- mutations used by the failure-injection tests -----------------------------
// Each mutation simulates a real regression. The mutation helpers assert the
// target code is actually present, so a mutation that "silently" changes
// nothing fails the test (keeps the injection honest).
function applyMutation(source, { label, from, to }) {
  const froms = Array.isArray(from) ? from : [from];
  const tos = Array.isArray(to) ? to : [to];
  assert.equal(froms.length, tos.length, `mutation "${label}" from/to length mismatch`);
  let out = source;
  for (let i = 0; i < froms.length; i++) {
    assert.ok(out.includes(froms[i]), `mutation "${label}": expected code not found in page script`);
    out = out.replace(froms[i], tos[i]);
  }
  return out;
}

const MUTATIONS = {
  'no-fallback-assign': {
    label: 'fallback navigation removed',
    from: 'if (stillVisible) location.assign(APP_HOME);',
    to: '/* injected: fallback navigation removed */',
  },
  'no-cancel-on-hidden': {
    label: 'cancel-on-hidden removed',
    from: 'const onVisibility = () => { if (document.hidden) cancel(); };',
    to: 'const onVisibility = () => { /* injected: no cancel */ };',
  },
  'no-hidden-protection': {
    label: 'hidden protection removed (cancel + stillVisible check)',
    from: [
      'const onVisibility = () => { if (document.hidden) cancel(); };',
      'if (stillVisible) location.assign(APP_HOME);',
    ],
    to: [
      'const onVisibility = () => { /* injected: no cancel */ };',
      'location.assign(APP_HOME);',
    ],
  },
  'no-pagehide-cancel': {
    label: 'pagehide listener removed',
    from: "window.addEventListener('pagehide', cancel);",
    to: "/* injected: no pagehide listener */",
  },
  'no-repeat-guard': {
    label: 'duplicate-click guard removed',
    from: 'if (!deepLink || openAppPending) return;',
    to: 'if (!deepLink) return;',
  },
  'no-android-intent': {
    label: 'Android intent:// URI broken',
    from: "location.href = deepLink.replace(/^shesay:\\/\\//, 'intent://') +",
    to: "location.href = deepLink +",
  },
  'no-visibility-listener': {
    label: 'visibilitychange listener not registered',
    from: "document.addEventListener('visibilitychange', onVisibility);",
    to: "/* injected: no visibilitychange listener */",
  },
};

function buildPage(pageName, { ua = UA.desktop, mutation = null } = {}) {
  const file = { post: 'post.html', publication: 'publication.html', 'tea-room': 'tea-room.html' }[pageName];
  assert.ok(file, `unknown page ${pageName}`);
  let source = extractPageScript(file);
  if (mutation) {
    const m = MUTATIONS[mutation];
    assert.ok(m, `unknown mutation ${mutation}`);
    source = applyMutation(source, m);
  }
  const timers = createTimers();
  const dom = createDom({ userAgent: ua });
  const { document, window, location } = dom;

  const rpcRow = {
    post: { id: 'p1', title: 'Shared post', author_name: 'Tester', content: 'Hello', locked: false },
    publication: { id: 'pub1', title: 'Shared publication', author_name: 'Tester', synopsis: 'Synopsis', tags: [], cover_image_url: '', locked: false },
    'tea-room': { id: 'room1', name: '测试茶室', announcement: '欢迎', background_image_url: '', avatar_url: '' },
  };

  const client = {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ unsubscribe() {} }),
    },
    rpc: async (name) => {
      if (name === 'get_shared_post') return { data: rpcRow.post, error: null };
      if (name === 'get_shared_publication') return { data: rpcRow.publication, error: null };
      return { data: null, error: { message: 'unexpected rpc' } };
    },
  };

  const sandbox = {
    document,
    window,
    location,
    navigator: { userAgent: ua },
    console,
    setTimeout: timers.setTimeout.bind(timers),
    clearTimeout: timers.clearTimeout.bind(timers),
    URLSearchParams,
    URL,
    crypto: require('node:crypto'),
    SheSay: { client },
    fetch: async () => ({ ok: true, json: async () => [rpcRow['tea-room']] }),
  };
  vm.runInNewContext(source, sandbox, { filename: file });

  return { pageName, file, dom, timers, location, document, window, source };
}

// flush pending microtasks (page load() chains, tea-room fetch .then)
async function settle() {
  for (let i = 0; i < 5; i++) await new Promise(r => setImmediate(r));
}

// --- entry clicking -------------------------------------------------------------
function clickOpenApp(page) {
  const { dom } = page;
  if (page.pageName === 'post') {
    const btn = dom.elements.get('openInApp');
    assert.ok(btn && typeof btn.onclick === 'function', 'post: #openInApp onclick must be bound');
    btn.onclick();
  } else if (page.pageName === 'publication') {
    const el = dom.elements.get('publication');
    const link = el.querySelector('.open-app');
    assert.ok(link && typeof link.onclick === 'function', 'publication: .open-app onclick must be bound');
    link.onclick({ preventDefault() {} });
  } else if (page.pageName === 'tea-room') {
    const el = dom.elements.get('openApp');
    assert.ok(el, 'tea-room: #openApp must exist');
    el.dispatchEvent('click', { preventDefault() {} });
  }
}

// --- page constants read from the executed script ------------------------------
function appHomeOf(page) {
  const m = /const APP_HOME = '([^']+)'/.exec(page.source);
  assert.ok(m, `${page.file}: APP_HOME constant must exist`);
  return m[1];
}

function customSchemeNav(page) {
  return page.dom.state.nav.filter(n => n.kind === 'href' && n.url.startsWith('shesay://'));
}
function homeNavs(page) {
  return page.dom.state.nav.filter(n => n.kind === 'assign' && n.url === appHomeOf(page));
}

// =============================================================================
// S1 — Android: intent:// + S.browser_fallback_url, no JS fallback timer
// =============================================================================
for (const pageName of ['post', 'publication', 'tea-room']) {
  test(`S1 ${pageName} [Android] click launches intent:// with S.browser_fallback_url`, async () => {
    const page = buildPage(pageName, { ua: UA.android });
    await settle();
    clickOpenApp(page);
    const nav = page.dom.state.nav;
    assert.equal(nav.length, 1, 'exactly one navigation on first click');
    assert.equal(nav[0].kind, 'href');
    const expected = nav[0].url;
    assert.ok(expected.startsWith('intent://'), `Android must navigate to an intent:// URI, got: ${expected}`);
    assert.ok(expected.includes(';scheme=shesay;'), 'intent must carry scheme=shesay');
    assert.ok(expected.includes('action=android.intent.action.VIEW'), 'intent must carry VIEW action');
    assert.ok(expected.includes('category=android.intent.category.BROWSABLE'), 'intent must be BROWSABLE');
    assert.ok(expected.includes('S.browser_fallback_url=' + encodeURIComponent(appHomeOf(page))), 'intent must carry browser_fallback_url to the official homepage');
    assert.ok(expected.endsWith(';end'), 'intent URI must end with ;end');
    // The page JS performs the fallback itself ONLY for non-Android; on Android
    // the browser resolver handles it, so no 1500ms fallback timer may exist.
    assert.equal(page.timers.activeCount(), 1, 'only the 250ms pending-guard reset timer may exist');
  });

  test(`S1 ${pageName} [Android] not installed / page stays visible -> no homepage navigation ever`, async () => {
    const page = buildPage(pageName, { ua: UA.android });
    await settle();
    clickOpenApp(page);
    assert.equal(homeNavs(page).length, 0, 'no homepage navigation before timeout');
    page.timers.advance(2000);
    assert.equal(homeNavs(page).length, 0, 'Android must NOT fall back via JS timer after 2s');
    assert.equal(page.dom.state.nav.length, 1, 'still exactly the single intent navigation');
  });

  test(`S1 ${pageName} [Android] hidden/pagehide never causes a redirect`, async () => {
    const page = buildPage(pageName, { ua: UA.android });
    await settle();
    clickOpenApp(page);
    page.document.hidden = true;
    page.document.visibilityState = 'hidden';
    page.document.dispatchEvent('visibilitychange');
    page.window.dispatchEvent('pagehide');
    page.timers.advance(2000);
    assert.equal(homeNavs(page).length, 0, 'no homepage navigation after hidden/pagehide');
  });
}

// =============================================================================
// S2 — not installed, non-Android: page stays visible -> 1500ms fallback to
//      the official homepage
// =============================================================================
for (const pageName of ['post', 'publication', 'tea-room']) {
  for (const uaName of ['ios', 'desktop']) {
    test(`S2 ${pageName} [${uaName}] not installed, still visible -> fallback assigns APP_HOME after 1500ms`, async () => {
      const page = buildPage(pageName, { ua: UA[uaName] });
      await settle();
      clickOpenApp(page);
      // custom-scheme attempt is recorded synchronously
      assert.equal(customSchemeNav(page).length, 1, 'custom scheme navigation must be attempted');
      assert.equal(homeNavs(page).length, 0, 'no fallback before timeout');
      assert.equal(page.timers.activeCount(), 1, 'one 1500ms fallback timer must be pending');

      page.timers.advance(1500);
      assert.equal(homeNavs(page).length, 1, 'fallback must assign APP_HOME after 1500ms');
      const fallback = homeNavs(page)[0];
      assert.equal(fallback.kind, 'assign');
      assert.equal(fallback.url, appHomeOf(page), 'fallback target must be the page APP_HOME constant');
      assert.equal(page.timers.activeCount(), 0, 'timer must be cleaned up after firing');
      assert.equal(page.location.href, appHomeOf(page), 'location.href must now be the official homepage');
      // guard resets: a second click works again
      clickOpenApp(page);
      assert.equal(customSchemeNav(page).length, 2, 'pending guard must reset after fallback');
    });
  }
}

test('S2 fallback target is the official homepage containing a download button', () => {
  // Static target check only: the executed fallback assigns APP_HOME; this
  // asserts that APP_HOME is the site homepage with a download CTA. (The
  // navigation behaviour itself is covered by the executed-JS tests above.)
  const home = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
  assert.match(home, /Download/i, 'index.html must offer a download call-to-action');
  assert.match(home, /<a|button/i, 'download CTA must be an interactive element');
});

// =============================================================================
// S3 — installed / page hidden: visibilitychange -> hidden or pagehide cancels
//      the fallback; no redirect afterwards
// =============================================================================
for (const pageName of ['post', 'publication', 'tea-room']) {
  test(`S3 ${pageName} [desktop] visibilitychange hidden cancels the fallback`, async () => {
    const page = buildPage(pageName, { ua: UA.desktop });
    await settle();
    clickOpenApp(page);
    assert.equal(page.timers.activeCount(), 1, 'fallback timer pending before launch detection');
    assert.equal(page.document.listenerCount('visibilitychange'), 1, 'visibilitychange listener registered');

    page.document.hidden = true;
    page.document.visibilityState = 'hidden';
    page.document.dispatchEvent('visibilitychange');

    assert.equal(page.timers.activeCount(), 0, 'timer must be cancelled on hidden');
    assert.equal(page.document.listenerCount('visibilitychange'), 0, 'listener must be removed on cancel');
    assert.equal(page.window.listenerCount('pagehide'), 0, 'pagehide listener must be removed on cancel');
    page.timers.advance(2000);
    assert.equal(homeNavs(page).length, 0, 'no redirect after app launch (hidden)');
    assert.equal(page.dom.state.nav.length, 1, 'only the custom-scheme navigation occurred');
  });

  test(`S3 ${pageName} [desktop] pagehide cancels the fallback`, async () => {
    const page = buildPage(pageName, { ua: UA.desktop });
    await settle();
    clickOpenApp(page);
    assert.equal(page.timers.activeCount(), 1, 'fallback timer pending');
    page.window.dispatchEvent('pagehide');
    assert.equal(page.timers.activeCount(), 0, 'timer must be cancelled on pagehide');
    page.timers.advance(2000);
    assert.equal(homeNavs(page).length, 0, 'no redirect after pagehide');
    assert.equal(page.dom.state.nav.length, 1, 'only the custom-scheme navigation occurred');
  });

  test(`S3 ${pageName} [ios] visibilitychange hidden cancels the fallback`, async () => {
    const page = buildPage(pageName, { ua: UA.ios });
    await settle();
    clickOpenApp(page);
    page.document.hidden = true;
    page.document.visibilityState = 'hidden';
    page.document.dispatchEvent('visibilitychange');
    page.timers.advance(2000);
    assert.equal(homeNavs(page).length, 0, 'iOS installed app must not redirect back');
    assert.equal(page.timers.activeCount(), 0, 'no timer left running');
  });
}

// =============================================================================
// S4 — repeated clicks on the same entry: one timer, one navigation
// =============================================================================
for (const pageName of ['post', 'publication', 'tea-room']) {
  test(`S4 ${pageName} [desktop] three rapid clicks -> single fallback timer and single navigation`, async () => {
    const page = buildPage(pageName, { ua: UA.desktop });
    await settle();
    clickOpenApp(page);
    clickOpenApp(page);
    clickOpenApp(page);
    assert.equal(customSchemeNav(page).length, 1, 'only one custom-scheme navigation despite 3 clicks');
    assert.equal(page.document.listenerCount('visibilitychange'), 1, 'visibilitychange listener registered exactly once');
    assert.equal(page.window.listenerCount('pagehide'), 1, 'pagehide listener registered exactly once');
    assert.equal(page.timers.activeCount(), 1, 'exactly one fallback timer registered');

    page.timers.advance(1600);
    assert.equal(homeNavs(page).length, 1, 'exactly one homepage fallback');
    assert.equal(page.dom.state.nav.length, 2, 'navigation sequence: custom scheme + one fallback');
  });
}

// =============================================================================
// S5 — platform branch shape assertions
// =============================================================================
test('S5 iOS uses plain shesay:// custom scheme with visibility guard (no intent)', async () => {
  const page = buildPage('post', { ua: UA.ios });
  await settle();
  clickOpenApp(page);
  const scheme = customSchemeNav(page)[0].url;
  assert.ok(scheme.startsWith('shesay://post?id='), `iOS must navigate to plain shesay:// scheme, got: ${scheme}`);
  assert.ok(!scheme.startsWith('intent://'), 'iOS must not produce an Android intent URI');
  assert.equal(page.document.listenerCount('visibilitychange'), 1, 'visibility guard registered');
});

test('S5 desktop uses plain shesay:// custom scheme with visibility guard (no intent)', async () => {
  const page = buildPage('publication', { ua: UA.desktop });
  await settle();
  clickOpenApp(page);
  const scheme = customSchemeNav(page)[0].url;
  assert.ok(scheme.startsWith('shesay://publication?id='), `desktop must navigate to plain shesay:// scheme, got: ${scheme}`);
  assert.ok(!scheme.startsWith('intent://'), 'desktop must not produce an Android intent URI');
  assert.equal(page.document.listenerCount('visibilitychange'), 1, 'visibility guard registered');
});

test('S5 Android intent URI equals the documented browser_fallback_url format', async () => {
  const page = buildPage('tea-room', { ua: UA.android });
  await settle();
  clickOpenApp(page);
  const uri = page.dom.state.nav[0].url;
  const expected = 'intent://tea-room?id=p1'
    + '#Intent;scheme=shesay;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;S.browser_fallback_url='
    + encodeURIComponent(appHomeOf(page)) + ';end';
  assert.equal(uri, expected);
});

// =============================================================================
// FAILURE INJECTION — every scenario must genuinely fail when the behaviour it
// guards is broken. These tests run the SAME harness against MUTATED page
// scripts and assert that the oracle assertions used by the scenarios above
// throw. If any mutation goes undetected, the test below fails, proving the
// assertions are effective rather than grep-based.
// =============================================================================
function expectOracleFailure(fn, label) {
  let caught = null;
  try {
    fn();
  } catch (err) {
    caught = err;
  }
  assert.ok(caught, `INJECTION NOT DETECTED: ${label} — the scenario oracle passed on mutated code`);
  return caught;
}

test('INJECT [post] removing the fallback assign -> S2 oracle fails', async () => {
  const page = buildPage('post', { ua: UA.desktop, mutation: 'no-fallback-assign' });
  await settle();
  clickOpenApp(page);
  page.timers.advance(1600);
  expectOracleFailure(() => {
    assert.equal(homeNavs(page).length, 1, 'fallback must assign APP_HOME after 1500ms');
    assert.equal(page.location.href, appHomeOf(page), 'location.href must now be the official homepage');
  }, 'no-fallback-assign');
});

test('INJECT [post] removing cancel-on-hidden -> S3 oracle fails', async () => {
  const page = buildPage('post', { ua: UA.desktop, mutation: 'no-cancel-on-hidden' });
  await settle();
  clickOpenApp(page);
  page.document.hidden = true;
  page.document.visibilityState = 'hidden';
  page.document.dispatchEvent('visibilitychange');
  expectOracleFailure(() => {
    assert.equal(page.timers.activeCount(), 0, 'timer must be cancelled on hidden');
  }, 'no-cancel-on-hidden');
});

test('INJECT [post] removing hidden protection -> hidden case would redirect, oracle fails', async () => {
  const page = buildPage('post', { ua: UA.desktop, mutation: 'no-hidden-protection' });
  await settle();
  clickOpenApp(page);
  page.document.hidden = true;
  page.document.visibilityState = 'hidden';
  page.document.dispatchEvent('visibilitychange');
  page.timers.advance(1600);
  expectOracleFailure(() => {
    assert.equal(homeNavs(page).length, 0, 'no redirect after app launch (hidden)');
  }, 'no-hidden-protection');
});

test('INJECT [post] removing pagehide cancel -> pagehide oracle fails', async () => {
  const page = buildPage('post', { ua: UA.desktop, mutation: 'no-pagehide-cancel' });
  await settle();
  clickOpenApp(page);
  page.window.dispatchEvent('pagehide');
  expectOracleFailure(() => {
    assert.equal(page.timers.activeCount(), 0, 'timer must be cancelled on pagehide');
  }, 'no-pagehide-cancel');
});

test('INJECT [post] removing the duplicate-click guard -> S4 oracle fails', async () => {
  const page = buildPage('post', { ua: UA.desktop, mutation: 'no-repeat-guard' });
  await settle();
  clickOpenApp(page);
  clickOpenApp(page);
  clickOpenApp(page);
  expectOracleFailure(() => {
    assert.equal(customSchemeNav(page).length, 1, 'only one custom-scheme navigation despite 3 clicks');
    assert.equal(page.timers.activeCount(), 1, 'exactly one fallback timer registered');
  }, 'no-repeat-guard');
});

test('INJECT [post] breaking the Android intent URI -> S1 oracle fails', async () => {
  const page = buildPage('post', { ua: UA.android, mutation: 'no-android-intent' });
  await settle();
  clickOpenApp(page);
  const uri = page.dom.state.nav[0].url;
  expectOracleFailure(() => {
    assert.ok(uri.startsWith('intent://'), 'Android must navigate to an intent:// URI');
    assert.ok(uri.includes('S.browser_fallback_url='), 'intent must carry browser_fallback_url');
  }, 'no-android-intent');
});

test('INJECT [tea-room] removing the fallback assign -> S2 oracle fails (page-specific)', async () => {
  const page = buildPage('tea-room', { ua: UA.ios, mutation: 'no-fallback-assign' });
  await settle();
  clickOpenApp(page);
  page.timers.advance(1600);
  expectOracleFailure(() => {
    assert.equal(homeNavs(page).length, 1, 'tea-room fallback must assign APP_HOME');
  }, 'no-fallback-assign (tea-room)');
});

test('INJECT [tea-room] unbinding the visibility listener -> hidden cancel oracle fails', async () => {
  const page = buildPage('tea-room', { ua: UA.desktop, mutation: 'no-visibility-listener' });
  await settle();
  // tea-room guards on href startsWith shesay://, so the entry still launches;
  // the injected removal of the *visibility* listener breaks the cancel path.
  clickOpenApp(page);
  assert.equal(page.timers.activeCount(), 1, 'fallback timer pending before launch detection');
  page.document.hidden = true;
  page.document.visibilityState = 'hidden';
  page.document.dispatchEvent('visibilitychange');
  expectOracleFailure(() => {
    assert.equal(page.timers.activeCount(), 0, 'timer must be cancelled on hidden');
  }, 'no-visibility-listener (tea-room)');
});

test('INJECT [publication] removing the duplicate-click guard -> S4 oracle fails (page-specific)', async () => {
  const page = buildPage('publication', { ua: UA.desktop, mutation: 'no-repeat-guard' });
  await settle();
  clickOpenApp(page);
  clickOpenApp(page);
  clickOpenApp(page);
  expectOracleFailure(() => {
    assert.equal(customSchemeNav(page).length, 1, 'only one custom-scheme navigation despite 3 clicks');
  }, 'no-repeat-guard (publication)');
});

// =============================================================================
// NOT COVERED (declared, not claimed)
// -----------------------------------------------------------------------------
// 1. Real Android/iOS device deep-link launch (no device access in this run).
// 2. Real Chrome Android intent resolver behaviour (fallback_url auto-jump).
// 3. Real Safari "Cannot Open Page" dialog + timer interaction on iOS.
// 4. Real desktop external-protocol dialog focus behaviour (timer may fire
//    while the dialog is open — known limitation, see platform research).
// 5. A headless-browser (Playwright/Puppeteer) run was not added because this
//    repo is intentionally dependency-free (no package.json); the harness
//    above executes the real page JS with DOM event dispatch + fake timers,
//    which is the sanctioned replacement for grep-based string assertions.
// =============================================================================
