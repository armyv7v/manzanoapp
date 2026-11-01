import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { VesAccount } from '../hooks/useVesAccounts';

interface AccountsState {
    accounts: VesAccount[];
    holders: Record<string, VesAccount[]>;
    totalBalance: number;
    loading: boolean;
}

const AccountsContext = createContext<AccountsState | null>(null);

/**
 * Único listener de la colección `accounts` para toda la app: antes Dashboard,
 * OrderDetailModal y BatchPaymentModal (siempre montados) abrían tres
 * onSnapshot sobre la misma colección.
 */
export function AccountsProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<AccountsState>({ accounts: [], holders: {}, totalBalance: 0, loading: true });

    useEffect(() => {
        const unsubscribe = onSnapshot(collection(db, 'accounts'), (snapshot) => {
            const data: VesAccount[] = snapshot.docs.map(doc => ({
                id: doc.id,
                holder: doc.data().holder || '',
                bank: doc.data().bank || '',
                balance: doc.data().balance || 0,
                accountType: doc.data().accountType || 'payout',
                alias: doc.data().alias || '',
                documentId: doc.data().documentId || '',
                accountNumber: doc.data().accountNumber || '',
                accountLast4: doc.data().accountLast4 || '',
            }));
            data.sort((a, b) => b.balance - a.balance);
            const holders = data.reduce<Record<string, VesAccount[]>>((acc, item) => {
                if (!acc[item.holder]) acc[item.holder] = [];
                acc[item.holder].push(item);
                return acc;
            }, {});
            setState({
                accounts: data,
                holders,
                totalBalance: data.reduce((sum, acc) => sum + acc.balance, 0),
                loading: false,
            });
        }, () => {
            setState(prev => ({ ...prev, loading: false }));
        });

        return () => unsubscribe();
    }, []);

    return (
        <AccountsContext.Provider value={state}>
            {children}
        </AccountsContext.Provider>
    );
}

export function useAccountsContext(): AccountsState {
    const ctx = useContext(AccountsContext);
    if (!ctx) throw new Error('useAccountsContext debe usarse dentro de AccountsProvider');
    return ctx;
}
