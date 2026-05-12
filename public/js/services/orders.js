// public/js/services/orders.js
import { db, Timestamp } from './firebase.js';

/**
 * Listens for orders created today in Chile timezone.
 * @param {Function} onSnapshot - Callback function receiving the snapshot (and potentially error/empty states).
 * @param {Function} onError - Callback for errors.
 * @returns {Function} Unsubscribe function.
 */
export const listenToTodayOrders = (onSnapshot, onError) => {
    const nowInChile = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Santiago' }));
    const startOfDay = new Date(new Date(nowInChile).setHours(0, 0, 0, 0));
    const endOfDay = new Date(new Date(nowInChile).setHours(23, 59, 59, 999));

    const createdTodayQuery = db.collection('orders')
        .where('createdAt', '>=', startOfDay)
        .where('createdAt', '<=', endOfDay)
        .orderBy('createdAt', 'desc');

    return createdTodayQuery.onSnapshot(onSnapshot, onError);
};

/**
 * Listens for a specific user's orders.
 * @param {string} userId - The user ID.
 * @param {Function} onSnapshot - Callback.
 * @returns {Function} Unsubscribe function.
 */
export const listenToUserOrders = (userId, onSnapshot, onError) => {
    const query = db.collection('orders')
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc')
        .limit(10);

    return query.onSnapshot(onSnapshot, onError);
};

/**
 * Fetches all orders (heavy operation, used for initial client list building).
 * Use with caution.
 */
export const fetchAllOrdersForClients = async () => {
    return db.collection('orders')
        .orderBy('createdAt', 'desc')
        .get();
};
