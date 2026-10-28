import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface ExchangeRates {
    VES: number;
    COP: number;
    PEN: number;
    ARS: number;
    USD: number;
    EUR: number;
    purchaseRateVES: number;
    totalClpBalance: number;
    isTakingOrders: boolean;
    /** Posición en el libro BUY para fijar el precio del anuncio propio USDT/VES. */
    binanceAdReferenceIndex?: number;
    /** Posición en el libro SELL usada exclusivamente para la compra mayorista. */
    binanceBuyerIndex?: number;
}

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

interface ExchangeRateState {
    rates: ExchangeRates;
    loading: boolean;
    error: string | null;
}

/**
 * Hook que se suscribe en tiempo real al documento `config/rate` de Firestore.
 * Replica exactamente la lógica de app.js líneas 4229-4271.
 */
export function useExchangeRates() {
    const [state, setState] = useState<ExchangeRateState>({
        rates: DEFAULT_RATES,
        loading: true,
        error: null,
    });

    useEffect(() => {
        const rateRef = doc(db, 'config', 'rate');

        const unsubscribe = onSnapshot(
            rateRef,
            (snapshot) => {
                if (!snapshot.exists()) {
                    setState({ rates: DEFAULT_RATES, loading: false, error: null });
                    return;
                }

                const rateData = snapshot.data();
                const firestoreValues = rateData.values || {};

                // Combinar defaults con los valores de Firestore (mismo patrón que app.js)
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
                    // Fallback para la estructura antigua
                    rates = { ...DEFAULT_RATES, VES: rateData.value };
                } else {
                    rates = { ...DEFAULT_RATES };
                }

                // Campos adicionales del documento (fuera del mapa `values`)
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

    /**
     * Calcula el monto en la moneda de destino dado un monto en CLP.
     */
    const convertFromClp = (clpAmount: number, currency: keyof Pick<ExchangeRates, 'VES' | 'COP' | 'PEN' | 'ARS' | 'USD' | 'EUR'>) => {
        const rate = state.rates[currency];
        if (!rate || rate === 0) return 0;
        return clpAmount * rate;
    };

    return {
        ...state,
        convertFromClp,
    };
}
