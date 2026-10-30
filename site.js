window.SheSay = (() => {
  const url = 'https://suxprwbmoakcbopjuosa.supabase.co';
  const key = 'sb_publishable_JsggCmnvB1Q50l5z2W11Uw_AfKLxCx7';
  const client = window.supabase.createClient(url, key);
  const fusionUrl = `${url}/functions/v1/fusion-auth`;

  async function fusion(action, payload = {}, accessToken = null) {
    const headers = {
      'Content-Type': 'application/json',
      apikey: key,
    };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    const response = await fetch(fusionUrl, {
      method: 'POST', headers, body: JSON.stringify({ action, ...payload }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Request failed. Please try again.');
    return body;
  }

  // Email verification codes go through the auth-guard function, which
  // enforces the cooldown, hourly/daily caps and abuse blocks. The first
  // request carries a Turnstile token and returns a human pass for this
  // browser; resends use the pass so the human check does not run again.
  const guardUrl = `${url}/functions/v1/auth-guard`;
  const storage = (area) => { try { return window[area]; } catch (_) { return null; } };
  function deviceId() {
    const store = storage('localStorage');
    let id = null;
    try { id = store && store.getItem('shesay-device-id'); } catch (_) {}
    if (!id || id.length < 8) {
      id = (crypto.randomUUID && crypto.randomUUID()) ||
        Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
      try { store && store.setItem('shesay-device-id', id); } catch (_) {}
    }
    return id;
  }
  function humanPass() {
    try {
      const saved = JSON.parse(storage('sessionStorage')?.getItem('shesay-human-pass') || 'null');
      return saved && saved.expiresAt > Date.now() + 15000 ? saved : null;
    } catch (_) { return null; }
  }
  function keepPass(body) {
    if (typeof body.pass !== 'string' || typeof body.expiresAt !== 'number') return;
    try {
      storage('sessionStorage')?.setItem('shesay-human-pass',
        JSON.stringify({ pass: body.pass, expiresAt: body.expiresAt }));
    } catch (_) {}
  }
  function dropPass() {
    try { storage('sessionStorage')?.removeItem('shesay-human-pass'); } catch (_) {}
  }
  const codeErrors = {
    captcha_required: 'Complete the human verification first.',
    hourly_limit: 'Too many code requests. Please try again in an hour.',
    daily_limit: "You've reached today's code limit. Please try again tomorrow.",
    blocked: 'Code requests from this device or network are paused for 30 days because of unusual activity.',
  };
  async function sendCode({ email, purpose, captchaToken }) {
    const held = humanPass();
    const payload = { action: 'sendCode', email, purpose, deviceId: deviceId() };
    if (held) payload.pass = held.pass; else payload.captchaToken = captchaToken || '';
    const response = await fetch(guardUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => ({}));
    keepPass(body);
    if (response.ok && body.ok) return body;
    if (body.error === 'captcha_required') dropPass();
    const message = body.error === 'cooldown'
      ? `Please wait ${body.retryAfter || 60}s before requesting another code.`
      : codeErrors[body.error] || body.message || 'Could not send verification code.';
    const error = new Error(message);
    error.code = body.error || 'send_failed';
    error.retryAfter = body.retryAfter || null;
    throw error;
  }

  return { client, fusion, sendCode, humanPass };
})();

// Shared language picker for the public web experience. Content authored by
// members is left untouched; i18n.js translates the site's own text.
(function addSiteLanguagePicker() {
  const i18n = window.SheSayI18n;
  if (!i18n) return;
  const key = 'shesay-web-locale';
  const supported = value => i18n.languages.some(([code]) => code === value);
  let saved = null;
  try { saved = localStorage.getItem(key); } catch (_) {}
  const preferred = saved || (navigator.language || 'en').split('-')[0];
  const initial = supported(preferred) ? preferred : 'en';
  i18n.setLocale(initial);
  function mount() {
    const host = document.querySelector('.corporate-header, .share-header, .site-header, .home-header, .site-shell, .auth-stage');
    if (!host || host.querySelector('.site-language')) return;
    const wrap = document.createElement('label');
    wrap.className = 'site-language';
    wrap.title = 'Language';
    const select = document.createElement('select');
    select.setAttribute('aria-label', 'Language');
    i18n.languages.forEach(([value, label]) => select.appendChild(new Option(label, value)));
    select.value = i18n.locale;
    select.addEventListener('change', () => {
      try { localStorage.setItem(key, select.value); } catch (_) {}
      i18n.setLocale(select.value);
    });
    wrap.append('◎ ', select);
    if (host.matches('.site-shell, .auth-stage')) host.insertBefore(wrap, host.firstChild);
    else host.appendChild(wrap);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true }); else mount();
})();
