/**
 * Gerbang autentikasi, status Cloud, alur koneksi pertama / ganti akun, status sinkronisasi header,
 * pembatasan antarmuka berdasarkan peran (Admin vs Guru), dan manajemen undangan guru.
 *
 * Hanya aktif bila `APP_CONFIG.supabaseUrl` terisi. Tanpa itu, `Cloud.enabled === false` dan
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

    let remote = null;
    let unsubAuth = null;
    let unsubSync = null;
    let appInitialized = false;
    let bootingSession = false;
    let pendingDecision = null; // resolver Promise untuk konfirmasi ganti akun / unggah data lokal

    function isCloudConfigured() {
        return !!(typeof window !== 'undefined' && window.APP_CONFIG && String(window.APP_CONFIG.supabaseUrl || '').trim());
    }

    function showGatePanel(panelId) {
        const gate = $('authGate');
        if (!gate) return;
        gate.classList.remove('hidden');
        ['authPanelLoading', 'authPanelLogin', 'authPanelDenied', 'authPanelSwitch', 'authPanelFirstSync', 'authPanelError'].forEach(id => {
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
        if (el) el.innerText = txt || 'Menghubungkan ke server sekolah...';
    }

    function showGateError(message) {
        showGatePanel('authPanelError');
        const el = $('authErrorText');
        if (el) el.innerText = message || 'Gagal terhubung ke layanan sekolah.';
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

    async function boot() {
        Cloud.enabled = isCloudConfigured();
        if (!Cloud.enabled) return false;

        setLoadingText('Menyiapkan koneksi sekolah...');
        try {
            remote = await RemoteSupabase.init(window.APP_CONFIG);
        } catch (e) {
            showGateError(e && e.message ? e.message : String(e));
            return true;
        }

        if (unsubAuth) { unsubAuth(); unsubAuth = null; }
        if (typeof remote.onAuthStateChange === 'function') {
            unsubAuth = remote.onAuthStateChange((event, session) => {
                if (session && !Cloud.ready && !bootingSession) {
                    processAuthenticatedSession(session).catch(err => showGateError(err && err.message ? err.message : String(err)));
                } else if (event === 'SIGNED_OUT' && Cloud.ready) {
                    handleSignedOutState();
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
            showGatePanel('authPanelLogin');
            return true;
        }

        await processAuthenticatedSession(session);
        return true;
    }

    async function loginGoogle() {
        if (!remote) return;
        const btn = $('btnGoogleLogin');
        const errBox = $('authLoginError');
        if (errBox) { errBox.classList.add('hidden'); errBox.innerText = ''; }
        if (btn) { btn.disabled = true; btn.innerText = 'Mengarahkan ke Google...'; }
        try {
            await remote.signInWithGoogle();
            // Bila adaptor tiruan langsung mengisi sesi tanpa redirect halaman, lanjutkan otomatis:
            const session = await remote.getSession();
            if (session && !Cloud.ready && !bootingSession) {
                await processAuthenticatedSession(session);
            }
        } catch (e) {
            if (errBox) {
                errBox.innerText = (e && e.message) ? e.message : 'Gagal masuk dengan Google.';
                errBox.classList.remove('hidden');
            }
        } finally {
            if (btn) { btn.disabled = false; btn.innerText = 'Masuk dengan Google'; }
        }
    }

    async function retryGate() {
        if (!remote) { await boot(); return; }
        try {
            const session = await remote.getSession();
            if (!session) { showGatePanel('authPanelLogin'); return; }
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
        showGatePanel('authPanelLogin');
    }

    async function processAuthenticatedSession(session) {
        if (bootingSession) return;
        bootingSession = true;
        try {
            setLoadingText('Memeriksa keanggotaan sekolah...');
            const claim = await remote.claimInvite();
            if (!claim || !claim.ok) {
                const deniedEmail = (claim && claim.email) || (session.user && session.user.email) || '';
                const elEmail = $('authDeniedEmail');
                if (elEmail) elEmail.innerText = deniedEmail;
                showGatePanel('authPanelDenied');
                return;
            }

            Cloud.user = {
                id: claim.user_id || session.user.id,
                email: claim.email || session.user.email || '',
                name: claim.name || session.user.name || ''
            };
            Cloud.school = {
                id: claim.school_id,
                name: claim.school_name || ''
            };
            Cloud.role = claim.role === 'admin' ? 'admin' : 'teacher';

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
                        ? 'Ditemukan data lokal di browser ini. Sebagai Admin Sekolah, memilih "Unggah Data Lokal" akan mengunggah seluruh data sekolah (periode, kelas, peserta didik) serta perangkat ajar dan nilai Anda ke server sekolah.'
                        : 'Ditemukan data lokal di browser ini. Sebagai Guru Mata Pelajaran, memilih "Unggah Data Lokal" hanya akan mengunggah data milik guru (perangkat ajar, bank soal, absensi, nilai, jurnal, dll.), sedangkan daftar periode, kelas, dan siswa diambil dari server sekolah.';
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
    }

    function renderHeader() {
        const bar = $('cloudHeaderBar');
        if (!bar) return;
        bar.classList.toggle('hidden', !(Cloud.enabled && Cloud.ready));
        if (!Cloud.enabled || !Cloud.ready) return;
        const roleBadge = $('cloudRoleBadge');
        if (roleBadge) {
            roleBadge.innerText = Cloud.isAdmin() ? 'Admin Sekolah' : 'Guru Mapel';
            roleBadge.className = 'text-[10px] font-bold px-2.5 py-1 rounded-full border ' + (Cloud.isAdmin()
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
            teamMsg(`Undangan untuk ${email} (${roleVal === 'admin' ? 'Admin' : 'Guru'}) berhasil disimpan. Guru dapat langsung masuk menggunakan akun Google tersebut.`, false);
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

    return {
        isCloudConfigured,
        boot,
        loginGoogle,
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
