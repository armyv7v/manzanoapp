// Este archivo DEBE estar en la carpeta 'public'

// Firebase recomienda importar los scripts de esta manera en el Service Worker
importScripts('/__/firebase/11.6.1/firebase-app-compat.js');
importScripts('/__/firebase/11.6.1/firebase-messaging-compat.js');

// Inicializa la app de Firebase en el Service Worker,
// pasándole la configuración desde el script de inicialización de Firebase Hosting.
importScripts('/__/firebase/init.js');

const messaging = firebase.messaging();

/**
 * Escucha las notificaciones que llegan cuando la aplicación está en segundo plano
 * (en otra pestaña o minimizada).
 */
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Mensaje recibido en segundo plano: ', payload);

  // Extraemos los datos de la notificación del payload
  const notification = payload.notification;
  const notificationTitle = notification.title || 'Nuevo Pedido';
  
  // Construimos las opciones para la notificación, incluyendo el sonido y la vibración
  const notificationOptions = {
    body: notification.body || 'Ha llegado un nuevo pedido a la aplicación.',
    icon: notification.icon || '/images/apple-touch-icon.png',
    sound: notification.sound, // Usamos el sonido que viene en el payload
    vibrate: [200, 100, 200], // Patrón: vibra 200ms, pausa 100ms, vibra 200ms
  };

  // Muestra la notificación al usuario
  self.registration.showNotification(notificationTitle, notificationOptions);
});
