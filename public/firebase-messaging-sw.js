// Firebase Cloud Messaging Service Worker
// This file must be served from the root directory

// Import Firebase scripts for service worker
importScripts('https://www.gstatic.com/firebasejs/11.6.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.6.1/firebase-messaging-compat.js');

// Initialize Firebase in the service worker
firebase.initializeApp({
    apiKey: "AIzaSyDLZBYfANw7o7FEOrw83PSrrQ7KmamAPEE",
    authDomain: "manzanoapp-2f775.firebaseapp.com",
    projectId: "manzanoapp-2f775",
    storageBucket: "manzanoapp-2f775.firebasestorage.app",
    messagingSenderId: "250652050778",
    appId: "1:250652050778:web:cb43d53c10989b046fdf63"
});

// Retrieve an instance of Firebase Messaging
const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Received background message ', payload);

    const notificationTitle = payload.notification?.title || 'New Message';
    const notificationOptions = {
        body: payload.notification?.body || '',
        icon: '/images/icon-192x192.png',
        badge: '/images/icon-192x192.png',
        data: payload.data
    };

    return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
    console.log('[firebase-messaging-sw.js] Notification click received.');

    event.notification.close();

    // Open the app
    event.waitUntil(
        clients.openWindow('/')
    );
});
