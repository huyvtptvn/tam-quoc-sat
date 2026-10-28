// PWA: đăng ký service worker, nút "Cài app" (Android / máy tính) + hướng dẫn cho iPhone, giữ màn hình sáng khi đang trong trận.
(function () {
  'use strict';
  const standalone = () => matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches || navigator.standalone === true;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  document.documentElement.classList.toggle('pwa-app', standalone());

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
  }

  // ---------- Nút cài app ----------
  let deferred = null;
  const btns = () => document.querySelectorAll('[data-pwa-install]');
  const showBtns = (on) => btns().forEach((b) => b.classList.toggle('hidden', !on));
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; showBtns(!standalone()); });
  addEventListener('appinstalled', () => { deferred = null; showBtns(false); });

  function iosHelp() {
    const box = document.createElement('div');
    box.className = 'pwa-help';
    box.innerHTML = `<div class="pwa-card" role="dialog" aria-label="Cài Tam Quốc Sát lên iPhone">
      <img src="/icons/icon-192.png" alt="" width="64" height="64">
      <h3>Cài Tam Quốc Sát lên iPhone</h3>
      <ol>
        <li>Mở trang này bằng <b>Safari</b>.</li>
        <li>Bấm nút <b>Chia sẻ</b> <span class="pwa-ico">⬆︎</span> ở thanh dưới.</li>
        <li>Chọn <b>“Thêm vào MH chính”</b> rồi bấm <b>Thêm</b>.</li>
      </ol>
      <p>Sau đó mở game từ biểu tượng trên màn hình chính để chơi toàn màn hình.</p>
      <button type="button" class="btn primary">Đã hiểu</button></div>`;
    box.onclick = (e) => { if (e.target === box || e.target.tagName === 'BUTTON') box.remove(); };
    document.body.appendChild(box);
  }

  async function install() {
    if (deferred) {
      deferred.prompt();
      try { await deferred.userChoice; } catch { /* bỏ qua */ }
      deferred = null;
      showBtns(false);
    } else if (ios) iosHelp();
  }
  document.addEventListener('click', (e) => { if (e.target.closest?.('[data-pwa-install]')) install(); });
  addEventListener('DOMContentLoaded', () => showBtns(!standalone() && ios));

  // ---------- Giữ màn hình sáng trong trận ----------
  let lock = null;
  async function wake() {
    const inGame = !!document.querySelector('#game:not(.hidden)');
    try {
      if (inGame && document.visibilityState === 'visible' && !lock && navigator.wakeLock) {
        lock = await navigator.wakeLock.request('screen');
        lock.addEventListener('release', () => { lock = null; });
      } else if (!inGame && lock) { await lock.release(); lock = null; }
    } catch { lock = null; }
  }
  document.addEventListener('visibilitychange', wake);
  addEventListener('DOMContentLoaded', () => {
    const g = document.getElementById('game');
    if (g) new MutationObserver(wake).observe(g, { attributes: true, attributeFilter: ['class'] });
    wake();
  });
})();
