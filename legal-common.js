// Shared by the legal pages, the version history page and the sign-up /
// log-in consent: reads legal/index.json and the document texts.
(() => {
  const supported = ['en', 'zh', 'es', 'fr', 'it', 'de', 'ja', 'pt'];
  const labels = {
    version: { en: 'Version', zh: '版本', es: 'Versión', fr: 'Version', it: 'Versione', de: 'Version', ja: 'バージョン', pt: 'Versão' },
    published: { en: 'Published', zh: '发布日期', es: 'Publicada', fr: 'Publiée', it: 'Pubblicata', de: 'Veröffentlicht', ja: '公開日', pt: 'Publicada' },
    history: { en: 'Version history', zh: '历史版本', es: 'Historial de versiones', fr: 'Historique des versions', it: 'Cronologia delle versioni', de: 'Versionsverlauf', ja: 'バージョン履歴', pt: 'Histórico de versões' },
    current: { en: 'Current version', zh: '当前版本', es: 'Versión actual', fr: 'Version actuelle', it: 'Versione attuale', de: 'Aktuelle Version', ja: '現在のバージョン', pt: 'Versão atual' },
    older: { en: 'You are reading an earlier version.', zh: '你正在查看历史版本。', es: 'Estás leyendo una versión anterior.', fr: 'Vous lisez une version antérieure.', it: 'Stai leggendo una versione precedente.', de: 'Sie lesen eine frühere Version.', ja: '以前のバージョンを表示しています。', pt: 'Você está lendo uma versão anterior.' },
    viewCurrent: { en: 'Read the current version', zh: '查看当前版本', es: 'Leer la versión actual', fr: 'Lire la version actuelle', it: 'Leggi la versione attuale', de: 'Aktuelle Version lesen', ja: '現在のバージョンを読む', pt: 'Ler a versão atual' },
    records: { en: 'Your consent records', zh: '你的同意记录', es: 'Tus registros de consentimiento', fr: 'Vos enregistrements de consentement', it: 'I tuoi consensi registrati', de: 'Ihre Zustimmungen', ja: 'あなたの同意記録', pt: 'Seus registros de consentimento' },
    agreed: { en: 'You agreed to version {version} on {date}', zh: '你于 {date} 同意了版本 {version}', es: 'Aceptaste la versión {version} el {date}', fr: 'Vous avez accepté la version {version} le {date}', it: 'Hai accettato la versione {version} il {date}', de: 'Sie haben Version {version} am {date} zugestimmt', ja: '{date} にバージョン {version} に同意しました', pt: 'Você aceitou a versão {version} em {date}' },
    noRecords: { en: 'No consent has been recorded for this account.', zh: '此账号尚无同意记录。', es: 'No hay consentimientos registrados para esta cuenta.', fr: 'Aucun consentement n’est enregistré pour ce compte.', it: 'Nessun consenso registrato per questo account.', de: 'Für dieses Konto ist keine Zustimmung gespeichert.', ja: 'このアカウントの同意記録はありません。', pt: 'Nenhum consentimento registrado para esta conta.' },
    back: { en: 'Back to the document', zh: '返回文档', es: 'Volver al documento', fr: 'Retour au document', it: 'Torna al documento', de: 'Zurück zum Dokument', ja: '文書に戻る', pt: 'Voltar ao documento' },
  };
  let indexPromise = null;
  const texts = {};

  const escape = (text) => text.replace(/[&<>"]/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
  })[c]);

  window.SheSayLegal = {
    locale() {
      const lang = (document.documentElement.lang || 'en').split('-')[0];
      return supported.includes(lang) ? lang : 'en';
    },
    label(name, locale) {
      return labels[name][locale] || labels[name].en;
    },
    date(iso, locale) {
      try {
        return new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale, {
          year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
        });
      } catch (_) {
        return iso;
      }
    },
    dateTime(iso, locale) {
      try {
        return new Date(iso).toLocaleString(locale, {
          year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit',
        });
      } catch (_) {
        return iso;
      }
    },
    // Always fresh, so a newly published version shows at once.
    index() {
      indexPromise ??= fetch('legal/index.json', { cache: 'no-cache' }).then((r) => {
        if (!r.ok) throw new Error(`legal index ${r.status}`);
        return r.json();
      });
      return indexPromise;
    },
    async text(key, version, locale) {
      const path = `legal/${key}/${version}/${locale}.txt`;
      texts[path] ??= fetch(path).then((r) => {
        if (!r.ok) throw new Error(`legal text ${r.status}`);
        return r.text();
      });
      return texts[path];
    },
    // "1. Heading" lines become headings, "• item" lines a list, everything
    // else a paragraph (the same structure the app shows).
    render(content) {
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
    },
  };
})();
