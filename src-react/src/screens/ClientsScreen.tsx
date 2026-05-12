import { useState, useEffect, type MouseEvent } from 'react';
import { useClients } from '../hooks/useClients';
import type { Client } from '../hooks/useClients';
import { Button } from '../components/ui';
import { Edit2, Trash2, Save, X } from 'lucide-react';
import { useNavigation } from '../contexts/NavigationContext';

interface Props {
    onBack?: () => void;
}

export function ClientsScreen({ onBack }: Props = {}) {
    const { goHome } = useNavigation();
    const handleBack = onBack || goHome;
    const {
        clients,
        loading,
        error,
        loadRecent,
        searchByCedula,
        updateClient,
        deleteClient,
        canManageGlobalClients
    } = useClients();

    const [searchQuery, setSearchQuery] = useState('');
    const [selectedClient, setSelectedClient] = useState<Client | null>(null);
    const [editingClientId, setEditingClientId] = useState<string | null>(null);
    const [editFormData, setEditFormData] = useState<Partial<Client>>({});
    const [clientToDelete, setClientToDelete] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        loadRecent();
    }, [loadRecent]);

    const handleSearch = () => {
        if (searchQuery.trim()) {
            searchByCedula(searchQuery.trim());
        } else {
            loadRecent();
        }
    };

    const handleEditClick = (e: MouseEvent, client: Client) => {
        if (!canManageGlobalClients) return;
        e.stopPropagation();
        setEditingClientId(client.id);
        const { id, ...editableData } = client as any;
        setEditFormData(editableData);
    };

    const handleCancelEdit = () => {
        setEditingClientId(null);
        setEditFormData({});
    };

    const handleSaveEdit = async (e: MouseEvent, id: string) => {
        e.stopPropagation();
        setIsSaving(true);
        const success = await updateClient(id, editFormData);
        setIsSaving(false);
        if (success) {
            setEditingClientId(null);
            setEditFormData({});
        }
    };

    const handleDeleteClick = (e: MouseEvent, id: string) => {
        if (!canManageGlobalClients) return;
        e.stopPropagation();
        setClientToDelete(id);
    };

    const handleConfirmDelete = async (e: MouseEvent, id: string) => {
        e.stopPropagation();
        await deleteClient(id);
        setClientToDelete(null);
        if (selectedClient?.id === id) setSelectedClient(null);
    };

    return (
        <div className="min-h-screen bg-gray-50">
            <header className="bg-white border-b border-gray-100 sticky top-0 z-50">
                <div className="max-w-900 mx-auto px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button onClick={handleBack} className="text-gray-400 hover:text-gray-700 transition-colors text-sm font-semibold">
                            ← Volver
                        </button>
                        <h1 className="text-sm font-bold text-gray-800">Clientes</h1>
                    </div>
                    <span className="text-xs text-gray-400">{clients.length} resultados</span>
                </div>
            </header>

            <main className="max-w-900 mx-auto px-4 py-6 space-y-4">
                <div className="bg-white rounded-xl border border-gray-100 p-4">
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                            placeholder="Buscar por cedula..."
                            className="exchange-input flex-1 !text-xs"
                        />
                        <Button variant="primary" onClick={handleSearch} isLoading={loading} className="!text-xs shrink-0">
                            Buscar
                        </Button>
                        {searchQuery && (
                            <Button variant="ghost" onClick={() => { setSearchQuery(''); loadRecent(); }} className="!text-xs shrink-0">
                                Limpiar
                            </Button>
                        )}
                    </div>
                    {!canManageGlobalClients && (
                        <p className="mt-2 text-[11px] text-gray-500">
                            Vista privada: solo puedes ver clientes de tu propio historial.
                        </p>
                    )}
                </div>

                {error && (
                    <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-xs text-red-600">{error}</div>
                )}

                {loading ? (
                    <div className="text-center py-12 text-gray-400 text-sm animate-pulse">Cargando clientes...</div>
                ) : clients.length === 0 ? (
                    <div className="text-center py-16">
                        <p className="text-gray-400 text-sm">No se encontraron clientes</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {clients.map((client) => (
                            <div key={client.id}>
                                {canManageGlobalClients && editingClientId === client.id ? (
                                    <div className="bg-white rounded-xl border border-blue-400 ring-2 ring-blue-100 p-4 relative" onClick={(e) => e.stopPropagation()}>
                                        <h3 className="text-sm font-bold text-gray-800 mb-3">Editar Cliente</h3>
                                        <div className="space-y-3">
                                            <div>
                                                <label className="block text-[10px] text-gray-500 mb-1">Nombre Completo</label>
                                                <input
                                                    type="text"
                                                    value={editFormData.clientName || ''}
                                                    onChange={(e) => setEditFormData({ ...editFormData, clientName: e.target.value })}
                                                    className="exchange-input !text-xs w-full"
                                                />
                                            </div>
                                            <div className="grid grid-cols-2 gap-2">
                                                <div>
                                                    <label className="block text-[10px] text-gray-500 mb-1">Cedula</label>
                                                    <input
                                                        type="text"
                                                        value={editFormData.cedula || ''}
                                                        onChange={(e) => setEditFormData({ ...editFormData, cedula: e.target.value })}
                                                        className="exchange-input !text-xs w-full"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] text-gray-500 mb-1">Telefono</label>
                                                    <input
                                                        type="text"
                                                        value={editFormData.phone || ''}
                                                        onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                                                        className="exchange-input !text-xs w-full"
                                                    />
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-[10px] text-gray-500 mb-1">Email</label>
                                                <input
                                                    type="email"
                                                    value={editFormData.email || ''}
                                                    onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                                                    className="exchange-input !text-xs w-full"
                                                />
                                            </div>
                                            <div className="grid grid-cols-2 gap-2">
                                                <div>
                                                    <label className="block text-[10px] text-gray-500 mb-1">Banco</label>
                                                    <input
                                                        type="text"
                                                        value={editFormData.bank || ''}
                                                        onChange={(e) => setEditFormData({ ...editFormData, bank: e.target.value })}
                                                        className="exchange-input !text-xs w-full"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] text-gray-500 mb-1">Cuenta</label>
                                                    <input
                                                        type="text"
                                                        value={editFormData.accountNumber || ''}
                                                        onChange={(e) => setEditFormData({ ...editFormData, accountNumber: e.target.value })}
                                                        className="exchange-input !text-xs w-full"
                                                    />
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-[10px] text-gray-500 mb-1">Tipo Cuenta</label>
                                                <input
                                                    type="text"
                                                    value={editFormData.accountType || ''}
                                                    onChange={(e) => setEditFormData({ ...editFormData, accountType: e.target.value })}
                                                    className="exchange-input !text-xs w-full"
                                                    placeholder="Ej. Corriente, Ahorro"
                                                />
                                            </div>
                                            <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-gray-100">
                                                <Button variant="ghost" className="!py-1.5 !px-3 !text-xs" onClick={handleCancelEdit}>
                                                    Cancelar
                                                </Button>
                                                <Button variant="primary" className="!py-1.5 !px-3 !text-xs flex items-center gap-1.5" isLoading={isSaving} onClick={(e) => handleSaveEdit(e, client.id)}>
                                                    <Save className="w-3.5 h-3.5" /> Guardar
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div
                                        onClick={() => setSelectedClient(selectedClient?.id === client.id ? null : client)}
                                        className={`bg-white rounded-xl border p-4 cursor-pointer transition-all ${selectedClient?.id === client.id
                                            ? 'border-blue-400 ring-2 ring-blue-100'
                                            : 'border-gray-100 hover:shadow-md'
                                            }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center shrink-0">
                                                    <span className="text-blue-600 font-bold text-sm">
                                                        {client.clientName?.charAt(0)?.toUpperCase() || '?'}
                                                    </span>
                                                </div>
                                                <div>
                                                    <p className="text-sm font-semibold text-gray-800">{client.clientName}</p>
                                                    <p className="text-[11px] text-gray-400 font-mono">CI: {client.cedula}</p>
                                                </div>
                                            </div>
                                            {client.phone && (
                                                <span className="text-[11px] text-gray-400">{client.phone}</span>
                                            )}
                                        </div>

                                        {selectedClient?.id === client.id && (
                                            <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-2 gap-2 text-xs">
                                                {client.email && (
                                                    <div>
                                                        <span className="text-gray-400">Email</span>
                                                        <p className="font-semibold text-gray-700">{client.email}</p>
                                                    </div>
                                                )}
                                                {client.bank && (
                                                    <div>
                                                        <span className="text-gray-400">Banco</span>
                                                        <p className="font-semibold text-gray-700">{client.bank}</p>
                                                    </div>
                                                )}
                                                {client.accountNumber && (
                                                    <div className="col-span-2">
                                                        <span className="text-gray-400">Cuenta / TELF</span>
                                                        <p className="font-semibold font-mono text-gray-700">{client.accountNumber}</p>
                                                    </div>
                                                )}
                                                {client.accountType && (
                                                    <div>
                                                        <span className="text-gray-400">Tipo Cuenta</span>
                                                        <p className="font-semibold text-gray-700">{client.accountType}</p>
                                                    </div>
                                                )}

                                                {canManageGlobalClients && (
                                                    <div className="col-span-2 flex justify-end gap-2 mt-2 pt-2 border-t border-gray-50">
                                                        {clientToDelete === client.id ? (
                                                            <div className="flex items-center bg-red-50 rounded-full px-2 py-1 gap-1.5 text-[10px] font-bold text-red-600 border border-red-200" onClick={(e) => e.stopPropagation()}>
                                                                Eliminar?
                                                                <button onClick={(e) => { e.stopPropagation(); setClientToDelete(null); }} className="w-5 h-5 rounded-full bg-white text-gray-500 hover:bg-gray-100 flex items-center justify-center shadow-sm"><X className="w-3 h-3" /></button>
                                                                <button onClick={(e) => handleConfirmDelete(e, client.id)} className="w-5 h-5 rounded-full bg-red-500 text-white hover:bg-red-600 flex items-center justify-center shadow-sm"><Trash2 className="w-3 h-3" /></button>
                                                            </div>
                                                        ) : (
                                                            <>
                                                                <button onClick={(e) => handleDeleteClick(e, client.id)} className="text-gray-400 hover:text-red-500 transition-colors p-1.5 rounded hover:bg-red-50" title="Eliminar Cliente">
                                                                    <Trash2 className="w-4 h-4" />
                                                                </button>
                                                                <button onClick={(e) => handleEditClick(e, client)} className="text-gray-400 hover:text-blue-500 transition-colors p-1.5 rounded hover:bg-blue-50" title="Editar Cliente">
                                                                    <Edit2 className="w-4 h-4" />
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}
