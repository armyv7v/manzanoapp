/**
 * ============================================================
 *  send_notification.js
 *  Script para enviar notificaciones personalizadas (eventos/promociones)
 *  a TODOS los usuarios de la app Manzano.
 *
 *  Uso:
 *    node send_notification.js "Tu mensaje personalizado aquí 🎉"
 *
 *  Ejemplo:
 *    node send_notification.js "🎉¡Feliz día de la Mujer!🎉 para todas esas mujeres 👩🏼👩 que forman parte del Equipo Manzano 🍏"
 *
 *  Requisito: debes estar autenticado con Firebase CLI.
 *    firebase login
 *    (o tener GOOGLE_APPLICATION_CREDENTIALS apuntando al service account)
 * ============================================================
 */

const admin = require("firebase-admin");
const serviceAccount = require("../serviceAccountKey.json");

// ──────────────────────────────────────────────────────────
// 1. Leer el mensaje desde los argumentos de línea de comandos
// ──────────────────────────────────────────────────────────
const mensaje = process.argv[2];

if (!mensaje || mensaje.trim() === "") {
    console.error("\n❌ ERROR: Debes proporcionar un mensaje como primer argumento.");
    console.error('   Ejemplo: node send_notification.js "🎉¡Feliz día de la Mujer!🎉"');
    process.exit(1);
}

// ──────────────────────────────────────────────────────────
// 2. Inicializar Firebase Admin
// ──────────────────────────────────────────────────────────
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

// ──────────────────────────────────────────────────────────
// 3. Recolectar tokens FCM de un documento de usuario
//    (misma lógica que el index.ts de Cloud Functions)
// ──────────────────────────────────────────────────────────
function collectTokensFromUser(data) {
    const tokens = new Set();

    // Fuente preferida: mapa de dispositivos fcmDeviceTokens
    if (data?.fcmDeviceTokens && typeof data.fcmDeviceTokens === "object") {
        Object.values(data.fcmDeviceTokens).forEach((entry) => {
            const token = entry?.token;
            if (typeof token === "string" && token.trim()) tokens.add(token);
        });
    }
    if (tokens.size > 0) return Array.from(tokens);

    // Compatibilidad hacia atrás: fcmPlatformTokens
    const webToken = data?.fcmPlatformTokens?.web?.token;
    const nativeToken = data?.fcmPlatformTokens?.native?.token;
    if (typeof webToken === "string" && webToken.trim()) tokens.add(webToken);
    if (typeof nativeToken === "string" && nativeToken.trim()) tokens.add(nativeToken);

    // Campos legacy
    if (typeof data?.fcmToken === "string" && data.fcmToken.trim()) tokens.add(data.fcmToken);
    if (Array.isArray(data?.fcmTokens)) {
        data.fcmTokens.forEach((t) => {
            if (typeof t === "string" && t.trim()) tokens.add(t);
        });
    }

    return Array.from(tokens);
}

// ──────────────────────────────────────────────────────────
// 4. Enviar la notificación a un único token
// ──────────────────────────────────────────────────────────
async function sendToToken(token, title, body) {
    try {
        await admin.messaging().send({
            token,
            notification: { title, body },
            webpush: {
                notification: {
                    title,
                    body,
                    icon: "/images/icon-192x192.png",
                    vibrate: [200, 100, 200, 100, 200],
                    requireInteraction: true,
                },
                fcmOptions: { link: "/" },
            },
            apns: { payload: { aps: { sound: "default" } } },
            android: {
                priority: "high",
                notification: {
                    channelId: "manzano_alerts_v1",
                    sound: "default",
                    icon: "ic_stat_notification",
                    color: "#8cb33e",
                },
            },
        });
        return { success: true };
    } catch (error) {
        return { success: false, error: error.code || error.message };
    }
}

// ──────────────────────────────────────────────────────────
// 5. Función principal
// ──────────────────────────────────────────────────────────
async function sendPromoNotification() {
    const title = "📢 Equipo Manzano";
    const body = mensaje.trim();

    console.log("\n============================================================");
    console.log("  🍏 MANZANO - Envío de Notificación Personalizada");
    console.log("============================================================");
    console.log(`  Título : ${title}`);
    console.log(`  Mensaje: ${body}`);
    console.log("============================================================\n");

    // Obtener todos los usuarios
    const usersSnap = await db.collection("users").get();
    console.log(`📋 Usuarios encontrados en la base de datos: ${usersSnap.size}`);

    // Recolectar tokens únicos y hacer un mapa token → email (para el reporte)
    const tokenMap = new Map(); // token → email/name del usuario
    usersSnap.forEach((doc) => {
        const data = doc.data();
        const tokens = collectTokensFromUser(data);
        const label = data.email || data.name || doc.id;
        tokens.forEach((t) => {
            if (!tokenMap.has(t)) tokenMap.set(t, label);
        });
    });

    const allTokens = Array.from(tokenMap.keys());
    const usersWithoutTokens = usersSnap.size - [...tokenMap.values()].reduce((acc, _) => acc, 0);

    if (allTokens.length === 0) {
        console.warn("⚠️  No se encontraron tokens FCM activos en ningún usuario.");
        process.exit(0);
    }

    console.log(`🔔 Tokens FCM únicos a los que se enviará: ${allTokens.length}\n`);

    // Enviar a todos los tokens en paralelo
    const results = await Promise.all(
        allTokens.map((token) => sendToToken(token, title, body))
    );

    // Resumen
    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.length - successCount;

    console.log("============================================================");
    console.log("  ✅ RESUMEN DEL ENVÍO");
    console.log("============================================================");
    console.log(`  Exitosos : ${successCount} / ${allTokens.length}`);
    console.log(`  Fallidos : ${failureCount} / ${allTokens.length}`);

    if (failureCount > 0) {
        console.log("\n  ⚠️  Tokens con error:");
        results.forEach((r, i) => {
            if (!r.success) {
                const email = tokenMap.get(allTokens[i]);
                console.log(`     - [${email}] Error: ${r.error}`);
            }
        });
    }

    console.log("\n  🎉 ¡Notificación enviada exitosamente!");
    console.log("============================================================\n");
}

// ──────────────────────────────────────────────────────────
// 6. Ejecutar
// ──────────────────────────────────────────────────────────
sendPromoNotification().catch((err) => {
    console.error("\n❌ Error inesperado:", err.message || err);
    process.exit(1);
});
