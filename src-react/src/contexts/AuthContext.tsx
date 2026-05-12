import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from 'react';
import {
    onAuthStateChanged as firebaseOnAuthStateChanged,
    signInWithEmailAndPassword as firebaseSignIn,
    createUserWithEmailAndPassword as firebaseCreateUser,
    sendPasswordResetEmail as firebaseSendReset,
    signOut as firebaseSignOut,
    GoogleAuthProvider,
    signInWithRedirect,
    type User,
} from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Capacitor } from '@capacitor/core';
import { auth } from '../lib/firebase';
import app from '../lib/firebase';

export interface AuthContextValue {
    user: User | null;
    role: 'admin' | 'seller' | 'client' | null;
    loading: boolean;
    error: string | null;
    signIn: (email: string, password: string) => Promise<User>;
    register: (email: string, password: string) => Promise<User>;
    signInWithGoogle: () => Promise<User | null>;
    resetPassword: (email: string) => Promise<void>;
    logout: () => Promise<void>;
}

interface AuthState {
    user: User | null;
    role: 'admin' | 'seller' | 'client' | null;
    loading: boolean;
    error: string | null;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

function mapAuthError(err: any, fallback: string): string {
    switch (err?.code) {
        case 'auth/invalid-credential':
        case 'auth/user-not-found':
        case 'auth/wrong-password':
            return 'Correo electronico o contrasena incorrectos.';
        case 'auth/invalid-email':
            return 'El formato del correo electronico es invalido.';
        case 'auth/too-many-requests':
            return 'Demasiados intentos fallidos. Intenta mas tarde.';
        case 'auth/email-already-in-use':
            return 'Ese correo ya esta registrado. Inicia sesion o usa otro correo.';
        case 'auth/weak-password':
            return 'La contrasena es demasiado debil. Usa al menos 6 caracteres.';
        case 'auth/popup-closed-by-user':
            return 'Cerraste la ventana de Google antes de completar el acceso.';
        case 'auth/popup-blocked':
            return 'Tu navegador bloqueo la ventana de Google. Permite popups e intentalo nuevamente.';
        case 'auth/cancelled-popup-request':
            return 'Se cancelo la solicitud anterior de acceso con Google. Intenta de nuevo.';
        case 'auth/account-exists-with-different-credential':
            return 'Ese correo ya existe con otro metodo de acceso. Inicia sesion con el metodo original.';
        case 'auth/unauthorized-domain':
            return 'Este dominio aun no esta autorizado en Firebase Authentication.';
        case 'auth/operation-not-allowed':
            return 'El proveedor de acceso todavia no esta habilitado en Firebase Authentication.';
        default:
            return err?.message || fallback;
    }
}

export function AuthProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<AuthState>({
        user: null,
        role: null,
        loading: true,
        error: null,
    });
    const ensuredProfileUidRef = useRef<string | null>(null);

    useEffect(() => {
        const unsubscribe = firebaseOnAuthStateChanged(auth, async (user) => {
            if (user) {
                let computedRole: 'admin' | 'seller' | 'client' = 'client';

                try {
                    await user.getIdToken(true);
                    const idTokenResult = await user.getIdTokenResult();
                    const isAdmin = !!idTokenResult.claims.admin;
                    const isSeller = !!idTokenResult.claims.seller;

                    if (isAdmin) {
                        computedRole = 'admin';
                    } else if (isSeller) {
                        computedRole = 'seller';
                    }
                } catch (error) {
                    console.error('Error reading auth claims:', error);
                }

                setState({
                    user,
                    role: computedRole,
                    loading: false,
                    error: null,
                });
            } else {
                ensuredProfileUidRef.current = null;
                setState({
                    user: null,
                    role: null,
                    loading: false,
                    error: null,
                });
            }
        });

        return unsubscribe;
    }, []);

    useEffect(() => {
        if (!state.user || state.loading) return;
        if (ensuredProfileUidRef.current === state.user.uid) return;

        ensuredProfileUidRef.current = state.user.uid;

        const ensureProfile = async () => {
            try {
                const functions = getFunctions(app);
                const ensureUserProfile = httpsCallable(functions, 'ensureUserProfile');
                await ensureUserProfile({
                    platform: Capacitor.isNativePlatform() ? 'native' : 'web',
                });
            } catch (error) {
                console.error('Error ensuring user profile from backend:', error);
                ensuredProfileUidRef.current = null;
            }
        };

        void ensureProfile();
    }, [state.user, state.loading]);

    const signIn = useCallback(async (email: string, password: string) => {
        setState(prev => ({ ...prev, loading: true, error: null }));
        try {
            const cred = await firebaseSignIn(auth, email, password);
            return cred.user;
        } catch (err: any) {
            console.error('Firebase Auth sign-in error:', err);
            const msg = mapAuthError(err, 'Error de autenticacion');
            setState(prev => ({ ...prev, loading: false, error: msg }));
            throw new Error(msg);
        }
    }, []);

    const register = useCallback(async (email: string, password: string) => {
        setState(prev => ({ ...prev, loading: true, error: null }));
        try {
            const cred = await firebaseCreateUser(auth, email, password);
            return cred.user;
        } catch (err: any) {
            const msg = mapAuthError(err, 'Error al crear cuenta');
            setState(prev => ({ ...prev, loading: false, error: msg }));
            throw new Error(msg);
        }
    }, []);

    const signInWithGoogle = useCallback(async () => {
        setState(prev => ({ ...prev, loading: true, error: null }));
        try {
            await signInWithRedirect(auth, googleProvider);
            return null;
        } catch (err: any) {
            console.error('Firebase Auth Google error:', err);
            const msg = mapAuthError(err, 'Error al acceder con Google');
            setState(prev => ({ ...prev, loading: false, error: msg }));
            throw new Error(msg);
        }
    }, []);

    const resetPassword = useCallback(async (email: string) => {
        try {
            await firebaseSendReset(auth, email);
        } catch (err: any) {
            throw new Error(mapAuthError(err, 'Error al enviar correo de recuperacion'));
        }
    }, []);

    const logout = useCallback(async () => {
        try {
            await firebaseSignOut(auth);
        } catch (err: any) {
            throw new Error(err.message || 'Error al cerrar sesion');
        }
    }, []);

    const value = useMemo<AuthContextValue>(() => ({
        user: state.user,
        role: state.role,
        loading: state.loading,
        error: state.error,
        signIn,
        register,
        signInWithGoogle,
        resetPassword,
        logout,
    }), [
        logout,
        register,
        resetPassword,
        signIn,
        signInWithGoogle,
        state.error,
        state.loading,
        state.role,
        state.user,
    ]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth debe usarse dentro de AuthProvider.');
    }

    return context;
}
