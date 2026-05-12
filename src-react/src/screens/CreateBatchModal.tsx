import { useState, useEffect } from 'react';
import { Modal } from '../components/ui/Modal';
import { useAuth } from '../hooks/useAuth';
import { useClients } from '../hooks/useClients';
import { useExchangeRates } from '../hooks/useExchangeRates';
import { useToast } from '../contexts/ToastContext';
import { db } from '../lib/firebase';
import { collection, doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { Search, Loader2, ChevronRight, ChevronLeft, Building2, Smartphone, CreditCard } from 'lucide-react';

interface CreateBatchModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export function CreateBatchModal({ isOpen, onClose, onSuccess }: CreateBatchModalProps) {
    const { user, role } = useAuth();
    const { clients, loading: loadingClients, searchByCedula } = useClients();
    const { rates } = useExchangeRates();
    const toast = useToast();

    const [step, setStep] = useState<1 | 2>(1);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedClients, setSelectedClients] = useState<Set<string>>(new Set());
    const [amounts, setAmounts] = useState<Record<string, string>>({}); // clpAmount string per clientId
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Reset state when modal opens
    useEffect(() => {
        if (isOpen) {
            setStep(1);
            setSearchTerm('');
            setSelectedClients(new Set());
            setAmounts({});
        }
    }, [isOpen]);

    // Handle Search
    useEffect(() => {
        const timer = setTimeout(() => {
            if (searchTerm.trim().length > 2) {
                searchByCedula(searchTerm);
            }
        }, 500);
        return () => clearTimeout(timer);
    }, [searchTerm, searchByCedula]);

    const shouldShowSearchResults = searchTerm.trim().length > 2;

    const toggleClient = (clientId: string) => {
        const newSelected = new Set(selectedClients);
        if (newSelected.has(clientId)) {
            newSelected.delete(clientId);
        } else {
            newSelected.add(clientId);
        }
        setSelectedClients(newSelected);
    };

    const handleAmountChange = (clientId: string, value: string) => {
        setAmounts(prev => ({ ...prev, [clientId]: value }));
    };

    const getSelectedClientsData = () => {
        return clients.filter(c => selectedClients.has(c.id));
    };

    const allAmountsValid = () => {
        const selected = getSelectedClientsData();
        if (selected.length === 0) return false;
        return selected.every(c => {
            const val = parseFloat(amounts[c.id]);
            return !isNaN(val) && val > 0;
        });
    };

    const handleSubmit = async () => {
        if (!allAmountsValid()) {
            toast.error("Ingrese montos válidos para todos los clientes");
            return;
        }

        setIsSubmitting(true);
        const adminTag = user?.email || 'ADMIN';
        const vesRate = rates?.VES || 0;
        let sellerCommissionRate = 0;

        try {
            if ((role === 'seller' || role === 'admin') && user) {
                const idTokenResult = await user.getIdTokenResult();
                const claimRate = idTokenResult.claims.commissionRate;
                const parsedRate = typeof claimRate === 'number' ? claimRate : Number(claimRate || 0);
                sellerCommissionRate = Number.isFinite(parsedRate) ? parsedRate : 0;
            }

            const batch = writeBatch(db);
            const selected = getSelectedClientsData();

            selected.forEach(client => {
                const clpAmount = parseFloat(amounts[client.id]);
                const destinationAmount = Number((clpAmount * vesRate).toFixed(2));

                const newOrderRef = doc(collection(db, 'orders'));

                // Copy client data but ensure we don't mess up id
                const clientObj = { ...client };
                delete (clientObj as any).id;
                delete (clientObj as any).clientId;

                batch.set(newOrderRef, {
                    ...clientObj,
                    id: newOrderRef.id,
                    clientId: client.id,
                    clpAmount,
                    destinationAmount,
                    destinationCurrency: 'VES',
                    status: 'Pendiente de pago',
                    userId: user?.uid || 'unknown',
                    createdByTag: adminTag,
                    createdAt: serverTimestamp(),
                    ...((role === 'seller' || role === 'admin') && user ? {
                        sellerId: user.uid,
                        sellerEmail: user.email || '',
                        sellerCommissionRate,
                    } : {}),
                });
            });

            await batch.commit();
            toast.success(`Se crearon ${selected.length} pedidos en lote`);
            onSuccess();
        } catch (error: any) {
            console.error("Error al crear pedidos en lote:", error);
            toast.error(error.message || "Error al crear lote");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={step === 1 ? "Paso 1: Seleccionar Clientes" : "Paso 2: Ingresar Montos (CLP)"}
            maxWidth="xl"
        >
            {step === 1 && (
                <div className="space-y-4 flex flex-col h-[60vh]">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                        <input
                            type="text"
                            placeholder="Buscar por cédula..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 text-sm"
                        />
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-2 pr-2 border rounded-xl p-2 bg-gray-50/50">
                        {!shouldShowSearchResults ? (
                            <p className="text-center text-gray-500 py-8 text-sm">Escribe al menos 3 digitos para buscar clientes.</p>
                        ) : loadingClients ? (
                            <div className="flex justify-center py-8">
                                <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                            </div>
                        ) : clients.length === 0 ? (
                            <p className="text-center text-gray-500 py-8 text-sm">No se encontraron clientes.</p>
                        ) : (
                            clients.map(client => {
                                const isSelected = selectedClients.has(client.id);
                                const TypeIcon = (client as any).type === 'transferencia' ? Building2 : ((client as any).type === 'pago-movil' ? Smartphone : CreditCard);

                                return (
                                    <label
                                        key={client.id}
                                        className={`flex items-center p-3 rounded-lg border cursor-pointer transition-colors ${isSelected ? 'bg-blue-50 border-blue-300 ring-1 ring-blue-300' : 'bg-white border-gray-200 hover:bg-gray-100'}`}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={() => toggleClient(client.id)}
                                            className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500 mr-3 shrink-0"
                                        />
                                        <div className="flex-1 min-w-0">
                                            <p className="font-bold text-gray-800 text-sm truncate">{client.clientName}</p>
                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                <span className="text-xs text-gray-500 font-mono">{client.cedula}</span>
                                                <span className="text-gray-300">•</span>
                                                <div className="flex items-center gap-1 text-xs text-purple-700 font-medium">
                                                    <TypeIcon className="w-3 h-3" />
                                                    <span className="truncate">{client.bank || (client as any).type || 'Sin banco'}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </label>
                                );
                            })
                        )}
                    </div>

                    <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                        <span className="text-sm font-semibold text-gray-600">
                            {selectedClients.size} cliente(s) seleccionado(s)
                        </span>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors text-sm"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={() => setStep(2)}
                                disabled={selectedClients.size === 0}
                                className="px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 rounded-lg font-bold shadow-sm transition-colors text-sm flex items-center gap-1"
                            >
                                Siguiente <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {step === 2 && (
                <div className="space-y-4 flex flex-col h-[60vh]">
                    <div className="bg-blue-50/50 p-3 rounded-xl border border-blue-100 flex justify-between items-center shrink-0">
                        <div>
                            <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Tasa Actual</p>
                            <p className="font-mono text-sm font-bold text-blue-700">{rates?.VES?.toFixed(4) || '0.00'} VES/CLP</p>
                        </div>
                        <div className="text-right">
                            <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Clientes</p>
                            <p className="text-sm font-bold text-gray-800">{selectedClients.size}</p>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto pr-2">
                        <table className="w-full text-left text-sm whitespace-nowrap">
                            <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th className="px-3 py-2.5 font-semibold text-gray-600 rounded-tl-lg">Cliente</th>
                                    <th className="px-3 py-2.5 font-semibold text-gray-600 w-32">Monto (CLP)</th>
                                    <th className="px-3 py-2.5 font-semibold text-gray-600 text-right rounded-tr-lg">Recibe (VES)</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {getSelectedClientsData().map(client => {
                                    const clientType = (client as any).type as string;
                                    const accountNumber = (client as any).accountNumber as string | undefined;
                                    const phone = (client as any).phone as string | undefined;

                                    const copyTransferData = () => {
                                        let text = '';
                                        if (clientType === 'transferencia') {
                                            text = `Banco: ${client.bank || 'N/A'}\nCuenta: ${accountNumber || 'N/A'}\nCédula: ${client.cedula}\nBeneficiario: ${client.clientName}`;
                                        } else {
                                            text = `Banco: ${client.bank || 'N/A'}\nTeléfono: ${phone || 'N/A'}\nCédula: ${client.cedula}\nBeneficiario: ${client.clientName}`;
                                        }
                                        navigator.clipboard.writeText(text);
                                    };
                                    const clpAmount = parseFloat(amounts[client.id] || '0');
                                    const vesAmount = !isNaN(clpAmount) ? (clpAmount * (rates?.VES || 0)) : 0;
                                    const TypeIcon = clientType === 'transferencia' ? Building2 : (clientType === 'pago-movil' ? Smartphone : CreditCard);

                                    return (
                                        <tr key={client.id} className="hover:bg-gray-50/50">
                                            <td className="px-3 py-3">
                                                <p className="font-bold text-gray-800 text-[13px]">{client.clientName}</p>
                                                <div className="flex items-center gap-1 text-[10px] text-gray-500 mt-0.5">
                                                    <span className="font-mono">{client.cedula}</span>
                                                    <span>•</span>
                                                    <span className="text-purple-600 flex items-center gap-0.5">
                                                        <TypeIcon className="w-2.5 h-2.5" /> {client.bank || '...'}
                                                    </span>
                                                </div>
                                                <div className="mt-1.5 bg-amber-50 border border-amber-200 rounded px-2 py-1 text-[10px] font-mono text-gray-700">
                                                    {clientType === 'transferencia' && accountNumber ? (
                                                        <span><span className="text-gray-400 font-sans not-italic">Cta: </span>{accountNumber}</span>
                                                    ) : phone ? (
                                                        <span><span className="text-gray-400 font-sans not-italic">Telf: </span>{phone}</span>
                                                    ) : (
                                                        <span className="text-gray-400 italic font-sans">Sin datos de cuenta</span>
                                                    )}
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={copyTransferData}
                                                    className="mt-1 text-[9px] bg-blue-50 text-blue-600 hover:bg-blue-100 px-1.5 py-0.5 rounded font-semibold transition-colors"
                                                >
                                                    Copiar datos
                                                </button>
                                            </td>
                                            <td className="px-3 py-3">
                                                <input
                                                    type="number"
                                                    value={amounts[client.id] || ''}
                                                    onChange={(e) => handleAmountChange(client.id, e.target.value)}
                                                    placeholder="Ej: 5000"
                                                    className="w-full px-2 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 text-sm font-mono placeholder:text-gray-300"
                                                    step="0.01"
                                                />
                                            </td>
                                            <td className="px-3 py-3 text-right font-mono font-bold text-green-600">
                                                {vesAmount.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    <div className="flex justify-between items-center pt-2 border-t border-gray-100 shrink-0">
                        <button
                            type="button"
                            onClick={() => setStep(1)}
                            className="px-4 py-2 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors text-sm flex items-center gap-1"
                        >
                            <ChevronLeft className="w-4 h-4" /> Atrás
                        </button>
                        <button
                            type="button"
                            onClick={handleSubmit}
                            disabled={!allAmountsValid() || isSubmitting}
                            className="px-4 py-2 text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-400 rounded-lg font-bold shadow-sm transition-colors text-sm flex items-center gap-1.5"
                        >
                            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                            Confirma Lote
                        </button>
                    </div>
                </div>
            )}
        </Modal>
    );
}
