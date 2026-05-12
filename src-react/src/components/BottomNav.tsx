import { useNavigation, type Screen } from '../contexts/NavigationContext';
import { useAuth } from '../hooks/useAuth';
import {
    LayoutDashboard, ClipboardList, Wallet, BarChart3, Settings, Users, DollarSign
} from 'lucide-react';

const ADMIN_TABS: { id: Screen; icon: typeof LayoutDashboard; label: string }[] = [
    { id: 'dashboard', icon: LayoutDashboard, label: 'Inicio' },
    { id: 'history', icon: ClipboardList, label: 'Historial' },
    { id: 'balance', icon: Wallet, label: 'Balance' },
    { id: 'reports', icon: BarChart3, label: 'Reportes' },
    { id: 'settings', icon: Settings, label: 'Config' },
];

const USER_TABS: { id: Screen; icon: typeof LayoutDashboard; label: string }[] = [
    { id: 'dashboard', icon: LayoutDashboard, label: 'Inicio' },
    { id: 'history', icon: ClipboardList, label: 'Historial' },
    { id: 'clients', icon: Users, label: 'Clientes' },
    { id: 'settings', icon: Settings, label: 'Config' },
];

const SELLER_TABS: { id: Screen; icon: typeof LayoutDashboard; label: string }[] = [
    { id: 'dashboard', icon: LayoutDashboard, label: 'Inicio' },
    { id: 'history', icon: ClipboardList, label: 'Historial' },
    { id: 'clients', icon: Users, label: 'Clientes' },
    { id: 'balance', icon: Wallet, label: 'Balance' },
    { id: 'commissions', icon: DollarSign, label: 'Comisiones' },
    { id: 'settings', icon: Settings, label: 'Config' },
];

export function BottomNav() {
    const { screen, navigate } = useNavigation();
    const { role } = useAuth();

    const visibleTabs =
        role === 'admin'
            ? ADMIN_TABS
            : role === 'seller'
                ? SELLER_TABS
                : USER_TABS;

    return (
        <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-gray-100 z-50 safe-area-bottom md:hidden">
            <div className="flex items-center justify-around px-2 py-1">
                {visibleTabs.map(tab => {
                    const Icon = tab.icon;
                    const isActive = screen === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => navigate(tab.id)}
                            className={`flex flex-col items-center gap-0.5 py-2 px-3 rounded-xl transition-all ${isActive
                                ? 'text-manzano-600'
                                : 'text-gray-400 hover:text-gray-600'
                                }`}
                        >
                            <div className={`relative ${isActive ? 'scale-110' : ''} transition-transform`}>
                                <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 1.8} />
                                {isActive && (
                                    <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-manzano-400" />
                                )}
                            </div>
                            <span className={`text-[10px] font-medium ${isActive ? 'font-bold' : ''}`}>
                                {tab.label}
                            </span>
                        </button>
                    );
                })}
            </div>
        </nav>
    );
}
