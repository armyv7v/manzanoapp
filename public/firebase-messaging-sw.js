// Este archivo DEBE estar en la carpeta 'public'

// Firebase recomienda importar los scripts de esta manera en el Service Worker
importScripts('/__/firebase/11.6.1/firebase-app-compat.js');
importScripts('/__/firebase/11.6.1/firebase-messaging-compat.js');

// Inicializa la app de Firebase en el Service Worker,
// pasándole la configuración desde el script de inicialización de Firebase Hosting.
importScripts('/__/firebase/init.js');

const messaging = firebase.messaging();

/**
 * Este manejador se activa cuando llega una notificación push y la app está en segundo plano o cerrada.
 * Es la forma más robusta de asegurar que la notificación se muestre.
 */
self.addEventListener('push', (event) => {
  console.log('[Service Worker] Push Received.');
  const payload = event.data.json();
  console.log('[Service Worker] Push payload: ', payload);

  // Robustly get title and body from either `notification` or `data` object.
  const notificationTitle = payload.notification?.title || payload.data?.title || 'Nuevo Pedido';
  const notificationBody = payload.notification?.body || payload.data?.body || 'Ha llegado un nuevo pedido para procesar.';

  const notificationOptions = {
    body: notificationBody,
    icon: payload.notification?.icon || payload.data?.icon || '/images/apple-touch-icon.png',
    badge: '/images/apple-touch-icon.png',
    vibrate: [200, 100, 200],
    tag: payload.notification?.tag || payload.data?.tag || 'new-order',
    renotify: true, // Permite que suene de nuevo aunque tenga el mismo tag
    requireInteraction: true, // Mantiene la notificación visible
    data: {
      click_action: payload.data.click_action // Usamos el click_action de 'data'
    }
  };

  event.waitUntil(self.registration.showNotification(notificationTitle, notificationOptions));
});

/**
 * Escucha los clics en las notificaciones.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const clickAction = event.notification.data.click_action;

  if (clickAction) {
    // Este código busca una pestaña existente de la aplicación y la redirige.
    // Si no encuentra ninguna, abre una nueva.
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
        // Busca una pestaña que ya esté abierta en la URL base de la aplicación.
        for (const client of windowClients) {
          if (new URL(client.url).origin === new URL(clickAction).origin) {
            // Si la encuentra, la navega a la URL de la notificación y la enfoca.
            client.navigate(clickAction);
            return client.focus();
          }
        }
        // Si no encuentra ninguna pestaña abierta, abre una nueva.
        return clients.openWindow(clickAction);
      })
    );
  }
});
