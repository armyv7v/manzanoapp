import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, writeBatch, orderBy, query } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: "AIzaSyDLZBYfANw7o7FEOrw83PSrrQ7KmamAPEE",
    authDomain: "cambiosmanzano.app",
    projectId: "manzanoapp-2f775",
    storageBucket: "manzanoapp-2f775.firebasestorage.app",
    messagingSenderId: "250652050778",
    appId: "1:250652050778:web:cb43d53c10989b046fdf63"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function run() {
    console.log('Fetching balance_history...');
    const q = query(collection(db, 'balance_history'), orderBy('timestamp', 'desc'));
    const snapshot = await getDocs(q);

    const docs = snapshot.docs;
    console.log(`Found ${docs.length} documents.`);

    let currentBalance = 68972.92;
    let count = 0;

    // We can't batch more than 500 at a time
    let batch = writeBatch(db);

    for (const d of docs) {
        const data = d.data();
        const amount = data.amount || 0;
        const type = data.type || '';

        // Redondeo estándar exigido: 2 decimales. 
        // 0.5 hacia arriba, 0.4 hacia abajo es el comportamiento nativo de Math.round()
        const balanceAfter = Math.round(currentBalance * 100) / 100;

        // Invertimos la operación para hallar el saldo que había ANTES de este doc
        if (type === 'add') {
            currentBalance -= amount;
        } else {
            // fee, subtract, admin_commission, tillo_commission
            currentBalance += amount;
        }

        // Asegurar que solo escribimos números válidos
        if (!isNaN(balanceAfter)) {
            batch.update(d.ref, { balanceAfter });
        }

        count++;

        if (count % 450 === 0) {
            await batch.commit();
            console.log(`Committed ${count} updates...`);
            batch = writeBatch(db); // Create a new batch
        }
    }

    if (count % 450 !== 0) {
        await batch.commit();
    }

    console.log(`Committed remaining updates. Total docs processed: ${count}`);
    console.log('Done! Balance at the very beginning of history would be:', Math.round(currentBalance * 100) / 100);
    process.exit(0);
}

run().catch(console.error);
