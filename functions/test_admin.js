const admin = require('firebase-admin');

admin.initializeApp();

const db = admin.firestore();

async function run() {
    try {
        console.log("Querying recent balance_history entries...");
        const snap = await db.collection('balance_history').orderBy('timestamp', 'desc').limit(10).get();
        if (snap.empty) {
            console.log("No recent entries in balance_history.");
        } else {
            snap.forEach(doc => {
                const data = doc.data();
                const ts = data.timestamp ? data.timestamp.toDate() : null;
                console.log(`ID: ${doc.id}, Type: ${data.type}, Amount: ${data.amount}, Ts: ${ts}`);
            });
        }

        console.log("-------------------");
        console.log("Checking user FCM tokens...");
        const users = await db.collection('users').limit(10).get();
        users.forEach(doc => {
            const d = doc.data();
            console.log(`User ${doc.id} (${d.email}): fcmToken=${!!d.fcmToken}, fcmTokens=${Array.isArray(d.fcmTokens) ? d.fcmTokens.length : 0}`);
        });
    } catch (err) {
        console.error("Error", err);
    }
}
run();
