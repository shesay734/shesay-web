(function () {
  const $ = id => document.getElementById(id);
  let loadingFailed = false;
  let connectionFailed = false;
  const updateRetry = () => { $('support-retry').hidden = !loadingFailed && !connectionFailed; };
  const view = {
    ready(value) { $('support-panel').hidden = !value; },
    status(text, failed) {
      $('support-status').textContent = text;
      loadingFailed = failed;
      updateRetry();
    },
    connection(text, failed) {
      $('connection-status').textContent = text;
      connectionFailed = failed;
      updateRetry();
    },
    messages(rows, userId) {
      const list = $('messages');
      const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
      const firstLoad = !list.querySelector('.support-message');
      const fragment = document.createDocumentFragment();
      if (!rows.length) {
        const empty = document.createElement('p');
        empty.className = 'muted';
        empty.textContent = 'Tell us how we can help. Your replies will appear here.';
        fragment.append(empty);
      }
      for (const row of rows) {
        const bubble = document.createElement('article');
        bubble.className = 'support-message' + (row.sender_id === userId ? ' mine' : '');
        const sender = document.createElement('strong');
        sender.textContent = row.sender_id === userId ? 'You' : 'SheSay support';
        const body = document.createElement('p');
        const content = String(row.content || '');
        // App and admin chat represent images as a single Markdown image.
        const match = /^!\[[^\]]*\]\((https:\/\/[^\s)]+)\)$/.exec(content.trim());
        if (match) {
          const link = document.createElement('a');
          link.href = match[1]; link.target = '_blank'; link.rel = 'noopener noreferrer';
          const image = document.createElement('img');
          image.src = match[1]; image.alt = 'Support conversation attachment';
          image.loading = 'lazy'; image.referrerPolicy = 'no-referrer';
          link.append(image); body.append(link);
        } else body.textContent = content;
        const time = document.createElement('time');
        const date = new Date(row.created_at);
        if (!Number.isNaN(date.getTime())) { time.dateTime = date.toISOString(); time.textContent = date.toLocaleString(); }
        bubble.append(sender, body, time); fragment.append(bubble);
      }
      list.replaceChildren(fragment);
      if (atBottom || firstLoad) list.scrollTop = list.scrollHeight;
    },
    sending(value) { $('send-message').disabled = value; },
    sendStatus(text) { $('send-status').textContent = text; },
  };
  if (!window.SheSay?.client || !window.SheSaySupport) {
    view.status('Support could not load. Check your connection and reload this page.', true);
    $('support-retry').onclick = () => location.reload();
    return;
  }
  const client = SheSay.client;
  const chat = SheSaySupport.createSupportChat({ client, view, redirect: url => location.replace(url) });
  $('support-retry').onclick = () => { connectionFailed = false; void chat.start(); };
  $('message-form').onsubmit = async event => {
    event.preventDefault();
    const draft = $('message').value;
    if (await chat.send(draft)) {
      if ($('message').value === draft) $('message').value = '';
      $('messages').scrollTop = $('messages').scrollHeight;
      $('message').focus();
    }
  };
  $('refund-template').onclick = () => {
    const field = $('message');
    if (field.value.trim()) { field.focus(); view.sendStatus('Please add your order details to your current draft, or clear it to use the template.'); return; }
    field.value = SheSayI18n.t('Refund request\nOrder number: \nItem or subscription: \nPurchase date: \nAmount and currency: \nReason: ');
    field.focus();
  };
  const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => chat.authChanged(event, session));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void chat.sync(); });
  window.addEventListener('online', () => { void chat.sync(); });
  window.addEventListener('pagehide', () => { chat.stop(); subscription.unsubscribe(); });
  window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
  void chat.start();
})();
