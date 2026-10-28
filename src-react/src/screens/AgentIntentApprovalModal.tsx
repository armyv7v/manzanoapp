import { useState, useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../hooks';
import { useToast } from '../contexts/ToastContext';
import { useNavigation } from '../contexts/NavigationContext';
import { Modal, Button } from '../components/ui';
import { Bot, CheckCircle2, XCircle, Clock, ShieldAlert } from 'lucide-react';

interface AgentIntent {
    id: string;
    kind: 'create_order' | 'adjust_balance';
    status: 'pending' | 'approved' | 'executed' | 'rejected' | 'expired';
    summary?: {
        description?: string;
        montoCLP?: number;
        montoVES?: number;
        cuenta?: string;
        montoAjuste?: number;
        [key: string]: any;
    };
    orderPayload?: Record<string, any>;
    adjustmentPayload?: {
        accountId: string;
        amount: number;
        reason?: string;
        /** Tasa original de la transaccion que origina este abono (opcional, editable al aprobar). */
        purchaseRateVES?: number;
    };
    createdAt?: any;
    expiresAt?: any;
}

const AGENT_API_BASE = 'https://us-central1-manzanoapp-2f775.cloudfunctions.net/agentApi';

export function AgentIntentApprovalModal() {
    const { user, role } = useAuth();
    const toast = useToast();
    const { params } = useNavigation();
    const [pendingIntents, setPendingIntents] = useState<AgentIntent[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [loadingIntentId, setLoadingIntentId] = useState<string | null>(null);
    // Tasa de la operacion: pre-cargada con la tasa original de la transaccion, editable por el admin
    const [rateInput, setRateInput] = useState<string>('');
    // Intents descartados en esta sesion (cerrar sin decidir no vuelve a abrir el popup)
    const dismissedIntentIdsRef = useRef<Set<string>>(new Set(
        typeof window !== 'undefined' ? JSON.parse(sessionStorage.getItem('manzano_dismissed_intents') || '[]') : []
    ));

    const markDismissed = (id: string) => {
        dismissedIntentIdsRef.current.add(id);
        try { sessionStorage.setItem('manzano_dismissed_intents', JSON.stringify([...dismissedIntentIdsRef.current])); } catch { /* ignore */ }
    };

    // Pre-llenar la tasa original cuando cambia el intent mostrado
    useEffect(() => {
        const original = pendingIntents[0]?.adjustmentPayload?.purchaseRateVES;
        setRateInput(original && Number(original) > 0 ? String(original) : '');
    }, [pendingIntents[0]?.id]);

    // Escuchar intenciones pendientes en tiempo real para admins
    useEffect(() => {
        if (!user || role !== 'admin') return;

        const q = query(
            collection(db, 'agent_intents'),
            where('status', '==', 'pending')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list: AgentIntent[] = snapshot.docs.map((docSnap) => ({
                id: docSnap.id,
                ...docSnap.data(),
            })) as AgentIntent[];

            // Filtrar las expiradas
            const now = Date.now();
            const validList = list.filter((item) => {
                const expMillis = item.expiresAt?.toMillis?.() || item.expiresAt || 0;
                return expMillis === 0 || expMillis > now;
            });

            setPendingIntents(validList);

            // Auto-abrir el modal cuando llega un intent pending NUEVO (no descartado).
            // Asi funciona al tocar la notificacion, al abrir el link /intents?id=...,
            // o simplemente con la app abierta en primer plano.
            if (validList.length > 0) {
                const fresh = validList.filter((item) => !dismissedIntentIdsRef.current.has(item.id));
                if (fresh.length > 0) {
                    setIsOpen(true);
                }
            }

            // Abrir modal automáticamente si hay una intención explícita en URL
            if (params?.intentId) {
                setIsOpen(true);
            }
        });

        return () => unsubscribe();
    }, [user, role, params?.intentId]);

    if (role !== 'admin' || pendingIntents.length === 0) {
        return null;
    }

    const currentIntent = pendingIntents[0];

    const handleApprove = async (intent: AgentIntent) => {
        if (!user) return;
        setLoadingIntentId(intent.id);

        try {
            // 1. Obtener Firebase ID Token del usuario autenticado
            const idToken = await user.getIdToken();

            // 2. Llamar al endpoint /approve del backend
            const approveRes = await fetch(`${AGENT_API_BASE}/intents/${intent.id}/approve`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`,
                },
                // La tasa (pre-llenada con la original y editable) se fija al aprobar
                body: JSON.stringify({
                    purchaseRateVES: rateInput.trim() !== '' ? Number(rateInput) : undefined,
                }),
            });

            const approveData = await approveRes.json();
            if (!approveRes.ok || !approveData.approvalToken) {
                throw new Error(approveData.error || 'Error al aprobar la intención');
            }

            const { approvalToken } = approveData;

            // 3. Ejecutar automáticamente la intención en el backend
            // El agente usará su API Key, pero el super admin en la UI también puede disparar el execute
            const executeRes = await fetch(`${AGENT_API_BASE}/intents/${intent.id}/execute`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': '85985703a9b2f848b55bfcfb0115ebb9e72e43cb2f8fea8bf2a365e0b2acab03',
                },
                body: JSON.stringify({ approvalToken }),
            });

            const executeData = await executeRes.json();
            if (!executeRes.ok) {
                throw new Error(executeData.error || 'Aprobado, pero falló la ejecución automática');
            }

            toast.success(`✅ Intención aprobada y ejecutada${executeData.purchaseRateVESUsed ? ` (tasa aplicada: ${executeData.purchaseRateVESUsed})` : ''}`);
            if (pendingIntents.length <= 1) {
                setIsOpen(false);
            }
        } catch (err: any) {
            console.error('Error aprobando intención:', err);
            toast.error(err.message || 'Error al procesar la aprobación');
        } finally {
            setLoadingIntentId(null);
        }
    };

    const handleReject = async (intent: AgentIntent) => {
        if (!user) return;
        setLoadingIntentId(intent.id);
        try {
            const ref = doc(db, 'agent_intents', intent.id);
            await updateDoc(ref, {
                status: 'rejected',
                rejectedAt: serverTimestamp(),
                rejectedBy: user.email,
            });
            toast.info('Intención rechazada');
            if (pendingIntents.length <= 1) {
                setIsOpen(false);
            }
        } catch (err: any) {
            toast.error('Error al rechazar la intención');
        } finally {
            setLoadingIntentId(null);
        }
    };

    return (
        <>
            {/* Banner flotante en la UI principal del Dashboard */}
            <div className="fixed bottom-20 right-4 z-40 animate-bounce">
                <button
                    onClick={() => setIsOpen(true)}
                    className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-4 py-3 rounded-full shadow-2xl hover:scale-105 transition-all border border-purple-400/30"
                >
                    <Bot className="w-5 h-5 animate-pulse" />
                    <span className="text-xs font-bold">
                        {pendingIntents.length} {pendingIntents.length === 1 ? 'Intención de Agente' : 'Intenciones de Agente'}
                    </span>
                    <span className="bg-white/20 text-white text-[10px] px-2 py-0.5 rounded-full font-mono">
                        Pendiente
                    </span>
                </button>
            </div>

            {/* Modal de Aprobación */}
            <Modal
                isOpen={isOpen}
                onClose={() => {
                    // Cerrar sin decidir = descartar este intent para esta sesion (no re-abre)
                    if (currentIntent) markDismissed(currentIntent.id);
                    setIsOpen(false);
                }}
                title="🤖 Aprobación de Intención (Hermes Agent)"
            >
                <div className="space-y-4">
                    <div className="bg-purple-950/40 border border-purple-500/30 rounded-xl p-4 text-purple-100">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-mono font-bold uppercase tracking-wider text-purple-300 flex items-center gap-1.5">
                                <ShieldAlert className="w-4 h-4 text-amber-400" />
                                {currentIntent.kind === 'adjust_balance' ? 'Ajuste de Saldo' : 'Creación de Orden'}
                            </span>
                            <span className="text-[11px] text-purple-300/80 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                Intent #{currentIntent.id.slice(0, 8)}
                            </span>
                        </div>

                        <p className="text-sm font-semibold text-white mb-2">
                            {currentIntent.summary?.description || 'Solicitud generada por Hermes Agent'}
                        </p>

                        {/* Detalles si es Ajuste de Balance */}
                        {currentIntent.kind === 'adjust_balance' && currentIntent.adjustmentPayload && (
                            <div className="bg-charcoal-900/80 rounded-lg p-3 space-y-1.5 font-mono text-xs text-gray-200">
                                <div className="flex justify-between">
                                    <span className="text-gray-400">Cuenta:</span>
                                    <span className="font-bold text-indigo-300">
                                        {currentIntent.adjustmentPayload.accountId}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-400">Monto Ajuste:</span>
                                    <span className={`font-bold ${currentIntent.adjustmentPayload.amount >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        {currentIntent.adjustmentPayload.amount > 0 ? '+' : ''}
                                        {currentIntent.adjustmentPayload.amount.toLocaleString()}
                                    </span>
                                </div>
                                {currentIntent.adjustmentPayload.reason && (
                                    <div className="flex justify-between border-t border-gray-800 pt-1.5">
                                        <span className="text-gray-400">Motivo:</span>
                                        <span className="text-gray-300 truncate max-w-[200px]">
                                            {currentIntent.adjustmentPayload.reason}
                                        </span>
                                    </div>
                                )}

                                {/* Tasa original de la transaccion (pre-llenada, editable al aprobar) */}
                                {currentIntent.adjustmentPayload.amount > 0 && (
                                    <div className="border-t border-gray-800 pt-2 mt-2 space-y-1.5">
                                        <label className="flex items-center justify-between gap-2">
                                            <span className="text-gray-400 whitespace-nowrap">
                                                Tasa VES/CLP:
                                                {currentIntent.adjustmentPayload.purchaseRateVES && (
                                                    <span className="text-[10px] text-purple-300/80 block">
                                                        original: {currentIntent.adjustmentPayload.purchaseRateVES}
                                                    </span>
                                                )}
                                            </span>
                                            <input
                                                type="number"
                                                step="any"
                                                min="0"
                                                inputMode="decimal"
                                                value={rateInput}
                                                onChange={(e) => setRateInput(e.target.value)}
                                                placeholder="ej. 0.9843"
                                                className="w-28 bg-charcoal-900 border border-gray-700 rounded-lg px-2 py-1 text-right text-indigo-300 font-bold focus:outline-none focus:border-indigo-400"
                                            />
                                        </label>
                                        {Number(rateInput) > 0 && (
                                            <div className="flex justify-between text-[11px]">
                                                <span className="text-gray-500">Equivalente CLP:</span>
                                                <span className="text-manzano-400 font-mono">
                                                    ${(Math.ceil((Math.abs(currentIntent.adjustmentPayload.amount) / Number(rateInput)) * 100) / 100).toLocaleString('es-CL')} CLP
                                                </span>
                                            </div>
                                        )}
                                        {!currentIntent.adjustmentPayload.purchaseRateVES && (
                                            <p className="text-[10px] text-amber-400/90">
                                                El agente no detecto tasa original — ingresala manualmente o dejala vacia para no registrar equivalencia CLP.
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Detalles si es Creación de Orden */}
                        {currentIntent.kind === 'create_order' && currentIntent.orderPayload && (
                            <div className="bg-charcoal-900/80 rounded-lg p-3 space-y-1.5 font-mono text-xs text-gray-200">
                                <div className="flex justify-between">
                                    <span className="text-gray-400">Cliente:</span>
                                    <span className="font-bold text-white">
                                        {currentIntent.orderPayload.clientName}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-400">Monto CLP:</span>
                                    <span className="font-bold text-manzano-400">
                                        ${Number(currentIntent.orderPayload.clpAmount || 0).toLocaleString('es-CL')} CLP
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-400">Destino VES:</span>
                                    <span className="font-bold text-emerald-400">
                                        Bs. {Number(currentIntent.orderPayload.destinationAmount || 0).toLocaleString('es-VE')} VES
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-400">Banco:</span>
                                    <span className="text-gray-300">
                                        {currentIntent.orderPayload.bank}
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex gap-3 pt-2">
                        <Button
                            variant="danger"
                            fullWidth
                            onClick={() => handleReject(currentIntent)}
                            disabled={loadingIntentId === currentIntent.id}
                        >
                            <XCircle className="w-4 h-4 mr-1.5" />
                            Rechazar
                        </Button>
                        <Button
                            variant="primary"
                            fullWidth
                            onClick={() => handleApprove(currentIntent)}
                            isLoading={loadingIntentId === currentIntent.id}
                        >
                            <CheckCircle2 className="w-4 h-4 mr-1.5" />
                            Aprobar y Ejecutar
                        </Button>
                    </div>
                </div>
            </Modal>
        </>
    );
}
