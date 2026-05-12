import { useCallback, useEffect, useState } from 'react';
import { useExchangeRates } from './useExchangeRates';
import { useBinanceAPI } from './useBinanceAPI';

export type CalculatorPairKey =
    | 'CLP_VES'
    | 'CLP_COP'
    | 'CLP_PEN'
    | 'COP_VES'
    | 'USDT_VES'
    | 'USD_VES_BCV';

export interface PairQuote {
    key: CalculatorPairKey;
    base: string;
    quote: string;
    bid: number;
    ask: number;
    spreadAbs: number;
    spreadPct: number;
    source: string;
    updatedAt: string;
}

interface MarketQuote {
    bid: number;
    ask: number;
    source: string;
    updatedAt: string;
}

interface FxCalculatorState {
    quotes: Partial<Record<CalculatorPairKey, PairQuote>>;
    loading: boolean;
    error: string | null;
    lastUpdatedAt: string | null;
}


const CLP_VES_INVERSE_SPREAD = 0.04;
const roundTo = (value: number, decimals: number): number => {
    const factor = 10 ** decimals;
    return Math.round((value + Number.EPSILON) * factor) / factor;
};

const getPairRateDecimals = (pairKey: CalculatorPairKey): number =>
    pairKey.includes('PEN') ? 5 : 4;

const isPositive = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value > 0;

const withValidSpread = (bid: number, ask: number) => {
    if (!isPositive(bid) || !isPositive(ask)) return { bid: 0, ask: 0 };
    if (ask >= bid) return { bid, ask };
    // Some feeds can arrive crossed due to stale books. Collapse to midpoint.
    const mid = (bid + ask) / 2;
    return { bid: mid, ask: mid };
};

const buildPairQuote = (
    key: CalculatorPairKey,
    base: string,
    quote: string,
    bid: number,
    ask: number,
    source: string,
    updatedAt: string
): PairQuote => {
    const clean = withValidSpread(bid, ask);
    const rateDecimals = getPairRateDecimals(key);
    const roundedBid = roundTo(clean.bid, rateDecimals);
    const roundedAsk = roundTo(clean.ask, rateDecimals);
    const spreadAbs = roundTo(roundedAsk - roundedBid, rateDecimals);
    const spreadPct = roundedBid > 0 ? roundTo((spreadAbs / roundedBid) * 100, 2) : 0;
    return {
        key,
        base,
        quote,
        bid: roundedBid,
        ask: roundedAsk,
        spreadAbs,
        spreadPct,
        source,
        updatedAt,
    };
};

const fetchJson = async <T = any>(url: string): Promise<T> => {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Error ${response.status} consultando ${url}`);
    }
    return response.json() as Promise<T>;
};

const fetchUsdClpDolarApi = async (): Promise<MarketQuote> => {
    const payload = await fetchJson<any>('https://cl.dolarapi.com/v1/cotizaciones/usd');
    const bid = Number(payload?.compra);
    const ask = Number(payload?.venta);
    const updatedAt = String(payload?.fechaActualizacion || new Date().toISOString());
    if (!isPositive(bid) || !isPositive(ask)) {
        throw new Error('DolarAPI CL no retorno compra/venta validas.');
    }
    return {
        bid,
        ask,
        source: 'DolarAPI CL',
        updatedAt,
    };
};

const fetchUsdVesBcvDolarApi = async (): Promise<MarketQuote> => {
    const payload = await fetchJson<any>('https://ve.dolarapi.com/v1/dolares/oficial');
    const compra = Number(payload?.compra);
    const venta = Number(payload?.venta);
    const promedio = Number(payload?.promedio);
    const bid = isPositive(compra) ? compra : promedio;
    const ask = isPositive(venta) ? venta : promedio;
    const updatedAt = String(payload?.fechaActualizacion || new Date().toISOString());
    if (!isPositive(bid) || !isPositive(ask)) {
        throw new Error('DolarAPI VE (BCV) no retorno valores validos.');
    }
    return {
        bid,
        ask,
        source: 'DolarAPI VE (BCV)',
        updatedAt,
    };
};

const pickCryptoMarket = (payload: Record<string, any>, fiat: string): MarketQuote => {
    const candidates = Object.entries(payload || {}).map(([name, quote]) => {
        const bid = Number((quote as any)?.bid);
        const ask = Number((quote as any)?.ask);
        const time = Number((quote as any)?.time || 0);
        return { name, bid, ask, time };
    }).filter((item) => isPositive(item.bid) && isPositive(item.ask));

    if (candidates.length === 0) {
        throw new Error(`CriptoYa USDT/${fiat} sin mercados validos.`);
    }

    const validSpread = candidates.filter((item) => item.ask >= item.bid);
    const selected = (validSpread.length > 0 ? validSpread : candidates)
        .sort((a, b) => {
            const spreadA = (a.ask - a.bid) / a.bid;
            const spreadB = (b.ask - b.bid) / b.bid;
            if (spreadA !== spreadB) return spreadA - spreadB;
            return b.time - a.time;
        })[0];

    const normalized = withValidSpread(selected.bid, selected.ask);
    const updatedAt = selected.time > 0
        ? new Date(selected.time * 1000).toISOString()
        : new Date().toISOString();

    return {
        bid: normalized.bid,
        ask: normalized.ask,
        source: `CriptoYa ${selected.name}`,
        updatedAt,
    };
};

const fetchUsdtFiatCryptoYa = async (fiat: 'CLP' | 'COP' | 'PEN' | 'VES'): Promise<MarketQuote> => {
    const payload = await fetchJson<Record<string, any>>(`https://criptoya.com/api/USDT/${fiat}/1`);
    return pickCryptoMarket(payload, fiat);
};

const fetchUsdtFiatVps = async (fiat: string, amount: number, vpsFetchP2P: any): Promise<MarketQuote | null> => {
    try {
        const data = await vpsFetchP2P(amount || 0, fiat, 'USDT', 'BUY');
        if (!data || !data.bestRate) return null;
        return {
            bid: data.bestRate,
            ask: data.bestRate,
            source: 'Binance P2P VPS (Dinámico)',
            updatedAt: data.updatedAt
        };
    } catch {
        return null;
    }
};

const fetchUsdtVesSellFifthDirect = async (fetchVesSellFifthBdvRate: any): Promise<MarketQuote | null> => {
    try {
        const data = await fetchVesSellFifthBdvRate(50000);
        if (!data?.rate) return null;
        return {
            bid: data.rate,
            ask: data.rate,
            source: data.source,
            updatedAt: data.updatedAt || new Date().toISOString(),
        };
    } catch {
        return null;
    }
};

// Derive BASE/QUOTE using two REF/* books (e.g. USDT/CLP and USDT/COP).
const deriveFromRefBooks = (
    refToBase: MarketQuote,
    refToQuote: MarketQuote
): { bid: number; ask: number; updatedAt: string } => {
    const bid = (1 / refToBase.ask) * refToQuote.bid;
    const ask = refToQuote.ask / refToBase.bid;
    const updatedAt = [refToBase.updatedAt, refToQuote.updatedAt].sort().reverse()[0];
    return { bid, ask, updatedAt };
};

export function useFxCalculatorRates(debouncedAmount: number = 0) {
    const { rates } = useExchangeRates();
    const { fetchP2PRate, fetchVesSellFifthBdvRate } = useBinanceAPI();

    const [state, setState] = useState<FxCalculatorState>({
        quotes: {},
        loading: true,
        error: null,
        lastUpdatedAt: null,
    });

    const refresh = useCallback(async () => {
        setState((prev) => ({ ...prev, loading: true, error: null }));
        try {
            const [
                usdClp,
                usdVesBcv,
                usdtClp,
                usdtCop,
                usdtPen,
                usdtVesCryptoYa,
                usdtVesDirect,
            ] = await Promise.all([
                fetchUsdClpDolarApi(),
                fetchUsdVesBcvDolarApi(),
                fetchUsdtFiatCryptoYa('CLP'),
                fetchUsdtFiatCryptoYa('COP'),
                fetchUsdtFiatCryptoYa('PEN'),
                fetchUsdtFiatCryptoYa('VES'),
                fetchUsdtVesSellFifthDirect(fetchVesSellFifthBdvRate),
            ]);

            const usdtVesFallback = usdtVesDirect
                ? null
                : await fetchUsdtFiatVps('VES', debouncedAmount, fetchP2PRate);

            const usdtVes = usdtVesDirect || usdtVesFallback || usdtVesCryptoYa;

            const clpVesDerived = deriveFromRefBooks(usdClp, usdVesBcv);
            const clpCop = deriveFromRefBooks(usdtClp, usdtCop);
            const clpPen = deriveFromRefBooks(usdtClp, usdtPen);
            const copVes = deriveFromRefBooks(usdtCop, usdtVes);

            const appClpVesRate = rates.VES > 0
                ? rates.VES
                : rates.purchaseRateVES;
            const appClpCopRate = rates.COP;
            const appClpPenRate = rates.PEN;

            const clpVesBid = isPositive(appClpVesRate)
                ? appClpVesRate
                : clpVesDerived.bid;
            const clpVesAsk = isPositive(appClpVesRate)
                ? appClpVesRate * (1 + CLP_VES_INVERSE_SPREAD)
                : clpVesDerived.ask;
            const clpVesSource = isPositive(appClpVesRate)
                ? 'Tasa actual app (config/rate) + spread inverso 4%'
                : `${usdClp.source} + ${usdVesBcv.source}`;
            const clpVesUpdatedAt = isPositive(appClpVesRate)
                ? new Date().toISOString()
                : clpVesDerived.updatedAt;

            const clpCopBid = isPositive(appClpCopRate)
                ? appClpCopRate
                : clpCop.bid;
            const clpCopAsk = isPositive(appClpCopRate)
                ? appClpCopRate * (1 + CLP_VES_INVERSE_SPREAD)
                : clpCop.ask;
            const clpCopSource = isPositive(appClpCopRate)
                ? 'Tasa actual app (config/rate) + spread inverso 4%'
                : `${usdtClp.source} + ${usdtCop.source}`;
            const clpCopUpdatedAt = isPositive(appClpCopRate)
                ? new Date().toISOString()
                : clpCop.updatedAt;

            const clpPenBid = isPositive(appClpPenRate)
                ? appClpPenRate
                : clpPen.bid;
            const clpPenAsk = isPositive(appClpPenRate)
                ? appClpPenRate * (1 + CLP_VES_INVERSE_SPREAD)
                : clpPen.ask;
            const clpPenSource = isPositive(appClpPenRate)
                ? 'Tasa actual app (config/rate) + spread inverso 4%'
                : `${usdtClp.source} + ${usdtPen.source}`;
            const clpPenUpdatedAt = isPositive(appClpPenRate)
                ? new Date().toISOString()
                : clpPen.updatedAt;

            const usdtVesBid = usdtVes.bid;
            const usdtVesAsk = usdtVes.bid * (1 + CLP_VES_INVERSE_SPREAD);
            const usdtVesSource = `${usdtVes.source} + spread inverso 4%`;

            const quotes: Partial<Record<CalculatorPairKey, PairQuote>> = {
                CLP_VES: buildPairQuote(
                    'CLP_VES',
                    'CLP',
                    'VES',
                    clpVesBid,
                    clpVesAsk,
                    clpVesSource,
                    clpVesUpdatedAt
                ),
                CLP_COP: buildPairQuote(
                    'CLP_COP',
                    'CLP',
                    'COP',
                    clpCopBid,
                    clpCopAsk,
                    clpCopSource,
                    clpCopUpdatedAt
                ),
                CLP_PEN: buildPairQuote(
                    'CLP_PEN',
                    'CLP',
                    'PEN',
                    clpPenBid,
                    clpPenAsk,
                    clpPenSource,
                    clpPenUpdatedAt
                ),
                COP_VES: buildPairQuote(
                    'COP_VES',
                    'COP',
                    'VES',
                    copVes.bid,
                    copVes.ask,
                    `${usdtCop.source} + ${usdtVes.source}`,
                    copVes.updatedAt
                ),
                USDT_VES: buildPairQuote(
                    'USDT_VES',
                    'USDT',
                    'VES',
                    usdtVesBid,
                    usdtVesAsk,
                    usdtVesSource,
                    usdtVes.updatedAt
                ),
                USD_VES_BCV: buildPairQuote(
                    'USD_VES_BCV',
                    'USD',
                    'VES',
                    usdVesBcv.bid,
                    usdVesBcv.ask,
                    usdVesBcv.source,
                    usdVesBcv.updatedAt
                ),
            };

            setState({
                quotes,
                loading: false,
                error: null,
                lastUpdatedAt: new Date().toISOString(),
            });
        } catch (error: any) {
            setState((prev) => ({
                ...prev,
                loading: false,
                error: error?.message || 'No se pudieron cargar tasas de calculadora.',
            }));
        }
    }, [debouncedAmount, fetchP2PRate, fetchVesSellFifthBdvRate, rates.VES, rates.COP, rates.PEN, rates.purchaseRateVES]);

    useEffect(() => {
        refresh();
    }, [refresh, debouncedAmount]);

    return {
        ...state,
        refresh,
    };
}
