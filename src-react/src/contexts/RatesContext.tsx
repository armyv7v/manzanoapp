import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { ExchangeRates } from '../hooks/useExchangeRates';

const DEFAULT_RATES: ExchangeRates = {
    VES: 0,
    COP: 0,
    PEN: 0,
    ARS: 0,
    USD: 0,
    EUR: 0,
    purchaseRateVES: 0,
    totalClpBalance: 0,
    isTakingOrders: true,
    binanceAdReferenceIndex: 5,
    binanceBuyerIndex: 5,
};

interface RatesState {
    rates: ExchangeRates;
    loading: boolean;
    error: string | null;
}

interface RatesContextValue extends RatesState {
    convertFromClp: (clpAmount: number, currency: keyof Pick<ExchangeRates, 'VES' | 'COP' | 'PEN' | 'ARS' | 'USD' | 'EUR'>) => number;
}

const RatesContext = createContext<RatesContextValue | null>(null);

/**
 * Único listener de `config/rate` para toda la app: antes cada consumidor
 * (Dashboard, Sidebar, OrderForm, UpdateRateModal, CreateBatchModal) abría
 * su propio onSnapshot (5 lecturas en vivo por el mismo documento).
 */
export function RatesProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<RatesState>({ rates: DEFAULT_RATES, loading: true, error: null });

    useEffect(() => {
        const unsubscribe = onSnapshot(
            doc(db, 'config', 'rate'),
            (snapshot) => {
                if (!snapshot.exists()) {
                    setState({ rates: DEFAULT_RATES, loading: false, error: null });
                    return;
                }

                const rateData = snapshot.data();
                const firestoreValues = rateData.values || {};

                let rates: ExchangeRates;
                if (firestoreValues && typeof firestoreValues === 'object') {
                    rates = {
                        ...DEFAULT_RATES,
                        ...firestoreValues,
                        VES: firestoreValues.CLP_VES || firestoreValues.VES || DEFAULT_RATES.VES,
                        COP: firestoreValues.CLP_COP || firestoreValues.COP || DEFAULT_RATES.COP,
                        PEN: firestoreValues.CLP_PEN || firestoreValues.PEN || DEFAULT_RATES.PEN,
                    };
                } else if (rateData.value) {
                    rates = { ...DEFAULT_RATES, VES: rateData.value };
                } else {
                    rates = { ...DEFAULT_RATES };
                }

                rates.totalClpBalance = rateData.totalClpBalance || 0;
                rates.purchaseRateVES = rateData.purchaseRateVES || 0;
                rates.isTakingOrders = rateData.isTakingOrders !== false;
                rates.binanceAdReferenceIndex = typeof rateData.binanceAdReferenceIndex === 'number'
                    ? rateData.binanceAdReferenceIndex
                    : 5;
                rates.binanceBuyerIndex = typeof rateData.binanceBuyerIndex === 'number' ? rateData.binanceBuyerIndex : 5;

                setState({ rates, loading: false, error: null });
            },
            (error) => {
                console.error('Error al obtener la tasa de cambio:', error);
                setState({ rates: DEFAULT_RATES, loading: false, error: error.message });
            }
        );

        return unsubscribe;
    }, []);

    const convertFromClp = (clpAmount: number, currency: keyof Pick<ExchangeRates, 'VES' | 'COP' | 'PEN' | 'ARS' | 'USD' | 'EUR'>) => {
        const rate = state.rates[currency];
        if (!rate || rate === 0) return 0;
        return clpAmount * rate;
    };

    return (
        <RatesContext.Provider value={{ ...state, convertFromClp }}>
            {children}
        </RatesContext.Provider>
    );
}

export function useRatesContext(): RatesContextValue {
    const ctx = useContext(RatesContext);
    if (!ctx) throw new Error('useRatesContext debe usarse dentro de RatesProvider');
    return ctx;
}
