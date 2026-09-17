// Service worker de notificaciones.
// Corre aparte de la pagina: por eso vuelve a declarar la configuracion.
importScripts('https://www.gstatic.com/firebasejs/12.17.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.17.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyAIBI_0S-GXSN0oAYg_65zAzy7SVc9eexA",
  authDomain: "subscriptions-bernardo.firebaseapp.com",
  projectId: "subscriptions-bernardo",
  storageBucket: "subscriptions-bernardo.firebasestorage.app",
  messagingSenderId: "559735839426",
  appId: "1:559735839426:web:f51569ba4bcd5b816bb95b"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function (payload) {
  const d = payload.data || {};
  self.registration.showNotification(d.title || 'Cobro próximo', {
    body: d.body || '',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    tag: d.tag || 'cobro',
    data: { url: d.url || '/suscripciones/' }
  });
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/suscripciones/';
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (const c of list) if (c.url.includes('/suscripciones') && 'focus' in c) return c.focus();
    if (clients.openWindow) return clients.openWindow(url);
  }));
});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
