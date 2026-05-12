import { useState } from 'react';
import { doc, updateDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

type RatePair = 'CLP_VES' | 'CLP_COP' | 'CLP_PEN';

interface UpdateRateState {
    loading: boolean;
    error: string | null;
    success: boolean;
}

/**
 * Hook para actualizar tasas de cambio en Firestore config/rate.
 * Replica la lógica de app.js líneas 6858-6900.
 */
export function useUpdateRate() {
    const [state, setState] = useState<UpdateRateState>({
        loading: false,
        error: null,
        success: false,
    });

    const updateRate = async (pair: RatePair, newValue: number) => {
        setState({ loading: true, error: null, success: false });

        try {
            if (isNaN(newValue) || newValue <= 0) throw new Error('Ingresa una tasa válida mayor a cero.');

            const rateRef = doc(db, 'config', 'rate');
            const updateData: Record<string, any> = {};
            updateData[`values.${pair}`] = newValue;

            // Backward compatibility: also update legacy 'value' field for CLP_VES
            if (pair === 'CLP_VES') {
                updateData['value'] = newValue;
            }

            try {
                await updateDoc(rateRef, updateData);
            } catch (err: any) {
                // If document doesn't exist, create it with merge
                if (err.code === 'not-found' || err.message?.includes('No document to update')) {
                    await setDoc(rateRef, { values: { [pair]: newValue }, value: newValue }, { merge: true });
                } else {
                    throw err;
                }
            }

            setState({ loading: false, error: null, success: true });
            return true;
        } catch (err: any) {
            setState({ loading: false, error: err.message || 'Error al actualizar', success: false });
            throw new Error(err.message);
        }
    };

    const reset = () => setState({ loading: false, error: null, success: false });

    return { ...state, updateRate, reset };
}
