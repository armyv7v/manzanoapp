/**
 * Test de Exploración de Condición de Bug
 *
 * **Validates: Requirements 1.1, 1.2, 1.3**
 *
 * OBJETIVO: Demostrar que el bug existe en el código SIN CORREGIR.
 * Este test DEBE FALLAR — el fallo confirma que el bug está presente.
 *
 * Bug Condition: isBugCondition(X) =
 *   (role = 'seller' OR role = 'client')
 *   AND X.saldo <= 0
 *   AND X.horaActual < 17
 *   AND X.montoPedido > 0
 *
 * Comportamiento esperado (correcto): shouldRestrictOrdersByVesBalance devuelve false
 * cuando hora < 17:00, independientemente del rol.
 * Comportamiento actual (buggy): la función puede devolver true antes de las 17:00,
 * o la evaluación del saldo ocurre de forma independiente al horario en createOrder.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
    shouldRestrictOrdersByVesBalance,
    isOrderBalanceRestrictionActive,
    ORDER_BALANCE_RESTRICTION_HOUR,
} from './constants';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Crea un objeto Date para una hora específica del día (hora local del sistema).
 * Usamos UTC para evitar ambigüedades de zona horaria en el entorno de prueba.
 * La función isOrderBalanceRestrictionActive convierte a hora Chile internamente.
 *
 * Para simular una hora en Chile, construimos una fecha cuya conversión
 * a America/Santiago resulte en la hora deseada. Chile es UTC-3 en horario
 * de verano y UTC-4 en horario de invierno. Usamos un offset conservador
 * para garantizar que la hora Chile caiga antes de las 17:00 en todos los
 * casos del rango 0-16.
 */
function makeDateAtChileHour(chileHour: number): Date {
    // Usamos una fecha fija en horario de invierno: Chile = UTC-3 (DST) o UTC-4
    // Elegimos una fecha de febrero (verano austral, Chile en UTC-3).
    // Si queremos que la hora Chile sea chileHour, necesitamos UTC = chileHour + 3.
    const utcHour = chileHour + 3; // Chile DST offset (febrero: UTC-3)
    const date = new Date(Date.UTC(2024, 1, 15, utcHour, 0, 0, 0)); // 15 Feb 2024
    return date;
}

// ---------------------------------------------------------------------------
// Tests de exploración de condición de bug
// ---------------------------------------------------------------------------

describe('Bug Condition Exploration: Pedidos antes de las 17:00 con saldo <= 0', () => {

    // -----------------------------------------------------------------------
    // Test 1: shouldRestrictOrdersByVesBalance debe devolver false antes de las 17:00
    // -----------------------------------------------------------------------
    describe('shouldRestrictOrdersByVesBalance(role, now) cuando now < 17:00', () => {

        it('devuelve false para role=seller a las 10:00 (BUG CONDITION)', () => {
            const now = makeDateAtChileHour(10);
            const result = shouldRestrictOrdersByVesBalance('seller', now);
            // Comportamiento esperado: false (no debe restringir antes de las 17:00)
            // Si este assert falla → la función devuelve true → el bug está activo
            expect(result).toBe(false);
        });

        it('devuelve false para role=client a las 16:59 (BUG CONDITION)', () => {
            const now = makeDateAtChileHour(16);
            const result = shouldRestrictOrdersByVesBalance('client', now);
            expect(result).toBe(false);
        });

        it('devuelve false para role=seller a las 08:00 (BUG CONDITION)', () => {
            const now = makeDateAtChileHour(8);
            const result = shouldRestrictOrdersByVesBalance('seller', now);
            expect(result).toBe(false);
        });

        it('devuelve false para role=seller a las 00:00 (BUG CONDITION)', () => {
            const now = makeDateAtChileHour(0);
            const result = shouldRestrictOrdersByVesBalance('seller', now);
            expect(result).toBe(false);
        });

        it('devuelve false para role=client a las 12:00 (BUG CONDITION)', () => {
            const now = makeDateAtChileHour(12);
            const result = shouldRestrictOrdersByVesBalance('client', now);
            expect(result).toBe(false);
        });
    });

    // -----------------------------------------------------------------------
    // Test 2: isOrderBalanceRestrictionActive debe devolver false antes de las 17:00
    // -----------------------------------------------------------------------
    describe('isOrderBalanceRestrictionActive(now) cuando now < 17:00 Chile', () => {

        it('devuelve false a las 10:00 hora Chile', () => {
            const now = makeDateAtChileHour(10);
            expect(isOrderBalanceRestrictionActive(now)).toBe(false);
        });

        it('devuelve false a las 16:59 hora Chile', () => {
            const now = makeDateAtChileHour(16);
            expect(isOrderBalanceRestrictionActive(now)).toBe(false);
        });

        it('devuelve true a las 17:00 hora Chile (preservación)', () => {
            const now = makeDateAtChileHour(17);
            expect(isOrderBalanceRestrictionActive(now)).toBe(true);
        });

        it('devuelve true a las 18:00 hora Chile (preservación)', () => {
            const now = makeDateAtChileHour(18);
            expect(isOrderBalanceRestrictionActive(now)).toBe(true);
        });
    });

    // -----------------------------------------------------------------------
    // Test 3: Property-based — para TODO hora < 17:00, shouldRestrictOrdersByVesBalance
    // debe devolver false para seller y client (isBugCondition es verdadero)
    // -----------------------------------------------------------------------
    describe('Property 1 (Bug Condition) — PBT: shouldRestrictOrdersByVesBalance = false para hora < 17:00', () => {

        /**
         * **Validates: Requirements 1.1, 1.2, 1.3**
         *
         * Para cualquier hora Chile en el rango [0, 16] (antes de las 17:00),
         * shouldRestrictOrdersByVesBalance debe devolver false para roles seller y client.
         *
         * Este es el comportamiento correcto — el sistema NO debe activar la
         * restricción de saldo antes de las 17:00.
         *
         * Si esta propiedad FALLA en el código sin corregir, confirma el bug.
         */
        it('property: seller y client nunca restringidos antes de las 17:00', () => {
            fc.assert(
                fc.property(
                    // hora Chile antes de las 17:00: [0, 16]
                    fc.integer({ min: 0, max: 16 }),
                    // rol elegible para la restricción
                    fc.constantFrom('seller', 'client'),
                    (chileHour, role) => {
                        const now = makeDateAtChileHour(chileHour);
                        const result = shouldRestrictOrdersByVesBalance(role, now);
                        // La propiedad: debe ser false (no restringir) antes de las 17:00
                        return result === false;
                    }
                ),
                { numRuns: 100 }
            );
        });

        /**
         * Preservación: seller y client SÍ deben ser restringidos a las 17:00+
         * (este test debe PASAR tanto antes como después del fix)
         */
        it('property (preservación): seller y client restringidos a partir de las 17:00', () => {
            fc.assert(
                fc.property(
                    // hora Chile >= 17: [17, 23]
                    fc.integer({ min: 17, max: 23 }),
                    fc.constantFrom('seller', 'client'),
                    (chileHour, role) => {
                        const now = makeDateAtChileHour(chileHour);
                        const result = shouldRestrictOrdersByVesBalance(role, now);
                        // A las 17:00+ debe devolver true (restricción activa)
                        return result === true;
                    }
                ),
                { numRuns: 100 }
            );
        });
    });

    // -----------------------------------------------------------------------
    // Test 4: Casos concretos del diseño — escenarios de isBugCondition
    // -----------------------------------------------------------------------
    describe('Casos concretos del diseño (bug condition examples)', () => {

        it('caso 1: seller, saldo=0, hora=10:00 → restricción NO activa (no debe bloquear)', () => {
            // shouldRestrictOrdersByVesBalance controla si se evalúa el saldo
            // Si devuelve false → el balance check se saltea → pedido permitido
            const now = makeDateAtChileHour(10);
            const shouldEnforce = shouldRestrictOrdersByVesBalance('seller', now);
            expect(shouldEnforce).toBe(false);

            // Simulación del chequeo de saldo en createOrder (sin Firebase):
            // if (shouldEnforce && saldo < monto) → throw "Saldo VES insuficiente"
            const availableVesBalance = 0;
            const destinationAmount = 500; // monto > 0
            const wouldThrow = shouldEnforce && destinationAmount > availableVesBalance;
            expect(wouldThrow).toBe(false); // NO debe lanzar error
        });

        it('caso 2: client, saldo=-50, hora=16:59 → restricción NO activa (no debe bloquear)', () => {
            const now = makeDateAtChileHour(16);
            const shouldEnforce = shouldRestrictOrdersByVesBalance('client', now);
            expect(shouldEnforce).toBe(false);

            const availableVesBalance = -50;
            const destinationAmount = 100;
            const wouldThrow = shouldEnforce && destinationAmount > availableVesBalance;
            expect(wouldThrow).toBe(false);
        });

        it('caso 3: seller, saldo=0, hora=08:00 → restricción NO activa (no debe bloquear)', () => {
            const now = makeDateAtChileHour(8);
            const shouldEnforce = shouldRestrictOrdersByVesBalance('seller', now);
            expect(shouldEnforce).toBe(false);

            const availableVesBalance = 0;
            const destinationAmount = 1000;
            const wouldThrow = shouldEnforce && destinationAmount > availableVesBalance;
            expect(wouldThrow).toBe(false);
        });

        it('preservación: seller, saldo=0, hora=17:00 → restricción SÍ activa (debe bloquear)', () => {
            const now = makeDateAtChileHour(17);
            const shouldEnforce = shouldRestrictOrdersByVesBalance('seller', now);
            expect(shouldEnforce).toBe(true);

            const availableVesBalance = 0;
            const destinationAmount = 500;
            const wouldThrow = shouldEnforce && destinationAmount > availableVesBalance;
            expect(wouldThrow).toBe(true); // SÍ debe lanzar error (comportamiento correcto)
        });
    });

    // -----------------------------------------------------------------------
    // Test 5: Verificar el valor de ORDER_BALANCE_RESTRICTION_HOUR
    // -----------------------------------------------------------------------
    it('ORDER_BALANCE_RESTRICTION_HOUR es 17', () => {
        expect(ORDER_BALANCE_RESTRICTION_HOUR).toBe(17);
    });
});
