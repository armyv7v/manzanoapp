import { useAccountsContext } from '../contexts/AccountsContext';

export interface VesAccount {
    id: string;
    holder: string;
    bank: string;
    balance: number;
    accountType?: 'source' | 'payout';
    alias?: string;
    documentId?: string;
    accountNumber?: string;
    accountLast4?: string;
}

export function isSourceAccount(account: VesAccount) {
    return account.accountType === 'source';
}

export function isPayoutAccount(account: VesAccount) {
    return account.accountType !== 'source';
}

/**
 * Saldo en vivo de la colección 'accounts' vía AccountsContext:
 * un solo onSnapshot compartido por toda la app.
 */
export function useVesAccounts() {
    return useAccountsContext();
}
