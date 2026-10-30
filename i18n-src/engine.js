// Translates the site's own text (not member content) into the visitor's
// language. Text and the placeholder/aria-label/title/alt attributes are
// matched against the English source strings; text that page scripts write
// later is caught by a MutationObserver, so scripts can keep writing English.
(function () {
  const data = window.SheSayI18nData;
  const lookup = {};
  for (const lang of Object.keys(data.strings)) {
    const map = new Map();
    data.strings.en.forEach((text, i) => map.set(text, data.strings[lang][i]));
    lookup[lang] = map;
  }
  // "{0} credits" style templates; captured parts are translated too.
  const patterns = data.templates.map(entry => {
    const slots = [];
    const source = entry.en.split(/(\{\d\})/).map(part => {
      const slot = /^\{(\d)\}$/.exec(part);
      if (slot) { slots.push(slot[1]); return '(.+?)'; }
      return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }).join('');
    return { entry, slots, regex: new RegExp(`^${source}$`) };
  });

  let locale = 'en';
  function translate(text, lang = locale) {
    if (lang === 'en' || !text) return null;
    const exact = lookup[lang] && lookup[lang].get(text);
    if (exact !== undefined) return exact;
    for (const { entry, slots, regex } of patterns) {
      const match = regex.exec(text);
      if (!match) continue;
      let out = entry[lang];
      slots.forEach((slot, i) => {
        const part = match[i + 1];
        out = out.replace(`{${slot}}`, translate(part, lang) ?? part);
      });
      return out;
    }
    return null;
  }
  const t = text => translate(text) ?? text;

  const ATTRS = ['placeholder', 'aria-label', 'title', 'alt'];
  const SKIP = 'script,style,noscript,textarea,.site-language,[data-no-translate]';
  // English source and the value last written by us, per text node and per
  // element attribute; anything else in the DOM was written by a page script.
  const originals = new WeakMap();
  const written = new WeakMap();
  const attrOriginals = new WeakMap();

  function localized(raw) {
    const key = raw.replace(/\s+/g, ' ').trim();
    if (!key || !/[A-Za-z]/.test(key)) return raw;
    const translated = translate(key);
    if (translated == null) return raw;
    return raw.match(/^\s*/)[0] + translated + raw.match(/\s*$/)[0];
  }

  function applyText(node) {
    const parent = node.parentElement;
    if (!parent || parent.closest(SKIP)) return;
    if (!originals.has(node) || node.data !== written.get(node)) originals.set(node, node.data);
    const next = localized(originals.get(node));
    if (node.data !== next) node.data = next;
    written.set(node, node.data);
  }

  function applyAttrs(el) {
    if (el.closest(SKIP)) return;
    let saved = attrOriginals.get(el);
    if (!saved) attrOriginals.set(el, saved = {});
    for (const name of ATTRS) {
      const value = el.getAttribute(name);
      if (value == null) continue;
      const entry = saved[name];
      if (!entry || value !== entry.written) saved[name] = { source: value };
      const next = localized(saved[name].source);
      if (value !== next) el.setAttribute(name, next);
      saved[name].written = next;
    }
  }

  function applyTree(root) {
    if (root.nodeType === Node.TEXT_NODE) return applyText(root);
    if (root.nodeType !== Node.ELEMENT_NODE) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) applyText(node);
    if (root.matches(ATTRS.map(a => `[${a}]`).join(','))) applyAttrs(root);
    root.querySelectorAll(ATTRS.map(a => `[${a}]`).join(',')).forEach(applyAttrs);
  }

  new MutationObserver(mutations => {
    for (const m of mutations) {
      if (m.type === 'characterData') applyText(m.target);
      else if (m.type === 'attributes') applyAttrs(m.target);
      else m.addedNodes.forEach(applyTree);
    }
  }).observe(document.documentElement, {
    subtree: true, childList: true, characterData: true,
    attributes: true, attributeFilter: ATTRS,
  });

  function setLocale(lang) {
    locale = lookup[lang] ? lang : 'en';
    document.documentElement.lang = locale;
    applyTree(document.documentElement);
  }

  window.SheSayI18n = {
    t,
    setLocale,
    get locale() { return locale; },
    languages: [
      ['en', 'English'], ['es', 'Español'], ['fr', 'Français'], ['it', 'Italiano'],
      ['zh', '中文'], ['de', 'Deutsch'], ['pt', 'Português'], ['ja', '日本語'],
    ],
  };
})();
