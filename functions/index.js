const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");
const emailFunctions = require('./email');
Object.assign(exports, emailFunctions);


// This constant was removed from the frontend but is still needed here for context.
const supportedCountries = {
  VES: { name: 'Venezuela', flag: 'VE' },
  COP: { name: 'Colombia', flag: 'CO' },
  PEN: { name: 'Peru', flag: 'PE' },
  ARS: { name: 'Argentina', flag: 'AR' },
  USD: { name: 'EE.UU.', flag: 'US' },
  EUR: { name: 'Europa', flag: 'EU' },
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: "manzanoapp-2f775", // Explicitly set the project ID
});

/**
 * This function triggers when a new order is created in Firestore.
 * It sends a push notification to all registered admin devices.
 */

// Define region and resource limits to aid diagnostics.
// Increasing timeout and memory helps avoid cold-start timeouts during initialization.
// This mirrors the previous implicit defaults but makes them explicit for clarity.
setGlobalOptions({
  region: "us-central1",
  timeoutSeconds: 60, // Increased from implicit 10s to give enough startup time.
  memory: "256MB",    // Increased from 128MB to handle heavier workloads.
});

exports.sendNewOrderNotification = onDocumentCreated("orders/{orderId}", async (event) => {
  // Add a version log to verify deployment
  console.log("Executing function version: v3. Notif Fix.");

  // Get the orderId from the event parameters
  const { orderId } = event.params;

  // In the current SDK the order payload lives inside event.data
  const snap = event.data;
  if (!snap) {
    console.log("No data associated with the event");
    return;
  }
  const newOrder = snap.data();

  // 1. Only send notifications for new, pending orders.
  if (newOrder.status !== "Pendiente de pago") {
    console.log("Order is not new and pending, skipping notification.");
    return null;
  }

  // Validar que clpAmount sea un numero valido para la notificacion
  const clpAmountForNotification = newOrder.clpAmount;
  if (typeof clpAmountForNotification !== 'number' || isNaN(clpAmountForNotification)) {
    console.error(`[${orderId}] El campo 'clpAmount' no es un numero valido (${clpAmountForNotification}) para la notificacion. Saltando notificacion.`);
    return null;
  }

  console.log("New pending order detected. Preparing to send notifications.");

  // 2. Get all documents from the fcm_tokens collection.
  const tokensSnapshot = await admin.firestore().collection("fcm_tokens").get();

  if (tokensSnapshot.empty) {
    console.log("No admin tokens found to send notifications to.");
    return null;
  }

  // 3. Collect all unique tokens from all admin documents.
  const allTokens = new Set();
  tokensSnapshot.forEach((doc) => {
    const adminData = doc.data();
    if (adminData.tokens && Array.isArray(adminData.tokens)) {
      adminData.tokens.forEach((token) => {
        if (token && typeof token === "string" && token.length > 0) {
          allTokens.add(token);
        }
      });
    }
  });

  const uniqueTokens = Array.from(allTokens);

  if (uniqueTokens.length === 0) {
    console.warn(
      "Found admin users, but they have no registered device tokens.",
    );
    return null;
  }

  // 4. Construct the notification payload for HTTP v1 API.
  const amountCLP = newOrder.clpAmount.toLocaleString("es-CL", {
    style: "currency", currency: "CLP",
  });
  const notificationTitle = "Nuevo Pedido Recibido!";
  const notificationBody = `ID: ${orderId.slice(-5)} | ${newOrder.clientName} | ${amountCLP}`;
  const clickAction = `https://manzanoapp-2f775.web.app/?pay_order_id=${orderId}`;

  // Construct the message for multicast (Data-Only for robust SW handling)
  const message = {
    data: {
      title: notificationTitle,
      body: notificationBody,
      click_action: clickAction,
      orderId: orderId,
      icon: "https://manzanoapp-2f775.web.app/images/apple-touch-icon.png",
      tag: "new-order"
    },
    webpush: {
      headers: {
        Urgency: "high"
      },
      fcmOptions: {
        link: clickAction
      }
    },
    tokens: uniqueTokens,
  };

  console.log(`Intentando enviar notificacion a ${uniqueTokens.length} token(s) usando HTTP v1 API.`);

  // 6. Send the notification to all collected tokens.
  try {
    const response = await admin.messaging().sendEachForMulticast(message);
    console.log(`[Notifications] successCount=${response.successCount}, failureCount=${response.failureCount}`);

    if (response.failureCount > 0) {
      const cleanupPromises = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const failedToken = uniqueTokens[idx];
          console.warn(`[Notifications] Token index ${idx} failed`, {
            code: resp.error.code,
            message: resp.error.message,
            token: failedToken
          });

          // Si el token no está registrado (inválido/expirado), eliminarlo de la BD
          if (resp.error.code === 'messaging/registration-token-not-registered') {
            console.log(`[Notifications] Eliminando token inválido de la base de datos: ${failedToken.substring(0, 10)}...`);

            const cleanup = admin.firestore().collection("fcm_tokens")
              .where("tokens", "array-contains", failedToken)
              .get()
              .then(snapshot => {
                const updates = [];
                snapshot.forEach(doc => {
                  updates.push(doc.ref.update({
                    tokens: admin.firestore.FieldValue.arrayRemove(failedToken)
                  }));
                });
                return Promise.all(updates);
              })
              .catch(err => console.error("[Notifications] Error cleaning up token", err));

            cleanupPromises.push(cleanup);
          }
        }
      });

      if (cleanupPromises.length > 0) {
        await Promise.all(cleanupPromises);
        console.log(`[Notifications] Limpieza de tokens completada.`);
      }
    }
  } catch (error) {
    console.error('[Notifications] Error sending notifications', {
      message: error.message,
      code: error.code,
      stack: error.stack,
    });
  }

  return null;
});

exports.calculateCommissionOnPaid = onDocumentUpdated("orders/{orderId}", async (event) => {
  const beforeData = event.data.before.data();
  const afterData = event.data.after.data();
  const orderId = event.params.orderId;

  if (beforeData.status === "Pagado" || afterData.status !== "Pagado") {
    return null;
  }

  console.log(`Order ${orderId} was marked as paid. Checking for seller commission.`);

  const clpAmountForCommission = afterData.clpAmount;
  if (typeof clpAmountForCommission !== "number" || isNaN(clpAmountForCommission)) {
    console.error(`[${orderId}] El campo 'clpAmount' no es un numero valido (${clpAmountForCommission}) para el calculo de comision. Saltando calculo.`);
    return null;
  }

  const sellerIdFromDoc = typeof afterData.sellerId === "string" ? afterData.sellerId.trim() : "";
  const sellerEmailFromDoc = typeof afterData.sellerEmail === "string" ? afterData.sellerEmail.trim() : "";
  const fallbackSellerId = typeof afterData.userId === "string" ? afterData.userId.trim() : "";
  let sellerCommissionRate = typeof afterData.sellerCommissionRate === "number" && !isNaN(afterData.sellerCommissionRate)
    ? afterData.sellerCommissionRate
    : null;

  const sellerId = sellerIdFromDoc || fallbackSellerId;
  let sellerEmail = sellerEmailFromDoc;

  if (!sellerId) {
    console.log(`[${orderId}] El pedido pagado no tiene sellerId asociado. Se omite la generacion de comision.`);
    return null;
  }

  if (!sellerCommissionRate || sellerCommissionRate <= 0) {
    console.log(`[${orderId}] No se encontro una tasa de comision valida para el vendedor ${sellerId}. Se omite la comision.`);
    return null;
  }

  if (!sellerEmail) {
    console.log(`[${orderId}] No se encontro un correo asociado al vendedor ${sellerId}. Se omite la comision.`);
    return null;
  }

  const commissionAmount = clpAmountForCommission * sellerCommissionRate;
  const paidAt = afterData.paidAt && typeof afterData.paidAt.toDate === "function"
    ? afterData.paidAt
    : admin.firestore.Timestamp.now();

  const commissionData = {
    sellerId,
    sellerEmail,
    orderId,
    orderCLPAmount: afterData.clpAmount,
    commissionRate: sellerCommissionRate,
    commissionAmountCLP: commissionAmount,
    timestamp: paidAt,
    paidAt,
  };

  await admin.firestore().collection("seller_commissions").add(commissionData);
  console.log(`Commission of ${commissionAmount} CLP for seller ${sellerEmail} created for order ${orderId}.`);

  return null;
});



