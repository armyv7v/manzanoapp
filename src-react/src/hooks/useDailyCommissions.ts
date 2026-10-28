import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface SellerCommissionSummary {
    email: string;
    totalCLP: number;
    orderCount: number;
}

export interface DailyCommissionsData {
    adminCommission: number;
    tilloCommission: number;
    bankFees: number;
    sellerCommissions: SellerCommissionSummary[];
    loading: boolean;
}

export function useDailyCommissions(selectedDateStr?: string | null) {
    const [data, setData] = useState<DailyCommissionsData>({
        adminCommission: 0,
        tilloCommission: 0,
        bankFees: 0,
        sellerCommissions: [],
        loading: true,
    });

    useEffect(() => {
        setData(prev => ({ ...prev, loading: true }));
        // Robust Chile Timezone calculation for the selected date
        const baseDate = selectedDateStr ? new Date(selectedDateStr + 'T12:00:00') : new Date();
        const nowInChile = new Date(baseDate.toLocaleString('en-US', { timeZone: 'America/Santiago' }));
        const startOfDay = new Date(new Date(nowInChile).setHours(0, 0, 0, 0));
        const endOfDay = new Date(new Date(nowInChile).setHours(23, 59, 59, 999));

        let currentAdmin = 0;
        let currentTillo = 0;
        let currentBank = 0;
        let currentSellers: SellerCommissionSummary[] = [];

        const updateState = () => {
            setData({
                adminCommission: currentAdmin,
                tilloCommission: currentTillo,
                bankFees: currentBank,
                sellerCommissions: currentSellers,
                loading: false,
            });
        };

        // 1-3. Comisiones admin/tillo/bancarias: UN listener por rango con
        // agrupación client-side por type (antes eran 3 listeners idénticos,
        // 3 snapshots iniciales por visita a la pantalla). Un `type in` + rango
        // exigiría un índice compuesto nuevo; el rango simple no.
        const qFees = query(
            collection(db, 'balance_history'),
            where('timestamp', '>=', startOfDay),
            where('timestamp', '<=', endOfDay)
        );
        const unsubFees = onSnapshot(qFees, (snapshot) => {
            let admin = 0;
            let tillo = 0;
            let bank = 0;
            snapshot.forEach(docSnap => {
                const d = docSnap.data();
                const amount = Number(d.amount || 0);
                if (d.type === 'admin_commission') admin += amount;
                else if (d.type === 'tillo_commission') tillo += amount;
                else if (d.type === 'fee') bank += amount;
            });
            currentAdmin = Math.ceil(admin * 100) / 100;
            currentTillo = Math.ceil(tillo * 100) / 100;
            currentBank = Math.ceil(bank * 100) / 100;
            updateState();
        }, () => updateState());

        // 4. Seller Commissions
        const qSellers = query(
            collection(db, 'seller_commissions'),
            where('timestamp', '>=', startOfDay),
            where('timestamp', '<=', endOfDay)
        );
        const unsubSellers = onSnapshot(qSellers, (snapshot) => {
            const map: Record<string, { total: number; count: number }> = {};
            snapshot.forEach(doc => {
                const s = doc.data();
                const email = s.sellerEmail || 'Desconocido';
                if (!map[email]) map[email] = { total: 0, count: 0 };
                map[email].total += s.commissionAmountCLP || 0;
                map[email].count++;
            });

            currentSellers = Object.entries(map).map(([email, d]) => ({
                email,
                totalCLP: d.total,
                orderCount: d.count
            })).sort((a, b) => b.totalCLP - a.totalCLP);
            updateState();
        }, () => updateState());

        return () => {
            unsubFees();
            unsubSellers();
        };
    }, [selectedDateStr]);

    return data;
}
