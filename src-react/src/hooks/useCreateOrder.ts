import { useState } from 'react';
import { collection, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './useAuth';
import type { ExchangeRates } from './useExchangeRates';
import { VENEZUELAN_BANK_PREFIXES, isOrderBalanceRestrictionActive } from '../lib/constants';

export type OrderType = 'transferencia' | 'pago-movil' | 'recarga-saldo';

export interface OrderFormData {
    type: OrderType;
    clientName: string;
    cedula: string;
    email: string;
    clpAmount: number;
    bank?: string;
    accountNumber?: string;
    accountType?: string;
    phone?: string;
}

export const VENEZUELAN_BANKS = Array.from(new Set(Object.values(VENEZUELAN_BANK_PREFIXES))).sort();

interface CreateOrderState {
    loading: boolean;
    error: string | null;
    success: boolean;
}

export function useCreateOrder() {
    const { user, role } = useAuth();
    const [state, setState] = useState<CreateOrderState>({
        loading: false,
        error: null,
        success: false,
    });

    const createOrder = async (formData: OrderFormData, rates: ExchangeRates, availableVesBalance?: number) => {
        setState({ loading: true, error: null, success: false });

        try {
            if (!user) throw new Error('Debes iniciar sesion para crear pedidos.');
            const isHourRestrictionActive = isOrderBalanceRestrictionActive();
            const shouldEnforceVesBalance = (role === 'seller' || role === 'client') && isHourRestrictionActive;

            const rate = rates.VES || 0;
            if (rate <= 0) throw new Error('La tasa de cambio no esta disponible.');
            if (!formData.clpAmount || formData.clpAmount <= 0) throw new Error('El monto en CLP debe ser mayor a cero.');
            if (!formData.clientName.trim()) throw new Error('El nombre del cliente es obligatorio.');
            if (!formData.cedula.trim()) throw new Error('La cedula es obligatoria.');

            const normalizedEmail = (formData.email || '').trim().toLowerCase();
            const destinationAmount = Math.ceil(formData.clpAmount * rate * 100) / 100;
            let sellerCommissionRate = 0;

            if (shouldEnforceVesBalance && typeof availableVesBalance === 'number' && Number.isFinite(availableVesBalance)) {
                const roundedAvailable = Math.round(availableVesBalance * 100) / 100;
                if (destinationAmount > roundedAvailable) {
                    throw new Error(
                        `Saldo VES insuficiente. Disponible: ${roundedAvailable.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} VES. Pedido: ${destinationAmount.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} VES.`
                    );
                }
            }

            if (formData.type === 'transferencia') {
                if (!formData.bank) throw new Error('Selecciona un banco.');
                const accountClean = (formData.accountNumber || '').replace(/[^0-9]/g, '');
                if (accountClean.length !== 20) throw new Error('El numero de cuenta debe tener 20 digitos.');
                formData.accountNumber = accountClean;
            } else if (formData.type === 'pago-movil') {
                const phoneClean = (formData.phone || '').replace(/[^0-9]/g, '');
                if (phoneClean.length !== 11) throw new Error('El telefono debe tener 11 digitos (Ej: 04141234567).');
                if (!formData.bank) throw new Error('Selecciona un banco receptor.');
                formData.phone = phoneClean;
            } else if (formData.type === 'recarga-saldo') {
                const phoneClean = (formData.phone || '').replace(/[^0-9]/g, '');
                if (phoneClean.length !== 11) throw new Error('El telefono debe tener 11 digitos.');
                formData.phone = phoneClean;
            }

            const newOrderRef = doc(collection(db, 'orders'));
            const orderData: Record<string, any> = {
                type: formData.type,
                status: 'Pendiente de pago',
                userId: user.uid,
                createdByTag: user.email || 'ADMIN',
                country: 'VES',
                clientName: formData.clientName.trim(),
                email: normalizedEmail,
                cedula: formData.cedula.replace(/[^0-9]/g, ''),
                clpAmount: formData.clpAmount,
                destinationCurrency: 'VES',
                destinationAmount,
                createdAt: serverTimestamp(),
            };

            if (formData.bank) orderData.bank = formData.bank;
            if (formData.accountNumber) orderData.accountNumber = formData.accountNumber;
            if (formData.accountType) orderData.accountType = formData.accountType;
            if (formData.phone) orderData.phone = formData.phone;

            if ((role === 'seller' || role === 'admin') && user) {
                const idTokenResult = await user.getIdTokenResult();
                const claimRate = idTokenResult.claims.commissionRate;
                sellerCommissionRate = typeof claimRate === 'number' ? claimRate : Number(claimRate || 0);
                orderData.sellerId = user.uid;
                orderData.sellerEmail = user.email || '';
                orderData.sellerCommissionRate = Number.isFinite(sellerCommissionRate) ? sellerCommissionRate : 0;
            }

            // Shared clients is admin-only by Firestore rules.
            if (role === 'admin') {
                const cleanCedula = formData.cedula.replace(/[^0-9]/g, '');
                const clientRef = doc(db, 'clients', cleanCedula);
                const syncClientData: Record<string, any> = {
                    clientName: formData.clientName.trim(),
                    cedula: cleanCedula,
                    updatedAt: serverTimestamp(),
                    createdAt: serverTimestamp(),
                };
                if (normalizedEmail) syncClientData.email = normalizedEmail;
                if (formData.bank) syncClientData.bank = formData.bank;
                if (formData.accountNumber) syncClientData.accountNumber = formData.accountNumber;
                if (formData.accountType) syncClientData.accountType = formData.accountType;
                if (formData.phone) syncClientData.phone = formData.phone;
                await setDoc(clientRef, syncClientData, { merge: true });
            }

            await setDoc(newOrderRef, orderData);

            setState({ loading: false, error: null, success: true });
            return newOrderRef.id;
        } catch (err: any) {
            const msg = err.message || 'Error al crear el pedido';
            setState({ loading: false, error: msg, success: false });
            throw new Error(msg);
        }
    };

    const reset = () => setState({ loading: false, error: null, success: false });

    return { ...state, createOrder, reset };
}
