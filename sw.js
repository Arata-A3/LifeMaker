// ネットワーク優先。オフラインのときだけ保存分を返す。
const CACHE = 'lifemaker-v1';
const CORE = [
    './',
    'index.html',
    'css/style.css',
    'js/app.js',
    'lib/three.module.min.js',
    'manifest.webmanifest',
    'icon.svg',
    'icon-192.png',
    'icon-512.png',
];

self.addEventListener('install', (e) => {
    e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (e) => {
    const req = e.request;
    if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
    // navigate のリクエストは init 付きで作り直せないので、URL から作る
    const fresh = req.mode === 'navigate'
        ? new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' })
        : new Request(req, { cache: 'no-cache' });
    e.respondWith(
        fetch(fresh)
            .then(res => {
                if (res.ok) {
                    const copy = res.clone();
                    caches.open(CACHE).then(c => c.put(req, copy));
                }
                return res;
            })
            .catch(() => caches.match(req, { ignoreSearch: true }))
    );
});
