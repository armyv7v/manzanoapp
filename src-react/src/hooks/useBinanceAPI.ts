import { useCallback, useState } from 'react';

// Se obtienen las URLs y Token de las variables de entorno de Vite
// Cambiado para usar el Cloud Function Proxy y evitar errores de Mixed Content (HTTPS -> HTTP)
const VPS_BASE_URL = import.meta.env.VITE_VPS_BINANCE_URL || 'https://us-central1-manzanoapp-2f775.cloudfunctions.net/binanceVpsProxy';
const VPS_AUTH_TOKEN = import.meta.env.VITE_VPS_BINANCE_TOKEN || 'un_token_largo_y_secreto_para_manzano';

export interface BinanceBalance {
    asset: string;
    free: string;
    locked: string;
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
}

export interface VesSellReferenceRate {
    rate: number;
    source: string;
    updatedAt: string;
    targetAmount: number;
    selectedIndex: number;
    rowsUsed: number;
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
                headers: {
                    'x-vps-token': VPS_AUTH_TOKEN
                }
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
                headers: {
                    'Content-Type': 'application/json',
                    'x-vps-token': VPS_AUTH_TOKEN
                },
                body: JSON.stringify({ amount, fiat, asset, tradeType })
            });

            if (!response.ok) {
                throw new Error('Error al consultar P2P en el VPS');
            }

            const data = await response.json();
            if (data.error) throw new Error(data.error);

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
                headers: {
                    'Content-Type': 'application/json',
                    'x-vps-token': VPS_AUTH_TOKEN
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error('Error al consultar anuncios P2P directos en el VPS');
            }

            const data = await response.json();
            if (data?.error) throw new Error(data.error);
            return Array.isArray(data?.data) ? data.data : [];
        } catch (err: any) {
            setError(err.message);
            return [];
        } finally {
            setLoadingP2P(false);
        }
    }, []);

    const fetchVesSellFifthBdvRate = useCallback(async (targetAmount: number = 50000): Promise<VesSellReferenceRate | null> => {
        const rows = await fetchP2POffers({
            fiat: 'VES',
            asset: 'USDT',
            tradeType: 'SELL',
            rows: 20,
            payTypes: ['BancoDeVenezuela'],
            amount: targetAmount,
        });

        const matchingRows = rows.filter((row) => canCoverTargetAmount(row, targetAmount));
        const selected = matchingRows[4];
        const rate = toNumber(selected?.adv?.price);

        if (!(rate > 0)) {
            return null;
        }

        return {
            rate,
            source: `Binance P2P SELL BDV #5 (${targetAmount.toLocaleString('es-VE')} VES)`,
            updatedAt: new Date().toISOString(),
            targetAmount,
            selectedIndex: 5,
            rowsUsed: matchingRows.length,
        };
    }, [fetchP2POffers]);

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
    };
}
