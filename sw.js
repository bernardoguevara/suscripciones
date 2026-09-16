// Service worker minimo.
// Por ahora solo hace la app instalable y no cachea nada:
// asi cada deploy se ve al instante, sin versiones viejas pegadas.
// En el siguiente paso aqui se agrega el manejo de notificaciones.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
