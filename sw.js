// ネットワーク優先。オフラインのときだけ保存分を返す。
const CACHE = 'lifemaker2d-v4';
const CORE = [
    './',
    'index.html',
    'css/style.css',
    'js/app.js',
    'manifest.webmanifest',
    'icon.svg',
    'icon-192.png',
    'icon-512.png',
    ...['bed', 'sofa', 'chair', 'table', 'lowtable', 'desk', 'bookshelf', 'wardrobe', 'chest', 'nightstand', 'tvstand', 'lamp', 'lamp2', 'plant', 'plant2', 'vase2', 'rug', 'tv', 'vase', 'window', 'window2', 'picture'].flatMap(n => [`img/${n}.webp`, `img/${n}_parts.png`]),
    ...[1, 2, 3, 4, 5, 6, 7, 8].map(n => `img/resident_${n}.webp`),
    'img/sprites.json',
    'img/fit.json',
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
