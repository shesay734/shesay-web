// Legal pages show the same text as the app: the current version of the
// document in the visitor's language, read from the app's legal document table.
// The English text built into the page stays as the fallback.
(() => {
  const article = document.querySelector('[data-legal-doc]');
  if (!article) return;
  const key = article.getAttribute('data-legal-doc');
  const url = 'https://suxprwbmoakcbopjuosa.supabase.co';
  const apiKey = 'sb_publishable_JsggCmnvB1Q50l5z2W11Uw_AfKLxCx7';
  const supported = ['en', 'zh', 'es', 'fr', 'it', 'de', 'ja', 'pt'];
  const versionLabel = {
    en: 'Version', zh: '版本', es: 'Versión', fr: 'Version',
    it: 'Versione', de: 'Version', ja: 'バージョン', pt: 'Versão',
  };
  const cache = {};
  let shown = article.getAttribute('data-legal-locale') || 'en';

  const escape = (text) => text.replace(/[&<>"]/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
  })[c]);

  // Same structure the app shows: "1. Heading" lines become headings,
  // "• item" lines a list, everything else a paragraph.
  function render(content) {
    const out = [];
    let list = [];
    const flush = () => {
      if (list.length) out.push(`<ul>${list.map((i) => `<li>${escape(i)}</li>`).join('')}</ul>`);
      list = [];
    };
    for (const raw of content.split('\n')) {
      const line = raw.trim();
      if (!line) { flush(); continue; }
      if (line.startsWith('•')) { list.push(line.replace(/^•\s*/, '')); continue; }
      flush();
      if (/^\d+\.\s/.test(line)) out.push(`<h2>${escape(line)}</h2>`);
      else out.push(`<p>${escape(line)}</p>`);
    }
    flush();
    return out.join('\n');
  }

  async function load(locale) {
    if (cache[locale]) return cache[locale];
    const query = `${url}/rest/v1/legal_document_versions?document_key=eq.${key}` +
      `&locale=eq.${locale}&is_current=eq.true&select=title,version,content&limit=1`;
    const response = await fetch(query, { headers: { apikey: apiKey, Authorization: `Bearer ${apiKey}` } });
    if (!response.ok) throw new Error(`legal ${response.status}`);
    const rows = await response.json();
    if (!rows.length) throw new Error('legal document missing');
    cache[locale] = rows[0];
    return rows[0];
  }

  async function show() {
    const lang = (document.documentElement.lang || 'en').split('-')[0];
    const locale = supported.includes(lang) ? lang : 'en';
    try {
      const doc = await load(locale);
      const current = (document.documentElement.lang || 'en').split('-')[0];
      if ((supported.includes(current) ? current : 'en') !== locale) return;
      article.querySelector('.page-heading h1').textContent = doc.title;
      article.querySelector('.page-heading .date').textContent =
        `${versionLabel[locale]}: ${doc.version}`;
      article.querySelector('.document').innerHTML = render(doc.content);
      document.title = `${doc.title} - SheSay`;
      shown = locale;
    } catch (_) {
      // Keep the built-in text when the document cannot be loaded.
    }
  }

  new MutationObserver(() => {
    const lang = (document.documentElement.lang || 'en').split('-')[0];
    if (lang !== shown) show();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  show();
})();
