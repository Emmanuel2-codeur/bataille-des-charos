/* Service Worker - Notifications Push */

self.addEventListener('install', (event) => {
  console.log('[SW] Installation');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activation');

  event.waitUntil(
    self.clients.claim()
  );
});

self.addEventListener('push', (event) => {
  console.log('[SW] Push reçu');

  let data = {};

  try {
    data = event.data ? event.data.json() : {};
  } catch (error) {
    console.warn('[SW] Payload non JSON');
    data = {
      title: 'Nouvelle notification',
      body: event.data ? event.data.text() : ''
    };
  }

  const title = data.title || 'La Bataille des Charos';

  const options = {
    body: data.body || 'Vous avez une nouvelle notification.',
    icon: data.icon || '/favicon.ico',
    badge: data.badge || '/favicon.ico',
    data: {
      url: data.url || '/'
    },
    vibrate: [100, 50, 100],
    tag: data.tag || 'charos-notification',
    renotify: true
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    }).then((clients) => {

      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }

      return null;
    })
  );
});