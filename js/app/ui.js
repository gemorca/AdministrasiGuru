// js/app/ui.js
// Dipecah dari sistem_administrasi_guru.html (Tahap 0). Skrip klasik: fungsi bersifat global.
        function showModal(title, message, icon = "") {
            let elTitle = document.getElementById('modalTitle');
            if(elTitle) elTitle.innerText = title;
            let elMsg = document.getElementById('modalMessage');
            if(elMsg) elMsg.innerText = message;
            let elIcon = document.getElementById('modalIcon');
            if(elIcon) {
                elIcon.innerText = '';
                elIcon.classList.add('hidden');
            }
            
            let modal = document.getElementById('customModal');
            if(modal) modal.classList.remove('hidden');
        }

        function closeModal() {
            let modal = document.getElementById('customModal');
            if(modal) modal.classList.add('hidden');
        }

        let confirmAction = null;
        function showConfirm(message, action, opts = {}) {
            let elTitle = document.getElementById('confirmTitle');
            if (elTitle) elTitle.innerText = (opts && opts.title) ? opts.title : 'Konfirmasi Tindakan';
            let elMsg = document.getElementById('confirmMessage');
            if(elMsg) elMsg.innerText = message;
            let btnOk = document.getElementById('btnConfirmOk');
            if (btnOk) btnOk.innerText = (opts && opts.confirmText) ? opts.confirmText : 'Ya, Lanjutkan';
            let btnCancel = document.getElementById('btnConfirmCancel');
            if (btnCancel) btnCancel.innerText = (opts && opts.cancelText) ? opts.cancelText : 'Batal';
            confirmAction = action;
            let modal = document.getElementById('modalConfirm');
            if(modal) modal.classList.remove('hidden');
        }
        
        function closeConfirm() {
            let modal = document.getElementById('modalConfirm');
            if(modal) modal.classList.add('hidden');
            confirmAction = null;
        }
        
        function executeConfirm() {
            if (typeof confirmAction === 'function') {
                confirmAction();
            }
            closeConfirm();
        }

        // ---------- Sidebar responsif (drawer di mobile) ----------
        function isMobileLayout() { return window.matchMedia('(max-width: 767px)').matches; }
        function openSidebar() {
            const s = document.getElementById('sidebar'), o = document.getElementById('sidebarOverlay');
            if (!s) return;
            if (isMobileLayout()) {
                s.classList.add('open');
                if (o) o.classList.add('open');
                document.body.classList.add('sidebar-open');
            }
        }
        function closeSidebar() {
            const s = document.getElementById('sidebar'), o = document.getElementById('sidebarOverlay');
            if (s) s.classList.remove('open');
            if (o) o.classList.remove('open');
            document.body.classList.remove('sidebar-open');
        }
        function toggleSidebar() {
            const s = document.getElementById('sidebar');
            if (s && s.classList.contains('open')) closeSidebar(); else openSidebar();
        }
        document.addEventListener('click', e => {
            if (e.target.closest && e.target.closest('#navMenu button, #navMenu a')) closeSidebar();
        });
        document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSidebar(); });
        window.addEventListener('resize', () => { if (!isMobileLayout()) closeSidebar(); });
