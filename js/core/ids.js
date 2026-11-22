/**
 * Pembuat ID unik.
 * Format: PREFIX-<uuid v4>. Prefix dipertahankan agar mudah dibaca saat debugging
 * dan kompatibel dengan data lama yang memakai format PREFIX-<angka>.
 * ID lama TIDAK diubah oleh migrasi.
 */
function genId(prefix) {
    let u;
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        u = crypto.randomUUID();
    } else {
        const b = new Uint8Array(16);
        crypto.getRandomValues(b);
        b[6] = (b[6] & 0x0f) | 0x40;
        b[8] = (b[8] & 0x3f) | 0x80;
        const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
        u = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
    }
    return prefix ? `${prefix}-${u}` : u;
}
