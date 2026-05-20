import { useState } from 'react';
import { doc, serverTimestamp, runTransaction, collection, increment } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db, storage } from '../lib/firebase';
import { useAuth } from './useAuth';
import { SUPER_ADMIN_EMAIL, USER_TAGS, isSuperAdminEmail } from '../lib/constants';

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

const buildPaidOrderFinancials = (orderData: Record<string, any>) => {
    const baseAmount = Number(orderData.destinationAmount || 0);
    const appliedFee = Number(orderData.bankFee || 0);
    const adminCommissionVes = Number(orderData.adminCommission || 0);
    const tilloCommissionVes = Number(orderData.tilloCommission || 0);
    const sellerCommissionAmountVES = Number(orderData.sellerCommissionAmountVES || 0);
    const sellerCommissionAmountCLP = Number(orderData.sellerCommissionAmountCLP || 0);
    const orderCLPAmount = Number(orderData.clpAmount || 0);
    const sellerId = typeof orderData.sellerId === 'string' ? orderData.sellerId.trim() : '';
    const sellerEmailFromOrder = typeof orderData.sellerEmail === 'string' ? orderData.sellerEmail.trim() : '';
    const createdByTagEmail = typeof orderData.createdByTag === 'string' ? orderData.createdByTag.trim() : '';
    const sellerEmail = sellerEmailFromOrder || createdByTagEmail;
    const sellerTag = resolveUserTag(sellerEmail || createdByTagEmail);
    const totalCommissionVes = adminCommissionVes + tilloCommissionVes;
    const totalDebitVes = baseAmount + appliedFee + totalCommissionVes;
    const totalDebitVesWithSellerCommission = totalDebitVes + sellerCommissionAmountVES;

    return {
        baseAmount,
        appliedFee,
        adminCommissionVes,
        tilloCommissionVes,
        sellerCommissionAmountVES,
        sellerCommissionAmountCLP,
        orderCLPAmount,
        sellerId,
        sellerEmail,
        sellerTag,
        totalCommissionVes,
        totalDebitVes,
        totalDebitVesWithSellerCommission,
    };
};

interface ActionState {
    loading: boolean;
    error: string | null;
}

/**
 * Hook para gestionar acciones sobre pedidos existentes.
 * Regla clave de Firestore: todos los reads de una transaccion deben ocurrir antes de writes.
 */
export function useOrderActions() {
    const { user } = useAuth();
    const [state, setState] = useState<ActionState>({ loading: false, error: null });

    /** Marcar un pedido como pagado y subir comprobante(s) */
    const markAsPaid = async (orderId: string, files: File[], sourceAccountId?: string, fee?: number) => {
        setState({ loading: true, error: null });
        try {
            if (!user) throw new Error('Debes iniciar sesion.');
            if (files.length === 0) throw new Error('Debes subir al menos un comprobante.');

            // Subir archivos a Firebase Storage (fuera de transaccion)
            const uploadPromises = files.map(async (file) => {
                const filePath = `proofs/${orderId}/${file.name}`;
                const fileRef = ref(storage, filePath);
                const snapshot = await uploadBytes(fileRef, file);
                return getDownloadURL(snapshot.ref);
            });
            const downloadURLs = await Promise.all(uploadPromises);

            await runTransaction(db, async (transaction) => {
                const orderRef = doc(db, 'orders', orderId);
                const rateRef = doc(db, 'config', 'rate');
                const shouldTouchVesAccount = Boolean(sourceAccountId);
                const accountRef = shouldTouchVesAccount ? doc(db, 'accounts', sourceAccountId as string) : null;

                // READ PHASE (solo lecturas)
                const orderDoc = await transaction.get(orderRef);
                const rateDoc = await transaction.get(rateRef);
                const accountDoc = accountRef ? await transaction.get(accountRef) : null;

                if (!orderDoc.exists()) throw new Error('El pedido no existe.');
                const orderData = orderDoc.data();
                if (orderData.status === 'Pagado') throw new Error('El pedido ya estaba pagado.');

                const baseAmount = orderData.destinationAmount || 0;
                const appliedFee = fee || 0;
                const adminCommissionVes = Math.ceil((baseAmount * 0.01) * 100) / 100;
                const tilloCommissionVes = Math.ceil((baseAmount * 0.0015) * 100) / 100;
                const totalCommissionVes = adminCommissionVes + tilloCommissionVes;
                const totalDebitVes = baseAmount + appliedFee + totalCommissionVes;
                const sellerId = typeof orderData.sellerId === 'string' ? orderData.sellerId.trim() : '';
                const sellerEmailFromOrder = typeof orderData.sellerEmail === 'string' ? orderData.sellerEmail.trim() : '';
                const createdByTagEmail = typeof orderData.createdByTag === 'string' ? orderData.createdByTag.trim() : '';
                const sellerEmail = sellerEmailFromOrder || createdByTagEmail;
                const rawSellerRate = Number(orderData.sellerCommissionRate || orderData.commissionRate || 0);
                const sellerCommissionRate = Number.isFinite(rawSellerRate) ? rawSellerRate : 0;
                const orderCLPAmount = Number(orderData.clpAmount || 0);
                const sellerTag = resolveUserTag(sellerEmail || createdByTagEmail);
                const useVesCommission = VES_ADMIN_TAGS.has(sellerTag);
                const useClpCommission = CLP_ADMIN_TAGS.has(sellerTag) || sellerTag.startsWith('V');

                const sellerCommissionAmountCLP = useClpCommission && sellerCommissionRate > 0 && orderCLPAmount > 0
                    ? roundUp2(orderCLPAmount * sellerCommissionRate)
                    : 0;
                const sellerCommissionAmountVES = useVesCommission && sellerCommissionRate > 0 && baseAmount > 0
                    ? roundUp2(baseAmount * sellerCommissionRate)
                    : 0;

                const purchaseRateVES = rateDoc.exists() ? rateDoc.data().purchaseRateVES || 0 : 0;
                let totalDebitClp = 0;
                if (purchaseRateVES > 0) {
                    totalDebitClp = Math.ceil((baseAmount + appliedFee + totalCommissionVes) / purchaseRateVES * 100) / 100;
                }

                const totalDebitVesWithSellerCommission = totalDebitVes + sellerCommissionAmountVES;

                const ts = serverTimestamp();

                // WRITE PHASE (solo escrituras)
                transaction.update(orderRef, {
                    status: 'Pagado',
                    proofUrl: downloadURLs[0],
                    proofUrls: downloadURLs,
                    paidByTag: user.email || 'ADMIN',
                    paidAt: ts,
                    sourceAccountId: sourceAccountId || '',
                    sourceAccountBank: accountDoc?.data()?.bank || '',
                    sourceAccountHolder: accountDoc?.data()?.holder || '',
                    adminCommission: adminCommissionVes,
                    tilloCommission: tilloCommissionVes,
                    bankFee: appliedFee,
                    sellerCommissionAmountCLP,
                    sellerCommissionAmountVES,
                    totalDebitVes,
                });

                if (sellerEmail && sellerCommissionRate > 0 && sellerCommissionAmountCLP > 0) {
                    const sellerCommissionRef = doc(collection(db, 'seller_commissions'));
                    transaction.set(sellerCommissionRef, {
                        sellerId: sellerId || orderData.userId || '',
                        sellerEmail,
                        orderId,
                        orderCLPAmount,
                        commissionRate: sellerCommissionRate,
                        commissionAmountCLP: sellerCommissionAmountCLP,
                        commissionCurrency: 'CLP',
                        sellerTag,
                        timestamp: ts,
                        createdAt: ts,
                        createdBy: user.email || 'ADMIN',
                    });
                }

                if (totalDebitClp > 0) {
                    const historyRef = doc(collection(db, 'clp_balance_history'));
                    const note = `Pago pedido ${orderId.slice(-5)} (Envio de VES)`;
                    transaction.set(historyRef, {
                        amount: totalDebitClp,
                        type: 'subtract',
                        note,
                        description: note,
                        purchaseRateVESUsed: purchaseRateVES,
                        vesAmountAtCalc: totalDebitVes,
                        clpAmountComputed: totalDebitClp,
                        timestamp: ts,
                        createdAt: ts,
                        orderId: orderId,
                        createdBy: user.email || 'ADMIN',
                        adminTag: 'ADMIN',
                        bank: orderData.bank || ''
                    });
                }

                if (orderData.destinationCurrency === 'VES' && accountRef) {
                    if (!accountDoc || !accountDoc.exists()) {
                        throw new Error('La cuenta origen seleccionada no existe.');
                    }

                    const accountData = accountDoc.data();
                    const historyBank = typeof orderData.bank === 'string' ? orderData.bank.trim() : 'Sin banco';
                    const historyHolder = typeof accountData.holder === 'string' ? accountData.holder.trim() : 'Sin titular';
                    let runningBalance = accountData.balance || 0;

                    transaction.update(accountRef, {
                        balance: increment(-totalDebitVesWithSellerCommission)
                    });

                    runningBalance -= baseAmount;
                        transaction.set(doc(collection(db, 'balance_history')), {
                            amount: baseAmount,
                            type: 'subtract',
                            note: `Pago pedido ${orderId.slice(-5)} (${orderData.destinationCurrency})`,
                            timestamp: ts,
                            orderId,
                            accountId: sourceAccountId,
                            holder: historyHolder,
                            bank: historyBank,
                            balanceAfter: runningBalance
                        });

                    if (appliedFee > 0) {
                        runningBalance -= appliedFee;
                        transaction.set(doc(collection(db, 'balance_history')), {
                            amount: appliedFee,
                            type: 'fee',
                            note: `Comision pedido ${orderId.slice(-5)}`,
                            timestamp: ts,
                            orderId,
                            accountId: sourceAccountId,
                            holder: historyHolder,
                            bank: historyBank,
                            balanceAfter: runningBalance
                        });
                    }

                    if (adminCommissionVes > 0) {
                        runningBalance -= adminCommissionVes;
                        transaction.set(doc(collection(db, 'balance_history')), {
                            amount: adminCommissionVes,
                            type: 'admin_commission',
                            note: `Comision Admin pedido ${orderId.slice(-5)}`,
                            timestamp: ts,
                            orderId,
                            accountId: sourceAccountId,
                            holder: historyHolder,
                            bank: historyBank,
                            balanceAfter: runningBalance
                        });
                    }

                    if (tilloCommissionVes > 0) {
                        runningBalance -= tilloCommissionVes;
                        transaction.set(doc(collection(db, 'balance_history')), {
                            amount: tilloCommissionVes,
                            type: 'tillo_commission',
                            note: `Mano Tillo pedido ${orderId.slice(-5)}`,
                            timestamp: ts,
                            orderId,
                            accountId: sourceAccountId,
                            holder: historyHolder,
                            bank: historyBank,
                            balanceAfter: runningBalance
                        });
                    }

                    if (sellerCommissionAmountVES > 0) {
                        runningBalance -= sellerCommissionAmountVES;
                        transaction.set(doc(collection(db, 'balance_history')), {
                            amount: sellerCommissionAmountVES,
                            type: 'seller_commission',
                            note: `Comision Venta ${sellerTag || 'ADMIN'} pedido ${orderId.slice(-5)}`,
                            timestamp: ts,
                            orderId,
                            accountId: sourceAccountId,
                            holder: historyHolder,
                            bank: historyBank,
                            balanceAfter: runningBalance
                        });
                    }
                }
            });

            setState({ loading: false, error: null });
            return true;
        } catch (err: any) {
            const msg = err.message || 'Error al procesar el pago';
            setState({ loading: false, error: msg });
            throw new Error(msg);
        }
    };

    /** Cancelar un pedido */
    const cancelOrder = async (orderId: string) => {
        setState({ loading: true, error: null });
        try {
            if (!user) throw new Error('Debes iniciar sesion.');

            await runTransaction(db, async (transaction) => {
                const orderRef = doc(db, 'orders', orderId);
                const rateRef = doc(db, 'config', 'rate');

                // READ PHASE
                const orderDoc = await transaction.get(orderRef);
                if (!orderDoc.exists()) throw new Error('El pedido no existe.');

                const orderData = orderDoc.data();
                if (orderData.status === 'Cancelado') {
                    throw new Error('El pedido ya estaba cancelado.');
                }

                const isPaidOrder = orderData.status === 'Pagado';
                let totalDebitClp = 0;
                let purchaseRateVESUsed = 0;
                let accountRef: ReturnType<typeof doc> | null = null;
                let accountDoc: any = null;
                let sourceAccountId = '';
                let sourceAccountBank = '';
                let sourceAccountHolder = '';

                if (isPaidOrder) {
                    if (!isSuperAdminEmail(user.email)) {
                        throw new Error(`Solo ${SUPER_ADMIN_EMAIL} puede anular pedidos ya pagados.`);
                    }

                    sourceAccountId = typeof orderData.sourceAccountId === 'string' ? orderData.sourceAccountId.trim() : '';
                    sourceAccountBank = typeof orderData.sourceAccountBank === 'string' ? orderData.sourceAccountBank.trim() : '';
                    sourceAccountHolder = typeof orderData.sourceAccountHolder === 'string' ? orderData.sourceAccountHolder.trim() : '';

                    if (!sourceAccountId) {
                        throw new Error('Este pedido fue pagado sin registrar la cuenta origen. No se puede anular automaticamente.');
                    }

                    const rateDoc = await transaction.get(rateRef);
                    const purchaseRateVES = rateDoc.exists() ? rateDoc.data().purchaseRateVES || 0 : 0;
                    purchaseRateVESUsed = purchaseRateVES;

                    accountRef = doc(db, 'accounts', sourceAccountId);
                    accountDoc = await transaction.get(accountRef);
                    if (!accountDoc.exists()) {
                        throw new Error('La cuenta origen registrada ya no existe.');
                    }

                    if (purchaseRateVES > 0) {
                        const financials = buildPaidOrderFinancials(orderData);
                        totalDebitClp = Math.ceil(financials.totalDebitVes / purchaseRateVES * 100) / 100;
                    }
                }

                // WRITE PHASE
                const ts = serverTimestamp();
                transaction.update(orderRef, {
                    status: 'Cancelado',
                    cancelledAt: ts,
                    cancelledBy: user.email || 'ADMIN',
                    ...(isPaidOrder
                        ? {
                            voidedAt: ts,
                            voidedBy: user.email || 'ADMIN',
                            reversalCompleted: true,
                        }
                        : {}),
                });

                if (isPaidOrder) {
                    const financials = buildPaidOrderFinancials(orderData);

                    if (totalDebitClp > 0) {
                        const historyRef = doc(collection(db, 'clp_balance_history'));
                        const note = `Reversion anulacion pedido ${orderId.slice(-5)} (Retorno de VES)`;
                        transaction.set(historyRef, {
                            amount: totalDebitClp,
                            type: 'add',
                            note,
                            description: note,
                            purchaseRateVESUsed,
                            vesAmountAtCalc: financials.totalDebitVes,
                            clpAmountComputed: totalDebitClp,
                            timestamp: ts,
                            createdAt: ts,
                            orderId: orderId,
                            createdBy: user.email || 'ADMIN',
                            adminTag: 'ADMIN',
                            bank: orderData.bank || '',
                            isReversal: true,
                        });
                    }

                    let runningBalance = Number(accountDoc.data().balance || 0);
                    const accountRefValue = accountRef as ReturnType<typeof doc>;

                    transaction.update(accountRefValue, {
                        balance: increment(financials.totalDebitVesWithSellerCommission),
                    });

                    runningBalance += financials.baseAmount;
                    transaction.set(doc(collection(db, 'balance_history')), {
                        amount: financials.baseAmount,
                        type: 'reversal_add',
                        note: `Anulacion pedido ${orderId.slice(-5)} (${orderData.destinationCurrency})`,
                        timestamp: ts,
                        orderId,
                        accountId: sourceAccountId,
                        holder: sourceAccountHolder || sourceAccountBank || 'Sin titular',
                        bank: sourceAccountBank || orderData.bank || 'Sin banco',
                        balanceAfter: runningBalance,
                    });

                    if (financials.appliedFee > 0) {
                        runningBalance += financials.appliedFee;
                        transaction.set(doc(collection(db, 'balance_history')), {
                            amount: financials.appliedFee,
                            type: 'reversal_fee',
                            note: `Reversion comision pedido ${orderId.slice(-5)}`,
                            timestamp: ts,
                            orderId,
                            accountId: sourceAccountId,
                            holder: sourceAccountHolder || sourceAccountBank || 'Sin titular',
                            bank: sourceAccountBank || orderData.bank || 'Sin banco',
                            balanceAfter: runningBalance,
                        });
                    }

                    if (financials.adminCommissionVes > 0) {
                        runningBalance += financials.adminCommissionVes;
                        transaction.set(doc(collection(db, 'balance_history')), {
                            amount: financials.adminCommissionVes,
                            type: 'reversal_admin_commission',
                            note: `Reversion Comision Admin pedido ${orderId.slice(-5)}`,
                            timestamp: ts,
                            orderId,
                            accountId: sourceAccountId,
                            holder: sourceAccountHolder || sourceAccountBank || 'Sin titular',
                            bank: sourceAccountBank || orderData.bank || 'Sin banco',
                            balanceAfter: runningBalance,
                        });
                    }

                    if (financials.tilloCommissionVes > 0) {
                        runningBalance += financials.tilloCommissionVes;
                        transaction.set(doc(collection(db, 'balance_history')), {
                            amount: financials.tilloCommissionVes,
                            type: 'reversal_tillo_commission',
                            note: `Reversion Mano Tillo pedido ${orderId.slice(-5)}`,
                            timestamp: ts,
                            orderId,
                            accountId: sourceAccountId,
                            holder: sourceAccountHolder || sourceAccountBank || 'Sin titular',
                            bank: sourceAccountBank || orderData.bank || 'Sin banco',
                            balanceAfter: runningBalance,
                        });
                    }

                    if (financials.sellerCommissionAmountVES > 0) {
                        runningBalance += financials.sellerCommissionAmountVES;
                        transaction.set(doc(collection(db, 'balance_history')), {
                            amount: financials.sellerCommissionAmountVES,
                            type: 'reversal_seller_commission',
                            note: `Reversion Comision Venta ${financials.sellerTag || 'ADMIN'} pedido ${orderId.slice(-5)}`,
                            timestamp: ts,
                            orderId,
                            accountId: sourceAccountId,
                            holder: sourceAccountHolder || sourceAccountBank || 'Sin titular',
                            bank: sourceAccountBank || orderData.bank || 'Sin banco',
                            balanceAfter: runningBalance,
                        });
                    }

                    if (financials.sellerEmail && financials.sellerCommissionAmountCLP > 0) {
                        const sellerCommissionRef = doc(collection(db, 'seller_commissions'));
                        transaction.set(sellerCommissionRef, {
                            sellerId: financials.sellerId || orderData.userId || '',
                            sellerEmail: financials.sellerEmail,
                            orderId,
                            orderCLPAmount: -financials.orderCLPAmount,
                            commissionRate: Number(orderData.sellerCommissionRate || orderData.commissionRate || 0),
                            commissionAmountCLP: -financials.sellerCommissionAmountCLP,
                            commissionCurrency: 'CLP',
                            sellerTag: financials.sellerTag,
                            timestamp: ts,
                            createdAt: ts,
                            createdBy: user.email || 'ADMIN',
                            isReversal: true,
                            reversalOfOrderId: orderId,
                        });
                    }
                }
            });

            setState({ loading: false, error: null });
            return true;
        } catch (err: any) {
            const msg = err.message || 'Error al cancelar el pedido';
            setState({ loading: false, error: msg });
            throw new Error(msg);
        }
    };

    const voidPaidOrder = async (orderId: string, sourceAccountId?: string) => {
        setState({ loading: true, error: null });
        try {
            if (!user) throw new Error('Debes iniciar sesion.');
            if (!isSuperAdminEmail(user.email)) {
                throw new Error(`Solo ${SUPER_ADMIN_EMAIL} puede anular pedidos ya pagados.`);
            }

            const functions = getFunctions();
            const callable = httpsCallable<{ orderId: string; sourceAccountId?: string }, { success: boolean }>(functions, 'voidPaidOrder');
            await callable({ orderId, sourceAccountId });

            setState({ loading: false, error: null });
            return true;
        } catch (err: any) {
            const msg = err.message || 'Error al anular el pedido pagado';
            setState({ loading: false, error: msg });
            throw new Error(msg);
        }
    };

    /** Copiar datos de un pedido al portapapeles */
    const copyOrderData = (order: {
        clientName: string;
        cedula: string;
        type: string;
        bank?: string;
        accountNumber?: string;
        phone?: string;
        clpAmount: number;
        destinationAmount: number;
        destinationCurrency: string;
    }) => {
        let lines: string[] = [];

        if (order.type === 'transferencia') {
            lines = [
                order.clientName,
                order.cedula,
                order.bank || '',
                order.accountNumber || '',
                `${order.destinationAmount.toLocaleString('es-VE', { minimumFractionDigits: 2 })} ${order.destinationCurrency}`,
            ];
        } else if (order.type === 'pago-movil') {
            lines = [
                order.phone || '',
                order.cedula,
                order.bank || '',
                `${order.destinationAmount.toLocaleString('es-VE', { minimumFractionDigits: 2 })} ${order.destinationCurrency}`,
            ];
        } else if (order.type === 'recarga-saldo') {
            lines = [
                order.phone || '',
                `${order.destinationAmount.toLocaleString('es-VE', { minimumFractionDigits: 2 })} ${order.destinationCurrency}`,
            ];
        }

        const text = lines.filter(Boolean).join('\n');
        navigator.clipboard.writeText(text);
        return text;
    };

    /** Reasignar un pedido a otro vendedor */
    const reassignOrder = async (orderId: string, targetEmail: string) => {
        setState({ loading: true, error: null });
        try {
            if (!user) throw new Error('Debes iniciar sesion.');
            const userTag = resolveUserTag(user.email || '');
            if (!CLP_ADMIN_TAGS.has(userTag) && !isSuperAdminEmail(user.email)) {
                throw new Error('Solo los administradores principales pueden reasignar pedidos.');
            }

            const targetTag = resolveUserTag(targetEmail);
            if (!targetTag) throw new Error('El correo destino no esta registrado o no tiene tag asociado.');

            const functions = getFunctions();
            const callable = httpsCallable<{ orderId: string; targetEmail: string }, { success: boolean }>(functions, 'reassignOrder');
            await callable({ orderId, targetEmail });

            setState({ loading: false, error: null });
            return true;
        } catch (err: any) {
            const msg = err.message || 'Error al reasignar el pedido';
            setState({ loading: false, error: msg });
            throw new Error(msg);
        }
    };

    return { ...state, markAsPaid, cancelOrder, voidPaidOrder, copyOrderData, reassignOrder };
}
