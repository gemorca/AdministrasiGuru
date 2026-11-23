/**
 * Antarmuka pengaturan AI + penjaga kesiapan fitur AI.
 * Rahasia (API key / token proxy) tidak pernah ditampilkan kembali di layar, log, backup, atau URL.
 */
const AIUI = (() => {
    // Diaktifkan di Tahap 3, setelah fitur AI benar-benar tersambung ke Gemini.
    const HIDE_WHEN_OFF = false;
    const MODEL_RE = /^gemini-[a-z0-9][a-z0-9.\-]{0,60}$/;
    const $ = id => document.getElementById(id);

    function cfg() { return settings.ai; }

    function msg(text, kind) {
        const el = $('aiStatusMsg');
        if (!el) return;
        el.innerText = text;
        el.className = 'text-xs rounded-xl p-3 border ' + (kind === 'ok'
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
            : kind === 'err' ? 'bg-red-50 text-red-700 border-red-200'
            : 'bg-slate-50 text-slate-600 border-slate-200');
        el.classList.remove('hidden');
    }

    function onModeChange() {
        const direct = $('setAiMode').value === 'direct';
        $('aiProxyRow').classList.toggle('hidden', direct);
        $('aiSecretLabel').innerText = direct ? 'API key Gemini (disimpan di browser ini)' : 'Token aplikasi (APP_TOKEN di Apps Script)';
        $('aiDirectWarn').classList.toggle('hidden', !direct);
    }

    function refreshUsage() {
        const el = $('aiUsageInfo');
        if (!el) return;
        const u = AIService.usageToday();
        el.innerText = `Hari ini: ${u.requests} permintaan, sekitar ${u.tokens.toLocaleString('id-ID')} token (perkiraan lokal di perangkat ini, bukan angka resmi Google).`;
    }

    function render() {
        if (!$('setAiMode')) return;
        const c = cfg();
        $('setAiEnabled').checked = !!c.enabled;
        $('setAiMode').value = c.mode === 'direct' ? 'direct' : 'proxy';
        $('setAiProxyUrl').value = c.proxyUrl || '';
        $('setAiModel').value = c.model || AIService.DEFAULT_MODEL;
        $('setAiAllowNames').checked = !!c.allowNames;
        $('setAiFallback').value = c.fallbackModel || '';
        $('setAiPrivacy').checked = !!c.privacyAckAt;
        const s = $('setAiSecret');
        s.value = '';
        s.placeholder = Store.secretGet() ? '•••••••• tersimpan (kosongkan bila tidak diganti)' : 'Belum diisi';
        onModeChange();
        refreshUsage();
        applyVisibility();
        const st = AIService.status();
        if (st.ready && c.lastTestOk) msg('Terhubung. Uji koneksi terakhir berhasil: ' + new Date(c.lastTestOk).toLocaleString('id-ID') + '.', 'ok');
        else if (st.ready) msg('Pengaturan sudah lengkap, tetapi koneksi BELUM diuji. Tekan "Uji Koneksi" untuk memastikan benar-benar tersambung.', 'info');
        else msg(st.enabled ? 'Fitur AI aktif tetapi pengaturan belum lengkap atau privasi belum disetujui.' : 'Fitur AI sedang dimatikan.', 'info');
    }

    function save() {
        const c = cfg();
        const mode = $('setAiMode').value === 'direct' ? 'direct' : 'proxy';
        const proxyUrl = $('setAiProxyUrl').value.trim();
        const model = $('setAiModel').value.trim();
        const secretIn = $('setAiSecret').value.trim();
        const enabled = $('setAiEnabled').checked;
        const privacy = $('setAiPrivacy').checked;

        const errs = [];
        const fallback = $('setAiFallback').value.trim();
        if (!MODEL_RE.test(model)) errs.push('Nama model tidak valid (contoh: gemini-3.6-flash).');
        if (fallback && !MODEL_RE.test(fallback)) errs.push('Nama model cadangan tidak valid (contoh: gemini-3.6-flash).');
        if (mode === 'proxy') {
            let ok = false;
            try { const u = new URL(proxyUrl); ok = u.protocol === 'https:'; } catch (_) {}
            if (!ok && (enabled || proxyUrl)) errs.push('URL Web App harus diawali https:// (salin dari hasil Deploy Apps Script, berakhiran /exec).');
        }
        if (/\s/.test(secretIn)) errs.push('Kunci/token tidak boleh mengandung spasi.');
        if (enabled && !secretIn && !Store.secretGet()) errs.push(mode === 'proxy' ? 'Isi token aplikasi.' : 'Isi API key Gemini.');
        if (enabled && !privacy && !c.privacyAckAt) errs.push('Centang persetujuan pemberitahuan privasi untuk mengaktifkan AI.');
        if (errs.length) { msg(errs.join(' '), 'err'); return false; }

        if (secretIn) Store.secretSet(secretIn);
        if (mode !== c.mode || proxyUrl !== c.proxyUrl || model !== c.model || fallback !== (c.fallbackModel || '') || secretIn) { c.styleResolved = null; c.lastTestOk = null; }
        c.enabled = enabled; c.mode = mode; c.proxyUrl = proxyUrl; c.model = model; c.fallbackModel = fallback;
        c.allowNames = $('setAiAllowNames').checked;
        if (privacy && !c.privacyAckAt) c.privacyAckAt = new Date().toISOString();
        if (!privacy) c.privacyAckAt = null;
        saveAllData();
        render();
        msg('Pengaturan AI disimpan. Tekan "Uji Koneksi" untuk memastikan semuanya benar.', 'ok');
        return true;
    }

    let testing = false;
    async function test() {
        if (testing) return;
        const st = AIService.status();
        if (!st.enabled || !st.configured || !st.privacyAck) {
            msg('Simpan pengaturan dulu dengan AI diaktifkan, terisi lengkap, dan privasi disetujui.', 'err');
            return;
        }
        testing = true;
        const btn = $('aiTestBtn'); if (btn) { btn.disabled = true; btn.innerText = 'Menguji...'; }
        let stage = '';
        const stageText = s => s === 'proxy' ? 'Tahap 1 dari 2: menghubungi proxy Apps Script (maks 20 detik)...' : 'Tahap 2 dari 2: menghubungi Gemini (maks 60 detik, mohon tunggu)...';
        msg(st.mode === 'proxy' ? stageText('proxy') : stageText('gemini'), 'info');
        try {
            const r = await AIService.ping(undefined, s => { stage = s; msg(stageText(s), 'info'); });
            cfg().lastTestOk = new Date().toISOString();
            saveAllData();
            msg(`Koneksi berhasil.${r.proxyMs !== null ? ` Proxy ${r.proxyMs} ms.` : ''} Model ${r.model}${r.fallback ? ' (MODEL CADANGAN, model utama sedang bermasalah)' : ''}, format keluaran terstruktur "${r.style}", Gemini menjawab dalam ${r.ms} ms.`, 'ok');
        } catch (e) {
            const where = (e.stage === 'gemini' || stage === 'gemini') && st.mode === 'proxy' ? ' (tahap 2: Gemini)' : (stage === 'proxy' ? ' (tahap 1: proxy)' : '');
            msg(`Gagal [${e.code || 'ERROR'}]${where}: ${e.message}`, 'err');
        } finally {
            testing = false;
            if (btn) { btn.disabled = false; btn.innerText = 'Uji Koneksi'; }
            refreshUsage();
        }
    }

    function clearSecret() {
        Store.secretClear();
        cfg().enabled = false;
        saveAllData();
        render();
        msg('Kunci/token dihapus dari browser ini dan fitur AI dimatikan.', 'ok');
    }

    /** Dipanggil setiap fitur AI sebelum mengirim permintaan. true = boleh lanjut. */
    function ensureReady() {
        const s = AIService.status();
        if (!s.enabled || !s.configured) {
            showModal('AI Belum Siap', 'Fitur AI belum diaktifkan atau belum dikonfigurasi. Buka menu Pengaturan > AI (Google Gemini).', '⚙️');
            return false;
        }
        if (!s.privacyAck) {
            $('modalAiPrivacy').classList.remove('hidden');
            return false;
        }
        return true;
    }

    function acceptPrivacy() {
        cfg().privacyAckAt = new Date().toISOString();
        saveAllData();
        $('modalAiPrivacy').classList.add('hidden');
        showModal('Terima Kasih', 'Persetujuan tercatat. Silakan ulangi perintah AI Anda.', '✅');
    }

    function applyVisibility() {
        const on = !HIDE_WHEN_OFF || AIService.status().ready;
        document.querySelectorAll('[data-ai]').forEach(el => el.classList.toggle('hidden', !on));
    }

    // ---------- pembantu untuk fitur AI ----------
    /** Anonimisasi: kode untuk seluruh siswa dan wali yang ada di aplikasi. */
    function pii() { return Anonymizer.create({ students: allStudents, guardians: allGuardians }); }

    function fail(e) {
        const code = (e && e.code) || 'ERROR';
        const msgText = (e && e.message) || 'Terjadi kesalahan tak terduga.';
        console.error('[AI]', code, e && e.problems ? e.problems : '');
        showModal('AI Gagal (' + code + ')', msgText, '⚠️');
    }

    /**
     * Menjalankan tugas AI pada sebuah tombol: tombol berubah menjadi "klik untuk batal" selama berjalan.
     * fn(signal) -> Promise. Galat ditampilkan; pembatalan dilaporkan singkat.
     */
    async function run(btn, busyText, fn) {
        if (btn._aiCtl) { btn._aiCtl.abort(); return null; }
        const ctl = new AbortController();
        btn._aiCtl = ctl;
        const orig = btn.innerHTML;
        btn.innerHTML = '⏳ ' + busyText + '... (klik untuk batal)';
        try {
            return await fn(ctl.signal);
        } catch (e) {
            if (e && e.code === 'ABORTED') showModal('Dibatalkan', 'Permintaan AI dibatalkan. Tidak ada data yang diubah.', 'ℹ️');
            else fail(e);
            return null;
        } finally {
            btn._aiCtl = null;
            btn.innerHTML = orig;
            refreshUsage();
        }
    }

    // ---------- tinjauan draf (pilih butir lalu simpan) ----------
    let reviewState = null;
    /** items: array HTML (sudah di-escape pemanggil). onSave(indeksTerpilih[]). */
    function review({ title, info, items, saveLabel, onSave }) {
        reviewState = { onSave };
        $('aiReviewTitle').innerText = title;
        $('aiReviewInfo').innerText = info || '';
        $('aiReviewSave').innerText = saveLabel || 'Simpan Terpilih';
        $('aiReviewList').innerHTML = items.length ? items.map(h => `<label class="block border border-slate-200 rounded-xl p-3 text-sm cursor-pointer"><div class="flex items-start gap-2"><input type="checkbox" checked class="mt-1"><div class="flex-1">${h}</div></div></label>`).join('')
            : '<div class="text-sm text-slate-500 italic p-4">Tidak ada hasil yang lolos pemeriksaan. Coba lagi.</div>';
        $('modalAiReview').classList.remove('hidden');
    }
    function reviewSave() {
        if (!reviewState) return;
        const sel = Array.from(document.querySelectorAll('#aiReviewList input[type=checkbox]')).map((c, i) => c.checked ? i : -1).filter(i => i >= 0);
        if (!sel.length) { showModal('Peringatan', 'Pilih minimal satu untuk disimpan.', '⚠️'); return; }
        $('modalAiReview').classList.add('hidden');
        const cb = reviewState.onSave; reviewState = null;
        cb(sel);
    }
    function reviewCancel() { reviewState = null; $('modalAiReview').classList.add('hidden'); }

    function init() {
        AIService.use({
            onStyleResolved: s => { cfg().styleResolved = s; saveAllData(); }
        });
    }

    return { review, reviewSave, reviewCancel, pii, fail, run, render, save, test, clearSecret, onModeChange, ensureReady, acceptPrivacy, applyVisibility, refreshUsage, init, HIDE_WHEN_OFF };
})();
