/**
 * Overrides de tag por email, cargados desde la colección `users`.
 *
 * El tipo de comisión de venta (CLP vs VES) se decide en resolveUserTag
 * (constants.ts) a partir del email del vendedor. Con este mapa, alimentado
 * por el snapshot app-wide de `users`, dar de alta un vendedor con tag nuevo
 * ya no exige editar USER_TAGS y desplegar: basta el campo `tag` de su doc.
 * El mapa hardcodeado queda como fallback.
 */
const overrides = new Map<string, string>();

export function setUserTagOverrides(entries: { email: string; tag: string }[]): void {
    overrides.clear();
    for (const { email, tag } of entries) {
        const cleanEmail = String(email || '').trim().toLowerCase();
        const cleanTag = String(tag || '').trim();
        if (cleanEmail && cleanTag) overrides.set(cleanEmail, cleanTag);
    }
}

export function lookupTagOverride(email: string): string | undefined {
    return overrides.get(String(email || '').trim().toLowerCase());
}
