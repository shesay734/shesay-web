// Browsers cannot query installation. Cancel the fallback when the app takes
// focus, otherwise send the visitor to the homepage with its download button.
document.addEventListener('click', event => {
  const link = event.target.closest('a[href^="shesay://"]');
  if (!link) return;
  event.preventDefault();
  let timer;
  const cleanup = () => {
    clearTimeout(timer);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', cleanup);
  };
  const onVisibility = () => { if (document.hidden) cleanup(); };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', cleanup, { once: true });
  timer = setTimeout(() => {
    cleanup();
    if (!document.hidden) location.assign('index.html');
  }, 1800);
  // Keep navigation in the user's click gesture; blocked schemes still leave
  // the already-armed homepage fallback active.
  try {
    location.href = link.href;
  } catch (_) { /* The homepage timer handles a rejected scheme. */ }
});

