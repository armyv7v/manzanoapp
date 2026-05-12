"use strict";
const admin = require("firebase-admin");
const serviceAccount = require("../serviceAccountKey.json");
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();
async function run() {
    console.log("Looking for user enderjpinar@gmail.com...");
    const snap = await db.collection("users").where("email", "==", "enderjpinar@gmail.com").get();
    if (snap.empty) {
        console.log("User not found!");
        return;
    }
    const user = snap.docs[0];
    const data = user.data();
    console.log("User UID:", user.id);
    console.log("\nfcmDeviceTokens:");
    console.log(JSON.stringify(data.fcmDeviceTokens, null, 2));
    console.log("\nfcmTokens (Legacy):", data.fcmTokens);
    console.log("fcmPlatformTokens (Legacy):", JSON.stringify(data.fcmPlatformTokens, null, 2));
    const tokens = [];
    if (data.fcmDeviceTokens) {
        for (const [key, val] of Object.entries(data.fcmDeviceTokens)) {
            if (val && val.token)
                tokens.push({ key, platform: val.platform, token: val.token });
        }
    }
    console.log("\nTesting Push to extracted tokens...");
    for (const t of tokens) {
        console.log(`\nSending to [${t.platform}] token: ${t.token.substring(0, 15)}...`);
        try {
            const response = await admin.messaging().send({
                token: t.token,
                notification: {
                    title: `Test a ${t.platform}`,
                    body: "Mensaje de diagnóstico"
                },
                android: {
                    priority: "high",
                    notification: {
                        channelId: "high_priority",
                        sound: "default",
                        icon: "ic_stat_notification",
                        color: "#8cb33e",
                    },
                },
            });
            console.log("Success! Message ID:", response);
        }
        catch (error) {
            console.log("Failed! Error:", error.message, error.errorInfo);
        }
    }
}
run().catch(console.error);
//# sourceMappingURL=verify_ender_tokens.js.map