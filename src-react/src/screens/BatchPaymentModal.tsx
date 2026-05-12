import { useState } from 'react';
import { db, storage } from '../lib/firebase';
import { runTransaction, doc, serverTimestamp, collection, increment } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAuth, useVesAccounts } from '../hooks';
import { computeInterbankFee, normalizeBankName, USER_TAGS } from '../lib/constants';
import { isPayoutAccount } from '../hooks/useVesAccounts';
import { Modal, Button } from '../components/ui';
import { useToast } from '../contexts/ToastContext';
import type { Order } from '../hooks/useOrders';

const CLP_ADMIN_TAGS = new Set(['A1', 'A2']);
const VES_ADMIN_TAGS = new Set(['A3', 'A4', 'A5']);
const roundUp2 = (value: number) => Math.ceil(value * 100) / 100;

const resolveUserTag = (raw: string): string => {
    const normalized = (raw || '').trim();
    if (!normalized) return '';

    const mapped = USER_TAGS[normalized.toLowerCase()];
    if (mapped) return mapped;

    const asTag = normalized.toUpperCase();
    return /^[AV]\d+$/.test(asTag) ? asTag : '';
};

interface BatchPaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    selectedOrders: Order[];
    onSuccess: () => void;
}

export function BatchPaymentModal({ isOpen, onClose, selectedOrders, onSuccess }: BatchPaymentModalProps) {
    const { user } = useAuth();
    const { accounts } = useVesAccounts();
    const toast = useToast();

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [sourceAccountId, setSourceAccountId] = useState('');
    const [proofFiles, setProofFiles] = useState<Record<string, File>>({});

    const totalVes = selectedOrders.reduce((sum, order) => sum + order.destinationAmount, 0);

    const handleFileChange = (orderId: string, file: File | null) => {
        if (file) {
            setProofFiles(prev => ({ ...prev, [orderId]: file }));
        } else {
            const newFiles = { ...proofFiles };
            delete newFiles[orderId];
            setProofFiles(newFiles);
        }
    };

    const handleCopyData = (order: Order) => {
        let text = '';
        if (order.type === 'transferencia') {
            text = `Banco: ${order.bank || 'N/A'} \nCuenta: ${order.accountNumber} \nCédula: ${order.cedula} \nBeneficiario: ${order.clientName} \nMonto: ${order.destinationAmount.toLocaleString('es-VE', { minimumFractionDigits: 2 })} VES`;
        } else if (order.type === 'pago-movil') {
            text = `Banco: ${order.bank || 'N/A'} \nTeléfono: ${order.phone} \nCédula: ${order.cedula} \nBeneficiario: ${order.clientName} \nMonto: ${order.destinationAmount.toLocaleString('es-VE', { minimumFractionDigits: 2 })} VES`;
        } else if (order.type === 'recarga-saldo') {
            text = `Operadora: ${order.bank || 'N/A'} \nTeléfono: ${order.phone} \nMonto: ${order.destinationAmount.toLocaleString('es-VE', { minimumFractionDigits: 2 })} VES`;
        } else {
            text = `${order.clientName} - ${order.destinationAmount} VES`;
        }
        navigator.clipboard.writeText(text);
        toast.success("Datos copiados");
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!sourceAccountId) {
            toast.error("Selecciona una cuenta origen.");
            return;
        }

        if (Object.keys(proofFiles).length !== selectedOrders.length) {
            toast.error("Debes adjuntar un comprobante para cada pedido.");
            return;
        }

        const sourceAccount = accounts.find(a => a.id === sourceAccountId);
        if (!sourceAccount) {
            toast.error("Cuenta de origen no encontrada.");
            return;
        }

        setIsSubmitting(true);

        try {
            // Resolve all file uploads via Storage FIRST
            const uploadPromises = selectedOrders.map(async (order) => {
                const file = proofFiles[order.id];
                const storageRef = ref(storage, `proofs/${order.id}/${file.name}`);
                await uploadBytes(storageRef, file);
                const url = await getDownloadURL(storageRef);
                return { orderId: order.id, url, order };
            });
            const uploadResults = await Promise.all(uploadPromises);

            const ADMIN_BASE_COMMISSION_RATE = 0.01;
            const TILLO_COMMISSION_RATE = 0.0015;

            // Compute total amount to deduct first (for validation)
            let totalDebitVes = 0;
            const orderFeeMap = new Map<string, number>();
            const sellerCommissionByOrder = new Map<string, {
                sellerId: string;
                sellerEmail: string;
                sellerTag: string;
                sellerCommissionRate: number;
                orderCLPAmount: number;
                sellerCommissionAmountCLP: number;
                sellerCommissionAmountVES: number;
            }>();

            selectedOrders.forEach(order => {
                let fee = 0;
                if (sourceAccount) {
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
                orderFeeMap.set(order.id, fee);

                const adminCommission = Math.ceil((order.destinationAmount * ADMIN_BASE_COMMISSION_RATE) * 100) / 100;
                const tilloCommission = Math.ceil((order.destinationAmount * TILLO_COMMISSION_RATE) * 100) / 100;

                const sellerId = typeof order.sellerId === 'string' ? order.sellerId.trim() : '';
                const sellerEmailFromOrder = typeof order.sellerEmail === 'string' ? order.sellerEmail.trim() : '';
                const createdByTagEmail = typeof order.createdByTag === 'string' ? order.createdByTag.trim() : '';
                const sellerEmail = sellerEmailFromOrder || createdByTagEmail;
                const rawSellerRate = Number(order.sellerCommissionRate || (order as any).commissionRate || 0);
                const sellerCommissionRate = Number.isFinite(rawSellerRate) ? rawSellerRate : 0;
                const orderCLPAmount = Number(order.clpAmount || 0);
                const sellerTag = resolveUserTag(sellerEmail || createdByTagEmail);

                const useVesCommission = VES_ADMIN_TAGS.has(sellerTag);
                const useClpCommission = CLP_ADMIN_TAGS.has(sellerTag) || sellerTag.startsWith('V');
                const sellerCommissionAmountCLP = useClpCommission && sellerCommissionRate > 0 && orderCLPAmount > 0
                    ? roundUp2(orderCLPAmount * sellerCommissionRate)
                    : 0;
                const sellerCommissionAmountVES = useVesCommission && sellerCommissionRate > 0 && order.destinationAmount > 0
                    ? roundUp2(order.destinationAmount * sellerCommissionRate)
                    : 0;

                sellerCommissionByOrder.set(order.id, {
                    sellerId,
                    sellerEmail,
                    sellerTag,
                    sellerCommissionRate,
                    orderCLPAmount,
                    sellerCommissionAmountCLP,
                    sellerCommissionAmountVES,
                });

                totalDebitVes += order.destinationAmount + fee + adminCommission + tilloCommission + sellerCommissionAmountVES;
            });

            await runTransaction(db, async (transaction) => {
                // Read configuration
                const rateRef = doc(db, 'config', 'rate');
                const rateDoc = await transaction.get(rateRef);

                const accountRef = doc(db, 'accounts', sourceAccountId);
                const accountDoc = await transaction.get(accountRef);

                if (!accountDoc.exists() || (accountDoc.data().balance || 0) < totalDebitVes) {
                    throw new Error('Saldo insuficiente en la cuenta seleccionada para cubrir el lote (incluyendo comisiones).');
                }

                let runningBalance = accountDoc.data().balance || 0;
                const ts = serverTimestamp();
                const historyHolder = sourceAccount?.holder || 'Desconocido';
                const historyBank = sourceAccount?.bank || 'Desconocido';

                selectedOrders.forEach(order => {
                    const orderRef = doc(db, 'orders', order.id);
                    const fileUrl = uploadResults.find(r => r.orderId === order.id)?.url;

                    const currentAdminCommission = Math.ceil((order.destinationAmount * ADMIN_BASE_COMMISSION_RATE) * 100) / 100;
                    const currentTilloCommission = Math.ceil((order.destinationAmount * TILLO_COMMISSION_RATE) * 100) / 100;
                    const currentBankFee = orderFeeMap.get(order.id) || 0;
                    const sellerCommission = sellerCommissionByOrder.get(order.id);
                    const sellerId = sellerCommission?.sellerId || '';
                    const sellerEmail = sellerCommission?.sellerEmail || '';
                    const sellerTag = sellerCommission?.sellerTag || '';
                    const sellerCommissionRate = sellerCommission?.sellerCommissionRate || 0;
                    const orderCLPAmount = sellerCommission?.orderCLPAmount || 0;
                    const sellerCommissionAmountCLP = sellerCommission?.sellerCommissionAmountCLP || 0;
                    const sellerCommissionAmountVES = sellerCommission?.sellerCommissionAmountVES || 0;

                    // 1. Update order
                    transaction.update(orderRef, {
                        status: 'Pagado',
                        proofUrl: fileUrl,
                        proofUrls: [fileUrl],
                        paidByTag: user?.email || 'ADMIN',
                        paidAt: ts,
                        sourceAccountId,
                        sourceAccountBank: sourceAccount.bank || '',
                        sourceAccountHolder: sourceAccount.holder || '',
                        adminCommission: currentAdminCommission,
                        tilloCommission: currentTilloCommission,
                        bankFee: currentBankFee,
                        sellerCommissionAmountCLP,
                        sellerCommissionAmountVES,
                        totalDebitVes: order.destinationAmount + currentBankFee + currentAdminCommission + currentTilloCommission,
                    });

                    if (sellerEmail && sellerCommissionRate > 0 && sellerCommissionAmountCLP > 0) {
                        const sellerCommissionRef = doc(collection(db, 'seller_commissions'));
                        transaction.set(sellerCommissionRef, {
                            sellerId: sellerId || '',
                            sellerEmail,
                            orderId: order.id,
                            orderCLPAmount,
                            commissionRate: sellerCommissionRate,
                            commissionAmountCLP: sellerCommissionAmountCLP,
                            commissionCurrency: 'CLP',
                            sellerTag,
                            timestamp: ts,
                            createdAt: ts,
                            createdBy: user?.email || 'ADMIN',
                        });
                    }

                    // 2. CLP Balance History
                    const purchaseRateVES = rateDoc.exists() ? rateDoc.data().purchaseRateVES || 0 : 0;
                    let totalDebitClp = 0;
                    let totalDebitVesAtCalc = 0;

                    if (purchaseRateVES > 0) {
                        const baseAmount = order.destinationAmount || 0;
                        const fee = currentBankFee;
                        const totalCommissionVes = currentAdminCommission + currentTilloCommission;
                        totalDebitVesAtCalc = baseAmount + fee + totalCommissionVes;

                        totalDebitClp = Math.ceil((baseAmount + fee + totalCommissionVes) / purchaseRateVES * 100) / 100;
                    }

                    if (totalDebitClp > 0) {
                        const clpHistoryRef = doc(collection(db, 'clp_balance_history'));
                        const note = `Pago pedido ${order.id.slice(-5)} (Envio de VES)`;
                        transaction.set(clpHistoryRef, {
                            amount: totalDebitClp,
                            type: 'subtract',
                            note,
                            description: note,
                            purchaseRateVESUsed: purchaseRateVES,
                            vesAmountAtCalc: totalDebitVesAtCalc,
                            clpAmountComputed: totalDebitClp,
                            timestamp: ts,
                            createdAt: ts,
                            orderId: order.id,
                            createdBy: user?.email || 'ADMIN',
                            adminTag: 'ADMIN',
                            bank: order.bank || ''
                        });
                    }

                    // 3. VES Balance History (runningBalance must be decremented before recording)
                    runningBalance -= order.destinationAmount;
                    const vesHistoryRef = doc(collection(db, 'balance_history'));
                    transaction.set(vesHistoryRef, {
                        amount: order.destinationAmount,
                        type: 'subtract',
                        note: `Pago lote ${order.id.slice(-5)}`,
                        timestamp: ts,
                        orderId: order.id,
                        accountId: sourceAccountId,
                        holder: historyHolder,
                        bank: historyBank,
                        balanceAfter: runningBalance
                    });

                    if (currentBankFee > 0) {
                        runningBalance -= currentBankFee;
                        const feeHistoryRef = doc(collection(db, 'balance_history'));
                        transaction.set(feeHistoryRef, {
                            amount: currentBankFee,
                            type: 'fee',
                            note: `Com. interbancaria lote ${order.id.slice(-5)}`,
                            timestamp: ts,
                            orderId: order.id,
                            accountId: sourceAccountId,
                            holder: historyHolder,
                            bank: historyBank,
                            balanceAfter: runningBalance
                        });
                    }

                    if (currentAdminCommission > 0) {
                        runningBalance -= currentAdminCommission;
                        const adminHistoryRef = doc(collection(db, 'balance_history'));
                        transaction.set(adminHistoryRef, {
                            amount: currentAdminCommission,
                            type: 'admin_commission',
                            note: `Comisión Admin lote ${order.id.slice(-5)}`,
                            timestamp: ts,
                            orderId: order.id,
                            accountId: sourceAccountId,
                            holder: historyHolder,
                            bank: historyBank,
                            balanceAfter: runningBalance
                        });
                    }

                    if (currentTilloCommission > 0) {
                        runningBalance -= currentTilloCommission;
                        const tilloHistoryRef = doc(collection(db, 'balance_history'));
                        transaction.set(tilloHistoryRef, {
                            amount: currentTilloCommission,
                            type: 'tillo_commission',
                            note: `Mano Tillo lote ${order.id.slice(-5)}`,
                            timestamp: ts,
                            orderId: order.id,
                            accountId: sourceAccountId,
                            holder: historyHolder,
                            bank: historyBank,
                            balanceAfter: runningBalance
                        });
                    }

                    if (sellerCommissionAmountVES > 0) {
                        runningBalance -= sellerCommissionAmountVES;
                        const sellerHistoryRef = doc(collection(db, 'balance_history'));
                        transaction.set(sellerHistoryRef, {
                            amount: sellerCommissionAmountVES,
                            type: 'seller_commission',
                            note: `Comision Venta ${sellerTag || 'ADMIN'} lote ${order.id.slice(-5)}`,
                            timestamp: ts,
                            orderId: order.id,
                            accountId: sourceAccountId,
                            holder: historyHolder,
                            bank: historyBank,
                            balanceAfter: runningBalance
                        });
                    }
                });

                // Decrement the main balance on Account
                transaction.update(accountRef, {
                    balance: increment(-totalDebitVes)
                });
            });

            toast.success("Lote procesado exitosamente");
            onSuccess();
        } catch (error: any) {
            console.error("Error al procesar lote:", error);
            toast.error(error.message || "Ocurrió un error al procesar el lote.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Procesar Lote Pendiente" maxWidth="xl">
            <form onSubmit={handleSubmit} className="space-y-6">

                <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl">
                    <div className="flex justify-between items-center text-sm mb-2">
                        <span className="text-emerald-800">Total Pedidos:</span>
                        <span className="font-bold text-emerald-900">{selectedOrders.length}</span>
                    </div>
                    <div className="flex justify-between items-center text-lg">
                        <span className="text-emerald-800 font-bold">Total a Pagar:</span>
                        <span className="font-black text-emerald-900">{totalVes.toLocaleString('es-VE', { minimumFractionDigits: 2 })} VES</span>
                    </div>
                </div>

                <div className="space-y-4 max-h-[40vh] overflow-y-auto w-full px-1">
                    {selectedOrders.map(order => (
                        <div key={order.id} className="p-4 bg-white border border-gray-200 rounded-xl shadow-sm space-y-3">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h4 className="font-bold text-gray-900">{order.clientName}</h4>
                                    <p className="text-xs text-gray-500">CI: {order.cedula}</p>
                                    <div className="mt-1 text-xs text-gray-700">
                                        {order.type === 'transferencia' ? (
                                            <p><span className="font-semibold">Banco:</span> {order.bank} | <span className="font-semibold">Cta:</span> {order.accountNumber}</p>
                                        ) : order.type === 'pago-movil' ? (
                                            <p><span className="font-semibold">Banco:</span> {order.bank} | <span className="font-semibold">Telf:</span> {order.phone}</p>
                                        ) : (
                                            <p><span className="font-semibold">Operadora:</span> {order.bank} | <span className="font-semibold">Telf:</span> {order.phone}</p>
                                        )}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleCopyData(order)}
                                        className="mt-2 text-[10px] bg-blue-50 text-blue-700 px-2 py-1 flex items-center gap-1 rounded font-semibold hover:bg-blue-100"
                                    >
                                        Copiar Datos
                                    </button>
                                </div>
                                <div className="text-right">
                                    <p className="font-bold text-emerald-600">{order.destinationAmount.toLocaleString('es-VE', { minimumFractionDigits: 2 })} VES</p>
                                </div>
                            </div>

                            <div className="pt-2 border-t border-gray-100">
                                <label className="block text-xs font-semibold text-gray-700 mb-1">Comprobante de Pago</label>
                                <input
                                    type="file"
                                    accept="image/*"
                                    className="w-full text-sm outline-none bg-gray-50 border border-gray-200 rounded focus:ring-2 focus:ring-blue-500"
                                    onChange={(e) => handleFileChange(order.id, e.target.files?.[0] || null)}
                                    required
                                />
                            </div>
                        </div>
                    ))}
                </div>

                <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">
                        Cuenta Origen
                    </label>
                    {(() => {
                        const availableAccounts = accounts.filter(account => {
                            if (!isPayoutAccount(account)) return false;
                            let totalDebitForThisAccount = 0;
                            selectedOrders.forEach(order => {
                                let fee = 0;
                                if (order.type === 'pago-movil') {
                                    fee = computeInterbankFee(order.destinationAmount);
                                } else if (order.type === 'transferencia') {
                                    const sourceBank = normalizeBankName(account.bank);
                                    const destBank = normalizeBankName(order.bank || '');
                                    if (sourceBank !== destBank) {
                                        fee = computeInterbankFee(order.destinationAmount);
                                    }
                                }
                                const adminCommission = Math.ceil((order.destinationAmount * 0.01) * 100) / 100;
                                const tilloCommission = Math.ceil((order.destinationAmount * 0.0015) * 100) / 100;
                                totalDebitForThisAccount += order.destinationAmount + fee + adminCommission + tilloCommission;
                            });
                            return account.balance >= totalDebitForThisAccount;
                        });

                        if (availableAccounts.length === 0) {
                            return (
                                <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center space-y-3 mt-2">
                                    <p className="text-red-600 font-bold text-sm flex items-center justify-center gap-1.5">
                                        <span className="text-lg">⚠️</span> Fondos Insuficientes
                                    </p>
                                    <p className="text-xs text-red-500">
                                        Ninguna de tus cuentas tiene saldo suficiente para cubrir el total de este lote más las comisiones automáticas correspondientes.
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            onClose();
                                            window.location.hash = '#ves-accounts';
                                        }}
                                        className="bg-red-100 text-red-700 hover:bg-red-200 text-[11px] font-bold py-1.5 px-3 rounded-lg transition-colors inline-block"
                                    >
                                        Ir a Recargar Saldo
                                    </button>
                                </div>
                            );
                        }

                        return (
                            <select
                                className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all text-sm"
                                value={sourceAccountId}
                                onChange={(e) => setSourceAccountId(e.target.value)}
                                required
                            >
                                <option value="">Seleccione una cuenta ({availableAccounts.length} con fondos disponibles)</option>
                                {availableAccounts.map(account => (
                                    <option key={account.id} value={account.id}>
                                        {account.bank} - {account.holder} ({account.balance.toLocaleString('es-VE')} VES)
                                    </option>
                                ))}
                            </select>
                        );
                    })()}
                </div>

                <div className="flex gap-3 pt-4 border-t border-gray-100">
                    <Button variant="danger" onClick={onClose} type="button" className="flex-1" disabled={isSubmitting}>
                        Cancelar
                    </Button>
                    <Button type="submit" isLoading={isSubmitting} disabled={isSubmitting} className="flex-1 bg-emerald-600 hover:bg-emerald-700">
                        Pagar Lote
                    </Button>
                </div>
            </form>
        </Modal>
    );
}

