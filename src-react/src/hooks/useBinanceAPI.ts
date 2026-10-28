import { useCallback, useState } from 'react';
import { getAuth } from 'firebase/auth';
import app from '../lib/firebase';

// El proxy de Cloud Functions conserva el secreto del VPS: el cliente nunca lo recibe.
const VPS_BASE_URL = import.meta.env.VITE_VPS_BINANCE_URL || 'https://us-central1-manzanoapp-2f775.cloudfunctions.net/binanceVpsProxy';

async function authenticatedHeaders(contentType = false): Promise<HeadersInit> {
    const token = await getAuth(app).currentUser?.getIdToken();
    if (!token) throw new Error('Debes iniciar sesión para consultar Binance.');
    return {
        ...(contentType ? { 'Content-Type': 'application/json' } : {}),
        Authorization: `Bearer ${token}`,
    };
}

export interface BinanceBalance {
    asset: string;
    free: string;
    locked: string;
    freeze?: string;
    withdrawing?: string;
    source: string;
    updatedAt: string;
}

export interface P2PRateData {
    fiat: string;
    asset: string;
    tradeType: string;
    requestedAmount: number | null;
    bestRate: number;
    topAds: Array<{
        price: number;
        advertiser: string;
        min: string;
        max: string;
    }>;
    source: string;
    updatedAt: string;
}

export interface BinanceP2PTradeMethod {
    tradeMethodName?: string;
    identifier?: string;
}

export interface BinanceP2PAdvert {
    adv?: {
        price?: string;
        minSingleTransAmount?: string;
        dynamicMaxSingleTransAmount?: string;
        maxSingleTransAmount?: string;
        tradeMethods?: BinanceP2PTradeMethod[];
    };
    advertiser?: {
        nickName?: string;
    };
}

interface FetchP2POffersOptions {
    fiat?: string;
    asset?: string;
    tradeType?: string;
    rows?: number;
    payTypes?: string[];
    amount?: number;
    throwOnError?: boolean;
}

export interface VesSellReferenceRate {
    rate: number;
    source: string;
    updatedAt: string;
    targetAmount: number;
    selectedIndex: number;
    rowsUsed: number;
    advertiserNickName: string;
}

const toNumber = (value: unknown): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const canCoverTargetAmount = (row: BinanceP2PAdvert, targetAmount: number) => {
    const min = toNumber(row?.adv?.minSingleTransAmount);
    const max = toNumber(row?.adv?.dynamicMaxSingleTransAmount || row?.adv?.maxSingleTransAmount);
    if (targetAmount <= 0) return true;
    if (min > 0 && targetAmount < min) return false;
    if (max > 0 && targetAmount > max) return false;
    return true;
};

const extractErrorDetail = async (response: Response): Promise<string> => {
    try {
        const body = await response.json();
        if (body?.details) return String(body.details);
        if (body?.error) return String(body.error);
        return '';
    } catch {
        return '';
    }
};

export function useBinanceAPI() {
    const [loadingBalance, setLoadingBalance] = useState(false);
    const [loadingP2P, setLoadingP2P] = useState(false);
    const [balance, setBalance] = useState<BinanceBalance | null>(null);
    const [p2pRate, setP2pRate] = useState<P2PRateData | null>(null);
    const [error, setError] = useState<string | null>(null);

    const checkWalletBalance = useCallback(async (asset: string = 'USDT') => {
        setLoadingBalance(true);
        setError(null);
        try {
            const response = await fetch(`${VPS_BASE_URL}/balance?asset=${asset}`, {
                method: 'GET',
                headers: await authenticatedHeaders()
            });

            if (!response.ok) {
                throw new Error('Error al conectar con VPS de Binance (Balance)');
            }

            const data = await response.json();
            if (data.error) throw new Error(data.error);

            setBalance(data);
            return data;
        } catch (err: any) {
            setError(err.message);
            return null;
        } finally {
            setLoadingBalance(false);
        }
    }, []);

    const fetchP2PRate = useCallback(async (amount: number, fiat: string = 'VES', asset: string = 'USDT', tradeType: string = 'BUY') => {
        setLoadingP2P(true);
        setError(null);
        try {
            const response = await fetch(`${VPS_BASE_URL}/p2p-rate`, {
                method: 'POST',
                headers: await authenticatedHeaders(true),
                body: JSON.stringify({ amount, fiat, asset, tradeType })
            });

            if (!response.ok) {
                const detail = await extractErrorDetail(response);
                throw new Error(detail || `Error ${response.status} consultando el VPS de Binance.`);
            }

            const data = await response.json();
            if (data.error) throw new Error(String(data.error));

            setP2pRate(data);
            return data;
        } catch (err: any) {
            setError(err.message);
            return null;
        } finally {
            setLoadingP2P(false);
        }
    }, []);

    const fetchP2POffers = useCallback(async ({
        fiat = 'VES',
        asset = 'USDT',
        tradeType = 'BUY',
        rows = 20,
        payTypes = [],
        amount = 0,
        throwOnError = false,
    }: FetchP2POffersOptions = {}): Promise<BinanceP2PAdvert[]> => {
        setLoadingP2P(true);
        setError(null);
        try {
            const payload: Record<string, unknown> = {
                page: 1,
                rows,
                payTypes,
                countries: [],
                publisherType: null,
                asset,
                fiat,
                tradeType,
            };

            if (amount > 0) {
                payload.transAmount = String(amount);
            }

            const response = await fetch(`${VPS_BASE_URL}/api/proxy/p2p`, {
                method: 'POST',
                headers: await authenticatedHeaders(true),
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const detail = await extractErrorDetail(response);
                const message = detail || `Error ${response.status} consultando el VPS de Binance.`;
                setError(message);
                if (throwOnError) throw new Error(message);
                return [];
            }

            const data = await response.json();
            if (data?.error) {
                const message = String(data.error);
                setError(message);
                if (throwOnError) throw new Error(message);
                return [];
            }
            return Array.isArray(data?.data) ? data.data : [];
        } catch (err: any) {
            const message = err?.message || 'Error al consultar anuncios P2P directos en el VPS';
            setError(message);
            if (throwOnError) throw err;
            return [];
        } finally {
            setLoadingP2P(false);
        }
    }, []);

    const fetchVesBdvReferenceRate = useCallback(async (
        tradeType: 'BUY' | 'SELL',
        targetAmount: number = 50000,
        selectedIndex: number = 5,
    ): Promise<VesSellReferenceRate | null> => {
        const rows = await fetchP2POffers({
            fiat: 'VES',
            asset: 'USDT',
            tradeType,
            rows: 20,
            payTypes: ['BancoDeVenezuela'],
            amount: targetAmount,
            throwOnError: true,
        });

        const matchingRows = rows.filter((row) => canCoverTargetAmount(row, targetAmount));
        const targetIndex = selectedIndex - 1;
        const selected = matchingRows[targetIndex >= 0 && targetIndex < matchingRows.length ? targetIndex : 0];
        
        if (!selected) {
            return null;
        }
        
        const rate = toNumber(selected?.adv?.price);

        if (!(rate > 0)) {
            return null;
        }

        return {
            rate,
            source: `Binance P2P ${tradeType} BDV #${selectedIndex} (${targetAmount.toLocaleString('es-VE')} VES)`,
            updatedAt: new Date().toISOString(),
            targetAmount,
            selectedIndex,
            rowsUsed: matchingRows.length,
            advertiserNickName: selected?.advertiser?.nickName || 'Desconocido',
        };
    }, [fetchP2POffers]);

    // SELL book: sellers offering USDT. Used to price a wholesale USDT purchase.
    const fetchVesSellFifthBdvRate = useCallback(
        (targetAmount: number = 50000, selectedIndex: number = 5) =>
            fetchVesBdvReferenceRate('SELL', targetAmount, selectedIndex),
        [fetchVesBdvReferenceRate],
    );

    // BUY book: buyers of USDT. Used to position our own USDT sell advertisement.
    const fetchVesBuyFifthBdvRate = useCallback(
        (targetAmount: number = 50000, selectedIndex: number = 5) =>
            fetchVesBdvReferenceRate('BUY', targetAmount, selectedIndex),
        [fetchVesBdvReferenceRate],
    );

    return {
        balance,
        p2pRate,
        loadingBalance,
        loadingP2P,
        error,
        checkWalletBalance,
        fetchP2PRate,
        fetchP2POffers,
        fetchVesSellFifthBdvRate,
        fetchVesBuyFifthBdvRate,
    };
}
