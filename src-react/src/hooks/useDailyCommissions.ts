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

        // 1. Admin Commission
        const qAdmin = query(
            collection(db, 'balance_history'),
            where('type', '==', 'admin_commission'),
            where('timestamp', '>=', startOfDay),
            where('timestamp', '<=', endOfDay)
        );
        const unsubAdmin = onSnapshot(qAdmin, (snapshot) => {
            let total = 0;
            snapshot.forEach(doc => total += doc.data().amount || 0);
            currentAdmin = Math.ceil(total * 100) / 100;
            updateState();
        }, () => updateState());

        // 2. Tillo Commission
        const qTillo = query(
            collection(db, 'balance_history'),
            where('type', '==', 'tillo_commission'),
            where('timestamp', '>=', startOfDay),
            where('timestamp', '<=', endOfDay)
        );
        const unsubTillo = onSnapshot(qTillo, (snapshot) => {
            let total = 0;
            snapshot.forEach(doc => total += doc.data().amount || 0);
            currentTillo = Math.ceil(total * 100) / 100;
            updateState();
        }, () => updateState());

        // 3. Bank Fees
        const qBank = query(
            collection(db, 'balance_history'),
            where('type', '==', 'fee'),
            where('timestamp', '>=', startOfDay),
            where('timestamp', '<=', endOfDay)
        );
        const unsubBank = onSnapshot(qBank, (snapshot) => {
            let total = 0;
            snapshot.forEach(doc => total += doc.data().amount || 0);
            currentBank = Math.ceil(total * 100) / 100;
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
            unsubAdmin();
            unsubTillo();
            unsubBank();
            unsubSellers();
        };
    }, [selectedDateStr]);

    return data;
}
