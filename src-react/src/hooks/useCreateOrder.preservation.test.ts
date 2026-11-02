/**
 * Preservation Tests — Tarea 2
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
 *
 * Propiedad (Property 2 — Preservation):
 *   Para todo X donde ¬isBugCondition(X), el comportamiento del sistema
 *   ANTES y DESPUÉS del fix debe ser idéntico.
 *
 *   Los casos de preservación capturan:
 *     P1: totalConComisiones <= availableVesBalance → pedido permitido (saldo suficiente)
 *     P2: role = 'admin' → sin restricciones de saldo en ningún caso
 *     P3: hora < 17:00 Chile → advertencia informativa sin bloqueo (aunque total supere saldo)
 *     P4: destinationAmount > availableVesBalance → bloqueado (monto base ya supera saldo)
 *     P5: totalConComisiones === availableVesBalance → permitido (no supera, condición estricta >)
 *
 * EXPECTED OUTCOME (código SIN corregir):
 *   - Todos estos tests PASAN — confirman el comportamiento base a preservar
 *
 * Metodología: observation-first — los assertions reflejan el comportamiento
 * observado en el código sin corregir para los inputs ¬isBugCondition(X).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

// ─── Mock de useAuth — será sobreescrito por test según rol ──────────────────
const mockRole = { value: 'seller' as string };

vi.mock('./useAuth', () => ({
    useAuth: () => ({
        user: {
            uid: 'test-uid',
            email: 'test@test.com',
            getIdTokenResult: async () => ({ claims: {} }),
        },
        role: mockRole.value,
    }),
}));

vi.mock('react', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react')>();
    return {
        ...actual,
        useState: (initialValue: any) => [initialValue, () => {}],
    };
});

// ─── Constantes de tiempo ─────────────────────────────────────────────────────
// Chile en julio es UTC-4
// 15:00 Chile (antes de 17:00) → 19:00 UTC → restricción NO activa
const CHILE_15_JULY_2024 = new Date('2024-07-15T19:00:00.000Z');
// 18:00 Chile (después de 17:00) → 22:00 UTC → restricción SÍ activa
const CHILE_18_JULY_2024 = new Date('2024-07-15T22:00:00.000Z');

// ─── Función auxiliar: computeVesShortfallVisible (lógica ACTUAL) ─────────────
function computeVesShortfallVisibleActual(
    destinationAmount: number,
    availableVesBalance: number,
    role: string
): boolean {
    const showVesAvailability = role === 'seller' || role === 'admin';
    const safeAvailableVesBalance = typeof availableVesBalance === 'number' ? availableVesBalance : 0;
    // Lógica ACTUAL: compara destinationAmount (no totalConComisiones)
    return showVesAvailability && destinationAmount > 0 && destinationAmount > safeAvailableVesBalance;
}

// ─── Función auxiliar: computeTotalConComisiones ──────────────────────────────
function computeTotalConComisiones(destinationAmount: number): number {
    const adminCommission = Math.ceil(destinationAmount * 0.01 * 100) / 100;
    const tilloCommission = Math.ceil(destinationAmount * 0.0015 * 100) / 100;
    return destinationAmount + adminCommission + tilloCommission;
}

// ─── Función auxiliar: rates helper ──────────────────────────────────────────
function makeRates(vesRate: number) {
    return {
        VES: vesRate,
        USD: 1, EUR: 1.1, COP: 0, PEN: 0, ARS: 0,
        purchaseRateVES: 0, totalClpBalance: 0, isTakingOrders: true,
    };
}

// ─── Función auxiliar: formData helper ───────────────────────────────────────
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

// ═══════════════════════════════════════════════════════════════════════════════
// P1: Saldo suficiente cubre el total con comisiones → pedido permitido
// ═══════════════════════════════════════════════════════════════════════════════
describe('P1 — Saldo cubre totalConComisiones → pedido permitido', () => {
    /**
     * Validates: Requirements 3.1
     *
     * Caso concreto: destinationAmount=50.00, totalConComisiones=50.58, saldo=200.00
     * ¬isBugCondition: totalConComisiones(50.58) <= saldo(200.00)
     * → vesShortfallVisible = false (el indicador no muestra déficit)
     * → createOrder resuelve sin lanzar error de saldo
     */

    beforeEach(() => { mockRole.value = 'seller'; });
    afterEach(() => { vi.useRealTimers(); });

    it('vesShortfallVisible es false cuando saldo(200) cubre totalConComisiones(50.58)', () => {
        const destinationAmount = 50.00;
        const availableVesBalance = 200.00;
        // ¬isBugCondition: destinationAmount(50.00) <= saldo(200) AND totalConComisiones(50.58) <= saldo(200)
        expect(computeTotalConComisiones(destinationAmount)).toBe(50.58);
        // Lógica actual: 50.00 > 200.00 → false → no muestra déficit ✓
        const shortfall = computeVesShortfallVisibleActual(destinationAmount, availableVesBalance, 'seller');
        expect(shortfall).toBe(false);
    });

    it('createOrder no lanza error cuando saldo(200) cubre totalConComisiones(50.58) — hora 18:00 Chile', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(CHILE_18_JULY_2024);

        const { useCreateOrder } = await import('./useCreateOrder');
        const hook = useCreateOrder();
        const tasaVES = 50; // clpAmount=1 → destinationAmount = Math.ceil(1*50*100)/100 = 50.00
        const availableVesBalance = 200.00;

        // No debe lanzar error: 50.00 <= 200.00
        await expect(
            hook.createOrder(makeFormData(1), makeRates(tasaVES), availableVesBalance)
        ).resolves.toBeDefined();
    });

    it('PBT — Para todo input donde totalConComisiones <= saldo: createOrder no lanza error de saldo', async () => {
        /**
         * Validates: Requirements 3.1
         *
         * Generamos inputs donde ¬isBugCondition porque el saldo cubre el total con comisiones.
         * La lógica actual tampoco bloquea (destinationAmount <= saldo) → resultado idéntico antes y después del fix.
         */
        vi.useFakeTimers();
        vi.setSystemTime(CHILE_18_JULY_2024);

        const { useCreateOrder } = await import('./useCreateOrder');

        // destinationAmount D en [1, 100], saldo B = totalConComisiones(D) + margen [0.01, 50]
        // → totalConComisiones(D) <= B → ¬isBugCondition garantizado
        const destArb = fc.float({ min: Math.fround(1), max: Math.fround(100), noNaN: true }).map(d => Math.ceil(d * 100) / 100);
        const marginArb = fc.float({ min: Math.fround(0.01), max: Math.fround(50), noNaN: true });

        await fc.assert(
            fc.asyncProperty(destArb, marginArb, async (D, margin) => {
                if (D <= 0) return;
                const total = computeTotalConComisiones(D);
                const B = total + margin; // saldo cubre total + margen extra

                // tasaVES=1 → clpAmount = D → destinationAmount = D
                const hook = useCreateOrder();
                const result = await hook.createOrder(
                    makeFormData(D),
                    makeRates(1),
                    B
                ).catch((e: Error) => e);

                // No debe lanzar "Saldo VES insuficiente"
                if (result instanceof Error) {
                    expect(result.message).not.toMatch(/Saldo VES insuficiente/i);
                }
            }),
            { numRuns: 50 }
        );

        vi.useRealTimers();
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// P2: role = 'admin' → sin restricciones de saldo
// ═══════════════════════════════════════════════════════════════════════════════
describe('P2 — role=admin → sin restricción de saldo en ningún caso', () => {
    /**
     * Validates: Requirements 3.2
     *
     * Para role='admin', shouldEnforceVesBalance siempre es false
     * → createOrder no lanza error de saldo independientemente del monto
     * → vesShortfallVisible puede ser true (warning visual) pero NO bloquea
     */

    beforeEach(() => { mockRole.value = 'admin'; });
    afterEach(() => { vi.useRealTimers(); });

    it('createOrder admin no lanza error de saldo con monto grande y saldo pequeño — hora 18:00 Chile', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(CHILE_18_JULY_2024);

        const { useCreateOrder } = await import('./useCreateOrder');
        const hook = useCreateOrder();
        // destinationAmount = 1000.00, saldo = 10.00 → admin no bloquea
        const result = await hook.createOrder(
            makeFormData(1000),
            makeRates(1),
            10.00
        ).catch((e: Error) => e);

        if (result instanceof Error) {
            expect(result.message).not.toMatch(/Saldo VES insuficiente/i);
        }
    });

    it('vesShortfallVisible para admin es true cuando destinationAmount > saldo (solo warning visual)', () => {
        // Admin sí ve el indicador visual, pero no se bloquea
        const shortfall = computeVesShortfallVisibleActual(500.00, 100.00, 'admin');
        expect(shortfall).toBe(true); // admin ve el warning visual
        // Pero shouldEnforceVesBalance = false para admin → no bloquea la creación
    });

    it('PBT — Para todo input con role=admin: createOrder no lanza error de saldo', async () => {
        /**
         * Validates: Requirements 3.2
         *
         * Genera montos aleatorios donde destinationAmount puede superar el saldo.
         * Para admin, nunca debe lanzar "Saldo VES insuficiente".
         */
        vi.useFakeTimers();
        vi.setSystemTime(CHILE_18_JULY_2024);

        const { useCreateOrder } = await import('./useCreateOrder');

        const clpAmountArb = fc.integer({ min: 1, max: 10000 });
        const saldoArb = fc.float({ min: Math.fround(0.01), max: Math.fround(50), noNaN: true });

        await fc.assert(
            fc.asyncProperty(clpAmountArb, saldoArb, async (clp, saldo) => {
                // destinationAmount = clp * 1 = clp → siempre mayor que saldo (clp >= 51)
                // Pero role='admin' → sin bloqueo
                const hook = useCreateOrder();
                const result = await hook.createOrder(
                    makeFormData(clp),
                    makeRates(1),
                    saldo
                ).catch((e: Error) => e);

                if (result instanceof Error) {
                    expect(result.message).not.toMatch(/Saldo VES insuficiente/i);
                }
            }),
            { numRuns: 50 }
        );

        vi.useRealTimers();
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// P3: hora < 17:00 Chile → advertencia informativa sin bloqueo
// ═══════════════════════════════════════════════════════════════════════════════
describe('P3 — hora < 17:00 Chile → advertencia visual pero sin bloqueo de creación', () => {
    /**
     * Validates: Requirements 3.3
     *
     * Caso concreto: role=seller, totalConComisiones=101.15, saldo=100.10, hora 15:00 Chile
     * → isOrderBalanceRestrictionActive() = false
     * → shouldEnforceVesBalance = false (aunque role=seller)
     * → createOrder no lanza error de saldo (solo advertencia visual)
     *
     * OBSERVACIÓN del código sin corregir:
     *   - vesShortfallVisible usa destinationAmount, no totalConComisiones
     *   - En este caso: destinationAmount=100.00 <= saldo=100.10 → vesShortfallVisible = false
     *   - createOrder: shouldEnforceVesBalance=false → no valida saldo → no lanza error ✓
     */

    beforeEach(() => { mockRole.value = 'seller'; });
    afterEach(() => { vi.useRealTimers(); });

    it('isOrderBalanceRestrictionActive retorna false a las 15:00 Chile (19:00 UTC julio)', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(CHILE_15_JULY_2024);

        const { isOrderBalanceRestrictionActive } = await import('../lib/constants');
        expect(isOrderBalanceRestrictionActive()).toBe(false);
    });

    it('createOrder seller hora < 17:00 no lanza error aunque totalConComisiones supere saldo', async () => {
        /**
         * clpAmount=1, tasaVES=100, availableVesBalance=100.10
         * destinationAmount=100.00, totalConComisiones=101.15
         * isBugCondition=true PERO hora < 17:00 → shouldEnforceVesBalance=false → no bloquea
         * Validates: Requirements 3.3
         */
        vi.useFakeTimers();
        vi.setSystemTime(CHILE_15_JULY_2024);

        const { useCreateOrder } = await import('./useCreateOrder');
        const hook = useCreateOrder();

        // No debe lanzar error de saldo (restricción horaria inactiva)
        const result = await hook.createOrder(
            makeFormData(1),
            makeRates(100),
            100.10
        ).catch((e: Error) => e);

        if (result instanceof Error) {
            expect(result.message).not.toMatch(/Saldo VES insuficiente/i);
        }
    });

    it('PBT — Para todo input seller/client antes de 17:00: no se bloquea por saldo', async () => {
        /**
         * Validates: Requirements 3.3
         *
         * Genera montos donde destinationAmount > saldo (bloqueado post-17:00),
         * pero antes de 17:00 Chile el createOrder resuelve sin error de saldo.
         */
        vi.useFakeTimers();
        vi.setSystemTime(CHILE_15_JULY_2024);

        const { useCreateOrder } = await import('./useCreateOrder');
        const roleArb = fc.constantFrom<'seller' | 'client'>('seller', 'client');
        const clpArb = fc.integer({ min: 200, max: 5000 }); // destinationAmount > saldo
        const saldoArb = fc.float({ min: 1, max: 100, noNaN: true });

        await fc.assert(
            fc.asyncProperty(clpArb, saldoArb, roleArb, async (clp, saldo, rol) => {
                mockRole.value = rol;
                const hook = useCreateOrder();
                const result = await hook.createOrder(
                    makeFormData(clp),
                    makeRates(1),
                    saldo
                ).catch((e: Error) => e);

                // Antes de 17:00 no debe lanzar error de saldo insuficiente
                if (result instanceof Error) {
                    expect(result.message).not.toMatch(/Saldo VES insuficiente/i);
                }
            }),
            { numRuns: 50 }
        );

        vi.useRealTimers();
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// P4: destinationAmount > availableVesBalance → bloqueado (bug ya visible hoy)
// ═══════════════════════════════════════════════════════════════════════════════
describe('P4 — destinationAmount > saldo → bloqueado (comportamiento correcto pre-existente)', () => {
    /**
     * Validates: Requirements 3.4
     *
     * Caso concreto: destinationAmount=150.00 > availableVesBalance=100.00
     * → lógica actual ya bloquea (150.00 > 100.00 → true)
     * → El fix no debe cambiar este caso: debe seguir bloqueando
     *
     * ¬isBugCondition: destinationAmount > saldo (no es la condición de bug,
     * que requiere destinationAmount <= saldo)
     */

    beforeEach(() => { mockRole.value = 'seller'; });
    afterEach(() => { vi.useRealTimers(); });

    it('vesShortfallVisible es true cuando destinationAmount(150) > saldo(100)', () => {
        const shortfall = computeVesShortfallVisibleActual(150.00, 100.00, 'seller');
        expect(shortfall).toBe(true);
    });

    it('createOrder lanza error de saldo cuando destinationAmount(150) > saldo(100) — hora 18:00 Chile', async () => {
        /**
         * Validates: Requirements 3.4
         * tasaVES=1, clpAmount=150 → destinationAmount=150.00 > saldo=100.00
         * La lógica actual ya bloqueaba esto correctamente → el fix preserva este bloqueo
         */
        vi.useFakeTimers();
        vi.setSystemTime(CHILE_18_JULY_2024);

        const { useCreateOrder } = await import('./useCreateOrder');
        const hook = useCreateOrder();

        await expect(
            hook.createOrder(makeFormData(150), makeRates(1), 100.00)
        ).rejects.toThrow(/Saldo VES insuficiente/i);
    });

    it('PBT — Para todo input donde destinationAmount > saldo: bloqueo activo a las 18:00 Chile', async () => {
        /**
         * Validates: Requirements 3.4
         *
         * Genera inputs donde destinationAmount > saldo.
         * La lógica actual (y corregida) debe lanzar el error de saldo insuficiente.
         * Esto confirma que el fix preserva el bloqueo pre-existente.
         */
        vi.useFakeTimers();
        vi.setSystemTime(CHILE_18_JULY_2024);

        const { useCreateOrder } = await import('./useCreateOrder');

        // saldo B en [1, 100], destinationAmount D = B + exceso [0.01, 50]
        const saldoArb = fc.float({ min: Math.fround(1), max: Math.fround(100), noNaN: true });
        const excesoArb = fc.float({ min: Math.fround(0.01), max: Math.fround(50), noNaN: true });

        await fc.assert(
            fc.asyncProperty(saldoArb, excesoArb, async (saldo, exceso) => {
                const D = Math.ceil((saldo + exceso) * 100) / 100; // destinationAmount > saldo
                if (D <= saldo) return; // skip por redondeo

                // tasaVES=1 → clpAmount = D → destinationAmount = D
                const hook = useCreateOrder();

                await expect(
                    hook.createOrder(makeFormData(D), makeRates(1), saldo)
                ).rejects.toThrow(/Saldo VES insuficiente/i);
            }),
            { numRuns: 50 }
        );

        vi.useRealTimers();
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// P5: totalConComisiones === availableVesBalance → pedido permitido (condición estricta >)
// ═══════════════════════════════════════════════════════════════════════════════
describe('P5 — totalConComisiones === saldo → pedido permitido (no supera, condición >)', () => {
    /**
     * Validates: Requirements 3.1
     *
     * Edge case: cuando totalConComisiones es exactamente igual al saldo disponible,
     * la condición estricta (>) NO se activa → pedido debe ser permitido.
     *
     * Ejemplo: destinationAmount=100.00, totalConComisiones=101.15, saldo=101.15
     *   → totalConComisiones(101.15) > saldo(101.15) → false → NO bloquea ✓
     *
     * OBSERVACIÓN en código sin corregir:
     *   - vesShortfallVisible: destinationAmount(100.00) > saldo(101.15) → false → no muestra déficit
     *   - createOrder: destinationAmount(100.00) > roundedAvailable(101.15) → false → no lanza error
     *   - Ambas lógicas coinciden en que el pedido es permitido (¬isBugCondition: total <= saldo)
     */

    beforeEach(() => { mockRole.value = 'seller'; });
    afterEach(() => { vi.useRealTimers(); });

    it('vesShortfallVisible es false cuando destinationAmount(100) < saldo(101.15) — edge case exacto', () => {
        // En código sin corregir: 100.00 > 101.15 → false → no muestra déficit
        const shortfall = computeVesShortfallVisibleActual(100.00, 101.15, 'seller');
        expect(shortfall).toBe(false);
    });

    it('createOrder no lanza error cuando destinationAmount(100) < saldo exacto(101.15) — hora 18:00 Chile', async () => {
        /**
         * Validates: Requirements 3.1
         * destinationAmount=100.00 < saldo=101.15 → la lógica actual no lanza error
         * Nota: totalConComisiones=101.15 = saldo=101.15 → tampoco bloquea (condición >)
         * El fix debe preservar este comportamiento: 101.15 > 101.15 → false → permitido
         */
        vi.useFakeTimers();
        vi.setSystemTime(CHILE_18_JULY_2024);

        const { useCreateOrder } = await import('./useCreateOrder');
        const hook = useCreateOrder();
        // tasaVES=100, clpAmount=1 → destinationAmount=100.00
        // totalConComisiones = 100.00 + 1.00 + 0.15 = 101.15
        // saldo = 101.15 (exactamente igual)
        const availableVesBalance = 101.15;

        const result = await hook.createOrder(
            makeFormData(1),
            makeRates(100),
            availableVesBalance
        ).catch((e: Error) => e);

        // No debe lanzar error de saldo: destinationAmount(100.00) <= saldo(101.15)
        if (result instanceof Error) {
            expect(result.message).not.toMatch(/Saldo VES insuficiente/i);
        }
    });

    it('PBT — Para todo D donde totalConComisiones(D) === saldo: permitido (condición > no activa)', async () => {
        /**
         * Validates: Requirements 3.1
         *
         * Construimos saldo = Math.round(totalConComisiones(D) * 100) / 100,
         * que simula un valor real de saldo desde la base de datos (número redondeado a 2 decimales).
         * La condición estricta > no se activa → pedido debe ser permitido.
         *
         * NOTA: No usamos saldo = totalConComisiones directamente porque la suma de punto
         * flotante puede producir totalConComisiones = 112.07000000000001, y al aplicar
         * Math.round en useCreateOrder se obtiene roundedAvailable = 112.07, lo que hace
         * que totalConComisiones > roundedAvailable sea true por el error de precisión.
         * Los saldos reales vienen de la BD como números limpios (ej. 112.07), por lo que
         * usar Math.round refleja correctamente el comportamiento esperado.
         *
         * NOTA 2: D se genera como ENTERO de CLP (tasa 1 → destinationAmount = D exacto).
         * Con fc.float los valores de 32 bits al multiplicar por 100 caen un ulp por
         * encima/debajo del céntimo y el Math.ceil del hook desvía destinationAmount
         * un centavo (quirk pre-existente de la fórmula), lo que rompería la igualdad
         * que esta propiedad quiere probar. Con enteros, clp*100 es exacto en double.
         */
        vi.useFakeTimers();
        vi.setSystemTime(CHILE_18_JULY_2024);

        const { useCreateOrder } = await import('./useCreateOrder');

        const destArb = fc.integer({ min: 1, max: 100_000 });

        await fc.assert(
            fc.asyncProperty(destArb, async (D) => {
                if (D <= 0) return;
                const totalConComisiones = computeTotalConComisiones(D);
                // saldo = totalConComisiones redondeado a 2 decimales (valor real de BD)
                const saldo = Math.round(totalConComisiones * 100) / 100;

                // tasaVES=1 → clpAmount=D (entero) → destinationAmount=D exacto
                const hook = useCreateOrder();
                const result = await hook.createOrder(
                    makeFormData(D),
                    makeRates(1),
                    saldo
                ).catch((e: Error) => e);

                // No debe lanzar error: totalConComisiones <= saldo (condición > no activa)
                if (result instanceof Error) {
                    expect(result.message).not.toMatch(/Saldo VES insuficiente/i);
                }
            }),
            { numRuns: 50 }
        );

        vi.useRealTimers();
    });
});
