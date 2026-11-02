/**
 * Test de regresión — Bug de validación de saldo sin comisiones — Tarea 1
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4
 *
 * HISTORIA: este archivo nació como "test de exploración de condición del
 * bug": replicaba la lógica vieja (comparaba solo destinationAmount) y debía
 * FALLAR para confirmar que el bug existía. El bug fue corregido en
 * producción (useCreateOrder y el panel de OrderForm ahora comparan
 * totalConComisiones), así que hoy es un TEST DE REGRESIÓN: replica la
 * lógica CORREGIDA y verifica que detecta el déficit real.
 *
 * Bug (corregido): la validación de saldo comparaba únicamente
 * `destinationAmount` contra el saldo disponible, ignorando las comisiones
 * proyectadas (adminCommission 1% + tilloCommission 0.15%).
 *
 * Archivos corregidos:
 *   - src-react/src/screens/OrderForm.tsx   → panel usa totalConComisiones
 *   - src-react/src/hooks/useCreateOrder.ts → chequea totalConComisiones
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { computeOrderTotalWithCommissions } from './constants';

// ---------------------------------------------------------------------------
// Helpers: lógica de cálculo (comisiones via la fuente única en constants.ts)
// ---------------------------------------------------------------------------

/** Calcula el monto base en VES igual que OrderForm/useCreateOrder */
function calcDestinationAmount(clpAmount: number, tasaVES: number): number {
  return Math.ceil(clpAmount * tasaVES * 100) / 100;
}

/** Comisiones proyectadas con la MISMA fórmula que producción (ceil por comisión) */
function calcCommissions(destinationAmount: number) {
  return computeOrderTotalWithCommissions(destinationAmount);
}

// ---------------------------------------------------------------------------
// Lógica CORREGIDA — replicada de los archivos fuente ya arreglados
// ---------------------------------------------------------------------------

/**
 * Replica la lógica CORREGIDA de `vesShortfallVisible` en OrderForm.tsx:
 * ahora compara totalConComisiones contra el saldo.
 */
function vesShortfallVisible_fixed(
  totalConComisiones: number,
  safeAvailableVesBalance: number
): boolean {
  return totalConComisiones > 0 && totalConComisiones > safeAvailableVesBalance;
}

/**
 * Replica la lógica CORREGIDA de la validación de saldo en useCreateOrder.ts:
 * totalConComisiones redondeado a 2 decimales > saldo → lanza error.
 * Retorna true si el código lanzaría el error (bloquea el pedido).
 */
function createOrder_wouldThrow_fixed(
  clpAmount: number,
  tasaVES: number,
  availableVesBalance: number
): boolean {
  const destinationAmount = calcDestinationAmount(clpAmount, tasaVES);
  const { totalConComisiones } = calcCommissions(destinationAmount);
  const totalRounded = Math.round(totalConComisiones * 100) / 100;
  const roundedAvailable = Math.round(availableVesBalance * 100) / 100;
  return totalRounded > roundedAvailable;
}

// ---------------------------------------------------------------------------
// Función de condición del bug (del diseño)
// ---------------------------------------------------------------------------

interface PedidoInput {
  clpAmount: number;
  tasaVES: number;
  availableVesBalance: number;
  role: 'seller' | 'client';
}

function isBugCondition(x: PedidoInput): boolean {
  const destinationAmount = calcDestinationAmount(x.clpAmount, x.tasaVES);
  const { totalConComisiones } = calcCommissions(destinationAmount);
  return (
    (x.role === 'seller' || x.role === 'client') &&
    destinationAmount <= x.availableVesBalance &&
    totalConComisiones > x.availableVesBalance
  );
}

// ---------------------------------------------------------------------------
// Suite de tests
// ---------------------------------------------------------------------------

describe('Regresión — Validación de saldo incluye comisiones proyectadas', () => {

  // -------------------------------------------------------------------------
  // Test unitario mínimo (caso concreto del diseño)
  // -------------------------------------------------------------------------

  describe('Caso concreto mínimo: clpAmount=1, tasaVES=100, availableVesBalance=100.10', () => {
    const clpAmount          = 1;
    const tasaVES            = 100;
    const availableVesBalance = 100.10;

    const destinationAmount  = calcDestinationAmount(clpAmount, tasaVES);    // 100.00
    const { adminCommission, tilloCommission, totalConComisiones } = calcCommissions(destinationAmount);
    // adminCommission = 1.00, tilloCommission = 0.15, totalConComisiones = 101.15

    it('isBugCondition es verdadero para este input', () => {
      expect(isBugCondition({ clpAmount, tasaVES, availableVesBalance, role: 'seller' })).toBe(true);
    });

    it('destinationAmount (100.00) está DENTRO del saldo disponible (100.10)', () => {
      expect(destinationAmount).toBe(100.00);
      expect(destinationAmount).toBeLessThanOrEqual(availableVesBalance);
    });

    it('totalConComisiones (101.15) SUPERA el saldo disponible (100.10)', () => {
      expect(adminCommission).toBe(1.00);
      expect(tilloCommission).toBe(0.15);
      expect(totalConComisiones).toBe(101.15);
      expect(totalConComisiones).toBeGreaterThan(availableVesBalance);
    });

    it('[FIX] vesShortfallVisible detecta el déficit real (retorna true)', () => {
      const actual = vesShortfallVisible_fixed(totalConComisiones, availableVesBalance);
      expect(actual).toBe(true);
    });

    it('[FIX] createOrder lanza "Saldo VES insuficiente" cuando el total supera el saldo', () => {
      const wouldThrow = createOrder_wouldThrow_fixed(clpAmount, tasaVES, availableVesBalance);
      expect(wouldThrow).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Test unitario — Ejemplo 2 del diseño
  // -------------------------------------------------------------------------

  describe('Caso concreto 2: clpAmount=5000, tasaVES=0.02, availableVesBalance=100.50', () => {
    const clpAmount           = 5000;
    const tasaVES             = 0.02;
    const availableVesBalance = 100.50;

    const destinationAmount = calcDestinationAmount(clpAmount, tasaVES);      // 100.00
    const { totalConComisiones } = calcCommissions(destinationAmount);         // 101.15

    it('isBugCondition es verdadero para este input', () => {
      expect(isBugCondition({ clpAmount, tasaVES, availableVesBalance, role: 'client' })).toBe(true);
    });

    it('[FIX] vesShortfallVisible detecta el déficit real (retorna true)', () => {
      const actual = vesShortfallVisible_fixed(totalConComisiones, availableVesBalance);
      expect(actual).toBe(true);
    });

    it('[FIX] createOrder lanza error de saldo insuficiente', () => {
      const wouldThrow = createOrder_wouldThrow_fixed(clpAmount, tasaVES, availableVesBalance);
      expect(wouldThrow).toBe(true);
    });

    it('destinationAmount (100.00) <= saldo (100.50) pero totalConComisiones (101.15) > saldo', () => {
      expect(destinationAmount).toBeLessThanOrEqual(availableVesBalance);
      expect(totalConComisiones).toBeGreaterThan(availableVesBalance);
    });
  });

  // -------------------------------------------------------------------------
  // Test unitario — Edge case: comisión en el límite exacto
  // -------------------------------------------------------------------------

  describe('Edge case: destinationAmount=100.00, availableVesBalance=101.14 (1 céntimo por debajo del total real)', () => {
    const clpAmount           = 1;
    const tasaVES             = 100;
    const availableVesBalance = 101.14; // totalConComisiones = 101.15 > 101.14

    const destinationAmount = calcDestinationAmount(clpAmount, tasaVES);       // 100.00
    const { totalConComisiones } = calcCommissions(destinationAmount);          // 101.15

    it('isBugCondition es verdadero para este input de borde', () => {
      expect(isBugCondition({ clpAmount, tasaVES, availableVesBalance, role: 'seller' })).toBe(true);
    });

    it('[FIX] vesShortfallVisible detecta el déficit de 1 céntimo', () => {
      const actual = vesShortfallVisible_fixed(totalConComisiones, availableVesBalance);
      expect(actual).toBe(true);
    });

    it('totalConComisiones (101.15) supera saldo (101.14) por exactamente 0.01', () => {
      expect(totalConComisiones - availableVesBalance).toBeCloseTo(0.01, 2);
    });
  });

  // -------------------------------------------------------------------------
  // Property-Based Test (fast-check) — Propiedad 1: el déficit real se detecta
  //
  // Para todo input X donde isBugCondition(X) es verdadero, la lógica CORREGIDA
  // debe mostrar el déficit (vesShortfallVisible=true) y bloquear el pedido
  // (createOrder lanza error).
  //
  // Validates: Requirements 1.1, 1.2, 1.3, 1.4
  // -------------------------------------------------------------------------

  describe('PBT — Property 1: Bug Condition (fast-check)', () => {
    /**
     * Generador de inputs donde isBugCondition(X) es verdadero.
     *
     * Estrategia:
     *   1. Generamos clpAmount (entero 1..100_000) y tasaVES (double 0.001..1000)
     *   2. Calculamos destinationAmount y totalConComisiones
     *   3. Elegimos availableVesBalance en el rango [destinationAmount, totalConComisiones - 0.01]
     *      para garantizar la condición del bug (pasos de 0.01, dominio de 2 decimales).
     *
     * NOTA fast-check v3: se usa fc.double (no fc.float) porque v3 exige que
     * los bounds de fc.float sean floats de 32 bits (Math.fround).
     */
    const bugConditionArbitrary = fc
      .tuple(
        fc.integer({ min: 1, max: 100_000 }),
        fc.double({ min: 0.001, max: 1000, noNaN: true }),
        fc.constantFrom<'seller' | 'client'>('seller', 'client')
      )
      .chain(([clpAmount, tasaVES, role]) => {
        const destinationAmount = calcDestinationAmount(clpAmount, tasaVES);
        const { totalConComisiones } = calcCommissions(destinationAmount);

        // La diferencia entre totalConComisiones y destinationAmount debe ser > 0
        // para que exista un rango válido de availableVesBalance
        if (totalConComisiones <= destinationAmount) {
          // Caso degenerado (destinationAmount=0): devolvemos un input que no activa la condición
          // pero que el test filtrará con fc.pre
          return fc.constant({ clpAmount: 0, tasaVES, availableVesBalance: 0, role } as PedidoInput);
        }

        // availableVesBalance ∈ [destinationAmount, totalConComisiones - 0.01]
        // usando pasos de 0.01 para mantenernos en el dominio de 2 decimales
        const minBal = destinationAmount;
        const maxBal = totalConComisiones - 0.01;

        if (maxBal < minBal) {
          return fc.constant({ clpAmount: 0, tasaVES, availableVesBalance: 0, role } as PedidoInput);
        }

        return fc
          .integer({ min: Math.round(minBal * 100), max: Math.round(maxBal * 100) })
          .map(balCents => ({
            clpAmount,
            tasaVES,
            availableVesBalance: balCents / 100,
            role,
          } as PedidoInput));
      });

    /**
     * Propiedad: Para todo X donde isBugCondition(X) sea verdadero,
     * la lógica CORREGIDA de vesShortfallVisible retorna true (déficit visible).
     */
    it('[FIX PBT] vesShortfallVisible_fixed siempre detecta el déficit para inputs de bug-condition', () => {
      fc.assert(
        fc.property(bugConditionArbitrary, (input) => {
          fc.pre(isBugCondition(input)); // filtrar inputs degenerados

          const destinationAmount = calcDestinationAmount(input.clpAmount, input.tasaVES);
          const { totalConComisiones } = calcCommissions(destinationAmount);
          const actual = vesShortfallVisible_fixed(totalConComisiones, input.availableVesBalance);

          return actual === true;
        }),
        { numRuns: 500, seed: 42 }
      );
    });

    /**
     * Propiedad: Para todo X donde isBugCondition(X) sea verdadero,
     * la lógica CORREGIDA de createOrder lanza el error de saldo insuficiente.
     */
    it('[FIX PBT] createOrder_fixed lanza error para inputs de bug-condition', () => {
      fc.assert(
        fc.property(bugConditionArbitrary, (input) => {
          fc.pre(isBugCondition(input)); // filtrar inputs degenerados

          const wouldThrow = createOrder_wouldThrow_fixed(
            input.clpAmount,
            input.tasaVES,
            input.availableVesBalance
          );

          return wouldThrow === true;
        }),
        { numRuns: 500, seed: 42 }
      );
    });
  });
});
