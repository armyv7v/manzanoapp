const {onDocumentCreated, onDocumentUpdated} = require("firebase-functions/v2/firestore");
const {setGlobalOptions} = require("firebase-functions/v2");
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

// Define la regiÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n y aumenta los recursos para diagnÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³stico.
// El error de timeout durante la inicializaciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n a veces se resuelve
// especificando explÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­citamente mÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡s memoria y tiempo.
setGlobalOptions({
  region: "us-central1",
  timeoutSeconds: 60, // Aumentado de 10s (implÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­cito) a 60s
  memory: "256MB",    // Aumentado de 128MB (implÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­cito)
});

exports.sendNewOrderNotification = onDocumentCreated("orders/{orderId}", async (event) => {
    // Add a version log to verify deployment
    console.log("Executing function version: v3. Notif Fix.");

    // Get the orderId from the event parameters
    const {orderId} = event.params;

    // En la nueva versiÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n, los datos del evento vienen en event.data
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

    // Validar que clpAmount sea un nÃºmero vÃ¡lido para la notificaciÃ³n
    const clpAmountForNotification = newOrder.clpAmount;
    if (typeof clpAmountForNotification !== 'number' || isNaN(clpAmountForNotification)) {
        console.error(`[${orderId}] El campo 'clpAmount' no es un nÃºmero vÃ¡lido (${clpAmountForNotification}) para la notificaciÃ³n. Saltando notificaciÃ³n.`);
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

    // 4. Construct the notification payload.
    const amountCLP = newOrder.clpAmount.toLocaleString("es-CL", {
      style: "currency", currency: "CLP", // Using newOrder.clpAmount here, ensure it's validated above
    });
    const notificationTitle = "ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡Nuevo Pedido Recibido! ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â";
    const notificationBody = `ID: ${orderId.slice(-5)} | ${newOrder.clientName} | ${amountCLP}`;
    const clickAction = `https://manzanoapp-2f775.web.app/?pay_order_id=${orderId}`;

    const payload = {
      // The 'notification' payload is for when the app is in the background.
      // It's handled by the system, ensuring delivery.
      notification: {
        title: notificationTitle,
        body: notificationBody,
        icon: "https://manzanoapp-2f775.web.app/images/apple-touch-icon.png",
        click_action: clickAction,
        tag: "new-order",
      },
      // The 'data' payload is for when the app is in the foreground.
      // It allows us to show a custom in-app alert.
      data: {
        title: notificationTitle,
        body: notificationBody,
        click_action: clickAction,
      },
    };

    console.log(`Intentando enviar notificaciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n a ${uniqueTokens.length} token(s).`);

    // 5. Define options for high-priority delivery.
    const options = {
      priority: "high",
      timeToLive: 60 * 60 * 24, // Keep message for 24 hours if device is offline
    }; 
    
    // 6. Send the notification to all collected tokens with high priority.
    try {
      const response = await admin.messaging().sendToDevice(uniqueTokens, payload, options);
      console.log("Notifications sent successfully.");
      // Log any failures for debugging
      if (response.failureCount > 0) {
        console.warn(`FallÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³ el envÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­o a ${response.failureCount} tokens.`);
      }
    } catch (error) {
      console.error("Error sending notifications:", error);
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
    console.error(`[${orderId}] El campo 'clpAmount' no es un número válido (${clpAmountForCommission}) para el cálculo de comisión. Saltando cálculo.`);
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
    console.log(`[${orderId}] El pedido pagado no tiene sellerId asociado. Se omite la generación de comisión.`);
    return null;
  }

  if (!sellerCommissionRate || sellerCommissionRate <= 0) {
    console.log(`[${orderId}] No se encontró una tasa de comisión válida para el vendedor ${sellerId}. Se omite la comisión.`);
    return null;
  }

  if (!sellerEmail) {
    console.log(`[${orderId}] No se encontró un correo asociado al vendedor ${sellerId}. Se omite la comisión.`);
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



