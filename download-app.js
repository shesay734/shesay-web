(() => {
  const releaseUrl = 'https://github.com/shesay734/SheApp/releases/tag/debug-latest';
  const apkUrls = {
    'arm64-v8a': 'https://github.com/shesay734/SheApp/releases/download/v0.0.6/SheSay-android-arm64-v8a-release.apk',
    'armeabi-v7a': 'https://github.com/shesay734/SheApp/releases/download/debug-latest/SheSay-android-armeabi-v7a-debug.apk',
    x86_64: 'https://github.com/shesay734/SheApp/releases/download/debug-latest/SheSay-android-x86_64-debug.apk'
  };
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

  document.querySelectorAll('[data-release-link]').forEach(link => {
    link.href = apkUrls[link.dataset.abi] || releaseUrl;
    link.target = '_blank';
    link.rel = 'noreferrer';
    const label = link.querySelector('em');
    if (label && apkUrls[link.dataset.abi]) label.textContent = link.dataset.abi === 'arm64-v8a' ? 'Download signed APK ↗' : 'Download preview APK ↗';
  });
  options.forEach(option => option.classList.toggle('is-recommended', option.dataset.abi === abi));

  if (recommendation) {
    if (android) {
      const label = abi === 'x86_64' ? 'AMD64 / x86_64' : abi === 'armeabi-v7a' ? '32-bit ARM' : 'ARM64';
      recommendation.innerHTML = `We detected <strong>Android · ${label}</strong>. The matching ABI is highlighted below.`;
    } else if (apple) {
      recommendation.innerHTML = 'We detected <strong>Apple hardware</strong>. The iOS build will be distributed through TestFlight or the App Store once Apple signing is configured.';
    } else {
      recommendation.innerHTML = 'Choose an Android ABI below to download the build made for your device.';
    }
  }
})();
