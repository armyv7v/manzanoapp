import { useState, useEffect, useRef } from 'react';
import { SUPER_ADMIN_EMAIL, computeInterbankFee, isSuperAdminEmail, normalizeBankName, USER_TAGS, resolveUserTag } from '../lib/constants';
import { httpsCallable, getFunctions } from 'firebase/functions';
import { useAuth, useOrderActions, useVesAccounts } from '../hooks';
import { isPayoutAccount } from '../hooks/useVesAccounts';
import type { Order } from '../hooks/useOrders';
import { Button, Modal } from '../components/ui';


interface Props {
    order: Order | null;
    isOpen: boolean;
    onClose: () => void;
}

const TYPE_LABELS: Record<string, string> = {
    'transferencia': '🏦 Transferencia',
    'pago-movil': '📱 Pago Móvil',
    'recarga-saldo': '💳 Recarga',
};

export function OrderDetailModal({ order, isOpen, onClose }: Props) {
    const { user, role } = useAuth();
    const { markAsPaid, cancelOrder, voidPaidOrder, copyOrderData, reassignOrder, loading: actionsLoading, error } = useOrderActions();
    const { accounts } = useVesAccounts();
    const [files, setFiles] = useState<File[]>([]);
    const [sourceAccountId, setSourceAccountId] = useState('');
    const [showUpload, setShowUpload] = useState(false);
    const [copied, setCopied] = useState(false);
    const [cancelConfirmStep, setCancelConfirmStep] = useState<0 | 1 | 2>(0);
    const [toast, setToast] = useState('');
    const [resendingEmail, setResendingEmail] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [isEditingSeller, setIsEditingSeller] = useState(false);
    const [targetSellerEmail, setTargetSellerEmail] = useState('');

    const loading = actionsLoading || resendingEmail;
    const canVoidPaidOrder = role === 'admin' && isSuperAdminEmail(user?.email) && order?.status === 'Pagado';
    const requiresLegacySourceAccount = canVoidPaidOrder && !order?.sourceAccountId;

    // Calculate fee based on selected account
    const sourceAccount = accounts.find(a => a.id === sourceAccountId);
    let fee = 0;
    if (order && sourceAccount && order.destinationCurrency === 'VES') {
        if (order.type === 'pago-movil') {
            fee = computeInterbankFee(order.destinationAmount);
        } else if (order.type === 'transferencia') {
            const sourceBank = normalizeBankName(sourceAccount.bank);
            const destBank = normalizeBankName(order.bank || '');
            if (sourceBank !== destBank) {
                fee = computeInterbankFee(order.destinationAmount);
            }
        }
    }

    useEffect(() => {
        if (isOpen) {
            setCancelConfirmStep(0);
            setIsEditingSeller(false);
        }
    }, [isOpen, order?.id]);

    if (!order) return null;

    const canReassign = role === 'admin' || isSuperAdminEmail(user?.email);

    const handleReassign = async () => {
        if (!targetSellerEmail) return;
        try {
            await reassignOrder(order.id, targetSellerEmail);
            setToast('✅ Pedido reasignado correctamente');
            setIsEditingSeller(false);
            setTimeout(() => { setToast(''); onClose(); }, 1200);
        } catch {
            // Error handled in hook
        }
    };

    const handleMarkPaid = async () => {
        if (!showUpload) {
            setShowUpload(true);
            return;
        }

        if (order.destinationCurrency === 'VES' && !sourceAccountId) {
            setToast('⚠️ Seleccione una cuenta origen');
            setTimeout(() => setToast(''), 2000);
            return;
        }

        if (files.length === 0) {
            setToast('⚠️ Debe subir al menos un comprobante');
            setTimeout(() => setToast(''), 2000);
            return;
        }
        try {
            await markAsPaid(order.id, files, sourceAccountId, fee);
            setToast('✅ Pedido marcado como pagado');
            setTimeout(() => { setToast(''); onClose(); }, 1200);
            setFiles([]);
            setShowUpload(false);
        } catch {
            // Error shown by hook
        }
    };

    const handleCancel = async () => {
        try {
            if (order.status === 'Pagado') {
                if (requiresLegacySourceAccount && !sourceAccountId) {
                    setToast('⚠️ Selecciona la cuenta pagadora historica');
                    setTimeout(() => setToast(''), 2500);
                    return;
                }
                await voidPaidOrder(order.id, requiresLegacySourceAccount ? sourceAccountId : undefined);
            } else {
                await cancelOrder(order.id);
            }
            setToast(order.status === 'Pagado' ? '♻️ Pedido anulado y movimientos revertidos' : '🗑️ Pedido cancelado');
            setTimeout(() => { setToast(''); onClose(); }, 1000);
        } catch {
            // Error shown by hook
        }
    };

    const handleCopy = () => {
        copyOrderData(order);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleResendEmail = async () => {
        if (!order) return;
        setResendingEmail(true);
        try {
            const functions = getFunctions();
            const resendEmail = httpsCallable(functions, 'resendOrderEmail');
            await resendEmail({ orderId: order.id });
            setToast('📧 Correo reenviado con éxito');
            setTimeout(() => setToast(''), 3000);
        } catch (err: any) {
            setToast(`❌ Error: ${err.message || 'No se pudo enviar'}`);
            setTimeout(() => setToast(''), 4000);
        } finally {
            setResendingEmail(false);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            setFiles(prev => [...prev, ...Array.from(e.target.files!)]);
        }
    };

    const removeFile = (index: number) => {
        setFiles(prev => prev.filter((_, i) => i !== index));
    };

    const handleClose = () => {
        setFiles([]);
        setShowUpload(false);
        setSourceAccountId('');
        setCopied(false);
        setCancelConfirmStep(0);
        setToast('');
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={handleClose} title="Detalle del Pedido">
            <div className="space-y-4">
                {/* Status badge */}
                <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">#{order.id.slice(-6)}</span>
                    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${order.status === 'Pendiente de pago'
                        ? 'bg-amber-100 text-amber-800'
                        : order.status === 'Pagado'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                        {order.status}
                    </span>
                </div>

                {/* Client info */}
                <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                    <div className="flex justify-between">
                        <span className="text-xs text-gray-400">Cliente</span>
                        <span className="text-sm font-semibold text-gray-800">{order.clientName}</span>
                    </div>
                    {canReassign && (
                        <div className="flex flex-col gap-1 py-1 border-y border-gray-100 my-1">
                            <div className="flex justify-between items-center">
                                <span className="text-xs text-gray-400">Vendedor (Creador)</span>
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-mono text-gray-700 bg-gray-100 px-1.5 rounded">
                                        {resolveUserTag(order.createdByTag || order.sellerEmail || '') || order.createdByTag}
                                    </span>
                                    <button 
                                        onClick={() => {
                                            setIsEditingSeller(!isEditingSeller);
                                            setTargetSellerEmail(order.sellerEmail || order.createdByTag || '');
                                        }}
                                        className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded border border-blue-100 hover:bg-blue-100"
                                    >
                                        Editar
                                    </button>
                                </div>
                            </div>
                            {isEditingSeller && (
                                <div className="flex gap-2 items-center mt-1">
                                    <select 
                                        value={targetSellerEmail} 
                                        onChange={(e) => setTargetSellerEmail(e.target.value)}
                                        className="flex-1 text-xs border-gray-200 rounded p-1.5 focus:ring-blue-500 focus:border-blue-500"
                                    >
                                        <option value="">Selecciona vendedor...</option>
                                        {Object.entries(USER_TAGS).map(([email, tag]) => (
                                            <option key={email} value={email}>
                                                {tag} - {email}
                                            </option>
                                        ))}
                                    </select>
                                    <Button 
                                        variant="primary" 
                                        onClick={handleReassign} 
                                        isLoading={loading} 
                                        className="!text-[10px] !py-1.5 !px-3"
                                        disabled={!targetSellerEmail || targetSellerEmail === (order.sellerEmail || order.createdByTag)}
                                    >
                                        Guardar
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}
                    <div className="flex justify-between">
                        <span className="text-xs text-gray-400">Cédula</span>
                        <span className="text-sm font-mono text-gray-700">{order.cedula}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-xs text-gray-400">Tipo</span>
                        <span className="text-sm text-gray-700">{TYPE_LABELS[order.type] || order.type}</span>
                    </div>
                    {order.bank && (
                        <div className="flex justify-between">
                            <span className="text-xs text-gray-400">Banco</span>
                            <span className="text-sm text-gray-700">{order.bank}</span>
                        </div>
                    )}
                    {order.accountNumber && (
                        <div className="flex justify-between">
                            <span className="text-xs text-gray-400">Cuenta</span>
                            <span className="text-sm font-mono text-gray-700">{order.accountNumber}</span>
                        </div>
                    )}
                    {order.phone && (
                        <div className="flex justify-between">
                            <span className="text-xs text-gray-400">Teléfono</span>
                            <span className="text-sm font-mono text-gray-700">{order.phone}</span>
                        </div>
                    )}
                </div>

                {/* Amounts */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="bg-blue-50 rounded-xl p-3 text-center">
                        <p className="text-[10px] text-blue-400 uppercase font-bold">Envía</p>
                        <p className="text-lg font-bold text-blue-700">
                            {order.clpAmount.toLocaleString('es-CL', { style: 'currency', currency: 'CLP' })}
                        </p>
                    </div>
                    <div className="bg-green-50 rounded-xl p-3 text-center">
                        <p className="text-[10px] text-green-400 uppercase font-bold">Recibe</p>
                        <p className="text-lg font-bold text-green-700">
                            {order.destinationAmount.toLocaleString('es-VE', { minimumFractionDigits: 2 })} {order.destinationCurrency}
                        </p>
                    </div>
                </div>

                {/* Account Selection (Always visible for pending VES payments) */}
                {order.status === 'Pendiente de pago' && order.destinationCurrency === 'VES' && (() => {
                    const availableAccounts = accounts.filter(acc => {
                        if (!isPayoutAccount(acc)) return false;
                        let accFee = 0;
                        if (order.type === 'pago-movil') {
                            accFee = computeInterbankFee(order.destinationAmount);
                        } else if (order.type === 'transferencia') {
                            const sourceBank = normalizeBankName(acc.bank);
                            const destBank = normalizeBankName(order.bank || '');
                            if (sourceBank !== destBank) {
                                accFee = computeInterbankFee(order.destinationAmount);
                            }
                        }
                        const adminCommission = Math.ceil((order.destinationAmount * 0.01) * 100) / 100;
                        const tilloCommission = Math.ceil((order.destinationAmount * 0.0015) * 100) / 100;
                        const totalRequired = order.destinationAmount + accFee + adminCommission + tilloCommission;
                        return acc.balance >= totalRequired;
                    });

                    if (availableAccounts.length === 0) {
                        return (
                            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center space-y-3">
                                <p className="text-red-600 font-bold text-sm flex items-center justify-center gap-1.5">
                                    <span className="text-lg">⚠️</span> Fondos Insuficientes
                                </p>
                                <p className="text-xs text-red-500">
                                    Ninguna de tus cuentas tiene saldo suficiente para cubrir este envío más las comisiones automáticas.
                                </p>
                                <button
                                    type="button"
                                    onClick={() => {
                                        onClose();
                                        window.location.hash = '#ves-accounts';
                                    }}
                                    className="bg-red-100 text-red-700 hover:bg-red-200 text-[11px] font-bold py-1.5 px-3 rounded-lg transition-colors"
                                >
                                    Ir a Recargar Saldo
                                </button>
                            </div>
                        );
                    }

                    return (
                        <div className="bg-blue-50/50 border border-blue-200 rounded-xl p-4 space-y-2">
                            <label className="block text-xs font-semibold text-gray-700">
                                Cuenta Origen (VES)
                            </label>
                            <select
                                value={sourceAccountId}
                                onChange={(e) => setSourceAccountId(e.target.value)}
                                className="w-full text-sm border-gray-200 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                            >
                                <option value="">Seleccione una cuenta...</option>
                                {availableAccounts.map(acc => (
                                    <option key={acc.id} value={acc.id}>
                                        {acc.bank} - {acc.holder} (Saldo: {acc.balance.toLocaleString('es-VE')} VES)
                                    </option>
                                ))}
                            </select>
                            {sourceAccountId && (
                                <div className="text-[11px] text-gray-600 bg-white p-2 rounded border border-gray-100 mt-2">
                                    <p>Comisión bancaria: <b className="text-gray-800">{fee.toLocaleString('es-VE', { minimumFractionDigits: 2 })} VES</b></p>
                                    <p>Total a descontar: <b className="text-red-600">{(order.destinationAmount + fee + (order.destinationAmount * 0.01) + (order.destinationAmount * 0.0015)).toLocaleString('es-VE', { minimumFractionDigits: 2 })} VES</b></p>
                                </div>
                            )}
                        </div>
                    );
                })()}

                {/* Upload section (conditionally shown) */}
                {showUpload && order.status === 'Pendiente de pago' && (
                    <div className="border border-dashed border-blue-300 rounded-xl p-4 space-y-3">

                        <p className="text-xs font-semibold text-blue-600 text-center">Subir Comprobante(s)</p>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleFileChange}
                            multiple
                            className="hidden"
                        />
                        <Button
                            variant="outline"
                            fullWidth
                            onClick={() => fileInputRef.current?.click()}
                            className="!text-xs"
                        >
                            📎 Seleccionar Imagen(es)
                        </Button>
                        {files.length > 0 && (
                            <div className="space-y-1">
                                {files.map((f, i) => (
                                    <div key={i} className="flex items-center justify-between bg-white rounded-lg px-3 py-1.5 text-xs">
                                        <span className="truncate text-gray-600">{f.name}</span>
                                        <button
                                            onClick={() => removeFile(i)}
                                            className="text-red-400 hover:text-red-600 ml-2 font-bold"
                                        >
                                            ×
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Proof URLs (for paid orders) */}
                {order.proofUrl && (
                    <div className="bg-green-50 rounded-xl p-3">
                        <p className="text-[10px] text-green-500 uppercase font-bold mb-2">Comprobante</p>
                        <a
                            href={order.proofUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-600 hover:underline break-all"
                        >
                            Ver comprobante →
                        </a>
                    </div>
                )}

                {/* Email Status */}
                {order.status === 'Pagado' && order.email && (
                    <div className="bg-amber-50 rounded-xl p-3 border border-amber-100">
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-[10px] text-amber-600 uppercase font-bold">Estado del Correo</p>
                            {(role === 'admin' || role === 'seller') && (
                                <button
                                    onClick={handleResendEmail}
                                    disabled={loading}
                                    className="text-[10px] bg-amber-200 hover:bg-amber-300 text-amber-800 px-2 py-1 rounded font-bold transition-colors disabled:opacity-50"
                                >
                                    {resendingEmail ? 'Enviando...' : 'Reenviar'}
                                </button>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${(order as any).emailSent ? 'bg-green-500' : (order as any).emailError ? 'bg-red-500' : 'bg-gray-300'}`}></span>
                            <p className="text-xs text-gray-700">
                                {(order as any).emailSent
                                    ? 'Enviado exitosamente'
                                    : (order as any).emailError
                                        ? `Error: ${(order as any).emailError}`
                                        : 'Pendiente de envío o estado desconocido'}
                            </p>
                        </div>
                        {(order as any).emailSentAt && (
                            <p className="text-[10px] text-gray-400 mt-1">
                                Último intento: {new Date((order as any).emailSentAt.seconds * 1000).toLocaleString()}
                            </p>
                        )}
                    </div>
                )}

                {/* Error */}
                {error && (
                    <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-red-600 text-xs">
                        {error}
                    </div>
                )}

                {/* Toast */}
                {toast && (
                    <div className="bg-gray-800 text-white text-center text-xs py-2 rounded-lg animate-pulse">
                        {toast}
                    </div>
                )}

                {/* Actions */}
                {order.status === 'Pendiente de pago' && (
                    <div className="pt-2 space-y-2">
                        {cancelConfirmStep === 0 ? (
                            <div className="grid grid-cols-3 gap-2">
                                <Button
                                    variant="danger"
                                    onClick={() => setCancelConfirmStep(1)}
                                    className="!text-xs !py-2.5"
                                >
                                    Cancelar
                                </Button>
                                <Button variant="outline" onClick={handleCopy} className="!text-xs !py-2.5">
                                    {copied ? 'Copiado' : 'Copiar'}
                                </Button>
                                <Button
                                    variant="primary"
                                    onClick={handleMarkPaid}
                                    isLoading={loading}
                                    className="!text-xs !py-2.5 !bg-green-600 hover:!bg-green-700"
                                >
                                    {showUpload && files.length > 0 ? 'Confirmar' : 'Pagar'}
                                </Button>
                            </div>
                        ) : cancelConfirmStep === 1 ? (
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                                <p className="text-xs font-semibold text-amber-700">Confirmacion 1/2: deseas cancelar este pedido?</p>
                                <div className="grid grid-cols-2 gap-2">
                                    <Button variant="outline" onClick={() => setCancelConfirmStep(0)} className="!text-xs !py-2">
                                        Volver
                                    </Button>
                                    <Button variant="danger" onClick={() => setCancelConfirmStep(2)} className="!text-xs !py-2">
                                        Continuar
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-2">
                                <p className="text-xs font-semibold text-red-700">Confirmacion 2/2: esta accion es irreversible.</p>
                                <div className="grid grid-cols-2 gap-2">
                                    <Button variant="outline" onClick={() => setCancelConfirmStep(1)} className="!text-xs !py-2">
                                        Atras
                                    </Button>
                                    <Button variant="danger" onClick={handleCancel} isLoading={loading} className="!text-xs !py-2">
                                        Cancelar definitivamente
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {order.status === 'Pagado' && (
                    <div className={`pt-2 space-y-2 ${canVoidPaidOrder ? '' : ''}`}>
                        {requiresLegacySourceAccount && (
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                                <p className="text-xs font-semibold text-amber-700">Pedido historico sin cuenta origen registrada.</p>
                                <p className="text-[11px] text-amber-600">Selecciona manualmente la cuenta pagadora correcta antes de anular.</p>
                                <select
                                    value={sourceAccountId}
                                    onChange={(e) => setSourceAccountId(e.target.value)}
                                    className="w-full text-sm border-gray-200 rounded-lg focus:ring-amber-500 focus:border-amber-500"
                                >
                                    <option value="">Seleccione cuenta pagadora...</option>
                                    {accounts.filter(isPayoutAccount).map(acc => (
                                        <option key={acc.id} value={acc.id}>
                                            {acc.bank} - {acc.holder} {acc.alias ? `(${acc.alias})` : ''}
                                        </option>
                                    ))}
                                </select>
                                {sourceAccountId && sourceAccount && (
                                    <p className="text-[11px] text-gray-600 bg-white p-2 rounded border border-amber-100">
                                        Usarás: <b>{sourceAccount.bank}</b> - <b>{sourceAccount.holder}</b>
                                    </p>
                                )}
                            </div>
                        )}

                        {canVoidPaidOrder && cancelConfirmStep === 0 && (
                            <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-2">
                                <p className="text-xs font-semibold text-red-700">Solo {SUPER_ADMIN_EMAIL} puede anular un pedido pagado.</p>
                                <p className="text-[11px] text-red-600">La anulación revierte saldo, CLP, comisiones admin, Mano Tillo y comisión de venta.</p>
                            </div>
                        )}

                        {canVoidPaidOrder && cancelConfirmStep === 1 && (
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                                <p className="text-xs font-semibold text-amber-700">Confirmacion 1/2: deseas anular este pedido pagado?</p>
                                <div className="grid grid-cols-2 gap-2">
                                    <Button variant="outline" onClick={() => setCancelConfirmStep(0)} className="!text-xs !py-2">
                                        Volver
                                    </Button>
                                    <Button variant="danger" onClick={() => setCancelConfirmStep(2)} className="!text-xs !py-2">
                                        Continuar
                                    </Button>
                                </div>
                            </div>
                        )}

                        {canVoidPaidOrder && cancelConfirmStep === 2 && (
                            <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-2">
                                <p className="text-xs font-semibold text-red-700">Confirmacion 2/2: se revertira TODO el movimiento transaccional.</p>
                                <div className="grid grid-cols-2 gap-2">
                                    <Button variant="outline" onClick={() => setCancelConfirmStep(1)} className="!text-xs !py-2">
                                        Atras
                                    </Button>
                                    <Button variant="danger" onClick={handleCancel} isLoading={loading} className="!text-xs !py-2">
                                        Anular definitivamente
                                    </Button>
                                </div>
                            </div>
                        )}

                        <div className={`grid gap-2 ${canVoidPaidOrder ? 'grid-cols-3' : 'grid-cols-2'}`}>
                            <Button variant="danger" onClick={handleClose} className="!text-xs !py-2.5">
                                Cerrar
                            </Button>
                            <Button variant="outline" onClick={handleCopy} className="!text-xs !py-2.5">
                                {copied ? '✅ Copiado' : '📋 Copiar Datos'}
                            </Button>
                            {canVoidPaidOrder && cancelConfirmStep === 0 && (
                                <Button variant="danger" onClick={() => setCancelConfirmStep(1)} className="!text-xs !py-2.5">
                                    Anular
                                </Button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
}
