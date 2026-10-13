/* Shared customer-support protocol used by the app and the admin console. */
(function (root) {
  function createSupportChat({ client, view, redirect }) {
    let user = null;
    let conversationId = null;
    let channel = null;
    let generation = 0;
    let sending = false;
    let syncing = false;
    let messages = new Map();
    const login = () => redirect('auth.html?next=%2Fhelp-feedback.html#login');
    function merge(rows) {
      for (const row of rows || []) {
        if (row.id && row.conversation_id === conversationId) messages.set(row.id, row);
      }
      view.messages([...messages.values()].sort((a, b) =>
        String(a.created_at).localeCompare(String(b.created_at)) || String(a.id).localeCompare(String(b.id))), user.id);
    }
    async function sync() {
      if (!conversationId || syncing) return;
      syncing = true;
      const current = generation;
      try {
        const { data, error } = await client.rpc('get_support_conversation_bundle');
        if (current !== generation) return;
        if (error) throw error;
        if (data?.conversation_id !== conversationId) throw new Error('Conversation changed. Reload to continue.');
        merge(data.messages);
      } catch (_) {
        if (current === generation) view.connection('Could not refresh messages. Reconnect to try again.', true);
      } finally { if (current === generation) syncing = false; }
    }
    function stop() {
      generation++;
      if (channel) client.removeChannel(channel);
      channel = null;
      conversationId = null;
      user = null;
      messages.clear();
      syncing = false;
      view.ready(false);
      view.messages([], null);
    }
    async function start() {
      stop();
      const current = generation;
      view.status('Checking your login…', false);
      try {
        const session = await client.auth.getSession();
        if (current !== generation) return;
        if (session.error) throw session.error;
        if (!session.data?.session) { login(); return; }
        const result = await client.auth.getUser();
        if (current !== generation) return;
        if (result.error) {
          if ([401, 403].includes(result.error.status) || result.error.name === 'AuthSessionMissingError') { login(); return; }
          throw result.error;
        }
        if (!result.data?.user) { login(); return; }
        user = result.data.user;
        const { data, error } = await client.rpc('get_support_conversation_bundle');
        if (current !== generation) return;
        if (error) throw error;
        if (!data?.conversation_id) throw new Error('Missing support conversation');
        conversationId = data.conversation_id;
        merge(data.messages);
        view.ready(true);
        view.status('', false);
        channel = client.channel(`support:${conversationId}`)
          .on('postgres_changes', {
            event: 'INSERT', schema: 'public', table: 'support_messages',
            filter: `conversation_id=eq.${conversationId}`,
          }, payload => { if (current === generation) merge([payload.new]); })
          .subscribe(status => {
            if (current !== generation) return;
            if (status === 'SUBSCRIBED') {
              view.connection('Connected · Replies appear here automatically.', false);
              // Catch messages sent between the first fetch and subscription, or while offline.
              void sync();
            } else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) {
              view.connection('Connection interrupted. Reconnect to refresh the conversation.', true);
            }
          });
      } catch (_) {
        if (current === generation) view.status('Could not load support. Check your connection and try again.', true);
      }
    }
    async function send(value) {
      const content = value.trim();
      if (sending || !user || !conversationId || !content) return false;
      if (content.length > 2000) { view.sendStatus('Please keep your message within 2,000 characters.'); return false; }
      const current = generation;
      sending = true;
      view.sending(true);
      view.sendStatus('Sending…');
      try {
        const { data, error } = await client.from('support_messages').insert({
          conversation_id: conversationId, sender_id: user.id, content,
        }).select('id,conversation_id,sender_id,content,created_at');
        if (current !== generation) return false;
        if (error) throw error;
        merge(data);
        view.sendStatus('Message sent. Our team will reply in this conversation.');
        return true;
      } catch (_) {
        if (current === generation) view.sendStatus('Sending failed. Your message is still here; please try again.');
        return false;
      } finally { sending = false; view.sending(false); }
    }
    function authChanged(event, session) {
      if (event === 'SIGNED_OUT' || (!session && user)) { stop(); login(); }
      else if (user && session?.user?.id !== user.id) { stop(); void start(); }
    }
    return { start, send, sync, stop, authChanged };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { createSupportChat };
  else root.SheSaySupport = { createSupportChat };
})(typeof window !== 'undefined' ? window : globalThis);
