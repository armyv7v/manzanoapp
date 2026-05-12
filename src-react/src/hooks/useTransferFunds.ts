import { useState, useCallback } from 'react';
import { doc, writeBatch, collection, increment, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { normalizeBankName, computeInterbankFee } from '../lib/constants';
import { isPayoutAccount, type VesAccount } from './useVesAccounts';

interface TransferParams {
    fromAccount: VesAccount;
    toAccount: VesAccount;
    amount: number;
}

interface TransferResult {
    success: boolean;
    fee: number;
    totalDebit: number;
}

/**
 * Hook para transferir fondos entre cuentas VES internas.
 * Usa batch writes para atomicidad.
 */
export function useTransferFunds() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const transfer = useCallback(async ({
        fromAccount,
        toAccount,
        amount,
    }: TransferParams): Promise<TransferResult> => {
        setLoading(true);
        setError(null);

        try {
            // Validaciones
            if (fromAccount.id === toAccount.id) {
                throw new Error('Las cuentas de origen y destino deben ser diferentes.');
            }
            if (isNaN(amount) || amount <= 0) {
                throw new Error('El monto debe ser un número positivo.');
            }
            if (!isPayoutAccount(toAccount)) {
                throw new Error('La cuenta de destino debe ser una cuenta pagadora.');
            }

            // Calcular comisión interbancaria
            const fromBank = normalizeBankName(fromAccount.bank);
            const toBank = normalizeBankName(toAccount.bank);
            const fee = fromBank !== toBank ? computeInterbankFee(amount) : 0;
            const totalDebit = amount + fee;

            if (fromAccount.balance < totalDebit) {
                throw new Error('Saldo insuficiente en la cuenta de origen para cubrir el monto y la comisión.');
            }

            const batch = writeBatch(db);
            const ts = serverTimestamp();

            // Calcular saldos post-operación
            const fromBalanceAfter = fromAccount.balance - totalDebit;
            const toBalanceAfter = toAccount.balance + amount;

            const fromHolder = fromAccount.holder || 'Sin titular';
            const toHolder = toAccount.holder || 'Sin titular';
            const fromBankName = fromAccount.bank || 'Sin banco';
            const toBankName = toAccount.bank || 'Sin banco';

            // Actualizar saldos
            batch.update(doc(db, 'accounts', fromAccount.id), {
                balance: increment(-totalDebit),
            });
            batch.update(doc(db, 'accounts', toAccount.id), {
                balance: increment(amount),
            });

            // Registro: débito al origen
            batch.set(doc(collection(db, 'balance_history')), {
                amount,
                type: 'subtract',
                note: `Distribucion mayorista a ${toHolder}`,
                timestamp: ts,
                holder: fromHolder,
                bank: fromBankName,
                balanceAfter: fromBalanceAfter,
            });

            // Registro: comisión (si aplica)
            if (fee > 0) {
                batch.set(doc(collection(db, 'balance_history')), {
                    amount: fee,
                    type: 'fee',
                    note: 'Comisión por transferencia interna',
                    timestamp: ts,
                    holder: fromHolder,
                    bank: fromBankName,
                    balanceAfter: fromBalanceAfter,
                });
            }

            // Registro: crédito al destino
            batch.set(doc(collection(db, 'balance_history')), {
                amount,
                type: 'add',
                note: `Abono desde cuenta fuente ${fromHolder}`,
                timestamp: ts,
                holder: toHolder,
                bank: toBankName,
                balanceAfter: toBalanceAfter,
            });

            await batch.commit();

            setLoading(false);
            return { success: true, fee, totalDebit };
        } catch (err: any) {
            setError(err.message);
            setLoading(false);
            return { success: false, fee: 0, totalDebit: 0 };
        }
    }, []);

    return { transfer, loading, error, clearError: () => setError(null) };
}
