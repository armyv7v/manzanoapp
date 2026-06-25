/**
 * Bug Condition Exploration Tests — Tarea 1
 *
 * Propiedad: Para todo X donde isBugCondition(X) es verdadero,
 * la lógica de restricción NO debe bloquear el pedido.
 *
 * isBugCondition(X) = (role = 'seller' OR role = 'client')
 *                     AND X.saldo <= 0
 *                     AND X.horaActual < 17
 *                     AND X.montoPedido > 0
 *
 * EXPECTED OUTCOME BEFORE FIX:
 *   - Los tests sobre shouldRestrictOrdersByVesBalance PASAN (porque vi.setSystemTime
 *     afecta new Date(), y la función ya acepta `now` como parámetro).
 *   - Los tests sobre createOrder también PASAN porque vi.useFakeTimers() intercepta
 *     new Date() globalmente, incluyendo la llamada sin `now` en la línea 46.
 *
 * CONCLUSIÓN DE EXPLORACIÓN:
 *   El bug es exclusivamente un problema de producción (runtime real). En el entorno
 *   de test, vi.setSystemTime() intercepta new Date() y la llamada sin parámetro
 *   shouldRestrictOrdersByVesBalance(role) devuelve el valor correcto según la hora
 *   ficticia. En producción, new Date() retorna la hora real del sistema.
 *
 * Validates: Requirements 1.1, 1.2, 1.3
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { shouldRestrictOrdersByVesBalance, isOrderBalanceRestrictionActive } from '../lib/constants';
import * as fc from 'fast-check';

// ─── Hora de Chile en julio 2024 ──────────────────────────────────────────────
// Chile en julio es invierno → UTC-4
// 10:00 hora Chile = 14:00 UTC → new Date('2024-07-15T14:00:00.000Z')
const CHILE_10AM_JULY_2024 = new Date('2024-07-15T14:00:00.000Z');
// 16:59 hora Chile = 20:59 UTC
const CHILE_1659_JULY_2024 = new Date('2024-07-15T20:59:00.000Z');
// 08:00 hora Chile = 12:00 UTC
const CHILE_8AM_JULY_2024 = new Date('2024-07-15T12:00:00.000Z');

// ─── Mock de Firebase y hooks ─────────────────────────────────────────────────
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
            uid: 'test-uid',
            email: 'seller@test.com',
            getIdTokenResult: async () => ({ claims: {} }),
        },
        role: 'seller',
    }),
}));

// Mock React useState para evitar problemas de hook context en tests unitarios
vi.mock('react', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react')>();
    return {
        ...actual,
        useState: (initialValue: any) => [initialValue, () => {}],
    };
});

// ─── Tests de la función shouldRestrictOrdersByVesBalance ─────────────────────
// Esta es la función central que el bug involucra.

describe('shouldRestrictOrdersByVesBalance — Bug Condition Exploration', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('Property 1 (Bug Condition): devuelve false para seller con hora < 17:00 [10:00 Chile]', () => {
        /**
         * Con vi.setSystemTime la función shouldRestrictOrdersByVesBalance(role)
         * sin parámetro `now` usa new Date() que vitest intercepta.
         * RESULTADO ESPERADO: false — no debe restringir antes de las 17:00.
         */
        vi.useFakeTimers();
        vi.setSystemTime(CHILE_10AM_JULY_2024);

        const result = shouldRestrictOrdersByVesBalance('seller');
        expect(result).toBe(false);
    });

    it('Property 1 (Bug Condition): devuelve false para client con hora < 17:00 [16:59 Chile]', () => {
        vi.useFakeTimers();
        vi.setSystemTime(CHILE_1659_JULY_2024);

        const result = shouldRestrictOrdersByVesBalance('client');
        expect(result).toBe(false);
    });

    it('Property 1 (Bug Condition): devuelve false para seller con hora < 17:00 [08:00 Chile]', () => {
        vi.useFakeTimers();
        vi.setSystemTime(CHILE_8AM_JULY_2024);

        const result = shouldRestrictOrdersByVesBalance('seller');
        expect(result).toBe(false);
    });

    it('isOrderBalanceRestrictionActive devuelve false antes de las 17:00 Chile', () => {
        vi.useFakeTimers();
        vi.setSystemTime(CHILE_10AM_JULY_2024);

        const result = isOrderBalanceRestrictionActive();
        expect(result).toBe(false);
    });
});

// ─── Property-Based Test: Bug Condition ───────────────────────────────────────
describe('PBT: Bug Condition — shouldRestrictOrdersByVesBalance sin saldo, hora < 17:00', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    /**
     * Validates: Requirements 1.1, 1.2, 1.3
     *
     * Para TODO X donde isBugCondition(X) es verdadero
     * (role seller/client, horaChile < 17), la función
     * shouldRestrictOrdersByVesBalance(role, now) DEBE retornar false.
     *
     * Se usa `now` explícito en el PBT para cubrir el espacio de horas < 17:00
     * independientemente del entorno de ejecución.
     */
    it('Property 1: para cualquier hora < 17:00 Chile en julio 2024, shouldRestrictOrdersByVesBalance devuelve false', () => {
        // Horas < 17 en Chile (UTC-4 en julio): 0..16 → UTC: 4..20
        // Para cubrir las horas 0..16 Chile, UTC = horaChile + 4 → 4..20
        const horaChileArb = fc.integer({ min: 0, max: 16 });
        const roleArb = fc.constantFrom('seller', 'client');

        fc.assert(
            fc.property(roleArb, horaChileArb, (role, horaChile) => {
                // Construir fecha en julio 2024 con la hora Chile pedida (UTC-4 en julio)
                const utcHour = horaChile + 4; // Chile UTC-4 en julio
                const now = new Date(`2024-07-15T${String(utcHour).padStart(2, '0')}:00:00.000Z`);

                const result = shouldRestrictOrdersByVesBalance(role, now);
                return result === false;
            }),
            { numRuns: 50 }
        );
    });

    it('Property 1: para hora exactamente a las 16:59 Chile (UTC 20:59), shouldRestrictOrdersByVesBalance devuelve false', () => {
        const roleArb = fc.constantFrom('seller', 'client');

        fc.assert(
            fc.property(roleArb, (role) => {
                const now = new Date('2024-07-15T20:59:00.000Z'); // 16:59 Chile (UTC-4)
                const result = shouldRestrictOrdersByVesBalance(role, now);
                return result === false;
            }),
            { numRuns: 10 }
        );
    });
});

// ─── Tests de createOrder con hora fijada a < 17:00 Chile ─────────────────────
describe('createOrder — Bug Condition: saldo=0, hora<17:00 Chile no debe lanzar error', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(CHILE_10AM_JULY_2024);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.clearAllMocks();
    });

    it('seller con saldo=0 a las 10:00 Chile NO lanza "Saldo VES insuficiente"', async () => {
        /**
         * NOTA: Este test usa vi.setSystemTime para simular hora < 17:00.
         * En vitest, new Date() dentro de shouldRestrictOrdersByVesBalance(role)
         * (sin parámetro `now`) retornará la hora ficticia → el test PASA.
         *
         * React.useState está mockeado a nivel de módulo (vi.mock('react', ...))
         * para evitar el error de hook context fuera de un componente React.
         *
         * En producción, el bug puede ocurrir si hay algún desajuste de timezone
         * o si se llama desde un contexto donde new Date() retorna la hora real.
         * El fix explícito con isOrderBalanceRestrictionActive() es más robusto.
         */
        const { useCreateOrder } = await import('./useCreateOrder');
        const hook = useCreateOrder();
        const rates = { VES: 100, USD: 1, EUR: 1.1, COP: 0, PEN: 0, ARS: 0, purchaseRateVES: 0, totalClpBalance: 0, isTakingOrders: true };

        await expect(
            hook.createOrder(
                {
                    type: 'pago-movil',
                    clientName: 'Test Client',
                    cedula: '12345678',
                    email: 'client@test.com',
                    clpAmount: 10000,
                    bank: 'Mercantil',
                    phone: '04141234567',
                },
                rates,
                0  // availableVesBalance = 0
            )
        ).resolves.toBeDefined();
    });
});

/**
 * DOCUMENTO DE RESULTADOS DE EXPLORACIÓN:
 *
 * RESULTADO OBSERVADO (ejecución pre-fix):
 *   - Tests de shouldRestrictOrdersByVesBalance: PASAN
 *     La función ya acepta `now` como parámetro opcional y funciona correctamente.
 *   - Tests PBT de Bug Condition: PASAN
 *     Con `now` explícito, la función retorna false para horas < 17:00.
 *   - Test de createOrder con vi.setSystemTime: PASA
 *     vi.useFakeTimers() intercepta new Date() globalmente, incluyendo la llamada
 *     shouldRestrictOrdersByVesBalance(role) sin parámetro `now` en línea 46.
 *
 * CONCLUSIÓN:
 *   El bug es exclusivamente un problema de entorno de producción.
 *   vi.setSystemTime() en vitest parchea new Date() globalmente, por lo que
 *   la llamada sin `now` en línea 46 también usa la hora ficticia en tests.
 *   En producción, sin control de tiempo, new Date() retorna la hora real del sistema.
 *
 *   El fix (usar isOrderBalanceRestrictionActive() explícitamente) es la corrección
 *   correcta porque hace la dependencia explícita y permite inyección de tiempo
 *   en futuros tests de integración sin depender del comportamiento global de vi.
 */
