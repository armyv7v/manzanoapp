function roundUpToTwoDecimals(num) {
    if (typeof num !== 'number' || isNaN(num)) return 0;
    return Math.round(num * 100) / 100;
}

function formatCurrency(value, locale = 'es-CL', options = {}) {
    const rounded = roundUpToTwoDecimals(value);
    return rounded.toLocaleString(locale, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
        ...options
    });
}

function normalizeForAccountId(str) {
    if (typeof str !== 'string') return '';
    return str.trim().toUpperCase()
        .replace(/\s+/g, '_')
        .replace(/[^A-Z0-9_]/g, '');
}

function generateAccountId(holder, bank) {
    return `${normalizeForAccountId(holder)}_${normalizeForAccountId(bank)}`;
}
