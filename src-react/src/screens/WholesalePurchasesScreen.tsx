import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '../components/ui';
import { useNavigation } from '../contexts/NavigationContext';
import { useAuth } from '../hooks';
import { useBinanceAPI } from '../hooks/useBinanceAPI';
import { useExchangeRates } from '../hooks/useExchangeRates';
import { useWholesalePurchases } from '../hooks/useWholesalePurchases';

interface Props {
    onBack?: () => void;
}

const QUICK_RANGES = [
    { label: 'Hoy', days: 0 },
    { label: 'Ayer', days: 1 },
    { label: '7 días', days: 7 },
    { label: '30 días', days: 30 },
];
const formatDateInputLocal = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

const parseDateInputLocal = (value: string) => {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d);
};

const toNumber = (value: unknown): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const fetchJson = async <T = any>(url: string): Promise<T> => {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Error ${response.status} consultando ${url}`);
    }
    return response.json() as Promise<T>;
};

const pickCryptoYaAsk = (payload: Record<string, any>, fiat: string): number => {
    const candidates = Object.values(payload || {})
        .map((quote: any) => {
            const bid = toNumber(quote?.bid);
            const ask = toNumber(quote?.ask);
            const time = toNumber(quote?.time || 0);
            return { bid, ask, time };
        })
        .filter((item) => item.bid > 0 && item.ask > 0);

    if (candidates.length === 0) {
        throw new Error(`CriptoYa USDT/${fiat} sin mercados válidos.`);
    }

    const validSpread = candidates.filter((item) => item.ask >= item.bid);
    const selected = (validSpread.length > 0 ? validSpread : candidates)
        .sort((a, b) => {
            const spreadA = (a.ask - a.bid) / a.bid;
            const spreadB = (b.ask - b.bid) / b.bid;
            if (spreadA !== spreadB) return spreadA - spreadB;
            return b.time - a.time;
        })[0];

    return selected.ask;
};

const getSourceLabel = (source: string): string => {
    const normalized = source.trim().toLowerCase();
    if (!normalized) return 'Fallback';
    if (normalized.includes('manual')) return 'Manual';
    if (normalized.includes('binance')) return 'Binance';
    if (normalized.includes('criptoya') || normalized.includes('crypto ya')) return 'CryptoYa';
    return 'Fallback';
};


const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;
const round4 = (value: number): number => Math.round((value + Number.EPSILON) * 10_000) / 10_000;
const round6 = (value: number): number => Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;

export function WholesalePurchasesScreen({ onBack }: Props = {}) {
    const { user } = useAuth();
    const { goHome, navigate, params } = useNavigation();
    const handleBack = onBack || goHome;
    const { rates } = useExchangeRates();
    const { fetchP2PRate, fetchVesSellFifthBdvRate } = useBinanceAPI();

    const {
        entries,
        latestPurchase,
        loading,
        saving,
        error,
        hasSearched,
        search,
        createPurchase,
        loadLatest,
        updatePurchaseStatus,
    } = useWholesalePurchases();

    const isA1A2 = useMemo(() => {
        const email = user?.email?.toLowerCase();
        return email === 'enderjpinar@gmail.com' || email === 'namv2210@gmail.com';
    }, [user?.email]);

    const [vesAmountInput, setVesAmountInput] = useState('');
    const [rateInput, setRateInput] = useState('');
    const [vesToUsdtInput, setVesToUsdtInput] = useState('');
    const [usdtToClpRate, setUsdtToClpRate] = useState(0); // Para poder derivar USDT equivalente
    const [apiSource, setApiSource] = useState('Manual');

    const [quoteLoading, setQuoteLoading] = useState(false);
    const [quoteError, setQuoteError] = useState<string | null>(null);
    const [highlightedId, setHighlightedId] = useState<string | null>(null);

    const todayIso = formatDateInputLocal(new Date());
    const [startDate, setStartDate] = useState(todayIso);
    const [endDate, setEndDate] = useState(todayIso);

    const vesAmount = Number(vesAmountInput) || 0;
    const wholesaleRate = Number(String(rateInput).replace(/,/g, '.')) || 0;
    const currentAppRate = wholesaleRate > 0
        ? wholesaleRate
        : (rates.VES > 0 ? rates.VES : rates.purchaseRateVES);
    const suggestedAppRate = currentAppRate > 0 ? currentAppRate * 0.947 : 0;

    const clpAmountComputed = currentAppRate > 0 ? round2(vesAmount / currentAppRate) : 0;
    const vesToUsdtRateInput = Number(String(vesToUsdtInput).replace(/,/g, '.')) || 0;
    const usdtPerVesRate = vesToUsdtRateInput > 20
        ? 1 / vesToUsdtRateInput
        : vesToUsdtRateInput;

    // USDT resultado: 
    // Ahora clpAmountComputed es = vesAmount / wholesaleRate 
    // Por tanto, los USDT equivalentes son (clpAmountComputed / usdtToClpRate) * 1.0095
    const usdtResult = useMemo(() => {
        if (clpAmountComputed <= 0 || usdtToClpRate <= 0) return 0;

        // El costo de compra del USDT incluye el fee del 1% (1.01)
        const effectiveUsdtCostClp = usdtToClpRate * 1.01;
        return round2(clpAmountComputed / effectiveUsdtCostClp);
    }, [clpAmountComputed, usdtToClpRate]);

    const usdtNeeded = usdtResult;

    useEffect(() => {
        const today = new Date();
        search(today, today);
        loadLatest();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loadLatest, search]);

    useEffect(() => {
        if (params?.purchaseId) {
            setHighlightedId(params.purchaseId);
            const fetchAndSearch = async () => {
                try {
                    const { doc, getDoc } = await import('firebase/firestore');
                    const { db } = await import('../lib/firebase');
                    const purchaseRef = doc(db, 'wholesale_purchases', params.purchaseId);
                    const purchaseSnap = await getDoc(purchaseRef);
                    if (purchaseSnap.exists()) {
                        const data = purchaseSnap.data();
                        const date = data.createdAt?.toDate ? data.createdAt.toDate() : new Date();
                        setStartDate(formatDateInputLocal(date));
                        setEndDate(formatDateInputLocal(date));
                        await search(date, date);
                    }
                } catch (e) {
                    console.error('Error fetching purchase by ID:', e);
                } finally {
                    navigate('wholesale-purchases', null);
                }
            };
            void fetchAndSearch();
        }
    }, [params, search, navigate]);

    useEffect(() => {
        if (highlightedId) {
            const timer = setTimeout(() => setHighlightedId(null), 4000);
            return () => clearTimeout(timer);
        }
    }, [highlightedId]);

    useEffect(() => {
        if (!latestPurchase) return;
        if (vesToUsdtInput) return;
        if (latestPurchase.vesToUsdtRate > 0) {
            setVesToUsdtInput(round2(1 / latestPurchase.vesToUsdtRate).toString());
        }
    }, [latestPurchase, vesToUsdtInput]);

    const handleSearch = () => {
        if (!startDate || !endDate) return;
        search(parseDateInputLocal(startDate), parseDateInputLocal(endDate));
    };

    const handleQuickRange = (days: number) => {
        const end = new Date();
        const start = new Date();

        if (days === 1) {
            start.setDate(start.getDate() - 1);
            end.setDate(end.getDate() - 1);
        } else {
            start.setDate(start.getDate() - days);
        }

        setStartDate(formatDateInputLocal(start));
        setEndDate(formatDateInputLocal(end));
        search(start, end);
    };

    const handleFetchQuote = useCallback(async () => {
        setQuoteError(null);
        setQuoteLoading(true);

        try {
            const [clpMarkets, directVesReference] = await Promise.all([
                fetchJson<Record<string, any>>('https://criptoya.com/api/USDT/CLP/1'),
                fetchVesSellFifthBdvRate(50000),
            ]);

            const rawUsdtToClp = pickCryptoYaAsk(clpMarkets, 'CLP');
            const vesP2pFallback = directVesReference
                ? null
                : await fetchP2PRate(vesAmount || 0, 'VES', 'USDT', 'BUY');
            const rawUsdtToVes = toNumber(directVesReference?.rate ?? vesP2pFallback?.bestRate);

            if (rawUsdtToClp <= 0) {
                throw new Error('USDT->CLP no válido desde CriptoYa.');
            }
            if (rawUsdtToVes <= 0) {
                throw new Error('USDT->VES no válido desde Binance VPS.');
            }

            const marketRate = rawUsdtToVes / rawUsdtToClp;
            setRateInput(round4(marketRate / 1.01).toString());
            setVesToUsdtInput(round6(rawUsdtToVes).toString());
            setUsdtToClpRate(rawUsdtToClp);
            setApiSource(directVesReference?.source || 'Binance VPS fallback + CriptoYa');
        } catch (err: any) {
            setQuoteError(err?.message || 'No se pudo consultar la tasa mayorista.');
        } finally {
            setQuoteLoading(false);
        }
    }, [fetchP2PRate, fetchVesSellFifthBdvRate, vesAmount]);

    // Auto-fetch quote when amount changes (with debounce)
    useEffect(() => {
        const amount = parseFloat(vesAmountInput);
        if (isNaN(amount) || amount <= 0) return;

        const timer = setTimeout(() => {
            handleFetchQuote();
        }, 600);

        return () => clearTimeout(timer);
    }, [vesAmountInput, handleFetchQuote]);

    const handleRegisterPurchase = async () => {
        if (vesAmount <= 0) return;
        if (wholesaleRate <= 0) return;

        const success = await createPurchase({
            clpAmount: clpAmountComputed,
            wholesaleRateClpPerVes: wholesaleRate,
            vesAmountComputed: vesAmount,
            vesToUsdtRate: usdtPerVesRate,
            usdtNeeded,
            source: apiSource,
        });

        if (success) {
            setVesAmountInput('');
            setRateInput('');
            setVesToUsdtInput('');
            setApiSource('Manual');
            setQuoteError(null);
            const today = new Date();
            search(today, today);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50">
            <header className="bg-white border-b border-gray-100 sticky top-0 z-50">
                <div className="max-w-900 mx-auto px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button onClick={handleBack} className="text-gray-400 hover:text-gray-700 transition-colors text-sm font-semibold">
                            ← Volver
                        </button>
                        <h1 className="text-sm font-bold text-gray-800">Compras Mayorista</h1>
                    </div>
                </div>
            </header>

            <main className="max-w-900 mx-auto px-4 py-6 space-y-4">
                <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
                    <h2 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Registrar compra</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label className="exchange-label">Cantidad VES a comprar</label>
                            <input
                                type="number"
                                min="1"
                                value={vesAmountInput}
                                onChange={(e) => setVesAmountInput(e.target.value)}
                                className="exchange-input"
                                placeholder="Ej: 25000"
                            />
                        </div>
                        <div className="bg-emerald-50/50 border border-emerald-100/50 rounded-lg p-3 transition-colors">
                            <label className="exchange-label text-emerald-700 font-bold">Tasa mayorista CLP/VES</label>
                            <input
                                type="number"
                                min="0.000001"
                                step="0.0001"
                                value={rateInput}
                                onChange={(e) => {
                                    setRateInput(e.target.value);
                                    setApiSource('Manual');
                                }}
                                className="exchange-input font-bold text-emerald-900 border-emerald-200 focus:border-emerald-500 focus:ring-emerald-500 bg-white/70"
                                placeholder="Ej: 0.6062"
                            />
                            {quoteLoading && (
                                <p className="text-[10px] text-emerald-600 animate-pulse mt-1 flex items-center gap-1">
                                    <RefreshCw className="w-2.5 h-2.5 animate-spin" /> Actualizando tasa...
                                </p>
                            )}
                        </div>
                    </div>

                    {usdtResult > 0 && (
                        <div className="bg-violet-50 border border-violet-100 rounded-lg p-3">
                            <p className="text-[11px] text-violet-600 font-semibold">USDT equivalente</p>
                            <p className="text-sm font-bold text-violet-800">
                                {usdtResult.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT
                            </p>
                        </div>
                    )}

                    <p className="text-xs text-gray-500">
                        Fuente actual: <span className="font-semibold">{getSourceLabel(apiSource)}</span>
                    </p>
                    {latestPurchase?.wholesaleRateClpPerVes ? (
                        <p className="text-xs text-indigo-600">
                            Última tasa mayorista registrada: {latestPurchase.wholesaleRateClpPerVes.toFixed(4)} CLP/VES
                        </p>
                    ) : null}
                    {clpAmountComputed > 0 && (
                        <div className="space-y-1">
                            <p className="text-xs text-emerald-700 font-medium">
                                Tasa Manzano App sugerida: {suggestedAppRate.toLocaleString('es-CL', { minimumFractionDigits: 4, maximumFractionDigits: 4 })} CLP/VES
                            </p>
                            <p className="text-xs text-gray-500">
                            Referencia CLP para esta compra: {clpAmountComputed.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            {' '}· tasa app {currentAppRate.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                        </div>
                    )}

                    {quoteError && (
                        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-xs text-red-600">{quoteError}</div>
                    )}
                    {error && (
                        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-xs text-red-600">{error}</div>
                    )}

                    <Button
                        variant="primary"
                        fullWidth
                        onClick={handleRegisterPurchase}
                        isLoading={saving}
                        disabled={vesAmount <= 0 || wholesaleRate <= 0}
                    >
                        Confirmar y registrar compra mayorista
                    </Button>
                </div>

                <div className="flex gap-2 overflow-x-auto pb-1">
                    {QUICK_RANGES.map((r) => (
                        <button
                            key={r.label}
                            onClick={() => handleQuickRange(r.days)}
                            className="shrink-0 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-xs font-semibold text-gray-600 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600 transition-all"
                        >
                            {r.label}
                        </button>
                    ))}
                </div>

                <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="exchange-label">Desde</label>
                            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="exchange-input text-xs" />
                        </div>
                        <div>
                            <label className="exchange-label">Hasta</label>
                            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="exchange-input text-xs" />
                        </div>
                    </div>
                    <Button variant="secondary" fullWidth onClick={handleSearch} isLoading={loading} className="!text-xs">
                        Buscar registros
                    </Button>
                </div>

                {!loading && entries.length > 0 && (
                    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse min-w-[820px]">
                                <thead>
                                    <tr className="bg-gray-50 border-b border-gray-100 text-[10px] uppercase tracking-wider text-gray-500">
                                        <th className="px-4 py-3 font-semibold">ID</th>
                                        <th className="px-4 py-3 font-semibold w-36">Fecha y Hora</th>
                                        <th className="px-4 py-3 font-semibold text-right">Cantidad VES</th>
                                        <th className="px-4 py-3 font-semibold text-right">Tasa CLP/VES</th>
                                        <th className="px-4 py-3 font-semibold text-right">Cantidad USDT</th>
                                        <th className="px-4 py-3 font-semibold text-right w-32">Estado</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50 bg-white">
                                    {entries.map((entry) => {
                                        const date = entry.createdAt?.toDate ? entry.createdAt.toDate() : new Date();
                                        const isHighlighted = highlightedId === entry.id;
                                        return (
                                            <tr 
                                                key={entry.id} 
                                                className={`hover:bg-gray-50/50 transition-all duration-300 ${
                                                    isHighlighted ? 'bg-amber-50 border border-amber-300 ring-2 ring-amber-100 font-medium' : ''
                                                }`}
                                            >
                                                <td className="px-4 py-2.5 text-[11px] text-gray-500 font-mono whitespace-nowrap">
                                                    {entry.id.slice(0, 8)}
                                                </td>
                                                <td className="px-4 py-2.5 text-[11px] text-gray-500 whitespace-nowrap">
                                                    {date.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                                                    <span className="text-[10px] text-gray-400 ml-1.5">
                                                        {date.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-2.5 text-right font-medium text-[11px] text-emerald-700 tabular-nums">
                                                    {entry.vesAmountComputed.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </td>
                                                <td className="px-4 py-2.5 text-right font-medium text-[11px] text-blue-700 tabular-nums">
                                                    {entry.wholesaleRateClpPerVes.toLocaleString('es-CL', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
                                                </td>
                                                <td className="px-4 py-2.5 text-right font-medium text-[11px] text-violet-700 tabular-nums">
                                                    {entry.usdtNeeded.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </td>
                                                <td className="px-4 py-2.5 text-right">
                                                    {isA1A2 ? (
                                                        <div className="flex items-center gap-1.5 justify-end">
                                                            <span className={`w-2 h-2 rounded-full shrink-0 ${
                                                                entry.status === 'En proceso' ? 'bg-amber-500 animate-pulse' :
                                                                entry.status === 'Completada' ? 'bg-emerald-500' :
                                                                'bg-gray-400'
                                                            }`} />
                                                            <select
                                                                value={entry.status || 'Ingresada'}
                                                                onChange={(e) => updatePurchaseStatus(entry.id, e.target.value as any)}
                                                                disabled={saving}
                                                                className="text-[10px] bg-transparent border-none focus:ring-0 p-0 text-gray-600 font-semibold cursor-pointer outline-none w-20 text-right"
                                                            >
                                                                <option value="Ingresada">Ingresada</option>
                                                                <option value="En proceso">En proceso</option>
                                                                <option value="Completada">Completada</option>
                                                            </select>
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center gap-1.5 justify-end text-[10px] text-gray-600 font-semibold">
                                                            <span className={`w-2 h-2 rounded-full shrink-0 ${
                                                                entry.status === 'En proceso' ? 'bg-amber-500' :
                                                                entry.status === 'Completada' ? 'bg-emerald-500' :
                                                                'bg-gray-400'
                                                            }`} />
                                                            <span>{entry.status || 'Ingresada'}</span>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {!loading && entries.length === 0 && hasSearched && (
                    <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-2.5 text-xs text-blue-700 font-medium">
                        No hay compras mayorista en ese rango.
                    </div>
                )}
            </main>
        </div >
    );
}
