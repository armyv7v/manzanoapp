const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccount = require('./serviceAccountKey.json');

initializeApp({
    credential: cert(serviceAccount)
});

const db = getFirestore();

async function restoreOrder() {
    const orderId = 'i9o5EVLIPC05lHnYqywO';

    try {
        const orderRef = db.collection('orders').doc(orderId);
        await orderRef.update({
            status: 'Pendiente de pago'
        });
        console.log(`Order ${orderId} successfully restored to Pendiente de pago`);
    } catch (error) {
        console.error('Error restoring order:', error);
    }
}

restoreOrder();
