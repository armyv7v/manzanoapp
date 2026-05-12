import { useState, useMemo, useEffect } from 'react';
import { X, Plus, Minus, ChevronRight, ChevronLeft } from 'lucide-react';
import { Button } from '../components/ui';
import { useBalanceOperations } from '../hooks/useBalanceOperations';
import { useToast } from '../contexts/ToastContext';
import type { VesAccount } from '../hooks/useVesAccounts';
import { useWholesalePurchases } from '../hooks/useWholesalePurchases';
import { useExchangeRates } from '../hooks/useExchangeRates';

interface Props {
    type: 'add' | 'subtract';
    vesAmount: number;
    accounts: VesAccount[];
    onClose: () => void;
}

export function BalanceOperationModal({ type, vesAmount, accounts, onClose }: Props) {
    const [step, setStep] = useState<1 | 2>(1);
    const [holder, setHolder] = useState('');
    const [bank, setBank] = useState('');
    const [note, setNote] = useState('');
    const [clpRate, setClpRate] = useState('');
    const { operate, loading } = useBalanceOperations(accounts);
    const { latestPurchase, loadLatest } = useWholesalePurchases();
    const { rates } = useExchangeRates();
    const toast = useToast();

    const isAdd = type === 'add';
    const title = isAdd ? 'Cargar Saldo' : 'Restar Saldo';
    const Icon = isAdd ? Plus : Minus;
    const gradientClasses = isAdd
        ? 'from-green-600 to-emerald-600'
        : 'from-red-600 to-rose-600';

    // Extraer titulares únicos
    const holderNames = useMemo(() => {
        const set = new Set(accounts.map(a => a.holder));
        return Array.from(set).sort();
    }, [accounts]);

    // Bancos disponibles para el titular seleccionado
    const availableBanks = useMemo(() => {
        if (!holder) return [];
        const banks = accounts.filter(a => a.holder === holder).map(a => a.bank);
        return Array.from(new Set(banks)).sort();
    }, [accounts, holder]);

    // Pre-seleccionar cuenta con mayor saldo
    const preselect = () => {
        if (accounts.length > 0 && !holder) {
            const richest = [...accounts].sort((a, b) => b.balance - a.balance)[0];
            if (richest) {
                setHolder(richest.holder);
                setTimeout(() => setBank(richest.bank), 0);
            }
        }
    };

    // Llamar preselect al montar
    useState(() => { preselect(); });

    useEffect(() => {
        if (!isAdd) return;
        loadLatest();
    }, [isAdd, loadLatest]);

    useEffect(() => {
        if (!isAdd) return;
        if (clpRate) return;

        const defaultRate = latestPurchase?.wholesaleRateClpPerVes || rates.purchaseRateVES || 0;
        if (defaultRate > 0) {
            setClpRate(defaultRate.toString());
        }
    }, [clpRate, isAdd, latestPurchase?.wholesaleRateClpPerVes, rates.purchaseRateVES]);

    // Equivalente CLP
    const parsedRate = parseFloat(clpRate) || 0;
    const clpEquivalent = parsedRate > 0 ? vesAmount / parsedRate : 0;

    const fmtVes = (n: number) => n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fmtClp = (n: number) => n.toLocaleString('es-CL', { style: 'currency', currency: 'CLP' });

    const handleNext = () => {
        if (!holder || !bank) return;
        setStep(2);
    };

    const handleBack = () => {
        setStep(1);
    };

    const handleConfirm = async () => {
        const success = await operate({
            type,
            amount: vesAmount,
            holder,
            bank,
            note,
            clpRate: parsedRate,
        });

        if (success) {
            const opText = isAdd ? 'cargaron' : 'restaron';
            toast.success(`Se ${opText} ${fmtVes(vesAmount)} VES exitosamente.`);
            onClose();
        } else {
            toast.error('Error al procesar la operación');
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className={`bg-gradient-to-r ${gradientClasses} px-5 py-4 rounded-t-2xl flex justify-between items-center`}>
                    <h3 className="text-white font-bold text-base flex items-center gap-2">
                        <Icon className="w-4 h-4" />
                        {title} — Paso {step}/2
                    </h3>
                    <button onClick={onClose} className="text-white/70 hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-5">
                    {/* Monto badge */}
                    <div className={`mb-4 p-3 rounded-lg text-center ${isAdd ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                        <p className="text-xs text-gray-500">Monto VES</p>
                        <p className={`text-2xl font-bold ${isAdd ? 'text-green-700' : 'text-red-700'}`}>
                            {fmtVes(vesAmount)} VES
                        </p>
                    </div>

                    {step === 1 ? (
                        /* ======= PASO 1: Titular, Banco, Nota ======= */
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Titular</label>
                                <select
                                    value={holder}
                                    onChange={e => {
                                        setHolder(e.target.value);
                                        setBank(''); // reset bank when holder changes
                                    }}
                                    className="mt-1 w-full p-2.5 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500"
                                >
                                    <option value="">Seleccione titular...</option>
                                    {holderNames.map(h => (
                                        <option key={h} value={h}>{h}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Banco</label>
                                <select
                                    value={bank}
                                    onChange={e => setBank(e.target.value)}
                                    className="mt-1 w-full p-2.5 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500"
                                    disabled={!holder}
                                >
                                    <option value="">Seleccione banco...</option>
                                    {availableBanks.map(b => (
                                        <option key={b} value={b}>{b}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Nota (opcional)</label>
                                <input
                                    type="text"
                                    value={note}
                                    onChange={e => setNote(e.target.value)}
                                    placeholder="Máx 30 caracteres"
                                    maxLength={30}
                                    className="mt-1 w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>

                            <Button
                                onClick={handleNext}
                                disabled={!holder || !bank}
                                className="w-full flex items-center justify-center gap-2"
                            >
                                Siguiente <ChevronRight className="w-4 h-4" />
                            </Button>
                        </div>
                    ) : (
                        /* ======= PASO 2: Tasa CLP y Confirmación ======= */
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Tasa de Compra (CLP por 1 VES)</label>
                                <input
                                    type="number"
                                    step="0.00001"
                                    value={clpRate}
                                    onChange={e => setClpRate(e.target.value)}
                                    placeholder="Ej: 0.035"
                                    className="mt-1 w-full p-2.5 border border-gray-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500"
                                    required
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    Equivalente: <span className="font-semibold">{clpEquivalent > 0 ? fmtClp(clpEquivalent) : '0,00 CLP'}</span>
                                </p>
                                {isAdd && latestPurchase?.wholesaleRateClpPerVes && (
                                    <p className="text-[11px] text-indigo-600 mt-1">
                                        Tasa mayorista sugerida: {latestPurchase.wholesaleRateClpPerVes.toFixed(6)} (editable)
                                    </p>
                                )}
                            </div>

                            {/* Resumen */}
                            <div className="bg-gray-50 rounded-lg p-3 space-y-1.5 text-sm border border-gray-100">
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Operación:</span>
                                    <span className="font-semibold">{isAdd ? 'Cargar' : 'Restar'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Monto:</span>
                                    <span className="font-semibold">{fmtVes(vesAmount)} VES</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Titular:</span>
                                    <span className="font-semibold">{holder}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Banco:</span>
                                    <span className="font-semibold">{bank}</span>
                                </div>
                                {note && (
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Nota:</span>
                                        <span className="font-semibold">{note}</span>
                                    </div>
                                )}
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={handleBack}
                                    className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-50 flex items-center justify-center gap-1 transition-colors"
                                >
                                    <ChevronLeft className="w-4 h-4" /> Atrás
                                </button>
                                <Button
                                    onClick={handleConfirm}
                                    disabled={loading || parsedRate <= 0}
                                    className="flex-1"
                                >
                                    {loading ? 'Procesando...' : 'Confirmar'}
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
