/**
 * Preservation Tests — Tarea 2
 *
 * Verificar que los comportamientos NO afectados por el bug se preservan
 * antes y después del fix. Estos tests deben PASAR en ambos estados del código.
 *
 * Escenarios de preservación (¬isBugCondition):
 *   - seller, saldo > 0, cualquier hora → PERMITIDO
 *   - seller, saldo = 0, hora >= 17:00 → BLOQUEADO (bloqueo correcto)
 *   - admin, saldo = 0, cualquier hora → PERMITIDO (sin restricción de rol)
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { shouldRestrictOrdersByVesBalance, isOrderBalanceRestrictionActive } from '../lib/constants';
import * as fc from 'fast-check';

// ─── Fechas de referencia (julio 2024, Chile UTC-4) ──────────────────────────
// 18:00 hora Chile = 22:00 UTC
const CHILE_18_JULY_2024 = new Date('2024-07-15T22:00:00.000Z');
// 17:00 hora Chile = 21:00 UTC
const CHILE_17_JULY_2024 = new Date('2024-07-15T21:00:00.000Z');
// 10:00 hora Chile = 14:00 UTC
const CHILE_10_JULY_2024 = new Date('2024-07-15T14:00:00.000Z');

// ─── Estado mutable del mock de useAuth ──────────────────────────────────────
let mockRole: string = 'seller';
let mockUserId: string = 'test-uid';

vi.mock('../lib/firebase', () => ({
    db: {},
    default: {},
    auth: {},
    storage: {},
}));

vi.mock('firebase/firestore', () => ({
    collection: vi.fn(() => ({ id: 'mock-collection' })),
    doc: vi.fn(() => ({ id: 'mock-doc-id' })),
    setDoc: vi.fn(() => Promise.resolve()),
    serverTimestamp: vi.fn(() => ({ _type: 'serverTimestamp' })),
    getFirestore: vi.fn(),
}));

vi.mock('./useAuth', () => ({
    useAuth: () => ({
        user: {
            uid: mockUserId,
            email: `${mockRole}@test.com`,
            getIdTokenResult: async () => ({
                claims: mockRole === 'admin' ? { admin: true } : {},
            }),
        },
        role: mockRole,
    }),
}));

// Mock React useState para permitir llamar hooks fuera de componentes en tests
vi.mock('react', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react')>();
    return {
        ...actual,
        useState: (initialValue: any) => [initialValue, () => {}],
    };
});

// ─── Tests de shouldRestrictOrdersByVesBalance (funciones base) ───────────────
describe('shouldRestrictOrdersByVesBalance — Preservation', () => {
    it('devuelve true para seller a las 18:00 Chile (restricción activa)', () => {
        const result = shouldRestrictOrdersByVesBalance('seller', CHILE_18_JULY_2024);
        expect(result).toBe(true);
    });

    it('devuelve true para client a las 17:00 Chile (restricción activa)', () => {
        const result = shouldRestrictOrdersByVesBalance('client', CHILE_17_JULY_2024);
        expect(result).toBe(true);
    });

    it('devuelve false para admin a las 18:00 Chile (admin no tiene restricción)', () => {
        const result = shouldRestrictOrdersByVesBalance('admin', CHILE_18_JULY_2024);
        expect(result).toBe(false);
    });

    it('devuelve false para admin a las 10:00 Chile', () => {
        const result = shouldRestrictOrdersByVesBalance('admin', CHILE_10_JULY_2024);
        expect(result).toBe(false);
    });

    it('isOrderBalanceRestrictionActive devuelve true a las 18:00 Chile', () => {
        const result = isOrderBalanceRestrictionActive(CHILE_18_JULY_2024);
        expect(result).toBe(true);
    });

    it('isOrderBalanceRestrictionActive devuelve true a las 17:00 Chile exacto', () => {
        const result = isOrderBalanceRestrictionActive(CHILE_17_JULY_2024);
        expect(result).toBe(true);
    });

    it('isOrderBalanceRestrictionActive devuelve false a las 16:59 Chile', () => {
        const now1659 = new Date('2024-07-15T20:59:00.000Z');
        const result = isOrderBalanceRestrictionActive(now1659);
        expect(result).toBe(false);
    });
});

// ─── Property-Based Tests de Preservación ────────────────────────────────────
describe('PBT: Preservation — shouldRestrictOrdersByVesBalance', () => {
    /**
     * Validates: Requirements 3.1, 3.2, 3.3
     *
     * Preservation 1: seller/client con hora >= 17:00 → true (restricción activa)
     */
    it('Property 2a: para hora >= 17:00 Chile, seller/client siempre tiene restricción activa', () => {
        // Horas >= 17 en Chile (UTC-4): 17..23 → UTC: 21..27 (día siguiente para 24+)
        const horaChileArb = fc.integer({ min: 17, max: 23 });
        const roleArb = fc.constantFrom('seller', 'client');

        fc.assert(
            fc.property(roleArb, horaChileArb, (role, horaChile) => {
                const utcHour = horaChile + 4; // Chile UTC-4 en julio
                let isoDate: string;
                if (utcHour >= 24) {
                    isoDate = `2024-07-16T${String(utcHour - 24).padStart(2, '0')}:00:00.000Z`;
                } else {
                    isoDate = `2024-07-15T${String(utcHour).padStart(2, '0')}:00:00.000Z`;
                }
                const now = new Date(isoDate);

                const result = shouldRestrictOrdersByVesBalance(role, now);
                return result === true;
            }),
            { numRuns: 50 }
        );
    });

    /**
     * Validates: Requirements 3.3
     *
     * Preservation 2: admin nunca tiene restricción, sin importar la hora
     */
    it('Property 2b: admin NUNCA tiene restricción de saldo, en cualquier hora', () => {
        const horaChileArb = fc.integer({ min: 0, max: 23 });

        fc.assert(
            fc.property(horaChileArb, (horaChile) => {
                const utcHour = horaChile + 4;
                let isoDate: string;
                if (utcHour >= 24) {
                    isoDate = `2024-07-16T${String(utcHour - 24).padStart(2, '0')}:00:00.000Z`;
                } else {
                    isoDate = `2024-07-15T${String(utcHour).padStart(2, '0')}:00:00.000Z`;
                }
                const now = new Date(isoDate);

                const result = shouldRestrictOrdersByVesBalance('admin', now);
                return result === false;
            }),
            { numRuns: 50 }
        );
    });

    /**
     * Validates: Requirements 3.1, 3.2
     *
     * Preservation 3: rol null/undefined nunca tiene restricción
     */
    it('Property 2c: rol null/undefined NUNCA tiene restricción de saldo', () => {
        const horaChileArb = fc.integer({ min: 0, max: 23 });
        const roleArb = fc.constantFrom(null, undefined);

        fc.assert(
            fc.property(roleArb, horaChileArb, (role, horaChile) => {
                const utcHour = horaChile + 4;
                let isoDate: string;
                if (utcHour >= 24) {
                    isoDate = `2024-07-16T${String(utcHour - 24).padStart(2, '0')}:00:00.000Z`;
                } else {
                    isoDate = `2024-07-15T${String(utcHour).padStart(2, '0')}:00:00.000Z`;
                }
                const now = new Date(isoDate);

                const result = shouldRestrictOrdersByVesBalance(role, now);
                return result === false;
            }),
            { numRuns: 50 }
        );
    });
});

// ─── Helpers ─────────────────────────────────────────────────────────────────
const defaultFormData = {
    type: 'pago-movil' as const,
    clientName: 'Test Client',
    cedula: '12345678',
    email: 'client@test.com',
    clpAmount: 10000,
    bank: 'Mercantil',
    phone: '04141234567',
};

// ─── Tests de createOrder: seller, saldo=0, hora>=17:00 ─────────────────────
describe('createOrder — Preservation: seller saldo=0, hora>=17:00 DEBE lanzar error', () => {
    beforeEach(() => {
        mockRole = 'seller';
        mockUserId = 'seller-uid';
        vi.useFakeTimers();
        vi.setSystemTime(CHILE_18_JULY_2024);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.clearAllMocks();
    });

    it('seller con saldo=0 a las 18:00 Chile DEBE lanzar "Saldo VES insuficiente"', async () => {
        /**
         * Preservation req 3.4: saldo <= 0 con hora >= 17:00 → BLOQUEADO
         */
        const { useCreateOrder } = await import('./useCreateOrder');
        const hook = useCreateOrder();
        const rates = { VES: 100, USD: 1, EUR: 1.1, COP: 0, PEN: 0, ARS: 0, purchaseRateVES: 0, totalClpBalance: 0, isTakingOrders: true };

        await expect(
            hook.createOrder(defaultFormData, rates, 0)
        ).rejects.toThrow(/Saldo VES insuficiente/);
    });
});

// ─── Tests de createOrder: seller, saldo=500, monto=300, hora>=17:00 ─────────
describe('createOrder — Preservation: seller saldo>monto, hora>=17:00 NO debe bloquear', () => {
    beforeEach(() => {
        mockRole = 'seller';
        mockUserId = 'seller-uid';
        vi.useFakeTimers();
        vi.setSystemTime(CHILE_18_JULY_2024);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.clearAllMocks();
    });

    it('seller con saldo=500 VES y pedido de 3 CLP (300 VES) a las 18:00 NO debe lanzar error', async () => {
        /**
         * Preservation req 3.2: saldo positivo >= monto, hora >= 17:00 → PERMITIDO
         * monto: 3 CLP * 100 VES/CLP = 300 VES < 500 saldo → debe pasar
         */
        const { useCreateOrder } = await import('./useCreateOrder');
        const hook = useCreateOrder();
        const rates = { VES: 100, USD: 1, EUR: 1.1, COP: 0, PEN: 0, ARS: 0, purchaseRateVES: 0, totalClpBalance: 0, isTakingOrders: true };

        await expect(
            hook.createOrder(
                { ...defaultFormData, clpAmount: 3 },
                rates,
                500  // 500 VES disponibles > 300 VES del pedido
            )
        ).resolves.toBeDefined();
    });
});

// ─── Tests de createOrder: admin, saldo=0, hora>=17:00 ───────────────────────
describe('createOrder — Preservation: admin saldo=0, hora>=17:00 NO debe lanzar error', () => {
    beforeEach(() => {
        mockRole = 'admin';
        mockUserId = 'admin-uid';
        vi.useFakeTimers();
        vi.setSystemTime(CHILE_18_JULY_2024);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.clearAllMocks();
    });

    it('admin con saldo=0 a las 18:00 Chile NO lanza "Saldo VES insuficiente"', async () => {
        /**
         * Preservation req 3.3: admin nunca tiene restricción de saldo
         */
        const { useCreateOrder } = await import('./useCreateOrder');
        const hook = useCreateOrder();
        const rates = { VES: 100, USD: 1, EUR: 1.1, COP: 0, PEN: 0, ARS: 0, purchaseRateVES: 0, totalClpBalance: 0, isTakingOrders: true };

        await expect(
            hook.createOrder(defaultFormData, rates, 0)
        ).resolves.toBeDefined();
    });
});
