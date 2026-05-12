import { useState } from 'react';
import { useSellerCommissions } from '../hooks/useSellerCommissions';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui';
import { USER_TAGS } from '../lib/constants';
import {
    ArrowLeft, Search, DollarSign, TrendingUp, Calendar
} from 'lucide-react';
import { useNavigation } from '../contexts/NavigationContext';
import * as XLSX from 'xlsx';

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

interface Props {
    onBack?: () => void;
}

export function CommissionsScreen({ onBack }: Props = {}) {
    const { user, role } = useAuth();
    const { goHome } = useNavigation();
    const handleBack = onBack || goHome;
    const { entries, loading, error, summary, totals, search } = useSellerCommissions();
    const [sellerEmail, setSellerEmail] = useState(role === 'seller' && user?.email ? user.email : '');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    // Get seller emails from USER_TAGS
    const sellers = Object.entries(USER_TAGS)
        .filter(([, tag]) => tag.startsWith('V'))
        .sort(([, a], [, b]) => a.localeCompare(b));

    const handleSearch = () => {
        if (!startDate || !endDate) return;
        if (role !== 'seller' && !sellerEmail) return;
        search(sellerEmail, parseDateInput(startDate), parseDateInput(endDate));
    };

    const handleQuickRange = (days: number) => {
        if (role !== 'seller' && !sellerEmail) return;
        const end = new Date();
        const start = new Date();
        if (days === 1) { start.setDate(start.getDate() - 1); end.setDate(end.getDate() - 1); }
        else { start.setDate(start.getDate() - days); }
        const startValue = formatDateInput(start);
        const endValue = formatDateInput(end);
        setStartDate(startValue);
        setEndDate(endValue);
        search(sellerEmail, parseDateInput(startValue), parseDateInput(endValue));
    };

    const handleExport = () => {
        if (entries.length === 0) return;
        const data = entries.map(e => ({
            'Comisión': e.amount,
            'Monto Pedido': e.orderAmount,
            'ID Pedido': e.orderId,
            'Vendedor': e.sellerEmail,
        }));
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Comisiones');
        const exportSeller = sellerEmail || user?.email || 'seller';
        XLSX.writeFile(wb, `Comisiones_${exportSeller}_${startDate}_${endDate}.xlsx`);
    };

    return (
        <div className="min-h-screen bg-gray-50">
            <header className="bg-white border-b border-gray-100 sticky top-0 z-50">
                <div className="max-w-900 mx-auto px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button onClick={handleBack} className="text-gray-400 hover:text-gray-700 transition-colors">
                            <ArrowLeft className="w-4 h-4" />
                        </button>
                        <h1 className="text-sm font-bold text-gray-800">Comisiones Vendedores</h1>
                    </div>
                    {entries.length > 0 && (
                        <Button variant="ghost" onClick={handleExport} className="!text-xs flex items-center gap-1">
                            <DollarSign className="w-3.5 h-3.5" /> Excel
                        </Button>
                    )}
                </div>
            </header>

            <main className="max-w-900 mx-auto px-4 py-6 space-y-4">
                {/* Seller select */}
                <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
                    {role === 'admin' ? (
                        <div>
                            <label className="exchange-label flex items-center gap-1">
                                <TrendingUp className="w-3 h-3" /> Vendedor
                            </label>
                            <select
                                value={sellerEmail}
                                onChange={e => setSellerEmail(e.target.value)}
                                className="exchange-input text-xs"
                            >
                                <option value="">-- Elige un vendedor --</option>
                                {sellers.map(([email, tag]) => (
                                    <option key={email} value={email}>{tag} — {email}</option>
                                ))}
                            </select>
                        </div>
                    ) : (
                        <div>
                            <label className="exchange-label block mb-1">Tu Cuenta de Vendedor</label>
                            <div className="exchange-input text-xs bg-gray-50 text-gray-500 font-medium">
                                {sellerEmail}
                            </div>
                        </div>
                    )}

                    {/* Quick ranges */}
                    <div className="flex gap-2 overflow-x-auto pb-1">
                        {QUICK_RANGES.map(r => (
                            <button key={r.label} onClick={() => handleQuickRange(r.days)}
                                className="shrink-0 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-full text-xs font-semibold text-gray-600 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600 transition-all">
                                {r.label}
                            </button>
                        ))}
                    </div>

                    {/* Date Range */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="exchange-label flex items-center gap-1">
                                <Calendar className="w-3 h-3" /> Desde
                            </label>
                            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="exchange-input text-xs" />
                        </div>
                        <div>
                            <label className="exchange-label flex items-center gap-1">
                                <Calendar className="w-3 h-3" /> Hasta
                            </label>
                            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="exchange-input text-xs" />
                        </div>
                    </div>
                    <Button variant="primary" fullWidth onClick={handleSearch} isLoading={loading} className="!text-xs flex items-center justify-center gap-1.5">
                        <Search className="w-3.5 h-3.5" /> Buscar Comisiones
                    </Button>
                </div>

                {summary && <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-2.5 text-xs text-blue-700 font-medium">{summary}</div>}

                {entries.length > 0 && (
                    <div className="bg-white rounded-xl border border-gray-100 p-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2">
                                <p className="text-[10px] uppercase tracking-wider text-blue-500 font-bold">Total Enviado CLP</p>
                                <p className="text-sm font-bold text-blue-700">
                                    {totals.totalSalesCLP.toLocaleString('es-CL', { style: 'currency', currency: 'CLP' })}
                                </p>
                            </div>
                            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                                <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Monto Neto CLP</p>
                                <p className="text-sm font-bold text-gray-800">
                                    {totals.netAmountCLP.toLocaleString('es-CL', { style: 'currency', currency: 'CLP' })}
                                </p>
                            </div>
                            <div className="rounded-lg border border-green-100 bg-green-50 px-3 py-2">
                                <p className="text-[10px] uppercase tracking-wider text-green-500 font-bold">Líquido a Recibir</p>
                                <p className="text-sm font-bold text-green-700">
                                    {totals.liquidCommissionCLP.toLocaleString('es-CL', { style: 'currency', currency: 'CLP' })}
                                </p>
                            </div>
                        </div>
                    </div>
                )}
                {error && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-xs text-red-600">{error}</div>}

                {/* Entries */}
                {entries.length > 0 && (
                    <div className="space-y-2">
                        {entries.map(entry => (
                            <div key={entry.id} className="bg-white rounded-xl border border-gray-100 p-3 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                                        <DollarSign className="w-4 h-4 text-green-600" />
                                    </div>
                                    <div>
                                        <p className="text-xs font-semibold text-gray-800">
                                            Pedido #{entry.orderId.slice(-5)}
                                        </p>
                                        <p className="text-[10px] text-gray-400">
                                            Monto: {entry.orderAmount.toLocaleString('es-CL', { style: 'currency', currency: 'CLP' })}
                                        </p>
                                    </div>
                                </div>
                                <span className={`text-sm font-bold ${entry.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {entry.amount.toLocaleString('es-CL', { style: 'currency', currency: 'CLP' })}
                                </span>
                            </div>
                        ))}
                    </div>
                )}

                {!loading && entries.length === 0 && !summary && (
                    <div className="text-center py-16">
                        <DollarSign className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                        <p className="text-gray-400 text-sm">Selecciona un vendedor y rango de fechas</p>
                    </div>
                )}
            </main>
        </div>
    );
}
