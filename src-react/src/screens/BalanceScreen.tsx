import { useEffect, useState } from 'react';
import { useBalanceHistory } from '../hooks/useBalanceHistory';
import { useExchangeRates } from '../hooks/useExchangeRates';
import { useVesAccounts } from '../hooks/useVesAccounts';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui';
import * as XLSX from 'xlsx';
import { useNavigation } from '../contexts/NavigationContext';

const QUICK_RANGES = [
    { label: 'Hoy', days: 0 },
    { label: 'Ayer', days: 1 },
    { label: '7 dias', days: 7 },
    { label: '30 dias', days: 30 },
];

const formatDateInputLocal = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

const parseDateInputLocal = (value: string) => {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d);
};

interface Props {
    onBack?: () => void;
}

export function BalanceScreen({ onBack }: Props = {}) {
    const { goHome } = useNavigation();
    const handleBack = onBack || goHome;
    const { role } = useAuth();
    const isAdmin = role === 'admin';

    const { entries, loading, error, totals, hasSearched, search } = useBalanceHistory();
    const { rates } = useExchangeRates();
    const { totalBalance: vesTotalBalance } = useVesAccounts();

    const todayIso = formatDateInputLocal(new Date());
    const [startDate, setStartDate] = useState(todayIso);
    const [endDate, setEndDate] = useState(todayIso);

    useEffect(() => {
        if (!isAdmin) return;
        const today = new Date();
        search(today, today);
    }, [isAdmin, search]);

    const handleSearch = () => {
        if (!isAdmin) return;
        if (!startDate || !endDate) return;
        search(parseDateInputLocal(startDate), parseDateInputLocal(endDate));
    };

    const handleQuickRange = (days: number) => {
        if (!isAdmin) return;
        const end = new Date();
        const start = new Date();
        if (days === 1) {
            start.setDate(start.getDate() - 1);
            end.setDate(end.getDate() - 1);
        } else {
            start.setDate(start.getDate() - days);
        }

        setStartDate(formatDateInputLocal(start));
        setEndDate(formatDateInputLocal(end));
        search(start, end);
    };

    const displayBalance = rates.VES > 0
        ? vesTotalBalance / rates.VES
        : rates.totalClpBalance;

    const handleExportExcel = () => {
        if (!isAdmin || entries.length === 0) return;

        const data = entries.map((e) => ({
            Fecha: e.timestamp?.toDate ? e.timestamp.toDate().toLocaleString('es-CL') : '',
            Descripcion: e.description,
            Cargo_CLP: e.isDebit ? e.amount : '',
            Abono_CLP: e.isCredit ? e.amount : '',
            Saldo_CLP: e.balanceAfter ?? '',
            Tipo: e.type,
            Banco: e.bank || '',
            Pedido: e.orderId || '',
            AdminTag: e.adminTag || '',
        }));

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'HistorialSaldoCLP');
        XLSX.writeFile(wb, `Balance_CLP_${startDate}_a_${endDate}.xlsx`);
    };

    return (
        <div className="min-h-screen bg-gray-50">
            <header className="bg-white border-b border-gray-100 sticky top-0 z-50">
                <div className="max-w-900 mx-auto px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button onClick={handleBack} className="text-gray-400 hover:text-gray-700 transition-colors text-sm font-semibold">
                            ← Volver
                        </button>
                        <h1 className="text-sm font-bold text-gray-800">Balance CLP</h1>
                    </div>
                    {isAdmin && entries.length > 0 && (
                        <Button variant="ghost" onClick={handleExportExcel} className="!text-xs">Excel</Button>
                    )}
                </div>
            </header>

            <main className="max-w-900 mx-auto px-4 py-6 space-y-4">
                <div className="bg-gradient-to-r from-blue-600 to-blue-800 rounded-2xl p-5 text-white shadow-lg">
                    <p className="text-xs text-blue-200 font-medium">Saldo Disponible</p>
                    <p className="text-3xl font-bold mt-1">
                        {displayBalance > 0
                            ? displayBalance.toLocaleString('es-CL', { style: 'currency', currency: 'CLP' })
                            : '$0'}
                    </p>
                    <div className="flex gap-4 mt-3">
                        <div>
                            <p className="text-[10px] text-blue-300">Tasa VES</p>
                            <p className="text-sm font-semibold">{rates.VES > 0 ? rates.VES.toFixed(2) : '-'}</p>
                        </div>
                    </div>
                </div>

                {!isAdmin && (
                    <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-2.5 text-xs text-blue-700 font-medium">
                        Vista resumida: solo saldo CLP disponible.
                    </div>
                )}

                {isAdmin && (
                    <>
                        <div className="flex gap-2 overflow-x-auto pb-1">
                            {QUICK_RANGES.map((r) => (
                                <button
                                    key={r.label}
                                    onClick={() => handleQuickRange(r.days)}
                                    className="shrink-0 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-xs font-semibold text-gray-600 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600 transition-all"
                                >
                                    {r.label}
                                </button>
                            ))}
                        </div>

                        <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="exchange-label">Desde</label>
                                    <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="exchange-input text-xs" />
                                </div>
                                <div>
                                    <label className="exchange-label">Hasta</label>
                                    <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="exchange-input text-xs" />
                                </div>
                            </div>
                            <Button variant="primary" fullWidth onClick={handleSearch} isLoading={loading} className="!text-xs">
                                Buscar Movimientos
                            </Button>
                        </div>

                        {!loading && !error && totals.count === 0 && (
                            <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-2.5 text-xs text-blue-700 font-medium">
                                No hay movimientos en este rango.
                            </div>
                        )}

                        {!loading && !error && totals.count > 0 && (
                            <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-2.5 text-xs text-blue-800 font-medium">
                                {totals.count} movimientos. Ingresos:{' '}
                                <span className="text-green-600 font-bold">
                                    {totals.in.toLocaleString('es-CL', { style: 'currency', currency: 'CLP' })}
                                </span>{' '}
                                | Egresos:{' '}
                                <span className="text-red-600 font-bold">
                                    {totals.out.toLocaleString('es-CL', { style: 'currency', currency: 'CLP' })}
                                </span>
                                {totals.openingBalance !== null && totals.closingBalance !== null && (
                                    <>
                                        {' '}| Saldo Inicial:{' '}
                                        <span className="text-gray-700 font-bold">
                                            {totals.openingBalance.toLocaleString('es-CL', { style: 'currency', currency: 'CLP' })}
                                        </span>
                                        {' '}| Saldo Final:{' '}
                                        <span className="text-blue-700 font-bold">
                                            {totals.closingBalance.toLocaleString('es-CL', { style: 'currency', currency: 'CLP' })}
                                        </span>
                                    </>
                                )}
                            </div>
                        )}

                        {error && (
                            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-xs text-red-600">{error}</div>
                        )}

                        {entries.length > 0 && (
                            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse min-w-[600px]">
                                        <thead>
                                            <tr className="bg-gray-50 border-b border-gray-100 text-[10px] uppercase tracking-wider text-gray-500">
                                                <th className="px-4 py-3 font-semibold w-32">Fecha y Hora</th>
                                                <th className="px-4 py-3 font-semibold">Descripcion</th>
                                                <th className="px-4 py-3 font-semibold w-24">Banco</th>
                                                <th className="px-4 py-3 font-semibold text-right w-28">Cargo</th>
                                                <th className="px-4 py-3 font-semibold text-right w-28">Abono</th>
                                                <th className="px-4 py-3 font-semibold text-right w-32">Saldo</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50 bg-white">
                                            {entries.map((entry) => {
                                                const date = entry.timestamp?.toDate ? entry.timestamp.toDate() : new Date();
                                                return (
                                                    <tr key={entry.id} className="hover:bg-gray-50/50 transition-colors group">
                                                        <td className="px-4 py-2.5 text-[11px] text-gray-500 whitespace-nowrap">
                                                            {date.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                                                            <span className="text-[10px] text-gray-400 ml-1.5">
                                                                {date.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-2.5 text-[11px] font-medium text-gray-800 whitespace-nowrap max-w-[250px] truncate">
                                                            {entry.description}
                                                            {entry.orderId && (
                                                                <span className="ml-1.5 text-[9px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded-sm font-mono tracking-tighter">
                                                                    #{entry.orderId.slice(-5)}
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-2.5 text-[11px] text-gray-500 capitalize whitespace-nowrap max-w-[150px] truncate">
                                                            {entry.bank || '-'}
                                                        </td>
                                                        <td className="px-4 py-2.5 text-right font-medium text-[11px] text-rose-600 tabular-nums">
                                                            {entry.isDebit ? Math.abs(entry.amount).toLocaleString('es-CL', { minimumFractionDigits: 0 }) : ''}
                                                        </td>
                                                        <td className="px-4 py-2.5 text-right font-medium text-[11px] text-emerald-600 tabular-nums">
                                                            {entry.isCredit ? Math.abs(entry.amount).toLocaleString('es-CL', { minimumFractionDigits: 0 }) : ''}
                                                        </td>
                                                        <td className="px-4 py-2.5 text-right font-bold text-[11px] text-blue-600 tabular-nums bg-blue-50/10 group-hover:bg-blue-50/30">
                                                            {entry.balanceAfter !== undefined
                                                                ? entry.balanceAfter.toLocaleString('es-CL', { minimumFractionDigits: 0 })
                                                                : '-'}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {!loading && entries.length === 0 && !hasSearched && (
                            <div className="text-center py-16">
                                <p className="text-gray-400 text-sm">Selecciona un rango de fechas para ver movimientos</p>
                            </div>
                        )}
                    </>
                )}
            </main>
        </div>
    );
}
