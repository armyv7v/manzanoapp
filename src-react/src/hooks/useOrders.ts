import { useState, useEffect, useCallback } from 'react';
import {
    collection, query, where, orderBy, onSnapshot
} from 'firebase/firestore';
import type { Timestamp, QueryDocumentSnapshot, DocumentData, Query } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './useAuth';

export interface Order {
    id: string;
    clientName: string;
    cedula: string;
    clpAmount: number;
    destinationAmount: number;
    destinationCurrency: string;
    type: string;
    status: string;
    bank?: string;
    phone?: string;
    accountNumber?: string;
    accountType?: string;
    docType?: string;
    country?: string;
    proofUrl?: string;
    paidByTag?: string;
    createdByTag?: string;
    email?: string;
    createdAt?: Timestamp;
    paidAt?: Timestamp;
    isDebtor?: boolean;
    isDuplicate?: boolean;
    sellerId?: string;
    sellerEmail?: string;
    sellerCommissionRate?: number;
    emailSent?: boolean;
    emailSentAt?: Timestamp;
    emailError?: string;
    sourceAccountId?: string;
    sourceAccountBank?: string;
    sourceAccountHolder?: string;
}

interface OrdersState {
    pending: Order[];
    paid: Order[];
    loading: boolean;
    error: string | null;
}

/**
 * Hook que se suscribe en tiempo real a los pedidos del día actual.
 * Replica la lógica de escucha de órdenes de app.js.
 */
export function useOrders() {
    const { user, role, loading: authLoading } = useAuth();
    const [state, setState] = useState<OrdersState>({
        pending: [],
        paid: [],
        loading: true,
        error: null,
    });

    const subscribeToToday = useCallback(() => {
        if (authLoading || !user) return; // Wait until authed

        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

        const ordersRef = collection(db, 'orders');
        let q: Query<DocumentData, DocumentData> = query(
            ordersRef,
            where('createdAt', '>=', startOfDay),
            where('createdAt', '<=', endOfDay),
            orderBy('createdAt', 'desc')
        );

        if (role === 'client') {
            q = query(q, where('userId', '==', user.uid));
        } else if (role === 'seller') {
            q = query(q, where('sellerId', '==', user.uid));
        }

        const unsubscribe = onSnapshot(
            q,
            (snapshot) => {
                const pending: Order[] = [];
                const paid: Order[] = [];

                snapshot.forEach((doc: QueryDocumentSnapshot<DocumentData>) => {
                    const data = doc.data();
                    const order: Order = {
                        id: doc.id,
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
                        docType: data.docType,
                        country: data.country,
                        proofUrl: data.proofUrl,
                        paidByTag: data.paidByTag,
                        createdByTag: data.createdByTag,
                        email: data.email,
                        createdAt: data.createdAt,
                        paidAt: data.paidAt,
                        isDebtor: data.isDebtor,
                        sellerId: data.sellerId,
                        sellerEmail: data.sellerEmail,
                        sellerCommissionRate: data.sellerCommissionRate,
                        emailSent: data.emailSent,
                        emailSentAt: data.emailSentAt,
                        emailError: data.emailError,
                        sourceAccountId: data.sourceAccountId,
                        sourceAccountBank: data.sourceAccountBank,
                        sourceAccountHolder: data.sourceAccountHolder,
                    };

                    if (order.status === 'Pendiente de pago') {
                        pending.push(order);
                    } else if (order.status === 'Pagado') {
                        paid.push(order);
                    }
                });

                setState({ pending, paid, loading: false, error: null });
            },
            (error) => {
                console.error('Error al escuchar los pedidos:', error);
                setState(prev => ({ ...prev, loading: false, error: error.message }));
            }
        );

        return unsubscribe;
    }, [user, role, authLoading]);

    useEffect(() => {
        const unsubscribe = subscribeToToday();
        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, [subscribeToToday]);

    return state;
}
