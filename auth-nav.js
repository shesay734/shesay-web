// Shared account control for the public SheSay site.
(() => {
  const nav = document.querySelector('.corporate-header .corporate-nav');
  const client = window.SheSay?.client;
  if (!nav || !client) return;

  const guestLink = nav.querySelector('a[href^="auth.html"]');
  if (guestLink) {
    // Return to the page that opened the sign-in form, not the wallet fallback.
    const next = location.pathname + location.search + location.hash;
    guestLink.href = 'auth.html?next=' + encodeURIComponent(next) + '#register';
  }

  const footerJoinLinks = [...document.querySelectorAll('.corporate-footer a[href="auth.html#register"]')];
  const account = document.createElement('div');
  account.className = 'account-nav';
  account.hidden = true;
  account.innerHTML = `
    <button class="account-nav-trigger" type="button" aria-haspopup="true" aria-expanded="false" aria-controls="account-nav-dropdown">
      <span class="account-nav-avatar" aria-hidden="true"><img alt="" hidden><span>?</span></span>
      <span class="account-nav-name"></span>
      <span class="account-nav-chevron" aria-hidden="true">⌄</span>
    </button>
    <div class="account-nav-dropdown" id="account-nav-dropdown" hidden>
      <a href="index.html" role="menuitem">主页</a>
      <button type="button" role="menuitem" class="account-nav-signout">退出登录</button>
    </div>`;
  nav.append(account);

  const trigger = account.querySelector('.account-nav-trigger');
  const dropdown = account.querySelector('.account-nav-dropdown');
  const nameEl = account.querySelector('.account-nav-name');
  const image = account.querySelector('img');
  const fallback = account.querySelector('.account-nav-avatar span');
  const signOutButton = account.querySelector('.account-nav-signout');
  let renderVersion = 0;

  function closeDropdown() {
    dropdown.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
  }

  trigger.addEventListener('click', () => {
    const willOpen = dropdown.hidden;
    dropdown.hidden = !willOpen;
    trigger.setAttribute('aria-expanded', String(willOpen));
  });
  document.addEventListener('click', event => {
    if (!account.contains(event.target)) closeDropdown();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !dropdown.hidden) {
      closeDropdown();
      trigger.focus();
    }
  });

  function showGuest() {
    closeDropdown();
    account.hidden = true;
    if (guestLink) guestLink.hidden = false;
    footerJoinLinks.forEach(link => {
      link.href = 'auth.html#register';
      link.textContent = 'Join SheSay';
    });
  }

  async function refreshAccount() {
    const version = ++renderVersion;
    try {
      // getUser validates the existing session; anonymous auth isn't a signed-in member.
      const { data: { user }, error } = await client.auth.getUser();
      if (version !== renderVersion) return;
      if (error || !user || user.is_anonymous) {
        showGuest();
        return;
      }

      const { data: profile } = await client.from('profiles')
        .select('nickname,avatar_url')
        .eq('id', user.id)
        .maybeSingle();
      if (version !== renderVersion) return;

      const nickname = profile?.nickname || user.user_metadata?.nickname || user.email?.split('@')[0] || 'SheSay user';
      const avatarUrl = profile?.avatar_url || user.user_metadata?.avatar_url || '';
      nameEl.textContent = nickname;
      fallback.textContent = Array.from(nickname.trim())[0]?.toUpperCase() || '?';
      fallback.hidden = false;
      image.hidden = true;
      image.removeAttribute('src');
      if (typeof avatarUrl === 'string' && /^https:\/\//i.test(avatarUrl)) {
        image.onload = () => { image.hidden = false; fallback.hidden = true; };
        image.onerror = () => { image.hidden = true; fallback.hidden = false; };
        image.src = avatarUrl;
      }

      closeDropdown();
      if (guestLink) guestLink.hidden = true;
      account.hidden = false;
      footerJoinLinks.forEach(link => {
        link.href = 'index.html';
        link.textContent = '主页';
      });
    } catch (error) {
      if (version === renderVersion) {
        console.warn('Could not load SheSay account menu:', error);
        showGuest();
      }
    }
  }

  signOutButton.addEventListener('click', async () => {
    signOutButton.disabled = true;
    try {
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) throw error;
      location.reload();
    } catch (error) {
      alert('退出登录失败，请重试。');
      signOutButton.disabled = false;
    }
  });

  // Run after auth events, outside the callback to avoid blocking Supabase auth.
  client.auth.onAuthStateChange(() => setTimeout(refreshAccount, 0));
  refreshAccount();
})();
