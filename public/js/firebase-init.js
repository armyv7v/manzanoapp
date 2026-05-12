// Firebase initialization for Android native app
// This file initializes Firebase with configuration from google-services.json

document.addEventListener('DOMContentLoaded', function () {
    // Wait a bit for google-services.json to be processed
    setTimeout(function () {
        // Check if Firebase is already initialized (from google-services.json)
        if (!firebase.apps.length) {
            // If not, initialize with web config
            const firebaseConfig = {
                apiKey: "AIzaSyBqy_XpSxj0xHVtevs6bvLqQxbKhtBvEpw",
                authDomain: "manzanoapp-2f775.firebaseapp.com",
                projectId: "manzanoapp-2f775",
                storageBucket: "manzanoapp-2f775.firebasestorage.app",
                messagingSenderId: "780093634661",
                appId: "1:780093634661:web:80e9e8cbb0ad66a2889543"
            };
            firebase.initializeApp(firebaseConfig);
            console.log('Firebase initialized with web config');
        } else {
            console.log('Firebase already initialized (likely from google-services.json)');
        }
    }, 500);
});
