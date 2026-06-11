import { useCallback, useState } from 'react';
import {
    collection,
    query,
    where,
    orderBy,
    limit,
    getDocs,
    runTransaction,
    doc,
    serverTimestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './useAuth';

export interface WholesalePurchaseEntry {
    id: string;
    clpAmount: number;
    wholesaleRateClpPerVes: number;
    vesAmountComputed: number;
    vesToUsdtRate: number;
    usdtNeeded: number;
    source: string;
    createdBy: string;
    createdAt: any;
    status: 'Ingresada' | 'En proceso' | 'Completada';
}

interface WholesalePurchasesState {
    entries: WholesalePurchaseEntry[];
    latestPurchase: WholesalePurchaseEntry | null;
    loading: boolean;
    saving: boolean;
    error: string | null;
    hasSearched: boolean;
}

const toNumber = (value: unknown): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

export function useWholesalePurchases() {
    const { user } = useAuth();
    const [state, setState] = useState<WholesalePurchasesState>({
        entries: [],
        latestPurchase: null,
        loading: false,
        saving: false,
        error: null,
        hasSearched: false,
    });

    const loadLatest = useCallback(async () => {
        try {
            const q = query(
                collection(db, 'wholesale_purchases'),
                orderBy('createdAt', 'desc'),
                limit(1)
            );
            const snapshot = await getDocs(q);
            const first = snapshot.docs[0];
            const data = first?.data();

            const latestPurchase: WholesalePurchaseEntry | null = first ? {
                id: first.id,
                clpAmount: toNumber(data?.clpAmount),
                wholesaleRateClpPerVes: toNumber(data?.wholesaleRateClpPerVes),
                vesAmountComputed: toNumber(data?.vesAmountComputed),
                vesToUsdtRate: toNumber(data?.vesToUsdtRate),
                usdtNeeded: toNumber(data?.usdtNeeded),
                source: typeof data?.source === 'string' ? data.source : 'Manual',
                createdBy: typeof data?.createdBy === 'string' ? data.createdBy : 'ADMIN',
                createdAt: data?.createdAt || null,
                status: typeof data?.status === 'string' ? (data.status as any) : 'Ingresada',
            } : null;

            setState((prev) => ({ ...prev, latestPurchase }));
            return latestPurchase;
        } catch {
            return null;
        }
    }, []);

    const search = useCallback(async (startDate: Date, endDate: Date) => {
        setState((prev) => ({ ...prev, loading: true, error: null }));

        try {
            const qStart = new Date(startDate);
            qStart.setHours(0, 0, 0, 0);

            const qEnd = new Date(endDate);
            qEnd.setHours(23, 59, 59, 999);

            const q = query(
                collection(db, 'wholesale_purchases'),
                where('createdAt', '>=', qStart),
                where('createdAt', '<=', qEnd),
                orderBy('createdAt', 'desc')
            );

            const snapshot = await getDocs(q);
            const entries: WholesalePurchaseEntry[] = snapshot.docs.map((docSnap) => {
                const data = docSnap.data();
                return {
                    id: docSnap.id,
                    clpAmount: toNumber(data.clpAmount),
                    wholesaleRateClpPerVes: toNumber(data.wholesaleRateClpPerVes),
                    vesAmountComputed: toNumber(data.vesAmountComputed),
                    vesToUsdtRate: toNumber(data.vesToUsdtRate),
                    usdtNeeded: toNumber(data.usdtNeeded),
                    source: typeof data.source === 'string' ? data.source : 'Manual',
                    createdBy: typeof data.createdBy === 'string' ? data.createdBy : 'ADMIN',
                    createdAt: data.createdAt || null,
                    status: typeof data.status === 'string' ? (data.status as any) : 'Ingresada',
                };
            });

            setState((prev) => ({
                ...prev,
                entries,
                latestPurchase: entries[0] || prev.latestPurchase,
                loading: false,
                error: null,
                hasSearched: true,
            }));
        } catch (err: any) {
            setState((prev) => ({
                ...prev,
                entries: [],
                loading: false,
                error: err?.message || 'No se pudo consultar compras mayorista.',
                hasSearched: true,
            }));
        }
    }, []);

    const createPurchase = useCallback(async (payload: {
        clpAmount: number;
        wholesaleRateClpPerVes: number;
        vesAmountComputed: number;
        vesToUsdtRate: number;
        usdtNeeded: number;
        source: string;
    }) => {
        setState((prev) => ({ ...prev, saving: true, error: null }));

        try {
            if (!user?.email) throw new Error('Debes iniciar sesión como admin.');
            if (payload.clpAmount <= 0) throw new Error('Monto CLP inválido.');
            if (payload.wholesaleRateClpPerVes <= 0) throw new Error('Tasa mayorista inválida.');

            const now = serverTimestamp();
            await runTransaction(db, async (transaction) => {
                const purchaseRef = doc(collection(db, 'wholesale_purchases'));
                const rateRef = doc(db, 'config', 'rate');

                transaction.set(purchaseRef, {
                    clpAmount: payload.clpAmount,
                    wholesaleRateClpPerVes: payload.wholesaleRateClpPerVes,
                    vesAmountComputed: payload.vesAmountComputed,
                    vesToUsdtRate: payload.vesToUsdtRate,
                    usdtNeeded: payload.usdtNeeded,
                    source: payload.source,
                    createdBy: user.email,
                    createdAt: now,
                    status: 'Ingresada',
                });

                // Esta tasa queda como referencia por defecto para futuras cargas de saldo.
                transaction.set(rateRef, { purchaseRateVES: payload.wholesaleRateClpPerVes }, { merge: true });
            });

            setState((prev) => ({ ...prev, saving: false, error: null }));
            await loadLatest();
            return true;
        } catch (err: any) {
            setState((prev) => ({
                ...prev,
                saving: false,
                error: err?.message || 'No se pudo registrar la compra mayorista.',
            }));
            return false;
        }
    }, [loadLatest, user?.email]);

    const updatePurchaseStatus = useCallback(async (purchaseId: string, status: 'Ingresada' | 'En proceso' | 'Completada') => {
        setState((prev) => ({ ...prev, saving: true, error: null }));
        try {
            if (!user?.email) throw new Error('Debes iniciar sesión.');
            const adminEmails = ['enderjpinar@gmail.com', 'namv2210@gmail.com'];
            if (!adminEmails.includes(user.email.toLowerCase())) {
                throw new Error('Solo los administradores A1 y A2 pueden cambiar el estatus.');
            }

            const { doc, updateDoc } = await import('firebase/firestore');
            const purchaseRef = doc(db, 'wholesale_purchases', purchaseId);
            await updateDoc(purchaseRef, { status });

            setState((prev) => ({
                ...prev,
                saving: false,
                entries: prev.entries.map(e => e.id === purchaseId ? { ...e, status } : e),
                latestPurchase: prev.latestPurchase && prev.latestPurchase.id === purchaseId ? { ...prev.latestPurchase, status } : prev.latestPurchase,
                error: null
            }));
            return true;
        } catch (err: any) {
            setState((prev) => ({
                ...prev,
                saving: false,
                error: err?.message || 'No se pudo actualizar el estatus de la compra.',
            }));
            return false;
        }
    }, [user?.email]);

    return {
        ...state,
        search,
        loadLatest,
        createPurchase,
        updatePurchaseStatus,
    };
}
