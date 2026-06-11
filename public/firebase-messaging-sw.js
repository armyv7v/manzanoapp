// Firebase Cloud Messaging Service Worker
// This file must be served from the root directory

// Import Firebase scripts for service worker
importScripts('https://www.gstatic.com/firebasejs/11.6.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.6.1/firebase-messaging-compat.js');

// Initialize Firebase in the service worker
firebase.initializeApp({
    apiKey: "AIzaSyDLZBYfANw7o7FEOrw83PSrrQ7KmamAPEE",
    authDomain: "cambiosmanzano.app",
    projectId: "manzanoapp-2f775",
    storageBucket: "manzanoapp-2f775.firebasestorage.app",
    messagingSenderId: "250652050778",
    appId: "1:250652050778:web:cb43d53c10989b046fdf63"
});

// Retrieve an instance of Firebase Messaging
const messaging = firebase.messaging();

self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

// Handle background messages
messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Received background message ', payload);

    const notificationTitle = payload.notification?.title || payload.data?.title || 'New Message';
    const notificationBody = payload.notification?.body || payload.data?.body || '';
    const notificationTag =
        payload.messageId ||
        payload?.data?.stamp ||
        payload?.data?.orderID ||
        payload?.data?.historyID ||
        `fcm-${Date.now()}`;

    const notificationOptions = {
        body: notificationBody,
        icon: '/images/icon-192x192.png',
        badge: '/images/icon-192x192.png',
        tag: notificationTag,
        renotify: false,
        data: payload.data || {}
    };

    return self.registration.showNotification(notificationTitle, notificationOptions);
});

// The fallback push event has been removed to avoid conflicts with onBackgroundMessage

// Handle notification click
self.addEventListener('notificationclick', (event) => {
    console.log('[firebase-messaging-sw.js] Notification click received.', event.notification.data);
    event.notification.close();

    const data = event.notification.data || {};
    let url = '/';
    
    if (data.orderID) {
        if (data.type === 'new_order') {
            url = '/?screen=dashboard&orderId=' + data.orderID;
        } else {
            url = '/?screen=history&orderId=' + data.orderID;
        }
    } else if (data.purchaseID) {
        url = '/?screen=wholesale-purchases&purchaseId=' + data.purchaseID;
    } else if (data.type === 'balance_load') {
        url = '/?screen=balance';
    } else if (data.type === 'exchange_rate_update') {
        url = '/?screen=calculator';
    } else if (data.type === 'new_order') {
        url = '/?screen=dashboard';
    } else if (data.type === 'order_update') {
        url = '/?screen=history';
    } else if (data.type === 'wholesale_purchase') {
        url = '/?screen=wholesale-purchases';
    }

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                if (client.url.indexOf(self.location.origin) === 0 && 'focus' in client) {
                    return client.navigate(url).then((focusedClient) => {
                        if (focusedClient) focusedClient.focus();
                    });
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(url);
            }
        })
    );
});
