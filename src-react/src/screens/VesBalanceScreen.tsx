import { useState } from 'react';
import { useVesBalance } from '../hooks/useVesBalance';
import { Button } from '../components/ui';
import * as XLSX from 'xlsx';

import { useNavigation } from '../contexts/NavigationContext';

const QUICK_RANGES = [
    { label: 'Hoy', days: 0 },
    { label: 'Ayer', days: 1 },
    { label: '7 días', days: 7 },
    { label: '30 días', days: 30 },
];

const formatDateInput = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

const parseDateInput = (value: string) => {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d, 12, 0, 0, 0);
};

const TYPE_LABELS: Record<string, { label: string; icon: string; color: string }> = {
    'add': { label: 'Ingreso', icon: '↑', color: 'bg-green-100 text-green-600' },
    'subtract': { label: 'Egreso', icon: '↓', color: 'bg-red-100 text-red-600' },
    'fee': { label: 'Comisión', icon: '💸', color: 'bg-orange-100 text-orange-600' },
    'admin_commission': { label: 'Com. Admin', icon: '👤', color: 'bg-purple-100 text-purple-600' },
    'tillo_commission': { label: 'Mano Tillo', icon: '🤝', color: 'bg-blue-100 text-blue-600' },
    'reversal_add': { label: 'Reverso Ingreso', icon: '↩', color: 'bg-emerald-100 text-emerald-700' },
    'reversal_fee': { label: 'Reverso Comisión', icon: '↩', color: 'bg-emerald-100 text-emerald-700' },
    'reversal_admin_commission': { label: 'Reverso Com. Admin', icon: '↩', color: 'bg-emerald-100 text-emerald-700' },
    'reversal_tillo_commission': { label: 'Reverso Mano Tillo', icon: '↩', color: 'bg-emerald-100 text-emerald-700' },
    'reversal_seller_commission': { label: 'Reverso Com. Venta', icon: '↩', color: 'bg-emerald-100 text-emerald-700' },
};

const isCreditMovement = (type: string, note: string) => {
    const normalizedType = (type || '').toLowerCase().trim();
    const normalizedNote = (note || '').toLowerCase();

    if (normalizedType === 'add' || normalizedType.startsWith('reversal_')) return true;
    if (/reversion|retorno|devolucion|anulacion/.test(normalizedNote)) return true;
    return false;
};

interface Props {
    onBack?: () => void;
}

export function VesBalanceScreen({ onBack }: Props = {}) {
    const { goHome } = useNavigation();
    const handleBack = onBack || goHome;
    const { entries, loading, error, totals, hasSearched, search } = useVesBalance();
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    const handleSearch = () => {
        if (!startDate || !endDate) return;
        search(parseDateInput(startDate), parseDateInput(endDate));
    };

    const handleQuickRange = (days: number) => {
        const end = new Date();
        const start = new Date();
        if (days === 1) { start.setDate(start.getDate() - 1); end.setDate(end.getDate() - 1); }
        else { start.setDate(start.getDate() - days); }
        const startValue = formatDateInput(start);
        const endValue = formatDateInput(end);
        setStartDate(startValue);
        setEndDate(endValue);
        search(parseDateInput(startValue), parseDateInput(endValue));
    };

    const handleExport = () => {
        if (entries.length === 0) return;
        const data = entries.map(e => ({
            'Monto': e.amount,
            'Tipo': e.type,
            'Nota': e.note,
            'Titular': e.holder || '',
            'Banco': e.bank || '',
            'Saldo Después': e.balanceAfter || '',
        }));
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'HistorialVES');
        XLSX.writeFile(wb, `Balance_VES_${startDate || 'all'}_a_${endDate || 'all'}.xlsx`);
    };

    return (
        <div className="min-h-screen bg-gray-50">
            <header className="bg-white border-b border-gray-100 sticky top-0 z-50">
                <div className="max-w-900 mx-auto px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button onClick={handleBack} className="text-gray-400 hover:text-gray-700 transition-colors text-sm font-semibold">← Volver</button>
                        <h1 className="text-sm font-bold text-gray-800">Balance VES</h1>
                    </div>
                    {entries.length > 0 && (
                        <Button variant="ghost" onClick={handleExport} className="!text-xs">📥 Excel</Button>
                    )}
                </div>
            </header>

            <main className="max-w-900 mx-auto px-4 py-6 space-y-4">
                {/* Quick Ranges */}
                <div className="flex gap-2 overflow-x-auto pb-1">
                    {QUICK_RANGES.map(r => (
                        <button key={r.label} onClick={() => handleQuickRange(r.days)}
                            className="shrink-0 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-xs font-semibold text-gray-600 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600 transition-all">
                            {r.label}
                        </button>
                    ))}
                </div>

                {/* Date Range */}
                <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="exchange-label">Desde</label>
                            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="exchange-input text-xs" />
                        </div>
                        <div>
                            <label className="exchange-label">Hasta</label>
                            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="exchange-input text-xs" />
                        </div>
                    </div>
                    <Button variant="primary" fullWidth onClick={handleSearch} isLoading={loading} className="!text-xs">
                        🔍 Buscar Movimientos VES
                    </Button>
                </div>

                {!loading && !error && totals.count === 0 && (
                    <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-2.5 text-xs text-blue-700 font-medium">
                        No hay movimientos en este rango.
                    </div>
                )}
                {!loading && !error && totals.count > 0 && (
                    <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-2.5 text-xs text-blue-800 font-medium">
                        {totals.count} movimientos.{' '}
                        <span className="text-green-600 font-bold">+{totals.adds.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> /{' '}
                        <span className="text-red-600 font-bold">-{totals.subs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> /{' '}
                        <span className="text-orange-600 font-bold">Comisiones: {totals.fees.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> VES
                    </div>
                )}
                {error && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-xs text-red-600">{error}</div>}

                {/* Entries */}
                {entries.length > 0 && (
                    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse min-w-[600px]">
                                <thead>
                                    <tr className="bg-gray-50 border-b border-gray-100 text-[10px] uppercase tracking-wider text-gray-500">
                                        <th className="px-4 py-3 font-semibold w-32">FECHA Y HORA</th>
                                        <th className="px-4 py-3 font-semibold">DESCRIPCIÓN</th>
                                        <th className="px-4 py-3 font-semibold w-24">BANCO</th>
                                        <th className="px-4 py-3 font-semibold text-right w-28">CARGO</th>
                                        <th className="px-4 py-3 font-semibold text-right w-28">ABONO</th>
                                        <th className="px-4 py-3 font-semibold text-right w-32">SALDO</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50 bg-white">
                                    {entries.map(entry => {
                                        const typeInfo = TYPE_LABELS[entry.type] || { label: entry.type };
                                        const isAbono = isCreditMovement(entry.type, entry.note);
                                        const isCargo = !isAbono;
                                        const absAmount = entry.amount; // already positive
                                        const date = entry.timestamp ? entry.timestamp.toDate() : new Date();

                                        return (
                                            <tr key={entry.id} className="hover:bg-gray-50/50 transition-colors group">
                                                {/* FECHA Y HORA */}
                                                <td className="px-4 py-2.5 text-[11px] text-gray-500 whitespace-nowrap">
                                                    {date.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                                                    <span className="text-[10px] text-gray-400 ml-1.5">
                                                        {date.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                </td>

                                                {/* DESCRIPCIÓN */}
                                                <td className="px-4 py-2.5 text-[11px] font-medium text-gray-800 whitespace-nowrap max-w-[250px] truncate">
                                                    {entry.note || typeInfo.label}
                                                </td>

                                                {/* BANCO */}
                                                <td className="px-4 py-2.5 text-[11px] text-gray-500 capitalize whitespace-nowrap max-w-[150px] truncate">
                                                    {entry.bank || '-'}
                                                </td>

                                                {/* CARGO */}
                                                <td className="px-4 py-2.5 text-right font-medium text-[11px] text-rose-600 tabular-nums">
                                                    {isCargo ? absAmount.toLocaleString('es-VE', { minimumFractionDigits: 2 }) : ''}
                                                </td>

                                                {/* ABONO */}
                                                <td className="px-4 py-2.5 text-right font-medium text-[11px] text-emerald-600 tabular-nums">
                                                    {isAbono ? absAmount.toLocaleString('es-VE', { minimumFractionDigits: 2 }) : ''}
                                                </td>

                                                {/* SALDO */}
                                                <td className="px-4 py-2.5 text-right font-bold text-[11px] text-blue-600 tabular-nums bg-blue-50/10 group-hover:bg-blue-50/30">
                                                    {entry.balanceAfter !== undefined
                                                        ? entry.balanceAfter.toLocaleString('es-VE', { minimumFractionDigits: 2 })
                                                        : '—'}
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
                        <p className="text-4xl mb-3">🇻🇪</p>
                        <p className="text-gray-400 text-sm">Selecciona un rango de fechas</p>
                    </div>
                )}
            </main>
        </div>
    );
}
