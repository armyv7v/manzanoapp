/**
 * Preservation Tests — Tarea 2 (Horario Restricción)
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
 *
 * Propiedad (Property 2 — Preservation):
 *   Para todo X donde ¬isBugCondition(X), el comportamiento del sistema
 *   ANTES y DESPUÉS del fix debe ser idéntico.
 *
 *   Casos capturados:
 *     P1: saldo > 0, hora < 17:00 Chile → pedido permitido (req 3.1)
 *     P2: saldo > totalConComisiones, hora >= 17:00 Chile → pedido permitido (req 3.2)
 *     P3: role = 'admin', cualquier hora y saldo → sin restricción de saldo (req 3.3)
 *     P4: saldo <= 0, hora >= 17:00 Chile → pedido bloqueado (req 3.4)
 *
 * EXPECTED OUTCOME (código ya corregido):
 *   - Todos los tests PASAN — confirman el comportamiento correcto como regresión
 *
 * Zona horaria: Chile en julio es UTC-4.
 *   - 10:00 Chile = 14:00 UTC  (antes de 17:00 — restricción inactiva)
 *   - 17:00 Chile = 21:00 UTC  (límite — restricción activa)
 *   - 18:00 Chile = 22:00 UTC  (después de 17:00 — restricción activa)
 *   - 20:00 Chile = 00:00 UTC día siguiente (después de 17:00)
 *
 * Metodología: observation-first — los assertions reflejan el comportamiento
 * correcto del código (ya corregido) para los inputs ¬isBugCondition(X).
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fc from 'fast-check';

// ─── Mocks ────────────────────────────────────────────────────────────────────
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

vi.mock('react', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react')>();
    return {
        ...actual,
        useState: (initialValue: any) => [initialValue, () => {}],
    };
});

// ─── Mock dinámico de useAuth según rol ───────────────────────────────────────
const mockAuthState = { role: 'seller' as string };

vi.mock('./useAuth', () => ({
    useAuth: () => ({
        user: {
            uid: 'test-uid',
            email: 'test@test.com',
            getIdTokenResult: async () => ({ claims: {} }),
        },
        role: mockAuthState.role,
    }),
}));

// ─── Constantes de tiempo (Chile julio = UTC-4) ───────────────────────────────
// 10:00 Chile → 14:00 UTC (restricción INACTIVA: hora < 17)
const CHILE_10_00 = new Date('2024-07-15T14:00:00.000Z');
// 17:00 Chile → 21:00 UTC (límite — restricción ACTIVA)
const CHILE_17_00 = new Date('2024-07-15T21:00:00.000Z');
// 18:00 Chile → 22:00 UTC (restricción ACTIVA: hora >= 17)
const CHILE_18_00 = new Date('2024-07-15T22:00:00.000Z');
// 20:00 Chile → 00:00 UTC día siguiente (restricción ACTIVA)
const CHILE_20_00 = new Date('2024-07-16T00:00:00.000Z');

afterEach(() => {
    vi.useRealTimers();
    mockAuthState.role = 'seller';
});

// ─── Helpers ─────────────────────────────────────────────────────────────────
function makeRates(vesRate: number) {
    return {
        VES: vesRate,
        USD: 1, EUR: 1.1, COP: 0, PEN: 0, ARS: 0,
        purchaseRateVES: 0, totalClpBalance: 0, isTakingOrders: true,
    };
}

function makeFormData(clpAmount: number) {
    return {
        type: 'pago-movil' as const,
        clientName: 'Test Client',
        cedula: '12345678',
        email: 'client@test.com',
        clpAmount,
        bank: 'Mercantil',
        phone: '04141234567',
    };
}

/**
 * Calcula totalConComisiones igual que useCreateOrder:
 *   adminCommission = Math.ceil(D * 0.01 * 100) / 100
 *   tilloCommission = Math.ceil(D * 0.0015 * 100) / 100
 *   total = D + adminCommission + tilloCommission
 */
function computeTotalConComisiones(destinationAmount: number): number {
    const adminCommission = Math.ceil(destinationAmount * 0.01 * 100) / 100;
    const tilloCommission = Math.ceil(destinationAmount * 0.0015 * 100) / 100;
    return destinationAmount + adminCommission + tilloCommission;
}

// ═══════════════════════════════════════════════════════════════════════════════
// P1 — Saldo positivo, antes de 17:00 → permitido
// ═══════════════════════════════════════════════════════════════════════════════
describe('P1 — saldo > 0, hora < 17:00 Chile → pedido permitido', () => {
    /**
     * Validates: Requirements 3.1
     *
     * ¬isBugCondition: saldo > 0 (no cumple la condición X.saldo <= 0)
     * Antes de 17:00, el sistema no restringe por saldo.
     * Como el saldo es positivo, no hay bloqueo en ninguna hora.
     *
     * Caso concreto:
     *   role='seller', saldo=500, hora=10:00 Chile, monto=100 → permitido
     *
     * EXPECTED OUTCOME: PASA (confirma comportamiento correcto)
     */

    it('createOrder seller saldo=500 hora=10:00 Chile monto=100 → resuelve sin error de saldo', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(CHILE_10_00);
        mockAuthState.role = 'seller';

        const { useCreateOrder } = await import('./useCreateOrder');
        const hook = useCreateOrder();

        // clpAmount=100, tasaVES=1 → destinationAmount=100, totalConComisiones≈101.15
        // saldo=500 cubre totalConComisiones(101.15) → permitido
        await expect(
            hook.createOrder(makeFormData(100), makeRates(1), 500)
        ).resolves.toBeDefined();
    });

    it('PBT — para todo saldo > 0 y hora < 17:00: createOrder no lanza "Saldo VES insuficiente"', async () => {
        /**
         * Validates: Requirements 3.1
         *
         * Generamos inputs donde saldo > 0 con hora fijada en 10:00 Chile.
         * El saldo puede o no cubrir el monto del pedido, pero como la restricción
         * horaria está inactiva, el sistema no bloquea por saldo.
         *
         * NOTA: con saldo > 0 y hora < 17:00, shouldEnforceVesBalance = false
         * → nunca lanza "Saldo VES insuficiente" sin importar el monto.
         */
        vi.useFakeTimers();
        vi.setSystemTime(CHILE_10_00);

        const { useCreateOrder } = await import('./useCreateOrder');

        const roleArb = fc.constantFrom<'seller' | 'client'>('seller', 'client');
        // saldo estrictamente positivo
        const saldoArb = fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true });
        // clpAmount > 0, puede ser mayor que saldo
        const clpAmountArb = fc.integer({ min: 1, max: 10000 });

        await fc.assert(
            fc.asyncProperty(roleArb, saldoArb, clpAmountArb, async (role, saldo, clpAmount) => {
                mockAuthState.role = role;
                const hook = useCreateOrder();

                const result = await hook.createOrder(
                    makeFormData(clpAmount),
                    makeRates(1),
                    saldo
                ).catch((e: Error) => e);

                // No debe lanzar "Saldo VES insuficiente" (restricción horaria inactiva)
                if (result instanceof Error) {
                    expect(result.message).not.toMatch(/Saldo VES insuficiente/i);
                }
            }),
            { numRuns: 100 }
        );

        vi.useRealTimers();
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// P2 — Saldo positivo cubre el pedido, después de 17:00 → permitido
// ═══════════════════════════════════════════════════════════════════════════════
describe('P2 — saldo > totalConComisiones, hora >= 17:00 Chile → pedido permitido', () => {
    /**
     * Validates: Requirements 3.2
     *
     * ¬isBugCondition: saldo > 0 (no cumple X.saldo <= 0)
     * Después de 17:00, la restricción está activa PERO el saldo cubre el pedido.
     *
     * Caso concreto:
     *   role='seller', saldo=500, hora=18:00 Chile, monto=100 → permitido
     *   destinationAmount=100, totalConComisiones≈101.15, saldo=500 > 101.15 → permitido
     *
     * EXPECTED OUTCOME: PASA (confirma comportamiento correcto)
     */

    it('createOrder seller saldo=500 hora=18:00 Chile monto=100 → resuelve sin error de saldo', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(CHILE_18_00);
        mockAuthState.role = 'seller';

        const { useCreateOrder } = await import('./useCreateOrder');
        const hook = useCreateOrder();

        // clpAmount=100, tasaVES=1 → destinationAmount=100, totalConComisiones≈101.15
        // saldo=500 >> 101.15 → permitido aunque hora >= 17:00
        await expect(
            hook.createOrder(makeFormData(100), makeRates(1), 500)
        ).resolves.toBeDefined();
    });

    it('PBT — para todo saldo > totalConComisiones: createOrder no lanza error de saldo a ninguna hora', async () => {
        /**
         * Validates: Requirements 3.2
         *
         * Generamos inputs donde saldo > totalConComisiones a las 18:00 Chile
         * (restricción activa). El saldo cubre el pedido → permitido.
         *
         * Construcción: destinationAmount=D, saldo = totalConComisiones(D) + margen
         * → saldo > totalConComisiones → no bloquea
         */
        vi.useFakeTimers();
        vi.setSystemTime(CHILE_18_00);

        const { useCreateOrder } = await import('./useCreateOrder');

        const roleArb = fc.constantFrom<'seller' | 'client'>('seller', 'client');
        // destinationAmount D en [1, 500]
        const destArb = fc.integer({ min: 1, max: 500 });
        // margen positivo que asegura saldo > totalConComisiones
        const marginArb = fc.float({ min: Math.fround(0.01), max: Math.fround(100), noNaN: true });

        await fc.assert(
            fc.asyncProperty(roleArb, destArb, marginArb, async (role, D, margin) => {
                mockAuthState.role = role;
                const total = computeTotalConComisiones(D);
                // saldo = totalConComisiones + margen → saldo > totalConComisiones
                const saldo = Math.round((total + margin) * 100) / 100;

                const hook = useCreateOrder();
                const result = await hook.createOrder(
                    makeFormData(D),
                    makeRates(1),
                    saldo
                ).catch((e: Error) => e);

                // No debe lanzar "Saldo VES insuficiente" (saldo cubre el pedido)
                if (result instanceof Error) {
                    expect(result.message).not.toMatch(/Saldo VES insuficiente/i);
                }
            }),
            { numRuns: 100 }
        );

        vi.useRealTimers();
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// P3 — role=admin, cualquier hora y saldo → sin restricción de saldo
// ═══════════════════════════════════════════════════════════════════════════════
describe('P3 — role=admin, cualquier hora y saldo → sin restricción de saldo', () => {
    /**
     * Validates: Requirements 3.3
     *
     * Para role='admin', shouldEnforceVesBalance siempre es false
     * (la condición es role === 'seller' || role === 'client').
     * Admin nunca recibe error de saldo sin importar la hora ni el saldo.
     *
     * Caso concreto:
     *   role='admin', saldo=0, hora=18:00 Chile → permitido (sin error de saldo)
     *
     * EXPECTED OUTCOME: PASA (confirma comportamiento correcto)
     */

    it('createOrder admin saldo=0 hora=18:00 Chile → resuelve sin error de saldo', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(CHILE_18_00);
        mockAuthState.role = 'admin';

        const { useCreateOrder } = await import('./useCreateOrder');
        const hook = useCreateOrder();

        // saldo=0 en hora de restricción activa, pero role='admin' → no bloquea
        const result = await hook.createOrder(
            makeFormData(100),
            makeRates(1),
            0
        ).catch((e: Error) => e);

        if (result instanceof Error) {
            expect(result.message).not.toMatch(/Saldo VES insuficiente/i);
        }
    });

    it('PBT — para role=admin: nunca se lanza "Saldo VES insuficiente"', async () => {
        /**
         * Validates: Requirements 3.3
         *
         * Para role='admin', sin importar la hora, saldo, o monto,
         * el sistema no debe lanzar "Saldo VES insuficiente".
         *
         * Probamos con hora=18:00 Chile (restricción activa para seller/client)
         * para que sea el caso más exigente.
         */
        vi.useFakeTimers();
        vi.setSystemTime(CHILE_18_00);
        mockAuthState.role = 'admin';

        const { useCreateOrder } = await import('./useCreateOrder');

        // saldo puede ser cero, negativo o positivo
        const saldoArb = fc.oneof(
            fc.constant(0),
            fc.float({ min: Math.fround(-10000), max: Math.fround(-0.01), noNaN: true }),
            fc.float({ min: Math.fround(0.01), max: Math.fround(100), noNaN: true })
        );
        const clpAmountArb = fc.integer({ min: 1, max: 10000 });

        await fc.assert(
            fc.asyncProperty(saldoArb, clpAmountArb, async (saldo, clpAmount) => {
                const hook = useCreateOrder();
                const result = await hook.createOrder(
                    makeFormData(clpAmount),
                    makeRates(1),
                    saldo
                ).catch((e: Error) => e);

                // Admin nunca debe recibir error de saldo insuficiente
                if (result instanceof Error) {
                    expect(result.message).not.toMatch(/Saldo VES insuficiente/i);
                }
            }),
            { numRuns: 100 }
        );

        vi.useRealTimers();
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// P4 — Saldo <= 0, hora >= 17:00 → pedido bloqueado
// ═══════════════════════════════════════════════════════════════════════════════
describe('P4 — saldo <= 0, hora >= 17:00 Chile → pedido bloqueado', () => {
    /**
     * Validates: Requirements 3.4
     *
     * Este es el bloqueo CORRECTO que debe preservarse:
     *   - saldo <= 0 AND hora >= 17:00 → shouldEnforceVesBalance = true
     *   - totalConComisiones > saldo (que es 0 o negativo) → lanza error
     *
     * Casos concretos:
     *   role='seller', saldo=0, hora=17:00 Chile → bloqueado con "Saldo VES insuficiente"
     *   role='client', saldo=-50, hora=20:00 Chile → bloqueado con "Saldo VES insuficiente"
     *
     * EXPECTED OUTCOME: PASA (confirma que el bloqueo correcto se preserva)
     */

    it('createOrder seller saldo=0 hora=17:00 Chile (límite exacto) → lanza "Saldo VES insuficiente"', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(CHILE_17_00);
        mockAuthState.role = 'seller';

        const { useCreateOrder } = await import('./useCreateOrder');
        const hook = useCreateOrder();

        // saldo=0, hora=17:00 → restricción ACTIVA, totalConComisiones > 0 → bloquea
        await expect(
            hook.createOrder(makeFormData(100), makeRates(1), 0)
        ).rejects.toThrow(/Saldo VES insuficiente/i);
    });

    it('createOrder client saldo=-50 hora=20:00 Chile → lanza "Saldo VES insuficiente"', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(CHILE_20_00);
        mockAuthState.role = 'client';

        const { useCreateOrder } = await import('./useCreateOrder');
        const hook = useCreateOrder();

        // saldo=-50 (negativo), hora=20:00 → restricción activa → totalConComisiones > -50 → bloquea
        await expect(
            hook.createOrder(makeFormData(100), makeRates(1), -50)
        ).rejects.toThrow(/Saldo VES insuficiente/i);
    });

    it('PBT — para todo saldo <= 0 y hora >= 17:00: createOrder lanza "Saldo VES insuficiente"', async () => {
        /**
         * Validates: Requirements 3.4
         *
         * Generamos inputs donde:
         *   - saldo <= 0 (cero o negativo)
         *   - hora fijada en 18:00 Chile (restricción activa)
         *   - clpAmount > 0 (cualquier monto positivo)
         *   - role: 'seller' | 'client'
         *
         * El sistema DEBE bloquear en todos estos casos.
         * La propiedad confirma que el comportamiento correcto de bloqueo se preserva.
         */
        vi.useFakeTimers();
        vi.setSystemTime(CHILE_18_00);

        const { useCreateOrder } = await import('./useCreateOrder');

        const roleArb = fc.constantFrom<'seller' | 'client'>('seller', 'client');
        // saldo <= 0: incluye cero y valores negativos
        const saldoArb = fc.oneof(
            fc.constant(0),
            fc.float({ min: Math.fround(-10000), max: Math.fround(-0.01), noNaN: true })
        );
        // clpAmount > 0 (cualquier monto positivo genera totalConComisiones > 0 > saldo)
        const clpAmountArb = fc.integer({ min: 1, max: 10000 });

        await fc.assert(
            fc.asyncProperty(roleArb, saldoArb, clpAmountArb, async (role, saldo, clpAmount) => {
                mockAuthState.role = role;
                const hook = useCreateOrder();

                // DEBE lanzar error de saldo insuficiente
                await expect(
                    hook.createOrder(makeFormData(clpAmount), makeRates(1), saldo)
                ).rejects.toThrow(/Saldo VES insuficiente/i);
            }),
            { numRuns: 100 }
        );

        vi.useRealTimers();
    });
});
