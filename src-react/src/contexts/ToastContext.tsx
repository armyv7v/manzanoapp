import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
    id: string;
    message: string;
    type: ToastType;
}

interface ToastContextType {
    toast: (message: string, type?: ToastType) => void;
    success: (message: string) => void;
    error: (message: string) => void;
    warning: (message: string) => void;
    info: (message: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const removeToast = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    const addToast = useCallback((message: string, type: ToastType = 'info') => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => removeToast(id), 3500);
    }, [removeToast]);

    const ctx: ToastContextType = {
        toast: addToast,
        success: useCallback((msg: string) => addToast(msg, 'success'), [addToast]),
        error: useCallback((msg: string) => addToast(msg, 'error'), [addToast]),
        warning: useCallback((msg: string) => addToast(msg, 'warning'), [addToast]),
        info: useCallback((msg: string) => addToast(msg, 'info'), [addToast]),
    };

    const iconMap = {
        success: CheckCircle,
        error: XCircle,
        warning: AlertTriangle,
        info: Info,
    };

    const colorMap = {
        success: 'bg-emerald-600 border-emerald-500',
        error: 'bg-red-600 border-red-500',
        warning: 'bg-amber-600 border-amber-500',
        info: 'bg-blue-600 border-blue-500',
    };

    return (
        <ToastContext.Provider value={ctx}>
            {children}

            {/* Toast Container */}
            <div className="fixed top-4 right-4 z-[100] space-y-2 pointer-events-none">
                {toasts.map(t => {
                    const Icon = iconMap[t.type];
                    return (
                        <div
                            key={t.id}
                            className={`pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-xl border text-white shadow-2xl animate-slide-in min-w-[260px] max-w-[360px] ${colorMap[t.type]}`}
                        >
                            <Icon className="w-4 h-4 shrink-0" />
                            <p className="text-sm font-medium flex-1">{t.message}</p>
                            <button onClick={() => removeToast(t.id)} className="text-white/60 hover:text-white transition-colors shrink-0 text-xs">
                                ✕
                            </button>
                        </div>
                    );
                })}
            </div>
        </ToastContext.Provider>
    );
}

export function useToast() {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error('useToast must be inside ToastProvider');
    return ctx;
}
