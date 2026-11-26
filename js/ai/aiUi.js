/**
 * Antarmuka pengaturan AI + penjaga kesiapan fitur AI.
 * Rahasia (API key / token proxy) tidak pernah ditampilkan kembali di layar, log, backup, atau URL.
 */
const AIUI = (() => {
    // Diaktifkan di Tahap 3, setelah fitur AI benar-benar tersambung ke Gemini.
    const HIDE_WHEN_OFF = true;
    const MODEL_RE = /^gemini-[a-z0-9][a-z0-9.\-]{0,60}$/;
    const $ = id => document.getElementById(id);

    function cfg() { return settings.ai; }

    // ---------- konfigurasi bersama (app-config.js) & mode cloud ----------
    function isCloud() { return typeof Cloud !== 'undefined' && !!Cloud.enabled; }
    function sharedCfg() { return (typeof window !== 'undefined' && window.APP_CONFIG && window.APP_CONFIG.ai) || {}; }
    /** Tersedia konfigurasi bersama (URL proxy dan token terisi di app-config.js). */
    function hasShared() { const m = sharedCfg(); return !!(m.proxyUrl && m.token); }
    /** Dipakai bila mode cloud aktif ATAU ada konfigurasi bersama dan guru tidak memilih pengaturan sendiri. */
    function isManaged() { return isCloud() || (hasShared() && !cfg().custom); }
    function effectiveConfig() {
        const c = cfg();
        const m = sharedCfg();
        if (isCloud()) {
            return { ...c, mode: 'cloud',
                model: c.modelChosen ? c.model : (m.model || c.model), fallbackModel: c.modelChosen ? c.fallbackModel : (m.fallbackModel || c.fallbackModel) };
        }
        if (!isManaged()) return c;
        return { ...c, mode: 'proxy', proxyUrl: m.proxyUrl,
            model: c.modelChosen ? c.model : (m.model || c.model), fallbackModel: c.modelChosen ? c.fallbackModel : (m.fallbackModel || c.fallbackModel) };
    }
    function effectiveSecret() { return isCloud() ? '' : (isManaged() ? sharedCfg().token : Store.secretGet()); }

    // ---------- pilihan model ----------
    const MODEL_CHOICES = [
        { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash: seimbang (disarankan)' },
        { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite: hemat dan cepat' },
        { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
        { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash: terbaru (kadang padat)' },
        { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' }
    ];
    let modelList = MODEL_CHOICES.slice();

    function fillSelect(selId, txtId, current, allowNone) {
        const sel = $(selId), txt = $(txtId);
        const opts = modelList.slice();
        if (current && !opts.some(o => o.id === current)) opts.unshift({ id: current, label: current + ' (tersimpan)' });
        sel.innerHTML = (allowNone ? '<option value="">(tanpa model cadangan)</option>' : '') +
            opts.map(o => `<option value="${esc(o.id)}">${esc(o.label)}</option>`).join('') +
            '<option value="__custom__">Lainnya (ketik manual)...</option>';
        sel.value = current || (allowNone ? '' : opts[0].id);
        txt.value = ''; txt.classList.add('hidden');
    }
    function onModelChange(sel, txtId) {
        const txt = $(txtId);
        const custom = $(sel).value === '__custom__';
        txt.classList.toggle('hidden', !custom);
        if (custom) txt.focus();
    }
    function readModel(selId, txtId) {
        const v = $(selId).value;
        return v === '__custom__' ? $(txtId).value.trim() : v;
    }

    let loadingModels = false;
    async function loadModels() {
        if (loadingModels) return;
        const note = $('aiModelNote');
        const st = AIService.status();
        if (!st.configured) { note.innerText = 'Lengkapi dan simpan pengaturan koneksi dulu, baru muat daftar model.'; return; }
        loadingModels = true;
        const btn = $('aiLoadModelsBtn'); btn.disabled = true;
        note.innerText = 'Memuat daftar model dari Gemini...';
        try {
            const list = await AIService.listModels();
            if (!list.length) { note.innerText = 'Gemini tidak mengembalikan model yang cocok.'; return; }
            const keep = c => list.some(x => x.id === c);
            modelList = list;
            const main = readModel('setAiModelSelect', 'setAiModel'), fb = readModel('setAiFallbackSelect', 'setAiFallback');
            fillSelect('setAiModelSelect', 'setAiModel', main && keep(main) ? main : (keep(cfg().model) ? cfg().model : list[0].id), false);
            fillSelect('setAiFallbackSelect', 'setAiFallback', fb && keep(fb) ? fb : '', true);
            note.innerText = `${list.length} model tersedia untuk key Anda. Pilihan saat ini dipertahankan bila masih tersedia.`;
        } catch (e) {
            note.innerText = `Gagal memuat daftar [${e.code || 'ERROR'}]: ${e.message}`;
        } finally { loadingModels = false; btn.disabled = false; }
    }

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

    /** Tampilkan/sembunyikan kolom koneksi sesuai mode, konfigurasi bersama, dan mode cloud. */
    function applyConnVisibility() {
        const cloud = isCloud();
        if (cloud) {
            $('aiCustomRow').classList.add('hidden');
            $('aiConnGroup').classList.add('hidden');
            $('aiClearBtn').classList.add('hidden');
            $('aiManagedNote').innerText = 'Koneksi AI terhubung lewat server sekolah menggunakan sesi login Anda. Anda tidak perlu mengisi URL atau kunci API. Cukup aktifkan AI, setujui privasi, lalu Simpan.';
            $('aiManagedNote').classList.remove('hidden');
            return;
        }
        $('aiManagedNote').innerText = 'Koneksi AI sudah diatur oleh admin sekolah. Anda tidak perlu mengisi URL atau token. Cukup aktifkan AI, setujui privasi, lalu Simpan.';
        const shared = hasShared();
        const custom = shared ? $('setAiCustom').checked : true;
        $('aiCustomRow').classList.toggle('hidden', !shared);
        $('aiManagedNote').classList.toggle('hidden', !(shared && !custom));
        $('aiConnGroup').classList.toggle('hidden', shared && !custom);
        const direct = $('setAiMode').value === 'direct';
        $('aiProxyRow').classList.toggle('hidden', direct);
        $('aiSecretLabel').innerText = direct ? 'API key Gemini (disimpan di browser ini)' : 'Token aplikasi (APP_TOKEN di Apps Script)';
        $('aiDirectWarn').classList.toggle('hidden', !direct);
        $('aiClearBtn').classList.toggle('hidden', shared && !custom);
    }
    function onModeChange() { applyConnVisibility(); }

    function refreshUsage() {
        const el = $('aiUsageInfo');
        if (!el) return;
        const u = AIService.usageToday();
        const per = Object.entries(u.tokensByTask || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v.toLocaleString('id-ID')}`).join(', ');
        el.innerText = `Hari ini: ${u.requests} permintaan, sekitar ${u.tokens.toLocaleString('id-ID')} token${per ? ' (' + per + ')' : ''}. Perkiraan lokal di perangkat ini, bukan angka resmi Google.`;
    }

    function render() {
        if (!$('setAiMode')) return;
        const c = cfg();
        $('setAiEnabled').checked = !!c.enabled;
        $('setAiCustom').checked = !!c.custom;
        $('setAiMode').value = c.mode === 'direct' ? 'direct' : 'proxy';
        $('setAiProxyUrl').value = c.proxyUrl || '';
        const eff = effectiveConfig();
        fillSelect('setAiModelSelect', 'setAiModel', eff.model || AIService.DEFAULT_MODEL, false);
        fillSelect('setAiFallbackSelect', 'setAiFallback', eff.fallbackModel || '', true);
        $('aiModelNote').innerText = '';
        $('setAiAllowNames').checked = !!c.allowNames;
        $('setAiTerse').checked = !!c.styleTerse;
        $('setAiPrivacy').checked = !!c.privacyAckAt;
        const s = $('setAiSecret');
        s.value = '';
        s.placeholder = Store.secretGet() ? '•••••••• tersimpan (kosongkan bila tidak diganti)' : 'Belum diisi';
        applyConnVisibility();
        refreshUsage();
        applyVisibility();
        const st = AIService.status();
        if (st.ready && c.lastTestOk) msg('Terhubung. Uji koneksi terakhir berhasil: ' + new Date(c.lastTestOk).toLocaleString('id-ID') + '.', 'ok');
        else if (st.ready) msg('Pengaturan sudah lengkap, tetapi koneksi BELUM diuji. Tekan "Uji Koneksi" untuk memastikan benar-benar tersambung.', 'info');
        else msg(st.enabled ? 'Fitur AI aktif tetapi pengaturan belum lengkap atau privasi belum disetujui.' : 'Fitur AI sedang dimatikan.', 'info');
    }

    function save() {
        const c = cfg();
        const cloud = isCloud();
        const shared = hasShared();
        const custom = cloud ? false : (shared ? $('setAiCustom').checked : true);
        const managedNow = cloud || (shared && !custom);
        const mode = $('setAiMode').value === 'direct' ? 'direct' : 'proxy';
        const proxyUrl = $('setAiProxyUrl').value.trim();
        const model = readModel('setAiModelSelect', 'setAiModel');
        const fallback = readModel('setAiFallbackSelect', 'setAiFallback');
        const secretIn = $('setAiSecret').value.trim();
        const enabled = $('setAiEnabled').checked;
        const privacy = $('setAiPrivacy').checked;

        const errs = [];
        if (!MODEL_RE.test(model)) errs.push('Nama model tidak valid (contoh: gemini-3.6-flash).');
        if (fallback && !MODEL_RE.test(fallback)) errs.push('Nama model cadangan tidak valid (contoh: gemini-3.5-flash-lite).');
        if (!managedNow) {
            if (mode === 'proxy') {
                let ok = false;
                try { const u = new URL(proxyUrl); ok = u.protocol === 'https:'; } catch (_) {}
                if (!ok && (enabled || proxyUrl)) errs.push('URL Web App harus diawali https:// (salin dari hasil Deploy Apps Script, berakhiran /exec).');
            }
            if (/\s/.test(secretIn)) errs.push('Kunci/token tidak boleh mengandung spasi.');
            if (enabled && !secretIn && !Store.secretGet()) errs.push(mode === 'proxy' ? 'Isi token aplikasi.' : 'Isi API key Gemini.');
        }
        if (enabled && !privacy && !c.privacyAckAt) errs.push('Centang persetujuan pemberitahuan privasi untuk mengaktifkan AI.');
        if (errs.length) { msg(errs.join(' '), 'err'); return false; }

        const prevEff = effectiveConfig();
        if (!managedNow) {
            if (secretIn) Store.secretSet(secretIn);
            c.mode = mode; c.proxyUrl = proxyUrl;
        }
        c.custom = custom;
        c.model = model; c.fallbackModel = fallback; c.modelChosen = true; c.touched = true;
        c.enabled = enabled;
        c.allowNames = $('setAiAllowNames').checked;
        c.styleTerse = $('setAiTerse').checked;
        if (privacy && !c.privacyAckAt) c.privacyAckAt = new Date().toISOString();
        if (!privacy) c.privacyAckAt = null;
        const eff = effectiveConfig();
        if (eff.mode !== prevEff.mode || eff.proxyUrl !== prevEff.proxyUrl || eff.model !== prevEff.model || eff.fallbackModel !== prevEff.fallbackModel || secretIn || managedNow !== isManaged()) {
            c.styleResolved = null; c.lastTestOk = null;
        }
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
        const stageText = s => s === 'proxy'
            ? (st.mode === 'cloud' ? 'Tahap 1 dari 2: memeriksa sesi login & server sekolah...' : 'Tahap 1 dari 2: menghubungi proxy Apps Script (maks 20 detik)...')
            : 'Tahap 2 dari 2: menghubungi Gemini (maks 60 detik, mohon tunggu)...';
        msg((st.mode === 'proxy' || st.mode === 'cloud') ? stageText('proxy') : stageText('gemini'), 'info');
        try {
            const r = await AIService.ping(undefined, s => { stage = s; msg(stageText(s), 'info'); });
            cfg().lastTestOk = new Date().toISOString();
            saveAllData();
            const hopLabel = st.mode === 'cloud' ? 'Server' : 'Proxy';
            msg(`Koneksi berhasil.${r.proxyMs !== null ? ` ${hopLabel} ${r.proxyMs} ms.` : ''} Model ${r.model}${r.fallback ? ' (MODEL CADANGAN, model utama sedang bermasalah)' : ''}, format keluaran terstruktur "${r.style}", Gemini menjawab dalam ${r.ms} ms.`, 'ok');
        } catch (e) {
            const stage1Label = st.mode === 'cloud' ? 'server' : 'proxy';
            const where = (e.stage === 'gemini' || stage === 'gemini') && (st.mode === 'proxy' || st.mode === 'cloud') ? ' (tahap 2: Gemini)' : (stage === 'proxy' ? ` (tahap 1: ${stage1Label})` : '');
            msg(`Gagal [${e.code || 'ERROR'}]${where}: ${e.message}`, 'err');
        } finally {
            testing = false;
            if (btn) { btn.disabled = false; btn.innerText = 'Uji Koneksi'; }
            refreshUsage();
        }
    }

    function clearSecret() {
        Store.secretClear();
        cfg().enabled = false; cfg().touched = true;
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
        const cloudProvider = () => isCloud() ? ({
            endpoint: (typeof window !== 'undefined' && window.APP_CONFIG && window.APP_CONFIG.aiEndpoint) || '/api/gemini',
            getToken: () => (typeof Auth !== 'undefined' ? Auth.getAccessToken() : '')
        }) : null;
        AIService.use({
            config: effectiveConfig, secret: effectiveSecret, cloud: cloudProvider,
            onStyleResolved: s => { cfg().styleResolved = s; saveAllData(); }
        });
        // Konfigurasi bersama / mode cloud: AI aktif otomatis untuk guru yang belum pernah mengubah pengaturan.
        if (isManaged() && !cfg().touched && !cfg().enabled) { cfg().enabled = true; saveAllData(); }
    }

    return { review, reviewSave, reviewCancel, pii, fail, run, render, save, test, clearSecret, onModeChange, onModelChange, loadModels, applyConnVisibility, isManaged, isCloud, hasShared, MODEL_CHOICES, ensureReady, acceptPrivacy, applyVisibility, refreshUsage, init, HIDE_WHEN_OFF };
})();
