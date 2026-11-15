// Legal pages: the text lives in this website (legal/index.json and
// legal/<key>/<version>/<locale>.txt), so updating a policy is a website
// change. The app opens these pages in its in-app browser, and the server
// copies each version into the database when people accept it.
//
// A page shows the current version in the visitor's language (English when
// that language is missing); ?version=x shows an earlier version, and the
// "Version history" link lists them all (legal-history.html?doc=<key>).
(() => {
  const article = document.querySelector('[data-legal-doc]');
  if (!article) return;
  const key = article.getAttribute('data-legal-doc');
  const L = window.SheSayLegal;
  const requested = new URLSearchParams(location.search).get('version');
  let shown = null;

  async function show() {
    const locale = L.locale();
    try {
      const index = await L.index();
      const doc = index.documents[key];
      if (!doc) return;
      const entry = doc.versions.find((v) => v.version === (requested || doc.current))
        || doc.versions.find((v) => v.version === doc.current);
      const lang = entry.locales.includes(locale) ? locale : 'en';
      const content = await L.text(key, entry.version, lang);
      if (L.locale() !== locale) return;
      const title = entry.titles[lang] || entry.titles.en;
      const heading = article.querySelector('.page-heading');
      heading.querySelector('h1').textContent = title;
      const meta = heading.querySelector('.date');
      meta.innerHTML = '';
      meta.append(`${L.label('version', locale)}: ${entry.version} · ${L.label('published', locale)}: ${L.date(entry.published, locale)} · `);
      const history = document.createElement('a');
      history.href = `legal-history.html?doc=${encodeURIComponent(key)}`;
      history.textContent = L.label('history', locale);
      meta.append(history);
      let banner = article.querySelector('.legal-old-version');
      if (entry.version !== doc.current) {
        if (!banner) {
          banner = document.createElement('p');
          banner.className = 'legal-old-version';
          heading.after(banner);
        }
        banner.innerHTML = '';
        banner.append(`${L.label('older', locale)} `);
        const current = document.createElement('a');
        current.href = doc.page;
        current.textContent = L.label('viewCurrent', locale);
        banner.append(current);
      } else if (banner) {
        banner.remove();
      }
      article.querySelector('.document').innerHTML = L.render(content);
      document.title = `${title} - SheSay`;
      shown = locale;
      showRecords();
    } catch (_) {
      // Keep the built-in English text when the files cannot be loaded.
    }
  }

  // The signed-in member's consent records for this document, at the bottom
  // of the page; each opens the version that was accepted.
  let recordsVersion = 0;
  async function showRecords() {
    const version = ++recordsVersion;
    const client = window.SheSay?.client;
    const locale = L.locale();
    let rows = null;
    try {
      const { data: { session } } = client ? await client.auth.getSession() : { data: {} };
      if (session) {
        const { data, error } = await client.from('legal_acceptances')
          .select('version,locale,selected_at')
          .eq('user_id', session.user.id)
          .eq('document_key', key)
          .order('selected_at', { ascending: false });
        if (!error) rows = data;
      }
    } catch (_) {}
    if (version !== recordsVersion) return;
    article.querySelector('.legal-records')?.remove();
    if (!rows) return;
    const section = document.createElement('section');
    section.className = 'legal-records';
    const heading = document.createElement('h2');
    heading.textContent = L.label('records', locale);
    section.append(heading);
    if (!rows.length) {
      const empty = document.createElement('p');
      empty.textContent = L.label('noRecords', locale);
      section.append(empty);
    } else {
      const list = document.createElement('ul');
      for (const row of rows) {
        const item = document.createElement('li');
        const link = document.createElement('a');
        link.href = `${location.pathname.split('/').pop()}?version=${encodeURIComponent(row.version)}`;
        link.textContent = L.label('agreed', locale)
          .replace('{version}', row.version)
          .replace('{date}', L.dateTime(row.selected_at, locale));
        item.append(link);
        list.append(item);
      }
      section.append(list);
    }
    article.querySelector('.document').after(section);
  }
  // site.js (the Supabase client) loads after this file.
  document.addEventListener('DOMContentLoaded', () => {
    window.SheSay?.client?.auth.onAuthStateChange(() => setTimeout(showRecords, 0));
  });

  new MutationObserver(() => {
    if (L.locale() !== shown) show();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  show();
})();
