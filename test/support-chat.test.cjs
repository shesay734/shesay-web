const test = require('node:test');
const assert = require('node:assert/strict');
const { createSupportChat } = require('../support-chat.js');

function setup(options = {}) {
  const state = { rows: [], rpcCalls: 0, inserts: [], ready: false, removed: 0 };
  const row = (id, sender_id = 'admin', content = 'Hello') => ({
    id, conversation_id: 'conversation', sender_id, content, created_at: '2026-10-13T12:00:00Z',
  });
  const client = {
    auth: {
      getSession: async () => ({ data: { session: options.loggedOut ? null : { user: { id: 'user' } } } }),
      getUser: async () => ({ data: { user: { id: 'user' } } }),
    },
    rpc: async name => {
      assert.equal(name, 'get_support_conversation_bundle'); state.rpcCalls++;
      if (options.failLoad) return { error: new Error('offline') };
      return { data: { conversation_id: 'conversation', messages: [row('initial')] } };
    },
    channel(name) {
      assert.equal(name, 'support:conversation');
      return {
        on(type, filter, callback) { state.filter = filter; state.receive = callback; return this; },
        subscribe(callback) { state.connection = callback; return this; },
      };
    },
    removeChannel() { state.removed++; },
    from(table) {
      assert.equal(table, 'support_messages');
      return { insert(payload) {
        state.inserts.push(payload);
        return { select: async () => options.failSend ? { error: new Error('offline') } : { data: [row('sent', 'user', payload.content)] } };
      } };
    },
  };
  const chat = createSupportChat({ client, redirect: url => { state.redirect = url; }, view: {
    ready(value) { state.ready = value; },
    messages(rows) { state.rows = rows; },
    status(text, failed) { state.status = text; state.failed = failed; },
    connection(text, failed) { state.connectionFailed = failed; },
    sendStatus(text) { state.sendStatus = text; },
    sending(value) { state.sending = value; },
  } });
  return { chat, state, row, options };
}
test('anonymous visitors go to login with support return path, without opening a conversation', async () => {
  const { chat, state } = setup({ loggedOut: true });
  await chat.start();
  assert.equal(state.redirect, 'auth.html?next=%2Fhelp-feedback.html#login');
  assert.equal(state.rpcCalls, 0);
  assert.equal(state.ready, false);
});
test('loads shared history, subscribes to the conversation and deduplicates send/realtime events', async () => {
  const { chat, state, row } = setup();
  await chat.start();
  assert.equal(state.ready, true);
  assert.equal(state.filter.filter, 'conversation_id=eq.conversation');
  assert.equal(state.filter.table, 'support_messages');
  state.connection('SUBSCRIBED');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(state.rpcCalls, 2);
  assert.equal(await chat.send('  Order 123 refund please  '), true);
  assert.deepEqual(state.inserts[0], { conversation_id: 'conversation', sender_id: 'user', content: 'Order 123 refund please' });
  state.receive({ new: row('sent', 'user') });
  state.receive({ new: row('reply') });
  state.receive({ new: { ...row('other'), conversation_id: 'other-conversation' } });
  assert.equal(state.rows.length, 3);
  state.connection('CHANNEL_ERROR');
  assert.equal(state.connectionFailed, true);
  state.connection('SUBSCRIBED');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(state.rpcCalls, 3);
  assert.equal(state.rows.length, 3);
});
test('failed loading can retry and failed sending preserves retryable state', async () => {
  const { chat, state, options } = setup({ failLoad: true, failSend: true });
  await chat.start();
  assert.equal(state.failed, true);
  assert.equal(state.ready, false);
  options.failLoad = false;
  await chat.start();
  assert.equal(state.ready, true);
  assert.equal(await chat.send('refund'), false);
  assert.match(state.sendStatus, /still here/);
  assert.equal(state.sending, false);
  options.failSend = false;
  assert.equal(await chat.send('refund'), true);
  assert.equal(await chat.send('x'.repeat(2001)), false);
  assert.equal(state.inserts.length, 2);
});
test('signing out clears conversation and ignores queued realtime callbacks', async () => {
  const { chat, state, row } = setup();
  await chat.start();
  chat.authChanged('SIGNED_OUT', null);
  state.receive({ new: row('late') });
  assert.deepEqual(state.rows, []);
  assert.equal(state.ready, false);
  assert.equal(state.removed, 1);
  assert.match(state.redirect, /auth.html/);
  assert.equal(await chat.send('should not send'), false);
});
