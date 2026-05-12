import { useState } from 'react';
import { isSourceAccount, useVesAccounts, useDailyCommissions } from '../hooks';
import { useExchangeRates } from '../hooks/useExchangeRates';
import {
    ArrowLeft, Landmark, User, TrendingUp,
    CircleDollarSign, ArrowRightLeft, Plus, Minus
} from 'lucide-react';
import { BankLogo } from '../components/ui';
import { useNavigation } from '../contexts/NavigationContext';
import { TransferFundsModal } from './TransferFundsModal';
import { BalanceOperationModal } from './BalanceOperationModal';

interface Props {
    onBack?: () => void;
}

export function AccountsScreen({ onBack }: Props = {}) {
    const { goHome } = useNavigation();
    const handleBack = onBack || goHome;
    const { accounts, holders, totalBalance, loading } = useVesAccounts();
    const [selectedDate, setSelectedDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
    const { adminCommission, tilloCommission, bankFees, sellerCommissions, loading: commsLoading } = useDailyCommissions(selectedDate);
    const { rates } = useExchangeRates();

    const [showTransferModal, setShowTransferModal] = useState(false);
    const [balanceOp, setBalanceOp] = useState<{ type: 'add' | 'subtract'; amount: number } | null>(null);
    const [vesInput, setVesInput] = useState('');

    const estimatedClp = rates.purchaseRateVES > 0 ? totalBalance / rates.purchaseRateVES : 0;
    const displayedClpBalance = estimatedClp;
    const sourceAccounts = accounts.filter(isSourceAccount);
    const payoutAccounts = accounts.filter(acc => !isSourceAccount(acc));

    const handleBalanceOp = (type: 'add' | 'subtract') => {
        const amount = parseFloat(vesInput);
        if (isNaN(amount) || amount <= 0) return;
        setBalanceOp({ type, amount });
    };

    return (
        <div className="min-h-screen bg-gray-50">
            <header className="bg-white border-b border-gray-100 sticky top-0 z-50">
                <div className="max-w-900 mx-auto px-4 py-3 flex items-center gap-3">
                    <button onClick={handleBack} className="text-gray-400 hover:text-gray-700 transition-colors">
                        <ArrowLeft className="w-4 h-4" />
                    </button>
                    <h1 className="text-sm font-bold text-gray-800">Saldo y Cuentas VES</h1>
                </div>
            </header>

            <main className="max-w-900 mx-auto px-4 py-6 space-y-5">
                {/* Total Balance Card */}
                <div className="bg-gradient-to-r from-red-600 to-red-800 rounded-2xl p-5 text-white shadow-lg">
                    <div className="flex items-center justify-between mb-3">
                        <div>
                            <p className="text-xs text-red-200 font-medium">Balance Total VES</p>
                            <p className="text-3xl font-bold mt-1">
                                {totalBalance.toLocaleString('es-VE', { minimumFractionDigits: 2 })} <span className="text-lg text-red-200">VES</span>
                            </p>
                        </div>
                        <Landmark className="w-10 h-10 text-red-300/50" />
                    </div>
                    <div className="flex gap-5 mt-2 pt-3 border-t border-red-500/30">
                        <div>
                            <p className="text-[10px] text-red-300">Equivalente CLP</p>
                            <p className="text-sm font-bold">
                                {estimatedClp > 0 ? `$${Math.round(estimatedClp).toLocaleString('es-CL')}` : '—'}
                            </p>
                        </div>
                        <div>
                            <p className="text-[10px] text-red-300">Cuentas</p>
                            <p className="text-sm font-bold">{payoutAccounts.length}</p>
                        </div>
                        <div>
                            <p className="text-[10px] text-red-300">Titulares</p>
                            <p className="text-sm font-bold">{Object.keys(holders).length}</p>
                        </div>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="space-y-3">
                    {/* Transferir entre cuentas */}
                    <button
                        onClick={() => setShowTransferModal(true)}
                        className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-3 rounded-xl font-semibold text-sm shadow-md hover:shadow-lg hover:opacity-95 transition-all active:scale-[0.98]"
                    >
                        <ArrowRightLeft className="w-4 h-4" />
                        Transferir entre Cuentas
                    </button>

                    {/* Cargar / Restar saldo */}
                    <div className="flex gap-2 items-center">
                        <input
                            type="number"
                            step="0.01"
                            value={vesInput}
                            onChange={e => setVesInput(e.target.value)}
                            placeholder="Monto VES"
                            className="flex-1 p-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                        />
                        <button
                            onClick={() => handleBalanceOp('add')}
                            disabled={!vesInput || parseFloat(vesInput) <= 0}
                            className="flex items-center gap-1 bg-green-600 text-white px-4 py-2.5 rounded-xl text-xs font-semibold hover:bg-green-700 disabled:bg-gray-300 transition-colors"
                        >
                            <Plus className="w-3 h-3" /> Cargar
                        </button>
                        <button
                            onClick={() => handleBalanceOp('subtract')}
                            disabled={!vesInput || parseFloat(vesInput) <= 0}
                            className="flex items-center gap-1 bg-red-600 text-white px-4 py-2.5 rounded-xl text-xs font-semibold hover:bg-red-700 disabled:bg-gray-300 transition-colors"
                        >
                            <Minus className="w-3 h-3" /> Restar
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className="text-center py-12 text-gray-400 text-sm animate-pulse">Cargando cuentas...</div>
                ) : (
                    /* Accounts grouped by holder */
                    <>
                        {sourceAccounts.length > 0 && (
                            <section className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <User className="w-4 h-4 text-blue-400" />
                                        <h3 className="text-sm font-bold text-blue-700">Cuenta Fuente Mayorista</h3>
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    {sourceAccounts.map(acc => (
                                        <div key={acc.id} className="bg-blue-50 rounded-xl border border-blue-100 p-3 flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <BankLogo bank={acc.bank} className="w-10 h-10" />
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <p className="text-xs font-semibold text-gray-800">{acc.bank}</p>
                                                        <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">Fuente</span>
                                                    </div>
                                                    <p className="text-[10px] text-gray-500">{acc.holder} · Solo distribucion interna</p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-sm font-bold text-blue-700">
                                                    {acc.balance.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                                                </p>
                                                <p className="text-[9px] text-blue-400">VES</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}

                        {Object.entries(holders)
                        .map(([holder, allAccs]) => [holder, allAccs.filter(a => a.balance > 0 && !isSourceAccount(a))] as const)
                        .filter(([, accs]) => accs.length > 0)
                        .sort(([, a], [, b]) => {
                            const totalA = a.reduce((s, acc) => s + acc.balance, 0);
                            const totalB = b.reduce((s, acc) => s + acc.balance, 0);
                            return totalB - totalA;
                        })
                        .map(([holder, accs]) => {
                            const holderTotal = accs.reduce((s, acc) => s + acc.balance, 0);
                            return (
                                <section key={holder} className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <User className="w-4 h-4 text-gray-400" />
                                            <h3 className="text-sm font-bold text-gray-700">{holder}</h3>
                                        </div>
                                        <span className="text-xs font-bold text-gray-500">
                                            {holderTotal.toLocaleString('es-VE', { minimumFractionDigits: 2 })} VES
                                        </span>
                                    </div>
                                    <div className="space-y-1.5">
                                        {accs
                                            .sort((a, b) => b.balance - a.balance)
                                            .map(acc => (
                                                <div key={acc.id} className="bg-white rounded-xl border border-gray-100 p-3 flex items-center justify-between hover:shadow-sm transition-shadow">
                                                    <div className="flex items-center gap-3">
                                                        <BankLogo bank={acc.bank} className="w-10 h-10" />
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <p className="text-xs font-semibold text-gray-800">{acc.bank}</p>
                                                                <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Pagadora</span>
                                                            </div>
                                                            <p className="text-[10px] text-gray-400">{acc.holder}{acc.accountLast4 ? ` · ****${acc.accountLast4}` : ''}</p>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className={`text-sm font-bold ${acc.balance > 0 ? 'text-gray-800' : 'text-gray-400'}`}>
                                                            {acc.balance.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                                                        </p>
                                                        <p className="text-[9px] text-gray-300">VES</p>
                                                    </div>
                                                </div>
                                            ))}
                                    </div>
                                </section>
                            );
                        })}
                    </>
                )}

                {/* Quick Stats */}
                {!loading && payoutAccounts.length > 0 && (
                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-white rounded-xl border border-gray-100 p-3">
                            <div className="flex items-center justify-between mb-1">
                                <p className="text-[11px] text-gray-400">Cuenta Mayor</p>
                                <TrendingUp className="w-3 h-3 text-green-500" />
                            </div>
                            <p className="text-xs font-bold text-gray-800">{payoutAccounts[0]?.bank}</p>
                            <p className="text-sm font-bold text-green-600">{payoutAccounts[0]?.balance.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</p>
                        </div>
                        <div className="bg-white rounded-xl border border-gray-100 p-3">
                            <div className="flex items-center justify-between mb-1">
                                <p className="text-[11px] text-gray-400">Promedio</p>
                                <CircleDollarSign className="w-3 h-3 text-blue-500" />
                            </div>
                                <p className="text-xs font-bold text-gray-800">por cuenta</p>
                                <p className="text-sm font-bold text-blue-600">
                                    {(payoutAccounts.reduce((sum, acc) => sum + acc.balance, 0) / payoutAccounts.length).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                                </p>
                            </div>
                        </div>
                )}

                {/* Daily Commissions Summary */}
                <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm mt-6">
                    <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between flex-wrap gap-3">
                        <h3 className="font-bold text-gray-800 text-sm">Resumen de Comisiones</h3>
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            max={new Date().toISOString().split('T')[0]}
                            className="text-sm px-3 py-1.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                    </div>
                    {commsLoading ? (
                        <div className="text-center py-6 text-gray-400 text-sm animate-pulse">Cargando comisiones...</div>
                    ) : (
                        <div className="flex flex-col">
                            {/* Breakdown Row 1: Admin */}
                            <div className={`flex justify-between items-center p-3 text-sm ${adminCommission > 0 ? 'bg-purple-100 text-purple-800' : 'bg-gray-50 text-gray-600'}`}>
                                <span className="font-medium">Comisión Admin 1%</span>
                                <span className="font-bold">{adminCommission.toLocaleString('es-VE', { minimumFractionDigits: 2 })} VES</span>
                            </div>

                            {/* Breakdown Row 2: Tillo */}
                            <div className={`flex justify-between items-center p-3 text-sm ${tilloCommission > 0 ? 'bg-pink-100 text-pink-800' : 'bg-gray-50 text-gray-600'}`}>
                                <span className="font-medium">Mano Tillo 0.15%</span>
                                <span className="font-bold">{tilloCommission.toLocaleString('es-VE', { minimumFractionDigits: 2 })} VES</span>
                            </div>

                            {/* Breakdown Row 3: Bank */}
                            <div className={`flex justify-between items-center p-3 text-sm ${bankFees > 0 ? 'bg-orange-100 text-orange-700' : 'bg-gray-50 text-gray-600'}`}>
                                <span className="font-medium">Comisiones Banco</span>
                                <span className="font-bold">{bankFees.toLocaleString('es-VE', { minimumFractionDigits: 2 })} VES</span>
                            </div>

                            {/* Total Commissions Column */}
                            <div className="flex justify-between items-center p-3 text-sm bg-blue-100 text-blue-800 border-t border-blue-200">
                                <span className="font-bold">Total Comisiones</span>
                                <span className="font-bold">{(adminCommission + tilloCommission + bankFees).toLocaleString('es-VE', { minimumFractionDigits: 2 })} VES</span>
                            </div>

                            {/* Saldo Bruto */}
                            <div className="flex justify-between items-center p-3 text-sm bg-white border-t border-gray-100">
                                <span className="font-bold text-gray-800">Saldo Bruto (CLP):</span>
                                <span className="font-bold text-blue-600">{displayedClpBalance > 0 ? displayedClpBalance.toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }) : '—'}</span>
                            </div>

                            {/* Sellers Summary */}
                            <div className="p-3 bg-white border-t border-gray-100">
                                <h3 className="font-bold text-gray-800 mb-3 text-sm">Comisiones de Vendedores (Hoy)</h3>
                                {sellerCommissions.length === 0 ? (
                                    <p className="text-sm text-gray-500 italic">No hay pedidos registrados hoy.</p>
                                ) : (
                                    <div className="space-y-1.5">
                                        {sellerCommissions.map(s => (
                                            <div key={s.email} className="flex justify-between items-center p-2.5 bg-purple-50 rounded-lg text-sm">
                                                <span className="font-medium text-gray-700">{s.email}</span>
                                                <span className="font-bold text-purple-700">
                                                    {s.totalCLP.toLocaleString('es-CL', { style: 'currency', currency: 'CLP' })} ({s.orderCount} pedidos)
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

            </main>

            {/* Modals */}
            {showTransferModal && (
                <TransferFundsModal
                    accounts={accounts}
                    onClose={() => setShowTransferModal(false)}
                />
            )}
            {balanceOp && (
                <BalanceOperationModal
                    type={balanceOp.type}
                    vesAmount={balanceOp.amount}
                    accounts={accounts}
                    onClose={() => {
                        setBalanceOp(null);
                        setVesInput('');
                    }}
                />
            )}
        </div>
    );
}
