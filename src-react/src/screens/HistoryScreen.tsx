import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useHistoricalOrders } from '../hooks/useHistoricalOrders';
import { Button } from '../components/ui';
import { OrderDetailModal } from './OrderDetailModal';
import type { Order } from '../hooks/useOrders';
import * as XLSX from 'xlsx';
import { useNavigation } from '../contexts/NavigationContext';
import { USER_TAGS } from '../lib/constants';

const STATUS_FILTERS = ['Todos', 'Pendiente de pago', 'Pagado', 'Cancelado'];
const QUICK_RANGES = [
    { label: 'Hoy', days: 0 },
    { label: 'Ayer', days: 1 },
    { label: '7 días', days: 7 },
    { label: '30 días', days: 30 },
];

const TYPE_LABELS: Record<string, string> = {
    'transferencia': '🏦',
    'pago-movil': '📱',
    'recarga-saldo': '💳',
};

interface Props {
    onBack?: () => void;
}

export function HistoryScreen({ onBack }: Props = {}) {
    const { goHome, navigate, params, screen } = useNavigation();
    const handleBack = onBack || goHome;
    const { orders, loading, error, summary, search } = useHistoricalOrders();
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [statusFilter, setStatusFilter] = useState('Todos');
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

    useEffect(() => {
        if (params?.orderId) {
            const found = orders.find(o => o.id === params.orderId);
            if (found) {
                setSelectedOrder(found);
                navigate(screen, null);
            } else {
                const fetchOrder = async () => {
                    try {
                        const orderRef = doc(db, 'orders', params.orderId);
                        const orderSnap = await getDoc(orderRef);
                        if (orderSnap.exists()) {
                            setSelectedOrder({ id: orderSnap.id, ...orderSnap.data() } as Order);
                        }
                    } catch (e) {
                        console.error('Error fetching order by ID:', e);
                    } finally {
                        navigate(screen, null);
                    }
                };
                void fetchOrder();
            }
        }
    }, [params, orders, navigate, screen]);

    const handleSearch = () => {
        if (!startDate || !endDate) return;
        const [sy, sm, sd] = startDate.split('-').map(Number);
        const [ey, em, ed] = endDate.split('-').map(Number);
        search(new Date(sy, sm - 1, sd), new Date(ey, em - 1, ed), statusFilter);
    };

    const handleQuickRange = (days: number) => {
        const end = new Date();
        const start = new Date();
        if (days === 1) {
            start.setDate(start.getDate() - 1);
            end.setDate(end.getDate() - 1);
        } else {
            start.setDate(start.getDate() - days);
        }
        const fmt = (d: Date) => {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        };
        setStartDate(fmt(start));
        setEndDate(fmt(end));
        search(start, end, statusFilter);
    };

    /** Exportar resultados a Excel */
    const handleExportExcel = () => {
        if (orders.length === 0) return;

        const dataToExport = orders.map(order => ({
            'Cliente': order.clientName,
            'Cédula': order.cedula,
            'Tipo': order.type,
            'Monto CLP': order.clpAmount,
            'Monto Destino': order.destinationAmount,
            'Moneda': order.destinationCurrency,
            'Estado': order.status,
            'Banco': order.bank || '',
            'Teléfono': order.phone || '',
            'Nro. Cuenta': order.accountNumber || '',
            'Creado Por': USER_TAGS[order.createdByTag || ''] || order.createdByTag || '',
            'Pagado Por': USER_TAGS[order.paidByTag || ''] || order.paidByTag || '',
        }));

        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'HistorialPedidos');
        XLSX.writeFile(workbook, `Historial_${startDate || 'all'}_a_${endDate || 'all'}.xlsx`);
    };

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <header className="bg-white border-b border-gray-100 sticky top-0 z-50">
                <div className="max-w-900 mx-auto px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button onClick={handleBack} className="text-gray-400 hover:text-gray-700 transition-colors text-sm font-semibold">
                            ← Volver
                        </button>
                        <h1 className="text-sm font-bold text-gray-800">Historial de Pedidos</h1>
                    </div>
                    {orders.length > 0 && (
                        <Button variant="ghost" onClick={handleExportExcel} className="!text-xs">
                            📥 Excel
                        </Button>
                    )}
                </div>
            </header>

            <main className="max-w-900 mx-auto px-4 py-6 space-y-4">
                {/* Quick Range Chips */}
                <div className="flex gap-2 overflow-x-auto pb-1">
                    {QUICK_RANGES.map(r => (
                        <button
                            key={r.label}
                            onClick={() => handleQuickRange(r.days)}
                            className="shrink-0 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-xs font-semibold text-gray-600 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600 transition-all"
                        >
                            {r.label}
                        </button>
                    ))}
                </div>

                {/* Date Range + Search */}
                <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="exchange-label">Desde</label>
                            <input
                                type="date"
                                value={startDate}
                                onChange={e => setStartDate(e.target.value)}
                                className="exchange-input text-xs"
                            />
                        </div>
                        <div>
                            <label className="exchange-label">Hasta</label>
                            <input
                                type="date"
                                value={endDate}
                                onChange={e => setEndDate(e.target.value)}
                                className="exchange-input text-xs"
                            />
                        </div>
                    </div>

                    {/* Status Filter */}
                    <div className="flex gap-1.5 overflow-x-auto">
                        {STATUS_FILTERS.map(s => (
                            <button
                                key={s}
                                onClick={() => setStatusFilter(s)}
                                className={`shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${statusFilter === s
                                    ? 'bg-blue-600 text-white shadow-sm'
                                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                                    }`}
                            >
                                {s}
                            </button>
                        ))}
                    </div>

                    <Button variant="primary" fullWidth onClick={handleSearch} isLoading={loading} className="!text-xs">
                        🔍 Buscar
                    </Button>
                </div>

                {/* Summary */}
                {summary && (
                    <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-2.5 flex items-center justify-between">
                        <span className="text-xs text-blue-700 font-medium">{summary}</span>
                        {orders.length > 0 && (
                            <button
                                onClick={handleExportExcel}
                                className="text-[11px] text-blue-600 font-bold hover:underline shrink-0 ml-3"
                            >
                                📥 Exportar
                            </button>
                        )}
                    </div>
                )}

                {/* Error */}
                {error && (
                    <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-xs text-red-600">
                        {error}
                    </div>
                )}

                {/* Results Table (Bank Statement Style) */}
                {orders.length > 0 && (
                    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse min-w-[700px]">
                                <thead>
                                    <tr className="bg-gray-50 border-b border-gray-100 text-[10px] uppercase tracking-wider text-gray-500">
                                        <th className="px-4 py-3 font-semibold w-32">FECHA Y HORA</th>
                                        <th className="px-4 py-3 font-semibold">CLIENTE / PEDIDO</th>
                                        <th className="px-4 py-3 font-semibold">TIPO / BANCO</th>
                                        <th className="px-4 py-3 font-semibold text-right">MONTO CLP</th>
                                        <th className="px-4 py-3 font-semibold text-right">MONTO VES</th>
                                        <th className="px-4 py-3 font-semibold text-right w-28">ESTADO</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50 bg-white">
                                    {orders.map(order => {
                                        const date = order.createdAt ? order.createdAt.toDate() : new Date();
                                        const isPaid = order.status === 'Pagado';
                                        const isCancelled = order.status === 'Cancelado';
                                        const currentVesAmount = order.destinationAmount || 0;

                                        return (
                                            <tr
                                                key={order.id}
                                                onClick={() => setSelectedOrder(order)}
                                                className="hover:bg-gray-50/50 transition-colors group cursor-pointer"
                                            >
                                                {/* FECHA Y HORA */}
                                                <td className="px-4 py-2.5 text-[11px] text-gray-500 whitespace-nowrap">
                                                    {date.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                                                    <span className="block text-[9px] text-gray-400">
                                                        {date.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                </td>

                                                {/* CLIENTE / PEDIDO */}
                                                <td className="px-4 py-2.5 text-[11px] font-medium text-gray-800">
                                                    <div className="truncate mb-0.5" title={order.clientName}>{order.clientName}</div>
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-[9px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded-sm font-mono tracking-tighter">
                                                            #{order.id.slice(-5)}
                                                        </span>
                                                        <span className="text-[9px] text-gray-400 font-mono tracking-tighter">
                                                            {order.cedula}
                                                        </span>
                                                    </div>
                                                </td>

                                                {/* TIPO / BANCO */}
                                                <td className="px-4 py-2.5 text-[11px] text-gray-500">
                                                    <div className="flex items-center gap-1 mb-0.5">
                                                        <span className="text-[10px]">{TYPE_LABELS[order.type] || '📦'}</span>
                                                        <span className="capitalize">{order.type.replace('-', ' ')}</span>
                                                    </div>
                                                    {(order.bank || order.accountNumber) && (
                                                        <div className="text-[9px] text-gray-400 truncate" title={`${order.bank} • ${order.accountNumber || order.phone}`}>
                                                            {order.bank} • <span className="font-mono">{order.accountNumber || order.phone}</span>
                                                        </div>
                                                    )}
                                                </td>

                                                {/* MONTO CLP */}
                                                <td className="px-4 py-2.5 text-right font-medium text-[11px] text-gray-800 tabular-nums">
                                                    {order.clpAmount.toLocaleString('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 })}
                                                </td>

                                                {/* MONTO VES */}
                                                <td className="px-4 py-2.5 text-right font-medium text-[11px] text-indigo-600 tabular-nums">
                                                    {currentVesAmount.toLocaleString('es-VE', { minimumFractionDigits: 2 })} <span className="text-[8px] text-indigo-400">{order.destinationCurrency}</span>
                                                </td>

                                                {/* ESTADO */}
                                                <td className="px-4 py-2.5 text-right">
                                                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold ${isPaid ? 'bg-emerald-50 text-emerald-600' :
                                                        isCancelled ? 'bg-rose-50 text-rose-600' :
                                                            'bg-amber-50 text-amber-600'
                                                        }`}>
                                                        {order.status}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Empty state */}
                {!loading && orders.length === 0 && summary === '' && (
                    <div className="text-center py-16">
                        <p className="text-4xl mb-3">📋</p>
                        <p className="text-gray-400 text-sm">Selecciona un rango de fechas para buscar pedidos</p>
                    </div>
                )}
            </main>

            {/* Order Detail Modal */}
            <OrderDetailModal
                order={selectedOrder}
                isOpen={!!selectedOrder}
                onClose={() => setSelectedOrder(null)}
            />
        </div>
    );
}
