import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    message: string;
}

/**
 * Red de seguridad global: un crash de render en cualquier pantalla muestra
 * esta pantalla en vez de la app en blanco, con opcion de recargar.
 */
export class ErrorBoundary extends Component<Props, State> {
    state: State = { hasError: false, message: '' };

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, message: error?.message || 'Error desconocido' };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error('[ErrorBoundary]', error, info.componentStack);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-charcoal-900 flex items-center justify-center px-4">
                    <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 text-center space-y-3">
                        <p className="text-3xl">⚠️</p>
                        <h1 className="text-lg font-bold text-gray-800">Algo salió mal</h1>
                        <p className="text-xs text-gray-500 break-words">{this.state.message}</p>
                        <button
                            onClick={() => window.location.reload()}
                            className="w-full bg-manzano-600 hover:bg-manzano-700 text-white font-bold py-2.5 rounded-xl transition-colors"
                        >
                            Recargar app
                        </button>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}
