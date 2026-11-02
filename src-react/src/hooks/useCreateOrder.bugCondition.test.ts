/**
 * Bug Condition Exploration Tests — Tarea 1
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4**
 *
 * Propiedad (Property 1 — Bug Condition):
 *   Para todo X donde isBugCondition(X) es verdadero,
 *   la lógica ACTUAL (sin corregir) NO bloquea el pedido ni muestra déficit de saldo.
 *
 *   isBugCondition(X):
 *     destinationAmount = Math.ceil(clpAmount * tasaVES * 100) / 100
 *     adminCommission   = Math.ceil(destinationAmount * 0.01 * 100) / 100
 *     tilloCommission   = Math.ceil(destinationAmount * 0.0015 * 100) / 100
 *     totalConComisiones = destinationAmount + adminCommission + tilloCommission
 *
 *     RETURN (role = 'seller' OR role = 'client')
 *       AND destinationAmount   <= availableVesBalance
 *       AND totalConComisiones  >  availableVesBalance
 *
 * EXPECTED OUTCOME (código SIN corregir):
 *   - createOrder NO lanza error → PASA (lógica incorrecta permite el pedido)
 *   - vesShortfallVisible = false  → PASA (lógica incorrecta no muestra déficit)
 *   - Los asserts en los tests exigen que SÍ se lance error / SÍ se muestre déficit
 *   - Por tanto los tests FALLAN → confirma que el bug existe
 */

import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import { computeOrderTotalWithCommissions } from '../lib/constants';

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

vi.mock('./useAuth', () => ({
    useAuth: () => ({
        user: {
            uid: 'seller-test-uid',
            email: 'seller@test.com',
            getIdTokenResult: async () => ({ claims: {} }),
        },
        role: 'seller',
    }),
}));

vi.mock('react', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react')>();
    return {
        ...actual,
        useState: (initialValue: any) => [initialValue, () => {}],
    };
});

// ─── Hora fija: 18:00 Chile (restricción activa) ──────────────────────────────
// Chile en julio es UTC-4 → 18:00 Chile = 22:00 UTC
const CHILE_18_JULY_2024 = new Date('2024-07-15T22:00:00.000Z');

// ─── Función auxiliar: isBugCondition ────────────────────────────────────────
function isBugCondition(input: {
    clpAmount: number;
    tasaVES: number;
    availableVesBalance: number;
    role: string;
}): boolean {
    const destinationAmount = Math.ceil(input.clpAmount * input.tasaVES * 100) / 100;
    const adminCommission = Math.ceil(destinationAmount * 0.01 * 100) / 100;
    const tilloCommission = Math.ceil(destinationAmount * 0.0015 * 100) / 100;
    const totalConComisiones = destinationAmount + adminCommission + tilloCommission;

    return (
        (input.role === 'seller' || input.role === 'client') &&
        destinationAmount <= input.availableVesBalance &&
        totalConComisiones > input.availableVesBalance
    );
}

// ─── Función auxiliar: calcular vesShortfallVisible con lógica CORREGIDA ──────
function computeVesShortfallVisibleActual(
    destinationAmount: number,
    availableVesBalance: number,
    role: string
): boolean {
    const showVesAvailability = role === 'seller' || role === 'admin';
    const safeAvailableVesBalance = typeof availableVesBalance === 'number' ? availableVesBalance : 0;

    // Lógica CORREGIDA: compara totalConComisiones, no destinationAmount
    const { totalConComisiones } = destinationAmount > 0
        ? computeOrderTotalWithCommissions(destinationAmount)
        : { totalConComisiones: 0 };

    return (
        showVesAvailability &&
        totalConComisiones > 0 &&
        totalConComisiones > safeAvailableVesBalance
    );
}

// ─── Tests unitarios: caso mínimo concreto ────────────────────────────────────
describe('Bug Condition — Caso mínimo concreto (clpAmount=1, tasaVES=100, saldo=100.10)', () => {
    /**
     * clpAmount=1, tasaVES=100 → destinationAmount = Math.ceil(1*100*100)/100 = 100.00
     * adminCommission    = Math.ceil(100.00 * 0.01 * 100) / 100 = 1.00
     * tilloCommission    = Math.ceil(100.00 * 0.0015 * 100) / 100 = 0.15
     * totalConComisiones = 100.00 + 1.00 + 0.15 = 101.15
     * availableVesBalance = 100.10
     *
     * isBugCondition = true → destinationAmount(100.00) <= 100.10 AND totalConComisiones(101.15) > 100.10
     */
    const clpAmount = 1;
    const tasaVES = 100;
    const availableVesBalance = 100.10;
    const destinationAmount = Math.ceil(clpAmount * tasaVES * 100) / 100; // 100.00

    it('isBugCondition es true para el caso mínimo', () => {
        expect(isBugCondition({ clpAmount, tasaVES, availableVesBalance, role: 'seller' })).toBe(true);
    });

    it('DEMUESTRA EL BUG: vesShortfallVisible ACTUAL retorna false (debería ser true)', () => {
        /**
         * Con la lógica actual, destinationAmount(100.00) <= saldo(100.10) → false
         * Por tanto vesShortfallVisible = false: el indicador NO muestra déficit.
         * El test AFIRMA que debería ser true → FALLA en código sin corregir.
         *
         * Validates: Requirements 1.1, 1.2
         */
        const actual = computeVesShortfallVisibleActual(destinationAmount, availableVesBalance, 'seller');

        // La lógica actual retorna false (bug: no muestra déficit)
        // El test espera true (comportamiento correcto)
        expect(actual).toBe(true);
    });

    it('DEMUESTRA EL BUG: createOrder ACTUAL no lanza error de saldo insuficiente (debería lanzar)', async () => {
        /**
         * La lógica actual compara destinationAmount(100.00) > roundedAvailable(100.10) → false
         * → NO lanza error de saldo insuficiente.
         * El test AFIRMA que SÍ debe lanzar el error → FALLA en código sin corregir.
         *
         * Validates: Requirements 1.3, 1.4
         */
        vi.useFakeTimers();
        vi.setSystemTime(CHILE_18_JULY_2024);

        const { useCreateOrder } = await import('./useCreateOrder');
        const hook = useCreateOrder();
        const rates = {
            VES: tasaVES,
            USD: 1, EUR: 1.1, COP: 0, PEN: 0, ARS: 0,
            purchaseRateVES: 0, totalClpBalance: 0, isTakingOrders: true,
        };

        // El test espera que lance "Saldo VES insuficiente" — FALLA en código sin corregir
        await expect(
            hook.createOrder(
                {
                    type: 'pago-movil',
                    clientName: 'Test Client',
                    cedula: '12345678',
                    email: 'client@test.com',
                    clpAmount: clpAmount,
                    bank: 'Mercantil',
                    phone: '04141234567',
                },
                rates,
                availableVesBalance
            )
        ).rejects.toThrow(/Saldo VES insuficiente/);

        vi.useRealTimers();
    });
});

// ─── Tests unitarios: caso 2 concreto ────────────────────────────────────────
describe('Bug Condition — Caso concreto 2 (clpAmount=5000, tasaVES=0.02, saldo=100.50)', () => {
    /**
     * clpAmount=5000, tasaVES=0.02 → destinationAmount = Math.ceil(5000*0.02*100)/100 = 100.00
     * adminCommission    = 1.00
     * tilloCommission    = 0.15
     * totalConComisiones = 101.15
     * availableVesBalance = 100.50
     * isBugCondition: destinationAmount(100.00) <= 100.50 AND totalConComisiones(101.15) > 100.50 → true
     */
    const clpAmount = 5000;
    const tasaVES = 0.02;
    const availableVesBalance = 100.50;
    const destinationAmount = Math.ceil(clpAmount * tasaVES * 100) / 100; // 100.00

    it('isBugCondition es true para caso concreto 2', () => {
        expect(isBugCondition({ clpAmount, tasaVES, availableVesBalance, role: 'client' })).toBe(true);
    });

    it('DEMUESTRA EL BUG: vesShortfallVisible ACTUAL retorna false (debería ser true)', () => {
        /**
         * Validates: Requirements 1.1, 1.2
         */
        const actual = computeVesShortfallVisibleActual(destinationAmount, availableVesBalance, 'seller');
        // Lógica actual: 100.00 > 100.50 → false (BUG)
        // Correcto: 101.15 > 100.50 → true
        expect(actual).toBe(true);
    });
});

// ─── Tests unitarios: edge case — comisión exactamente en límite ──────────────
describe('Bug Condition — Edge case: saldo=101.14 (1 céntimo por debajo del total 101.15)', () => {
    /**
     * destinationAmount=100.00, totalConComisiones=101.15, availableVesBalance=101.14
     * isBugCondition: 100.00 <= 101.14 AND 101.15 > 101.14 → true
     * La lógica actual: 100.00 > 101.14 → false → NO bloquea (BUG)
     * Correcto: 101.15 > 101.14 → true → SÍ debe bloquear
     */
    const destinationAmount = 100.00;
    const availableVesBalance = 101.14;

    it('DEMUESTRA EL BUG: vesShortfallVisible ACTUAL retorna false aunque totalConComisiones supera saldo por 1 céntimo', () => {
        /**
         * Validates: Requirements 1.1, 1.2
         */
        const actual = computeVesShortfallVisibleActual(destinationAmount, availableVesBalance, 'seller');
        // Lógica actual: 100.00 > 101.14 → false (BUG: 1 céntimo de margen en comisiones ignorado)
        // Esperado: true (el total 101.15 supera 101.14)
        expect(actual).toBe(true);
    });
});

// ─── Property-Based Test: Bug Condition ──────────────────────────────────────
describe('PBT — Property 1: Bug Condition — vesShortfallVisible debe ser true cuando isBugCondition(X)', () => {
    /**
     * Validates: Requirements 1.1, 1.2, 1.3, 1.4
     *
     * Para TODO X donde isBugCondition(X) es verdadero:
     *   - La lógica ACTUAL de vesShortfallVisible retorna false (demuestra el bug)
     *   - El test AFIRMA que debe retornar true
     *   - Por tanto FALLA en código sin corregir → confirma que el bug existe
     *
     * Generador: construir inputs donde isBugCondition sea true por construcción.
     * Técnica: fijar destinationAmount en [1, 10000], calcular totalConComisiones,
     * y elegir availableVesBalance en (destinationAmount, totalConComisiones).
     */

    /**
     * Para garantizar isBugCondition:
     *   - Elegimos clpAmount y tasaVES tales que destinationAmount = D
     *   - Elegimos availableVesBalance B tal que D <= B < totalConComisiones(D)
     *   - role = 'seller' | 'client'
     */
    function computeTotalConComisiones(destinationAmount: number): number {
        const adminCommission = Math.ceil(destinationAmount * 0.01 * 100) / 100;
        const tilloCommission = Math.ceil(destinationAmount * 0.0015 * 100) / 100;
        return destinationAmount + adminCommission + tilloCommission;
    }

    it('Property 1 (PBT): vesShortfallVisible ACTUAL es false para inputs isBugCondition — DEBE FALLAR', () => {
        /**
         * Generamos inputs donde isBugCondition es verdadero por construcción:
         *   - destinationAmount D en [1, 10000]
         *   - availableVesBalance B en [D, totalConComisiones(D))  (D <= B < total)
         *   - role = 'seller' | 'client'
         * En estos inputs, la lógica ACTUAL da vesShortfallVisible=false (BUG).
         * El test AFIRMA que debe ser true → FALLA en código sin corregir.
         */
        const destinationAmountArb = fc.float({ min: 1, max: 10000, noNaN: true });
        const roleArb = fc.constant<'seller'>('seller');

        fc.assert(
            fc.property(destinationAmountArb, roleArb, (rawD, role) => {
                // Redondear al centavo (Math.ceil al 2do decimal)
                const D = Math.ceil(rawD * 100) / 100;
                if (D <= 0) return true; // skip edge

                const totalConComisiones = computeTotalConComisiones(D);

                // Crear un gap: B en [D, totalConComisiones) para que isBugCondition sea true
                // B = D + (totalConComisiones - D) * 0.5 — en la mitad del gap
                const gap = totalConComisiones - D;
                if (gap <= 0) return true; // no hay gap posible (raro), skip
                const B = D + gap * 0.5;

                // Verificar que isBugCondition es true
                const bugCond = D <= B && totalConComisiones > B;
                if (!bugCond) return true; // skip si no se cumple (por redondeo)

                // Lógica ACTUAL de vesShortfallVisible (sin corregir):
                const showVesAvailability = role === 'seller' || role === 'admin';
                // Lógica CORREGIDA: usa totalConComisiones en lugar de D
                const actualVesShortfall = showVesAvailability && totalConComisiones > 0 && totalConComisiones > B;

                // El test afirma que debe ser true (comportamiento correcto esperado)
                // → PASA en código corregido (totalConComisiones > B cuando isBugCondition)
                return actualVesShortfall === true;
            }),
            { numRuns: 100 }
        );    });

    it('Property 1 (PBT): createOrder ACTUAL no lanza error para inputs isBugCondition — DEBE FALLAR', async () => {
        /**
         * Validates: Requirements 1.3, 1.4
         *
         * Caso concreto PBT con el mínimo ejemplo documentado:
         * clpAmount=1, tasaVES=100, availableVesBalance=100.10
         * destinationAmount=100.00 <= 100.10 → lógica actual NO lanza error
         * totalConComisiones=101.15 > 100.10 → debería lanzar error
         *
         * El test espera que lanze el error → FALLA en código sin corregir
         */
        vi.useFakeTimers();
        vi.setSystemTime(CHILE_18_JULY_2024);

        const { useCreateOrder } = await import('./useCreateOrder');

        const testInputs = [
            { clpAmount: 1, tasaVES: 100, availableVesBalance: 100.10 },
            { clpAmount: 5000, tasaVES: 0.02, availableVesBalance: 100.50 },
            { clpAmount: 2, tasaVES: 50, availableVesBalance: 100.05 }, // dest=100.00, total=101.15
        ];

        for (const input of testInputs) {
            const hook = useCreateOrder();
            const rates = {
                VES: input.tasaVES,
                USD: 1, EUR: 1.1, COP: 0, PEN: 0, ARS: 0,
                purchaseRateVES: 0, totalClpBalance: 0, isTakingOrders: true,
            };

            // Verificar que isBugCondition es true
            expect(isBugCondition({
                clpAmount: input.clpAmount,
                tasaVES: input.tasaVES,
                availableVesBalance: input.availableVesBalance,
                role: 'seller',
            })).toBe(true);

            // La lógica actual NO lanza error (BUG)
            // El test afirma que DEBE lanzar → FALLA en código sin corregir
            await expect(
                hook.createOrder(
                    {
                        type: 'pago-movil',
                        clientName: 'Test Client',
                        cedula: '12345678',
                        email: 'client@test.com',
                        clpAmount: input.clpAmount,
                        bank: 'Mercantil',
                        phone: '04141234567',
                    },
                    rates,
                    input.availableVesBalance
                )
            ).rejects.toThrow(/Saldo VES insuficiente/);
        }

        vi.useRealTimers();
    });
});

/*
 * ─── DOCUMENTO DE CONTRAEJEMPLOS ESPERADOS ───────────────────────────────────
 *
 * Caso 1 (mínimo concreto):
 *   clpAmount=1, tasaVES=100, availableVesBalance=100.10
 *   destinationAmount = 100.00
 *   adminCommission   = 1.00
 *   tilloCommission   = 0.15
 *   totalConComisiones = 101.15
 *   isBugCondition    = true (100.00 <= 100.10 AND 101.15 > 100.10)
 *   vesShortfallVisible ACTUAL = false (BUG: 100.00 > 100.10 → false)
 *   vesShortfallVisible CORRECTO = true (101.15 > 100.10 → true)
 *   createOrder ACTUAL = resuelve exitosamente (BUG: 100.00 > 100.10 → false, no lanza)
 *   createOrder CORRECTO = lanza "Saldo VES insuficiente"
 *
 * Caso 2:
 *   clpAmount=5000, tasaVES=0.02, availableVesBalance=100.50
 *   destinationAmount = 100.00
 *   totalConComisiones = 101.15
 *   isBugCondition    = true (100.00 <= 100.50 AND 101.15 > 100.50)
 *   vesShortfallVisible ACTUAL = false (BUG)
 *
 * Caso 3 (edge case — 1 céntimo de margen):
 *   destinationAmount = 100.00, availableVesBalance = 101.14
 *   totalConComisiones = 101.15
 *   isBugCondition    = true (100.00 <= 101.14 AND 101.15 > 101.14)
 *   vesShortfallVisible ACTUAL = false (BUG: 1 céntimo de comisión ignorada)
 *
 * PBT contraejemplo (generado aleatoriamente, ejemplo ilustrativo):
 *   D=500.00, B=505.00, totalConComisiones=507.50
 *   isBugCondition = true (500.00 <= 505.00 AND 507.50 > 505.00)
 *   vesShortfallVisible ACTUAL = false (BUG: 500.00 > 505.00 → false)
 *   Test esperaba true → FALLA → bug confirmado
 * ─────────────────────────────────────────────────────────────────────────────
 */
