export const ADMIN_BASE_COMMISSION_RATE = 0.01;
export const TILLO_COMMISSION_RATE = 0.0015;
export const TOTAL_ADMIN_COMMISSION_RATE = ADMIN_BASE_COMMISSION_RATE + TILLO_COMMISSION_RATE;

export const CLIENTS_PER_PAGE = 20;
export const CLIENTS_PER_PAGE_BATCH = 30;
export const LETTER_NAV_KEYS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '#'];

export const CURRENCY_FLAGS = {
    VES: '🇻🇪',
    COP: '🇨🇴',
    PEN: '🇵🇪',
    ARS: '🇦🇷',
    USD: '🇺🇸',
    EUR: '🇪🇺'
};

export const USER_TAGS = {
    // Administradores
    'enderjpinar@gmail.com': 'A1',
    'namv2210@gmail.com': 'A2',
    'emmaquintero511@gmail.com': 'A3',
    'yvettepierina@gmail.com': 'A4',
    'loistoda@gmail.com': 'A5',
    // Vendedores
    'stalinread117@gmail.com': 'V1',
    'beaguiar2405@gmail.com': 'V2',
    'myanirethsg@gmail.com': 'V3'
};

export const VENEZUELAN_BANKS = [
    "100% Banco", "Activo", "Agrícola de Venezuela", "Bancamiga", "Bancaribe", "Bancrecer", "Banesco", "Bangente", "Banplus", "BFC (Banco Fondo Común)", "Banco Digital de Los Trabajadores", "BNC (Banco Nacional de Crédito)", "Caroní", "DelSur", "Exterior", "Internacional de Desarrollo", "Mercantil", "Mi Banco", "N58 Banco Digital", "Plaza", "Provincial", "Sofitasa", "Tesoro", "Venezolano de Crédito", "Venezuela", "BANFANB"
].sort();

export const VENEZUELAN_BANK_PREFIXES = {
    '0102': 'Venezuela',
    '0104': 'Venezolano de Crédito',
    '0105': 'Mercantil',
    '0108': 'Provincial',
    '0114': 'Bancaribe',
    '0115': 'Exterior',
    '0116': 'BNC (Banco Nacional de Crédito)', // BOD is now BNC
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
    '0169': 'Mi Banco',
    '0171': 'Activo',
    '0172': 'Bancamiga',
    '0174': 'Banplus',
    '0175': 'Banco Digital de Los Trabajadores',
    '0177': 'BANFANB',
    '0178': 'N58 Banco Digital',
    '0191': 'BNC (Banco Nacional de Crédito)'
};
