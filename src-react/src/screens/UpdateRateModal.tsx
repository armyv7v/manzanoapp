import { useState } from 'react';
import { Modal, Button } from '../components/ui';
import { useUpdateRate } from '../hooks/useUpdateRate';
import { useExchangeRates } from '../hooks/useExchangeRates';
import { useToast } from '../contexts/ToastContext';

type RatePair = 'CLP_VES' | 'CLP_COP' | 'CLP_PEN';

const PAIRS: { value: RatePair; label: string; flag: string; currency: string }[] = [
    { value: 'CLP_VES', label: 'CLP / VES', flag: '🇻🇪', currency: 'VES' },
    { value: 'CLP_COP', label: 'CLP / COP', flag: '🇨🇴', currency: 'COP' },
    { value: 'CLP_PEN', label: 'CLP / PEN', flag: '🇵🇪', currency: 'PEN' },
];

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

export function UpdateRateModal({ isOpen, onClose }: Props) {
    const { updateRate, loading, error, success, reset } = useUpdateRate();
    const { rates } = useExchangeRates();
    const toast = useToast();
    const [pair, setPair] = useState<RatePair>('CLP_VES');
    const [value, setValue] = useState('');

    const currentRate = pair === 'CLP_VES' ? rates.VES : pair === 'CLP_COP' ? rates.COP : rates.PEN;
    const selectedPair = PAIRS.find(p => p.value === pair)!;

    const handleSubmit = async () => {
        try {
            await updateRate(pair, parseFloat(value));
            toast.success(`Tasa ${selectedPair.label} actualizada a ${value}`);
            setTimeout(() => { reset(); setValue(''); onClose(); }, 1000);
        } catch {
            toast.error('Error al actualizar la tasa');
        }
    };

    const handleClose = () => {
        setValue('');
        reset();
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={handleClose} title="Actualizar Tasa de Cambio">
            <div className="space-y-4">
                {/* Par selector */}
                <div>
                    <label className="exchange-label">Par de Intercambio</label>
                    <select
                        value={pair}
                        onChange={e => { setPair(e.target.value as RatePair); setValue(''); reset(); }}
                        className="exchange-input"
                    >
                        {PAIRS.map(p => (
                            <option key={p.value} value={p.value}>{p.flag} {p.label}</option>
                        ))}
                    </select>
                </div>

                {/* Current rate */}
                <div className="bg-gray-50 rounded-lg p-3 flex justify-between items-center">
                    <span className="text-xs text-gray-500">Tasa actual</span>
                    <span className="font-bold text-gray-800">
                        {currentRate > 0
                            ? `${currentRate.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 5 })} ${selectedPair.currency}`
                            : '—'}
                    </span>
                </div>

                {/* New rate input */}
                <div>
                    <label className="exchange-label">Nueva Tasa</label>
                    <div className="relative">
                        <input
                            type="number"
                            value={value}
                            onChange={e => setValue(e.target.value)}
                            step="0.00001"
                            min="0"
                            placeholder="0.00000"
                            className="exchange-input !pr-14 font-mono text-lg"
                            required
                        />
                        <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 font-bold text-xs">
                            {selectedPair.currency}
                        </span>
                    </div>
                </div>

                {/* Error / Success */}
                {error && (
                    <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-red-600 text-xs">{error}</div>
                )}
                {success && (
                    <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-green-600 text-xs">
                        ✅ ¡Tasa actualizada correctamente!
                    </div>
                )}

                {/* Buttons */}
                <div className="flex gap-3 pt-2">
                    <Button variant="danger" fullWidth onClick={handleClose} disabled={loading}>
                        Cancelar
                    </Button>
                    <Button variant="primary" fullWidth onClick={handleSubmit} isLoading={loading}>
                        Guardar Tasa
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
