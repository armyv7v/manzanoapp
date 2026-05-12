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
    navigate: (screen: Screen) => void;
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

    const navigate = useCallback((s: Screen) => setScreen(s), []);
    const goHome = useCallback(() => setScreen('dashboard'), []);

    useEffect(() => {
        const handleNavigate = (e: Event) => {
            const customEvent = e as CustomEvent;
            if (customEvent.detail && customEvent.detail.screen) {
                setScreen(customEvent.detail.screen as Screen);
            }
        };
        const handleSwMessage = (event: MessageEvent) => {
            if (event.data && event.data.type === 'manzano-navigate' && event.data.screen) {
                setScreen(event.data.screen as Screen);
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
        <NavigationContext.Provider value={{ screen, navigate, goHome }}>
            {children}
        </NavigationContext.Provider>
    );
}

export function useNavigation() {
    const ctx = useContext(NavigationContext);
    if (!ctx) throw new Error('useNavigation must be inside NavigationProvider');
    return ctx;
}
