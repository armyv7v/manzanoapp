import { useState, useMemo } from 'react';
import { ArrowRightLeft, X, AlertTriangle } from 'lucide-react';
import { Button } from '../components/ui';
import { useTransferFunds } from '../hooks/useTransferFunds';
import { useToast } from '../contexts/ToastContext';
import { normalizeBankName, computeInterbankFee } from '../lib/constants';
import { isPayoutAccount, isSourceAccount, type VesAccount } from '../hooks/useVesAccounts';

interface Props {
    accounts: VesAccount[];
    onClose: () => void;
}

export function TransferFundsModal({ accounts, onClose }: Props) {
    const [fromId, setFromId] = useState('');
    const [toId, setToId] = useState('');
    const [amount, setAmount] = useState('');
    const { transfer, loading } = useTransferFunds();
    const toast = useToast();

    const fromAccount = accounts.find(a => a.id === fromId);
    const toAccount = accounts.find(a => a.id === toId);
    const parsedAmount = parseFloat(amount) || 0;
    const sourceAccounts = accounts.filter(acc => acc.balance > 0);
    const payoutAccounts = accounts.filter(isPayoutAccount);

    // Calcular comisión en tiempo real
    const feeInfo = useMemo(() => {
        if (!fromAccount || !toAccount || fromId === toId || parsedAmount <= 0) {
            return null;
        }
        const fromBank = normalizeBankName(fromAccount.bank);
        const toBank = normalizeBankName(toAccount.bank);
        const fee = fromBank !== toBank ? computeInterbankFee(parsedAmount) : 0;
        const totalDebit = parsedAmount + fee;
        return { fee, totalDebit, isInterbank: fee > 0 };
    }, [fromAccount, toAccount, fromId, toId, parsedAmount]);

    const canSubmit = fromId && toId && fromId !== toId && parsedAmount > 0 && !loading;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!fromAccount || !toAccount) return;

        const result = await transfer({ fromAccount, toAccount, amount: parsedAmount });
        if (result.success) {
            const feeMsg = result.fee > 0 ? ` (comisión: ${result.fee.toFixed(2)} VES)` : '';
            toast.success(`Transferencia de ${parsedAmount.toLocaleString('es-VE', { minimumFractionDigits: 2 })} VES completada${feeMsg}`);
            onClose();
        } else {
            toast.error('Error en la transferencia');
        }
    };

    const fmtBal = (b: number) => b.toLocaleString('es-VE', { minimumFractionDigits: 2 });

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-5 py-4 rounded-t-2xl flex justify-between items-center">
                    <h3 className="text-white font-bold text-base flex items-center gap-2">
                        <ArrowRightLeft className="w-4 h-4" />
                        Transferir Fondos
                    </h3>
                    <button onClick={onClose} className="text-white/70 hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    {/* Desde */}
                    <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Desde la cuenta</label>
                        <select
                            value={fromId}
                            onChange={e => setFromId(e.target.value)}
                            className="mt-1 w-full p-2.5 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                            required
                        >
                            <option value="">Seleccione cuenta origen...</option>
                            {sourceAccounts.map(acc => (
                                <option key={acc.id} value={acc.id}>
                                    {isSourceAccount(acc) ? '[FUENTE] ' : '[PAGADORA] '}{acc.holder} - {acc.bank}{acc.accountLast4 ? ` ****${acc.accountLast4}` : ''} ({fmtBal(acc.balance)} VES)
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Hacia */}
                    <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Hacia la cuenta</label>
                        <select
                            value={toId}
                            onChange={e => setToId(e.target.value)}
                            className="mt-1 w-full p-2.5 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                            required
                        >
                            <option value="">Seleccione cuenta pagadora...</option>
                            {payoutAccounts.map(acc => (
                                <option key={acc.id} value={acc.id} disabled={acc.id === fromId}>
                                    [PAGADORA] {acc.holder} - {acc.bank}{acc.accountLast4 ? ` ****${acc.accountLast4}` : ''} ({fmtBal(acc.balance)} VES)
                                </option>
                            ))}
                        </select>
                    </div>

                    {sourceAccounts.length === 0 && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
                            No hay cuentas con saldo disponible para transferir fondos.
                        </div>
                    )}

                    {/* Monto */}
                    <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Monto a Transferir (VES)</label>
                        <input
                            type="number"
                            step="0.01"
                            value={amount}
                            onChange={e => setAmount(e.target.value)}
                            placeholder="Ej: 50000"
                            className="mt-1 w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                            required
                        />
                    </div>

                    {/* Info de comisión */}
                    {feeInfo && feeInfo.isInterbank && (
                        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
                            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                            <div>
                                <p className="font-semibold">Comisión interbancaria: {fmtBal(feeInfo.fee)} VES</p>
                                <p className="text-xs mt-0.5">Total a debitar: <span className="font-bold">{fmtBal(feeInfo.totalDebit)} VES</span></p>
                            </div>
                        </div>
                    )}

                    {/* Saldo insuficiente */}
                    {fromAccount && feeInfo && fromAccount.balance < feeInfo.totalDebit && (
                        <p className="text-xs text-red-500 font-medium">⚠️ Saldo insuficiente en la cuenta de origen.</p>
                    )}

                    {/* Submit */}
                    <Button
                        type="submit"
                        disabled={!canSubmit || (feeInfo ? fromAccount!.balance < feeInfo.totalDebit : false)}
                        className="w-full"
                    >
                        {loading ? 'Procesando...' : 'Confirmar Transferencia'}
                    </Button>
                </form>
            </div>
        </div>
    );
}
