import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { USER_TAGS } from '../lib/constants';
import { setUserTagOverrides } from '../lib/userTagOverrides';

export interface StaffUser {
    uid: string;
    email: string;
    isAdmin: boolean;
    isSeller: boolean;
    /** Tag del doc users (nuevo) con fallback al mapa hardcodeado. */
    tag: string;
}

interface StaffUsersState {
    staff: StaffUser[];
    loading: boolean;
}

const StaffUsersContext = createContext<StaffUsersState | null>(null);

/**
 * Único snapshot de la colección `users` (app users, no clientes: es chica).
 * Alimenta dos cosas:
 *  1. Selects dinámicos (reasignación de pedidos) sin editar código.
 *  2. El resolver de tags app-wide (userTagOverrides): el TIPO de comisión
 *     de venta (CLP/VES) que decide el pago se resuelve del campo `tag`
 *     del doc users con fallback al mapa hardcodeado USER_TAGS.
 */
export function StaffUsersProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<StaffUsersState>({ staff: [], loading: true });

    useEffect(() => {
        const unsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
            const list: StaffUser[] = snapshot.docs
                .map(d => {
                    const data = d.data() || {};
                    const email = typeof data.email === 'string' ? data.email : '';
                    return {
                        uid: d.id,
                        email,
                        isAdmin: data.isAdmin === true,
                        isSeller: data.isSeller === true,
                        tag: (typeof data.tag === 'string' && data.tag) || USER_TAGS[email] || '',
                    };
                })
                .filter(u => u.email && (u.isAdmin || u.isSeller))
                .sort((a, b) => {
                    if (a.isAdmin !== b.isAdmin) return a.isAdmin ? -1 : 1;
                    return a.email.localeCompare(b.email);
                });
            setState({ staff: list, loading: false });

            // Cargar el resolver de tags con lo que diga la BD (solo docs con tag).
            setUserTagOverrides(
                snapshot.docs
                    .map(d => ({ email: d.data().email, tag: d.data().tag }))
                    .filter((e): e is { email: string; tag: string } =>
                        typeof e.email === 'string' && typeof e.tag === 'string' && !!e.tag
                    )
            );
        }, () => setState(prev => ({ ...prev, loading: false })));

        return () => unsubscribe();
    }, []);

    return (
        <StaffUsersContext.Provider value={state}>
            {children}
        </StaffUsersContext.Provider>
    );
}

export function useStaffUsers(): StaffUsersState {
    const ctx = useContext(StaffUsersContext);
    if (!ctx) throw new Error('useStaffUsers debe usarse dentro de StaffUsersProvider');
    return ctx;
}
