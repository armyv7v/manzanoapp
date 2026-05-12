import { useMemo, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useExchangeRates } from '../hooks/useExchangeRates';
import { useBinanceP2PAdmin } from '../hooks/useBinanceP2PAdmin';
import { useNavigation } from '../contexts/NavigationContext';
import { USER_TAGS, isSuperAdminEmail } from '../lib/constants';

const TAG_ROLES: Record<string, string> = {
    A1: 'Super Admin',
    A2: 'Admin',
    A3: 'Admin',
    A4: 'Admin',
    A5: 'Admin',
    V1: 'Vendedor',
    V2: 'Vendedor',
    V3: 'Vendedor',
};

interface Props {
    onBack?: () => void;
}

function formatDate(date: Date | null) {
    if (!date) return 'Sin registro';
    return date.toLocaleString('es-CL', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function StatusBadge({ status }: { status: string }) {
    const map: Record<string, string> = {
        online: 'bg-emerald-100 text-emerald-700',
        idle: 'bg-emerald-100 text-emerald-700',
        running: 'bg-amber-100 text-amber-700',
        pending: 'bg-amber-100 text-amber-700',
        offline: 'bg-red-100 text-red-700',
        failed: 'bg-red-100 text-red-700',
        cancelled: 'bg-gray-200 text-gray-700',
        succeeded: 'bg-blue-100 text-blue-700',
    };

    return (
        <span className={`inline-flex items-center rounded-full px-2 py-1 text-[10px] font-bold uppercase ${map[status] || 'bg-gray-100 text-gray-600'}`}>
            {status || 'unknown'}
        </span>
    );
}

export function SettingsScreen({ onBack }: Props = {}) {
    const { goHome } = useNavigation();
    const handleBack = onBack || goHome;
    const { user, role, logout } = useAuth();
    const { rates } = useExchangeRates();
    const currentTag = user?.email ? USER_TAGS[user.email] || '—' : '—';
    const superAdmin = isSuperAdminEmail(user?.email);

    const {
        isEnabled: canUseBinanceAdmin,
        loading: binanceLoading,
        submitting: binanceSubmitting,
        runtime,
        actions,
        activeAction,
        requestAction,
        cancelAction,
    } = useBinanceP2PAdmin();

    const [toast, setToast] = useState('');
    const [prepareAmount, setPrepareAmount] = useState('100000');
    const [prepareMode, setPrepareMode] = useState<'fiat' | 'asset'>('fiat');
    const [advertiser, setAdvertiser] = useState('');
    const [rowIndex, setRowIndex] = useState('0');

    const runtimeLabel = useMemo(() => {
        if (runtime.status === 'running') return 'VPS procesando acción';
        if (runtime.status === 'idle' || runtime.status === 'online') return 'VPS listo';
        if (runtime.status === 'offline') return 'VPS sin heartbeat';
        return runtime.status || 'Sin estado';
    }, [runtime.status]);

    const showToast = (message: string) => {
        setToast(message);
        window.setTimeout(() => setToast(''), 3500);
    };

    const handleHeartbeat = async () => {
        try {
            const result = await requestAction({ actionType: 'heartbeat' });
            showToast(`Heartbeat solicitado. Acción ${result.actionId}.`);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'No se pudo solicitar el heartbeat.';
            showToast(message);
        }
    };

    const handlePrepareSell = async () => {
        try {
            const result = await requestAction({
                actionType: 'prepare_sell',
                amount: prepareAmount,
                amountMode: prepareMode,
                advertiser: advertiser.trim() || undefined,
                rowIndex: Number(rowIndex || 0),
            });
            showToast(`Pre-order enviado al VPS. Acción ${result.actionId}.`);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'No se pudo solicitar el pre-order.';
            showToast(message);
        }
    };

    const handleCancelActiveAction = async () => {
        if (!activeAction) return;
        try {
            await cancelAction(activeAction.id);
            showToast(`Acción ${activeAction.id} cancelada.`);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'No se pudo cancelar la acción activa.';
            showToast(message);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50">
            <header className="bg-white border-b border-gray-100 sticky top-0 z-50">
                <div className="max-w-900 mx-auto px-4 py-3 flex items-center gap-3">
                    <button onClick={handleBack} className="text-gray-400 hover:text-gray-700 transition-colors text-sm font-semibold">← Volver</button>
                    <h1 className="text-sm font-bold text-gray-800">Configuración</h1>
                </div>
            </header>

            <main className="max-w-900 mx-auto px-4 py-6 space-y-6">
                {toast && (
                    <div className="bg-gray-900 text-white text-sm rounded-xl px-4 py-3 shadow-lg">
                        {toast}
                    </div>
                )}

                <div className="bg-gradient-to-r from-gray-900 to-gray-700 rounded-2xl p-5 text-white shadow-lg">
                    <p className="text-xs text-gray-400 font-medium">Tu perfil</p>
                    <p className="text-lg font-bold mt-1">{user?.email}</p>
                    <div className="flex gap-4 mt-3">
                        <div>
                            <p className="text-[10px] text-gray-400">Tag</p>
                            <p className="text-sm font-bold text-manzano-300">{currentTag}</p>
                        </div>
                        <div>
                            <p className="text-[10px] text-gray-400">Rol</p>
                            <p className="text-sm font-semibold">{TAG_ROLES[currentTag] || 'Usuario'}</p>
                        </div>
                    </div>

                    <div className="mt-5 border-t border-gray-600 pt-4">
                        <button
                            onClick={() => window.dispatchEvent(new CustomEvent('request-notification-permission', { detail: { forceRefresh: true } }))}
                            className="bg-gray-800 hover:bg-gray-600 text-white text-xs font-semibold py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors w-full border border-gray-600 mb-3"
                        >
                            🔔 Activar Notificaciones Push
                        </button>
                        <button
                            onClick={async () => {
                                try {
                                    const { getFunctions, httpsCallable } = await import('firebase/functions');
                                    const app = (await import('../lib/firebase')).default;
                                    const functions = getFunctions(app);
                                    const testPush = httpsCallable(functions, 'testPushNotification');
                                    const result = await testPush();
                                    const data = result.data as any;
                                    alert(`Test Result:\nSuccess: ${data.success}\nTokens Found: ${data.tokensFound}\nDelivered: ${data.successCount}\nFailed: ${data.failureCount}\n\nDetails:\n${JSON.stringify(data.details, null, 2)}`);
                                } catch (e: any) {
                                    alert(`Test Push failed: ${e.message}`);
                                }
                            }}
                            className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors w-full border border-blue-500"
                        >
                            🧪 Probar Notificaciones Push
                        </button>
                        <p className="text-[10px] text-gray-400 mt-2 text-center">Si estás en web, haz click en Activar para autorizar y obtener un token. Luego en Probar para verificar que suena.</p>
                    </div>
                </div>

                {role === 'admin' && (
                    <section className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
                        <h3 className="text-xs font-bold text-gray-700">Estado del Sistema</h3>
                        <div className="grid grid-cols-2 gap-3 text-xs">
                            <div className="bg-gray-50 rounded-lg p-3">
                                <p className="text-gray-400">Tienda</p>
                                <p className={`font-bold ${rates.isTakingOrders ? 'text-green-600' : 'text-red-600'}`}>
                                    {rates.isTakingOrders ? '🟢 Abierta' : '🔴 Cerrada'}
                                </p>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-3">
                                <p className="text-gray-400">Balance CLP</p>
                                <p className="font-bold text-blue-600">
                                    {rates.totalClpBalance.toLocaleString('es-CL', { style: 'currency', currency: 'CLP' })}
                                </p>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-3">
                                <p className="text-gray-400">Tasa VES</p>
                                <p className="font-bold">{rates.VES > 0 ? rates.VES.toFixed(2) : '—'}</p>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-3">
                                <p className="text-gray-400">Tasa COP</p>
                                <p className="font-bold">{rates.COP > 0 ? rates.COP.toFixed(2) : '—'}</p>
                            </div>
                        </div>
                    </section>
                )}

                {canUseBinanceAdmin && (
                    <section className="bg-white rounded-xl border border-gray-100 p-4 space-y-4">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <h3 className="text-sm font-bold text-gray-800">Binance P2P · Panel admin VPS</h3>
                                <p className="text-[11px] text-gray-400 mt-1">Esta vista controla la sesión Binance alojada en el VPS, sin depender del PC local.</p>
                            </div>
                            <StatusBadge status={runtime.status} />
                        </div>

                        <div className="grid grid-cols-2 gap-3 text-xs">
                            <div className="bg-gray-50 rounded-lg p-3">
                                <p className="text-gray-400">Estado runtime</p>
                                <p className="font-bold text-gray-800 mt-1">{runtimeLabel}</p>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-3">
                                <p className="text-gray-400">Host VPS</p>
                                <p className="font-bold text-gray-800 mt-1">{runtime.host || 'Sin registrar'}</p>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-3">
                                <p className="text-gray-400">Heartbeat</p>
                                <p className="font-bold text-gray-800 mt-1">{formatDate(runtime.lastHeartbeatAt)}</p>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-3">
                                <p className="text-gray-400">Sesión Binance</p>
                                <p className="font-bold text-gray-800 mt-1">{runtime.sessionState || 'unknown'}</p>
                            </div>
                        </div>

                        {runtime.lastError && (
                            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">
                                <p className="font-bold mb-1">Último error del runtime</p>
                                <p>{runtime.lastError}</p>
                            </div>
                        )}

                        <div className="bg-gray-50 rounded-xl p-4 space-y-3 border border-gray-100">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-xs font-bold text-gray-700">Preparar venta P2P</p>
                                    <p className="text-[11px] text-gray-400 mt-1">Fase segura: abre el pre-order real en el VPS y captura evidencia. No ejecuta el place-order final.</p>
                                </div>
                                {activeAction && <StatusBadge status={activeAction.status} />}
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <label className="text-xs text-gray-600 space-y-1">
                                    <span>Monto</span>
                                    <input
                                        value={prepareAmount}
                                        onChange={(event) => setPrepareAmount(event.target.value)}
                                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800"
                                        placeholder="100000"
                                    />
                                </label>
                                <label className="text-xs text-gray-600 space-y-1">
                                    <span>Modo</span>
                                    <select
                                        value={prepareMode}
                                        onChange={(event) => setPrepareMode(event.target.value === 'asset' ? 'asset' : 'fiat')}
                                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800"
                                    >
                                        <option value="fiat">FIAT (VES)</option>
                                        <option value="asset">Asset (USDT)</option>
                                    </select>
                                </label>
                                <label className="text-xs text-gray-600 space-y-1">
                                    <span>Anunciante preferido</span>
                                    <input
                                        value={advertiser}
                                        onChange={(event) => setAdvertiser(event.target.value)}
                                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800"
                                        placeholder="Opcional"
                                    />
                                </label>
                                <label className="text-xs text-gray-600 space-y-1">
                                    <span>Índice de fila</span>
                                    <input
                                        value={rowIndex}
                                        onChange={(event) => setRowIndex(event.target.value)}
                                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800"
                                        placeholder="0"
                                    />
                                </label>
                            </div>

                            <div className="flex flex-wrap gap-3">
                                <button
                                    onClick={handlePrepareSell}
                                    disabled={binanceSubmitting || !!activeAction || !prepareAmount.trim()}
                                    className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-semibold py-2 px-4 rounded-lg transition-colors"
                                >
                                    {binanceSubmitting ? 'Enviando...' : activeAction ? 'Hay una acción activa' : 'Preparar venta en VPS'}
                                </button>
                                <button
                                    onClick={handleHeartbeat}
                                    disabled={binanceSubmitting || !!activeAction}
                                    className="bg-gray-900 hover:bg-gray-700 disabled:opacity-60 text-white text-xs font-semibold py-2 px-4 rounded-lg transition-colors"
                                >
                                    Solicitar heartbeat
                                </button>
                                {activeAction?.status === 'pending' && (
                                    <button
                                        onClick={handleCancelActiveAction}
                                        disabled={binanceSubmitting}
                                        className="bg-red-50 hover:bg-red-100 disabled:opacity-60 text-red-600 text-xs font-semibold py-2 px-4 rounded-lg border border-red-200 transition-colors"
                                    >
                                        Cancelar acción pendiente
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <p className="text-xs font-bold text-gray-700">Últimas acciones Binance P2P</p>
                                {binanceLoading && <p className="text-[11px] text-gray-400">Cargando…</p>}
                            </div>

                            {actions.length === 0 ? (
                                <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-500">
                                    Todavía no hay acciones Binance P2P registradas para este panel.
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {actions.map((action) => (
                                        <div key={action.id} className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <p className="text-xs font-bold text-gray-800 break-all">{action.actionType} · {action.id}</p>
                                                    <p className="text-[11px] text-gray-400 mt-1">
                                                        Solicitada {formatDate(action.requestedAt)}
                                                        {action.processorHost ? ` · VPS: ${action.processorHost}` : ''}
                                                    </p>
                                                </div>
                                                <StatusBadge status={action.status} />
                                            </div>

                                            <div className="grid grid-cols-2 gap-2 mt-3 text-[11px] text-gray-600">
                                                <p><span className="font-semibold text-gray-700">Monto:</span> {action.payload.amount || '—'} {action.payload.amountMode === 'asset' ? 'USDT' : 'VES'}</p>
                                                <p><span className="font-semibold text-gray-700">Fila:</span> {typeof action.payload.rowIndex === 'number' ? action.payload.rowIndex : 0}</p>
                                                <p><span className="font-semibold text-gray-700">Anunciante:</span> {action.payload.advertiser || 'Automático'}</p>
                                                <p><span className="font-semibold text-gray-700">Completada:</span> {formatDate(action.completedAt || action.cancelledAt)}</p>
                                            </div>

                                            {action.resultSummary && (
                                                <div className="mt-3 bg-white rounded-lg border border-gray-200 px-3 py-2 text-[11px] text-gray-700">
                                                    <span className="font-semibold">Resumen:</span> {action.resultSummary}
                                                </div>
                                            )}

                                            {action.errorMessage && (
                                                <div className="mt-3 bg-red-50 rounded-lg border border-red-200 px-3 py-2 text-[11px] text-red-700">
                                                    <span className="font-semibold">Error:</span> {action.errorMessage}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </section>
                )}

                {role === 'admin' && !superAdmin && (
                    <section className="bg-white rounded-xl border border-gray-100 p-4 space-y-2">
                        <h3 className="text-xs font-bold text-gray-700">Acceso Binance P2P</h3>
                        <p className="text-xs text-gray-500">
                            El panel de ejecución Binance P2P queda restringido al super admin autorizado.
                        </p>
                    </section>
                )}

                {role === 'admin' && (
                    <section className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
                        <h3 className="text-xs font-bold text-gray-700">Usuarios del Sistema</h3>
                        <div className="space-y-2">
                            {Object.entries(USER_TAGS)
                                .sort(([, a], [, b]) => a.localeCompare(b))
                                .map(([email, tag]) => (
                                    <div key={email} className={`flex items-center justify-between py-2 px-3 rounded-lg ${email === user?.email ? 'bg-manzano-50 border border-manzano-200' : 'bg-gray-50'}`}>
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className={`text-xs font-bold px-2 py-0.5 rounded ${tag.startsWith('A') ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                                                {tag}
                                            </span>
                                            <span className="text-xs text-gray-700 truncate">{email}</span>
                                        </div>
                                        <span className="text-[10px] text-gray-400 shrink-0">{TAG_ROLES[tag] || 'Usuario'}</span>
                                    </div>
                                ))}
                        </div>
                    </section>
                )}

                <button
                    onClick={logout}
                    className="w-full bg-red-50 hover:bg-red-100 text-red-600 font-semibold text-sm rounded-xl border border-red-200 py-3 transition-colors"
                >
                    Cerrar Sesión
                </button>

                <div className="text-center py-4">
                    <p className="text-[11px] text-gray-300">Manzano App v2.0 — React</p>
                </div>
            </main>
        </div>
    );
}
