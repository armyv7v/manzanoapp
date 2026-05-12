import { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

/**
 * Hook para cambiar el estado de la tienda (abierta/cerrada).
 * Actualiza config/rate.isTakingOrders en Firestore.
 */
export function useStoreToggle() {
    const [loading, setLoading] = useState(false);

    const toggleStore = async (newStatus: boolean) => {
        setLoading(true);
        try {
            const rateRef = doc(db, 'config', 'rate');
            await updateDoc(rateRef, { isTakingOrders: newStatus });
        } catch (err: any) {
            console.error('Error al cambiar estado de la tienda:', err);
            throw new Error(err.message || 'Error al actualizar');
        } finally {
            setLoading(false);
        }
    };

    return { toggleStore, loading };
}
