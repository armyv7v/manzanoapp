export function roundUpToTwoDecimals(num) {
    if (typeof num !== 'number' || isNaN(num)) return 0;
    return Math.round(num * 100) / 100;
}

export function formatCurrency(value, locale = 'es-CL', options = {}) {
    const rounded = roundUpToTwoDecimals(value);
    return rounded.toLocaleString(locale, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
        ...options
    });
}

export function normalizeForAccountId(str) {
    if (typeof str !== 'string') return '';
    return str.trim().toUpperCase()
        .replace(/\s+/g, '_')
        .replace(/[^A-Z0-9_]/g, '');
}

export function generateAccountId(holder, bank) {
    return `${normalizeForAccountId(holder)}_${normalizeForAccountId(bank)}`;
}

/**
 * Returns the uppercase initial for letter navigation; non A-Z characters map to '#'. 
 * @param {string} name The client name.
 * @returns {string}
 */
export function getClientInitial(name = '') {
    const trimmed = (name || '').trim();
    if (!trimmed) return '#';
    const firstChar = trimmed.charAt(0).toUpperCase();
    return /^[A-Z]$/.test(firstChar) ? firstChar : '#';
}

/** Helper to check if running on native platform (Capacitor) */
export const isNativePlatform = () => {
    return typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform && Capacitor.isNativePlatform();
};

export const chileTimeZone = 'America/Santiago';

/**
 * Formats a Date object into a string using the Chilean timezone.
 * @param {Date} date The date to format.
 * @param {object} options Intl.DateTimeFormat options.
 * @returns {string} The formatted date string.
 */
export const formatInChileanTime = (date, options) => {
    if (!date) return 'N/A';
    return date.toLocaleString('es-CL', { timeZone: chileTimeZone, ...options });
};

/**
 * Formats a Date object into a 2-line HTML string (Date <br> Time) for tables.
 * @param {Date} date - The date object.
 * @returns {string} HTML string.
 */
export const formatDateForTable = (date) => {
    if (!date) return 'N/A';
    const dateObj = date instanceof Date ? date : new Date(date);
    const dateStr = dateObj.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: chileTimeZone });
    const timeStr = dateObj.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: chileTimeZone });
    return `<span>${dateStr}</span><br><span class="text-xs text-gray-400">${timeStr}</span>`;
};

/**
 * Gets a Date object representing a specific date in Chile, adjusted for UTC to be used in date pickers.
 * This avoids timezone issues where "today" might be "yesterday" or "tomorrow" for the user.
 * @param {Date} date The date to convert.
 * @returns {Date} A Date object set to midnight UTC for the given date in Chile.
 */
export const getChileanDateForPicker = (date) => {
    // Get the date string (YYYY-MM-DD) for the given date in Chile's timezone.
    const dateStringInChile = date.toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
    // Creating a new Date from 'YYYY-MM-DD' string gives a Date object at UTC midnight for that day.
    return new Date(dateStringInChile);
};
