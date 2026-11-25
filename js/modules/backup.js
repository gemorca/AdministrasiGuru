// js/modules/backup.js
// Backup v2 (Tahap 6). Logika murni ada di js/domain/backup.js; berkas ini hanya menghubungkan ke layar dan data aktif.
        function backupTables() {
            return {
                periods, classes, students: allStudents, meetings: allMeetings, attendance: allAttendance,
                assessments: allAssessments, scores: allScores, followUps: allFollowUps, cp: allCP, tp: allTP,
                materials: allMaterials, questions: allQuestions, assessmentPkgs: allAssessmentPkgs,
                raporDescriptions: allRaporDescriptions, schedules: allSchedules, journals: allJournals,
                p5Projects: allP5Projects, assignments: allAssignments, submissions: allSubmissions,
                guardians: allGuardians, communications: allCommunications, documents: allDocuments,
                dailyTests: allDailyTests, dailyScores: allDailyScores
            };
        }

        function applyBackupTables(t) {
            periods = t.periods; classes = t.classes; allStudents = t.students; allMeetings = t.meetings;
            allAttendance = t.attendance; allAssessments = t.assessments; allScores = t.scores; allFollowUps = t.followUps;
            allCP = t.cp; allTP = t.tp; allMaterials = t.materials; allQuestions = t.questions; allAssessmentPkgs = t.assessmentPkgs;
            allRaporDescriptions = t.raporDescriptions; allSchedules = t.schedules; allJournals = t.journals;
            allP5Projects = t.p5Projects; allAssignments = t.assignments; allSubmissions = t.submissions;
            allGuardians = t.guardians; allCommunications = t.communications; allDocuments = t.documents;
            allDailyTests = t.dailyTests; allDailyScores = t.dailyScores;
        }

        function backupHasData() {
            return [allScores, allAttendance, allAssessments, allMaterials, allQuestions, allJournals, allDailyScores, allCommunications, allDocuments].some(a => a.length > 0);
        }

        /** Tampilkan atau sembunyikan pengingat backup (semua elemen .backup-reminder). */
        function renderBackupReminder() {
            let d = Backup.due(settings.lastBackupAt, new Date(), backupHasData());
            let msg = d.days === null ? 'Data Anda belum pernah di-backup. Unduh backup sekarang agar data aman.'
                : `Backup terakhir ${d.days} hari lalu. Disarankan backup tiap ${Backup.REMIND_DAYS} hari.`;
            document.querySelectorAll('.backup-reminder').forEach(el => {
                el.classList.toggle('hidden', !d.due);
                let t = el.querySelector('[data-reminder-text]'); if (t) t.innerText = msg;
            });
        }

        function backupJSON(auto) {
            let now = new Date();
            let data = Backup.build({ settings, tables: backupTables(), now });
            let blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
            let link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = `Backup_AdminGuru_v2_${now.toISOString().split('T')[0]}${auto === true ? '_sebelum-restore' : ''}.json`;
            link.click();
            settings.lastBackupAt = now.toISOString();
            Store.write('g_set', settings);
            renderBackupReminder();
        }

        function restoreJSON() {
            let file = document.getElementById('fileRestore').files[0];
            if (!file) { showModal("Perhatian", "Pilih file backup terlebih dahulu!", "⚠️"); return; }
            let mode = (document.getElementById('restoreMode') || {}).value === 'timpa' ? 'timpa' : 'gabung';
            let reader = new FileReader();
            reader.onload = function (evt) {
                let r = Backup.parse(String(evt.target.result));
                if (!r.ok) { showModal("Gagal", "File backup tidak dapat dipulihkan: " + r.problems.slice(0, 4).join(' '), "❌"); return; }
                let incoming = Backup.tablesOf(r.data);
                let total = Object.values(r.counts).reduce((a, b) => a + b, 0);
                let info = `Berkas: skema ${r.schemaVersion}${r.legacy ? ' (backup lama)' : ''}, ${total} record.`;
                let ask = mode === 'timpa'
                    ? `${info} Mode TIMPA: seluruh data saat ini diganti isi berkas. Salinan data saat ini diunduh otomatis lebih dulu. Lanjutkan?`
                    : `${info} Mode GABUNG: record baru ditambahkan; record yang sama diganti hanya bila di berkas lebih baru. Data saat ini tidak dihapus. Lanjutkan?`;
                showConfirm(ask, () => {
                    let note = '';
                    if (mode === 'timpa') {
                        backupJSON(true);
                        let keep = backupTables();
                        if (!incoming.periods.length) incoming.periods = keep.periods;
                        if (!incoming.classes.length) incoming.classes = keep.classes;
                        applyBackupTables(incoming);
                        let lastBackupAt = settings.lastBackupAt;
                        settings = { ...DEFAULT_SETTINGS, ...(r.data.settings || {}), ai: settings.ai, lastBackupAt };
                        note = `${total} record dipulihkan (timpa).`;
                    } else {
                        let m = Backup.merge(backupTables(), incoming);
                        applyBackupTables(m.tables);
                        periods.forEach(p => { p.isActive = p.id === activePeriodId; });
                        note = `Gabung selesai: ${m.stats.added} ditambah, ${m.stats.updated} diperbarui, ${m.stats.kept} tidak berubah.`;
                    }
                    if (!periods.some(p => p.id === activePeriodId)) { let a = periods.find(p => p.isActive) || periods[0]; activePeriodId = a.id; a.isActive = true; }
                    if (!classes.some(c => c.classId === activeClassId)) { let c = classes.find(x => x.periodId === activePeriodId) || classes[0]; activeClassId = c.classId; }
                    saveAllData();
                    loadActiveContextData();
                    updateHeader();
                    switchView('dashboard');
                    let orphans = Integrity.audit();
                    if (orphans.length) note += ' Peringatan data yatim: ' + orphans.map(o => `${o.label} (${o.n})`).join(', ') + '.';
                    if (r.warnings.length) note += ' ' + r.warnings.join(' ');
                    showModal("Sukses", note, orphans.length ? "⚠️" : "✅");
                });
            };
            reader.readAsText(file);
        }
