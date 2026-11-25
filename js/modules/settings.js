// js/modules/settings.js
// Dipecah dari sistem_administrasi_guru.html (Tahap 0). Skrip klasik: fungsi bersifat global.
        function renderSettings() {
            let sSch = document.getElementById('setSchool');
            if(sSch) sSch.value = settings.school || '';
            let sSub = document.getElementById('setSubject');
            if(sSub) sSub.value = settings.subject || '';
            
            let sAcy = document.getElementById('setAcademicYear');
            if(sAcy) sAcy.value = settings.academicYear || '';
            let sSem = document.getElementById('setSemester');
            if(sSem) sSem.value = settings.semester || 'GENAP';
            
            let sTea = document.getElementById('setTeacher');
            if(sTea) sTea.value = settings.teacher || '';
            let sNipTea = document.getElementById('setNipTeacher');
            if(sNipTea) sNipTea.value = settings.nipTeacher || '';
            
            let sPri = document.getElementById('setPrincipal');
            if(sPri) sPri.value = settings.principal || '';
            let sNipPri = document.getElementById('setNipPrincipal');
            if(sNipPri) sNipPri.value = settings.nipPrincipal || '';
            renderGradingSettings();
            if (typeof AIUI !== 'undefined') AIUI.render();
        }

        // ---------- Pengaturan penilaian ----------
        const GRADING_FIELDS = {
            kktp: 'setKktp', wForm: 'setWForm', wSum: 'setWSum', wUts: 'setWUts', wUas: 'setWUas',
            attMin: 'setAttMin', predA: 'setPredA', predB: 'setPredB', predC: 'setPredC'
        };

        function renderGradingSettings() {
            let c = Grading.config(settings);
            for (const [k, id] of Object.entries(GRADING_FIELDS)) { let el = document.getElementById(id); if (el) el.value = c[k]; }
            let set = (id, v) => { let el = document.getElementById(id); if (el) el.value = v; };
            let chk = (id, v) => { let el = document.getElementById(id); if (el) el.checked = !!v; };
            set('setMissingPolicy', c.missingPolicy);
            set('setRemedialMode', c.remedialMode);
            chk('setAttPenalty', c.attPenalty);
            chk('setAttRequired', c.attRequiredToPass);
            let box = document.getElementById('gradingErrors'); if (box) { box.classList.add('hidden'); box.innerText = ''; }
            updateWeightTotal();
        }

        function updateWeightTotal() {
            let ids = ['setWForm', 'setWSum', 'setWUts', 'setWUas'];
            let total = ids.reduce((t, id) => t + (parseFloat(String(document.getElementById(id)?.value || '0').replace(',', '.')) || 0), 0);
            let el = document.getElementById('setWeightTotal');
            if (el) {
                el.innerText = 'Total bobot: ' + Math.round(total * 100) / 100 + '%';
                el.className = 'text-xs font-bold ' + (Math.abs(total - 100) < 1e-9 ? 'text-emerald-600' : 'text-red-600');
            }
        }

        function saveGradingSettings() {
            let n = id => { let v = String(document.getElementById(id).value).trim().replace(',', '.'); return v === '' ? NaN : Number(v); };
            let cand = {
                kktp: n('setKktp'), wForm: n('setWForm'), wSum: n('setWSum'), wUts: n('setWUts'), wUas: n('setWUas'),
                attMin: n('setAttMin'), predA: n('setPredA'), predB: n('setPredB'), predC: n('setPredC'),
                missingPolicy: document.getElementById('setMissingPolicy').value,
                remedialMode: document.getElementById('setRemedialMode').value,
                attPenalty: document.getElementById('setAttPenalty').checked,
                attRequiredToPass: document.getElementById('setAttRequired').checked
            };
            let errs = Grading.validate(cand);
            let box = document.getElementById('gradingErrors');
            if (errs.length) {
                box.innerText = errs.join(' ');
                box.classList.remove('hidden');
                return;
            }
            box.classList.add('hidden');
            Object.assign(settings, cand);
            saveAllData();
            updateHeader();
            showModal('Sukses', 'Pengaturan penilaian disimpan. Nilai akhir seluruh siswa dihitung ulang dengan aturan ini.', '✅');
        }

        function saveSchoolSettings() {
            settings.school = document.getElementById('setSchool').value;
            settings.subject = document.getElementById('setSubject').value;
            
            let sAcy = document.getElementById('setAcademicYear');
            if(sAcy) settings.academicYear = sAcy.value;
            let sSem = document.getElementById('setSemester');
            if(sSem) settings.semester = sSem.value;
            
            // Sinkronisasi dengan Data Periode Aktif agar UI Header & Sidebar otomatis berubah
            let activePeriod = periods.find(p => p.id === activePeriodId);
            if (activePeriod) {
                activePeriod.year = settings.academicYear;
                activePeriod.semester = settings.semester;
            }
            
            settings.teacher = document.getElementById('setTeacher').value;
            let sNipTea = document.getElementById('setNipTeacher');
            if(sNipTea) settings.nipTeacher = sNipTea.value;
            
            settings.principal = document.getElementById('setPrincipal').value;
            let sNipPri = document.getElementById('setNipPrincipal');
            if(sNipPri) settings.nipPrincipal = sNipPri.value;

            saveAllData();
            updateHeader();
            showModal("Sukses", "Pengaturan sekolah dan periode berhasil disimpan.", "✅");
        }
