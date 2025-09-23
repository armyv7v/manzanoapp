const {onDocumentCreated} = require("firebase-functions/v2/firestore");
const {setGlobalOptions} = require("firebase-functions/v2");
const admin = require("firebase-admin");

admin.initializeApp();

/**
 * This function triggers when a new order is created in Firestore.
 * It sends a push notification to all registered admin devices.
 */

// Define la región donde se ejecutarán tus funciones. Es una buena práctica.
setGlobalOptions({region: "us-central1"});

exports.sendNewOrderNotification = onDocumentCreated("orders/{orderId}", async (event) => {
    // Get the orderId from the event parameters
    const {orderId} = event.params;

    // En la nueva versión, los datos del evento vienen en event.data
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
        adminData.tokens.forEach((token) => allTokens.add(token));
      }
    });

    const uniqueTokens = Array.from(allTokens);

    if (uniqueTokens.length === 0) {
      console.log(
          "Found admin users, but they have no registered device tokens.",
      );
      return null;
    }

    // 4. Construct the notification payload.
    const amountCLP = newOrder.clpAmount.toLocaleString("es-CL", {
      style: "currency", currency: "CLP",
    });
    const notificationTitle = "¡Nuevo Pedido Recibido! 🍏";
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

    console.log(`Sending notification to ${uniqueTokens.length} token(s).`);

    // 5. Define options for high-priority delivery.
    const options = {
      priority: "high",
      timeToLive: 60 * 60 * 24, // Keep message for 24 hours if device is offline
    };

    // 6. Send the notification to all collected tokens with high priority.
    try {
      await admin.messaging().sendToDevice(uniqueTokens, payload, options);
      console.log("Notifications sent successfully.");
    } catch (error) {
      console.error("Error sending notifications:", error);
    }

    return null;
  });
