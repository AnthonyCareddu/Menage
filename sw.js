const CACHE = 'menage-v6';
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

function b64urlU8(s) {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const u = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
  return u;
}

/* le navigateur a fait tourner l'abonnement pendant que l'app était fermée :
   on se réabonne avec la clé VAPID mise en cache et on prévient le serveur. */
self.addEventListener('pushsubscriptionchange', e => {
  e.waitUntil((async () => {
    const api = await confValeur('api');
    const jeton = await confValeur('jeton');
    const vapid = await confValeur('vapid');
    if (!api || !vapid) return;
    let sub;
    try {
      sub = await self.registration.pushManager.subscribe({
        userVisibleOnly: true, applicationServerKey: b64urlU8(vapid)
      });
    } catch (err) { return; }
    const j = sub.toJSON();
    const moi = await confValeur('moi');
    const u = new URL(api);
    u.searchParams.set('action', 'subscribePush');
    u.searchParams.set('jeton', jeton);
    u.searchParams.set('endpoint', j.endpoint);
    u.searchParams.set('p256dh', j.keys.p256dh);
    u.searchParams.set('auth', j.keys.auth);
    if (moi) u.searchParams.set('qui', moi);
    u.searchParams.set('matin', (await confValeur('notif_matin')) === 'non' ? 'non' : 'oui');
    u.searchParams.set('soir', (await confValeur('notif_soir')) === 'non' ? 'non' : 'oui');
    await fetch(u.toString()).catch(() => {});
  })());
});

self.addEventListener('push', e => {
  e.waitUntil((async () => {
    let titre = 'Ménage', corps = 'Ouvrir pour voir les tâches.';
    try {
      const api = await confValeur('api');
      const moi = await confValeur('moi');
      const jeton = await confValeur('jeton');
      if (api) {
        const u = new URL(api);
        u.searchParams.set('action', 'digest');
        u.searchParams.set('jeton', jeton);
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
