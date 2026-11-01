import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getMessaging, isSupported } from 'firebase/messaging';
import type { FirebaseApp } from 'firebase/app';

const firebaseConfig = {
    apiKey: "AIzaSyDLZBYfANw7o7FEOrw83PSrrQ7KmamAPEE",
    authDomain: "cambiosmanzano.app",
    projectId: "manzanoapp-2f775",
    storageBucket: "manzanoapp-2f775.firebasestorage.app",
    messagingSenderId: "250652050778",
    appId: "1:250652050778:web:cb43d53c10989b046fdf63"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

// Persistencia offline en IndexedDB: los writes en cola se envian al
// recuperar red y los pedidos/lecturas sobreviven a cortes y arranques
// en frio (critico en movil). Sin IndexedDB (WebView antiguo, pruebas),
// cae a cache en memoria como antes.
function createDb(app: FirebaseApp) {
    try {
        if (typeof indexedDB !== 'undefined') {
            return initializeFirestore(app, {
                localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
            });
        }
    } catch (err) {
        console.warn('Persistencia offline no disponible, usando cache en memoria:', err);
    }
    return getFirestore(app);
}
export const db = createDb(app);
export const storage = getStorage(app);

let messagingInstance: any = null;
isSupported().then((supported) => {
    if (supported) {
        messagingInstance = getMessaging(app);
    }
});
export const messaging = messagingInstance;

export default app;
