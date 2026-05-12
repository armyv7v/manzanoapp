import React, { useEffect } from 'react';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    children: React.ReactNode;
    closeOnOverlayClick?: boolean;
    maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
}

const maxWClass = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    full: 'max-w-full m-4',
};

export function Modal({
    isOpen,
    onClose,
    title,
    children,
    closeOnOverlayClick = true,
    maxWidth = 'md'
}: ModalProps) {

    // Evitar scroll en el body cuando el modal está abierto (Fix para móviles iOS/Android)
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [isOpen]);

    // Manejar tecla ESC para cerrar
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (closeOnOverlayClick && e.target === e.currentTarget) {
            onClose();
        }
    };

    return (
        <div
            className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm sm:p-4 transition-opacity"
            onClick={handleOverlayClick}
            aria-modal="true"
            role="dialog"
            aria-labelledby={title ? "modal-title" : undefined}
        >
            <div className={`
          bg-white shadow-2xl w-full flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-200
          rounded-t-2xl sm:rounded-xl max-h-[90vh] sm:max-h-[85vh]
          ${maxWClass[maxWidth]}
        `}
            >
                {/* Mango deslizable en móvil */}
                <div className="w-full flex justify-center pt-3 pb-1 sm:hidden" onClick={onClose}>
                    <div className="w-12 h-1.5 bg-gray-300 rounded-full"></div>
                </div>

                {/* Cabecera */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    {title ? (
                        <h2 id="modal-title" className="text-lg font-bold text-gray-800">{title}</h2>
                    ) : <div />}
                    <button
                        onClick={onClose}
                        className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full focus:outline-none transition-colors"
                        aria-label="Cerrar modal"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Contenido scrolleable */}
                <div className="p-6 overflow-y-auto">
                    {children}
                </div>
            </div>
        </div>
    );
}
