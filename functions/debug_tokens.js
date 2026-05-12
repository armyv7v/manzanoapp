const admin = require("firebase-admin");
const serviceAccount = require("./manzanoapp-2f775-firebase-adminsdk-3tlyf-96a9e14cc7.json"); // Assuming a locally available key, but I'll use default credential instead

admin.initializeApp({
    // Fallback to application default credentials if available
    credential: admin.credential.applicationDefault()
});

async function main() {
    const db = admin.firestore();
    console.log("Conectado a Firestore. Buscando admin: enderjpinar@gmail.com");

    const snapshot = await db.collection("users").where("email", "==", "enderjpinar@gmail.com").get();

    if (snapshot.empty) {
        console.log("No se encontró el usuario admin.");
        return;
    }

    snapshot.forEach(doc => {
        const data = doc.data();
        console.log("------ USUARIO ADMIN ------");
        console.log("ID:", doc.id);
        console.log("\n--- fcmToken (Legacy) ---");
        console.log(data.fcmToken);

        console.log("\n--- fcmTokens (Array Legacy) ---");
        console.log(JSON.stringify(data.fcmTokens, null, 2));

        console.log("\n--- fcmPlatformTokens ---");
        console.log(JSON.stringify(data.fcmPlatformTokens, null, 2));

        console.log("\n--- fcmDeviceTokens ---");
        console.log(JSON.stringify(data.fcmDeviceTokens, null, 2));
    });
}

main().catch(console.error);
