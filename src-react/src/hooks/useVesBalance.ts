import { useState, useCallback } from 'react';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface VesBalanceEntry {
    id: string;
    amount: number;
    type: string;
    note: string;
    holder?: string;
    bank?: string;
    balanceAfter?: number;
    createdAt: any;
    timestamp: any;
}

interface VesBalanceState {
    entries: VesBalanceEntry[];
    loading: boolean;
    error: string | null;
    totals: {
        adds: number;
        subs: number;
        fees: number;
        count: number;
    };
    hasSearched: boolean;
}

/**
 * Hook para consultar el historial de movimientos VES.
 * Lee de la colección 'balance_history'.
 */
export function useVesBalance() {
    const [state, setState] = useState<VesBalanceState>({
        entries: [],
        loading: false,
        error: null,
        totals: { adds: 0, subs: 0, fees: 0, count: 0 },
        hasSearched: false,
    });

    const isCreditMovement = (type: string, note: string) => {
        const normalizedType = (type || '').toLowerCase().trim();
        const normalizedNote = (note || '').toLowerCase();

        if (normalizedType === 'add' || normalizedType.startsWith('reversal_')) return true;
        if (/reversion|retorno|devolucion|anulacion/.test(normalizedNote)) return true;
        return false;
    };

    const search = useCallback(async (startDate: Date, endDate: Date) => {
        setState(prev => ({ ...prev, loading: true, error: null }));

        try {
            const qStart = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), 0, 0, 0);
            const qEnd = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), 23, 59, 59, 999);

            const q = query(
                collection(db, 'balance_history'),
                where('timestamp', '>=', qStart),
                where('timestamp', '<=', qEnd),
                orderBy('timestamp', 'desc')
            );

            const snapshot = await getDocs(q);
            const entries: VesBalanceEntry[] = snapshot.docs.map(d => {
                const data = d.data();
                return {
                    id: d.id,
                    amount: data.amount || 0,
                    type: data.type || '',
                    note: data.note || '',
                    holder: data.holder,
                    bank: data.bank,
                    balanceAfter: data.balanceAfter,
                    createdAt: data.createdAt,
                    timestamp: data.timestamp,
                };
            });

            const adds = entries
                .filter(e => isCreditMovement(e.type, e.note))
                .reduce((s, e) => s + e.amount, 0);
            const subs = entries
                .filter(e => !isCreditMovement(e.type, e.note) && e.type !== 'fee')
                .reduce((s, e) => s + e.amount, 0);
            const fees = entries
                .filter(e => e.type === 'fee')
                .reduce((s, e) => s + e.amount, 0);

            setState({ entries, loading: false, error: null, totals: { adds, subs, fees, count: entries.length }, hasSearched: true });
        } catch (err: any) {
            setState({ entries: [], loading: false, error: err.message, totals: { adds: 0, subs: 0, fees: 0, count: 0 }, hasSearched: true });
        }
    }, []);

    return { ...state, search };
}
