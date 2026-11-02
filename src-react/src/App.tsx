import { lazy, Suspense, useEffect } from 'react';
import { useAuth, useNotifications } from './hooks';
import { AuthProvider } from './contexts/AuthContext';
import { NavigationProvider, useNavigation } from './contexts/NavigationContext';
import { ToastProvider } from './contexts/ToastContext';
import { RatesProvider } from './contexts/RatesContext';
import { AccountsProvider } from './contexts/AccountsContext';
import { StaffUsersProvider } from './contexts/StaffUsersContext';
import { LoginScreen } from './screens/LoginScreen';
import { DashboardScreen } from './screens/DashboardScreen';
import { AgentIntentApprovalModal } from './screens/AgentIntentApprovalModal';
import { BottomNav } from './components/BottomNav';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Apple } from 'lucide-react';

// Pantallas secundarias con carga diferida: el chunk inicial solo lleva el
// Dashboard; el resto baja al navegar. El vendor split ya saca firebase/react.
const HistoryScreen = lazy(() => import('./screens/HistoryScreen').then(m => ({ default: m.HistoryScreen })));
const ClientsScreen = lazy(() => import('./screens/ClientsScreen').then(m => ({ default: m.ClientsScreen })));
const BalanceScreen = lazy(() => import('./screens/BalanceScreen').then(m => ({ default: m.BalanceScreen })));
const FxCalculatorScreen = lazy(() => import('./screens/FxCalculatorScreen').then(m => ({ default: m.FxCalculatorScreen })));
const WholesalePurchasesScreen = lazy(() => import('./screens/WholesalePurchasesScreen').then(m => ({ default: m.WholesalePurchasesScreen })));
const VesBalanceScreen = lazy(() => import('./screens/VesBalanceScreen').then(m => ({ default: m.VesBalanceScreen })));
const SettingsScreen = lazy(() => import('./screens/SettingsScreen').then(m => ({ default: m.SettingsScreen })));
const CommissionsScreen = lazy(() => import('./screens/CommissionsScreen').then(m => ({ default: m.CommissionsScreen })));
const AccountsScreen = lazy(() => import('./screens/AccountsScreen').then(m => ({ default: m.AccountsScreen })));
const ReportsScreen = lazy(() => import('./screens/ReportsScreen').then(m => ({ default: m.ReportsScreen })));
const BdvMonitorScreen = lazy(() => import('./screens/BdvMonitorScreen').then(m => ({ default: m.BdvMonitorScreen })));

function ScreenFallback() {
    return (
        <div className="flex items-center justify-center py-24">
            <p className="text-gray-400 text-sm animate-pulse">Cargando...</p>
        </div>
    );
}

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
            <div className="pb-16 md:pb-0 safe-area-top">
                <Suspense fallback={<ScreenFallback />}>
                    {SCREENS[screen] || <DashboardScreen />}
                </Suspense>
            </div>
            <BottomNav />
            <AgentIntentApprovalModal />
        </>
    );
}

function App() {
    return (
        <ErrorBoundary>
            <AuthProvider>
                <NavigationProvider>
                    <ToastProvider>
                        <RatesProvider>
                            <AccountsProvider>
                                <StaffUsersProvider>
                                    <AppRouter />
                                </StaffUsersProvider>
                            </AccountsProvider>
                        </RatesProvider>
                    </ToastProvider>
                </NavigationProvider>
            </AuthProvider>
        </ErrorBoundary>
    );
}

export default App;
