import { useOrders } from '../hooks/useOrders';
import { useExchangeRates } from '../hooks/useExchangeRates';
import { useVesAccounts } from '../hooks/useVesAccounts';
import {
    ArrowLeft, BarChart3, Clock, CheckCircle,
    TrendingUp, Wallet, Landmark, Users, CircleDollarSign
} from 'lucide-react';
import { useNavigation } from '../contexts/NavigationContext';

interface Props {
    onBack?: () => void;
}

export function ReportsScreen({ onBack }: Props = {}) {
    const { goHome } = useNavigation();
    const handleBack = onBack || goHome;
    const { pending, paid } = useOrders();
    const { rates } = useExchangeRates();
    const { totalBalance: vesTotal, accounts } = useVesAccounts();

    // Daily stats
    const totalPendingClp = pending.reduce((s, o) => s + o.clpAmount, 0);
    const totalPaidClp = paid.reduce((s, o) => s + o.clpAmount, 0);
    const totalPaidVes = paid.filter(o => o.destinationCurrency === 'VES').reduce((s, o) => s + o.destinationAmount, 0);
    const totalPaidCop = paid.filter(o => o.destinationCurrency === 'COP').reduce((s, o) => s + o.destinationAmount, 0);
    const estimatedClp = rates.VES > 0 ? vesTotal / rates.VES : 0;

    // Type breakdown
    const typeBreakdown = paid.reduce<Record<string, { count: number; clp: number }>>((acc, o) => {
        const key = o.type;
        if (!acc[key]) acc[key] = { count: 0, clp: 0 };
        acc[key].count++;
        acc[key].clp += o.clpAmount;
        return acc;
    }, {});

    const typeLabels: Record<string, string> = {
        'transferencia': 'Transferencias',
        'pago-movil': 'Pagos Móviles',
        'recarga-saldo': 'Recargas',
    };

    return (
        <div className="min-h-screen bg-gray-50">
            <header className="bg-white border-b border-gray-100 sticky top-0 z-50">
                <div className="max-w-900 mx-auto px-4 py-3 flex items-center gap-3">
                    <button onClick={handleBack} className="text-gray-400 hover:text-gray-700 transition-colors">
                        <ArrowLeft className="w-4 h-4" />
                    </button>
                    <BarChart3 className="w-4 h-4 text-blue-500" />
                    <h1 className="text-sm font-bold text-gray-800">Reportes del Día</h1>
                </div>
            </header>

            <main className="max-w-900 mx-auto px-4 py-6 space-y-5">
                {/* Main KPIs */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white rounded-xl border border-amber-100 p-4">
                        <div className="flex items-center justify-between mb-2">
                            <Clock className="w-4 h-4 text-amber-500" />
                            <span className="text-[10px] text-amber-500 font-bold">PENDIENTES</span>
                        </div>
                        <p className="text-2xl font-bold text-gray-800">{pending.length}</p>
                        <p className="text-xs text-gray-400 mt-1">{totalPendingClp.toLocaleString('es-CL', { style: 'currency', currency: 'CLP' })}</p>
                    </div>
                    <div className="bg-white rounded-xl border border-emerald-100 p-4">
                        <div className="flex items-center justify-between mb-2">
                            <CheckCircle className="w-4 h-4 text-emerald-500" />
                            <span className="text-[10px] text-emerald-500 font-bold">PAGADOS</span>
                        </div>
                        <p className="text-2xl font-bold text-gray-800">{paid.length}</p>
                        <p className="text-xs text-gray-400 mt-1">{totalPaidClp.toLocaleString('es-CL', { style: 'currency', currency: 'CLP' })}</p>
                    </div>
                </div>

                {/* Currency breakdown */}
                <section className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
                    <h3 className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
                        <CircleDollarSign className="w-3.5 h-3.5 text-blue-500" />
                        Desglose por Moneda (Pagados)
                    </h3>
                    <div className="space-y-2">
                        {totalPaidVes > 0 && (
                            <div className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm">🇻🇪</span>
                                    <span className="text-xs font-semibold text-gray-700">VES</span>
                                </div>
                                <span className="text-sm font-bold text-gray-800">
                                    {totalPaidVes.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                                </span>
                            </div>
                        )}
                        {totalPaidCop > 0 && (
                            <div className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm">🇨🇴</span>
                                    <span className="text-xs font-semibold text-gray-700">COP</span>
                                </div>
                                <span className="text-sm font-bold text-gray-800">
                                    {totalPaidCop.toLocaleString('es-CO', { minimumFractionDigits: 0 })}
                                </span>
                            </div>
                        )}
                        {totalPaidVes === 0 && totalPaidCop === 0 && (
                            <p className="text-xs text-gray-400 text-center py-2">Sin pagos hoy.</p>
                        )}
                    </div>
                </section>

                {/* Type breakdown */}
                {Object.keys(typeBreakdown).length > 0 && (
                    <section className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
                        <h3 className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
                            <BarChart3 className="w-3.5 h-3.5 text-purple-500" />
                            Por Tipo de Pago
                        </h3>
                        <div className="space-y-2">
                            {Object.entries(typeBreakdown).map(([type, data]) => (
                                <div key={type} className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
                                    <span className="text-xs font-semibold text-gray-700">{typeLabels[type] || type}</span>
                                    <div className="text-right">
                                        <p className="text-sm font-bold text-gray-800">{data.count} pedidos</p>
                                        <p className="text-[10px] text-gray-400">{data.clp.toLocaleString('es-CL', { style: 'currency', currency: 'CLP' })}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* System Status */}
                <section className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
                    <h3 className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
                        <TrendingUp className="w-3.5 h-3.5 text-green-500" />
                        Estado del Sistema
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-gray-50 rounded-lg p-3">
                            <p className="text-[10px] text-gray-400 flex items-center gap-1">
                                <Landmark className="w-3 h-3" /> Balance VES
                            </p>
                            <p className="text-sm font-bold text-gray-800">
                                {vesTotal.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                            </p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3">
                            <p className="text-[10px] text-gray-400 flex items-center gap-1">
                                <Wallet className="w-3 h-3" /> Balance CLP
                            </p>
                            <p className="text-sm font-bold text-gray-800">
                                {rates.totalClpBalance.toLocaleString('es-CL', { style: 'currency', currency: 'CLP' })}
                            </p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3">
                            <p className="text-[10px] text-gray-400 flex items-center gap-1">
                                <Users className="w-3 h-3" /> Cuentas
                            </p>
                            <p className="text-sm font-bold text-gray-800">{accounts.length}</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3">
                            <p className="text-[10px] text-gray-400 flex items-center gap-1">
                                <CircleDollarSign className="w-3 h-3" /> Est. CLP
                            </p>
                            <p className="text-sm font-bold text-blue-600">
                                {estimatedClp > 0 ? `$${Math.round(estimatedClp).toLocaleString('es-CL')}` : '—'}
                            </p>
                        </div>
                    </div>
                </section>
            </main>
        </div>
    );
}
