import { useEffect, useCallback } from 'react';
import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { getToken, getMessaging, isSupported as isFirebaseMessagingSupported, onMessage, deleteToken } from 'firebase/messaging';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { db } from '../lib/firebase';
import { useAuth } from './useAuth';
import { useToast } from '../contexts/ToastContext';
import app from '../lib/firebase';

const VAPID_KEY = 'BEju_FPmIxL_aiCOSspYuyoi4iLOJwMyHCrXCkGuXfUGRdOT9HGqPyFXnGb_Vc1tCGRzIzlragLH7j3N12c00E8';
const DEVICE_ID_KEY = 'manzano_push_device_id';

function detectDeviceBucket(): 'mobile' | 'desktop' | 'pwa' {
    const isActuallyNative = Capacitor.isNativePlatform() && !!Capacitor.getPlatform() && Capacitor.getPlatform() !== 'web';
    if (isActuallyNative) return 'mobile';
    // Detect installed PWA (standalone mode)
    const isStandalone =
        (typeof window !== 'undefined' && (window.navigator as any).standalone === true) ||
        (typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches);
    if (isStandalone) return 'pwa';
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) ? 'mobile' : 'desktop';
}

function getOrCreateDeviceId(): string {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;

    const random = `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    const deviceId = `dev-${random}`;
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
    return deviceId;
}

export function useNotifications() {
    const { user } = useAuth();
    const toast = useToast();

    const saveToken = useCallback(async (token: string, uid: string) => {
        try {
            const userRef = doc(db, 'users', uid);
            const isActuallyNative = Capacitor.isNativePlatform() && Capacitor.getPlatform() !== 'web';
            const platform = isActuallyNative ? 'native' : 'web';
            const deviceId = getOrCreateDeviceId();
            const deviceBucket = detectDeviceBucket();
            await runTransaction(db, async (transaction) => {
                const snap = await transaction.get(userRef);
                const data = snap.data() as any || {};
                const deviceTokens = data.fcmDeviceTokens || {};
                const nextDeviceTokens: Record<string, any> = { ...deviceTokens };

                nextDeviceTokens[deviceId] = {
                    token,
                    platform,
                    deviceBucket,
                    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'native',
                    updatedAt: new Date().toISOString(),
                };

                // Keep only one active token per device bucket (mobile/desktop).
                Object.entries(nextDeviceTokens).forEach(([id, entry]: [string, any]) => {
                    if (!entry?.token) {
                        delete nextDeviceTokens[id];
                        return;
                    }
                    const ua = String(entry.userAgent || '');
                    const inferredBucket =
                        entry.deviceBucket ||
                        (entry.platform === 'native'
                            ? 'mobile'
                            : /Android|iPhone|iPad|iPod|Mobile/i.test(ua)
                                ? 'mobile'
                                : 'desktop');
                    if (id !== deviceId && inferredBucket === deviceBucket) {
                        delete nextDeviceTokens[id];
                    }
                });

                const uniqueTokens = Array.from(
                    new Set(
                        Object.values(nextDeviceTokens)
                            .map((entry: any) => entry?.token)
                            .filter(Boolean)
                    )
                );

                const compactDeviceMap: Record<string, any> = {};
                Object.entries(nextDeviceTokens).forEach(([id, entry]) => {
                    if (entry && entry.token && uniqueTokens.includes(entry.token)) {
                        compactDeviceMap[id] = entry;
                    }
                });

                const webToken = Object.values(compactDeviceMap).find((entry: any) => entry?.platform === 'web')?.token || null;
                const nativeToken = Object.values(compactDeviceMap).find((entry: any) => entry?.platform === 'native')?.token || null;

                transaction.set(userRef, {
                    fcmToken: token,
                    fcmTokens: uniqueTokens,
                    fcmDeviceTokens: compactDeviceMap,
                    fcmPlatformTokens: {
                        web: webToken ? { token: webToken } : null,
                        native: nativeToken ? { token: nativeToken } : null,
                    },
                    lastFCMUpdate: serverTimestamp(),
                    platform,
                }, { mergeFields: ['fcmToken', 'fcmTokens', 'fcmDeviceTokens', 'fcmPlatformTokens', 'lastFCMUpdate', 'platform'] });
            });
            console.log('Token successfully saved:', token);
            return true;
        } catch (err) {
            console.error('Error saving push token to Firestore', err);
            return false;
        }
    }, []);

    const getWebToken = useCallback(async () => {
        const supported = await isFirebaseMessagingSupported();
        if (!supported) return null;
        if (!('serviceWorker' in navigator)) return null;

        const messaging = getMessaging(app);
        const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
            updateViaCache: 'none',
        });
        await navigator.serviceWorker.ready;

        return getToken(messaging, {
            vapidKey: VAPID_KEY,
            serviceWorkerRegistration: registration,
        });
    }, []);

    const ensureAndroidChannel = useCallback(async () => {
        if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;
        try {
            await PushNotifications.createChannel({
                id: 'high_priority',
                name: 'Pedidos y pagos',
                description: 'Notificaciones prioritarias de pedidos',
                importance: 5,
                visibility: 1,
                sound: 'default',
            });
        } catch (error) {
            console.warn('Could not create high_priority channel:', error);
        }
    }, []);

    const requestPermission = useCallback(async (forceRefresh = false) => {
        if (!user) return;

        const isActuallyNative = Capacitor.isNativePlatform() && Capacitor.getPlatform() !== 'web';

        if (isActuallyNative) {
            // Native Mobile (Android/iOS) Flow using Capacitor
            try {
                let permStatus = await PushNotifications.checkPermissions();

                if (permStatus.receive === 'prompt') {
                    permStatus = await PushNotifications.requestPermissions();
                }

                if (permStatus.receive !== 'granted') {
                    console.warn('Push notification permission denied on mobile.');
                    return;
                }

                await ensureAndroidChannel();

                // Register with Apple/Google to receive token via APNS/FCM
                await PushNotifications.register();
            } catch (error) {
                console.error('Failed to initialize Capacitor Push Notifications', error);
            }
        } else {
            // Regular Web Flow using Firebase Web SDK
            try {
                const supported = await isFirebaseMessagingSupported();
                if (!supported) {
                    console.log('Firebase Web Messaging is not supported in this browser.');
                    alert('Tu navegador no soporta notificaciones de Firebase.');
                    return;
                }

                const permission = await Notification.requestPermission();
                if (permission === 'granted') {
                    if (forceRefresh) {
                        try {
                            const messaging = getMessaging(app);
                            await deleteToken(messaging);
                        } catch (e) {
                            console.warn('Could not delete old FCM token', e);
                        }
                    }
                    const token = await getWebToken();

                    if (token) {
                        console.log('Web Push registration success, token: ' + token);
                        const saved = await saveToken(token, user.uid);
                        if (forceRefresh) {
                            if (saved) {
                                toast.success('¡Notificaciones activadas exitosamente!');
                            } else {
                                toast.error('Error al guardar el token en la base de datos.');
                            }
                        }
                    } else if (forceRefresh) {
                        toast.error('No se pudo generar el token. Intenta nuevamente.');
                    }
                } else {
                    console.log('Web Push notification permission denied.');
                    if (forceRefresh) {
                        if (permission === 'denied') {
                            toast.error('Has denegado los permisos en tu navegador. Actívalos en configuración.');
                        } else {
                            toast.error('Permiso ignorado o cancelado. Por favor, acepta la solicitud emergente.');
                        }
                    }
                }
            } catch (error: any) {
                console.error('Error requesting web notification permission:', error);
                if (forceRefresh) {
                    const errorMsg = error?.message || String(error);
                    toast.error(`Error config: ${errorMsg}`);
                }
            }
        }
    }, [ensureAndroidChannel, getWebToken, user, saveToken, toast]);

    useEffect(() => {
        if (!user) return;

        const nativeHandles: Array<{ remove: () => Promise<void> }> = [];
        let webUnsubscribe: (() => void) | null = null;
        const handlePermissionRequest = (e: Event) => {
            const forceRefresh = (e as CustomEvent).detail?.forceRefresh === true;
            void requestPermission(forceRefresh);
        };

        window.addEventListener('request-notification-permission', handlePermissionRequest);

        const isActuallyNative = Capacitor.isNativePlatform() && Capacitor.getPlatform() !== 'web';

        // On mount, we setup listeners for native
        if (isActuallyNative) {
            const setupNativeListeners = async () => {
                const registrationHandle = await PushNotifications.addListener('registration', (token) => {
                    console.log('Mobile Push registration success, token: ' + token.value);
                    saveToken(token.value, user.uid);
                });
                nativeHandles.push(registrationHandle);

                const registrationErrorHandle = await PushNotifications.addListener('registrationError', (error: any) => {
                    console.error('Error on mobile push registration: ' + JSON.stringify(error));
                });
                nativeHandles.push(registrationErrorHandle);

                const notificationReceiveHandle = await PushNotifications.addListener('pushNotificationReceived', (notification) => {
                    console.log('Mobile Push received in foreground:', notification);
                    const title = notification.title || 'Nueva notificación';
                    const body = notification.body || '';
                    toast.info(`${title}: ${body}`);
                });
                nativeHandles.push(notificationReceiveHandle);

                const notificationActionHandle = await PushNotifications.addListener('pushNotificationActionPerformed', (notificationAction) => {
                    console.log('Mobile Push clicked:', notificationAction);
                    const data = notificationAction.notification.data || {};
                    let targetScreen = 'dashboard';
                    if (data.type === 'new_order') targetScreen = 'dashboard';
                    else if (data.type === 'order_update') targetScreen = 'history';
                    else if (data.type === 'wholesale_purchase') targetScreen = 'wholesale-purchases';
                    else if (data.type === 'balance_load') targetScreen = 'balance';
                    else if (data.type === 'exchange_rate_update') targetScreen = 'calculator';

                    window.dispatchEvent(new CustomEvent('manzano-navigate', { detail: { screen: targetScreen } }));
                });
                nativeHandles.push(notificationActionHandle);
            };

            void setupNativeListeners();

            // Auto requests on mount for native (often allowed)
            void requestPermission();
        } else {
            // For web, if it's already granted, we can silently fetch the token on mount
            const checkWebToken = async () => {
                const supported = await isFirebaseMessagingSupported();
                if (supported && Notification.permission === 'granted') {
                    try {
                        const token = await getWebToken();
                        if (token) await saveToken(token, user.uid);
                    } catch (e) {
                        console.error('Background token fetch failed', e);
                    }
                }
            };
            void checkWebToken();

            const messaging = getMessaging(app);
            webUnsubscribe = onMessage(messaging, (payload) => {
                if (Notification.permission !== 'granted') return;

                const title = payload.notification?.title || payload.data?.title || 'Nueva notificacion';
                const body = payload.notification?.body || payload.data?.body || '';
                if (!title && !body) return;

                // Si la app está visible, mostramos un Toast interno para no spamear banners del SO
                if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
                    // Si tienes el toast disponible aquí, puedes llamarlo. 
                    // Como `toast` es un hook, ya está en el scope local:
                    toast.info(`${title}: ${body}`);
                    return;
                }

                // Si la app está en segundo plano pero el SW delegó a onMessage (sucede en algunas PWAs), forzamos el banner:
                new Notification(title, {
                    body,
                    icon: '/images/icon-192x192.png',
                });
            });
        }

        return () => {
            window.removeEventListener('request-notification-permission', handlePermissionRequest);
            if (webUnsubscribe) webUnsubscribe();
            nativeHandles.forEach((handle) => {
                handle.remove().catch(() => undefined);
            });
        };
    }, [user, requestPermission, saveToken, getWebToken]);

    return { requestPermission };
}

