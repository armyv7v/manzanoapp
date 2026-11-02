import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { USER_TAGS } from '../lib/constants';

export interface StaffUser {
    uid: string;
    email: string;
    isAdmin: boolean;
    isSeller: boolean;
    /** Tag del doc users (nuevo) con fallback al mapa hardcodeado. */
    tag: string;
}

/**
 * Lista de administradores y vendedores para selects como reasignación de
 * pedidos. Antes era la lista hardcodeada USER_TAGS: dar de alta un vendedor
 * exigía editar código y desplegar. Ahora alimenta el alta normal de usuarios
 * (doc users con isAdmin/isSeller que ya crea el login) y, opcionalmente, el
 * campo `tag` del doc (fallback al mapa legacy mientras exista).
 *
 * La colección `users` es chica (app users, no clientes): un snapshot es barato.
 */
export function useStaffUsers() {
    const [staff, setStaff] = useState<StaffUser[]>([]);
    const [loading, setLoading] = useState(true);

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
            setStaff(list);
            setLoading(false);
        }, () => setLoading(false));

        return () => unsubscribe();
    }, []);

    return { staff, loading };
}
