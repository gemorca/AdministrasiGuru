// js/modules/backup.js
// Dipecah dari sistem_administrasi_guru.html (Tahap 0). Skrip klasik: fungsi bersifat global.
        function backupJSON() {
            let data = {
                appName: "Sistem Administrasi Guru",
                backupVersion: "19.0",
                createdAt: new Date().toISOString(),
                settings: { ...settings, ai: undefined }, periods, classes,
                students: allStudents, meetings: allMeetings, attendance: allAttendance,
                assessments: allAssessments, scores: allScores, followUps: allFollowUps,
                cp: allCP, tp: allTP, materials: allMaterials, questions: allQuestions, assessmentPkgs: allAssessmentPkgs,
                raporDescriptions: allRaporDescriptions, schedules: allSchedules, journals: allJournals,
                p5Projects: allP5Projects, // TAHAP 18
                assignments: allAssignments, // TAHAP 18
                submissions: allSubmissions, // TAHAP 18
                guardians: allGuardians, // TAHAP 19
                communications: allCommunications, // TAHAP 19
                documents: allDocuments, // TAHAP 20
                dailyTests: allDailyTests, dailyScores: allDailyScores
            };
            let blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
            let link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = `Backup_AdminGuru_Tahap19_${new Date().toISOString().split('T')[0]}.json`;
            link.click();
        }

        function restoreJSON() {
            let file = document.getElementById('fileRestore').files[0];
            if (!file) { showModal("Perhatian", "Pilih file backup terlebih dahulu!", "⚠️"); return; }
            let reader = new FileReader();
            reader.onload = function(evt) {
                try {
                    let d = JSON.parse(evt.target.result);
                    if (!d.appName || !d.settings) throw new Error("Format invalid.");
                    showConfirm("Restore data akan menimpa data saat ini. Lanjutkan?", () => {
                        settings = { ...DEFAULT_SETTINGS, ...(d.settings || {}), ai: settings.ai };
                        periods = d.periods || periods;
                        classes = d.classes || classes;
                        allStudents = d.students || [];
                        allMeetings = d.meetings || [];
                        allAttendance = d.attendance || [];
                        allAssessments = d.assessments || [];
                        allScores = d.scores || [];
                        allFollowUps = d.followUps || [];
                        allCP = d.cp || [];
                        allTP = d.tp || [];
                        allMaterials = d.materials || [];
                        allQuestions = d.questions || [];
                        allAssessmentPkgs = d.assessmentPkgs || [];
                        allRaporDescriptions = d.raporDescriptions || [];
                        allSchedules = d.schedules || [];
                        allJournals = d.journals || [];
                        allP5Projects = d.p5Projects || []; // Tahap 18
                        allAssignments = d.assignments || []; // Tahap 18
                        allSubmissions = d.submissions || []; // Tahap 18
                        allGuardians = d.guardians || []; // Tahap 19
                        allCommunications = d.communications || []; // Tahap 19
                        allDocuments = d.documents || []; // Tahap 20
                        allDailyTests = d.dailyTests || [];
                        allDailyScores = d.dailyScores || [];
                        saveAllData();
                        loadActiveContextData();
                        updateHeader();
                        switchView('dashboard');
                        showModal("Sukses", "Data berhasil dipulihkan secara penuh!", "✅");
                    });
                } catch(e) { showModal("Gagal", "File backup tidak valid.", "❌"); }
            };
            reader.readAsText(file);
        }

