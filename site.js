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

  return { client, fusion };
})();

// Shared language picker for the public web experience. Content authored by
// members is left untouched; this translates the site's navigation and chrome.
(function addSiteLanguagePicker() {
  const languages = [
    ['en', 'English'], ['es', 'Español'], ['fr', 'Français'], ['it', 'Italiano'],
    ['zh', '中文'], ['de', 'Deutsch'], ['pt', 'Português'], ['ja', '日本語'],
  ];
  const copy = {
    es: { 'About':'Acerca de', 'The app':'La app', 'Business':'Empresa', 'Help':'Ayuda', 'Log In/Sign Up':'Iniciar sesión / Registrarse', 'Discover SheSay':'Descubre SheSay', 'Shared on SheSay':'Compartido en SheSay', 'Explore the app':'Explorar la app', 'Read in SheSay':'Leer en SheSay', 'Continue in SheSay':'Continuar en SheSay', 'Join the room in SheSay':'Unirse a la sala en SheSay', 'A little closer to your community.':'Un poco más cerca de tu comunidad.', 'Privacy':'Privacidad', 'Terms':'Términos', 'Download':'Descargar', 'The app':'La app', 'Get the app':'Descargar la app' },
    fr: { 'About':'À propos', 'The app':'L’application', 'Business':'Entreprise', 'Help':'Aide', 'Log In/Sign Up':'Se connecter / S’inscrire', 'Discover SheSay':'Découvrir SheSay', 'Shared on SheSay':'Partagé sur SheSay', 'Explore the app':'Découvrir l’application', 'Read in SheSay':'Lire dans SheSay', 'Continue in SheSay':'Continuer dans SheSay', 'Join the room in SheSay':'Rejoindre la salle dans SheSay', 'A little closer to your community.':'Un peu plus proche de votre communauté.', 'Privacy':'Confidentialité', 'Terms':'Conditions', 'Download':'Télécharger', 'Get the app':'Télécharger l’application' },
    it: { 'About':'Chi siamo', 'The app':'L’app', 'Business':'Azienda', 'Help':'Aiuto', 'Log In/Sign Up':'Accedi / Registrati', 'Discover SheSay':'Scopri SheSay', 'Shared on SheSay':'Condiviso su SheSay', 'Explore the app':'Scopri l’app', 'Read in SheSay':'Leggi in SheSay', 'Continue in SheSay':'Continua in SheSay', 'Join the room in SheSay':'Entra nella stanza su SheSay', 'A little closer to your community.':'Più vicina alla tua comunità.', 'Privacy':'Privacy', 'Terms':'Termini', 'Download':'Scarica', 'Get the app':'Scarica l’app' },
    zh: { 'About':'关于我们', 'The app':'应用', 'Business':'业务', 'Help':'帮助', 'Log In/Sign Up':'登录 / 注册', 'Discover SheSay':'探索 SheSay', 'Shared on SheSay':'分享自 SheSay', 'Explore the app':'探索应用', 'Read in SheSay':'在 SheSay 中阅读', 'Continue in SheSay':'在 SheSay 中继续', 'Join the room in SheSay':'在 SheSay 中加入茶室', 'A little closer to your community.':'和你的社区更近一点。', 'Privacy':'隐私', 'Terms':'条款', 'Download':'下载', 'Get the app':'下载应用' },
    de: { 'About':'Über uns', 'The app':'Die App', 'Business':'Unternehmen', 'Help':'Hilfe', 'Log In/Sign Up':'Anmelden / Registrieren', 'Discover SheSay':'SheSay entdecken', 'Shared on SheSay':'Auf SheSay geteilt', 'Explore the app':'App entdecken', 'Read in SheSay':'In SheSay lesen', 'Continue in SheSay':'In SheSay fortfahren', 'Join the room in SheSay':'Raum in SheSay beitreten', 'A little closer to your community.':'Deiner Community ein Stück näher.', 'Privacy':'Datenschutz', 'Terms':'Bedingungen', 'Download':'Download', 'Get the app':'App herunterladen' },
    pt: { 'About':'Sobre', 'The app':'O app', 'Business':'Empresa', 'Help':'Ajuda', 'Log In/Sign Up':'Entrar / Cadastrar', 'Discover SheSay':'Descubra o SheSay', 'Shared on SheSay':'Compartilhado no SheSay', 'Explore the app':'Explorar o app', 'Read in SheSay':'Ler no SheSay', 'Continue in SheSay':'Continuar no SheSay', 'Join the room in SheSay':'Entrar na sala pelo SheSay', 'A little closer to your community.':'Mais perto da sua comunidade.', 'Privacy':'Privacidade', 'Terms':'Termos', 'Download':'Baixar', 'Get the app':'Baixar o app' },
    ja: { 'About':'SheSayについて', 'The app':'アプリ', 'Business':'事業', 'Help':'ヘルプ', 'Log In/Sign Up':'ログイン / 登録', 'Discover SheSay':'SheSayを見つける', 'Shared on SheSay':'SheSayで共有', 'Explore the app':'アプリを見る', 'Read in SheSay':'SheSayで読む', 'Continue in SheSay':'SheSayで続ける', 'Join the room in SheSay':'SheSayでルームに参加', 'A little closer to your community.':'コミュニティをもっと身近に。', 'Privacy':'プライバシー', 'Terms':'利用規約', 'Download':'ダウンロード', 'Get the app':'アプリをダウンロード' },
  };
  const key = 'shesay-web-locale';
  const original = new WeakMap();
  function translate(locale) {
    const table = copy[locale] || {};
    document.querySelectorAll('a,button,p,h1,h2,h3,strong,small,span,label').forEach(node => {
      if (!original.has(node)) original.set(node, node.textContent.trim());
      const text = original.get(node);
      if (text && table[text]) node.textContent = table[text];
    });
    document.documentElement.lang = locale;
  }
  function mount() {
    const host = document.querySelector('.corporate-header, .share-header, .site-header, .home-header');
    if (!host || host.querySelector('.site-language')) return;
    const wrap = document.createElement('label');
    wrap.className = 'site-language';
    wrap.title = 'Language';
    const select = document.createElement('select');
    select.setAttribute('aria-label', 'Language');
    languages.forEach(([value, label]) => { const option = new Option(label, value); select.appendChild(option); });
    const saved = localStorage.getItem(key) || (navigator.language || 'en').split('-')[0];
    select.value = languages.some(([value]) => value === saved) ? saved : 'en';
    select.addEventListener('change', () => { localStorage.setItem(key, select.value); translate(select.value); });
    wrap.append('◎ ', select);
    host.appendChild(wrap);
    translate(select.value);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true }); else mount();
})();
