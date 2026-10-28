/**
 * Mapa de tags de usuario
 */
export const USER_TAGS: Record<string, string> = {
    'enderjpinar@gmail.com': 'A1',
    'namv2210@gmail.com': 'A2',
    'emmaquintero511@gmail.com': 'A3',
    'yvettepierina@gmail.com': 'A4',
    'loistoda@gmail.com': 'A5',
    'stalinread117@gmail.com': 'V1',
    'beaguiar2405@gmail.com': 'V2',
    'myanirethsg@gmail.com': 'V3',
};

export const SUPER_ADMIN_EMAIL = 'enderjpinar@gmail.com';

export const isSuperAdminEmail = (raw: string | null | undefined): boolean =>
    (raw || '').trim().toLowerCase() === SUPER_ADMIN_EMAIL;

export const resolveUserTag = (raw: string): string => {
    const normalized = (raw || '').trim();
    if (!normalized) return '';

    const mapped = USER_TAGS[normalized.toLowerCase()];
    if (mapped) return mapped;

    const asTag = normalized.toUpperCase();
    return /^[AV]\d+$/.test(asTag) ? asTag : '';
};

export const isVTaggedUser = (raw: string): boolean => resolveUserTag(raw).startsWith('V');
export const isATaggedUser = (raw: string): boolean => resolveUserTag(raw).startsWith('A');
export const CHILE_TIMEZONE = 'America/Santiago';
export const ORDER_BALANCE_RESTRICTION_HOUR = 17;

export const getNowInChile = (now: Date = new Date()): Date =>
    new Date(now.toLocaleString('en-US', { timeZone: CHILE_TIMEZONE }));

export const isOrderBalanceRestrictionActive = (now: Date = new Date()): boolean =>
    getNowInChile(now).getHours() >= ORDER_BALANCE_RESTRICTION_HOUR;

export const shouldRestrictOrdersByVesBalance = (
    role?: string | null,
    now: Date = new Date()
): boolean => (role === 'seller' || role === 'client') && isOrderBalanceRestrictionActive(now);

/**
 * Prefijos de cuentas bancarias venezolanas → nombre del banco
 */
export const VENEZUELAN_BANK_PREFIXES: Record<string, string> = {
    '0102': 'Venezuela',
    '0104': 'Venezolano de Crédito',
    '0105': 'Mercantil',
    '0108': 'Provincial',
    '0114': 'Bancaribe',
    '0115': 'Exterior',
    '0116': 'BNC (Banco Nacional de Crédito)',
    '0128': 'Caroní',
    '0134': 'Banesco',
    '0137': 'Sofitasa',
    '0138': 'Plaza',
    '0146': 'Bangente',
    '0151': 'BFC (Banco Fondo Común)',
    '0156': '100% Banco',
    '0157': 'DelSur',
    '0163': 'Tesoro',
    '0166': 'Agrícola de Venezuela',
    '0168': 'Bancrecer',
    '0169': 'R4 Banco Microfinanciero',
    '0171': 'Activo',
    '0172': 'Bancamiga',
    '0174': 'Banplus',
    '0175': 'Banco Digital de Los Trabajadores',
    '0177': 'BANFANB',
    '0178': 'N58 Banco Digital',
    '0191': 'BNC (Banco Nacional de Crédito)',
};

/** Normaliza el nombre del banco para comparación */
export const normalizeBankName = (value: string): string =>
    (typeof value === 'string' ? value.trim().toLowerCase() : '');

/**
 * Tasas de comisión aplicadas al procesar un pedido.
 */
export const ADMIN_COMMISSION_RATE = 0.01;    // 1%
export const TILLO_COMMISSION_RATE = 0.0015;  // 0.15%

/**
 * Calcula el monto total proyectado de un pedido incluyendo las comisiones admin y Tillo.
 * Usa Math.ceil con precisión de 2 decimales para cada comisión.
 */
export const computeOrderTotalWithCommissions = (destinationAmount: number): {
    adminCommission: number;
    tilloCommission: number;
    totalConComisiones: number;
} => {
    const adminCommission  = Math.ceil(destinationAmount * ADMIN_COMMISSION_RATE  * 100) / 100;
    const tilloCommission  = Math.ceil(destinationAmount * TILLO_COMMISSION_RATE  * 100) / 100;
    const totalConComisiones = destinationAmount + adminCommission + tilloCommission;
    return { adminCommission, tilloCommission, totalConComisiones };
};

/**
 * Calcula la comisión por transferencia interbancaria / pago móvil P2P.
 * < 4600 VES → 14 VES fijo (mínimo de comisión); ≥ 4600 VES → 0.30% del monto (mínimo 14 VES).
 */
export const computeInterbankFee = (amount: number): number => {
    // NaN pasa el check `amount <= 0` (evalua false), por eso se excluye explicito.
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) return 0;
    const fee = amount < 4600 ? 14 : Math.max(14, amount * 0.003);
    return Math.ceil(fee * 100) / 100; // Round up to 2 decimals
};

/** Tags de vendedor que cobran comisión de venta en VES sobre el monto destino. */
const VES_SELLER_TAGS = new Set(['A3', 'A4', 'A5']);

/**
 * Comisión de venta VES de un pedido pendiente (aún no viene en el doc):
 * ceil a 2 decimales sobre destinationAmount, solo para tags A3-A5.
 * Debe coincidir exactamente con lo que persisten markAsPaid y el pago en lote.
 */
export const computeSellerCommissionVES = (order: {
    destinationAmount?: number;
    sellerCommissionRate?: number | string;
    commissionRate?: number | string;
    sellerEmail?: string;
    createdByTag?: string;
}): number => {
    const sellerTag = resolveUserTag(String(order.sellerEmail || order.createdByTag || ''));
    if (!VES_SELLER_TAGS.has(sellerTag)) return 0;
    const rawRate = Number(order.sellerCommissionRate ?? order.commissionRate ?? 0);
    const rate = Number.isFinite(rawRate) ? rawRate : 0;
    const base = Number(order.destinationAmount || 0);
    if (rate <= 0 || base <= 0) return 0;
    return Math.ceil(base * rate * 100) / 100;
};

/**
 * Comisión bancaria de pagar `order` desde una cuenta del banco `sourceBank`:
 * pago-movil siempre paga; transferencia paga solo si el banco origen difiere.
 */
export const computeOrderBankFee = (
    order: { destinationAmount?: number; type?: string; bank?: string },
    sourceBank: string
): number => {
    const base = Number(order.destinationAmount || 0);
    if (order.type === 'pago-movil') return computeInterbankFee(base);
    if (order.type === 'transferencia' && normalizeBankName(sourceBank) !== normalizeBankName(order.bank || '')) {
        return computeInterbankFee(base);
    }
    return 0;
};

/**
 * Débito total real de pagar un pedido pendiente desde una cuenta VES:
 * monto destino + comisión bancaria + admin + Tillo + comisión de venta VES.
 * El campo totalDebitVes persistido omite la comisión de venta: este es el
 * valor que la UI debe mostrar y con el que debe filtrar cuentas disponibles.
 */
export const computeOrderTotalRequired = (
    order: { destinationAmount?: number; type?: string; bank?: string; sellerEmail?: string; createdByTag?: string; sellerCommissionRate?: number | string; commissionRate?: number | string },
    sourceBank: string
): number => {
    const base = Number(order.destinationAmount || 0);
    const { adminCommission, tilloCommission } = computeOrderTotalWithCommissions(base);
    return base + computeOrderBankFee(order, sourceBank) + adminCommission + tilloCommission + computeSellerCommissionVES(order);
};

/** Detecta el banco por los primeros 4 dígitos del número de cuenta */
export const detectBankByPrefix = (accountNumber: string): string | null => {
    const digits = accountNumber.replace(/[^0-9]/g, '');
    if (digits.length >= 4) {
        const prefix = digits.substring(0, 4);
        return VENEZUELAN_BANK_PREFIXES[prefix] || null;
    }
    return null;
};
