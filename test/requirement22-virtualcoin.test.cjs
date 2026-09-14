// Requirement 22 (web): virtual-coin (USDT) recharge must create an order.
// Regression tests: click the USDT channel, submit the inline form, expect an
// order to be created via `create_usdt_recharge_request` and the resulting
// order number shown as 处理中/待确认.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../wallet.html'), 'utf8');
assert.match(html, /<script>[\s\S]*<\/script>/, 'wallet.html must contain an inline script');

// Extract the last inline <script> (the page's own logic, after site.js).
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const source = scripts[scripts.length - 1];

function buildPage(overrides = {}) {
  const elements = new Map();
  const calls = [];
  const rpcStub = overrides.rpc || (async (name, args) => {
    calls.push({ name, args });
    if (name === 'create_usdt_recharge_request') {
      return { data: 'U' + 'A'.repeat(16) };
    }
    if (name === 'get_shared_post') return { data: {} };
    return { data: null };
  });
  const document = {
    getElementById(id) {
      if (!elements.has(id)) {
        const classes = new Set();
        const el = {
          id,
          className: '',
          textContent: '',
          innerHTML: '',
          value: '',
          hidden: false,
          disabled: false,
          onclick: null,
          children: [],
          classList: {
            add(n) { classes.add(n); },
            remove(n) { classes.delete(n); },
            toggle(n, force) { force ? classes.add(n) : classes.delete(n); },
            contains(n) { return classes.has(n); },
          },
          appendChild(child) { this.children.push(child); if (child && child.id) elements.set(child.id, child); },
          replaceChildren() { this.children = []; },
          append(...nodes) { for (const n of nodes) this.appendChild(n); },
          addEventListener() {},
        };
        elements.set(id, el);
      }
      return elements.get(id);
    },
    createElement(tag) {
      const classes = new Set();
      return {
        tagName: tag.toUpperCase(),
        className: '',
        textContent: '',
        value: '',
        type: '',
        disabled: false,
        onclick: null,
        children: [],
        classList: {
          add(n) { classes.add(n); },
          remove(n) { classes.delete(n); },
          toggle(n, force) { force ? classes.add(n) : classes.delete(n); },
          contains(n) { return classes.has(n); },
        },
        appendChild(child) { this.children.push(child); if (child && child.textContent) this.textContent += child.textContent; },
        append(...nodes) { for (const n of nodes) this.appendChild(n); },
        addEventListener() {},
      };
    },
  };
  const client = {
    auth: {
      getUser: async () => ({ data: { user: { id: 'u1', email: 'a@b.c', user_metadata: { nickname: 'tester' } } } }),
      signOut: async () => {},
    },
    from(table) {
      const chain = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        maybeSingle: async () => ({ data: {}, error: null }),
        then(resolve) {
          if (table === 'payment_methods') {
            return resolve({
              data: [{
                id: 'pm-usdt', method: 'usdt', display_name: 'USDT',
                network: 'TRC20', address: '0xTestTestTestTest',
                note: 'Demo receiving address', sort_order: 2,
              }],
              error: null,
            });
          }
          return resolve({ data: [], error: null });
        },
      };
      return chain;
    },
    rpc: rpcStub,
  };
  vm.runInNewContext(source, {
    document,
    console,
    location: { href: 'https://xn--1uss88i.com/wallet.html', replace() {} },
    SheSay: { client },
    setImmediate,
  });
  return { elements, calls, client, document };
}

test('wallet page wires the virtual-coin channel to order creation', async () => {
  const page = buildPage();
  await new Promise(r => setImmediate(r)); // let initial load() settle
  const options = page.elements.get('paymentOptions');
  assert.ok(options, 'paymentOptions container must exist');
  assert.ok(options.children.some(c => (c.textContent || '').includes('USDT')), 'USDT virtual-coin channel must be offered');
  // Click the USDT channel opens the inline recharge form.
  const usdt = options.children.find(c => (c.textContent || '').includes('USDT'));
  assert.ok(usdt && typeof usdt.onclick === 'function', 'USDT channel must be clickable');
  usdt.onclick();
  const form = page.elements.get('rechargeForm');
  assert.ok(form, 'clicking USDT must reveal an inline recharge form (reuse existing UI, no new page)');
  assert.ok(!form.classList.contains('hidden'), 'recharge form must be visible after click');
});

test('submitting the virtual-coin form creates a pending order and shows its number', async () => {
  const page = buildPage();
  await new Promise(r => setImmediate(r));
  const options = page.elements.get('paymentOptions');
  const usdt = options.children.find(c => (c.textContent || '').includes('USDT'));
  usdt.onclick();
  const form = page.elements.get('rechargeForm');
  const amount = page.elements.get('rechargeAmount');
  const paid = page.elements.get('rechargePaid');
  const address = page.elements.get('rechargeAddress');
  const submit = page.elements.get('rechargeSubmit');
  assert.ok(amount && paid && address && submit, 'form must have amount/paid/address inputs and submit button');
  amount.value = '100';
  paid.value = '100';
  address.value = '0x0000000000000000000000000000000000000001';
  await submit.onclick();
  const rpcCall = page.calls.find(c => c.name === 'create_usdt_recharge_request');
  assert.ok(rpcCall, 'form submit must call create_usdt_recharge_request');
  assert.equal(rpcCall.args.requested_amount, 100);
  assert.equal(rpcCall.args.requested_paid_amount, 100);
  assert.match(rpcCall.args.requested_payer_crypto_address, /^0x/);
  assert.ok(rpcCall.args.requested_payment_method_id, 'payment method id must be sent');
  const notice = page.elements.get('notice');
  assert.match(notice.textContent, /U[0-9A-F]{16}/, 'order number must be shown');
  assert.match(notice.textContent, /处理中|待确认|pending|submitted/i, 'order must be shown as processing/pending');
});