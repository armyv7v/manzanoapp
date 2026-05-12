// public/js/services/firebase.js

// Ensure firebase is initialized (it should be by the script in index.html and firebase-init.js)
// We export the instances to be used by other modules without relying on the global 'firebase' variable everywhere

if (!firebase.apps.length) {
    console.warn("Firebase not initialized when firebase.js was loaded. Ensuring initialization check.");
}

export const db = firebase.firestore();
export const auth = window.authWrapper || firebase.auth(); // Fallback if wrapper unique to app.js
export const storage = firebase.storage();
export const messaging = firebase.messaging.isSupported() ? firebase.messaging() : null;
export const functions = firebase.functions();

export const Timestamp = firebase.firestore.Timestamp;
export const FieldValue = firebase.firestore.FieldValue;
