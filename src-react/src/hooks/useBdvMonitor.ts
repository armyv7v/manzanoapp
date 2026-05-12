import { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, limit, onSnapshot, orderBy, query, serverTimestamp, type Timestamp } from 'firebase/firestore';
import { getDownloadURL, ref } from 'firebase/storage';
import { db } from '../lib/firebase';
import { storage } from '../lib/firebase';
import { useAuth } from './useAuth';
import { useVesAccounts } from './useVesAccounts';

interface BankSyncRun {
    id: string;
    provider: string;
    mode: string;
    ownerLabel: string;
    command?: string;
    capturedAt?: string;
    createdAt?: Timestamp;
    status?: string;
    errorMessage?: string;
    summary?: {
        accountLabel?: string;
        availableBalanceBs?: number;
        balanceBreakdown?: {
            deferredBs?: number;
            blockedBs?: number;
            totalBs?: number;
        };
        monthLabel?: string;
    };
    movements?: Array<{
        date?: string;
        reference?: string;
        description?: string;
        amountBs?: number | null;
    }>;
    artifacts?: Array<{
        kind?: string;
        fileName?: string;
        relativePath?: string;
        storagePath?: string;
    }>;
    accounts?: Array<{
        description?: string;
        maskedAccount?: string;
        balanceVisible?: boolean;
        movementActionVisible?: boolean;
    }>;
}

interface BankSyncRequest {
    id: string;
    ownerLabel: string;
    status: string;
    requestedAt?: Timestamp;
    startedAt?: Timestamp;
    completedAt?: Timestamp;
    processorHost?: string;
    errorMessage?: string;
    bankSyncRunId?: string;
}

interface PayoutOrder {
    id: string;
    provider: string;
    sourceAccountId: string;
    payoutAccountId: string;
    amountBs: number;
    concept: string;
    status: string;
    createdAt?: Timestamp;
    completedAt?: Timestamp;
    reference?: string;
    beneficiaryAlias?: string;
    beneficiaryLast4?: string;
    errorMessage?: string;
}

function normalize(value: string) {
    return value.normalize('NFD').replace(/[^\w\s-]/g, '').toLowerCase();
}

export function useBdvMonitor() {
    const { user } = useAuth();
    const { accounts, loading: accountsLoading } = useVesAccounts();
    const [runs, setRuns] = useState<BankSyncRun[]>([]);
    const [requests, setRequests] = useState<BankSyncRequest[]>([]);
    const [payoutOrders, setPayoutOrders] = useState<PayoutOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [referenceNow] = useState(() => Date.now());
    const [requestingRetry, setRequestingRetry] = useState(false);
    const [creatingPayout, setCreatingPayout] = useState(false);
    const [artifactUrls, setArtifactUrls] = useState<Record<string, string>>({});

    useEffect(() => {
        const q = query(collection(db, 'bank_sync_runs'), orderBy('createdAt', 'desc'), limit(20));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data: BankSyncRun[] = snapshot.docs.map((doc) => {
                const raw = doc.data() as Omit<BankSyncRun, 'id'>;
                return {
                    id: doc.id,
                    provider: raw.provider || '',
                    mode: raw.mode || '',
                    ownerLabel: raw.ownerLabel || '',
                    command: raw.command || '',
                    capturedAt: raw.capturedAt,
                    createdAt: raw.createdAt,
                    status: raw.status || '',
                    errorMessage: raw.errorMessage || '',
                    summary: raw.summary || undefined,
                    movements: Array.isArray(raw.movements) ? raw.movements : [],
                    artifacts: Array.isArray(raw.artifacts) ? raw.artifacts : [],
                    accounts: Array.isArray(raw.accounts) ? raw.accounts : [],
                };
            });
            setRuns(data);
            setLoading(false);
        }, () => setLoading(false));

        return () => unsubscribe();
    }, []);

    useEffect(() => {
        const q = query(collection(db, 'payout_orders'), orderBy('createdAt', 'desc'), limit(20));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data: PayoutOrder[] = snapshot.docs.map((doc) => {
                const raw = doc.data() as Omit<PayoutOrder, 'id'>;
                return {
                    id: doc.id,
                    provider: raw.provider || '',
                    sourceAccountId: raw.sourceAccountId || '',
                    payoutAccountId: raw.payoutAccountId || '',
                    amountBs: raw.amountBs || 0,
                    concept: raw.concept || '',
                    status: raw.status || '',
                    createdAt: raw.createdAt,
                    completedAt: raw.completedAt,
                    reference: raw.reference || '',
                    beneficiaryAlias: raw.beneficiaryAlias || '',
                    beneficiaryLast4: raw.beneficiaryLast4 || '',
                    errorMessage: raw.errorMessage || '',
                };
            });
            setPayoutOrders(data);
            setLoading(false);
        }, () => setLoading(false));

        return () => unsubscribe();
    }, []);

    useEffect(() => {
        const q = query(collection(db, 'bank_sync_requests'), orderBy('requestedAt', 'desc'), limit(20));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data: BankSyncRequest[] = snapshot.docs.map((doc) => {
                const raw = doc.data() as Omit<BankSyncRequest, 'id'>;
                return {
                    id: doc.id,
                    ownerLabel: raw.ownerLabel || '',
                    status: raw.status || '',
                    requestedAt: raw.requestedAt,
                    startedAt: raw.startedAt,
                    completedAt: raw.completedAt,
                    processorHost: raw.processorHost || '',
                    errorMessage: raw.errorMessage || '',
                    bankSyncRunId: raw.bankSyncRunId || '',
                };
            });
            setRequests(data);
            setLoading(false);
        }, () => setLoading(false));

        return () => unsubscribe();
    }, []);

    const bdvRuns = useMemo(() => runs.filter((run) => normalize(run.provider).includes('bdv')), [runs]);
    const mercantilRuns = useMemo(() => runs.filter((run) => normalize(run.provider).includes('mercantil')), [runs]);
    const enderRun = useMemo(() => {
        const successfulRuns = bdvRuns.filter((run) => run.status === 'captured');
        const byOwner = successfulRuns.find((run) => normalize(run.ownerLabel).includes('ender'));
        return byOwner || successfulRuns[0] || null;
    }, [bdvRuns]);

    const lastFailure = useMemo(() => {
        const failedRuns = bdvRuns.filter((run) => run.status === 'failed');
        const byOwner = failedRuns.find((run) => normalize(run.ownerLabel).includes('ender'));
        return byOwner || failedRuns[0] || null;
    }, [bdvRuns]);

    const mercantilLatestSuccess = useMemo(() => {
        const successfulRuns = mercantilRuns.filter((run) => run.status === 'captured');
        return successfulRuns[0] || null;
    }, [mercantilRuns]);

    const mercantilLatestFailure = useMemo(() => {
        const failedRuns = mercantilRuns.filter((run) => run.status === 'failed');
        return failedRuns[0] || null;
    }, [mercantilRuns]);

    const latestMercantilPayout = useMemo(() => {
        const mercantilPayouts = payoutOrders.filter((order) => normalize(order.provider).includes('mercantil'));
        return mercantilPayouts[0] || null;
    }, [payoutOrders]);

    const mirroredAccounts = useMemo(() => accounts.filter((account) => {
        const holder = normalize(account.holder || '');
        const bank = normalize(account.bank || '');
        return holder.includes('ender') && (bank.includes('venezuela') || bank.includes('bdv'));
    }), [accounts]);

    const mirroredBalance = mirroredAccounts.reduce((sum, account) => sum + account.balance, 0);

    const lastSeenAt = useMemo(() => {
        if (!enderRun) return null;
        if (enderRun.capturedAt) {
            const date = new Date(enderRun.capturedAt);
            return Number.isNaN(date.getTime()) ? null : date;
        }
        if (enderRun.createdAt?.toDate) return enderRun.createdAt.toDate();
        return null;
    }, [enderRun]);

    const connectionState = useMemo<'ok' | 'stale' | 'down'>(() => {
        if (!lastSeenAt) return 'down';
        const diffMs = referenceNow - lastSeenAt.getTime();
        if (diffMs <= 1000 * 60 * 30) return 'ok';
        if (diffMs <= 1000 * 60 * 60 * 12) return 'stale';
        return 'down';
    }, [lastSeenAt, referenceNow]);

    const latestRun = bdvRuns[0] || null;
    const latestRequest = useMemo(() => {
        const bdvRequests = requests.filter((request) => normalize(request.ownerLabel || 'ender').includes('ender'));
        return bdvRequests[0] || null;
    }, [requests]);

    const activeRequest = useMemo(() => {
        if (!latestRequest) return null;
        return latestRequest.status === 'pending' || latestRequest.status === 'processing' ? latestRequest : null;
    }, [latestRequest]);

    const latestStatusLabel = latestRun?.status === 'captured'
        ? 'Último intento exitoso'
        : latestRun?.status === 'failed'
            ? 'Último intento fallido'
            : 'Sin actividad reciente';

    const requestStateLabel = activeRequest?.status === 'processing'
        ? 'Procesando solicitud'
        : activeRequest?.status === 'pending'
            ? 'Solicitud pendiente'
            : 'Sin solicitud activa';

    const requestRetry = async () => {
        if (!user) throw new Error('Necesitás sesión activa para solicitar reintento.');
        setRequestingRetry(true);
        try {
            await addDoc(collection(db, 'bank_sync_requests'), {
                provider: 'bdv',
                ownerLabel: 'Ender',
                requestedBy: user.uid,
                requestedByEmail: user.email || '',
                requestedAt: serverTimestamp(),
                status: 'pending',
                source: 'bdv-monitor-screen',
            });
        } finally {
            setRequestingRetry(false);
        }
    };

    const createMercantilPayoutOrder = async () => {
        if (!user) throw new Error('Necesitás sesión activa para crear un payout.');
        const sourceAccount = accounts.find((account) => normalize(account.bank).includes('mercantil') && account.accountType === 'source');
        const payoutAccount = accounts.find((account) => account.accountLast4 === '2823');
        if (!sourceAccount) throw new Error('No encontré la cuenta source Mercantil.');
        if (!payoutAccount) throw new Error('No encontré la cuenta pagadora de Emma.');

        setCreatingPayout(true);
        try {
            await addDoc(collection(db, 'payout_orders'), {
                provider: 'mercantil',
                sourceAccountId: sourceAccount.id,
                payoutAccountId: payoutAccount.id,
                amountBs: 0.01,
                concept: 'pago',
                beneficiaryAlias: payoutAccount.alias || payoutAccount.holder,
                beneficiaryLast4: payoutAccount.accountLast4 || '',
                status: 'pending',
                requestedBy: user.uid,
                requestedByEmail: user.email || '',
                createdAt: serverTimestamp(),
            });
        } finally {
            setCreatingPayout(false);
        }
    };

    useEffect(() => {
        const visibleArtifacts = (lastFailure?.artifacts?.length
            ? lastFailure.artifacts
            : enderRun?.artifacts?.length
                ? enderRun.artifacts
                : mercantilLatestSuccess?.artifacts) || [];
        const storageArtifacts = visibleArtifacts.filter((artifact: NonNullable<BankSyncRun['artifacts']>[number]) => artifact.storagePath);

        if (storageArtifacts.length === 0) {
            setArtifactUrls({});
            return;
        }

        let cancelled = false;

        Promise.all(storageArtifacts.map(async (artifact: NonNullable<BankSyncRun['artifacts']>[number]) => {
            try {
                const downloadUrl = await getDownloadURL(ref(storage, artifact.storagePath as string));
                return [artifact.storagePath as string, downloadUrl] as const;
            } catch {
                return [artifact.storagePath as string, ''] as const;
            }
        })).then((entries) => {
            if (cancelled) return;
            setArtifactUrls(Object.fromEntries(entries.filter(([, url]: readonly [string, string]) => url)));
        });

        return () => {
            cancelled = true;
        };
    }, [lastFailure, enderRun, mercantilLatestSuccess]);

    return {
        loading: loading || accountsLoading,
        latestRun,
        latestRequest,
        activeRequest,
        latestStatusLabel,
        requestStateLabel,
        lastRun: enderRun,
        lastFailure,
        mercantilLatestSuccess,
        mercantilLatestFailure,
        lastSeenAt,
        connectionState,
        mirroredAccounts,
        mirroredBalance,
        artifactUrls,
        requestingRetry,
        creatingPayout,
        requestRetry,
        latestMercantilPayout,
        createMercantilPayoutOrder,
    };
}
