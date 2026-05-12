import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { useAuth, useExchangeRates, useOrders, useOrderActions } from '../hooks';
import { useBinanceAPI } from '../hooks/useBinanceAPI';
import { useVesAccounts } from '../hooks/useVesAccounts';
import { useNavigation } from '../contexts/NavigationContext';
import { useToast } from '../contexts/ToastContext';
import { Button } from '../components/ui';
import { BankLogo } from '../components/ui/BankLogo';
import { Sidebar } from '../components/Sidebar';
import { OrderForm } from './OrderForm';
import { OrderDetailModal } from './OrderDetailModal';
import { UpdateRateModal } from './UpdateRateModal';
import { CreateBatchModal } from './CreateBatchModal';
import { BatchPaymentModal } from './BatchPaymentModal';
import type { ExchangeRates } from '../hooks/useExchangeRates';
import type { Order } from '../hooks/useOrders';
import { USER_TAGS } from '../lib/constants';
import {
    Menu, Plus, TrendingUp, Clock, CheckCircle,
    CircleDollarSign, Apple, Copy, X, Share2, AlertTriangle, Eye, EyeOff,
    MailWarning
} from 'lucide-react';

const FLAGS: Record<string, string> = {
    VES: '🇻🇪', COP: '🇨🇴', PEN: '🇵🇪', ARS: '🇦🇷', USD: '🇺🇸', EUR: '🇪🇺',
};

function MarqueeTicker({ rates, loading }: { rates: ExchangeRates; loading: boolean }) {
    if (loading) {
        return (
            <div className="bg-gray-900 text-white px-4 py-3 rounded-xl shadow-md">
                <span className="text-gray-400 text-xs animate-pulse">Cargando tasas...</span>
            </div>
        );
    }

    const currencyKeys: (keyof Pick<ExchangeRates, 'VES' | 'COP' | 'PEN' | 'ARS' | 'USD' | 'EUR'>)[] = ['VES', 'COP', 'PEN', 'ARS', 'USD', 'EUR'];
    const activePairs = currencyKeys.filter(k => rates[k] > 0);

    if (activePairs.length === 0) {
        return (
            <div className="bg-gray-900 text-white px-4 py-3 rounded-xl shadow-md">
                <span className="text-gray-400 text-xs">No hay tasas disponibles.</span>
            </div>
        );
    }

    const getDecimals = (currency: string) => {
        if (currency === 'PEN') return 5;
        if (currency === 'VES') return 3;
        return 2;
    };

    const renderPairs = () => activePairs.map(currency => (
        <div key={currency} className="flex items-center gap-1.5 shrink-0 px-3">
            <span className="text-sm">{FLAGS[currency] || ''}</span>
            <span className="text-xs font-mono font-semibold whitespace-nowrap">
                {currency}: {rates[currency].toFixed(getDecimals(currency))}
            </span>
        </div>
    ));

    return (
        <div className="bg-gray-900 text-white rounded-xl shadow-md overflow-hidden">
            <div className="flex items-center py-3 px-2">
                <div className="flex items-center gap-1.5 shrink-0 pr-3 border-r border-gray-700">
                    <span className={`w-2 h-2 rounded-full ${rates.isTakingOrders ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`}></span>
                    <span className="text-[11px] font-medium text-gray-300 whitespace-nowrap">
                        {rates.isTakingOrders ? 'Abierta' : 'Cerrada'}
                    </span>
                </div>
                <div className="overflow-hidden flex-1 ml-2">
                    <div className="marquee-track flex items-center">
                        <div className="marquee-content flex items-center">
                            {renderPairs()}
                            {rates.totalClpBalance > 0 && (
                                <div className="flex items-center gap-1.5 shrink-0 px-3">
                                    <CircleDollarSign className="w-3.5 h-3.5 text-manzano-400" />
                                    <span className="text-xs font-mono text-manzano-400 font-semibold whitespace-nowrap">
                                        CLP: {rates.totalClpBalance.toLocaleString('es-CL')}
                                    </span>
                                </div>
                            )}
                        </div>
                        <div className="marquee-content flex items-center" aria-hidden="true">
                            {renderPairs()}
                            {rates.totalClpBalance > 0 && (
                                <div className="flex items-center gap-1.5 shrink-0 px-3">
                                    <CircleDollarSign className="w-3.5 h-3.5 text-manzano-400" />
                                    <span className="text-xs font-mono text-manzano-400 font-semibold whitespace-nowrap">
                                        CLP: {rates.totalClpBalance.toLocaleString('es-CL')}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function OrderCard({ order, onClick, isSelected, onToggleSelect, onCancel, onCopy, onPay, onShare, isUpdating }: {
    order: Order;
    onClick: () => void;
    isSelected?: boolean;
    onToggleSelect?: () => void;
    onCancel?: () => void;
    onCopy?: () => void;
    onPay?: () => void;
    onShare?: () => void;
    isUpdating?: boolean;
}) {
    const typeLabels: Record<string, string> = {
        'transferencia': 'TRANSF',
        'pago-movil': 'P. MÓVIL',
        'recarga-saldo': 'RECARGA',
    };

    const isPending = order.status === 'Pendiente de pago';
    const hasEmailError = order.status === 'Pagado' &&
        order.email &&
        order.email.trim() !== '' &&
        order.email !== 'notiene@gmail.com' &&
        order.emailSent === false;
    const [showCancelConfirm, setShowCancelConfirm] = useState(false);

    // Format timestamp nicely if exists: "23/2 12:23"
    let dateStr = '';
    if (order.createdAt && (order.createdAt as any).seconds) {
        const d = new Date((order.createdAt as any).seconds * 1000);
        const day = d.getDate();
        const month = d.getMonth() + 1;
        const hr = d.getHours().toString().padStart(2, '0');
        const min = d.getMinutes().toString().padStart(2, '0');
        dateStr = `${day}/${month} ${hr}:${min}`;
    }

    return (
        <div onClick={onClick} className={`bg-white rounded-lg p-2.5 shadow-sm hover:shadow-md transition-all cursor-pointer active:scale-[0.98] flex flex-col relative ${isSelected ? 'border border-blue-400 ring-2 ring-blue-100' : 'border border-gray-100'}`}>

            {/* TOP ROW: Name, ID, Type | Right: VES Amount */}
            <div className="flex justify-between items-start mb-1.5">
                <div className="flex flex-col gap-0 max-w-[65%]">
                    <div className="flex items-center flex-wrap gap-1.5">
                        {onToggleSelect && (
                            <input
                                type="checkbox"
                                checked={isSelected || false}
                                onChange={(e) => { e.stopPropagation(); onToggleSelect(); }}
                                onClick={(e) => e.stopPropagation()}
                                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 shrink-0"
                            />
                        )}
                        <span className="font-bold text-[17px] text-gray-900 leading-tight truncate">{order.clientName}</span>
                        <span className="text-[13px] text-gray-400">#{order.id.slice(-5)}</span>
                        <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded tracking-wider ${order.type === 'pago-movil' ? 'bg-purple-50 text-purple-600' : 'bg-blue-50 text-blue-600'
                            }`}>{typeLabels[order.type] || order.type}</span>
                    </div>
                </div>
                <div className="flex flex-col items-end shrink-0 pl-1">
                    {hasEmailError && (
                        <div className="flex items-center gap-1 text-red-500 animate-pulse mb-1" title="Error enviando correo">
                            <MailWarning className="w-4 h-4" />
                            <span className="text-[10px] font-bold uppercase">Email Error</span>
                        </div>
                    )}
                    <div className="font-bold text-[17px] text-gray-900 leading-none flex items-baseline gap-1">
                        {order.destinationAmount.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                        <span className="text-[11px] text-gray-500 font-normal">VES</span>
                    </div>
                    <div className="text-[13px] text-gray-400 mt-0.5 leading-none">
                        ${order.clpAmount.toLocaleString('es-CL')}
                    </div>
                </div>
            </div>

            {/* MIDDLE ROW: Bank gray box */}
            <div className="bg-gray-50/80 rounded border border-gray-100 px-2 py-1.5 w-fit max-w-[90%] flex items-center gap-2">
                <BankLogo bank={order.bank || ''} className="w-7 h-7 text-[10px]" />
                <div className="min-w-0">
                    <div className="text-[12px] leading-tight text-gray-600 flex flex-wrap gap-x-2 gap-y-0.5">
                        <div><span className="text-gray-400">BANCO:</span> <span className="font-semibold text-gray-800">{order.bank || '-'}</span></div>
                        <div><span className="text-gray-400">{order.type === 'pago-movil' ? 'TELF:' : 'CTA:'}</span> <span className="font-semibold text-gray-800">{order.accountNumber || order.phone || '-'}</span></div>
                    </div>
                    <div className="text-[12px] leading-tight text-gray-600 mt-0.5 flex flex-wrap gap-x-2">
                        <div><span className="text-gray-400">ID:</span> <span className="font-semibold text-gray-800">{order.cedula || 'N/A'}</span></div>
                        {order.email && <div><span className="text-gray-400">@:</span> <span className="font-semibold text-gray-800 truncate max-w-[120px] inline-block align-bottom">{order.email}</span></div>}
                    </div>
                </div>
            </div>

            {/* BOTTOM ROW: Footer date + Actions */}
            <div className="flex justify-between items-end mt-1.5">
                <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[12px] text-gray-400 font-medium">
                        {dateStr || (order.status === 'Pendiente de pago' ? 'Pendiente' : order.status)}
                    </span>
                    {(order.createdByTag || order.paidByTag) && (
                        <div className="flex gap-1">
                            {order.createdByTag && (
                                <span className="text-[11px] font-mono bg-gray-100 text-gray-500 px-1 rounded border border-gray-200">
                                    C:{USER_TAGS[order.createdByTag] || order.createdByTag}
                                </span>
                            )}
                            {order.paidByTag && (
                                <span className="text-[11px] font-mono bg-gray-100 text-gray-500 px-1 rounded border border-gray-200">
                                    P:{USER_TAGS[order.paidByTag] || order.paidByTag}
                                </span>
                            )}
                        </div>
                    )}
                    {isSelected && <span className="text-[11px] text-blue-500 font-bold bg-blue-50 px-1 rounded">Sel.</span>}
                </div>

                <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    {isPending && onCancel && !showCancelConfirm && (
                        <button onClick={(e) => { e.stopPropagation(); setShowCancelConfirm(true); }} disabled={isUpdating} title="Cancelar" className="w-7 h-7 flex items-center justify-center rounded-full opacity-80 text-amber-500 bg-amber-50/50 border border-amber-200 hover:bg-amber-50 hover:opacity-100 transition-all disabled:opacity-50">
                            <AlertTriangle className="w-3.5 h-3.5" />
                        </button>
                    )}
                    {showCancelConfirm && (
                        <div className="flex items-center bg-amber-50 rounded-full px-1.5 py-0.5 gap-1.5 text-[12px] font-bold text-amber-600 border border-amber-200">
                            ¿Anular?
                            <button onClick={(e) => { e.stopPropagation(); setShowCancelConfirm(false); }} className="w-5 h-5 rounded-full bg-white text-gray-500 hover:bg-gray-100 flex items-center justify-center"><X className="w-3 h-3" /></button>
                            <button onClick={(e) => { e.stopPropagation(); setShowCancelConfirm(false); onCancel?.(); }} className="w-5 h-5 rounded-full bg-amber-500 text-white hover:bg-amber-600 flex items-center justify-center"><CheckCircle className="w-3 h-3" /></button>
                        </div>
                    )}

                    {onCopy && isPending && (
                        <button onClick={(e) => { e.stopPropagation(); onCopy(); }} title="Copiar" className="w-7 h-7 flex items-center justify-center rounded-full text-blue-500 hover:bg-blue-50 transition-colors">
                            <Copy className="w-3.5 h-3.5" />
                        </button>
                    )}

                    {isPending && onPay && (
                        <button onClick={(e) => { e.stopPropagation(); onPay(); }} title="Pagar" className="w-7 h-7 flex items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm shadow-emerald-200 hover:bg-emerald-600 transition-all">
                            <CheckCircle className="w-4 h-4" />
                        </button>
                    )}

                    {order.status === 'Pagado' && onShare && (
                        <button onClick={(e) => { e.stopPropagation(); onShare(); }} title="Compartir" className="w-7 h-7 flex items-center justify-center rounded-full text-emerald-600 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 transition-all">
                            <Share2 className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
            </div>

        </div>
    );
}

export function DashboardScreen() {
    const { user, role, logout } = useAuth();
    const { rates, loading: ratesLoading } = useExchangeRates();
    const { totalBalance: vesTotalBalance, loading: vesAccountsLoading } = useVesAccounts();
    const { pending, paid, loading: ordersLoading } = useOrders();
    const { cancelOrder, copyOrderData, loading: actionLoading } = useOrderActions();
    const { navigate } = useNavigation();
    const toast = useToast();
    const [isOrderFormOpen, setIsOrderFormOpen] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
    const [isRateModalOpen, setIsRateModalOpen] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [selectedForBatch, setSelectedForBatch] = useState<Set<string>>(new Set());
    const [showCreateBatch, setShowCreateBatch] = useState(false);
    const [showBatchModal, setShowBatchModal] = useState(false);
    const [showPaidOrders, setShowPaidOrders] = useState<boolean>(() => {
        if (typeof window === 'undefined') return false;
        return localStorage.getItem('dashboard_show_paid_orders') === '1';
    });

    const { balance: binanceBalance, checkWalletBalance } = useBinanceAPI();

    useEffect(() => {
        if (typeof window === 'undefined') return;
        localStorage.setItem('dashboard_show_paid_orders', showPaidOrders ? '1' : '0');
    }, [showPaidOrders]);

    useEffect(() => {
        if (role === 'admin') {
            checkWalletBalance('USDT');
        }
    }, [role, checkWalletBalance]);

    const handleCancelOrder = async (order: Order) => {
        try {
            await cancelOrder(order.id);
        } catch (err) {
            console.error(err);
        }
    };

    const handleShare = async (order: Order) => {
        try {
            if (!order.proofUrl) {
                toast.error('Este pedido no tiene comprobante para compartir.');
                return;
            }

            const shareText = `Comprobante de pago para ${order.clientName}`;
            const isNative = Capacitor.isNativePlatform() && Capacitor.getPlatform() !== 'web';

            if (isNative) {
                const canShare = await Share.canShare();
                if (!canShare.value) {
                    throw new Error('Plugins nativos de compartir no disponibles.');
                }

                const extension = (order.proofUrl.split('.').pop() || 'jpg').split('?')[0];
                const fileName = `comprobante_${order.id.slice(-5)}_${Date.now()}.${extension}`;

                await Filesystem.downloadFile({
                    url: order.proofUrl,
                    path: fileName,
                    directory: Directory.Cache
                });

                const uriResult = await Filesystem.getUri({
                    path: fileName,
                    directory: Directory.Cache
                });

                await Share.share({
                    title: 'Comprobante de Pago',
                    text: shareText,
                    url: uriResult.uri,
                    dialogTitle: 'Compartir comprobante',
                });
                return;
            }

            if (navigator.share && (navigator as any).canShare) {
                const response = await fetch(order.proofUrl);
                const blob = await response.blob();
                const file = new File([blob], `comprobante_${order.id.slice(-5)}.jpg`, { type: blob.type || 'image/jpeg' });

                if ((navigator as any).canShare({ files: [file] })) {
                    await navigator.share({
                        files: [file],
                        title: 'Comprobante de Pago',
                        text: shareText,
                    });
                    return;
                }
            }

            toast.error('Tu dispositivo no soporta compartir archivos directamente.');
        } catch (error: any) {
            console.error('Error sharing proof:', error);
            const message = String(error?.message || error || '');
            if (message.toLowerCase().includes('cancel')) {
                return;
            }
            toast.error('Error al compartir comprobante.');
        }
    };

    const toggleBatchSelect = (orderId: string) => {
        setSelectedForBatch(prev => {
            const next = new Set(prev);
            if (next.has(orderId)) next.delete(orderId);
            else next.add(orderId);
            return next;
        });
    };

    const handleSidebarNavigate = (id: string) => {
        switch (id) {
            case 'new-order': setIsOrderFormOpen(true); break;
            case 'update-rate':
                if (role === 'admin') setIsRateModalOpen(true);
                break;
            default: navigate(id as any); break;
        }
    };

    const pendingTotalVes = pending.reduce((sum, o) => sum + (o.destinationAmount || 0), 0);
    const paidTotalVes = paid.reduce((sum, o) => sum + (o.destinationAmount || 0), 0);
    const activeBatchSize = pending.filter(o => selectedForBatch.has(o.id)).length;
    const availableVesBalance = Math.max(0, Math.round((vesTotalBalance - pendingTotalVes) * 100) / 100);
    const vesAvailabilityLoading = vesAccountsLoading || ordersLoading;

    return (
        <div className="min-h-screen bg-gray-50">
            <header className="bg-white border-b border-gray-100 sticky top-0 z-50">
                <div className="max-w-900 mx-auto px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setIsSidebarOpen(true)}
                            className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
                        >
                            <Menu className="w-4.5 h-4.5 text-gray-600" />
                        </button>
                        <div className="flex items-center gap-2">
                            <div className="w-7 h-7 bg-gradient-to-br from-manzano-400 to-manzano-600 rounded-lg flex items-center justify-center">
                                <Apple className="w-3.5 h-3.5 text-white" />
                            </div>
                            <div>
                                <h1 className="text-sm font-bold text-gray-800">Manzano App</h1>
                                <p className="text-[10px] text-gray-400">{user?.email}</p>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {role === 'admin' && (
                            activeBatchSize === 0 ? (
                                <button
                                    onClick={() => setShowCreateBatch(true)}
                                    title="Iniciar Lote"
                                    className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 hover:bg-gray-200 transition-colors"
                                >
                                    <Clock className="w-4 h-4" />
                                </button>
                            ) : (
                                <button
                                    onClick={() => setShowBatchModal(true)}
                                    title={`Pagar Lote (${activeBatchSize})`}
                                    className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-white hover:bg-emerald-600 transition-colors shadow-sm shadow-emerald-200"
                                >
                                    <span className="text-[11px] font-bold">{activeBatchSize}</span>
                                </button>
                            )
                        )}
                        <Button variant="primary" onClick={() => setIsOrderFormOpen(true)} className="!text-xs !py-2 flex items-center gap-1.5 rounded-full px-4">
                            <Plus className="w-3.5 h-3.5" />
                            Pedido
                        </Button>
                    </div>
                </div>
            </header>

            <main className="max-w-900 mx-auto px-4 py-6 space-y-6">
                <MarqueeTicker rates={rates} loading={ratesLoading} />

                <div className={`grid gap-2 ${role === 'admin' ? 'grid-cols-2 md:grid-cols-4' : role === 'seller' ? 'grid-cols-2 md:grid-cols-3' : 'grid-cols-2'}`}>
                    <StatCard label="Pendientes" value={pending.length} color="amber" icon={Clock} />
                    <StatCard label="Pagados Hoy" value={paid.length} color="green" icon={CheckCircle} />
                    {role === 'seller' && (
                        <StatCard
                            label="Disp. VES"
                            value={vesAvailabilityLoading
                                ? '...'
                                : availableVesBalance.toLocaleString('es-VE', { maximumFractionDigits: 0 })
                            }
                            color="blue"
                            prefix="Bs "
                            icon={CircleDollarSign}
                        />
                    )}
                    {role === 'admin' && (
                        <>
                            <StatCard
                                label="Saldo total VES"
                                value={vesTotalBalance.toLocaleString('es-VE', { maximumFractionDigits: 0 })}
                                color="blue"
                                prefix="Bs"
                                icon={CircleDollarSign}
                                onClick={() => navigate('accounts')}
                            />
                            <StatCard 
                                label="Fondeo USDT" 
                                value={binanceBalance ? Number(binanceBalance.free).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '...'} 
                                color="green" 
                                prefix="$" 
                                icon={CircleDollarSign} 
                                onClick={() => checkWalletBalance('USDT')}
                            />
                            <StatCard label="Tasa VES" value={rates.VES > 0 ? rates.VES.toFixed(3) : '—'} color="purple" icon={TrendingUp} onClick={() => setIsRateModalOpen(true)} />
                        </>
                    )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* COLUMNA 1: PENDIENTES */}
                    <section>
                        <div className="flex items-center gap-3">
                            <h2 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                                <Clock className="w-4 h-4 text-amber-500" />
                                Pendientes ({pending.length})
                            </h2>
                            {pendingTotalVes > 0 && (
                                <span className="text-[11px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">
                                    Bs {pendingTotalVes.toLocaleString('es-VE')}
                                </span>
                            )}
                        </div>
                        {ordersLoading ? (
                            <div className="text-center py-8 text-gray-400 text-sm animate-pulse">Cargando...</div>
                        ) : pending.length === 0 ? (
                            <div className="text-center py-8 bg-white rounded-xl border border-gray-100">
                                <CheckCircle className="w-8 h-8 text-green-300 mx-auto mb-2" />
                                <p className="text-gray-400 text-sm">No hay pedidos pendientes</p>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-3">
                                {pending.map(order => (
                                    <OrderCard
                                        key={order.id}
                                        order={order}
                                        onClick={() => setSelectedOrder(order)}
                                        isSelected={selectedForBatch.has(order.id)}
                                        onToggleSelect={() => toggleBatchSelect(order.id)}
                                        onCancel={() => handleCancelOrder(order)}
                                        onCopy={() => copyOrderData(order)}
                                        onPay={() => setSelectedOrder(order)}
                                        isUpdating={actionLoading}
                                    />
                                ))}
                            </div>
                        )}
                    </section>

                    {/* COLUMNA 2: PAGADOS HOY */}
                    <section>
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                                <h2 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                                    <CheckCircle className="w-4 h-4 text-emerald-500" />
                                    Pagados Hoy ({paid.length})
                                </h2>
                                {paidTotalVes > 0 && (
                                    <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                                        Bs {paidTotalVes.toLocaleString('es-VE')}
                                    </span>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowPaidOrders(prev => !prev)}
                                className="w-8 h-8 rounded-full bg-white border border-emerald-200 text-emerald-600 flex items-center justify-center hover:bg-emerald-50 transition-colors"
                                title={showPaidOrders ? 'Ocultar pagados' : 'Mostrar pagados'}
                                aria-label={showPaidOrders ? 'Ocultar pedidos pagados' : 'Mostrar pedidos pagados'}
                            >
                                {showPaidOrders ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                        {!showPaidOrders ? (
                            <div className="text-center py-8 bg-white rounded-xl border border-gray-100">
                                <p className="text-gray-400 text-sm">Pagados ocultos. Pulsa el ojo para mostrarlos.</p>
                            </div>
                        ) : ordersLoading ? (
                            <div className="text-center py-8 text-gray-400 text-sm animate-pulse">Cargando...</div>
                        ) : paid.length === 0 ? (
                            <div className="text-center py-8 bg-white rounded-xl border border-gray-100">
                                <p className="text-gray-400 text-sm">No hay pagos registrados hoy.</p>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-3">
                                {paid.map(order => (
                                    <OrderCard
                                        key={order.id}
                                        order={order}
                                        onClick={() => setSelectedOrder(order)}
                                        onShare={() => handleShare(order)}
                                    />
                                ))}
                            </div>
                        )}
                    </section>
                </div>
            </main>

            <Sidebar
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
                onNavigate={handleSidebarNavigate}
                onLogout={logout}
                role={role}
                userEmail={user?.email || undefined}
            />

            <OrderForm
                isOpen={isOrderFormOpen}
                onClose={() => setIsOrderFormOpen(false)}
                availableVesBalance={availableVesBalance}
                vesBalanceLoading={vesAvailabilityLoading}
            />
            <OrderDetailModal order={selectedOrder} isOpen={!!selectedOrder} onClose={() => setSelectedOrder(null)} />
            <UpdateRateModal isOpen={isRateModalOpen} onClose={() => setIsRateModalOpen(false)} />

            <CreateBatchModal
                isOpen={showCreateBatch}
                onClose={() => setShowCreateBatch(false)}
                onSuccess={() => setShowCreateBatch(false)}
            />

            <BatchPaymentModal
                isOpen={showBatchModal}
                onClose={() => setShowBatchModal(false)}
                selectedOrders={pending.filter(o => selectedForBatch.has(o.id))}
                onSuccess={() => {
                    setShowBatchModal(false);
                    setSelectedForBatch(new Set());
                }}
            />
        </div>
    );
}

function StatCard({ label, value, color, prefix, icon: Icon, onClick }: {
    label: string; value: string | number; color: string; prefix?: string; icon: typeof Clock; onClick?: () => void;
}) {
    const colorMap: Record<string, { card: string; icon: string }> = {
        amber: { card: 'bg-amber-50 border-amber-100', icon: 'text-amber-500' },
        green: { card: 'bg-emerald-50 border-emerald-100', icon: 'text-emerald-500' },
        blue: { card: 'bg-blue-50 border-blue-100', icon: 'text-blue-500' },
        purple: { card: 'bg-purple-50 border-purple-100', icon: 'text-purple-500' },
    };
    const c = colorMap[color] || { card: 'bg-gray-50 border-gray-100', icon: 'text-gray-500' };
    const Wrapper = onClick ? 'button' : 'div';
    return (
        <Wrapper onClick={onClick} className={`rounded-lg border p-2 ${c.card} ${onClick ? 'cursor-pointer hover:shadow-sm active:scale-[0.97] transition-all' : ''} text-left`}>
            <div className="flex items-center justify-between mb-0.5">
                <p className="text-[10px] font-medium text-gray-500">{label}</p>
                <Icon className={`w-3 h-3 ${c.icon}`} />
            </div>
            <p className="text-sm font-bold text-gray-800">{prefix}{value}</p>
        </Wrapper>
    );
}
