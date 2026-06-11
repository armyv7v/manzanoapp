import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';

export type Screen =
    | 'dashboard'
    | 'history'
    | 'clients'
    | 'balance'
    | 'wholesale-purchases'
    | 'calculator'
    | 'ves-balance'
    | 'settings'
    | 'commissions'
    | 'accounts'
    | 'reports'
    | 'bdv-monitor';

interface NavigationContextType {
    screen: Screen;
    params: any;
    navigate: (screen: Screen, params?: any) => void;
    goHome: () => void;
}

const NavigationContext = createContext<NavigationContextType | null>(null);

export function NavigationProvider({ children }: { children: ReactNode }) {
    const [screen, setScreen] = useState<Screen>(() => {
        if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            const initialScreen = params.get('screen') as Screen;
            const validOptions = ['dashboard', 'history', 'clients', 'balance', 'wholesale-purchases', 'calculator', 'ves-balance', 'settings', 'commissions', 'accounts', 'reports', 'bdv-monitor'];
            if (initialScreen && validOptions.includes(initialScreen)) {
                return initialScreen;
            }
        }
        return 'dashboard';
    });

    const [params, setParams] = useState<any>(() => {
        if (typeof window !== 'undefined') {
            const searchParams = new URLSearchParams(window.location.search);
            const orderId = searchParams.get('orderId');
            const purchaseId = searchParams.get('purchaseId');
            const result: Record<string, any> = {};
            if (orderId) result.orderId = orderId;
            if (purchaseId) result.purchaseId = purchaseId;
            return Object.keys(result).length > 0 ? result : null;
        }
        return null;
    });

    const navigate = useCallback((s: Screen, p?: any) => {
        setScreen(s);
        setParams(p || null);
    }, []);

    const goHome = useCallback(() => {
        setScreen('dashboard');
        setParams(null);
    }, []);

    useEffect(() => {
        const handleNavigate = (e: Event) => {
            const customEvent = e as CustomEvent;
            if (customEvent.detail && customEvent.detail.screen) {
                setScreen(customEvent.detail.screen as Screen);
                setParams(customEvent.detail.params || null);
            }
        };
        const handleSwMessage = (event: MessageEvent) => {
            if (event.data && event.data.type === 'manzano-navigate' && event.data.screen) {
                setScreen(event.data.screen as Screen);
                setParams(event.data.params || null);
            }
        };

        window.addEventListener('manzano-navigate', handleNavigate);
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.addEventListener('message', handleSwMessage);
        }

        return () => {
            window.removeEventListener('manzano-navigate', handleNavigate);
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.removeEventListener('message', handleSwMessage);
            }
        };
    }, []);

    return (
        <NavigationContext.Provider value={{ screen, params, navigate, goHome }}>
            {children}
        </NavigationContext.Provider>
    );
}

export function useNavigation() {
    const ctx = useContext(NavigationContext);
    if (!ctx) throw new Error('useNavigation must be inside NavigationProvider');
    return ctx;
}
