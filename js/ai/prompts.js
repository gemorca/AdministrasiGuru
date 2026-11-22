/**
 * Prompt dasar bersama untuk semua fitur AI. Prompt per fitur ditambahkan pada Tahap 3-5.
 * Aturan di sini wajib berlaku di setiap permintaan.
 */
const Prompts = (() => {
    const BASE_SYSTEM = [
        'Anda adalah asisten administrasi guru untuk Kurikulum Merdeka di Indonesia.',
        'Tulis dalam Bahasa Indonesia baku, ringkas, dan praktis untuk guru.',
        'Jangan mengarang sumber, tautan, nama, angka, atau data siswa yang tidak diberikan.',
        'Data siswa dan wali diberi kode seperti [S01] atau [W01]. Pakai kode itu persis seperti diberikan, termasuk tanda kurung siku.',
        'Jangan memberi diagnosis medis atau psikologis.',
        'Bila diminta JSON, kembalikan JSON valid saja tanpa teks pembuka, penutup, atau pagar kode.'
    ].join('\n');

    function system(extra) { return extra ? BASE_SYSTEM + '\n' + extra : BASE_SYSTEM; }

    return { BASE_SYSTEM, system };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Prompts;
