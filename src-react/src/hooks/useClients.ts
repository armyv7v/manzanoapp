import { useState, useCallback } from 'react';
import { collection, query, orderBy, limit, getDocs, where, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import type { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './useAuth';

export interface Client {
    id: string;
    clientName: string;
    cedula: string;
    email?: string;
    phone?: string;
    bank?: string;
    accountNumber?: string;
    accountType?: string;
    type?: string;
}

interface ClientsState {
    clients: Client[];
    loading: boolean;
    error: string | null;
}

interface FindClientContext {
    role?: 'admin' | 'seller' | 'client' | null;
    userId?: string | null;
}

interface RoleScope {
    field: 'sellerId' | 'userId';
    value: string;
}

const normalizeCedula = (value: unknown): string =>
    String(value || '').replace(/[^0-9]/g, '');

const getSafeString = (value: unknown): string =>
    (typeof value === 'string' ? value.trim() : '');

const getCreatedAtMillis = (value: any): number => {
    if (!value) return 0;
    if (typeof value.toMillis === 'function') return value.toMillis();
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'number') return value;
    return 0;
};

const getRoleScope = (
    role: 'admin' | 'seller' | 'client' | null | undefined,
    userId?: string | null
): RoleScope | null => {
    if (!userId) return null;
    if (role === 'seller') return { field: 'sellerId', value: userId };
    if (role === 'client') return { field: 'userId', value: userId };
    return null;
};

const sortByCreatedAtDesc = (docs: QueryDocumentSnapshot<DocumentData>[]) =>
    [...docs].sort((a, b) => getCreatedAtMillis(b.data()?.createdAt) - getCreatedAtMillis(a.data()?.createdAt));

const buildClientsFromOrders = (
    docs: QueryDocumentSnapshot<DocumentData>[],
    maxClients?: number
): Client[] => {
    const clientsByCedula = new Map<string, Client>();
    const sortedDocs = sortByCreatedAtDesc(docs);

    sortedDocs.forEach((docSnap) => {
        const order = docSnap.data() as Record<string, any>;
        const cedula = normalizeCedula(order.cedula);
        const key = cedula || docSnap.id;

        const nextClient: Client = {
            id: key,
            clientName: getSafeString(order.clientName),
            cedula: cedula || getSafeString(order.cedula),
            email: getSafeString(order.email) || undefined,
            phone: getSafeString(order.phone) || undefined,
            bank: getSafeString(order.bank) || undefined,
            accountNumber: getSafeString(order.accountNumber) || undefined,
            accountType: getSafeString(order.accountType) || undefined,
            type: getSafeString(order.type) || undefined,
        };

        const existing = clientsByCedula.get(key);
        if (!existing) {
            clientsByCedula.set(key, nextClient);
            return;
        }

        // Data comes newest-first. Keep newest values and fill blanks from older records.
        clientsByCedula.set(key, {
            ...existing,
            clientName: existing.clientName || nextClient.clientName,
            cedula: existing.cedula || nextClient.cedula,
            email: existing.email || nextClient.email,
            phone: existing.phone || nextClient.phone,
            bank: existing.bank || nextClient.bank,
            accountNumber: existing.accountNumber || nextClient.accountNumber,
            accountType: existing.accountType || nextClient.accountType,
            type: existing.type || nextClient.type,
        });
    });

    const clients = Array.from(clientsByCedula.values()).filter((client) =>
        Boolean(client.clientName && client.cedula)
    );

    if (typeof maxClients === 'number') return clients.slice(0, maxClients);
    return clients;
};

/**
 * Busca un cliente para autocompletado sin afectar estado de UI.
 * - admin: intenta clients y completa con orders.
 * - seller/client: solo usa orders de su propio alcance.
 */
export const findClientSilently = async (
    cedula: string,
    context: FindClientContext = {}
): Promise<Client | null> => {
    try {
        const cleanCedula = normalizeCedula(cedula);
        if (!cleanCedula) return null;

        const scope = getRoleScope(context.role, context.userId);
        let rawClient: Record<string, any> | null = null;
        let rawClientId = cleanCedula;

        // Shared clients is admin-only according to Firestore rules.
        if (!scope) {
            try {
                const clientsQuery = query(collection(db, 'clients'), where('cedula', '==', cleanCedula), limit(1));
                const clientsSnapshot = await getDocs(clientsQuery);
                if (!clientsSnapshot.empty) {
                    rawClient = clientsSnapshot.docs[0].data() as Record<string, any>;
                    rawClientId = clientsSnapshot.docs[0].id;
                }
            } catch {
                rawClient = null;
            }
        }

        const requiresOrdersFallback =
            !rawClient ||
            !getSafeString(rawClient.clientName) ||
            !getSafeString(rawClient.email) ||
            !getSafeString(rawClient.phone) ||
            !getSafeString(rawClient.bank) ||
            !getSafeString(rawClient.accountNumber);

        let ordersFallback: Client | null = null;
        if (requiresOrdersFallback) {
            let orderDocs: QueryDocumentSnapshot<DocumentData>[] = [];
            try {
                const ordersQuery = scope
                    ? query(
                        collection(db, 'orders'),
                        where(scope.field, '==', scope.value),
                        where('cedula', '==', cleanCedula),
                        limit(60)
                    )
                    : query(collection(db, 'orders'), where('cedula', '==', cleanCedula), limit(60));
                const ordersSnapshot = await getDocs(ordersQuery);
                orderDocs = ordersSnapshot.docs;
            } catch {
                if (scope) {
                    // Fallback when a composite index is missing.
                    const scopedSnapshot = await getDocs(
                        query(collection(db, 'orders'), where(scope.field, '==', scope.value), limit(2000))
                    );
                    orderDocs = scopedSnapshot.docs.filter((docSnap) =>
                        normalizeCedula(docSnap.data()?.cedula) === cleanCedula
                    );
                }
            }

            const fromOrders = buildClientsFromOrders(orderDocs, 1);
            ordersFallback = fromOrders.length > 0 ? fromOrders[0] : null;
        }

        if (rawClient) {
            const merged: Client = {
                id: rawClientId || ordersFallback?.id || cleanCedula,
                clientName: getSafeString(rawClient.clientName) || ordersFallback?.clientName || '',
                cedula: getSafeString(rawClient.cedula) || cleanCedula,
                email: getSafeString(rawClient.email) || ordersFallback?.email,
                phone: getSafeString(rawClient.phone) || ordersFallback?.phone,
                bank: getSafeString(rawClient.bank) || ordersFallback?.bank,
                accountNumber: getSafeString(rawClient.accountNumber) || ordersFallback?.accountNumber,
                accountType: getSafeString(rawClient.accountType) || ordersFallback?.accountType,
            };
            return merged.clientName ? merged : null;
        }

        return ordersFallback?.clientName ? ordersFallback : null;
    } catch {
        return null;
    }
};

/**
 * Hook para listar y buscar clientes.
 * - admin: coleccion clients
 * - seller/client: cartera propia derivada de sus orders
 */
export function useClients() {
    const { user, role } = useAuth();
    const [state, setState] = useState<ClientsState>({
        clients: [],
        loading: false,
        error: null,
    });

    const canManageGlobalClients = role === 'admin';

    const loadRecent = useCallback(async (count = 1000) => {
        setState((prev) => ({ ...prev, loading: true, error: null }));
        try {
            let clients: Client[] = [];
            const scope = getRoleScope(role, user?.uid);

            if (canManageGlobalClients) {
                const q = query(collection(db, 'clients'), orderBy('createdAt', 'desc'), limit(count));
                const snapshot = await getDocs(q);
                clients = snapshot.docs.map((d) => ({
                    id: d.id,
                    ...d.data(),
                } as Client));
            } else if (scope) {
                const fetchLimit = Math.min(Math.max(count * 5, 300), 3000);
                const q = query(collection(db, 'orders'), where(scope.field, '==', scope.value), limit(fetchLimit));
                const snapshot = await getDocs(q);
                clients = buildClientsFromOrders(snapshot.docs, count);
            }

            setState({ clients, loading: false, error: null });
        } catch (err: any) {
            setState({ clients: [], loading: false, error: err.message });
        }
    }, [canManageGlobalClients, role, user?.uid]);

    const searchByCedula = useCallback(async (cedula: string) => {
        setState((prev) => ({ ...prev, loading: true, error: null }));
        try {
            const cleanCedula = normalizeCedula(cedula);
            if (!cleanCedula) {
                setState({ clients: [], loading: false, error: 'Ingresa una cedula valida' });
                return;
            }

            let clients: Client[] = [];
            const scope = getRoleScope(role, user?.uid);

            if (canManageGlobalClients) {
                const q = query(collection(db, 'clients'), where('cedula', '==', cleanCedula), limit(10));
                const snapshot = await getDocs(q);
                clients = snapshot.docs.map((d) => ({
                    id: d.id,
                    ...d.data(),
                } as Client));
            } else if (scope) {
                let docs: QueryDocumentSnapshot<DocumentData>[] = [];
                try {
                    const q = query(
                        collection(db, 'orders'),
                        where(scope.field, '==', scope.value),
                        where('cedula', '==', cleanCedula),
                        limit(60)
                    );
                    const snapshot = await getDocs(q);
                    docs = snapshot.docs;
                } catch {
                    const scopedSnapshot = await getDocs(
                        query(collection(db, 'orders'), where(scope.field, '==', scope.value), limit(3000))
                    );
                    docs = scopedSnapshot.docs.filter((docSnap) =>
                        normalizeCedula(docSnap.data()?.cedula) === cleanCedula
                    );
                }

                clients = buildClientsFromOrders(docs, 10).filter((client) =>
                    normalizeCedula(client.cedula) === cleanCedula
                );
            }

            setState({ clients, loading: false, error: null });
        } catch (err: any) {
            setState({ clients: [], loading: false, error: err.message });
        }
    }, [canManageGlobalClients, role, user?.uid]);

    const updateClient = useCallback(async (id: string, data: Partial<Client>) => {
        if (!canManageGlobalClients) {
            setState((prev) => ({ ...prev, error: 'Solo administradores pueden editar clientes globales.' }));
            return false;
        }
        try {
            const clientRef = doc(db, 'clients', id);
            await updateDoc(clientRef, data);
            setState((prev) => ({
                ...prev,
                clients: prev.clients.map((client) => (client.id === id ? { ...client, ...data } : client))
            }));
            return true;
        } catch (err: any) {
            console.error('Error updating client:', err);
            return false;
        }
    }, [canManageGlobalClients]);

    const deleteClient = useCallback(async (id: string) => {
        if (!canManageGlobalClients) {
            setState((prev) => ({ ...prev, error: 'Solo administradores pueden eliminar clientes globales.' }));
            return false;
        }
        try {
            const clientRef = doc(db, 'clients', id);
            await deleteDoc(clientRef);
            setState((prev) => ({
                ...prev,
                clients: prev.clients.filter((client) => client.id !== id)
            }));
            return true;
        } catch (err: any) {
            console.error('Error deleting client:', err);
            return false;
        }
    }, [canManageGlobalClients]);

    return {
        ...state,
        loadRecent,
        searchByCedula,
        updateClient,
        deleteClient,
        canManageGlobalClients,
    };
}
