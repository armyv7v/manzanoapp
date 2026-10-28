/**
 * Bug Condition Exploration Tests — Tarea 1 (Horario Restricción)
 *
 * **Validates: Requirements 1.1, 1.2, 1.3**
 *
 * Propiedad (Property 1 — Bug Condition):
 *   isBugCondition(X) = (role = 'seller' OR role = 'client')
 *                        AND X.saldo <= 0
 *                        AND X.horaActual < 17:00 Chile
 *                        AND X.montoPedido > 0
 *
 *   Para todo X donde isBugCondition(X) es verdadero,
 *   createOrder NO debe lanzar error de "Saldo VES insuficiente".
 *
 * EXPECTED OUTCOME (código SIN corregir):
 *   - Los tests FALLAN → confirma que el bug existe
 *   - El sistema bloquea cuando NO debería (antes de las 17:00)
 *
 * Zona horaria: Chile en julio es UTC-4.
 *   - hora 10:00 Chile = 14:00 UTC
 *   - hora 16:59 Chile = 20:59 UTC
 *   - hora 08:00 Chile = 12:00 UTC
 *   - hora 17:00 Chile = 21:00 UTC (límite — restricción se activa)
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

// ─── Fechas de test (antes de las 17:00 Chile) ────────────────────────────────
// Chile en julio (DST apagado) = UTC-4
// 10:00 Chile → 14:00 UTC
const CHILE_10_00 = new Date('2024-07-15T14:00:00.000Z');
// 16:59 Chile → 20:59 UTC
const CHILE_16_59 = new Date('2024-07-15T20:59:00.000Z');
// 08:00 Chile → 12:00 UTC
const CHILE_08_00 = new Date('2024-07-15T12:00:00.000Z');
// 17:00 Chile → 21:00 UTC (límite — restricción ACTIVA)
const CHILE_17_00 = new Date('2024-07-15T21:00:00.000Z');

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

// ─── isBugCondition helper ────────────────────────────────────────────────────
function isBugCondition(role: string, saldo: number, clpAmount: number): boolean {
    return (
        (role === 'seller' || role === 'client') &&
        saldo <= 0 &&
        clpAmount > 0
        // La condición horaria (< 17:00) se controla con vi.setSystemTime en cada test
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Verificación: isOrderBalanceRestrictionActive con horas de test
// ═══════════════════════════════════════════════════════════════════════════════
describe('isOrderBalanceRestrictionActive — control de horas de prueba', () => {
    it('retorna false a las 10:00 Chile (14:00 UTC)', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(CHILE_10_00);
        const { isOrderBalanceRestrictionActive } = await import('../lib/constants');
        expect(isOrderBalanceRestrictionActive()).toBe(false);
    });

    it('retorna false a las 16:59 Chile (20:59 UTC)', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(CHILE_16_59);
        const { isOrderBalanceRestrictionActive } = await import('../lib/constants');
        expect(isOrderBalanceRestrictionActive()).toBe(false);
    });

    it('retorna false a las 08:00 Chile (12:00 UTC)', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(CHILE_08_00);
        const { isOrderBalanceRestrictionActive } = await import('../lib/constants');
        expect(isOrderBalanceRestrictionActive()).toBe(false);
    });

    it('retorna true a las 17:00 Chile (21:00 UTC) — límite de activación', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(CHILE_17_00);
        const { isOrderBalanceRestrictionActive } = await import('../lib/constants');
        expect(isOrderBalanceRestrictionActive()).toBe(true);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Test 1: seller, saldo=0, hora=10:00 Chile → NO debe lanzar error de saldo
// ═══════════════════════════════════════════════════════════════════════════════
describe('BUG CONDITION — Test 1: seller, saldo=0, hora=10:00 Chile', () => {
    /**
     * Validates: Requirements 1.1
     *
     * isBugCondition = true:
     *   role='seller', saldo=0 (<= 0), hora=10:00 Chile (< 17:00), clpAmount=100 (> 0)
     *
     * COMPORTAMIENTO ESPERADO (correcto): createOrder NO debe lanzar error de saldo
     * COMPORTAMIENTO ACTUAL (bug): createOrder lanza "Saldo VES insuficiente"
     *
     * EXPECTED OUTCOME del test: FALLA en código sin corregir → confirma que el bug existe
     */
    it('DEMUESTRA EL BUG: createOrder seller saldo=0 hora=10:00 NO debe lanzar error de saldo', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(CHILE_10_00);
        mockAuthState.role = 'seller';

        const { useCreateOrder } = await import('./useCreateOrder');
        const hook = useCreateOrder();

        // Verificar que isBugCondition es true para este input
        expect(isBugCondition('seller', 0, 100)).toBe(true);

        // clpAmount=100, tasaVES=1 → destinationAmount=100, totalConComisiones≈101.15
        // saldo=0 → en código BUGGY: shouldEnforceVesBalance=true (ignora hora) → lanza error
        // comportamiento CORRECTO: hora < 17:00 → shouldEnforceVesBalance=false → no lanza error
        await expect(
            hook.createOrder(makeFormData(100), makeRates(1), 0)
        ).resolves.toBeDefined();
        // ↑ FALLA en código sin corregir (lanza "Saldo VES insuficiente")
        // ↑ PASA después del fix
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Test 2: client, saldo=-50, hora=16:59 Chile → NO debe lanzar error de saldo
// ═══════════════════════════════════════════════════════════════════════════════
describe('BUG CONDITION — Test 2: client, saldo=-50, hora=16:59 Chile', () => {
    /**
     * Validates: Requirements 1.2
     *
     * isBugCondition = true:
     *   role='client', saldo=-50 (<= 0), hora=16:59 Chile (< 17:00), clpAmount=200 (> 0)
     *
     * EXPECTED OUTCOME del test: FALLA en código sin corregir → confirma que el bug existe
     */
    it('DEMUESTRA EL BUG: createOrder client saldo=-50 hora=16:59 NO debe lanzar error de saldo', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(CHILE_16_59);
        mockAuthState.role = 'client';

        const { useCreateOrder } = await import('./useCreateOrder');
        const hook = useCreateOrder();

        // Verificar que isBugCondition es true para este input
        expect(isBugCondition('client', -50, 200)).toBe(true);

        // clpAmount=200, tasaVES=1 → destinationAmount=200, totalConComisiones≈202.30
        // saldo=-50 → en código BUGGY: bloquea (saldo negativo es definitivamente insuficiente)
        // comportamiento CORRECTO: hora < 17:00 → no debe bloquear por saldo
        await expect(
            hook.createOrder(makeFormData(200), makeRates(1), -50)
        ).resolves.toBeDefined();
        // ↑ FALLA en código sin corregir
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Test 3: seller, saldo=0, hora=08:00 Chile → NO debe lanzar error de saldo
// ═══════════════════════════════════════════════════════════════════════════════
describe('BUG CONDITION — Test 3: seller, saldo=0, hora=08:00 Chile', () => {
    /**
     * Validates: Requirements 1.3
     *
     * isBugCondition = true:
     *   role='seller', saldo=0 (<= 0), hora=08:00 Chile (< 17:00), clpAmount=500 (> 0)
     *
     * EXPECTED OUTCOME del test: FALLA en código sin corregir → confirma que el bug existe
     */
    it('DEMUESTRA EL BUG: createOrder seller saldo=0 hora=08:00 NO debe lanzar error de saldo', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(CHILE_08_00);
        mockAuthState.role = 'seller';

        const { useCreateOrder } = await import('./useCreateOrder');
        const hook = useCreateOrder();

        // Verificar que isBugCondition es true
        expect(isBugCondition('seller', 0, 500)).toBe(true);

        // clpAmount=500, tasaVES=1 → destinationAmount=500
        // saldo=0 → código BUGGY bloquea; correcto sería permitir (hora < 17:00)
        await expect(
            hook.createOrder(makeFormData(500), makeRates(1), 0)
        ).resolves.toBeDefined();
        // ↑ FALLA en código sin corregir
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PBT: Para TODO input donde isBugCondition(X) es verdadero → NO debe bloquear
// ═══════════════════════════════════════════════════════════════════════════════
describe('PBT — Property 1: Para todo isBugCondition(X), createOrder no lanza "Saldo VES insuficiente"', () => {
    /**
     * Validates: Requirements 1.1, 1.2, 1.3
     *
     * Generamos inputs donde isBugCondition es verdadero por construcción:
     *   - role: 'seller' | 'client'
     *   - saldo <= 0 (negativo o cero)
     *   - horaActual < 17:00 Chile (usando vi.setSystemTime)
     *   - clpAmount > 0
     *
     * EXPECTED OUTCOME del test: FALLA en código sin corregir → confirma el bug
     * La propiedad PASA después del fix (el test valida el comportamiento correcto).
     */
    it('PBT: createOrder NO lanza "Saldo VES insuficiente" cuando isBugCondition(X) es verdadero', async () => {
        // Hora fija: 10:00 Chile (14:00 UTC) → restricción INACTIVA (hora < 17)
        vi.useFakeTimers();
        vi.setSystemTime(CHILE_10_00);

        const { useCreateOrder } = await import('./useCreateOrder');

        const roleArb = fc.constantFrom<'seller' | 'client'>('seller', 'client');
        // saldo <= 0: incluye cero y valores negativos
        // fc.float requiere valores Math.fround para los límites
        const saldoArb = fc.oneof(
            fc.constant(0),
            fc.float({ min: Math.fround(-10000), max: Math.fround(-0.01), noNaN: true })
        );
        // clpAmount > 0
        const clpAmountArb = fc.integer({ min: 1, max: 10000 });

        await fc.assert(
            fc.asyncProperty(roleArb, saldoArb, clpAmountArb, async (role, saldo, clpAmount) => {
                mockAuthState.role = role;

                // Verificar que isBugCondition es verdadero para este input
                expect(isBugCondition(role, saldo, clpAmount)).toBe(true);

                const hook = useCreateOrder();
                const result = await hook.createOrder(
                    makeFormData(clpAmount),
                    makeRates(1),
                    saldo
                ).catch((e: Error) => e);

                // COMPORTAMIENTO CORRECTO: NO debe lanzar "Saldo VES insuficiente"
                // (el test FALLA en código sin corregir porque SÍ lanza el error)
                if (result instanceof Error) {
                    // Este expect FALLA si el bug existe (bloquea cuando no debería)
                    expect(result.message).not.toMatch(/Saldo VES insuficiente/i);
                }
                // Si resolves → la propiedad se cumple ✓
            }),
            { numRuns: 100 }
        );

        vi.useRealTimers();
    });
});
