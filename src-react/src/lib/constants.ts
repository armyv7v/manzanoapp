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
 * Calcula la comisión por transferencia interbancaria.
 * < 700 VES → 2 VES fijo; ≥ 700 VES → 0.3% del monto.
 */
export const computeInterbankFee = (amount: number): number => {
    if (typeof amount !== 'number' || amount <= 0) return 0;
    const fee = amount < 700 ? 2 : amount * 0.003;
    return Math.ceil(fee * 100) / 100; // Round up to 2 decimals
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
