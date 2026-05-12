import { useEffect, useRef } from 'react';
import { useExchangeRates } from '../hooks/useExchangeRates';
import { useStoreToggle } from '../hooks/useStoreToggle';
import {
    Plus, ArrowLeftRight, ClipboardList, Users,
    Wallet, Landmark, Settings, LogOut, Apple, X, DollarSign,
    Building2, BarChart3, Calculator, ShoppingCart, ShieldCheck
} from 'lucide-react';

type UserRole = 'admin' | 'seller' | 'client' | null;

interface SidebarProps {
    isOpen: boolean;
    onClose: () => void;
    onNavigate: (screen: string) => void;
    onLogout: () => void;
    role: UserRole;
    userEmail?: string;
}

const MENU_ITEMS: Array<{
    id: string;
    icon: typeof Plus;
    label: string;
    color: string;
    bg: string;
    roles: Array<Exclude<UserRole, null>>;
}> = [
        { id: 'new-order', icon: Plus, label: 'Nuevo Pedido', color: 'text-manzano-500', bg: 'bg-manzano-50', roles: ['admin', 'seller', 'client'] },
        { id: 'update-rate', icon: ArrowLeftRight, label: 'Actualizar Tasas', color: 'text-blue-500', bg: 'bg-blue-50', roles: ['admin'] },
        { id: 'history', icon: ClipboardList, label: 'Historial', color: 'text-purple-500', bg: 'bg-purple-50', roles: ['admin', 'seller', 'client'] },
        { id: 'clients', icon: Users, label: 'Clientes', color: 'text-cyan-500', bg: 'bg-cyan-50', roles: ['admin', 'seller', 'client'] },
        { id: 'balance', icon: Wallet, label: 'Balance CLP', color: 'text-green-500', bg: 'bg-green-50', roles: ['admin', 'seller'] },
        { id: 'calculator', icon: Calculator, label: 'Calculadora FX', color: 'text-violet-500', bg: 'bg-violet-50', roles: ['admin', 'seller'] },
        { id: 'wholesale-purchases', icon: ShoppingCart, label: 'Compras Mayorista', color: 'text-fuchsia-500', bg: 'bg-fuchsia-50', roles: ['admin'] },
        { id: 'ves-balance', icon: Landmark, label: 'Balance VES', color: 'text-red-500', bg: 'bg-red-50', roles: ['admin'] },
        { id: 'commissions', icon: DollarSign, label: 'Comisiones', color: 'text-emerald-500', bg: 'bg-emerald-50', roles: ['admin', 'seller'] },
        { id: 'accounts', icon: Building2, label: 'Cuentas VES', color: 'text-rose-500', bg: 'bg-rose-50', roles: ['admin'] },
        { id: 'bdv-monitor', icon: ShieldCheck, label: 'Monitor BDV', color: 'text-sky-500', bg: 'bg-sky-50', roles: ['admin'] },
        { id: 'reports', icon: BarChart3, label: 'Reportes', color: 'text-indigo-500', bg: 'bg-indigo-50', roles: ['admin'] },
        { id: 'settings', icon: Settings, label: 'Configuración', color: 'text-gray-500', bg: 'bg-gray-50', roles: ['admin', 'seller', 'client'] },
    ];

export function Sidebar({ isOpen, onClose, onNavigate, onLogout, role, userEmail }: SidebarProps) {
    const sidebarRef = useRef<HTMLDivElement>(null);
    const { rates } = useExchangeRates();
    const { toggleStore, loading: toggling } = useStoreToggle();
    const visibleItems = MENU_ITEMS
        .filter((item) => role && item.roles.includes(role))
        .sort((a, b) => {
            if (a.id === 'new-order' && b.id !== 'new-order') return -1;
            if (b.id === 'new-order' && a.id !== 'new-order') return 1;
            if (a.id === 'settings' && b.id !== 'settings') return 1;
            if (b.id === 'settings' && a.id !== 'settings') return -1;
            return a.label.localeCompare(b.label, 'es', { sensitivity: 'base' });
        });

    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (sidebarRef.current && !sidebarRef.current.contains(e.target as Node)) onClose();
        };
        if (isOpen) document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [isOpen, onClose]);

    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        if (isOpen) document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, [isOpen, onClose]);

    const handleToggleStore = async () => {
        try { await toggleStore(!rates.isTakingOrders); } catch { /* logged */ }
    };

    return (
        <>
            <div className={`fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} />
            <div
                ref={sidebarRef}
                className={`fixed top-0 left-0 h-full w-72 bg-white shadow-2xl z-[70] transform transition-transform duration-300 ease-out flex flex-col ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
            >
                {/* Header */}
                <div className="p-5 border-b border-gray-100">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 bg-gradient-to-br from-manzano-400 to-manzano-600 rounded-xl flex items-center justify-center shadow-sm">
                                <Apple className="w-4.5 h-4.5 text-white" />
                            </div>
                            <div>
                                <h2 className="text-sm font-bold text-gray-800">Manzano App</h2>
                                <p className="text-[11px] text-gray-400">{role === 'admin' ? 'Panel Admin' : 'Panel Usuario'}</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 hover:bg-gray-200 hover:text-gray-600 transition-all">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    {userEmail && (
                        <div className="bg-gray-50 rounded-lg px-3 py-2">
                            <p className="text-[11px] text-gray-400">Sesion activa</p>
                            <p className="text-xs font-semibold text-gray-600 truncate">{userEmail}</p>
                        </div>
                    )}
                </div>

                {/* Store Toggle */}
                {role === 'admin' && (
                    <div className="px-5 py-4 border-b border-gray-100">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-bold text-gray-700">Estado de la Tienda</p>
                                <p className={`text-[11px] font-semibold flex items-center gap-1.5 mt-0.5 ${rates.isTakingOrders ? 'text-green-500' : 'text-red-500'}`}>
                                    <span className={`w-2 h-2 rounded-full ${rates.isTakingOrders ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
                                    {rates.isTakingOrders ? 'Abierta' : 'Cerrada'}
                                </p>
                            </div>
                            <button
                                onClick={handleToggleStore}
                                disabled={toggling}
                                className={`relative w-12 h-7 rounded-full transition-colors duration-300 ${rates.isTakingOrders ? 'bg-green-500' : 'bg-gray-300'} ${toggling ? 'opacity-50' : ''}`}
                            >
                                <span className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow-md transform transition-transform duration-300 ${rates.isTakingOrders ? 'translate-x-5' : 'translate-x-0.5'}`} />
                            </button>
                        </div>
                    </div>
                )}

                {/* Menu Items */}
                <nav className="p-3 space-y-0.5 flex-1 overflow-y-auto">
                    {visibleItems.map(item => {
                        const Icon = item.icon;
                        return (
                            <button
                                key={item.id}
                                onClick={() => { onNavigate(item.id); onClose(); }}
                                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-gray-50 active:bg-gray-100 transition-all group"
                            >
                                <div className={`w-8 h-8 ${item.bg} rounded-lg flex items-center justify-center group-hover:scale-105 transition-transform`}>
                                    <Icon className={`w-4 h-4 ${item.color}`} />
                                </div>
                                <span className="text-[13px] font-semibold text-gray-700">{item.label}</span>
                            </button>
                        );
                    })}
                </nav>

                {/* Footer */}
                <div className="p-4 border-t border-gray-100">
                    <button
                        onClick={() => { onLogout(); onClose(); }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-red-50 transition-all group"
                    >
                        <div className="w-8 h-8 bg-red-50 rounded-lg flex items-center justify-center group-hover:scale-105 transition-transform">
                            <LogOut className="w-4 h-4 text-red-500" />
                        </div>
                        <span className="text-[13px] font-semibold text-red-500">Cerrar Sesion</span>
                    </button>
                </div>
            </div>
        </>
    );
}
