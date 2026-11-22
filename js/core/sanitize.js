/**
 * Escape teks sebelum disisipkan ke HTML (innerHTML, document.write, dokumen cetak/Word).
 * Dipakai pada setiap data buatan pengguna atau hasil AI.
 * Untuk teks murni (innerText / textContent / input.value) JANGAN dipakai: tidak perlu.
 */
function esc(v) {
    if (v === null || v === undefined) return '';
    return String(v).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

/**
 * Bersihkan HTML yang berasal dari penyimpanan/backup sebelum ditampilkan lagi
 * (mis. modul ajar tersimpan). Membuang script, iframe, atribut on*, dan URL javascript:.
 */
function sanitizeHtml(html) {
    const doc = new DOMParser().parseFromString('<body>' + String(html || '') + '</body>', 'text/html');
    doc.querySelectorAll('script,iframe,object,embed,link,meta,base,form').forEach(n => n.remove());
    doc.body.querySelectorAll('*').forEach(el => {
        for (const a of Array.from(el.attributes)) {
            const n = a.name.toLowerCase();
            const v = a.value.replace(/\s+/g, '').toLowerCase();
            if (n.startsWith('on') || (['href', 'src', 'xlink:href', 'action', 'formaction'].includes(n) && /^(javascript|vbscript|data:text\/html)/.test(v))) {
                el.removeAttribute(a.name);
            }
        }
    });
    return doc.body.innerHTML;
}
