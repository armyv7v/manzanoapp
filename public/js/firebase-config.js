// Firebase configuration
// This configuration works for both web and native platforms

const firebaseConfig = {
    apiKey: "AIzaSyBqy_XpSxj0xHVtevs6bvLqQxbKhtBvEpw",
    authDomain: "manzanoapp-2f775.firebaseapp.com",
    projectId: "manzanoapp-2f775",
    storageBucket: "manzanoapp-2f775.firebasestorage.app",
    messagingSenderId: "780093634661",
    appId: "1:780093634661:web:80e9e8cbb0ad66a2889543"
};

// Initialize Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
    console.log('Firebase initialized successfully');
} else {
    console.log('Firebase already initialized');
}
