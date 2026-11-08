// Service Worker: アプリ本体と Firebase SDK を端末に保存し、オフラインでも開けるようにする。
// 公開するたびに VERSION を上げる。ブラウザは sw.js の中身が変わったときだけ新しい版を入れ、
// そのときにアプリ本体をまとめて取り直す（版が同じあいだは、アプリ本体を通信で取りに行かない）。
const VERSION = 'ed-0.5.0';
const APP_FILES = ['./', './index.html', './manifest.webmanifest', './css/app.css',
  './js/app.js', './js/config.js', './js/dom.js', './js/fsrs.js', './js/model.js', './js/content.js', './js/quiz.js', './js/matcache.js', './js/speech.js', './js/update.js',
  './js/backend-firebase.js', './js/backend-mock.js',
  './js/ui/parts.js', './js/ui/home.js', './js/ui/material.js', './js/ui/study.js', './js/ui/progress.js', './js/ui/settings.js',
  './js/ui/admin.js', './js/ui/read.js', './js/ui/profiles.js', './js/ui/add.js', './js/ui/play.js', './js/ui/drill.js',
  './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(APP_FILES.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  const isApp = url.origin === location.origin;
  const isSdk = (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) || url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!isApp && !isSdk) return; // Firestore/Auth の通信はそのまま（SDK とフォントは端末に保存）
  // 端末に保存してあるものを返す。無いものだけ通信で取り、保存する（次の版では新しい保存場所に取り直す）。
  const fromNet = () => fetch(e.request, isApp ? { cache: 'no-cache' } : undefined).then(res => {
    if (res.ok || res.type === 'opaque') { const copy = res.clone(); e.waitUntil(caches.open(VERSION).then(c => c.put(e.request, copy))); }
    return res;
  });
  e.respondWith(
    caches.match(e.request, { ignoreSearch: isApp && e.request.mode === 'navigate' }).then(hit => hit ||
      fromNet().catch(() => (isApp && e.request.mode === 'navigate' ? caches.match('./index.html') : undefined)))
  );
});
