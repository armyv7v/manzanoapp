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

// Define la regiÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n y aumenta los recursos para diagnÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³stico.
// El error de timeout durante la inicializaciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n a veces se resuelve
// especificando explÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­citamente mÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡s memoria y tiempo.
setGlobalOptions({
  region: "us-central1",
  timeoutSeconds: 60, // Aumentado de 10s (implÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­cito) a 60s
  memory: "256MB",    // Aumentado de 128MB (implÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­cito)
});

exports.sendNewOrderNotification = onDocumentCreated("orders/{orderId}", async (event) => {
    // Add a version log to verify deployment
    console.log("Executing function version: v3. Notif Fix.");

    // Get the orderId from the event parameters
    const {orderId} = event.params;

    // En la nueva versiÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n, los datos del evento vienen en event.data
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

    // Validar que clpAmount sea un número válido para la notificación
    const clpAmountForNotification = newOrder.clpAmount;
    if (typeof clpAmountForNotification !== 'number' || isNaN(clpAmountForNotification)) {
        console.error(`[${orderId}] El campo 'clpAmount' no es un número válido (${clpAmountForNotification}) para la notificación. Saltando notificación.`);
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
    const notificationTitle = "ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡Nuevo Pedido Recibido! ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â";
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

    console.log(`Intentando enviar notificaciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n a ${uniqueTokens.length} token(s).`);

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
        console.warn(`FallÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³ el envÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­o a ${response.failureCount} tokens.`);
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

  // Exit if status didn't change to "Pagado"
  if (beforeData.status === "Pagado" || afterData.status !== "Pagado") {
    return null;
  }

  console.log(`Order ${orderId} was marked as paid. Checking for seller commission.`);

  // Validar que clpAmount sea un número válido para el cálculo de comisión
  const clpAmountForCommission = afterData.clpAmount;
  if (typeof clpAmountForCommission !== 'number' || isNaN(clpAmountForCommission)) {
      console.error(`[${orderId}] El campo 'clpAmount' no es un número válido (${clpAmountForCommission}) para el cálculo de comisión. Saltando cálculo.`);
      return null;
  }

  // --- Seller Commission Logic ---
  if (afterData.userId) {
    try {
      const user = await admin.auth().getUser(afterData.userId);
      if (user.customClaims && user.customClaims.seller === true && user.customClaims.commissionRate > 0) {
        const commissionRate = user.customClaims.commissionRate;
        const commissionAmount = clpAmountForCommission * commissionRate;

        const commissionData = {
          sellerId: user.uid,
          sellerEmail: user.email,
          orderId,
          orderCLPAmount: afterData.clpAmount,
          commissionRate,
          commissionAmountCLP: commissionAmount, // Using clpAmountForCommission here
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        };

        await admin.firestore().collection("seller_commissions").add(commissionData);
        console.log(`Commission of ${commissionAmount} CLP for seller ${user.email} created for order ${orderId}.`);
      } else {
        console.log(`Order creator ${user.email} is not a seller or has no commission rate.`);
      }
    } catch (error) {
      console.error(`Error processing seller commission for user ${afterData.userId}:`, error);
    }
  } else {
    console.log("Order has no associated userId, skipping commission check.");
  }

  return null;
});
