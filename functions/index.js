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
    const payload = {
      notification: {
        title: "¡Nuevo Pedido Recibido! 🍏",
        body: `ID: ${orderId.slice(-5)} | ${newOrder.clientName} | ${amountCLP}`,
        icon: "https://manzanoapp-2f775.web.app/images/apple-touch-icon.png",
        click_action: "https://manzanoapp-2f775.web.app/",
        // Añadimos la URL del sonido que queremos que se reproduzca
        sound: "https://manzanoapp-2f775.web.app/sounds/notification.mp3",
      },
    };

    console.log(`Sending notification to ${uniqueTokens.length} token(s).`);

    // 5. Send the notification to all collected tokens.
    try {
      await admin.messaging().sendToDevice(uniqueTokens, payload);
      console.log("Notifications sent successfully.");
    } catch (error) {
      console.error("Error sending notifications:", error);
    }

    return null;
  });
