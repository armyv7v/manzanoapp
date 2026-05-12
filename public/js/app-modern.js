// public/js/app-modern.js
import { auth } from './services/firebase.js';
import { listenToTodayOrders, listenToUserOrders } from './services/orders.js';
import { renderOrder, renderUserOrder } from './ui/orders-ui.js';
import { listenToAdminCommission, listenToTilloCommission, listenToBankFees, listenToSellerCommissions, listenToAllSellerCommissions } from './services/admin.js';
import { setupPushNotifications, syncUserStatus } from './services/auth.js';
import { roundUpToTwoDecimals, isNativePlatform } from './utils/formatters.js';
import { USER_TAGS } from './config/constants.js';

// DOM Elements (Redundant with app.js for now, but needed here)
const ordersListPending = document.getElementById('orders-list-pending');
const ordersListPaid = document.getElementById('orders-list-paid');
const noOrdersPendingMessage = document.getElementById('no-orders-pending-message');
const noOrdersPaidMessage = document.getElementById('no-orders-paid-message');
const pendingSummaryDisplay = document.getElementById('pending-summary');
const paidSummaryDisplay = document.getElementById('paid-summary');
const userOrdersList = document.getElementById('user-orders-list');
const noUserOrdersMessage = document.getElementById('no-user-orders-message');

// State
let ordersListenerUnsubscribe = null;
let userOrdersListenerUnsubscribe = null;
let adminCommsUnsubscribe = null;
let tilloCommsUnsubscribe = null;
let bankFeesUnsubscribe = null;

auth.onAuthStateChanged(async (user) => {
    if (user) {
        const idTokenResult = await user.getIdTokenResult(true);
        const isAdmin = !!idTokenResult.claims.admin;
        const isSeller = !!idTokenResult.claims.seller;

        // Sync status to DB
        syncUserStatus(user, idTokenResult.claims);

        // Setup Notifications
        setupPushNotifications(user);

        if (isAdmin) {
            setupAdminLogic();
        } else {
            setupUserLogic(user, isSeller);
        }
    } else {
        // Logout cleanup
        if (ordersListenerUnsubscribe) ordersListenerUnsubscribe();
        if (userOrdersListenerUnsubscribe) userOrdersListenerUnsubscribe();
        if (adminCommsUnsubscribe) adminCommsUnsubscribe();
        if (tilloCommsUnsubscribe) tilloCommsUnsubscribe();
        if (bankFeesUnsubscribe) bankFeesUnsubscribe();
    }
});

function setupAdminLogic() {
    // 1. Listen to Orders
    if (ordersListenerUnsubscribe) ordersListenerUnsubscribe();

    ordersListenerUnsubscribe = listenToTodayOrders((snapshot) => {
        // Logic copied and adapted from app.js render logic
        let pendingOrdersCount = 0;
        let pendingDestTotal = 0;
        let paidCount = 0;
        let paidDestTotal = 0;

        if (!ordersListPending || !ordersListPaid) return;

        ordersListPending.innerHTML = '';
        // Note: In app.js, paid list was appended. Here we might want to clear it to avoid duplicates if we re-render?
        // app.js logic: "Clear only the pending list". But renderOrder creates new elements.
        // If we want to fully reactive, we should clear both and re-render all.
        ordersListPaid.innerHTML = ''; // Safer for now.

        if (snapshot.empty) {
            if (noOrdersPendingMessage) noOrdersPendingMessage.classList.remove('hidden');
        } else {
            if (noOrdersPendingMessage) noOrdersPendingMessage.classList.add('hidden');
        }

        snapshot.forEach(doc => {
            const order = doc.data();
            if (order.status === 'Cliente Registrado' || order.status === 'Cancelado') return;

            const orderHtml = renderOrder(order, doc.id);

            if (order.status === 'Pagado') {
                ordersListPaid.innerHTML += orderHtml;
                paidCount++;
                paidDestTotal += (order.destinationAmount || 0);
            } else if (order.status === 'Pendiente de pago') {
                ordersListPending.innerHTML += orderHtml;
                pendingOrdersCount++;
                pendingDestTotal += (order.destinationAmount || 0);
            }
        });

        // Update summaries
        if (pendingSummaryDisplay) pendingSummaryDisplay.textContent = `${pendingOrdersCount} Pedidos / ${pendingDestTotal.toLocaleString('es-CL', { minimumFractionDigits: 2 })} VES`; // Assuming VES default for admin
        if (paidSummaryDisplay) paidSummaryDisplay.textContent = `${paidCount} Pedidos / ${paidDestTotal.toLocaleString('es-CL', { minimumFractionDigits: 2 })} VES`;

        if (noOrdersPendingMessage) noOrdersPendingMessage.classList.toggle('hidden', pendingOrdersCount > 0);
        if (noOrdersPaidMessage) noOrdersPaidMessage.classList.toggle('hidden', paidCount > 0);

    }, (error) => {
        console.error("Error fetching orders (Modern):", error);
    });

    // 2. Listen to Commissions
    if (adminCommsUnsubscribe) adminCommsUnsubscribe();
    adminCommsUnsubscribe = listenToAdminCommission((snapshot) => {
        let total = 0;
        snapshot.forEach(doc => total += doc.data().amount);
        // We need to update the UI. But the UI element logic is complex (summary breakdown).
        // For now, let's just log it or rely on app.js for this part if not fully migrated.
        // Actually, let's skip migrating the Commission UI *rendering* for now to avoid conflict/duplication 
        // until we move that UI logic to a module.
        // We will focus on ORDERS first.
    });
}

function setupUserLogic(user, isSeller) {
    if (userOrdersListenerUnsubscribe) userOrdersListenerUnsubscribe();

    if (userOrdersList) {
        userOrdersListenerUnsubscribe = listenToUserOrders(user.uid, (snapshot) => {
            userOrdersList.innerHTML = '';
            // We also need to update userOwnOrders array if we want autocomplete to work (which is in app.js).
            // This is the friction of partial migration. 
            // `app.js` logic populates `userOwnOrders`.
            // If we move the listener here, `app.js` won't update that array.

            // SOLUTION: Dispatch a custom event with the data, so app.js can listen and update its state?
            // Or just render the list here.

            if (snapshot.empty) {
                if (noUserOrdersMessage) noUserOrdersMessage.classList.remove('hidden');
            } else {
                if (noUserOrdersMessage) noUserOrdersMessage.classList.add('hidden');
                snapshot.forEach(doc => {
                    const order = { id: doc.id, ...doc.data() };
                    if (order.status !== 'Cliente Registrado') {
                        userOrdersList.innerHTML += renderUserOrder(order, isSeller);
                    }
                });
            }
        }, (error) => {
            console.error("Error fetching user orders (Modern):", error);
        });
    }
}
