/**
 * Gerbang login/register, status Cloud, alur koneksi pertama / ganti akun, status sinkronisasi header,
 * pembatasan antarmuka berdasarkan peran (Admin vs Guru), dan manajemen anggota sekolah.
 *
 * Backend: Google Spreadsheet lewat Apps Script (js/core/remote-sheets.js).
 * Aktif bila `APP_CONFIG.sheetsUrl` terisi. Tanpa itu, `Cloud.enabled === false` dan
 * `Cloud.isAdmin() === true` sehingga mode lokal satu pengguna berjalan persis seperti semula.
 */
const Cloud = {
    enabled: false,
    ready: false,
    role: null,      // 'admin' | 'teacher' | null
    user: null,      // { id, email, name } | null
    school: null,    // { id, name } | null
    isAdmin() {
        return !this.enabled || this.role === 'admin';
    }
};

const Auth = (() => {
    const $ = id => document.getElementById(id);
    const META_ACCOUNT = 'sync_account';
    const REASONS = {
        BAD_CREDENTIALS: 'Email atau kata sandi salah.',
        LOCKED: 'Terlalu banyak percobaan gagal. Coba lagi dalam 15 menit.',
        EMAIL_EXISTS: 'Email tersebut sudah terdaftar. Silakan masuk.',
        EMAIL_INVALID: 'Format email tidak valid.',
        NAME_REQUIRED: 'Nama lengkap wajib diisi.',
        PASSWORD_WEAK: 'Kata sandi minimal 8 karakter.',
        SCHOOL_REQUIRED: 'Nama sekolah wajib diisi oleh pendaftar pertama.',
        BAD_CODE: 'Kode pendaftaran sekolah salah.',
        GOOGLE_INVALID: 'Verifikasi Google gagal. Pastikan GOOGLE_CLIENT_ID di Apps Script sama dengan Client ID Anda, lalu coba lagi.'
    };

    let remote = null;
    let unsubSync = null;
    let appInitialized = false;
    let bootingSession = false;
    let pendingDecision = null; // resolver Promise untuk konfirmasi ganti akun / unggah data lokal
    let regStatus = { hasUsers: true, needsCode: false, schoolName: '' };

    function isCloudConfigured() {
        return !!(typeof window !== 'undefined' && window.APP_CONFIG && String(window.APP_CONFIG.sheetsUrl || '').trim());
    }

    function showGatePanel(panelId) {
        const gate = $('authGate');
        if (!gate) return;
        gate.classList.remove('hidden');
        ['authPanelLoading', 'authPanelLogin', 'authPanelRegister', 'authPanelSwitch', 'authPanelFirstSync', 'authPanelError'].forEach(id => {
            const el = $(id);
            if (el) el.classList.toggle('hidden', id !== panelId);
        });
    }

    function hideGate() {
        const gate = $('authGate');
        if (gate) gate.classList.add('hidden');
    }

    function setLoadingText(txt) {
        showGatePanel('authPanelLoading');
        const el = $('authLoadingText');
        if (el) el.innerText = txt || 'Menghubungkan ke Spreadsheet sekolah...';
    }

    function showGateError(message) {
        showGatePanel('authPanelError');
        const el = $('authErrorText');
        if (el) el.innerText = message || 'Gagal terhubung ke Spreadsheet sekolah.';
    }

    function formMsg(id, text) {
        const el = $(id);
        if (!el) return;
        el.innerText = text || '';
        el.classList.toggle('hidden', !text);
    }

    function hasPreExistingLocalData() {
        for (const k of Store.LIST_KEYS) {
            const arr = Store.read(k, []);
            if (Array.isArray(arr) && arr.length > 0) return true;
        }
        const st = Store.read('g_set', null);
        if (st && typeof st === 'object' && Object.keys(st).length > 0) return true;
        return false;
    }

    function waitDecision() {
        return new Promise(resolve => { pendingDecision = resolve; });
    }

    function chooseDecision(choice) {
        if (!pendingDecision) return;
        const res = pendingDecision;
        pendingDecision = null;
        res(choice);
    }

    // ---------- tampilan form ----------
    async function refreshRegStatus() {
        try {
            const s = await remote.status();
            if (s && s.ok) regStatus = s;
        } catch (_) { /* biarkan bawaan; server akan menolak bila perlu */ }
        const codeRow = $('regCodeRow');
        if (codeRow) codeRow.classList.toggle('hidden', !regStatus.needsCode || !regStatus.hasUsers);
        const schoolRow = $('regSchoolRow');
        if (schoolRow) schoolRow.classList.toggle('hidden', !!regStatus.hasUsers);
        const note = $('regFirstNote');
        if (note) note.classList.toggle('hidden', !!regStatus.hasUsers);
        const school = $('authSchoolLabel');
        if (school) school.innerText = regStatus.schoolName || '';
        renderGoogle();
    }

    // ---------- Masuk dengan Google (Google Identity Services) ----------
    let pendingGoogle = null; // { credential } saat akun Google baru perlu melengkapi pendaftaran
    let gisReady = false;
    function googleClientId() {
        return String(regStatus.googleClientId || (window.APP_CONFIG && window.APP_CONFIG.googleClientId) || '').trim();
    }
    function loadGis() {
        return new Promise((resolve, reject) => {
            if (window.google && window.google.accounts && window.google.accounts.id) return resolve();
            const s = document.createElement('script');
            s.src = 'https://accounts.google.com/gsi/client';
            s.async = true;
            s.onload = () => resolve();
            s.onerror = () => { s.remove(); reject(new Error('Gagal memuat layanan Google.')); };
            document.head.appendChild(s);
        });
    }
    async function renderGoogle() {
        const cid = googleClientId();
        const rows = document.querySelectorAll('.googleRow');
        if (!cid) { rows.forEach(r => r.classList.add('hidden')); return; }
        // Tombol Google hanya bekerja dari http(s) (bukan file://) dan origin harus terdaftar di Google Cloud.
        if (!/^https?:$/.test(location.protocol)) { rows.forEach(r => r.classList.add('hidden')); return; }
        try { await loadGis(); } catch (_) { rows.forEach(r => r.classList.add('hidden')); return; }
        if (!gisReady) {
            window.google.accounts.id.initialize({ client_id: cid, callback: onGoogleCredential, ux_mode: 'popup' });
            gisReady = true;
        }
        rows.forEach(r => {
            r.classList.toggle('hidden', r.id === 'regGoogleRow' && !!pendingGoogle);
            const box = r.querySelector('.google-btn');
            if (box && !box.dataset.rendered) {
                const w = Math.min(320, Math.max(220, (box.parentElement.clientWidth || 300)));
                window.google.accounts.id.renderButton(box, { type: 'standard', theme: 'outline', size: 'large', text: 'continue_with', shape: 'pill', width: w, locale: 'id' });
                box.dataset.rendered = '1';
            }
        });
    }

    async function onGoogleCredential(resp) {
        if (!remote || !resp || !resp.credential) return;
        formMsg('authLoginError', ''); formMsg('authRegError', '');
        const prevPanel = !$('authPanelRegister').classList.contains('hidden') ? 'authRegError' : 'authLoginError';
        try {
            const res = await remote.googleLogin({ credential: resp.credential });
            if (res && res.ok) { pendingGoogle = null; await processAuthenticatedSession(res.session); return; }
            if (res && (res.reason === 'SCHOOL_REQUIRED' || res.reason === 'BAD_CODE')) {
                pendingGoogle = { credential: resp.credential };
                await showRegister({ google: { email: res.email, name: res.name } });
                return;
            }
            formMsg(prevPanel, REASONS[res && res.reason] || 'Gagal masuk dengan Google.');
        } catch (err) {
            formMsg(prevPanel, err && err.message ? err.message : 'Gagal masuk dengan Google.');
        }
    }

    function setGoogleRegisterMode(info) {
        const on = !!info;
        $('regPwRows').classList.toggle('hidden', on);
        ['regPassword', 'regPassword2'].forEach(id => { const el = $(id); el.required = !on; });
        $('regGoogleNote').classList.toggle('hidden', !on);
        const email = $('regEmail');
        email.readOnly = on;
        if (on) { email.value = info.email || ''; if (info.name && !$('regName').value) $('regName').value = info.name; }
    }

    function showLogin() {
        pendingGoogle = null;
        setGoogleRegisterMode(null);
        formMsg('authLoginError', '');
        showGatePanel('authPanelLogin');
        const el = $('loginEmail');
        if (el) el.focus();
    }

    async function showRegister(opts) {
        formMsg('authRegError', '');
        if (!(opts && opts.google)) pendingGoogle = null;
        setGoogleRegisterMode(opts && opts.google);
        showGatePanel('authPanelRegister');
        await refreshRegStatus();
    }

    function togglePassword(inputId, btn) {
        const el = $(inputId);
        if (!el) return;
        const show = el.type === 'password';
        el.type = show ? 'text' : 'password';
        if (btn) btn.innerText = show ? 'Sembunyikan' : 'Tampilkan';
    }

    // ---------- alur utama ----------
    async function boot() {
        Cloud.enabled = isCloudConfigured();
        if (!Cloud.enabled) return false;

        setLoadingText('Menyiapkan koneksi sekolah...');
        try {
            remote = await RemoteSheets.init(window.APP_CONFIG);
        } catch (e) {
            showGateError(e && e.message ? e.message : String(e));
            return true;
        }

        if (typeof remote.onAuthLost === 'function') {
            remote.onAuthLost(() => {
                if (Cloud.ready) {
                    handleSignedOutState();
                    formMsg('authLoginError', 'Sesi Anda berakhir. Silakan masuk kembali.');
                }
            });
        }

        let session = null;
        try {
            session = await remote.getSession();
        } catch (e) {
            showGateError(e && e.message ? e.message : String(e));
            return true;
        }

        if (!session) {
            showLogin();
            refreshRegStatus();
            return true;
        }

        await processAuthenticatedSession(session);
        return true;
    }

    async function submitLogin(e) {
        if (e) e.preventDefault();
        if (!remote) return;
        const email = ($('loginEmail').value || '').trim();
        const pw = $('loginPassword').value || '';
        const btn = $('btnLogin');
        formMsg('authLoginError', '');
        if (!email || !pw) { formMsg('authLoginError', 'Isi email dan kata sandi.'); return; }
        if (btn) { btn.disabled = true; btn.innerText = 'Memeriksa...'; }
        try {
            const res = await remote.login(email, pw);
            if (!res || !res.ok) {
                formMsg('authLoginError', REASONS[res && res.reason] || 'Gagal masuk.');
                return;
            }
            $('loginPassword').value = '';
            await processAuthenticatedSession(res.session);
        } catch (err) {
            formMsg('authLoginError', err && err.message ? err.message : 'Gagal masuk.');
        } finally {
            if (btn) { btn.disabled = false; btn.innerText = 'Masuk'; }
        }
    }

    async function submitRegister(e) {
        if (e) e.preventDefault();
        if (!remote) return;
        const name = ($('regName').value || '').trim();
        const email = ($('regEmail').value || '').trim();
        const pw = $('regPassword').value || '';
        const pw2 = $('regPassword2').value || '';
        const btn = $('btnRegister');
        formMsg('authRegError', '');
        if (!pendingGoogle && pw.length < 8) { formMsg('authRegError', REASONS.PASSWORD_WEAK); return; }
        if (!pendingGoogle && pw !== pw2) { formMsg('authRegError', 'Konfirmasi kata sandi tidak sama.'); return; }
        if (btn) { btn.disabled = true; btn.innerText = 'Mendaftarkan...'; }
        try {
            const extra = { code: ($('regCode').value || '').trim(), school: ($('regSchool').value || '').trim() };
            const res = pendingGoogle
                ? await remote.googleLogin({ credential: pendingGoogle.credential, name, ...extra })
                : await remote.register({ name, email, password: pw, ...extra });
            if (!res || !res.ok) {
                formMsg('authRegError', REASONS[res && res.reason] || 'Pendaftaran gagal.');
                return;
            }
            pendingGoogle = null;
            $('regPassword').value = ''; $('regPassword2').value = '';
            await processAuthenticatedSession(res.session);
        } catch (err) {
            formMsg('authRegError', err && err.message ? err.message : 'Pendaftaran gagal.');
        } finally {
            if (btn) { btn.disabled = false; btn.innerText = 'Daftar'; }
        }
    }

    async function retryGate() {
        if (!remote) { await boot(); return; }
        try {
            const session = await remote.getSession();
            if (!session) { showLogin(); return; }
            await processAuthenticatedSession(session);
        } catch (e) {
            showGateError(e && e.message ? e.message : String(e));
        }
    }

    async function signOutFromGate() {
        pendingDecision = null;
        if (remote) { try { await remote.signOut(); } catch (_) {} }
        handleSignedOutState();
    }

    function handleSignedOutState() {
        Sync.resetState();
        Cloud.ready = false;
        Cloud.role = null;
        Cloud.user = null;
        Cloud.school = null;
        showLogin();
        refreshRegStatus();
    }

    async function processAuthenticatedSession(session) {
        if (bootingSession) return;
        bootingSession = true;
        try {
            setLoadingText('Memuat akun Anda...');
            Cloud.user = {
                id: session.user.id,
                email: session.user.email || '',
                name: session.user.name || ''
            };
            Cloud.school = { id: (session.school && session.school.id) || 'sekolah', name: (session.school && session.school.name) || '' };
            Cloud.role = session.role === 'admin' ? 'admin' : 'teacher';

            const prevAccount = Store.metaGet(META_ACCOUNT, null);

            // 1. Cek pergantian akun di perangkat yang sama
            if (prevAccount && prevAccount.userId && prevAccount.userId !== Cloud.user.id) {
                const prevEl = $('authSwitchPrevEmail');
                const nextEl = $('authSwitchNextEmail');
                if (prevEl) prevEl.innerText = prevAccount.email || prevAccount.userId;
                if (nextEl) nextEl.innerText = Cloud.user.email;
                showGatePanel('authPanelSwitch');
                const choice = await waitDecision();
                if (choice !== 'wipe_and_continue') {
                    await signOutFromGate();
                    return;
                }
                setLoadingText('Membersihkan data lokal akun sebelumnya...');
                await Store.wipe();
            } else if (!prevAccount && hasPreExistingLocalData()) {
                // 2. Koneksi pertama: ada data lokal lama sebelum mode cloud
                const descEl = $('authFirstSyncDesc');
                if (descEl) {
                    descEl.innerText = Cloud.isAdmin()
                        ? 'Ditemukan data lokal di browser ini. Sebagai Admin Sekolah, memilih "Unggah Data Lokal" akan mengunggah seluruh data sekolah (periode, kelas, peserta didik) serta perangkat ajar dan nilai Anda ke Spreadsheet sekolah.'
                        : 'Ditemukan data lokal di browser ini. Sebagai Guru Mata Pelajaran, memilih "Unggah Data Lokal" hanya akan mengunggah data milik guru (perangkat ajar, bank soal, absensi, nilai, jurnal, dll.), sedangkan daftar periode, kelas, dan siswa diambil dari data sekolah.';
                }
                showGatePanel('authPanelFirstSync');
                const choice = await waitDecision();
                if (choice === 'cancel') {
                    await signOutFromGate();
                    return;
                }
                if (choice === 'upload') {
                    Sync.use({ store: Store });
                    Sync.configure({ remote, userId: Cloud.user.id, role: Cloud.role, onRemoteApplied: handleRemoteApplied });
                    Sync.enqueueAll({ userId: Cloud.user.id, role: Cloud.role });
                    if (!Cloud.isAdmin()) {
                        // Bersihkan data sekolah lokal lama agar digantikan data sekolah resmi saat tarik awal
                        Store.write('g_per', [], { silent: true });
                        Store.write('g_cls', [], { silent: true });
                        Store.write('g_stu', [], { silent: true });
                    }
                } else if (choice === 'skip') {
                    await Store.wipe();
                }
            }

            Store.metaSet(META_ACCOUNT, {
                userId: Cloud.user.id,
                email: Cloud.user.email,
                schoolId: Cloud.school.id
            });

            // 3. Tarik awal SEBELUM initApp()
            setLoadingText('Menarik data sekolah dan administrasi Anda...');
            Sync.use({ store: Store });
            Sync.configure({ remote, userId: Cloud.user.id, role: Cloud.role, onRemoteApplied: handleRemoteApplied });
            await Sync.pullAll();

            // 4. Jalankan aplikasi utama
            Cloud.ready = true;
            hideGate();

            if (!appInitialized) {
                initApp();
                appInitialized = true;
            } else if (typeof reloadStateFromStore === 'function') {
                reloadStateFromStore();
            }

            AIUI.init();
            AIUI.applyVisibility();
            applyRoleVisibility();
            renderHeader();

            if (unsubSync) { unsubSync(); unsubSync = null; }
            unsubSync = Sync.onStatus(renderSyncBadge);
            const pollMs = (window.APP_CONFIG && window.APP_CONFIG.syncPollMs !== undefined) ? window.APP_CONFIG.syncPollMs : 60000;
            Sync.start({
                remote,
                userId: Cloud.user.id,
                role: Cloud.role,
                pollMs,
                immediate: Sync.getQueue().length > 0,
                onRemoteApplied: handleRemoteApplied
            });
            renderSyncBadge(Sync.status());
        } catch (err) {
            showGateError(err && err.message ? err.message : String(err));
        } finally {
            bootingSession = false;
        }
    }

    function handleRemoteApplied(changedTables) {
        if (!Cloud.ready || !changedTables || !changedTables.length) return;
        if (typeof reloadStateFromStore === 'function') {
            reloadStateFromStore({ preserveOpenModal: true });
        }
        applyRoleVisibility();
        renderHeader();
    }

    /** Menyembunyikan/menampilkan elemen bertanda data-admin-only sesuai peran aktif. */
    function applyRoleVisibility() {
        const admin = Cloud.isAdmin();
        document.querySelectorAll('[data-admin-only]').forEach(el => {
            el.classList.toggle('hidden', !admin);
        });
        const stuNote = $('studentReadonlyNote');
        if (stuNote) stuNote.classList.toggle('hidden', !Cloud.enabled || admin);
        const clsNote = $('classReadonlyNote');
        if (clsNote) clsNote.classList.toggle('hidden', !Cloud.enabled || admin);
        const setNote = $('settingsReadonlyNote');
        if (setNote) setNote.classList.toggle('hidden', !Cloud.enabled || admin);
        const teamCard = $('adminTeamCard');
        if (teamCard) teamCard.classList.toggle('hidden', !(Cloud.enabled && admin));
        const pwSec = $('profilePasswordSection');
        if (pwSec) pwSec.classList.toggle('hidden', !(Cloud.enabled && Cloud.ready));
        const btnLogout = $('btnMenuLogout');
        if (btnLogout) btnLogout.classList.toggle('hidden', !(Cloud.enabled && Cloud.ready));
    }

    function getInitials(rawName) {
        const clean = String(rawName || '').split(',')[0].replace(/[^A-Za-zÀ-ÿ0-9\s]/g, ' ').trim();
        if (!clean) return 'GM';
        const parts = clean.split(/\s+/).filter(Boolean);
        if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
        return parts[0].slice(0, 2).toUpperCase();
    }

    function currentDisplayName() {
        const t = (typeof settings !== 'undefined' && settings && settings.teacher) ? String(settings.teacher).trim() : '';
        if (t && t !== 'Guru Mapel') return t;
        if (Cloud.user && Cloud.user.name) return Cloud.user.name;
        return t || 'Guru Mapel';
    }

    function toggleUserMenu(e) {
        if (e) e.stopPropagation();
        const menu = $('userDropdownMenu');
        const btn = $('userAvatarBtn');
        if (!menu) return;
        const willOpen = menu.classList.contains('hidden');
        menu.classList.toggle('hidden', !willOpen);
        if (btn) btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    }

    function closeUserMenu() {
        const menu = $('userDropdownMenu');
        const btn = $('userAvatarBtn');
        if (menu) menu.classList.add('hidden');
        if (btn) btn.setAttribute('aria-expanded', 'false');
    }

    if (typeof document !== 'undefined') {
        document.addEventListener('click', e => {
            const wrap = $('userMenuWrapper');
            if (wrap && !wrap.contains(e.target)) closeUserMenu();
        });
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') {
                closeUserMenu();
                const mp = $('modalProfile');
                if (mp && !mp.classList.contains('hidden')) closeProfileModal();
            }
        });
    }

    function populateProfileView() {
        const s = (typeof settings !== 'undefined' && settings) ? settings : {};
        const name = currentDisplayName();
        const initials = getInitials(name);
        const email = (Cloud.enabled && Cloud.user && Cloud.user.email) ? Cloud.user.email : (s.emailTeacher || '-');
        const roleText = Cloud.enabled ? (Cloud.isAdmin() ? 'Admin Sekolah' : 'Guru Mata Pelajaran') : 'Mode Lokal (Perangkat Ini)';
        const activePer = (typeof periods !== 'undefined' && Array.isArray(periods))
            ? (periods.find(p => p.id === activePeriodId) || periods[0])
            : null;
        const perText = activePer ? `${activePer.year} • Semester ${activePer.semester}` : `${s.academicYear || '-'} • Semester ${s.semester || '-'}`;

        const setTxt = (id, val) => { const el = $(id); if (el) el.innerText = (val && String(val).trim()) ? String(val).trim() : '-'; };
        setTxt('profileModalInitials', initials);
        setTxt('profileModalName', name);
        setTxt('profileModalEmail', email);
        setTxt('profileModalRole', roleText);

        setTxt('pvTeacher', name);
        setTxt('pvNip', s.nipTeacher);
        setTxt('pvPangkat', s.pangkatTeacher);
        setTxt('pvEmail', email);
        setTxt('pvPhone', s.phoneTeacher);
        setTxt('pvSubject', s.subject);
        setTxt('pvFase', s.fase ? `Fase ${s.fase}` : '-');
        setTxt('pvSchool', s.school);
        setTxt('pvPeriod', perText);
        setTxt('pvPrincipal', s.principal);
        setTxt('pvNipPrincipal', s.nipPrincipal);
    }

    function populateProfileEdit() {
        const s = (typeof settings !== 'undefined' && settings) ? settings : {};
        const name = currentDisplayName();
        const email = (Cloud.enabled && Cloud.user && Cloud.user.email) ? Cloud.user.email : (s.emailTeacher || '');
        const lockSchool = Cloud.enabled && !Cloud.isAdmin();

        const setVal = (id, val) => { const el = $(id); if (el) el.value = val !== undefined && val !== null ? val : ''; };
        setVal('peTeacher', name);
        setVal('peNip', s.nipTeacher === '-' ? '' : (s.nipTeacher || ''));
        setVal('pePangkat', s.pangkatTeacher || '');
        setVal('pePhone', s.phoneTeacher || '');
        setVal('peEmail', email);
        const emailEl = $('peEmail');
        if (emailEl) {
            emailEl.readOnly = Cloud.enabled;
            emailEl.classList.toggle('bg-slate-100', Cloud.enabled);
            emailEl.classList.toggle('text-slate-500', Cloud.enabled);
        }

        const subSel = $('peSubject');
        if (subSel && s.subject) {
            if (!Array.from(subSel.options).some(o => o.value === s.subject)) {
                const opt = document.createElement('option');
                opt.value = s.subject;
                opt.textContent = s.subject;
                subSel.appendChild(opt);
            }
            subSel.value = s.subject;
        }
        setVal('peFase', s.fase || 'D');
        setVal('peSchool', s.school || '');
        setVal('peAcademicYear', s.academicYear || '');
        setVal('peSemester', s.semester || 'GENAP');
        setVal('pePrincipal', s.principal || '');
        setVal('peNipPrincipal', s.nipPrincipal === '-' ? '' : (s.nipPrincipal || ''));

        const note = $('peSchoolLockNote');
        if (note) note.classList.toggle('hidden', !lockSchool);
        ['peSchool', 'peAcademicYear', 'peSemester', 'pePrincipal', 'peNipPrincipal'].forEach(id => {
            const el = $(id);
            if (!el) return;
            el.disabled = lockSchool;
            el.classList.toggle('bg-slate-100', lockSchool);
            el.classList.toggle('text-slate-500', lockSchool);
        });

        const peMsg = $('peMsg');
        if (peMsg) { peMsg.className = 'hidden'; peMsg.innerText = ''; }
        const cpMsg = $('cpMsg');
        if (cpMsg) { cpMsg.className = 'hidden'; cpMsg.innerText = ''; }
        const pwSec = $('profilePasswordSection');
        if (pwSec) pwSec.classList.toggle('hidden', !(Cloud.enabled && Cloud.ready));
    }

    function switchProfileMode(mode) {
        const isEdit = mode === 'edit';
        const viewEl = $('profileViewPanel');
        const editEl = $('profileEditPanel');
        if (viewEl) viewEl.classList.toggle('hidden', isEdit);
        if (editEl) editEl.classList.toggle('hidden', !isEdit);
        if (isEdit) populateProfileEdit(); else populateProfileView();
    }

    function openProfileModal(initialMode = 'view') {
        closeUserMenu();
        const modal = $('modalProfile');
        if (!modal) return;
        populateProfileView();
        switchProfileMode(initialMode === 'edit' ? 'edit' : 'view');
        modal.classList.remove('hidden');
    }

    function closeProfileModal() {
        const modal = $('modalProfile');
        if (modal) modal.classList.add('hidden');
    }

    async function saveProfileBiodata(e) {
        if (e) e.preventDefault();
        const teacherName = ($('peTeacher').value || '').trim();
        const peMsg = $('peMsg');
        const showFeedback = (txt, isErr) => {
            if (!peMsg) return;
            peMsg.innerText = txt;
            peMsg.className = 'text-xs rounded-xl p-3 border ' + (isErr
                ? 'bg-red-50 text-red-700 border-red-200'
                : 'bg-emerald-50 text-emerald-800 border-emerald-200');
        };
        if (!teacherName) {
            showFeedback('Nama lengkap wajib diisi.', true);
            return;
        }
        const btn = $('btnSaveProfileBiodata');
        if (btn) { btn.disabled = true; btn.innerText = 'Menyimpan...'; }
        try {
            const canEditSchool = !Cloud.enabled || Cloud.isAdmin();
            settings.teacher = teacherName;
            settings.nipTeacher = ($('peNip').value || '').trim() || '-';
            settings.pangkatTeacher = ($('pePangkat').value || '').trim();
            settings.phoneTeacher = ($('pePhone').value || '').trim();
            if (!Cloud.enabled) settings.emailTeacher = ($('peEmail').value || '').trim();
            settings.subject = $('peSubject').value || settings.subject;
            settings.fase = $('peFase').value || 'D';

            if (canEditSchool) {
                settings.school = ($('peSchool').value || '').trim() || settings.school;
                settings.academicYear = ($('peAcademicYear').value || '').trim() || settings.academicYear;
                settings.semester = $('peSemester').value || settings.semester;
                settings.principal = ($('pePrincipal').value || '').trim() || settings.principal;
                settings.nipPrincipal = ($('peNipPrincipal').value || '').trim() || '-';

                if (typeof periods !== 'undefined' && Array.isArray(periods)) {
                    const activePeriod = periods.find(p => p.id === activePeriodId);
                    if (activePeriod) {
                        activePeriod.year = settings.academicYear;
                        activePeriod.semester = settings.semester;
                        if (Cloud.enabled) {
                            activePeriod.school = settings.school;
                            activePeriod.principal = settings.principal;
                            activePeriod.nipPrincipal = settings.nipPrincipal;
                        }
                    }
                }
            }

            if (Cloud.enabled && Cloud.ready && remote && typeof remote.updateProfile === 'function') {
                try {
                    const payload = { name: teacherName };
                    if (Cloud.isAdmin() && settings.school) payload.school = settings.school;
                    const r = await remote.updateProfile(payload);
                    if (r && r.ok) {
                        if (Cloud.user) Cloud.user.name = teacherName;
                        if (Cloud.school && settings.school && Cloud.isAdmin()) Cloud.school.name = settings.school;
                    }
                } catch (_) {
                    // Tetap lanjut menyimpan lokal & antrean sinkronisasi g_set bila server belum diperbarui
                    if (Cloud.user) Cloud.user.name = teacherName;
                }
            }

            if (typeof saveAllData === 'function') saveAllData();
            if (typeof updateHeader === 'function') updateHeader();
            const activeSec = document.querySelector('.view-section.active');
            if (activeSec && activeSec.id === 'view-settings' && typeof renderSettings === 'function') renderSettings();

            populateProfileView();
            switchProfileMode('view');
            showModal('Profil Diperbarui', 'Biodata Anda berhasil disimpan dan disinkronkan.', '✅');
        } finally {
            if (btn) { btn.disabled = false; btn.innerText = '💾 Simpan Biodata'; }
        }
    }

    async function changePassword(e) {
        if (e) e.preventDefault();
        if (!Cloud.enabled || !remote) return;
        const oldPw = $('cpOld').value || '';
        const newPw = $('cpNew').value || '';
        const newPw2 = $('cpNew2').value || '';
        const msg = $('cpMsg');
        const btn = $('btnSavePassword');
        const show = (t, err) => {
            if (!msg) return;
            msg.innerText = t;
            msg.className = 'text-xs rounded-xl p-3 border ' + (err ? 'bg-red-50 text-red-700 border-red-200' : 'bg-emerald-50 text-emerald-800 border-emerald-200');
        };
        if (newPw.length < 8) { show(REASONS.PASSWORD_WEAK, true); return; }
        if (newPw !== newPw2) { show('Konfirmasi kata sandi baru tidak sama.', true); return; }
        if (btn) { btn.disabled = true; btn.innerText = 'Memperbarui...'; }
        try {
            const res = await remote.changePassword(oldPw, newPw);
            if (!res || !res.ok) { show(res && res.reason === 'BAD_CREDENTIALS' ? 'Kata sandi lama salah.' : (REASONS[res && res.reason] || 'Gagal mengubah kata sandi.'), true); return; }
            $('cpOld').value = ''; $('cpNew').value = ''; $('cpNew2').value = '';
            show('Kata sandi berhasil diperbarui.', false);
        } catch (err) {
            show(err && err.message ? err.message : 'Gagal mengubah kata sandi.', true);
        } finally {
            if (btn) { btn.disabled = false; btn.innerText = '🔑 Perbarui Kata Sandi'; }
        }
    }

    function resetMemberPassword(userId, email) {
        if (!Cloud.enabled || !Cloud.isAdmin() || !remote) return;
        showConfirm(`Buat kata sandi sementara untuk ${email}? Kata sandi lama tidak berlaku dan guru tersebut akan keluar dari semua perangkat.`, async () => {
            try {
                const res = await remote.resetMemberPassword(userId);
                if (!res || !res.ok) { teamMsg('Gagal mereset kata sandi.', true); return; }
                teamMsg(`Kata sandi sementara untuk ${email}: ${res.tempPassword} (sampaikan ke guru dan minta segera diganti di Pengaturan).`, false);
            } catch (err) {
                teamMsg('Gagal mereset kata sandi: ' + (err && err.message ? err.message : err), true);
            }
        });
    }

    function renderHeader() {
        const name = currentDisplayName();
        const initials = getInitials(name);
        const av1 = $('headerAvatarInitials');
        if (av1) av1.innerText = initials;
        const av2 = $('dropdownAvatarInitials');
        if (av2) av2.innerText = initials;
        const dName = $('dropdownUserName');
        if (dName) dName.innerText = name;
        const dSub = $('dropdownUserSub');
        if (dSub) {
            dSub.innerText = (Cloud.enabled && Cloud.user && Cloud.user.email)
                ? Cloud.user.email
                : ((typeof settings !== 'undefined' && settings.subject) || 'Ruang Kerja Lokal');
        }
        const dRole = $('dropdownRoleBadge');
        if (dRole) {
            if (Cloud.enabled && Cloud.ready) {
                dRole.innerText = Cloud.isAdmin() ? 'Admin Sekolah' : 'Guru Mapel';
                dRole.className = 'inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ' + (Cloud.isAdmin()
                    ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                    : 'bg-blue-50 text-blue-700 border-blue-200');
            } else {
                dRole.innerText = 'Mode Lokal';
                dRole.className = 'inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full border bg-slate-100 text-slate-600 border-slate-200';
            }
        }
        const btnLogout = $('btnMenuLogout');
        if (btnLogout) btnLogout.classList.toggle('hidden', !(Cloud.enabled && Cloud.ready));

        const bar = $('cloudHeaderBar');
        if (!bar) return;
        bar.classList.toggle('hidden', !(Cloud.enabled && Cloud.ready));
        if (!Cloud.enabled || !Cloud.ready) return;
        const roleBadge = $('cloudRoleBadge');
        if (roleBadge) {
            roleBadge.innerText = Cloud.isAdmin() ? 'Admin Sekolah' : 'Guru Mapel';
            roleBadge.className = 'hidden lg:inline-flex text-[10px] font-bold px-2.5 py-1 rounded-full border ' + (Cloud.isAdmin()
                ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                : 'bg-slate-100 text-slate-700 border-slate-200');
        }
        renderSyncBadge(Sync.status());
    }

    function renderSyncBadge(st) {
        const el = $('syncStatusBadge');
        if (!el || !Cloud.enabled) return;
        const s = st || Sync.status();
        let label = '☁️ Tersinkron';
        let cls = 'bg-emerald-50 text-emerald-700 border-emerald-200';
        if (s.state === 'syncing') {
            label = '🔄 Menyinkronkan...';
            cls = 'bg-blue-50 text-blue-700 border-blue-200';
        } else if (s.state === 'offline') {
            label = s.pending ? `📴 Luring (${s.pending} antre)` : '📴 Luring';
            cls = 'bg-amber-50 text-amber-800 border-amber-200';
        } else if (s.state === 'error') {
            label = s.pending ? `⚠️ Gagal sinkron (${s.pending})` : '⚠️ Gagal sinkron';
            cls = 'bg-red-50 text-red-700 border-red-200';
        } else if (s.pending > 0) {
            label = `⏳ Antre (${s.pending})`;
            cls = 'bg-amber-50 text-amber-800 border-amber-200';
        }
        el.innerText = label;
        el.className = 'text-[11px] font-bold px-2.5 py-1 rounded-xl border cursor-pointer transition ' + cls;
        el.title = s.lastError ? ('Galat terakhir: ' + s.lastError + ' (klik untuk coba lagi)') : 'Klik untuk sinkronkan sekarang';
    }

    async function manualSync() {
        if (!Cloud.enabled || !Cloud.ready) return;
        const st = await Sync.syncNow();
        if (st.lastError) {
            showModal('Sinkronisasi Bermasalah', 'Belum berhasil menyinkronkan data: ' + st.lastError, '⚠️');
        }
    }

    async function getAccessToken() {
        if (!remote) return '';
        if (typeof remote.getAccessToken === 'function') return await remote.getAccessToken();
        const s = await remote.getSession();
        return s ? s.accessToken : '';
    }

    /** Keluar akun: menunggu antrean kosong lebih dulu; memperingatkan bila masih ada pending. */
    async function logout() {
        if (!Cloud.enabled) return;
        const st = Sync.status();
        if (st.pending > 0) {
            const el = $('syncStatusBadge');
            if (el) el.innerText = '⏳ Menyelesaikan antrean...';
            const res = await Sync.waitUntilDrained(10000);
            if (!res.drained) {
                showConfirm(
                    `Masih ada ${res.pending} perubahan lokal yang belum terkirim ke server karena kendala koneksi. ` +
                    `Jika Anda keluar dan perangkat dipakai akun lain, perubahan tersebut dapat hilang. Tetap keluar sekarang?`,
                    () => { forceLogout(); }
                );
                renderSyncBadge(Sync.status());
                return;
            }
        }
        await forceLogout();
    }

    async function forceLogout() {
        Sync.resetState();
        if (remote) { try { await remote.signOut(); } catch (_) {} }
        handleSignedOutState();
        renderHeader();
    }

    // ---------- Pengaturan & Manajemen Tim Sekolah (Admin) ----------

    function renderSettingsExtras() {
        applyRoleVisibility();
        const schoolInputs = ['setSchool', 'setAcademicYear', 'setSemester', 'setPrincipal', 'setNipPrincipal'];
        const lock = Cloud.enabled && !Cloud.isAdmin();
        for (const id of schoolInputs) {
            const el = $(id);
            if (!el) continue;
            el.disabled = lock;
            el.classList.toggle('bg-slate-100', lock);
            el.classList.toggle('text-slate-500', lock);
        }
        if (Cloud.enabled && Cloud.isAdmin()) {
            loadAdminTeam();
        }
    }

    function teamMsg(text, isErr) {
        const el = $('adminTeamMsg');
        if (!el) return;
        if (!text) { el.classList.add('hidden'); el.innerText = ''; return; }
        el.innerText = text;
        el.className = 'text-xs rounded-xl p-3 border ' + (isErr
            ? 'bg-red-50 text-red-700 border-red-200'
            : 'bg-emerald-50 text-emerald-800 border-emerald-200');
        el.classList.remove('hidden');
    }

    async function loadAdminTeam() {
        if (!Cloud.enabled || !Cloud.isAdmin() || !remote || typeof remote.listTeam !== 'function') return;
        const memBox = $('adminMemberList');
        const invBox = $('adminInviteList');
        if (!memBox || !invBox) return;
        try {
            const data = await remote.listTeam();
            const members = (data && data.members) || [];
            const invites = (data && data.invites) || [];

            invBox.innerHTML = invites.length ? invites.map(inv => `
                <div class="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-amber-200 bg-amber-50/60 text-xs">
                    <div>
                        <span class="font-bold text-slate-800">${esc(inv.email)}</span>
                        <span class="ml-2 px-2 py-0.5 rounded bg-white border border-amber-200 font-semibold text-amber-800">${inv.role === 'admin' ? 'Admin' : 'Guru'}</span>
                    </div>
                    <button type="button" onclick="Auth.revokeInvite('${esc(inv.id)}')" class="text-red-600 hover:text-red-800 font-bold px-2 py-1 rounded-lg bg-white border border-red-200">Batalkan</button>
                </div>
            `).join('') : '<p class="text-xs text-slate-400 italic">Tidak ada undangan yang menunggu klaim.</p>';

            memBox.innerHTML = members.length ? members.map(m => {
                const isSelf = Cloud.user && m.user_id === Cloud.user.id;
                const nextRole = m.role === 'admin' ? 'teacher' : 'admin';
                const nextLabel = m.role === 'admin' ? 'Jadikan Guru' : 'Jadikan Admin';
                return `
                    <div class="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl border border-slate-200 bg-slate-50/50 text-xs">
                        <div>
                            <div class="font-bold text-slate-800">${esc(m.name || m.email)} ${isSelf ? '<span class="text-[10px] text-blue-600">(Anda)</span>' : ''}</div>
                            <div class="text-slate-500">${esc(m.email)}</div>
                        </div>
                        <div class="flex items-center gap-2">
                            <span class="px-2.5 py-1 rounded-full font-bold ${m.role === 'admin' ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-200 text-slate-700'}">${m.role === 'admin' ? 'Admin' : 'Guru'}</span>
                            ${isSelf ? '' : `
                                <button type="button" onclick="Auth.changeMemberRole('${esc(m.user_id)}', '${nextRole}')" class="px-2.5 py-1 rounded-lg font-bold bg-white border border-slate-300 text-slate-700 hover:bg-slate-100">${nextLabel}</button>
                                <button type="button" onclick="Auth.resetMemberPassword('${esc(m.user_id)}', '${esc(m.email)}')" class="px-2.5 py-1 rounded-lg font-bold bg-white border border-amber-300 text-amber-700 hover:bg-amber-50">Reset Sandi</button>
                                <button type="button" onclick="Auth.removeMember('${esc(m.user_id)}', '${esc(m.email)}')" class="px-2.5 py-1 rounded-lg font-bold bg-red-50 border border-red-200 text-red-600 hover:bg-red-100">Keluarkan</button>
                            `}
                        </div>
                    </div>
                `;
            }).join('') : '<p class="text-xs text-slate-400 italic">Belum ada anggota terdaftar.</p>';
        } catch (e) {
            teamMsg('Gagal memuat daftar tim sekolah: ' + (e && e.message ? e.message : e), true);
        }
    }

    async function inviteTeacher(e) {
        if (e) e.preventDefault();
        if (!Cloud.enabled || !Cloud.isAdmin() || !remote) return;
        const emailEl = $('inviteEmail');
        const roleEl = $('inviteRole');
        const email = emailEl ? emailEl.value.trim().toLowerCase() : '';
        const roleVal = (roleEl && roleEl.value === 'admin') ? 'admin' : 'teacher';
        if (!email || !email.includes('@')) {
            teamMsg('Masukkan alamat email Google yang valid.', true);
            return;
        }
        try {
            const res = await remote.inviteMember(email, roleVal);
            if (!res || !res.ok) {
                const reason = res && res.reason === 'ALREADY_MEMBER'
                    ? 'Email tersebut sudah terdaftar sebagai anggota sekolah.'
                    : 'Email tidak valid atau gagal membuat undangan.';
                teamMsg(reason, true);
                return;
            }
            if (emailEl) emailEl.value = '';
            teamMsg(`Peran ${roleVal === 'admin' ? 'Admin' : 'Guru'} untuk ${email} disimpan. Saat guru mendaftar dengan email ini, peran tersebut otomatis dipakai.`, false);
            await loadAdminTeam();
        } catch (err) {
            teamMsg('Gagal menyimpan undangan: ' + (err && err.message ? err.message : err), true);
        }
    }

    async function revokeInvite(inviteId) {
        if (!Cloud.enabled || !Cloud.isAdmin() || !remote) return;
        try {
            await remote.revokeInvite(inviteId);
            teamMsg('Undangan dibatalkan.', false);
            await loadAdminTeam();
        } catch (err) {
            teamMsg('Gagal membatalkan undangan: ' + (err && err.message ? err.message : err), true);
        }
    }

    async function changeMemberRole(userId, newRole) {
        if (!Cloud.enabled || !Cloud.isAdmin() || !remote) return;
        try {
            const res = await remote.setMemberRole(userId, newRole);
            if (res && res.ok === false && res.reason === 'LAST_ADMIN') {
                teamMsg('Tidak dapat mengubah peran: minimal harus ada 1 Admin Sekolah.', true);
                return;
            }
            teamMsg('Peran anggota berhasil diperbarui.', false);
            await loadAdminTeam();
        } catch (err) {
            teamMsg('Gagal mengubah peran: ' + (err && err.message ? err.message : err), true);
        }
    }

    function removeMember(userId, email) {
        if (!Cloud.enabled || !Cloud.isAdmin() || !remote) return;
        showConfirm(`Keluarkan ${email} dari sekolah ini? Guru tersebut tidak akan bisa masuk lagi sampai diundang ulang.`, async () => {
            try {
                const res = await remote.removeMember(userId);
                if (res && res.ok === false) {
                    teamMsg('Tidak dapat mengeluarkan anggota ini (' + (res.reason || 'ditolak') + ').', true);
                    return;
                }
                teamMsg(`Akses ${email} telah dicabut.`, false);
                await loadAdminTeam();
            } catch (err) {
                teamMsg('Gagal mengeluarkan anggota: ' + (err && err.message ? err.message : err), true);
            }
        });
    }

    function sessionToken() { return remote && typeof remote.sessionToken === 'function' ? remote.sessionToken() : ''; }

    return {
        sessionToken,
        isCloudConfigured,
        boot,
        submitLogin,
        submitRegister,
        showLogin,
        showRegister,
        togglePassword,
        toggleUserMenu,
        closeUserMenu,
        openProfileModal,
        closeProfileModal,
        switchProfileMode,
        saveProfileBiodata,
        getInitials,
        changePassword,
        resetMemberPassword,
        retryGate,
        signOutFromGate,
        chooseDecision,
        logout,
        forceLogout,
        manualSync,
        getAccessToken,
        applyRoleVisibility,
        renderHeader,
        renderSyncBadge,
        renderSettingsExtras,
        loadAdminTeam,
        inviteTeacher,
        revokeInvite,
        changeMemberRole,
        removeMember
    };
})();