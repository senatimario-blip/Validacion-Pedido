const CACHE_NAME = 'admin-app-v21';

// Recursos mínimos a cachear para que la PWA sea instalable
const urlsToCache = [
    './index.html',
    './app.js',
    './styles.css',
    './Logo_mio.png'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                return cache.addAll(urlsToCache);
            })
    );
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    // Eliminar cachés antiguas si hubiera nuevas versiones
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    return self.clients.claim();
});

self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // Enviar repuesta del caché si existe, sino, hacer la petición a la red
                return response || fetch(event.request);
            })
    );
});
