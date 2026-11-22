/**
 * Pembaca dokumen referensi untuk AI (CP, modul ajar, kisi-kisi).
 *
 *   TXT / MD / CSV : dibaca sebagai teks.
 *   DOCX           : teks diekstrak di browser (zip + word/document.xml), tanpa pustaka luar.
 *   PDF            : dikirim apa adanya (base64) ke Gemini yang membaca PDF langsung.
 *   DOC (lama)     : DITOLAK. Format biner lama tidak dapat dibaca; minta simpan sebagai DOCX atau PDF.
 *
 * Hasil hanya disimpan di memori sesi (bukan localStorage). Pesan "berhasil" hanya muncul bila benar-benar terbaca.
 */
const AIFiles = (() => {
    const MAX_BYTES = 10 * 1024 * 1024;
    const MAX_TEXT_CHARS = 60000;
    const MAX_UNZIPPED = 20 * 1024 * 1024;

    class FileError extends Error {
        constructor(code, message) { super(message); this.name = 'FileError'; this.code = code; }
    }

    function ext(name) { const m = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/); return m ? m[1] : ''; }

    function toBase64(u8) {
        let s = '';
        for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
        return btoa(s);
    }

    async function inflateRaw(u8) {
        const ds = new DecompressionStream('deflate-raw');
        const stream = new Blob([u8]).stream().pipeThrough(ds);
        const reader = stream.getReader();
        const chunks = []; let total = 0;
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            total += value.length;
            if (total > MAX_UNZIPPED) { reader.cancel(); throw new FileError('BAD_FILE', 'Isi dokumen terlalu besar setelah dibuka.'); }
            chunks.push(value);
        }
        const out = new Uint8Array(total); let o = 0;
        for (const c of chunks) { out.set(c, o); o += c.length; }
        return out;
    }

    async function unzipEntry(buf, wanted) {
        const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
        let eocd = -1;
        for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
            if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
        }
        if (eocd < 0) throw new FileError('BAD_FILE', 'File DOCX rusak atau bukan DOCX.');
        const count = dv.getUint16(eocd + 10, true);
        let p = dv.getUint32(eocd + 16, true);
        const dec = new TextDecoder();
        for (let n = 0; n < count; n++) {
            if (dv.getUint32(p, true) !== 0x02014b50) break;
            const flags = dv.getUint16(p + 8, true);
            const method = dv.getUint16(p + 10, true);
            const csize = dv.getUint32(p + 20, true);
            const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
            const lho = dv.getUint32(p + 42, true);
            const name = dec.decode(buf.subarray(p + 46, p + 46 + nlen));
            if (name === wanted) {
                if (flags & 1) throw new FileError('BAD_FILE', 'DOCX terenkripsi/berkata sandi tidak dapat dibaca.');
                if (dv.getUint32(lho, true) !== 0x04034b50) throw new FileError('BAD_FILE', 'File DOCX rusak.');
                const lnlen = dv.getUint16(lho + 26, true), lxlen = dv.getUint16(lho + 28, true);
                const start = lho + 30 + lnlen + lxlen;
                const data = buf.subarray(start, start + csize);
                if (method === 0) return data;
                if (method === 8) return inflateRaw(data);
                throw new FileError('BAD_FILE', 'Metode kompresi DOCX tidak didukung.');
            }
            p += 46 + nlen + xlen + clen;
        }
        return null;
    }

    function xmlToText(xml) {
        const t = xml
            .replace(/<w:tab\s*\/>/g, '\t')
            .replace(/<w:br\s*\/>/g, '\n')
            .replace(/<\/w:p>/g, '\n')
            .replace(/<\/w:tc>/g, '\t')
            .replace(/<\/w:tr>/g, '\n')
            .replace(/<[^>]+>/g, '')
            .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
            .replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(parseInt(d, 10)))
            .replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCodePoint(parseInt(h, 16)))
            .replace(/&amp;/g, '&');
        return t.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    }

    function clip(text) {
        if (text.length <= MAX_TEXT_CHARS) return { text, truncated: false };
        return { text: text.slice(0, MAX_TEXT_CHARS), truncated: true };
    }

    /**
     * @returns { name, kind: 'text'|'pdf', size, text?, inline?:{mimeType,data}, truncated }
     * @throws FileError(code: TOO_BIG | EMPTY | OLD_DOC | UNSUPPORTED | BAD_FILE)
     */
    async function read(file) {
        if (!file) throw new FileError('EMPTY', 'Tidak ada file dipilih.');
        const e = ext(file.name);
        if (file.size === 0) throw new FileError('EMPTY', 'File kosong.');
        if (file.size > MAX_BYTES) throw new FileError('TOO_BIG', `Ukuran file ${(file.size / 1048576).toFixed(1)} MB melebihi batas ${MAX_BYTES / 1048576} MB.`);
        if (e === 'doc') throw new FileError('OLD_DOC', 'Format .doc lama tidak dapat dibaca. Simpan ulang sebagai .docx atau PDF.');
        const buf = new Uint8Array(await file.arrayBuffer());

        if (e === 'pdf') {
            const magic = String.fromCharCode(...buf.subarray(0, 5));
            if (magic !== '%PDF-') throw new FileError('BAD_FILE', 'File ini bukan PDF yang valid.');
            return { name: file.name, kind: 'pdf', size: file.size, inline: { mimeType: 'application/pdf', data: toBase64(buf) }, truncated: false };
        }
        if (e === 'docx') {
            if (buf[0] !== 0x50 || buf[1] !== 0x4b) throw new FileError('BAD_FILE', 'File ini bukan DOCX yang valid.');
            const raw = await unzipEntry(buf, 'word/document.xml');
            if (!raw) throw new FileError('BAD_FILE', 'File ini bukan dokumen Word (word/document.xml tidak ada).');
            const text = xmlToText(new TextDecoder().decode(raw));
            if (!text) throw new FileError('EMPTY', 'Tidak ada teks yang dapat dibaca di dokumen ini.');
            return { name: file.name, kind: 'text', size: file.size, ...clip(text) };
        }
        if (['txt', 'md', 'csv'].includes(e)) {
            if (buf.includes(0)) throw new FileError('BAD_FILE', 'File ini berisi data biner, bukan teks.');
            const text = new TextDecoder('utf-8').decode(buf).trim();
            if (!text) throw new FileError('EMPTY', 'File teks kosong.');
            return { name: file.name, kind: 'text', size: file.size, ...clip(text) };
        }
        throw new FileError('UNSUPPORTED', 'Format file tidak didukung. Gunakan PDF, DOCX, atau TXT.');
    }

    return { read, FileError, MAX_BYTES, MAX_TEXT_CHARS, xmlToText, ext };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = AIFiles;
