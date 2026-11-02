/**
 * Comprime una imagen de comprobante antes de subirla a Storage: las fotos
 * de cámara vienen de 3-8 MB y con red móvil venezolana eso es el punto de
 * falla #1 del pago. Reduce al lado mayor `maxDim` px y recodifica JPEG al
 * `quality` indicado. Nunca agranda: si el resultado pesa igual o más, o si
 * algo falla (WebView sin createImageBitmap, imagen corrupta), devuelve el
 * archivo original.
 */
export async function compressImage(
    file: File,
    maxDim = 1600,
    quality = 0.8
): Promise<File> {
    if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') return file;
    if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
    try {
        const bitmap = await createImageBitmap(file);
        const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
        // Chica y liviana: no tiene sentido recodificarla.
        if (scale >= 1 && file.size <= 1.5 * 1024 * 1024) return file;

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) return file;
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close?.();

        const blob = await new Promise<Blob | null>(resolve =>
            canvas.toBlob(resolve, 'image/jpeg', quality)
        );
        if (!blob || blob.size >= file.size) return file;

        const baseName = file.name.replace(/\.[^.]+$/, '') || 'comprobante';
        return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' });
    } catch {
        return file;
    }
}

/** Peso legible para feedback en la UI (KB/MB). */
export const formatFileSize = (bytes: number): string =>
    bytes >= 1024 * 1024
        ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
        : `${Math.max(1, Math.round(bytes / 1024))} KB`;
