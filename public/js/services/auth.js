// public/js/services/auth.js
import { db, messaging, FieldValue } from './firebase.js';
import { isNativePlatform } from '../utils/formatters.js';
import { showMessage, showToastNotification } from '../ui/notifications.js';

export const syncUserStatus = async (user, claims) => {
    if (!user || !user.uid) return;

    try {
        await db.collection('users').doc(user.uid).set({
            email: user.email,
            isAdmin: !!claims.admin,
            isSeller: !!claims.seller,
            lastLogin: FieldValue.serverTimestamp()
        }, { merge: true });
    } catch (err) {
        console.error("Error syncing user status:", err);
    }
};

/** Sets up the logic for enabling push notifications. */
export const setupPushNotifications = (currentUser) => {
    const enableNotificationsBtn = document.getElementById('enable-notifications-btn');
    const bellIcon = document.getElementById('notification-bell-icon');

    if (isNativePlatform()) {
        if (enableNotificationsBtn) {
            enableNotificationsBtn.disabled = true;
            enableNotificationsBtn.title = 'Las notificaciones son gestionadas por la App nativa.';
        }
        if (bellIcon) {
            bellIcon.classList.remove('text-gray-500', 'text-red-500');
            bellIcon.classList.add('text-green-500');
        }
        showMessage('notifications-message', 'Notificaciones activas en esta App.', true);
        return;
    }

    if (!('Notification' in window) || !('serviceWorker' in navigator) || !messaging) {
        showMessage('notifications-message', 'Las notificaciones de escritorio no son compatibles con este navegador.', false);
        if (enableNotificationsBtn) enableNotificationsBtn.disabled = true;
        return;
    }

    // --- Handle foreground notifications ---
    messaging.onMessage((payload) => {
        console.log('Mensaje recibido en primer plano: ', payload);

        // 1. Play sound
        const notificationSound = document.getElementById('notification-sound');
        if (notificationSound) {
            notificationSound.play().catch(error => {
                console.warn("No se pudo reproducir el sonido de notificación.", error);
            });
        }

        // Robustly get body from either `data` or `notification` object.
        const notificationBody = payload.data?.body || payload.notification?.body || 'Ha llegado un nuevo pedido.';

        // 2. Show a non-intrusive toast notification with the order details.
        showToastNotification(notificationBody);

        // 3. Change document title to alert the user if the tab is not active.
        document.title = '(!) Nuevo Pedido - Cambios Manzano';
    });

    // Check current permission status and update button
    if (Notification.permission === 'granted') {
        if (enableNotificationsBtn) {
            enableNotificationsBtn.disabled = true;
            enableNotificationsBtn.title = 'Las notificaciones ya están activadas en este navegador.';
        }
        if (bellIcon) {
            bellIcon.classList.remove('text-gray-500', 'text-red-500');
            bellIcon.classList.add('text-green-500');
        }
        showMessage('notifications-message', 'Ya tienes las notificaciones activadas en este navegador.', true);
    } else if (Notification.permission === 'denied') {
        if (enableNotificationsBtn) {
            enableNotificationsBtn.disabled = true;
            enableNotificationsBtn.title = 'Has bloqueado las notificaciones. Debes habilitarlas en la configuración de tu navegador.';
        }
        if (bellIcon) {
            bellIcon.classList.remove('text-gray-500', 'text-green-500');
            bellIcon.classList.add('text-red-500');
        }
        showMessage('notifications-message', 'Has bloqueado las notificaciones. Debes habilitarlas en la configuración de tu navegador.', false);
    } else {
        // Default state: ready to be enabled
        if (enableNotificationsBtn) {
            enableNotificationsBtn.disabled = false;
            enableNotificationsBtn.title = 'Activar notificaciones de escritorio';
        }
        if (bellIcon) {
            bellIcon.classList.remove('text-green-500', 'text-red-500');
            bellIcon.classList.add('text-gray-500');
        }
    }

    // Attach click listener ONLY if not already attached (this function might be called multiple times)
    // To avoid duplicate listeners, we can remove previous ones or use a flag. 
    // Ideally, this setup should happen once or cleanup previous listeners.
    // For now, simpler to assume enableNotificationsBtn is stable.
    if (enableNotificationsBtn) {
        // Cloning the node to remove existing event listeners is a brute-force way to ensure single listener
        const newBtn = enableNotificationsBtn.cloneNode(true);
        enableNotificationsBtn.parentNode.replaceChild(newBtn, enableNotificationsBtn);

        newBtn.addEventListener('click', async () => {
            if (!currentUser) return showMessage('notifications-message', 'Debes iniciar sesión.', false);

            try {
                showMessage('notifications-message', 'Solicitando permiso...', true);
                const permission = await Notification.requestPermission();

                if (permission === 'granted') {
                    showMessage('notifications-message', 'Permiso concedido. Obteniendo token...', true);

                    const fcmToken = await messaging.getToken({
                        vapidKey: 'BEju_FPmIxL_aiCOSspYuyoi4iLOJwMyHCrXCkGuXfUGRdOT9HGqPyFXnGb_Vc1tCGRzIzlragLH7j3N12c00E8'
                    });

                    if (fcmToken) {
                        await db.collection('users').doc(currentUser.uid).set({
                            fcmToken: fcmToken,
                            lastFCMUpdate: FieldValue.serverTimestamp(),
                            platform: 'web'
                        }, { merge: true });

                        const userTokensRef = db.collection('fcm_tokens').doc(currentUser.uid);
                        await userTokensRef.set({
                            tokens: FieldValue.arrayUnion(fcmToken)
                        }, { merge: true });

                        showMessage('notifications-message', '¡Notificaciones activadas para este dispositivo!', true);
                        newBtn.disabled = true;
                        newBtn.title = 'Las notificaciones ya están activadas en este navegador.';
                        if (bellIcon) {
                            bellIcon.classList.remove('text-gray-500');
                            bellIcon.classList.add('text-green-500');
                        }
                    }
                }
            } catch (error) {
                console.error('Error al activar notificaciones:', error);
                showMessage('notifications-message', `Error: ${error.message}. Revisa la consola.`, false);
            }
        });
    }
};
