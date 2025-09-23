// Este archivo DEBE estar en la carpeta 'public'

// Firebase recomienda importar los scripts de esta manera en el Service Worker
importScripts('/__/firebase/11.6.1/firebase-app-compat.js');
importScripts('/__/firebase/11.6.1/firebase-messaging-compat.js');

// Inicializa la app de Firebase en el Service Worker,
// pasándole la configuración desde el script de inicialización de Firebase Hosting.
importScripts('/__/firebase/init.js');

const messaging = firebase.messaging();

/**
 * NOTA IMPORTANTE: El manejador `onBackgroundMessage` se ha eliminado intencionadamente.
 * Cuando se envía un payload que contiene tanto 'notification' como 'data' desde
 * Firebase Functions, el sistema operativo (Android, iOS, Windows) se encarga
 * automáticamente de mostrar la notificación si la app está en segundo plano.
 * El Service Worker solo necesita manejar el evento 'notificationclick'.
 */

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
