import { useState, useCallback } from 'react';
import { doc, collection, serverTimestamp, runTransaction, Transaction } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { VesAccount } from './useVesAccounts';

interface BalanceOperationParams {
    type: 'add' | 'subtract';
    amount: number;
    holder: string;
    bank: string;
    note: string;
    clpRate: number;
}

/**
 * Hook para operaciones de balance: cargar o restar fondos de una cuenta VES.
 * Actualiza: accounts, balance_history, config/rate (purchaseRateVES), clp_balance_history.
 */
export function useBalanceOperations(accounts: VesAccount[]) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const operate = useCallback(async ({
        type,
        amount,
        holder,
        bank,
        note,
        clpRate,
    }: BalanceOperationParams): Promise<boolean> => {
        setLoading(true);
        setError(null);

        try {
            if (isNaN(amount) || amount <= 0) {
                throw new Error('El monto debe ser un número positivo.');
            }
            if (!holder || !bank) {
                throw new Error('El titular y el banco son obligatorios.');
            }
            if (isNaN(clpRate) || clpRate <= 0) {
                throw new Error('La tasa de compra CLP es requerida.');
            }

            const accountId = `${holder.toUpperCase().replace(/ /g, '_')}_${bank.toUpperCase().replace(/ /g, '_')}`;
            const clpAmount = Math.ceil((amount / clpRate) * 100) / 100;
            const vesIncrement = type === 'add' ? amount : -amount;

            await runTransaction(db, async (transaction: Transaction) => {
                // 1. Read necessary documents
                const accountRef = doc(db, 'accounts', accountId);
                const rateRef = doc(db, 'config', 'rate');

                const accountDoc = await transaction.get(accountRef);

                // Calculate VES Balance After
                const currentBalance = accountDoc.exists() ? accountDoc.data().balance : 0;
                const balanceAfter = currentBalance + vesIncrement;

                // 2. Perform Writes
                const ts = serverTimestamp();

                // Actualizar/crear cuenta VES
                transaction.set(accountRef, {
                    holder,
                    bank,
                    balance: balanceAfter,
                }, { merge: true });

                // Registro en balance_history (VES)
                const balanceHistoryRef = doc(collection(db, 'balance_history'));
                transaction.set(balanceHistoryRef, {
                    amount,
                    type,
                    holder,
                    bank,
                    note,
                    timestamp: ts,
                    balanceAfter,
                });

                // Regla de negocio: la tasa mayorista se fija al cargar VES.
                // En "subtract" no se debe pisar purchaseRateVES.
                const rateUpdate: Record<string, any> = {};
                if (type === 'add') {
                    rateUpdate.purchaseRateVES = clpRate;
                }
                if (Object.keys(rateUpdate).length > 0) {
                    transaction.update(rateRef, rateUpdate);
                }

                // Registro en clp_balance_history (solo para 'add')
                if (type === 'add') {
                    const clpHistoryRef = doc(collection(db, 'clp_balance_history'));
                    transaction.set(clpHistoryRef, {
                        amount: clpAmount,
                        type: 'add',
                        note: `Carga de saldo (Equivalente a ${amount.toLocaleString('es-VE')} VES)`,
                        description: `Carga de saldo (Equivalente a ${amount.toLocaleString('es-VE')} VES)`,
                        purchaseRateVESUsed: clpRate,
                        vesAmountAtCalc: amount,
                        clpAmountComputed: clpAmount,
                        timestamp: ts,
                        createdAt: ts,
                        adminTag: 'ADMIN',
                        bank: bank
                    });
                }
            });

            setLoading(false);
            return true;
        } catch (err: any) {
            setError(err.message);
            setLoading(false);
            return false;
        }
    }, [accounts]);

    return { operate, loading, error, clearError: () => setError(null) };
}
