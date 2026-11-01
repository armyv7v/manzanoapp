import { useRatesContext } from '../contexts/RatesContext';

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

/**
 * Tasas en vivo de `config/rate` vía RatesContext: un solo onSnapshot
 * compartido por toda la app (antes uno por consumidor).
 * Mantiene la API original: { rates, loading, error, convertFromClp }.
 */
export function useExchangeRates() {
    return useRatesContext();
}
