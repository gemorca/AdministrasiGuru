// js/app/ui.js
// Dipecah dari sistem_administrasi_guru.html (Tahap 0). Skrip klasik: fungsi bersifat global.
        function showModal(title, message, icon = "ℹ️") {
            let elTitle = document.getElementById('modalTitle');
            if(elTitle) elTitle.innerText = title;
            let elMsg = document.getElementById('modalMessage');
            if(elMsg) elMsg.innerText = message;
            let elIcon = document.getElementById('modalIcon');
            if(elIcon) elIcon.innerText = icon;
            
            let modal = document.getElementById('customModal');
            if(modal) modal.classList.remove('hidden');
        }

        function closeModal() {
            let modal = document.getElementById('customModal');
            if(modal) modal.classList.add('hidden');
        }

        let confirmAction = null;
        function showConfirm(message, action) {
            let elMsg = document.getElementById('confirmMessage');
            if(elMsg) elMsg.innerText = message;
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

