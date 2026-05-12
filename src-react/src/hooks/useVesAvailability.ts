import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import type { Query } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './useAuth';
import { useVesAccounts } from './useVesAccounts';

interface VesAvailabilityState {
    visiblePendingBalance: number;
    loading: boolean;
    error: string | null;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Calcula la disponibilidad operativa VES para el usuario actual:
 * saldo total en cuentas VES menos pedidos pendientes visibles del día según sus permisos.
 */
export function useVesAvailability() {
    const { user, role, loading: authLoading } = useAuth();
    const { totalBalance, loading: accountsLoading } = useVesAccounts();
    const [state, setState] = useState<VesAvailabilityState>({
        visiblePendingBalance: 0,
        loading: true,
        error: null,
    });

    useEffect(() => {
        if (authLoading) return;

        if (!user) {
            setState({ visiblePendingBalance: 0, loading: false, error: null });
            return;
        }

        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

        let q: Query = query(
            collection(db, 'orders'),
            where('status', '==', 'Pendiente de pago'),
            where('createdAt', '>=', startOfDay),
            where('createdAt', '<=', endOfDay)
        );

        if (role === 'client') {
            q = query(q, where('userId', '==', user.uid));
        } else if (role === 'seller') {
            q = query(q, where('sellerId', '==', user.uid));
        }

        setState(prev => ({ ...prev, loading: true, error: null }));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            let visiblePendingBalance = 0;

            snapshot.forEach((doc) => {
                const data = doc.data();
                const destinationCurrency = data.destinationCurrency || 'VES';
                if (destinationCurrency !== 'VES') return;
                visiblePendingBalance += Number(data.destinationAmount || 0);
            });

            setState({
                visiblePendingBalance: round2(visiblePendingBalance),
                loading: false,
                error: null,
            });
        }, (error) => {
            console.error('Error al calcular disponibilidad VES:', error);
            setState({
                visiblePendingBalance: 0,
                loading: false,
                error: error.message,
            });
        });

        return () => unsubscribe();
    }, [authLoading, role, user]);

    const availableBalance = useMemo(
        () => Math.max(0, round2(totalBalance - state.visiblePendingBalance)),
        [totalBalance, state.visiblePendingBalance]
    );

    return {
        totalBalance: round2(totalBalance),
        visiblePendingBalance: state.visiblePendingBalance,
        availableBalance,
        loading: accountsLoading || state.loading,
        error: state.error,
    };
}
