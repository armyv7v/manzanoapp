import { describe, it, expect } from 'vitest';
import {
    ADMIN_COMMISSION_RATE,
    TILLO_COMMISSION_RATE,
    computeOrderTotalWithCommissions,
    computeInterbankFee,
} from './constants';

// ---------------------------------------------------------------------------
// Unit tests — computeOrderTotalWithCommissions
// Validates: Requirements 2.1, 2.4
// ---------------------------------------------------------------------------

describe('computeOrderTotalWithCommissions', () => {

    // -----------------------------------------------------------------------
    // Montos típicos
    // -----------------------------------------------------------------------

    it('calcula correctamente para un monto típico de 100 VES', () => {
        const result = computeOrderTotalWithCommissions(100);
        // adminCommission = ceil(100 * 0.01 * 100) / 100 = ceil(100) / 100 = 1.00
        // tilloCommission = ceil(100 * 0.0015 * 100) / 100 = ceil(15) / 100 = 0.15
        // total = 100 + 1 + 0.15 = 101.15
        expect(result.adminCommission).toBe(1.00);
        expect(result.tilloCommission).toBe(0.15);
        expect(result.totalConComisiones).toBe(101.15);
    });

    it('calcula correctamente para un monto de 50 VES', () => {
        const result = computeOrderTotalWithCommissions(50);
        // adminCommission = ceil(50 * 0.01 * 100) / 100 = ceil(50) / 100 = 0.50
        // tilloCommission = ceil(50 * 0.0015 * 100) / 100 = ceil(7.5) / 100 = 0.08
        // total = 50 + 0.50 + 0.08 = 50.58
        expect(result.adminCommission).toBe(0.50);
        expect(result.tilloCommission).toBe(0.08);
        expect(result.totalConComisiones).toBe(50.58);
    });

    it('calcula correctamente para un monto de 200 VES', () => {
        const result = computeOrderTotalWithCommissions(200);
        // adminCommission = ceil(200 * 0.01 * 100) / 100 = ceil(200) / 100 = 2.00
        // tilloCommission = ceil(200 * 0.0015 * 100) / 100 = ceil(30) / 100 = 0.30
        // total = 200 + 2.00 + 0.30 = 202.30
        expect(result.adminCommission).toBe(2.00);
        expect(result.tilloCommission).toBe(0.30);
        expect(result.totalConComisiones).toBe(202.30);
    });

    // -----------------------------------------------------------------------
    // Edge case: monto = 0
    // -----------------------------------------------------------------------

    it('retorna ceros para monto = 0', () => {
        const result = computeOrderTotalWithCommissions(0);
        expect(result.adminCommission).toBe(0);
        expect(result.tilloCommission).toBe(0);
        expect(result.totalConComisiones).toBe(0);
    });

    // -----------------------------------------------------------------------
    // Edge case: montos muy pequeños (el redondeo ceil cobra comisión mínima)
    // -----------------------------------------------------------------------

    it('aplica redondeo ceil en montos muy pequeños — 1 VES', () => {
        const result = computeOrderTotalWithCommissions(1);
        // adminCommission = ceil(1 * 0.01 * 100) / 100 = ceil(1) / 100 = 0.01
        // tilloCommission = ceil(1 * 0.0015 * 100) / 100 = ceil(0.15) / 100 = 0.01
        // total = 1 + 0.01 + 0.01 = 1.02
        expect(result.adminCommission).toBe(0.01);
        expect(result.tilloCommission).toBe(0.01);
        expect(result.totalConComisiones).toBeCloseTo(1.02, 10);
    });

    it('aplica redondeo ceil en montos muy pequeños — 0.01 VES', () => {
        const result = computeOrderTotalWithCommissions(0.01);
        // adminCommission = ceil(0.01 * 0.01 * 100) / 100 = ceil(0.01) / 100 = 0.01
        // tilloCommission = ceil(0.01 * 0.0015 * 100) / 100 = ceil(0.0015) / 100 = 0.01
        expect(result.adminCommission).toBe(0.01);
        expect(result.tilloCommission).toBe(0.01);
    });

    // -----------------------------------------------------------------------
    // Edge case: montos grandes
    // -----------------------------------------------------------------------

    it('calcula correctamente para un monto grande de 10 000 VES', () => {
        const result = computeOrderTotalWithCommissions(10_000);
        // adminCommission = ceil(10000 * 0.01 * 100) / 100 = 100.00
        // tilloCommission = ceil(10000 * 0.0015 * 100) / 100 = 15.00
        // total = 10 000 + 100 + 15 = 10 115.00
        expect(result.adminCommission).toBe(100.00);
        expect(result.tilloCommission).toBe(15.00);
        expect(result.totalConComisiones).toBe(10_115.00);
    });

    it('calcula correctamente para un monto grande de 1 000 000 VES', () => {
        const result = computeOrderTotalWithCommissions(1_000_000);
        expect(result.adminCommission).toBe(10_000.00);
        expect(result.tilloCommission).toBe(1_500.00);
        expect(result.totalConComisiones).toBe(1_011_500.00);
    });

    // -----------------------------------------------------------------------
    // Edge case: totalConComisiones === availableVesBalance no debe bloquear
    // (condición estricta ">", no ">=")
    // La función solo calcula el total; la condición de bloqueo es responsabilidad
    // del consumidor (OrderForm / useCreateOrder). Verificamos que el total
    // calculado es exactamente igual al saldo en el caso límite para que el
    // consumidor pueda usar ">" sin bloquear.
    // -----------------------------------------------------------------------

    it('edge case límite: totalConComisiones igual al saldo disponible no debe superar el saldo', () => {
        // Con destinationAmount=100, totalConComisiones=101.15
        // Si availableVesBalance=101.15, la condición (total > saldo) es false → no bloquea
        const { totalConComisiones } = computeOrderTotalWithCommissions(100);
        const availableVesBalance = 101.15;
        expect(totalConComisiones).toBe(availableVesBalance);
        expect(totalConComisiones > availableVesBalance).toBe(false); // no debe bloquear
    });

    // -----------------------------------------------------------------------
    // Verificación de las tasas exportadas
    // -----------------------------------------------------------------------

    it('las constantes de tasa tienen los valores correctos', () => {
        expect(ADMIN_COMMISSION_RATE).toBe(0.01);
        expect(TILLO_COMMISSION_RATE).toBe(0.0015);
    });

    // -----------------------------------------------------------------------
    // Invariante: totalConComisiones siempre es >= destinationAmount
    // -----------------------------------------------------------------------

    it('totalConComisiones es siempre mayor o igual al monto base', () => {
        const amounts = [0, 0.01, 1, 50, 100, 1_000, 99_999.99];
        for (const amount of amounts) {
            const { totalConComisiones } = computeOrderTotalWithCommissions(amount);
            expect(totalConComisiones).toBeGreaterThanOrEqual(amount);
        }
    });
});

describe('computeInterbankFee', () => {
    it('retorna 0 para montos invalidos o <= 0', () => {
        expect(computeInterbankFee(0)).toBe(0);
        expect(computeInterbankFee(-50)).toBe(0);
        expect(computeInterbankFee(NaN)).toBe(0);
    });

    it('aplica comision minima de 14 VES para transacciones menores a 4600 VES', () => {
        expect(computeInterbankFee(10)).toBe(14);
        expect(computeInterbankFee(100)).toBe(14);
        expect(computeInterbankFee(1000)).toBe(14);
        expect(computeInterbankFee(4599)).toBe(14);
    });

    it('aplica 0.30% a partir de 4600 VES (con minimo de 14 VES)', () => {
        expect(computeInterbankFee(4600)).toBe(14);
        expect(computeInterbankFee(5000)).toBe(15); // 5000 * 0.003 = 15.00
        expect(computeInterbankFee(10000)).toBe(30); // 10000 * 0.003 = 30.00
    });
});
