import { useMemo, useState, useEffect } from 'react';
import { ArrowRightLeft, RefreshCw } from 'lucide-react';
import { useNavigation } from '../contexts/NavigationContext';
import { Button } from '../components/ui';
import { useFxCalculatorRates, type CalculatorPairKey } from '../hooks/useFxCalculatorRates';

type Direction = 'base_to_quote' | 'quote_to_base';

const PAIRS: Array<{ key: CalculatorPairKey; label: string; hint: string }> = [
    { key: 'CLP_VES', label: 'CLP / VES', hint: 'Tasa actual app + spread inverso 4%' },
    { key: 'CLP_COP', label: 'CLP / COP', hint: 'Tasa actual app + spread inverso 4%' },
    { key: 'CLP_PEN', label: 'CLP / PEN', hint: 'Tasa actual app + spread inverso 4%' },
    { key: 'COP_VES', label: 'COP / VES', hint: 'Cruce USDT COP/VES' },
    { key: 'USDT_VES', label: 'USDT / VES', hint: 'Binance P2P SELL BDV #5 (prioridad)' },
    { key: 'USD_VES_BCV', label: 'USD / VES (BCV)', hint: 'Referencia oficial BCV' },
];

const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

const getRateDecimals = (pairKey: CalculatorPairKey) =>
    pairKey.includes('PEN') ? 5 : 4;

const formatResultValue = (value: number) =>
    value.toLocaleString('es-CL', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });

const formatRateValue = (value: number, pairKey: CalculatorPairKey) => {
    const decimals = getRateDecimals(pairKey);
    return value.toLocaleString('es-CL', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    });
};

interface Props {
    onBack?: () => void;
}

export function FxCalculatorScreen({ onBack }: Props = {}) {
    const { goHome } = useNavigation();
    const handleBack = onBack || goHome;

    const [selectedPair, setSelectedPair] = useState<CalculatorPairKey>('CLP_VES');
    const [direction, setDirection] = useState<Direction>('base_to_quote');
    const [amount, setAmount] = useState('100000');
    const [debouncedAmount, setDebouncedAmount] = useState(100000);

    useEffect(() => {
        const handler = setTimeout(() => {
            const parsed = Number(amount) || 0;
            setDebouncedAmount(parsed);
        }, 800);
        return () => clearTimeout(handler);
    }, [amount]);

    const { quotes, loading, error, lastUpdatedAt, refresh } = useFxCalculatorRates(debouncedAmount);
    const quote = quotes[selectedPair];

    const activePairMeta = PAIRS.find((pair) => pair.key === selectedPair);
    const parsedAmount = Number(amount) || 0;

    const computed = useMemo(() => {
        if (!quote || parsedAmount <= 0) return 0;
        if (direction === 'base_to_quote') {
            return round2(parsedAmount * quote.bid);
        }
        return round2(parsedAmount / quote.ask);
    }, [quote, parsedAmount, direction]);

    const inputCurrency = !quote
        ? ''
        : direction === 'base_to_quote'
            ? quote.base
            : quote.quote;
    const outputCurrency = !quote
        ? ''
        : direction === 'base_to_quote'
            ? quote.quote
            : quote.base;

    const lastUpdateLabel = lastUpdatedAt
        ? new Date(lastUpdatedAt).toLocaleString('es-VE')
        : 'Sin actualizar';

    return (
        <div className="min-h-screen bg-gray-50">
            <header className="bg-white border-b border-gray-100 sticky top-0 z-50">
                <div className="max-w-900 mx-auto px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button onClick={handleBack} className="text-gray-400 hover:text-gray-700 transition-colors text-sm font-semibold">
                            ← Volver
                        </button>
                        <h1 className="text-sm font-bold text-gray-800">Calculadora FX</h1>
                    </div>
                    <button
                        onClick={refresh}
                        className="text-xs text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                        Actualizar
                    </button>
                </div>
            </header>

            <main className="max-w-900 mx-auto px-4 py-6 space-y-4">
                <div className="bg-white rounded-xl border border-gray-100 p-4">
                    <p className="text-[11px] uppercase tracking-wider text-gray-500 font-bold mb-2">Par</p>
                    <div className="grid grid-cols-2 gap-2">
                        {PAIRS.map((pair) => (
                            <button
                                key={pair.key}
                                onClick={() => setSelectedPair(pair.key)}
                                className={`text-left rounded-lg border px-3 py-2 transition-all ${selectedPair === pair.key
                                    ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-200'
                                    : 'border-gray-200 bg-white hover:bg-gray-50'
                                    }`}
                            >
                                <p className="text-xs font-bold text-gray-800">{pair.label}</p>
                                <p className="text-[10px] text-gray-500 mt-0.5">{pair.hint}</p>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <p className="text-[11px] uppercase tracking-wider text-gray-500 font-bold">Direccion</p>
                        <ArrowRightLeft className="w-4 h-4 text-gray-400" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <button
                            onClick={() => setDirection('base_to_quote')}
                            className={`rounded-lg border px-3 py-2 text-xs font-bold ${direction === 'base_to_quote' ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'}`}
                        >
                            {quote ? `${quote.base} → ${quote.quote}` : 'Base → Quote'}
                        </button>
                        <button
                            onClick={() => setDirection('quote_to_base')}
                            className={`rounded-lg border px-3 py-2 text-xs font-bold ${direction === 'quote_to_base' ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'}`}
                        >
                            {quote ? `${quote.quote} → ${quote.base}` : 'Quote → Base'}
                        </button>
                    </div>

                    <div>
                        <label className="exchange-label">Monto ({inputCurrency || '-'})</label>
                        <input
                            type="number"
                            min="0"
                            value={amount}
                            onChange={(event) => setAmount(event.target.value)}
                            className="exchange-input"
                            placeholder="0"
                        />
                    </div>

                    <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
                        <p className="text-[11px] uppercase tracking-wider text-blue-500 font-bold">Resultado</p>
                        <p className="text-2xl font-black text-blue-700 mt-1">
                            {computed > 0 ? formatResultValue(computed) : '0.00'} {outputCurrency}
                        </p>
                        {quote && direction === 'base_to_quote' && (
                            <p className="text-[11px] text-blue-600 mt-1">
                                Usa tasa compra: 1 {quote.base} = {formatRateValue(quote.bid, quote.key)} {quote.quote}
                            </p>
                        )}
                        {quote && direction === 'quote_to_base' && (
                            <p className="text-[11px] text-blue-600 mt-1">
                                Usa tasa venta: 1 {quote.base} = {formatRateValue(quote.ask, quote.key)} {quote.quote}
                            </p>
                        )}
                    </div>
                </div>

                {quote && (
                    <div className="bg-white rounded-xl border border-gray-100 p-4">
                        <p className="text-[11px] uppercase tracking-wider text-gray-500 font-bold mb-2">Spread</p>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2">
                                <p className="text-emerald-600 font-bold">Compra</p>
                                <p className="text-gray-800 font-semibold mt-0.5">
                                    1 {quote.base} = {formatRateValue(quote.bid, quote.key)} {quote.quote}
                                </p>
                            </div>
                            <div className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2">
                                <p className="text-amber-600 font-bold">Venta</p>
                                <p className="text-gray-800 font-semibold mt-0.5">
                                    1 {quote.base} = {formatRateValue(quote.ask, quote.key)} {quote.quote}
                                </p>
                            </div>
                        </div>
                        <p className="text-[11px] text-gray-500 mt-2">
                            Spread: {formatRateValue(quote.spreadAbs, quote.key)} {quote.quote} ({quote.spreadPct.toFixed(2)}%)
                        </p>
                        <p className="text-[11px] text-gray-400 mt-1">
                            Fuente: {quote.source}
                        </p>
                        <p className="text-[11px] text-gray-400 mt-1">
                            Par: {activePairMeta?.label} • Ultima actualizacion: {new Date(quote.updatedAt).toLocaleString('es-VE')}
                        </p>
                    </div>
                )}

                <div className="bg-gray-100 border border-gray-200 rounded-lg px-4 py-2.5 text-[11px] text-gray-600">
                    Actualizacion automatica cada 20 minutos. Ultima carga global: {lastUpdateLabel}
                </div>

                {loading && (
                    <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-2.5 text-xs text-blue-700">
                        Cargando/Calculando tasas P2P dinámicas...
                    </div>
                )}

                {error && (
                    <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-xs text-red-600">
                        {error}
                    </div>
                )}

                <Button variant="secondary" fullWidth onClick={handleBack}>
                    Volver al inicio
                </Button>
            </main>
        </div>
    );
}
