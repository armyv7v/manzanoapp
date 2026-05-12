// public/js/services/admin.js
import { db, Timestamp } from './firebase.js';

export const listenToAdminCommission = (onSnapshot, onError) => {
    const nowInChile = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Santiago' }));
    const todayStart = new Date(new Date(nowInChile).setHours(0, 0, 0, 0));
    const todayEnd = new Date(new Date(nowInChile).setHours(23, 59, 59, 999));

    const query = db.collection('balance_history')
        .where('type', '==', 'admin_commission')
        .where('timestamp', '>=', todayStart)
        .where('timestamp', '<=', todayEnd)
        .orderBy('timestamp', 'desc');

    return query.onSnapshot(onSnapshot, onError);
};

export const listenToTilloCommission = (onSnapshot, onError) => {
    const nowInChile = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Santiago' }));
    const todayStart = new Date(new Date(nowInChile).setHours(0, 0, 0, 0));
    const todayEnd = new Date(new Date(nowInChile).setHours(23, 59, 59, 999));

    const query = db.collection('balance_history')
        .where('type', '==', 'tillo_commission')
        .where('timestamp', '>=', todayStart)
        .where('timestamp', '<=', todayEnd)
        .orderBy('timestamp', 'desc');

    return query.onSnapshot(onSnapshot, onError);
};

export const listenToBankFees = (onSnapshot, onError) => {
    const nowInChile = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Santiago' }));
    const todayStart = new Date(new Date(nowInChile).setHours(0, 0, 0, 0));
    const todayEnd = new Date(new Date(nowInChile).setHours(23, 59, 59, 999));

    const query = db.collection('balance_history')
        .where('type', '==', 'fee')
        .where('timestamp', '>=', todayStart)
        .where('timestamp', '<=', todayEnd);

    return query.onSnapshot(onSnapshot, onError);
};

export const listenToAccounts = (onSnapshot, onError) => {
    return db.collection('accounts').onSnapshot(onSnapshot, onError);
};

export const listenToSellerCommissions = (userId, onSnapshot, onError) => {
    const nowInChile = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Santiago' }));
    const startOfDay = new Date(new Date(nowInChile).setHours(0, 0, 0, 0));
    const endOfDay = new Date(new Date(nowInChile).setHours(23, 59, 59, 999));
    const startTimestamp = Timestamp.fromDate(startOfDay);
    const endTimestamp = Timestamp.fromDate(endOfDay);

    const query = db.collection('seller_commissions')
        .where('sellerId', '==', userId)
        .where('timestamp', '>=', startTimestamp)
        .where('timestamp', '<=', endTimestamp)
        .orderBy('timestamp', 'desc');

    return query.onSnapshot(onSnapshot, onError);
};

export const listenToAllSellerCommissions = (onSnapshot, onError) => {
    const nowInChile = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Santiago' }));
    const startOfDay = new Date(new Date(nowInChile).setHours(0, 0, 0, 0));
    const endOfDay = new Date(new Date(nowInChile).setHours(23, 59, 59, 999));
    const startTimestamp = Timestamp.fromDate(startOfDay);
    const endTimestamp = Timestamp.fromDate(endOfDay);

    const query = db.collection('seller_commissions')
        .where('timestamp', '>=', startTimestamp)
        .where('timestamp', '<=', endTimestamp)
        .orderBy('timestamp', 'desc');

    return query.onSnapshot(onSnapshot, onError);
};
