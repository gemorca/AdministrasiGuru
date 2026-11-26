// js/app/app.js
// Dipecah dari sistem_administrasi_guru.html (Tahap 0). Skrip klasik: fungsi bersifat global.
        function initApp() {
            const isCloud = typeof Cloud !== 'undefined' && Cloud.enabled;
            Store.migrate();
            settings = { ...DEFAULT_SETTINGS, ...Store.read('g_set', {}) };
            settings.ai = { ...DEFAULT_SETTINGS.ai, ...(settings.ai || {}) };
            periods = Store.read('g_per', []);

            if (periods.length === 0) {
                activePeriodId = 'PER-2026-2027-GENAP';
                const initPer = { id: activePeriodId, year: '2026/2027', semester: 'GENAP', isActive: true };
                if (isCloud && Cloud.school && Cloud.school.name) initPer.school = Cloud.school.name;
                periods.push(initPer);
                if (!isCloud || Cloud.isAdmin()) {
                    Store.write('g_per', periods);
                }
            } else {
                let active = periods.find(p => p.isActive) || periods[0];
                activePeriodId = active.id;
                active.isActive = true;
            }

            syncSchoolFieldsFromPeriod();

            classes = Store.read('g_cls', []);
            if (classes.length === 0) {
                if (!isCloud) {
                    classes.push({ classId: 'CLS-VII1', periodId: activePeriodId, className: 'VII.1', gradeLevel: 'VII', phase: 'D', status: 'active' });
                    classes.push({ classId: 'CLS-VII2', periodId: activePeriodId, className: 'VII.2', gradeLevel: 'VII', phase: 'D', status: 'active' });
                    Store.write('g_cls', classes);
                } else if (Cloud.isAdmin()) {
                    classes.push({ classId: 'CLS-VII1', periodId: activePeriodId, className: 'VII.1', gradeLevel: 'VII', phase: 'D', status: 'active' });
                    Store.write('g_cls', classes);
                }
            }

            activeClassId = classes[0] ? classes[0].classId : null;

            readAllCollectionsFromStore();

            // Mode lokal memakai 2 siswa contoh bila kosong; mode cloud TIDAK membuat siswa contoh.
            if (!isCloud && allStudents.length === 0 && activeClassId) {
                allStudents.push({ id: 'STU-1', periodId: activePeriodId, classId: activeClassId, nis: '1001', name: 'Ahmad Fauzan', gender: 'L', class: 'VII.1' });
                allStudents.push({ id: 'STU-2', periodId: activePeriodId, classId: activeClassId, nis: '1002', name: 'Siti Aminah', gender: 'P', class: 'VII.1' });
                Store.write('g_stu', allStudents);
            }

            if (isCloud && Cloud.user && Cloud.user.name && settings.teacher === DEFAULT_SETTINGS.teacher) {
                settings.teacher = Cloud.user.name;
            }

            loadActiveContextData();
            buildNav();
            updateHeader();
            switchView('dashboard');
        }

        function syncSchoolFieldsFromPeriod() {
            if (typeof Cloud === 'undefined' || !Cloud.enabled) return;
            const active = periods.find(p => p.id === activePeriodId) || periods[0];
            if (active) {
                if (active.year) settings.academicYear = active.year;
                if (active.semester) settings.semester = active.semester;
                if (active.school) settings.school = active.school;
                else if (Cloud.school && Cloud.school.name) settings.school = Cloud.school.name;
                if (active.principal) settings.principal = active.principal;
                if (active.nipPrincipal) settings.nipPrincipal = active.nipPrincipal;
            } else if (Cloud.school && Cloud.school.name) {
                settings.school = Cloud.school.name;
            }
        }

        function readAllCollectionsFromStore() {
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
        }

        function reloadStateFromStore(opts = {}) {
            settings = { ...DEFAULT_SETTINGS, ...Store.read('g_set', {}) };
            settings.ai = { ...DEFAULT_SETTINGS.ai, ...(settings.ai || {}) };
            const pulledPeriods = Store.read('g_per', []);
            if (pulledPeriods.length > 0) {
                periods = pulledPeriods;
                if (!periods.some(p => p.id === activePeriodId)) {
                    const active = periods.find(p => p.isActive) || periods[0];
                    activePeriodId = active.id;
                }
            }
            syncSchoolFieldsFromPeriod();
            classes = Store.read('g_cls', []);
            if (!classes.some(c => c.classId === activeClassId)) {
                activeClassId = classes[0] ? classes[0].classId : null;
            }
            readAllCollectionsFromStore();
            loadActiveContextData();
            updateHeader();
            const anyModalOpen = opts.preserveOpenModal && Array.from(document.querySelectorAll('[id^="modal"]')).some(m => !m.classList.contains('hidden'));
            if (!anyModalOpen) {
                const activeSec = document.querySelector('.view-section.active');
                if (activeSec) switchView(activeSec.id.replace('view-', ''));
            }
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
            const isCloud = typeof Cloud !== 'undefined' && Cloud.enabled;
            Store.write('g_set', settings);
            if (!isCloud || Cloud.isAdmin()) {
                Store.write('g_per', periods);
                Store.write('g_cls', classes);
                Store.write('g_stu', allStudents);
            }
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
            const ic = d => `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
            const groups = [
                {
                    label: 'Utama & Kelas',
                    items: [
                        { id: 'dashboard', svg: ic('<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>'), text: 'Dashboard' },
                        { id: 'students', svg: ic('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'), text: 'Data Peserta Didik' },
                        { id: 'classes', svg: ic('<path d="M3 9l9-6 9 6v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>'), text: 'Kelas & Rombel' },
                        { id: 'schedule', svg: ic('<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>'), text: 'Jadwal Mengajar' }
                    ]
                },
                {
                    label: 'Perangkat & Kurikulum',
                    items: [
                        { id: 'curriculum', svg: ic('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>'), text: 'Data Kurikulum' },
                        { id: 'analisis-cp', svg: ic('<path d="M12 3l1.9 5.8L20 10.7l-4.7 3.7 1.7 5.6L12 16.7 7 20l1.7-5.6L4 10.7l6.1-1.9z"/>'), text: 'Analisis CP' },
                        { id: 'generator', svg: ic('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/>'), text: 'Generator Modul Ajar' },
                        { id: 'bank-soal', svg: ic('<circle cx="12" cy="12" r="9"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>'), text: 'Bank Soal & Asesmen' },
                        { id: 'p5', svg: ic('<circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>'), text: 'Proyek Profil (P5)' }
                    ]
                },
                {
                    label: 'Pembelajaran & Nilai',
                    items: [
                        { id: 'assignments', svg: ic('<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>'), text: 'Tugas & LKPD' },
                        { id: 'attendance', svg: ic('<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/>'), text: 'Absensi & Jurnal' },
                        { id: 'recap-attendance', svg: ic('<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>'), text: 'Rekap Kehadiran' },
                        { id: 'scores', svg: ic('<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>'), text: 'Daftar Nilai' },
                        { id: 'daily-analysis', svg: ic('<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>'), text: 'Analisis Ulangan' },
                        { id: 'remedial', svg: ic('<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>'), text: 'Remedial & Pengayaan' },
                        { id: 'portfolio', svg: ic('<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>'), text: 'Portofolio Karya' },
                        { id: 'hasbi-rapor', svg: ic('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15l2 2 4-4"/>'), text: 'Analisis & Rapor' },
                        { id: 'jurnal-refleksi', svg: ic('<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>'), text: 'Jurnal & Refleksi' }
                    ]
                },
                {
                    label: 'Layanan & Sistem',
                    items: [
                        { id: 'communication', svg: ic('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'), text: 'Komunikasi & Wali' },
                        { id: 'documents', svg: ic('<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>'), text: 'Surat & Dokumen' },
                        { id: 'reports', svg: ic('<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>'), text: 'Pusat Laporan' },
                        { id: 'backup', svg: ic('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>'), text: 'Cadangan & Pulihkan' },
                        { id: 'settings', svg: ic('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'), text: 'Pengaturan' }
                    ]
                }
            ];
            let nav = document.getElementById('navMenu');
            if (nav) {
                nav.innerHTML = groups.map(g => `
                    <div class="nav-group space-y-0.5 pt-1 first:pt-0">
                        <div class="nav-group-title px-3 pb-1 uppercase select-none">${esc(g.label)}</div>
                        ${g.items.map(m => `
                            <button onclick="switchView('${m.id}')" class="nav-btn w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs" data-target="view-${m.id}" data-label="${esc(m.text.toLowerCase())}">
                                ${m.svg}
                                <span class="truncate">${esc(m.text)}</span>
                            </button>
                        `).join('')}
                    </div>
                `).join('');
            }
        }

        function filterNavMenu(q) {
            const term = String(q || '').trim().toLowerCase();
            document.querySelectorAll('#navMenu .nav-group').forEach(grp => {
                let visible = 0;
                grp.querySelectorAll('.nav-btn').forEach(btn => {
                    const match = !term || (btn.dataset.label || '').includes(term);
                    btn.classList.toggle('hidden', !match);
                    if (match) visible++;
                });
                grp.classList.toggle('hidden', visible === 0);
            });
        }

        function updateHeader() {
            if (typeof renderBackupReminder === 'function') renderBackupReminder();
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
                sel.innerHTML = classes.length
                    ? classes.map(c => `<option value="${c.classId}" ${c.classId === activeClassId ? 'selected' : ''}>Kelas ${esc(c.className)}</option>`).join('')
                    : '<option value="">Belum ada kelas</option>';
            }
            if (typeof Auth !== 'undefined') Auth.renderHeader();
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
            const mainEl = document.getElementById('mainContainer');
            if (mainEl) mainEl.scrollTop = 0;
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
            if (viewId === 'bank-soal') { renderBankSoal(); renderPaket(); }
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
