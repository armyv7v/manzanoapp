// Dual-Platform Authentication Wrapper
// Refactored to use Firebase Web SDK for Email/Password on all platforms
// This ensures firebase.storage() and firebase.firestore() (JS SDK) are always authenticated

// Current user state
let currentUser = null;
let authStateCallbacks = [];

// Platform detection
const isNativePlatform = () => {
    return typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform && Capacitor.isNativePlatform();
};

// ===== WEB AUTHENTICATION (Firebase Web SDK) =====
const getWebAuth = () => {
    if (typeof firebase === 'undefined' || !firebase.auth) {
        return null;
    }
    return firebase.auth();
};

// ===== UNIFIED API =====

// Notify all callbacks of auth state change
function notifyAuthStateChange() {
    authStateCallbacks.forEach(callback => {
        try {
            callback(currentUser);
        } catch (error) {
            console.error('Error in auth state callback:', error);
        }
    });
}

// Sign in with email and password
async function signInWithEmailAndPassword(email, password) {
    const auth = getWebAuth();
    if (!auth) throw new Error('Firebase Auth not available');
    try {
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        currentUser = userCredential.user;
        notifyAuthStateChange();
        return { user: currentUser };
    } catch (error) {
        console.error('Sign in error:', error);
        throw new Error(error.message || 'Error de autenticación');
    }
}

// Create user with email and password (NEW)
async function createUserWithEmailAndPassword(email, password) {
    const auth = getWebAuth();
    if (!auth) throw new Error('Firebase Auth not available');
    try {
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        currentUser = userCredential.user;
        notifyAuthStateChange();
        return { user: currentUser };
    } catch (error) {
        console.error('Registration error:', error);
        throw new Error(error.message || 'Error al crear cuenta');
    }
}

// Send password reset email (NEW)
async function sendPasswordResetEmail(email) {
    const auth = getWebAuth();
    if (!auth) throw new Error('Firebase Auth not available');
    try {
        await auth.sendPasswordResetEmail(email);
    } catch (error) {
        console.error('Password reset error:', error);
        throw new Error(error.message || 'Error al enviar correo de recuperación');
    }
}

// Sign out
async function signOut() {
    const auth = getWebAuth();
    if (!auth) throw new Error('Firebase Auth not available');
    try {
        await auth.signOut();
        currentUser = null;
        notifyAuthStateChange();
    } catch (error) {
        console.error('Sign out error:', error);
        throw error;
    }
}

// Get current user
function getCurrentUser() {
    return currentUser;
}

// Add auth state change listener
function onAuthStateChanged(callback) {
    authStateCallbacks.push(callback);
    if (currentUser !== null) {
        callback(currentUser);
    }
    return () => {
        const index = authStateCallbacks.indexOf(callback);
        if (index > -1) {
            authStateCallbacks.splice(index, 1);
        }
    };
}

// Initialize authentication
async function initAuth() {
    const auth = getWebAuth();
    if (!auth) return;
    auth.onAuthStateChanged((user) => {
        currentUser = user;
        notifyAuthStateChange();
    });
}

// Export the API
window.authWrapper = {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    sendPasswordResetEmail,
    signOut,
    getCurrentUser,
    onAuthStateChanged
};

initAuth();
