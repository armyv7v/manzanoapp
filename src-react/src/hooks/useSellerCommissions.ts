import { useState, useCallback } from 'react';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './useAuth';

export interface CommissionEntry {
    id: string;
    amount: number;
    orderAmount: number;
    orderId: string;
    sellerEmail: string;
    timestamp: any;
}

export interface CommissionTotals {
    count: number;
    totalSalesCLP: number;
    totalCommissionCLP: number;
    netAmountCLP: number;
    liquidCommissionCLP: number;
}

interface CommState {
    entries: CommissionEntry[];
    loading: boolean;
    error: string | null;
    summary: string;
    totals: CommissionTotals;
}

export function useSellerCommissions() {
    const { user, role } = useAuth();
    const [state, setState] = useState<CommState>({
        entries: [],
        loading: false,
        error: null,
        summary: '',
        totals: {
            count: 0,
            totalSalesCLP: 0,
            totalCommissionCLP: 0,
            netAmountCLP: 0,
            liquidCommissionCLP: 0,
        },
    });

    const search = useCallback(async (sellerEmail: string, startDate: Date, endDate: Date) => {
        setState((prev) => ({ ...prev, loading: true, error: null }));

        try {
            if (!user) throw new Error('Sesion no valida.');

            const qStart = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), 0, 0, 0);
            const qEnd = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), 23, 59, 59, 999);

            const baseCollection = collection(db, 'seller_commissions');
            const q = role === 'seller'
                ? query(
                    baseCollection,
                    where('sellerId', '==', user.uid),
                    where('timestamp', '>=', qStart),
                    where('timestamp', '<=', qEnd),
                    orderBy('timestamp', 'desc')
                )
                : query(
                    baseCollection,
                    where('sellerEmail', '==', sellerEmail),
                    where('timestamp', '>=', qStart),
                    where('timestamp', '<=', qEnd),
                    orderBy('timestamp', 'desc')
                );

            if (role !== 'seller' && !sellerEmail) {
                throw new Error('Selecciona un vendedor.');
            }

            const snapshot = await getDocs(q);
            const entries: CommissionEntry[] = snapshot.docs.map((d) => {
                const data = d.data();
                return {
                    id: d.id,
                    amount: data.commissionAmountCLP || data.amount || 0,
                    orderAmount: data.orderCLPAmount || data.orderAmount || 0,
                    orderId: data.orderId || '',
                    sellerEmail: data.sellerEmail || sellerEmail || user.email || '',
                    timestamp: data.timestamp || data.createdAt,
                };
            });

            const totalSalesCLP = entries.reduce((sum, entry) => sum + entry.orderAmount, 0);
            const totalCommissionCLP = entries.reduce((sum, entry) => sum + entry.amount, 0);
            const netAmountCLP = totalSalesCLP - totalCommissionCLP;
            const totals: CommissionTotals = {
                count: entries.length,
                totalSalesCLP,
                totalCommissionCLP,
                netAmountCLP,
                liquidCommissionCLP: totalCommissionCLP,
            };
            const summary = entries.length === 0
                ? 'No hay comisiones en este rango.'
                : `${entries.length} comisiones. Comision: ${totalCommissionCLP.toLocaleString('es-CL', { style: 'currency', currency: 'CLP' })}`;

            setState({ entries, loading: false, error: null, summary, totals });
        } catch (err: any) {
            setState({
                entries: [],
                loading: false,
                error: err.message,
                summary: '',
                totals: {
                    count: 0,
                    totalSalesCLP: 0,
                    totalCommissionCLP: 0,
                    netAmountCLP: 0,
                    liquidCommissionCLP: 0,
                },
            });
        }
    }, [role, user]);

    return { ...state, search };
}
