import { useState, useMemo } from 'react';
import { useExchangeRates } from '../hooks/useExchangeRates';
import { useCreateOrder, VENEZUELAN_BANKS } from '../hooks/useCreateOrder';
import { findClientSilently } from '../hooks/useClients';
import type { OrderType, OrderFormData } from '../hooks/useCreateOrder';
import { useAuth } from '../hooks/useAuth';
import { Button, Modal } from '../components/ui';
import { useToast } from '../contexts/ToastContext';
import { Building2, Smartphone, CreditCard } from 'lucide-react';
import {
    detectBankByPrefix,
    isOrderBalanceRestrictionActive,
    ORDER_BALANCE_RESTRICTION_HOUR,
    resolveUserTag,
    shouldRestrictOrdersByVesBalance,
} from '../lib/constants';

const TYPE_TABS: { value: OrderType; label: string; icon: typeof Building2 }[] = [
    { value: 'transferencia', label: 'Transferencia', icon: Building2 },
    { value: 'pago-movil', label: 'Pago Móvil', icon: Smartphone },
    { value: 'recarga-saldo', label: 'Recarga', icon: CreditCard },
];

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSuccess?: (orderId: string) => void;
    availableVesBalance?: number;
    vesBalanceLoading?: boolean;
}

export function OrderForm({
    isOpen,
    onClose,
    onSuccess,
    availableVesBalance,
    vesBalanceLoading = false,
}: Props) {
    const { rates } = useExchangeRates();
    const { role, user } = useAuth();
    const { createOrder, loading, error, reset } = useCreateOrder();
    const toast = useToast();

    const [type, setType] = useState<OrderType>('transferencia');
    const [clientName, setClientName] = useState('');
    const [cedula, setCedula] = useState('');
    const [email, setEmail] = useState('');
    const [clpAmount, setClpAmount] = useState('');
    const [bank, setBank] = useState('');
    const [accountNumber, setAccountNumber] = useState('');
    const [phone, setPhone] = useState('');

    const destinationAmount = useMemo(() => {
        const amount = parseFloat(clpAmount);
        if (isNaN(amount) || amount <= 0) return 0;
        const rate = rates.VES || 0;
        if (rate <= 0) return 0;
        return Math.ceil(amount * rate * 100) / 100;
    }, [clpAmount, rates.VES]);

    const currentUserTag = resolveUserTag(user?.email || '');
    const balanceRestrictionActive = isOrderBalanceRestrictionActive();
    const shouldEnforceVesBalance = shouldRestrictOrdersByVesBalance(role);
    const showVesAvailability = role === 'seller' || role === 'admin';
    const safeAvailableVesBalance = typeof availableVesBalance === 'number' ? availableVesBalance : 0;
    const vesShortfallVisible = showVesAvailability
        && !vesBalanceLoading
        && destinationAmount > 0
        && destinationAmount > safeAvailableVesBalance;
    const insufficientVesBalance = shouldEnforceVesBalance && vesShortfallVisible;

    const handlePaste = async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (!text) return;

            const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
            const lowerText = text.toLowerCase();
            if (lowerText.includes('pago movil') || lowerText.includes('pago móvil')) {
                setType('pago-movil');
            } else if (lowerText.includes('recarga')) {
                setType('recarga-saldo');
            } else {
                setType('transferencia');
            }

            lines.forEach(line => {
                const lowerLine = line.toLowerCase();

                if (lowerLine.includes('nombre') || lowerLine.includes('titular')) {
                    setClientName(line.split(/[:\-]/)[1]?.trim() || '');
                }
                else if (lowerLine.includes('cedula') || lowerLine.includes('cédula') || lowerLine.includes('ci')) {
                    const ciMatch = line.match(/\d{6,9}/);
                    if (ciMatch) setCedula(ciMatch[0]);
                }
                else if (lowerLine.includes('banco')) {
                    const lineBank = line.split(/[:\-]/)[1]?.trim();
                    if (lineBank) {
                        const detected = VENEZUELAN_BANKS.find(b => b.toLowerCase().includes(lineBank.toLowerCase()));
                        if (detected) setBank(detected);
                    }
                }
                else if (lowerLine.includes('cuenta')) {
                    const accMatch = line.match(/\d{20}/);
                    if (accMatch) {
                        setAccountNumber(accMatch[0]);
                        if (!bank) {
                            const detected = detectBankByPrefix(accMatch[0]);
                            if (detected && VENEZUELAN_BANKS.includes(detected)) setBank(detected);
                        }
                    }
                }
                else if (lowerLine.includes('telefono') || lowerLine.includes('teléfono') || lowerLine.includes('celular') || lowerLine.includes('tlf')) {
                    const phoneClean = line.split(/[:\-]/)[1]?.replace(/\D/g, '') || '';
                    if (phoneClean.length >= 10) {
                        const localPhone = phoneClean.length === 12 && phoneClean.startsWith('58') ? '0' + phoneClean.slice(2) : phoneClean;
                        setPhone(localPhone.slice(0, 11));
                    }
                }
                else if (lowerLine.includes('monto') || lowerLine.includes('cantidad')) {
                    const numMatch = line.split(/[:\-]/)[1]?.replace(/[^\d]/g, '');
                    if (numMatch) setClpAmount(numMatch);
                }
            });

            toast.success('Datos pegados desde el portapapeles');
        } catch (err) {
            toast.error('No se pudo leer el portapapeles. Da permisos o pégalo manualmente.');
        }
    };

    const resetForm = () => {
        setClientName('');
        setCedula('');
        setEmail('');
        setClpAmount('');
        setBank('');
        setAccountNumber('');
        setPhone('');
        reset();
    };

    const handleClose = () => {
        resetForm();
        onClose();
    };

    const handleSubmit = async () => {
        const data: OrderFormData = {
            type,
            clientName,
            cedula,
            email,
            clpAmount: parseFloat(clpAmount),
            bank: bank || undefined,
            accountNumber: accountNumber || undefined,
            phone: phone || undefined,
        };

        try {
            const orderId = await createOrder(
                data,
                rates,
                shouldEnforceVesBalance ? safeAvailableVesBalance : undefined
            );
            if (orderId && onSuccess) onSuccess(orderId);
            toast.success(`Pedido creado: #${orderId?.slice(-5) || ''}`);
            resetForm();
            onClose();
        } catch (err: any) {
            const message = err?.message || 'Error al crear el pedido';
            if (message.toLowerCase().includes('saldo ves insuficiente')) {
                toast.warning(message);
                return;
            }
            toast.error(message);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={handleClose} title="Crear Nuevo Pedido">
            <div className="space-y-4">
                <div className="flex bg-gray-100 rounded-lg p-1 gap-1 relative">
                    {TYPE_TABS.map(tab => (
                        <button
                            key={tab.value}
                            onClick={() => { setType(tab.value); reset(); }}
                            className={`flex-1 py-2 px-2 rounded-md text-xs font-semibold transition-all ${type === tab.value
                                ? 'bg-white shadow-sm text-blue-600'
                                : 'text-gray-500 hover:text-gray-700'
                                }`}
                        >
                            <span className="mr-1"><tab.icon className="w-3.5 h-3.5 inline" /></span>
                            <span className="hidden sm:inline">{tab.label}</span>
                        </button>
                    ))}

                    <button
                        onClick={handlePaste}
                        className="ml-auto px-3 py-1 bg-manzano-100 hover:bg-manzano-200 text-manzano-700 text-xs font-bold rounded-md transition-colors border border-manzano-200 flex items-center gap-1 shrink-0"
                    >
                        📋 Pegar Datos
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                        <label className="exchange-label">Nombre Completo</label>
                        <input
                            type="text"
                            value={clientName}
                            onChange={e => setClientName(e.target.value)}
                            placeholder="Juan Pérez"
                            className="exchange-input"
                            required
                        />
                    </div>
                    <div>
                        <label className="exchange-label">Cédula</label>
                        <input
                            type="text"
                            value={cedula}
                            onChange={e => setCedula(e.target.value)}
                            onBlur={async () => {
                                if (cedula.length >= 6) {
                                    const client = await findClientSilently(cedula, {
                                        role,
                                        userId: user?.uid || null,
                                    });
                                    if (client) {
                                        if (!clientName) setClientName(client.clientName);
                                        if (!email && client.email) setEmail(client.email);
                                        if (!phone && client.phone) setPhone(client.phone);
                                        if (!bank && client.bank && VENEZUELAN_BANKS.includes(client.bank)) setBank(client.bank);
                                        if (!accountNumber && client.accountNumber) setAccountNumber(client.accountNumber);
                                        toast.success('✨ Cliente autocompletado exitosamente');
                                    }
                                }
                            }}
                            placeholder="12345678"
                            className="exchange-input"
                            required
                        />
                    </div>
                    <div className="md:col-span-2">
                        <label className="exchange-label">Correo Electrónico (Opcional)</label>
                        <input
                            type="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            placeholder="cliente@email.com"
                            className="exchange-input"
                        />
                    </div>
                </div>

                {type === 'transferencia' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t border-gray-100">
                        <div>
                            <label className="exchange-label">Banco</label>
                            <select
                                value={bank}
                                onChange={e => setBank(e.target.value)}
                                className="exchange-input"
                                required
                            >
                                <option value="">Seleccione un banco...</option>
                                {VENEZUELAN_BANKS.map(b => (
                                    <option key={b} value={b}>{b}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="exchange-label">Número de Cuenta</label>
                            <input
                                type="text"
                                value={accountNumber}
                                onChange={e => {
                                    const val = e.target.value;
                                    setAccountNumber(val);
                                    const detected = detectBankByPrefix(val);
                                    if (detected && VENEZUELAN_BANKS.includes(detected)) {
                                        setBank(detected);
                                    }
                                }}
                                placeholder="01020000000000000000"
                                maxLength={20}
                                className="exchange-input font-mono"
                                required
                            />
                        </div>
                    </div>
                )}

                {type === 'pago-movil' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t border-gray-100">
                        <div>
                            <label className="exchange-label">Teléfono (11 dígitos)</label>
                            <input
                                type="tel"
                                value={phone}
                                onChange={e => setPhone(e.target.value)}
                                placeholder="04141234567"
                                maxLength={11}
                                className="exchange-input font-mono"
                                required
                            />
                        </div>
                        <div>
                            <label className="exchange-label">Banco Receptor</label>
                            <select
                                value={bank}
                                onChange={e => setBank(e.target.value)}
                                className="exchange-input"
                                required
                            >
                                <option value="">Seleccione un banco...</option>
                                {VENEZUELAN_BANKS.map(b => (
                                    <option key={b} value={b}>{b}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                )}

                {type === 'recarga-saldo' && (
                    <div className="pt-3 border-t border-gray-100">
                        <label className="exchange-label">Teléfono a Recargar (11 dígitos)</label>
                        <input
                            type="tel"
                            value={phone}
                            onChange={e => setPhone(e.target.value)}
                            placeholder="04121234567"
                            maxLength={11}
                            className="exchange-input font-mono"
                            required
                        />
                    </div>
                )}

                <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-100">
                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 flex flex-col items-center justify-center text-center">
                        <p className="text-[10px] text-blue-500 font-bold uppercase tracking-wider mb-1">Monto a Recibir</p>
                        <p className="text-lg md:text-xl font-black text-blue-700 leading-none">
                            {destinationAmount > 0
                                ? destinationAmount.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                : '0,00'
                            } VES
                        </p>
                        {rates.VES > 0 && (
                            <p className="text-[10px] text-blue-400 mt-1.5 font-medium">1 CLP = {rates.VES.toFixed(4)} VES</p>
                        )}
                    </div>

                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 flex flex-col justify-center">
                        <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1">Monto a Enviar (CLP)</label>
                        <input
                            type="number"
                            value={clpAmount}
                            onChange={e => setClpAmount(e.target.value)}
                            placeholder="0"
                            min="1"
                            className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-lg md:text-xl font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all placeholder:text-gray-300"
                            required
                        />
                    </div>
                </div>

                {showVesAvailability && (
                    <div className={`rounded-xl border px-3 py-3 ${vesShortfallVisible
                        ? 'bg-amber-50 border-amber-200'
                        : 'bg-emerald-50 border-emerald-200'
                        }`}>
                        <p className={`text-[10px] font-bold uppercase tracking-wider ${vesShortfallVisible ? 'text-amber-700' : 'text-emerald-700'}`}>
                            Disponible actual
                        </p>
                        <p className={`text-lg font-black leading-none mt-1 ${vesShortfallVisible ? 'text-amber-800' : 'text-emerald-800'}`}>
                            {vesBalanceLoading
                                ? 'Cargando...'
                                : `${safeAvailableVesBalance.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} VES`
                            }
                        </p>
                        <p className="mt-2 text-[11px] text-gray-600">
                            Pedido actual: <span className="font-bold">{destinationAmount.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} VES</span>
                        </p>
                        {insufficientVesBalance && (
                            <p className="mt-1 text-[11px] font-semibold text-amber-700">
                                Este pedido supera el disponible para crear ahora. Si intentas guardarlo, la app te lo advertirá con un toast.
                            </p>
                        )}
                        {!balanceRestrictionActive && vesShortfallVisible && (
                            <p className="mt-1 text-[11px] font-semibold text-amber-700">
                                Este pedido supera el disponible actual, pero antes de las {ORDER_BALANCE_RESTRICTION_HOUR}:00 Hrs no se bloquea la creacion.
                            </p>
                        )}
                        {balanceRestrictionActive && !insufficientVesBalance && vesShortfallVisible && (
                            <p className="mt-1 text-[11px] font-semibold text-amber-700">
                                Este pedido supera el disponible actual, pero tu usuario {currentUserTag || 'actual'} no queda bloqueado por saldo para crear pedidos.
                            </p>
                        )}
                    </div>
                )}

                {error && (
                    <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-red-600 text-xs">
                        {error}
                    </div>
                )}

                <div className="pt-3 flex flex-col-reverse md:flex-row gap-3">
                    <Button variant="danger" fullWidth onClick={handleClose} disabled={loading}>
                        Cancelar
                    </Button>
                    <Button variant="primary" fullWidth onClick={handleSubmit} isLoading={loading}>
                        Crear Pedido
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
