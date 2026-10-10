(() => {
  const releaseUrl = 'https://github.com/shesay734/SheApp/releases';
  const recommendation = document.querySelector('[data-download-recommendation]');
  const options = [...document.querySelectorAll('[data-abi]')];
  const platform = (navigator.userAgentData?.platform || navigator.platform || navigator.userAgent || '').toLowerCase();
  const hints = navigator.userAgentData?.architecture || '';
  const fingerprint = `${platform} ${hints} ${navigator.userAgent || ''}`.toLowerCase();
  const android = /android/.test(fingerprint);
  const apple = /iphone|ipad|ipod|ios|macintosh/.test(fingerprint);
  const abi = /x86_64|amd64|x86-64|win64/.test(fingerprint)
    ? 'x86_64'
    : /armv7|armeabi|arm;/.test(fingerprint)
    ? 'armeabi-v7a'
    : 'arm64-v8a';

  document.querySelectorAll('[data-release-link]').forEach(link => { link.href = releaseUrl; });
  options.forEach(option => option.classList.toggle('is-recommended', option.dataset.abi === abi));

  if (recommendation) {
    if (android) {
      const label = abi === 'x86_64' ? 'AMD64 / x86_64' : abi === 'armeabi-v7a' ? '32-bit ARM' : 'ARM64';
      recommendation.innerHTML = `We detected <strong>Android · ${label}</strong>. The matching ABI is highlighted below.`;
    } else if (apple) {
      recommendation.innerHTML = 'We detected <strong>Apple hardware</strong>. The iOS build will be distributed through TestFlight or the App Store once Apple signing is configured.';
    } else {
      recommendation.innerHTML = 'Choose an Android ABI below, or open the release page to see the builds available for your device.';
    }
  }
})();
