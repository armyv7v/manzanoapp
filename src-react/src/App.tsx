import { useEffect } from 'react';
import { useAuth, useNotifications } from './hooks';
import { AuthProvider } from './contexts/AuthContext';
import { NavigationProvider, useNavigation } from './contexts/NavigationContext';
import { ToastProvider } from './contexts/ToastContext';
import { LoginScreen } from './screens/LoginScreen';
import { DashboardScreen } from './screens/DashboardScreen';
import { HistoryScreen } from './screens/HistoryScreen';
import { ClientsScreen } from './screens/ClientsScreen';
import { BalanceScreen } from './screens/BalanceScreen';
import { FxCalculatorScreen } from './screens/FxCalculatorScreen';
import { WholesalePurchasesScreen } from './screens/WholesalePurchasesScreen';
import { VesBalanceScreen } from './screens/VesBalanceScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { CommissionsScreen } from './screens/CommissionsScreen';
import { AccountsScreen } from './screens/AccountsScreen';
import { ReportsScreen } from './screens/ReportsScreen';
import { BdvMonitorScreen } from './screens/BdvMonitorScreen';
import { BottomNav } from './components/BottomNav';
import { Apple } from 'lucide-react';

function AppRouter() {
    const { user, role, loading } = useAuth();
    const { screen, navigate } = useNavigation();

    // Iniciar notificaciones
    useNotifications();

    // Redirección forzosa si intenta entrar a donde no debe
    useEffect(() => {
        if (!loading && user) {
            const blockedByRole: Record<string, string[]> = {
                admin: [],
                seller: ['reports', 'ves-balance', 'accounts', 'wholesale-purchases', 'bdv-monitor'],
                client: ['reports', 'ves-balance', 'accounts', 'commissions', 'calculator', 'wholesale-purchases', 'bdv-monitor', 'balance'],
            };

            const roleKey = role || 'client';
            const blockedScreens = blockedByRole[roleKey] || blockedByRole.client;
            if (blockedScreens.includes(screen)) navigate('dashboard');
        }
    }, [screen, role, loading, user, navigate]);

    if (loading) {
        return (
            <div className="relative min-h-screen overflow-hidden bg-charcoal-900 flex items-center justify-center px-4">
                <div className="pointer-events-none absolute inset-0 manzano-loader-noise" />
                <div className="pointer-events-none absolute inset-0 manzano-loader-vignette" />
                <div className="pointer-events-none absolute -top-20 -left-20 w-72 h-72 rounded-full bg-manzano-500/10 blur-3xl" />
                <div className="pointer-events-none absolute -bottom-20 -right-20 w-72 h-72 rounded-full bg-blue-500/10 blur-3xl" />

                <div className="relative flex flex-col items-center">
                    <div className="manzano-screensaver-stage">
                        <div className="manzano-screensaver-track" />
                        {[5, 4, 3, 2, 1].map((step) => (
                            <div
                                key={step}
                                className="manzano-apple-motion"
                                style={{
                                    animationDelay: `${-step * 0.14}s`,
                                    opacity: 0.06 + (6 - step) * 0.09,
                                }}
                            >
                                <div className="manzano-apple-dot">
                                    <Apple className="w-6 h-6 text-white/95" />
                                </div>
                            </div>
                        ))}

                        <div className="manzano-apple-motion">
                            <div className="manzano-apple-dot manzano-apple-dot-main">
                                <Apple className="w-7 h-7 text-white" />
                            </div>
                        </div>
                    </div>

                    <p className="mt-5 text-[12px] tracking-[0.18em] uppercase text-white/75">
                        Iniciando Manzano
                    </p>
                </div>
            </div>
        );
    }

    if (!user) return <LoginScreen />;

    const SCREENS: Record<string, React.ReactNode> = {
        dashboard: <DashboardScreen />,
        history: <HistoryScreen />,
        clients: <ClientsScreen />,
        balance: <BalanceScreen />,
        'wholesale-purchases': <WholesalePurchasesScreen />,
        calculator: <FxCalculatorScreen />,
        'ves-balance': <VesBalanceScreen />,
        settings: <SettingsScreen />,
        commissions: <CommissionsScreen />,
        accounts: <AccountsScreen />,
        reports: <ReportsScreen />,
        'bdv-monitor': <BdvMonitorScreen />,
    };

    return (
        <>
            <div className="pb-16 md:pb-0">
                {SCREENS[screen] || <DashboardScreen />}
            </div>
            <BottomNav />
        </>
    );
}

function App() {
    return (
        <AuthProvider>
            <NavigationProvider>
                <ToastProvider>
                    <AppRouter />
                </ToastProvider>
            </NavigationProvider>
        </AuthProvider>
    );
}

export default App;
