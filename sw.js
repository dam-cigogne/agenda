/* Service worker de l'appli Agenda — hors connexion.
   Le nom du cache porte la version : à chaque nouvelle version, changer VERSION
   ici ET APP_VERSION dans index.html. Préfixe « agd- » : on ne touche jamais
   aux caches des autres applis du même domaine (mc-, glf-…). */
const VERSION = '2.82.190';
/* Version de RÉFÉRENCE : le grand cadre bleu « Nouvelle version » ne s'affiche que sur les appareils plus anciens que celle-ci. La monter seulement pour une nouveauté que tout le monde doit avoir (garder égale à AM_VREF_DEF dans index.html). */
const VREF = '2.82.158';
const CACHE = 'agd-cache-v' + VERSION;
const ASSETS = [
  './',
  'index.html',
  'manifest.json',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'lib/html2canvas.min.js',
  'lib/xlsx.core.min.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('agd-cache-v') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // Pages : réseau d'abord (dernière version), sinon cache (hors connexion)
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put('index.html', copy));
          return res;
        })
        .catch(() => caches.match('index.html').then(r => r || caches.match('./')))
    );
    return;
  }

  // Fichiers : cache d'abord
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
      }
      return res;
    }))
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  // 2.82.148 : ouvrir directement la bonne page (réunion à voter, tâche confiée)
  const t = String(e.notification.title || '');
  const M = [[/Réunion de préparation/, 'rp'], [/Réunion mensuelle/, 'rn'], [/Amicale · Tâche/, 'tk'], [/Amicale · Courses/, 'co'], [/Amicale · Agenda/, 'ev'],
    [/Amicale · (Événement|Inscription|Affiches)/, 'ee'], [/Amicale · Notes/, 'nt'], [/Amicale · Membres/, 'am'], [/Amicale · Adhésion/, 'aq'], [/📬/, 'cx'], [/Amicale · Boîte à idées/, 'id'],
    [/Amicale · (Administratif|Cadeaux|Compte rendu|Bulletin)/, 'ad'], [/Amicale/, 'ac']];
  let go = ''; for (const [r, g] of M) { if (r.test(t)) { go = g; break; } }
  const nm = (String(e.notification.body || '').match(/«\s*([^»]{1,80}?)\s*»/) || [])[1] || '';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) { if ('focus' in c) { if (go) { try { c.postMessage({ agdGo: go, n: nm }); } catch (x) {} } return c.focus(); } }
      return self.clients.openWindow('./' + (go ? '?go=' + go : ''));
    })
  );
});

async function agdDec(b64) {
  const c = await caches.open('agd-rk'), r = await c.match('rk');
  if (!r) return null;
  const kb = Uint8Array.from(atob(await r.text()), x => x.charCodeAt(0));
  const key = await crypto.subtle.importKey('raw', kb, 'AES-GCM', false, ['decrypt']);
  const raw = Uint8Array.from(atob(b64), x => x.charCodeAt(0));
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12) }, key, raw.slice(12));
  return JSON.parse(new TextDecoder().decode(pt));
}
self.addEventListener('push', e => {
  e.waitUntil((async () => {
    let d = {};
    try { d = e.data ? e.data.json() : {}; } catch (x) { d = {}; }
    let rem = false;
    if (d.e) { rem = true; try { d = (await agdDec(d.e)) || { t: '⏰ Rappel', b: 'Ouvre l’appli pour voir.' }; } catch (x) { d = { t: '⏰ Rappel', b: 'Ouvre l’appli pour voir.' }; } }
    return self.registration.showNotification(d.t || 'Nouveau dans l’appli', { body: d.b || 'Ouvre l’appli pour voir les nouveautés.', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: d.g || 'agd-push', renotify: !rem });
  })());
});
