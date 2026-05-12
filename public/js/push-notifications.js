// Push Notifications Module - Supports both Native (Capacitor) and Web (Firebase Messaging)
// Wrapped in IIFE to avoid global scope pollution

(function () {
    'use strict';

    // Helper: Check if running on native platform
    const isNativePlatform = () => {
        return typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform && Capacitor.isNativePlatform();
    };

    // Initialize push notifications based on platform
    document.addEventListener('DOMContentLoaded', async () => {
        if (isNativePlatform()) {
            // Native platform (Android/iOS)
            await initNativePushNotifications();
        } else {
            // Web platform (Browser)
            await initWebPushNotifications();
        }
    });

    // ===== NATIVE PUSH NOTIFICATIONS (Capacitor) =====
    async function initNativePushNotifications() {
        console.log('Initializing Push Notifications on native platform...');

        const { PushNotifications } = Capacitor.Plugins;

        if (!PushNotifications) {
            console.error('PushNotifications plugin not available');
            return;
        }

        try {
            // Request permission
            const permResult = await PushNotifications.requestPermissions();

            if (permResult.receive === 'granted') {
                await PushNotifications.register();
                console.log('Push notifications registered successfully');
            } else {
                console.warn('Push notification permission not granted');
            }

            // Listener for successful registration
            await PushNotifications.addListener('registration', async (token) => {
                console.log('Push registration success, token: ' + token.value);
                await saveFCMToken(token.value);
            });

            // Listener for registration error
            await PushNotifications.addListener('registrationError', (error) => {
                console.error('Error on registration: ' + JSON.stringify(error));
            });

            // Listener for push notification received
            await PushNotifications.addListener('pushNotificationReceived', (notification) => {
                console.log('Push received: ' + JSON.stringify(notification));
            });

            // Listener for push notification action performed
            await PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
                console.log('Push action performed: ' + JSON.stringify(notification));
            });

        } catch (error) {
            console.error('Error initializing native push notifications:', error);
        }
    }

    // ===== WEB PUSH NOTIFICATIONS (Firebase Messaging) =====
    async function initWebPushNotifications() {
        console.log('Initializing Push Notifications for web platform...');

        try {
            // Check if Firebase Messaging is supported
            if (!firebase.messaging.isSupported()) {
                console.warn('Firebase Messaging is not supported in this browser');
                return;
            }

            const messaging = firebase.messaging();

            // Request permission
            const permission = await Notification.requestPermission();

            if (permission === 'granted') {
                console.log('Notification permission granted');

                // Get FCM token
                const currentToken = await messaging.getToken({
                    vapidKey: 'BEju_FPmIxL_aiCOSspYuyoi4iLOJwMyHCrXCkGuXfUGRdOT9HGqPyFXnGb_Vc1tCGRzIzlragLH7j3N12c00E8'
                });

                if (currentToken) {
                    console.log('FCM Token:', currentToken);
                    await saveFCMToken(currentToken);
                } else {
                    console.log('No registration token available');
                }

                // Handle foreground messages
                messaging.onMessage((payload) => {
                    console.log('Message received in foreground:', payload);

                    // Show notification
                    const notificationTitle = payload.notification?.title || 'New Notification';
                    const notificationOptions = {
                        body: payload.notification?.body || '',
                        icon: '/images/icon-192x192.png'
                    };

                    new Notification(notificationTitle, notificationOptions);
                });

            } else if (permission === 'denied') {
                console.warn('Notification permission denied');
            } else {
                console.log('Notification permission dismissed');
            }

        } catch (error) {
            console.error('Error initializing web push notifications:', error);
        }
    }

    // ===== SHARED HELPER FUNCTIONS =====

    // Save FCM token to Firestore
    async function saveFCMToken(token) {
        try {
            const user = window.authWrapper ? window.authWrapper.getCurrentUser() : null;

            if (user && user.uid) {
                // User is logged in, save to their document
                await firebase.firestore()
                    .collection('users')
                    .doc(user.uid)
                    .set({
                        fcmToken: token,
                        lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
                        platform: isNativePlatform() ? 'native' : 'web'
                    }, { merge: true });

                console.log('FCM token saved to Firestore');

                // Clear pending token
                localStorage.removeItem('pendingFCMToken');
            } else {
                // User not logged in yet, save to localStorage
                console.log('No user logged in, token saved to localStorage');
                localStorage.setItem('pendingFCMToken', token);
            }
        } catch (error) {
            console.error('Error saving FCM token:', error);
        }
    }

    // Listen for auth state changes to save pending token
    if (window.authWrapper) {
        window.authWrapper.onAuthStateChanged(async (user) => {
            if (user) {
                const pendingToken = localStorage.getItem('pendingFCMToken');
                if (pendingToken) {
                    console.log('Pending FCM token saved after login');
                    await saveFCMToken(pendingToken);
                }
            }
        });
    }
})();
