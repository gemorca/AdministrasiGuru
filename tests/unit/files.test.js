const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const AIFiles = require('../../js/ai/fileReader.js');

// ---- membuat DOCX/zip minimal di memori ----
function crc32(buf) { let c, crc = 0xffffffff; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; }
function makeZip(entries, { method = 8, flags = 0 } = {}) {
    const parts = [], central = []; let offset = 0;
    for (const [name, content] of entries) {
        const raw = Buffer.from(content); const data = method === 8 ? zlib.deflateRawSync(raw) : raw;
        const nb = Buffer.from(name);
        const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(flags, 6); lh.writeUInt16LE(method, 8);
        lh.writeUInt32LE(crc32(raw), 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(nb.length, 26);
        parts.push(lh, nb, data);
        const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(flags, 8); ch.writeUInt16LE(method, 10);
        ch.writeUInt32LE(crc32(raw), 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(nb.length, 28); ch.writeUInt32LE(offset, 42);
        central.push(ch, nb);
        offset += 30 + nb.length + data.length;
    }
    const cd = Buffer.concat(central);
    const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
    return Buffer.concat([...parts, cd, end]);
}
const W = body => `<?xml version="1.0"?><w:document xmlns:w="x"><w:body>${body}</w:body></w:document>`;
const P = t => `<w:p><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`;
const file = (buf, name) => new File([buf], name);

test('DOCX: teks paragraf, tabel, entitas XML, dan tab terbaca', async () => {
    const xml = W(P('Capaian Pembelajaran &amp; Tujuan') + P('Baris &lt;dua&gt; &#8220;kutip&#8221;') +
        '<w:tbl><w:tr><w:tc>' + P('No') + '</w:tc><w:tc>' + P('Indikator') + '</w:tc></w:tr><w:tr><w:tc>' + P('1') + '</w:tc><w:tc>' + P('Menganalisis zat') + '</w:tc></w:tr></w:tbl>');
    const r = await AIFiles.read(file(makeZip([['[Content_Types].xml', '<x/>'], ['word/document.xml', xml]]), 'kisi.docx'));
    assert.equal(r.kind, 'text');
    assert.match(r.text, /Capaian Pembelajaran & Tujuan/);
    assert.match(r.text, /Baris <dua> “kutip”/);
    assert.match(r.text, /No\s+Indikator/);
    assert.match(r.text, /1\s+Menganalisis zat/);
    assert.equal(r.truncated, false);
});

test('DOCX: tanpa kompresi (stored) juga terbaca', async () => {
    const r = await AIFiles.read(file(makeZip([['word/document.xml', W(P('Isi tersimpan'))]], { method: 0 }), 'a.docx'));
    assert.match(r.text, /Isi tersimpan/);
});

test('DOCX: bukan dokumen Word, terenkripsi, rusak, dan kosong ditolak dengan pesan jelas', async () => {
    await assert.rejects(AIFiles.read(file(makeZip([['lain.xml', '<a/>']]), 'x.docx')), e => e.code === 'BAD_FILE' && /dokumen Word/.test(e.message));
    await assert.rejects(AIFiles.read(file(makeZip([['word/document.xml', W(P('x'))]], { flags: 1 }), 'x.docx')), e => /terenkripsi/.test(e.message));
    await assert.rejects(AIFiles.read(file(Buffer.from('PK bukan zip beneran'), 'x.docx')), e => e.code === 'BAD_FILE');
    await assert.rejects(AIFiles.read(file(Buffer.from('teks biasa'), 'x.docx')), e => e.code === 'BAD_FILE');
    await assert.rejects(AIFiles.read(file(makeZip([['word/document.xml', W('')]]), 'x.docx')), e => e.code === 'EMPTY');
});

test('PDF: dilampirkan sebagai base64 utuh; berkas palsu ditolak', async () => {
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF');
    const r = await AIFiles.read(file(pdf, 'ref.pdf'));
    assert.equal(r.kind, 'pdf');
    assert.equal(r.inline.mimeType, 'application/pdf');
    assert.deepEqual(Buffer.from(r.inline.data, 'base64'), pdf);
    await assert.rejects(AIFiles.read(file(Buffer.from('ini teks'), 'palsu.pdf')), e => e.code === 'BAD_FILE' && /bukan PDF/.test(e.message));
});

test('TXT/MD/CSV: terbaca; biner dan kosong ditolak; teks panjang dipotong', async () => {
    assert.equal((await AIFiles.read(file(Buffer.from('Halo dunia é'), 'a.txt'))).text, 'Halo dunia é');
    assert.equal((await AIFiles.read(file(Buffer.from('# Judul'), 'a.md'))).text, '# Judul');
    await assert.rejects(AIFiles.read(file(Buffer.from([65, 0, 66]), 'a.txt')), e => e.code === 'BAD_FILE');
    await assert.rejects(AIFiles.read(file(Buffer.from('   \n '), 'a.txt')), e => e.code === 'EMPTY');
    await assert.rejects(AIFiles.read(file(Buffer.alloc(0), 'a.txt')), e => e.code === 'EMPTY');
    const big = await AIFiles.read(file(Buffer.from('x'.repeat(AIFiles.MAX_TEXT_CHARS + 500)), 'b.txt'));
    assert.equal(big.text.length, AIFiles.MAX_TEXT_CHARS); assert.equal(big.truncated, true);
});

test('batas ukuran 10 MB, .doc lama, dan format tak dikenal ditolak', async () => {
    await assert.rejects(AIFiles.read(file(Buffer.alloc(10 * 1024 * 1024 + 1, 65), 'a.txt')), e => e.code === 'TOO_BIG' && /10 MB/.test(e.message));
    await assert.rejects(AIFiles.read(file(Buffer.from('x'), 'lama.doc')), e => e.code === 'OLD_DOC' && /\.docx atau PDF/.test(e.message));
    await assert.rejects(AIFiles.read(file(Buffer.from('x'), 'gambar.png')), e => e.code === 'UNSUPPORTED');
    await assert.rejects(AIFiles.read(null), e => e.code === 'EMPTY');
});

test('zip bomb: isi hasil dekompresi di atas batas ditolak', async () => {
    const bomb = '<w:t>' + 'A'.repeat(21 * 1024 * 1024) + '</w:t>';
    await assert.rejects(AIFiles.read(file(makeZip([['word/document.xml', W(bomb)]]), 'bom.docx')), e => /terlalu besar/.test(e.message));
});
