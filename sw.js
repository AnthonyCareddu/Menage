const CACHE = 'menage-v4';
const SHELL = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(k => Promise.all(k.filter(n => n !== CACHE && n !== 'conf').map(n => caches.delete(n))))
    .then(() => self.clients.claim()));
});

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.hostname.includes('script.google') || url.hostname.includes('googleusercontent')) return;
  e.respondWith(
    fetch(e.request)
      .then(r => {
        const copy = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return r;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});

/* ------------------------------------------------------------ notifications */

async function confValeur(cle) {
  const c = await caches.open('conf');
  const r = await c.match(cle);
  return r ? r.text() : '';
}

self.addEventListener('push', e => {
  e.waitUntil((async () => {
    let titre = 'Ménage', corps = 'Ouvrir pour voir les tâches.';
    try {
      const api = await confValeur('api');
      const moi = await confValeur('moi');
      if (api) {
        const u = new URL(api);
        u.searchParams.set('action', 'digest');
        if (moi) u.searchParams.set('qui', moi);
        const j = await fetch(u.toString()).then(r => r.json());
        if (j && j.ok && j.data) { titre = j.data.titre || titre; corps = j.data.corps || ''; }
      }
    } catch (err) { /* on affiche le message générique */ }
    await self.registration.showNotification(titre, {
      body: corps,
      icon: './icon-192.png',
      badge: './icon-192.png',
      lang: 'fr',
      tag: 'menage',
      renotify: true
    });
  })());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if ('focus' in w) { w.focus(); return; }
    }
    if (self.clients.openWindow) await self.clients.openWindow('./');
  })());
});
