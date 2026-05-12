import { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot, collection, limit, orderBy, query, Timestamp } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import app, { db } from '../lib/firebase';
import { useAuth } from './useAuth';
import { isSuperAdminEmail } from '../lib/constants';

export type BinanceP2PRuntimeState = {
    host: string;
    status: string;
    sessionState: string;
    transport: string;
    currentActionId: string;
    lastError: string;
    lastHeartbeatAt: Date | null;
    lastPreparedAt: Date | null;
    capabilities: Record<string, unknown>;
};

export type BinanceP2PAction = {
    id: string;
    actionType: string;
    status: string;
    processorHost: string;
    requestedByEmail: string;
    requestedAt: Date | null;
    startedAt: Date | null;
    completedAt: Date | null;
    cancelledAt: Date | null;
    errorMessage: string;
    resultSummary: string;
    payload: {
        amount?: string;
        amountMode?: 'fiat' | 'asset';
        advertiser?: string;
        rowIndex?: number;
    };
};

function toDate(value: unknown): Date | null {
    if (!value) return null;
    if (value instanceof Timestamp) return value.toDate();
    if (value instanceof Date) return value;
    return null;
}

const EMPTY_RUNTIME: BinanceP2PRuntimeState = {
    host: '',
    status: 'offline',
    sessionState: 'unknown',
    transport: 'chrome-cdp',
    currentActionId: '',
    lastError: '',
    lastHeartbeatAt: null,
    lastPreparedAt: null,
    capabilities: {},
};

export function useBinanceP2PAdmin() {
    const { user, role } = useAuth();
    const isEnabled = role === 'admin' && isSuperAdminEmail(user?.email);
    const [runtime, setRuntime] = useState<BinanceP2PRuntimeState>(EMPTY_RUNTIME);
    const [actions, setActions] = useState<BinanceP2PAction[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!isEnabled) {
            setRuntime(EMPTY_RUNTIME);
            setActions([]);
            setLoading(false);
            return;
        }

        const runtimeUnsubscribe = onSnapshot(doc(db, 'binance_p2p_runtime', 'session'), (snapshot) => {
            if (!snapshot.exists()) {
                setRuntime(EMPTY_RUNTIME);
                setLoading(false);
                return;
            }

            const raw = snapshot.data() as Record<string, any>;
            setRuntime({
                host: raw.host || '',
                status: raw.status || 'offline',
                sessionState: raw.sessionState || 'unknown',
                transport: raw.transport || 'chrome-cdp',
                currentActionId: raw.currentActionId || '',
                lastError: raw.lastError || '',
                lastHeartbeatAt: toDate(raw.lastHeartbeatAt),
                lastPreparedAt: toDate(raw.lastPreparedAt),
                capabilities: typeof raw.capabilities === 'object' && raw.capabilities ? raw.capabilities : {},
            });
            setLoading(false);
        }, () => setLoading(false));

        const actionsQuery = query(
            collection(db, 'binance_p2p_actions'),
            orderBy('requestedAt', 'desc'),
            limit(10),
        );

        const actionsUnsubscribe = onSnapshot(actionsQuery, (snapshot) => {
            const nextActions = snapshot.docs.map((item) => {
                const raw = item.data() as Record<string, any>;
                return {
                    id: item.id,
                    actionType: raw.actionType || '',
                    status: raw.status || '',
                    processorHost: raw.processorHost || '',
                    requestedByEmail: raw.requestedByEmail || '',
                    requestedAt: toDate(raw.requestedAt),
                    startedAt: toDate(raw.startedAt),
                    completedAt: toDate(raw.completedAt),
                    cancelledAt: toDate(raw.cancelledAt),
                    errorMessage: raw.errorMessage || '',
                    resultSummary: raw.resultSummary || '',
                    payload: {
                        amount: raw.payload?.amount || '',
                        amountMode: raw.payload?.amountMode === 'asset' ? 'asset' : 'fiat',
                        advertiser: raw.payload?.advertiser || '',
                        rowIndex: typeof raw.payload?.rowIndex === 'number' ? raw.payload.rowIndex : 0,
                    },
                } satisfies BinanceP2PAction;
            });
            setActions(nextActions);
            setLoading(false);
        }, () => setLoading(false));

        return () => {
            runtimeUnsubscribe();
            actionsUnsubscribe();
        };
    }, [isEnabled]);

    const activeAction = useMemo(() => actions.find((action) => action.status === 'pending' || action.status === 'running') || null, [actions]);

    const requestAction = async (input: {
        actionType: 'prepare_sell' | 'heartbeat';
        amount?: string;
        amountMode?: 'fiat' | 'asset';
        advertiser?: string;
        rowIndex?: number;
    }) => {
        setSubmitting(true);
        try {
            const functions = getFunctions(app);
            const callable = httpsCallable(functions, 'requestBinanceP2PAction');
            const result = await callable(input);
            return result.data as { success: boolean; actionId: string; status: string };
        } finally {
            setSubmitting(false);
        }
    };

    const cancelAction = async (actionId: string) => {
        setSubmitting(true);
        try {
            const functions = getFunctions(app);
            const callable = httpsCallable(functions, 'cancelBinanceP2PAction');
            const result = await callable({ actionId });
            return result.data as { success: boolean; actionId: string; status: string };
        } finally {
            setSubmitting(false);
        }
    };

    return {
        isEnabled,
        loading,
        submitting,
        runtime,
        actions,
        activeAction,
        requestAction,
        cancelAction,
    };
}
