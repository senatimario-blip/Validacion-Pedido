const CACHE_NAME = 'repartidor-app-v2';

// Recursos mínimos a cachear para que la PWA sea instalable
const urlsToCache = [
    './repartidor.html',
    './repartidor.js',
    './Logo_mio.png'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                return cache.addAll(urlsToCache);
            })
    );
    // Forzar que el nuevo SW tome control inmediatamente
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    // Eliminar TODAS las cachés antiguas al activar nueva versión
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[SW] Eliminando caché antigua:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    return self.clients.claim();
});

// ESTRATEGIA: Network First (Red primero, Caché como respaldo)
// Siempre intenta descargar la versión más nueva del servidor.
// Solo usa el caché cuando no hay conexión a internet.
self.addEventListener('fetch', event => {
    event.respondWith(
        fetch(event.request)
            .then(networkResponse => {
                // Si la red respondió bien, actualizar el caché con la versión nueva
                if (networkResponse && networkResponse.status === 200) {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseClone);
                    });
                }
                return networkResponse;
            })
            .catch(() => {
                // Sin internet: servir desde el caché (modo offline)
                return caches.match(event.request);
            })
    );
});
