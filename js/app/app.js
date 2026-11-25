// js/app/app.js
// Dipecah dari sistem_administrasi_guru.html (Tahap 0). Skrip klasik: fungsi bersifat global.
        function initApp() {
            Store.migrate();
            settings = { ...DEFAULT_SETTINGS, ...Store.read('g_set', {}) };
            settings.ai = { ...DEFAULT_SETTINGS.ai, ...(settings.ai || {}) };
            periods = Store.read('g_per', []);

            if (periods.length === 0) {
                activePeriodId = 'PER-2026-2027-GENAP';
                periods.push({ id: activePeriodId, year: '2026/2027', semester: 'GENAP', isActive: true });
                Store.write('g_per', periods);
            } else {
                let active = periods.find(p => p.isActive) || periods[0];
                activePeriodId = active.id;
                active.isActive = true;
            }

            classes = Store.read('g_cls', []);
            if (classes.length === 0) {
                classes.push({ classId: 'CLS-VII1', periodId: activePeriodId, className: 'VII.1', gradeLevel: 'VII', phase: 'D', status: 'active' });
                classes.push({ classId: 'CLS-VII2', periodId: activePeriodId, className: 'VII.2', gradeLevel: 'VII', phase: 'D', status: 'active' });
                Store.write('g_cls', classes);
            }

            activeClassId = classes[0].classId;

            allStudents = Store.read('g_stu', []);
            allMeetings = Store.read('g_mtg', []);
            allAttendance = Store.read('g_att', []);
            allAssessments = Store.read('g_ass', []);
            allScores = Store.read('g_scr', []);
            allFollowUps = Store.read('g_fol', []);
            allCP = Store.read('g_cp', []);
            allTP = Store.read('g_tp', []);
            allMaterials = Store.read('g_mat', []);
            allQuestions = Store.read('g_qst', []);
            allAssessmentPkgs = Store.read('g_pkg', []);
            allRaporDescriptions = Store.read('g_rdesc', []);
            allSchedules = Store.read('g_sch', []);
            allJournals = Store.read('g_jour', []);
            allP5Projects = Store.read('g_p5_proj', []); // Tahap 18
            allAssignments = Store.read('g_assign', []);
            allSubmissions = Store.read('g_submit', []);
            allGuardians = Store.read('g_guardians', []); // Tahap 19
            allCommunications = Store.read('g_communications', []); // Tahap 19
            allDocuments = Store.read('g_docs', []); // Tahap 20
            allDailyTests = Store.read('g_dt', []);
            allDailyScores = Store.read('g_dts', []);

            if (allStudents.length === 0) {
                allStudents.push({ id: 'STU-1', periodId: activePeriodId, classId: activeClassId, nis: '1001', name: 'Ahmad Fauzan', gender: 'L', class: 'VII.1' });
                allStudents.push({ id: 'STU-2', periodId: activePeriodId, classId: activeClassId, nis: '1002', name: 'Siti Aminah', gender: 'P', class: 'VII.1' });
                Store.write('g_stu', allStudents);
            }

            loadActiveContextData();
            buildNav();
            updateHeader();
            switchView('dashboard');
        }

        function loadActiveContextData() {
            students = allStudents.filter(s => s.periodId === activePeriodId && (!s.classId || s.classId === activeClassId));
            meetings = allMeetings.filter(m => m.periodId === activePeriodId && (!m.classId || m.classId === activeClassId));
            let mIds = meetings.map(m => m.id);
            attendance = allAttendance.filter(a => a.periodId === activePeriodId && (mIds.includes(a.meetingId) || !a.meetingId));
            assessments = allAssessments.filter(a => a.periodId === activePeriodId && (!a.classId || a.classId === activeClassId));
            let aIds = assessments.map(a => a.id);
            scores = allScores.filter(s => s.periodId === activePeriodId && (aIds.includes(s.assessmentId) || !s.assessmentId));
            followUps = allFollowUps.filter(f => f.periodId === activePeriodId && (!f.classId || f.classId === activeClassId));

            cpList = allCP.filter(c => c.periodId === activePeriodId);
            tpList = allTP.filter(t => t.periodId === activePeriodId);
            materialList = allMaterials.filter(m => m.periodId === activePeriodId);
            questionList = allQuestions.filter(q => q.periodId === activePeriodId);
            schedules = allSchedules.filter(s => s.periodId === activePeriodId);
            journals = allJournals.filter(j => j.periodId === activePeriodId && (!j.classId || j.classId === activeClassId));
            p5List = allP5Projects.filter(p => p.periodId === activePeriodId); // Tahap 18
            assignments = allAssignments.filter(a => a.periodId === activePeriodId && (!a.classId || a.classId === activeClassId));
            let assignIds = assignments.map(a => a.id);
            submissions = allSubmissions.filter(sub => assignIds.includes(sub.assignmentId));
            
            guardians = allGuardians.filter(g => g.periodId === activePeriodId);
            communications = allCommunications.filter(c => c.periodId === activePeriodId && (!c.classId || c.classId === activeClassId));
            docList = allDocuments.filter(d => d.periodId === activePeriodId && (!d.classId || d.classId === activeClassId)); // Tahap 20
            
            dailyTests = allDailyTests.filter(d => d.periodId === activePeriodId && (!d.classId || d.classId === activeClassId));
            let dtIds = dailyTests.map(d => d.id);
            dailyScores = allDailyScores.filter(s => dtIds.includes(s.testId));
        }

        function saveAllData() {
            Store.write('g_set', settings);
            Store.write('g_per', periods);
            Store.write('g_cls', classes);
            Store.write('g_stu', allStudents);
            Store.write('g_mtg', allMeetings);
            Store.write('g_att', allAttendance);
            Store.write('g_ass', allAssessments);
            Store.write('g_scr', allScores);
            Store.write('g_fol', allFollowUps);
            Store.write('g_cp', allCP);
            Store.write('g_tp', allTP);
            Store.write('g_mat', allMaterials);
            Store.write('g_qst', allQuestions);
            Store.write('g_pkg', allAssessmentPkgs);
            Store.write('g_rdesc', allRaporDescriptions);
            Store.write('g_sch', allSchedules);
            Store.write('g_jour', allJournals);
            Store.write('g_p5_proj', allP5Projects); // Tahap 18
            Store.write('g_assign', allAssignments); // Tahap 18
            Store.write('g_submit', allSubmissions); // Tahap 18
            Store.write('g_guardians', allGuardians); // Tahap 19
            Store.write('g_communications', allCommunications); // Tahap 19
            Store.write('g_docs', allDocuments); // Tahap 20
            Store.write('g_dt', allDailyTests);
            Store.write('g_dts', allDailyScores);
        }

        function buildNav() {
            const menu = [
                { id: 'dashboard', icon: '📊', text: 'Dashboard' },
                { id: 'students', icon: '👨‍🎓', text: 'Data Peserta Didik' },
                { id: 'classes', icon: '🏫', text: 'Kelas & Rombel' },
                { id: 'schedule', icon: '📅', text: 'Jadwal Mengajar' },
                { id: 'curriculum', icon: '📚', text: 'Data Kurikulum' },
                { id: 'analisis-cp', icon: '🪄', text: 'Analisis CP (AI)' },
                { id: 'generator', icon: '🤖', text: 'Generator Modul Ajar' },
                { id: 'bank-soal', icon: '🏦', text: 'Bank Soal & Asesmen' },
                { id: 'p5', icon: '🎯', text: 'Proyek Profil (P5)' },
                { id: 'assignments', icon: '📚', text: 'Tugas & LKPD' },
                { id: 'attendance', icon: '📋', text: 'Absensi & Jurnal' },
                { id: 'recap-attendance', icon: '📅', text: 'Rekap Kehadiran' },
                { id: 'scores', icon: '📝', text: 'Daftar Nilai' },
                { id: 'daily-analysis', icon: '📊', text: 'Analisis Ulangan' },
                { id: 'remedial', icon: '🔄', text: 'Remedial & Pengayaan' },
                { id: 'portfolio', icon: '📁', text: 'Portofolio Karya' },
                { id: 'hasbi-rapor', icon: '📄', text: 'Analisis & Rapor' },
                { id: 'jurnal-refleksi', icon: '📝', text: 'Jurnal & Refleksi' },
                { id: 'communication', icon: '👨‍👩‍👧', text: 'Komunikasi & Wali' },
                { id: 'documents', icon: '✉️', text: 'Surat & Dokumen' },
                { id: 'reports', icon: '🖨️', text: 'Pusat Laporan' },
                { id: 'backup', icon: '💾', text: 'Backup & Restore' },
                { id: 'settings', icon: '⚙️', text: 'Pengaturan' }
            ];
            let nav = document.getElementById('navMenu');
            if (nav) {
                nav.innerHTML = menu.map(m => `
                    <button onclick="switchView('${m.id}')" class="nav-btn w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-left text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition-colors" data-target="view-${m.id}">
                        <span class="text-base">${m.icon}</span> ${esc(m.text)}
                    </button>
                `).join('');
            }
        }

        function updateHeader() {
            let elSchool = document.getElementById('headerSchool');
            if (elSchool) elSchool.innerText = settings.school;
            let elInfo = document.getElementById('headerInfo');
            if (elInfo) elInfo.innerText = `${settings.subject} | Fase ${settings.fase} | KKTP: ${settings.kktp}`;
            let elTeacher = document.getElementById('headerTeacher');
            if (elTeacher) elTeacher.innerText = settings.teacher;
            
            let active = periods.find(p => p.id === activePeriodId);
            let pName = active ? `${active.year} - ${active.semester}` : '-';
            let elPer = document.getElementById('headerActivePeriod');
            if (elPer) elPer.innerText = pName;
            let elSidePer = document.getElementById('sidePeriodName');
            if (elSidePer) elSidePer.innerText = pName;

            let sel = document.getElementById('globalClassSelector');
            if (sel) {
                sel.innerHTML = classes.map(c => `<option value="${c.classId}" ${c.classId === activeClassId ? 'selected' : ''}>Kelas ${esc(c.className)}</option>`).join('');
            }
        }

        function changeGlobalClass(cId) {
            activeClassId = cId;
            loadActiveContextData();
            updateHeader();
            let activeSec = document.querySelector('.view-section.active');
            if (activeSec) {
                let id = activeSec.id.replace('view-', '');
                switchView(id);
            }
        }

        function switchView(viewId) {
            document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active', 'active-print'));
            document.querySelectorAll('.nav-btn').forEach(btn => {
                btn.classList.remove('bg-blue-600', 'text-white', 'shadow-md');
                btn.classList.add('text-slate-300');
            });
            const target = document.getElementById(`view-${viewId}`);
            if (target) target.classList.add('active', 'active-print');
            const btn = document.querySelector(`.nav-btn[data-target="view-${viewId}"]`);
            if (btn) {
                btn.classList.remove('text-slate-300');
                btn.classList.add('bg-blue-600', 'text-white', 'shadow-md');
            }

            if (viewId === 'dashboard') renderDashboard();
            if (viewId === 'students') renderStudents();
            if (viewId === 'classes') renderClasses();
            if (viewId === 'schedule') renderSchedule();
            if (viewId === 'curriculum') renderCurriculum();
            if (viewId === 'p5') renderP5(); // TAHAP 18
            if (viewId === 'assignments') renderAssignments(); // TAHAP 18
            if (viewId === 'communication') { // TAHAP 19
                renderGuardians();
                renderCommunications();
                let pSel = document.getElementById('progStudentSelect');
                if (pSel) {
                    pSel.innerHTML = students.map(s => `<option value="${s.id}">${esc(s.name)} (${esc(s.nis)})</option>`).join('');
                    if (students.length > 0) renderStudentProgress(students[0].id);
                }
            }
            if (viewId === 'generator') renderGeneratorTab();
            if (viewId === 'bank-soal') renderBankSoal();
            if (viewId === 'attendance') { renderAttInput(); renderMtgHistory(); }
            if (viewId === 'recap-attendance') renderRecapAtt();
            if (viewId === 'scores') renderRecapScores();
            if (viewId === 'daily-analysis') renderDailyTestList();
            if (viewId === 'remedial') renderAnalysis('Remedial');
            if (viewId === 'portfolio') renderPortfolio();
            if (viewId === 'hasbi-rapor') initRaporModule();
            if (viewId === 'jurnal-refleksi') renderJournals();
            if (viewId === 'documents') renderDocuments(); // TAHAP 20
            if (viewId === 'settings') renderSettings();
        }
