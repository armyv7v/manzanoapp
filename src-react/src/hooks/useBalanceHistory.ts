import { useState, useCallback } from 'react';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface BalanceEntry {
    id: string;
    amount: number;
    type: string;
    description: string;
    timestamp: any;
    orderId?: string;
    createdBy?: string;
    adminTag?: string;
    balanceAfter?: number;
    bank?: string;
    purchaseRateVESUsed?: number;
    vesAmountAtCalc?: number;
    clpAmountComputed?: number;
    isCredit: boolean;
    isDebit: boolean;
}

interface BalanceState {
    entries: BalanceEntry[];
    loading: boolean;
    error: string | null;
    totals: {
        in: number;
        out: number;
        count: number;
        net: number;
        openingBalance: number | null;
        closingBalance: number | null;
    };
    hasSearched: boolean;
}

const CREDIT_TYPES = new Set([
    'add', 'credit', 'deposit', 'ingreso', 'abono', 'reversal', 'refund',
]);

const DEBIT_TYPES = new Set([
    'subtract', 'debit', 'withdraw', 'egreso', 'cargo', 'payment', 'fee',
    'admin_commission', 'tillo_commission',
]);

const normalizeText = (value: string) =>
    (value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

const classifyMovement = (type: string, description: string, amount: number) => {
    const normalizedType = normalizeText(type).trim();
    const text = normalizeText(description);

    // Regla de negocio: pagos y comisiones son cargos aunque type este mal cargado.
    if (/pago pedido|pago lote|pago\b|comision|fee|cargo|egreso|retiro|envio de ves|mano tillo/.test(text)) {
        return { isCredit: false, isDebit: true };
    }

    // Regla de negocio: cargas/reversiones/depositos son abonos.
    if (/carga de saldo|abono|deposito|reversion|retorno|devolucion/.test(text)) {
        return { isCredit: true, isDebit: false };
    }

    if (DEBIT_TYPES.has(normalizedType)) return { isCredit: false, isDebit: true };
    if (CREDIT_TYPES.has(normalizedType)) return { isCredit: true, isDebit: false };

    if (amount < 0) return { isCredit: false, isDebit: true };
    if (amount > 0) return { isCredit: true, isDebit: false };
    return { isCredit: false, isDebit: false };
};

const toMillis = (value: any): number => {
    if (!value) return 0;
    if (typeof value?.toDate === 'function') return value.toDate().getTime();
    if (value instanceof Date) return value.getTime();
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Historial CLP con compatibilidad legacy + react.
 * Legacy: timestamp + note
 * React: createdAt + description
 */
export function useBalanceHistory() {
    const [state, setState] = useState<BalanceState>({
        entries: [],
        loading: false,
        error: null,
        totals: {
            in: 0,
            out: 0,
            count: 0,
            net: 0,
            openingBalance: null,
            closingBalance: null,
        },
        hasSearched: false,
    });

    const search = useCallback(async (startDate: Date, endDate: Date) => {
        setState((prev) => ({ ...prev, loading: true, error: null }));

        try {
            const qStart = new Date(startDate);
            qStart.setHours(0, 0, 0, 0);

            const qEnd = new Date(endDate);
            qEnd.setHours(23, 59, 59, 999);

            const byTimestamp = query(
                collection(db, 'clp_balance_history'),
                where('timestamp', '>=', qStart),
                where('timestamp', '<=', qEnd),
                orderBy('timestamp', 'desc')
            );

            const byCreatedAt = query(
                collection(db, 'clp_balance_history'),
                where('createdAt', '>=', qStart),
                where('createdAt', '<=', qEnd),
                orderBy('createdAt', 'desc')
            );

            const [timestampSnapshot, createdAtSnapshot] = await Promise.all([
                getDocs(byTimestamp),
                getDocs(byCreatedAt).catch(() => ({ docs: [] as any[] } as any)),
            ]);

            const merged = new Map<string, BalanceEntry>();
            const allDocs = [...timestampSnapshot.docs, ...(createdAtSnapshot.docs || [])];

            allDocs.forEach((docSnap: any) => {
                const data = docSnap.data();
                const amount = Number(data.amount || 0);
                const description = data.note || data.description || 'Sin descripcion';
                const movement = classifyMovement(data.type || '', description, amount);

                merged.set(docSnap.id, {
                    id: docSnap.id,
                    amount,
                    type: data.type || '',
                    description,
                    timestamp: data.timestamp || data.createdAt || null,
                    orderId: data.orderId,
                    createdBy: data.createdBy,
                    adminTag: data.adminTag,
                    balanceAfter: typeof data.balanceAfter === 'number' ? data.balanceAfter : undefined,
                    bank: data.bank,
                    purchaseRateVESUsed: typeof data.purchaseRateVESUsed === 'number' ? data.purchaseRateVESUsed : undefined,
                    vesAmountAtCalc: typeof data.vesAmountAtCalc === 'number' ? data.vesAmountAtCalc : undefined,
                    clpAmountComputed: typeof data.clpAmountComputed === 'number' ? data.clpAmountComputed : undefined,
                    isCredit: movement.isCredit,
                    isDebit: movement.isDebit,
                });
            });

            const entries = Array.from(merged.values()).sort((a, b) => toMillis(b.timestamp) - toMillis(a.timestamp));

            let totalIn = 0;
            let totalOut = 0;
            entries.forEach((entry) => {
                if (entry.isCredit) totalIn += Math.abs(entry.amount);
                if (entry.isDebit) totalOut += Math.abs(entry.amount);
            });

            const net = totalIn - totalOut;
            const closingEntry = entries.find((e) => typeof e.balanceAfter === 'number');
            const closingBalance = closingEntry?.balanceAfter ?? null;
            const openingBalance = closingBalance !== null ? closingBalance - net : null;

            setState({
                entries,
                loading: false,
                error: null,
                totals: {
                    in: totalIn,
                    out: totalOut,
                    count: entries.length,
                    net,
                    openingBalance,
                    closingBalance,
                },
                hasSearched: true,
            });
        } catch (err: any) {
            setState({
                entries: [],
                loading: false,
                error: err.message,
                totals: {
                    in: 0,
                    out: 0,
                    count: 0,
                    net: 0,
                    openingBalance: null,
                    closingBalance: null,
                },
                hasSearched: true,
            });
        }
    }, []);

    return { ...state, search };
}
