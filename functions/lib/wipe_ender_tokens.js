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
    const userRef = snap.docs[0].ref;
    console.log("Wiping all existing FCM tokens for this user...");
    await userRef.update({
        fcmToken: admin.firestore.FieldValue.delete(),
        fcmTokens: admin.firestore.FieldValue.delete(),
        fcmDeviceTokens: admin.firestore.FieldValue.delete(),
        fcmPlatformTokens: admin.firestore.FieldValue.delete()
    });
    console.log("Done. User tokens are now completely empty.");
}
run().catch(console.error);
//# sourceMappingURL=wipe_ender_tokens.js.map