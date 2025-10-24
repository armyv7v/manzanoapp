/**
 * Backfills the `clients` collection using the latest data found in the `orders` collection.
 *
 * Usage:
 *   node scripts/backfillClientsFromOrders.js
 *
 * Requirements:
 *   - `serviceAccountKey.json` present at the repository root with a Firebase service account
 *     that has read/write access to Cloud Firestore.
 *   - `npm install firebase-admin` (if not already installed).
 *
 * The script iterates over the orders (newest first), keeps the most recent record per cédula,
 * and writes a merged document into `clients/{cedula}` with the relevant fields.
 */

const path = require('path');
const admin = require('firebase-admin');

const serviceAccountPath = path.resolve(__dirname, '..', 'serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(require(serviceAccountPath)),
});

const db = admin.firestore();

// Limit writes per batch to stay under Firestore's 500-document limit.
const BATCH_LIMIT = 450;

/**
 * Normalises a Venezuelan ID / cédula string so it can be used as a document ID.
 * Falls back to the original value if nothing numeric could be extracted.
 */
const normaliseCedula = (cedula = '') => {
  const digits = (cedula || '').toString().replace(/[^0-9]/g, '');
  return digits.length ? digits : cedula || null;
};

/**
 * Shapes the client payload using the order data.
 */
const buildClientPayload = (orderDoc) => {
  const order = orderDoc.data();
  const createdAt = order.createdAt && order.createdAt.toDate ? order.createdAt.toDate() : null;

  const payload = {
    clientName: order.clientName || '',
    cedula: order.cedula || '',
    email: order.email || null,
    type: order.type || '',
    bank: order.bank || null,
    accountNumber: order.accountNumber || null,
    phone: order.phone || null,
    lastOrderId: orderDoc.id,
    lastOrderAt: createdAt,
    country: order.country || null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  // Remove undefined values to keep documents tidy.
  Object.keys(payload).forEach((key) => {
    if (payload[key] === undefined) {
      delete payload[key];
    }
  });

  return payload;
};

const backfillClients = async () => {
  console.log('Fetching orders ordered by createdAt desc...');
  const snapshot = await db.collection('orders')
    .orderBy('createdAt', 'desc')
    .get();

  console.log(`Fetched ${snapshot.size} orders. Processing...`);

  const seenCedulas = new Set();
  let batch = db.batch();
  let writesInBatch = 0;
  let totalWrites = 0;

  for (const orderDoc of snapshot.docs) {
    const order = orderDoc.data();
    const cedulaKey = normaliseCedula(order.cedula);

    if (!cedulaKey) {
      console.warn(`Skipping order ${orderDoc.id} because it lacks a valid cédula.`);
      continue;
    }

    if (seenCedulas.has(cedulaKey)) {
      // Already captured the latest order for this cedula.
      continue;
    }

    seenCedulas.add(cedulaKey);
    const payload = buildClientPayload(orderDoc);
    const clientRef = db.collection('clients').doc(cedulaKey);

    batch.set(clientRef, payload, { merge: true });
    writesInBatch += 1;
    totalWrites += 1;

    if (writesInBatch >= BATCH_LIMIT) {
      await batch.commit();
      console.log(`Committed a batch of ${writesInBatch} client documents.`);
      batch = db.batch();
      writesInBatch = 0;
    }
  }

  if (writesInBatch > 0) {
    await batch.commit();
    console.log(`Committed a final batch of ${writesInBatch} client documents.`);
  }

  console.log(`Backfill complete. Wrote ${totalWrites} client documents covering ${seenCedulas.size} unique cédulas.`);
};

backfillClients()
  .then(() => {
    console.log('Done ✅');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Backfill failed:', error);
    process.exit(1);
  });
