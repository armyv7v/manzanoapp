import { ArrowLeft, Landmark, RefreshCcw, ShieldAlert, ShieldCheck, WifiOff, FileText, Clock3 } from 'lucide-react';
import { useState } from 'react';
import { useNavigation } from '../contexts/NavigationContext';
import { useBdvMonitor } from '../hooks';

interface Props {
    onBack?: () => void;
}

function formatDate(date: Date | null) {
    if (!date) return 'Sin registro';
    return date.toLocaleString('es-VE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export function BdvMonitorScreen({ onBack }: Props = {}) {
    const { goHome } = useNavigation();
    const handleBack = onBack || goHome;
    const [toast, setToast] = useState('');
    const {
        loading,
        latestRun,
        latestRequest,
        activeRequest,
        latestStatusLabel,
        requestStateLabel,
        lastRun,
        lastFailure,
        mercantilLatestSuccess,
        mercantilLatestFailure,
        lastSeenAt,
        connectionState,
        mirroredAccounts,
        mirroredBalance,
        artifactUrls,
        requestingRetry,
        creatingPayout,
        requestRetry,
        latestMercantilPayout,
        createMercantilPayoutOrder,
    } = useBdvMonitor();

    const statusUi = {
        ok: {
            label: 'Conectado recientemente',
            card: 'bg-emerald-50 border-emerald-200 text-emerald-700',
            icon: <ShieldCheck className="w-4 h-4" />,
        },
        stale: {
            label: 'Conexión desactualizada',
            card: 'bg-amber-50 border-amber-200 text-amber-700',
            icon: <ShieldAlert className="w-4 h-4" />,
        },
        down: {
            label: 'Sin sync reciente',
            card: 'bg-red-50 border-red-200 text-red-700',
            icon: <WifiOff className="w-4 h-4" />,
        },
    }[connectionState];

    const visibleArtifacts: Array<{
        kind?: string;
        fileName?: string;
        relativePath?: string;
        storagePath?: string;
    }> = (lastFailure?.artifacts?.length ? lastFailure.artifacts : lastRun?.artifacts) || [];

    const handleRequestRetry = async () => {
        try {
            await requestRetry();
            setToast('Solicitud de reintento enviada. El bot local debe tomarla desde Firestore.');
            setTimeout(() => setToast(''), 3000);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'No se pudo solicitar el reintento.';
            setToast(message);
            setTimeout(() => setToast(''), 3500);
        }
    };

    const handleCreateMercantilPayout = async () => {
        try {
            await createMercantilPayoutOrder();
            setToast('Payout Mercantil creado. El worker debe procesarlo desde la sesión manual abierta.');
            setTimeout(() => setToast(''), 3500);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'No se pudo crear el payout Mercantil.';
            setToast(message);
            setTimeout(() => setToast(''), 3500);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50">
            <header className="bg-white border-b border-gray-100 sticky top-0 z-50">
                <div className="max-w-900 mx-auto px-4 py-3 flex items-center gap-3">
                    <button onClick={handleBack} className="text-gray-400 hover:text-gray-700 transition-colors">
                        <ArrowLeft className="w-4 h-4" />
                    </button>
                    <h1 className="text-sm font-bold text-gray-800">Monitor BDV Ender</h1>
                </div>
            </header>

            <main className="max-w-900 mx-auto px-4 py-6 space-y-5">
                {toast && (
                    <div className="bg-gray-900 text-white text-sm rounded-xl px-4 py-3 shadow-lg">
                        {toast}
                    </div>
                )}

                <div className="bg-gradient-to-r from-sky-700 to-blue-900 rounded-2xl p-5 text-white shadow-lg">
                    <div className="flex items-center justify-between mb-3">
                        <div>
                            <p className="text-xs text-sky-200 font-medium">Saldo espejo BDV Ender</p>
                            <p className="text-3xl font-bold mt-1">
                                {mirroredBalance.toLocaleString('es-VE', { minimumFractionDigits: 2 })} <span className="text-lg text-sky-200">VES</span>
                            </p>
                        </div>
                        <Landmark className="w-10 h-10 text-sky-200/60" />
                    </div>
                    <div className="flex gap-6 mt-2 pt-3 border-t border-sky-500/30 text-sm">
                        <div>
                            <p className="text-[10px] text-sky-200">Cuentas espejo</p>
                            <p className="font-bold">{mirroredAccounts.length}</p>
                        </div>
                        <div>
                            <p className="text-[10px] text-sky-200">Último sync</p>
                            <p className="font-bold text-xs">{lastSeenAt ? formatDate(lastSeenAt) : 'Sin datos'}</p>
                        </div>
                        <div>
                            <p className="text-[10px] text-sky-200">Estado bot</p>
                            <p className="font-bold text-xs">{latestStatusLabel}</p>
                        </div>
                        <div>
                            <p className="text-[10px] text-sky-200">Solicitud</p>
                            <p className="font-bold text-xs">{requestStateLabel}</p>
                        </div>
                    </div>
                </div>

                <section className={`rounded-xl border p-4 ${statusUi.card}`}>
                    <div className="flex items-center gap-2 font-bold text-sm">
                        {statusUi.icon}
                        <span>{statusUi.label}</span>
                    </div>
                    <p className="text-xs mt-2">
                        Estado estimado según el último `bank_sync_runs` guardado por el bot BDV.
                    </p>
                    <div className="grid grid-cols-2 gap-3 mt-4 text-xs">
                        <div className="bg-white/70 rounded-lg p-3 border border-white/60">
                            <p className="text-gray-500">Propietario detectado</p>
                            <p className="font-bold text-gray-800 mt-1">{lastRun?.ownerLabel || 'Ender / sin sync'}</p>
                        </div>
                        <div className="bg-white/70 rounded-lg p-3 border border-white/60">
                            <p className="text-gray-500">Modo</p>
                            <p className="font-bold text-gray-800 mt-1">{lastRun?.mode || 'read_only'}</p>
                        </div>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                        <button
                            type="button"
                            onClick={handleRequestRetry}
                            disabled={requestingRetry || !!activeRequest}
                            className="bg-white text-gray-900 hover:bg-gray-100 disabled:opacity-60 text-xs font-bold px-4 py-2 rounded-lg border border-white/70 transition-colors"
                        >
                            {requestingRetry ? 'Solicitando...' : activeRequest ? 'Solicitud activa' : 'Solicitar reintento'}
                        </button>
                        <p className="text-[11px] opacity-90">
                            {activeRequest
                                ? 'Ya hay una solicitud activa. Esperá a que el bot la termine de procesar.'
                                : 'Crea una solicitud en Firestore. El bot local debe leerla y ejecutar el intento.'}
                        </p>
                    </div>
                </section>

                {latestRequest && (
                    <section className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
                        <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                            <Clock3 className="w-4 h-4 text-amber-500" />
                            Estado de la solicitud BDV
                        </h3>
                        <div className="grid grid-cols-2 gap-3 text-xs">
                            <div className="bg-gray-50 rounded-lg p-3">
                                <p className="text-gray-400">Estado request</p>
                                <p className="font-bold text-gray-800 mt-1">{latestRequest.status || 'Sin estado'}</p>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-3">
                                <p className="text-gray-400">Host procesador</p>
                                <p className="font-bold text-gray-800 mt-1">{latestRequest.processorHost || 'No asignado'}</p>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-3">
                                <p className="text-gray-400">Solicitada</p>
                                <p className="font-bold text-gray-800 mt-1">{latestRequest.requestedAt?.toDate ? formatDate(latestRequest.requestedAt.toDate()) : 'Sin fecha'}</p>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-3">
                                <p className="text-gray-400">Completada</p>
                                <p className="font-bold text-gray-800 mt-1">{latestRequest.completedAt?.toDate ? formatDate(latestRequest.completedAt.toDate()) : 'En curso'}</p>
                            </div>
                        </div>
                    </section>
                )}

                {lastFailure && (
                    <section className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3 text-red-800">
                        <h3 className="text-sm font-bold flex items-center gap-2">
                            <WifiOff className="w-4 h-4" />
                            Último error BDV
                        </h3>
                        <div className="grid grid-cols-2 gap-3 text-xs">
                            <div className="bg-white/70 rounded-lg p-3 border border-red-100">
                                <p className="text-red-500">Comando</p>
                                <p className="font-bold text-gray-800 mt-1">{lastFailure.command || 'sync'}</p>
                            </div>
                            <div className="bg-white/70 rounded-lg p-3 border border-red-100">
                                <p className="text-red-500">Registrado</p>
                                <p className="font-bold text-gray-800 mt-1">{lastFailure.createdAt?.toDate ? formatDate(lastFailure.createdAt.toDate()) : 'Sin fecha'}</p>
                            </div>
                        </div>
                        <div className="bg-white/70 rounded-lg p-3 border border-red-100 text-xs">
                            <p className="text-red-500 mb-1">Detalle</p>
                            <p className="font-medium text-gray-800 break-words">{lastFailure.errorMessage || 'Sin mensaje de error'}</p>
                        </div>
                    </section>
                )}

                <section className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
                    <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                        <FileText className="w-4 h-4 text-violet-500" />
                        Trazas y artifacts del bot
                    </h3>

                    {visibleArtifacts.length === 0 ? (
                        <p className="text-sm text-gray-500">Todavía no hay artifacts registrados en Firestore para este bot.</p>
                    ) : (
                        <div className="space-y-2">
                            {visibleArtifacts.map((artifact, index) => (
                                <div key={`${artifact.relativePath || artifact.fileName || 'artifact'}-${index}`} className="bg-gray-50 rounded-lg p-3 flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="text-xs font-semibold text-gray-700">{artifact.fileName || 'Artifact del bot'}</p>
                                        <p className="text-[11px] text-gray-400 mt-1 break-all">{artifact.relativePath || 'Sin ruta'}</p>
                                        {artifact.storagePath && artifactUrls[artifact.storagePath] && (
                                            <a
                                                href={artifactUrls[artifact.storagePath]}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="inline-block mt-2 text-[11px] font-bold text-sky-600 hover:text-sky-700"
                                            >
                                                Abrir artifact
                                            </a>
                                        )}
                                    </div>
                                    <span className="text-[11px] font-bold uppercase text-violet-600 shrink-0">{artifact.kind || 'file'}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                <section className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
                    <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                        <Landmark className="w-4 h-4 text-emerald-600" />
                        Monitor Mercantil
                    </h3>

                    <div className="flex flex-wrap items-center gap-3">
                        <button
                            type="button"
                            onClick={handleCreateMercantilPayout}
                            disabled={creatingPayout}
                            className="bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 text-xs font-bold px-4 py-2 rounded-lg transition-colors"
                        >
                            {creatingPayout ? 'Creando payout...' : 'Crear payout Emma'}
                        </button>
                        <p className="text-[11px] text-gray-500">
                            Crea una orden real en `payout_orders` para que el worker Mercantil la procese.
                        </p>
                    </div>

                    {latestMercantilPayout && (
                        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2 text-xs">
                            <p className="font-bold text-gray-800">Último payout Mercantil</p>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <p className="text-gray-400">Estado</p>
                                    <p className="font-bold text-gray-800 mt-1">{latestMercantilPayout.status}</p>
                                </div>
                                <div>
                                    <p className="text-gray-400">Beneficiario</p>
                                    <p className="font-bold text-gray-800 mt-1">{latestMercantilPayout.beneficiaryAlias || 'Sin alias'}{latestMercantilPayout.beneficiaryLast4 ? ` · ****${latestMercantilPayout.beneficiaryLast4}` : ''}</p>
                                </div>
                                <div>
                                    <p className="text-gray-400">Monto</p>
                                    <p className="font-bold text-gray-800 mt-1">{latestMercantilPayout.amountBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.</p>
                                </div>
                                <div>
                                    <p className="text-gray-400">Referencia</p>
                                    <p className="font-bold text-gray-800 mt-1">{latestMercantilPayout.reference || 'Pendiente'}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {!mercantilLatestSuccess && !mercantilLatestFailure ? (
                        <p className="text-sm text-gray-500">Todavía no hay syncs de Mercantil guardados en `bank_sync_runs`.</p>
                    ) : (
                        <>
                            {mercantilLatestSuccess && (
                                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-3">
                                    <div className="grid grid-cols-2 gap-3 text-xs">
                                        <div className="bg-white/80 rounded-lg p-3">
                                            <p className="text-gray-400">Titular</p>
                                            <p className="font-bold text-gray-800 mt-1">{mercantilLatestSuccess.ownerLabel || 'Sin titular'}</p>
                                        </div>
                                        <div className="bg-white/80 rounded-lg p-3">
                                            <p className="text-gray-400">Cuenta</p>
                                            <p className="font-bold text-gray-800 mt-1">{mercantilLatestSuccess.summary?.accountLabel || 'Sin cuenta'}</p>
                                        </div>
                                        <div className="bg-white/80 rounded-lg p-3">
                                            <p className="text-gray-400">Disponible</p>
                                            <p className="font-bold text-emerald-700 mt-1">
                                                {typeof mercantilLatestSuccess.summary?.availableBalanceBs === 'number'
                                                    ? mercantilLatestSuccess.summary.availableBalanceBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })
                                                    : 'Sin dato'} Bs.
                                            </p>
                                        </div>
                                        <div className="bg-white/80 rounded-lg p-3">
                                            <p className="text-gray-400">Mes</p>
                                            <p className="font-bold text-gray-800 mt-1">{mercantilLatestSuccess.summary?.monthLabel || 'Sin período'}</p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-3 gap-3 text-xs">
                                        <div className="bg-white/80 rounded-lg p-3">
                                            <p className="text-gray-400">Diferido</p>
                                            <p className="font-bold text-gray-800 mt-1">{typeof mercantilLatestSuccess.summary?.balanceBreakdown?.deferredBs === 'number' ? mercantilLatestSuccess.summary.balanceBreakdown.deferredBs.toLocaleString('es-VE', { minimumFractionDigits: 2 }) : '0,00'} Bs.</p>
                                        </div>
                                        <div className="bg-white/80 rounded-lg p-3">
                                            <p className="text-gray-400">Bloqueado</p>
                                            <p className="font-bold text-gray-800 mt-1">{typeof mercantilLatestSuccess.summary?.balanceBreakdown?.blockedBs === 'number' ? mercantilLatestSuccess.summary.balanceBreakdown.blockedBs.toLocaleString('es-VE', { minimumFractionDigits: 2 }) : '0,00'} Bs.</p>
                                        </div>
                                        <div className="bg-white/80 rounded-lg p-3">
                                            <p className="text-gray-400">Total</p>
                                            <p className="font-bold text-gray-800 mt-1">{typeof mercantilLatestSuccess.summary?.balanceBreakdown?.totalBs === 'number' ? mercantilLatestSuccess.summary.balanceBreakdown.totalBs.toLocaleString('es-VE', { minimumFractionDigits: 2 }) : '0,00'} Bs.</p>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <p className="text-xs font-bold text-gray-700">Movimientos visibles</p>
                                        {mercantilLatestSuccess.movements?.length ? mercantilLatestSuccess.movements.map((movement, index) => (
                                            <div key={`${movement.date || 'date'}-${movement.reference || index}`} className="bg-white/80 rounded-lg p-3 flex items-center justify-between gap-3">
                                                <div>
                                                    <p className="text-xs font-semibold text-gray-700">{movement.description || 'Movimiento'}</p>
                                                    <p className="text-[11px] text-gray-400 mt-1">{movement.date || 'Sin fecha'} · Ref {movement.reference || 's/n'}</p>
                                                </div>
                                                <p className="text-sm font-bold text-emerald-700">
                                                    {typeof movement.amountBs === 'number' ? movement.amountBs.toLocaleString('es-VE', { minimumFractionDigits: 2 }) : '0,00'} Bs.
                                                </p>
                                            </div>
                                        )) : (
                                            <p className="text-sm text-gray-500">No hay movimientos visibles en este snapshot.</p>
                                        )}
                                    </div>
                                </div>
                            )}

                            {mercantilLatestFailure && (
                                <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-xs text-red-800">
                                    <p className="font-bold">Último error Mercantil</p>
                                    <p className="mt-2">{mercantilLatestFailure.errorMessage || 'Sin detalle de error'}</p>
                                </div>
                            )}
                        </>
                    )}
                </section>

                <section className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
                    <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                        <RefreshCcw className="w-4 h-4 text-blue-500" />
                        Último snapshot BDV
                    </h3>

                    {loading ? (
                        <p className="text-sm text-gray-400 animate-pulse">Cargando monitor BDV...</p>
                    ) : !lastRun ? (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
                            No hay sync exitoso guardado todavía. Si BDV sigue caído, la app solo puede mostrar el saldo espejo interno de Manzano.
                        </div>
                    ) : (
                        <>
                            <div className="grid grid-cols-2 gap-3 text-xs">
                                <div className="bg-gray-50 rounded-lg p-3">
                                    <p className="text-gray-400">Capturado</p>
                                    <p className="font-bold text-gray-800 mt-1">{formatDate(lastSeenAt)}</p>
                                </div>
                                <div className="bg-gray-50 rounded-lg p-3">
                                    <p className="text-gray-400">Cuentas visibles</p>
                                    <p className="font-bold text-gray-800 mt-1">{lastRun.accounts?.length || 0}</p>
                                </div>
                            </div>

                            <div className="space-y-2">
                                {(lastRun.accounts || []).map((account, index) => (
                                    <div key={`${account.maskedAccount || 'acc'}-${index}`} className="bg-gray-50 rounded-lg p-3 flex items-center justify-between gap-3">
                                        <div>
                                            <p className="text-xs font-semibold text-gray-700">{account.description || 'Cuenta BDV'}</p>
                                            <p className="text-[11px] text-gray-400 mt-1">{account.maskedAccount || 'Sin máscara de cuenta'}</p>
                                        </div>
                                        <div className="text-right text-[11px]">
                                            <p className="text-gray-500">Saldo visible: <span className="font-bold text-gray-700">{account.balanceVisible ? 'Sí' : 'No'}</span></p>
                                            <p className="text-gray-500 mt-1">Movimientos: <span className="font-bold text-gray-700">{account.movementActionVisible ? 'Disponible' : 'No detectado'}</span></p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </section>

                <section className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
                    <h3 className="text-sm font-bold text-gray-800">Cuentas BDV espejo en Manzano</h3>

                    {mirroredAccounts.length === 0 ? (
                        <p className="text-sm text-gray-500">No encontré cuentas internas con titular `Ender` y banco `BDV/Banco de Venezuela`.</p>
                    ) : (
                        <div className="space-y-2">
                            {mirroredAccounts.map((account) => (
                                <div key={account.id} className="bg-gray-50 rounded-lg p-3 flex items-center justify-between gap-3">
                                    <div>
                                        <p className="text-xs font-semibold text-gray-700">{account.bank}</p>
                                        <p className="text-[11px] text-gray-400 mt-1">{account.holder}</p>
                                    </div>
                                    <p className="text-sm font-bold text-sky-700">
                                        {account.balance.toLocaleString('es-VE', { minimumFractionDigits: 2 })} VES
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                <section className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
                    <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                        <Clock3 className="w-4 h-4 text-sky-500" />
                        Último estado del bot
                    </h3>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                        <div className="bg-gray-50 rounded-lg p-3">
                            <p className="text-gray-400">Estado</p>
                            <p className="font-bold text-gray-800 mt-1">{latestStatusLabel}</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3">
                            <p className="text-gray-400">Último evento</p>
                            <p className="font-bold text-gray-800 mt-1">{latestRun?.status || 'Sin eventos'}</p>
                        </div>
                    </div>
                </section>
            </main>
        </div>
    );
}
