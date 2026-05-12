"use strict";
const admin = require("firebase-admin");
// Initialize Firebase Admin with default credentials
// Since we are running in the project directory, it might be able to use the default app if authenticated via firebase CLI,
// OR we can just use the standard GOOGLE_APPLICATION_CREDENTIALS if available.
// A simpler way for a local script when Firebase CLI is authenticated is to use the firebase-admin Node SDK
// But wait, to read production DB we need a service account key or run via firebase functions:shell.
// Actually, `firebase-admin` can use Application Default Credentials if we run `gcloud auth application-default login`, 
// or if we use `firebase functions:shell` we can just run a quick snippet.
// I will write a script to be executed via `firebase-tools` or just a normal Node script if a key is available.
// Alternatively, I can write a script to be executed in the browser subagent, or via `firebase functions:shell`.
// Let's use standard `firebase-admin` and require the service account if it exists, or just try to init.
admin.initializeApp();
async function checkUsers() {
    const db = admin.firestore();
    const usersSnap = await db.collection("users").get();
    const usersWithTokens = [];
    const usersWithoutTokens = [];
    usersSnap.forEach(doc => {
        const data = doc.data();
        const email = data.email || "Sin email";
        const name = data.name || data.firstName || "Sin nombre";
        const role = data.role || "client";
        let tokenCount = 0;
        let tokenTypes = [];
        if (Array.isArray(data.webTokens) && data.webTokens.length > 0) {
            tokenCount += data.webTokens.length;
            tokenTypes.push(`Web (${data.webTokens.length})`);
        }
        if (Array.isArray(data.iosTokens) && data.iosTokens.length > 0) {
            tokenCount += data.iosTokens.length;
            tokenTypes.push(`iOS (${data.iosTokens.length})`);
        }
        if (Array.isArray(data.androidTokens) && data.androidTokens.length > 0) {
            tokenCount += data.androidTokens.length;
            tokenTypes.push(`Android (${data.androidTokens.length})`);
        }
        if (tokenCount > 0) {
            usersWithTokens.push({
                email,
                name,
                role,
                tokenCount,
                types: tokenTypes.join(', ')
            });
        }
        else {
            usersWithoutTokens.push({
                email,
                name,
                role
            });
        }
    });
    console.log("\n=========================================");
    console.log(`✅ USUARIOS CON NOTIFICACIONES ACTIVAS (${usersWithTokens.length}):`);
    console.log("=========================================");
    usersWithTokens.forEach(u => {
        console.log(`- ${u.email} (${u.role}): ${u.tokenCount} token(s) [${u.types}]`);
    });
    console.log("\n=========================================");
    console.log(`❌ USUARIOS SIN NOTIFICACIONES (${usersWithoutTokens.length}):`);
    console.log("=========================================");
    usersWithoutTokens.forEach(u => {
        console.log(`- ${u.email} (${u.role})`);
    });
}
checkUsers().catch(console.error);
//# sourceMappingURL=check_tokens.js.map