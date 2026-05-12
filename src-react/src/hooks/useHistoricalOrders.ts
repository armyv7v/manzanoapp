import { useState, useCallback } from 'react';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import type { Query, DocumentData } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './useAuth';
import type { Order } from './useOrders';

interface HistoryState {
    orders: Order[];
    loading: boolean;
    error: string | null;
    summary: string;
}

/**
 * Hook para buscar pedidos históricos por rango de fechas y status.
 * Replica la lógica de app.js líneas 4420-4520.
 */
export function useHistoricalOrders() {
    const { user, role } = useAuth();
    const [state, setState] = useState<HistoryState>({
        orders: [],
        loading: false,
        error: null,
        summary: '',
    });

    const search = useCallback(async (startDate: Date, endDate: Date, statusFilter: string = 'Todos') => {
        if (!user) return;
        setState(prev => ({ ...prev, loading: true, error: null }));

        try {
            const queryStart = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), 0, 0, 0);
            const queryEnd = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), 23, 59, 59, 999);

            const ordersRef = collection(db, 'orders');
            let q: Query<DocumentData, DocumentData> = query(
                ordersRef,
                where('createdAt', '>=', queryStart),
                where('createdAt', '<=', queryEnd),
                orderBy('createdAt', 'desc')
            );

            if (role === 'client') {
                q = query(q, where('userId', '==', user.uid));
            } else if (role === 'seller') {
                q = query(q, where('sellerId', '==', user.uid));
            }

            const snapshot = await getDocs(q);
            let allOrders: Order[] = [];

            snapshot.forEach(docSnap => {
                const data = docSnap.data();
                allOrders.push({
                    id: docSnap.id,
                    clientName: data.clientName || '',
                    cedula: data.cedula || '',
                    clpAmount: data.clpAmount || 0,
                    destinationAmount: data.destinationAmount || 0,
                    destinationCurrency: data.destinationCurrency || 'VES',
                    type: data.type || '',
                    status: data.status || '',
                    bank: data.bank,
                    phone: data.phone,
                    accountNumber: data.accountNumber,
                    accountType: data.accountType,
                    country: data.country,
                    proofUrl: data.proofUrl,
                    paidByTag: data.paidByTag,
                    createdByTag: data.createdByTag,
                    createdAt: data.createdAt,
                    paidAt: data.paidAt,
                });
            });

            // Filtrar por status en el cliente (Firestore no permite inequality en múltiples campos)
            const filtered = statusFilter === 'Todos'
                ? allOrders.filter(o => o.status !== 'Cliente Registrado')
                : allOrders.filter(o => o.status === statusFilter);

            const totalPaidCLP = filtered
                .filter(o => o.status === 'Pagado')
                .reduce((sum, o) => sum + o.clpAmount, 0);

            const summary = filtered.length === 0
                ? 'No se encontraron pedidos para los filtros seleccionados.'
                : `${filtered.length} pedidos encontrados. Total Pagado: ${totalPaidCLP.toLocaleString('es-CL', { style: 'currency', currency: 'CLP' })}`;

            setState({ orders: filtered, loading: false, error: null, summary });
        } catch (err: any) {
            setState({ orders: [], loading: false, error: err.message, summary: 'Error al buscar.' });
        }
    }, [user, role]);

    return { ...state, search };
}
