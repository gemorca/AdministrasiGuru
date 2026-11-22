// js/modules/scores.js
// Dipecah dari sistem_administrasi_guru.html (Tahap 0). Skrip klasik: fungsi bersifat global.
        function openAssessModal(type) {
            let form = document.getElementById('formAssessment');
            if(form) form.reset();
            let asmTypeField = document.getElementById('asmType');
            if(asmTypeField) asmTypeField.value = type;
            let asmDisplay = document.getElementById('asmTypeDisplay');
            if(asmDisplay) asmDisplay.value = type;
            
            let nameField = document.getElementById('asmName');
            let topicInput = document.getElementById('asmTopicInputGroup');
            let tpInput = document.getElementById('asmTpInputGroup');
            
            if (type === 'Formatif') {
                if(tpInput) tpInput.classList.remove('hidden');
                if(topicInput) topicInput.classList.add('hidden');
                if(nameField) nameField.value = "Formatif TP";
                let sel = document.getElementById('asmTp');
                if(sel) sel.innerHTML = tpList.length ? tpList.map(t => `<option value="${t.tpId}">${esc(t.code)} - ${esc(t.description.substring(0,40))}...</option>`).join('') : '<option value="">(Belum ada TP dirumuskan)</option>';
            } else if (type === 'Sumatif') {
                if(tpInput) tpInput.classList.add('hidden');
                if(topicInput) topicInput.classList.remove('hidden');
                if(nameField) nameField.value = "Sumatif Lingkup Materi";
            } else { 
                if(tpInput) tpInput.classList.add('hidden');
                if(topicInput) topicInput.classList.add('hidden'); 
                if(nameField) nameField.value = type;
            }
            
            let modal = document.getElementById('modalAssessment');
            if(modal) modal.classList.remove('hidden');
        }

        function saveAssessment(e) {
            e.preventDefault();
            let type = document.getElementById('asmType').value;
            let name = document.getElementById('asmName').value.trim();
            let topic = "";
            let tpId = null;

            if (type === 'Formatif') {
                tpId = document.getElementById('asmTp').value;
                if(!tpId) { showModal("Peringatan", "Harap rumuskan Tujuan Pembelajaran (TP) pada menu Kurikulum terlebih dahulu.", "⚠️"); return; }
                let tp = tpList.find(t => t.tpId === tpId);
                topic = tp ? tp.code : '';
                name = `Formatif ${topic}`;
            } else if (type === 'Sumatif') {
                topic = document.getElementById('asmTopic').value.trim() || 'Materi Umum';
            } else {
                // UTS/UAS hanya satu per kelas dan periode. Bila sudah ada, buka input nilainya
                // (nilai lama TIDAK dihapus).
                let existing = allAssessments.find(a => a.periodId === activePeriodId && a.classId === activeClassId && a.type === type);
                if (existing) {
                    document.getElementById('modalAssessment').classList.add('hidden');
                    openScoreEntry(existing.id);
                    return;
                }
                topic = type;
            }

            let aId = genId('ASM');
            allAssessments.push({ id: aId, periodId: activePeriodId, classId: activeClassId, type, name, topic, tpId, date: new Date().toISOString().split('T')[0] });
            saveAllData();
            loadActiveContextData();
            renderRecapScores();
            document.getElementById('modalAssessment').classList.add('hidden');
            openScoreEntry(aId); // nilai diisi guru; tidak ada nilai contoh acak
        }

        // ---------- Pembaca nilai ----------
        function scoreOf(stId, asmId) {
            let s = scores.find(x => x.studentId === stId && x.assessmentId === asmId);
            if (!s || s.score === null || s.score === undefined || s.score === '' || isNaN(Number(s.score))) return null;
            return Number(s.score);
        }

        function fmtScore(v) { return (v === null || v === undefined) ? '-' : v; }

        // ---------- Daftar asesmen & input nilai ----------
        function renderAssessmentList() {
            let tbody = document.getElementById('assessmentListBody');
            if (!tbody) return;
            let list = assessments.slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
            tbody.innerHTML = list.length ? list.map(a => {
                let filled = students.filter(s => scoreOf(s.id, a.id) !== null).length;
                let warn = filled < students.length ? 'text-amber-700' : 'text-emerald-700';
                return `
                <tr class="border-b border-slate-100">
                    <td class="px-4 py-2 font-semibold text-xs">${esc(a.type)}</td>
                    <td class="px-4 py-2 text-sm">${esc(a.name)}</td>
                    <td class="px-4 py-2 text-xs text-slate-500">${esc(a.topic || '-')}</td>
                    <td class="px-4 py-2 text-xs">${esc(a.date)}</td>
                    <td class="px-4 py-2 text-center text-xs font-bold ${warn}">${filled}/${students.length}</td>
                    <td class="px-4 py-2 text-center whitespace-nowrap">
                        <button onclick="openScoreEntry('${a.id}')" class="bg-blue-600 text-white px-3 py-1 rounded text-xs font-bold">Input Nilai</button>
                        <button onclick="deleteAssessment('${a.id}')" class="bg-red-50 text-red-600 border border-red-100 px-3 py-1 rounded text-xs font-bold">Hapus</button>
                    </td>
                </tr>`;
            }).join('') : `<tr><td colspan="6" class="px-4 py-6 text-center text-slate-400 italic text-sm">Belum ada asesmen. Gunakan tombol + Formatif, + Sumatif, Input UTS, atau Input UAS.</td></tr>`;
        }

        function deleteAssessment(id) {
            let n = allScores.filter(s => s.assessmentId === id).length;
            showConfirm(`Hapus asesmen ini beserta ${n} nilai di dalamnya? Tindakan ini permanen.`, () => {
                allAssessments = allAssessments.filter(a => a.id !== id);
                allScores = allScores.filter(s => s.assessmentId !== id);
                saveAllData();
                loadActiveContextData();
                renderRecapScores();
            });
        }

        function openScoreEntry(asmId) {
            let asm = allAssessments.find(a => a.id === asmId);
            if (!asm) return;
            document.getElementById('scoreEntryAsmId').value = asmId;
            document.getElementById('scoreEntryTitle').innerText = 'Input Nilai: ' + asm.name;
            let err = document.getElementById('scoreEntryError');
            err.classList.add('hidden'); err.innerText = '';
            let body = document.getElementById('scoreEntryBody');
            body.innerHTML = students.length ? students.map((s, i) => {
                let v = scoreOf(s.id, asmId);
                return `<tr class="border-b border-slate-100">
                    <td class="p-2 text-xs text-slate-500">${i + 1}</td>
                    <td class="p-2 text-sm font-semibold">${esc(s.name)}</td>
                    <td class="p-2"><input type="text" inputmode="decimal" data-st="${s.id}" value="${v === null ? '' : v}" class="score-entry-input w-24 border border-slate-300 rounded p-1 text-center"></td>
                </tr>`;
            }).join('') : '<tr><td class="p-4 text-center text-slate-400 italic" colspan="3">Belum ada siswa di kelas ini.</td></tr>';
            document.getElementById('modalScoreEntry').classList.remove('hidden');
        }

        function saveScoreEntry() {
            let asmId = document.getElementById('scoreEntryAsmId').value;
            let inputs = Array.from(document.querySelectorAll('#scoreEntryBody .score-entry-input'));
            let errors = [], entries = [];
            inputs.forEach(inp => {
                let st = students.find(s => s.id === inp.getAttribute('data-st'));
                let raw = inp.value.trim().replace(',', '.');
                if (raw === '') { entries.push({ stId: st.id, v: null }); return; }
                let n = Number(raw);
                if (isNaN(n) || n < 0 || n > 100) errors.push(st.name);
                else entries.push({ stId: st.id, v: n });
            });
            if (errors.length) {
                let el = document.getElementById('scoreEntryError');
                el.innerText = 'Nilai harus angka 0 sampai 100. Periksa: ' + errors.join(', ');
                el.classList.remove('hidden');
                return;
            }
            let filled = 0;
            entries.forEach(e => {
                let idx = allScores.findIndex(s => s.assessmentId === asmId && s.studentId === e.stId);
                if (e.v === null) {
                    if (idx >= 0) allScores.splice(idx, 1);
                    return;
                }
                filled++;
                if (idx >= 0) allScores[idx].score = e.v;
                else allScores.push({ id: genId('SCR'), periodId: activePeriodId, assessmentId: asmId, studentId: e.stId, score: e.v });
            });
            saveAllData();
            loadActiveContextData();
            document.getElementById('modalScoreEntry').classList.add('hidden');
            renderRecapScores();
            showModal('Sukses', `Nilai tersimpan: ${filled} terisi, ${entries.length - filled} kosong. Nilai kosong tidak dihitung sebagai 0.`, '✅');
        }

        // ---------- Analisis sumatif (berdasarkan nilai nyata, tanpa pola jawaban rekaan) ----------
        function analyzeSumatif() {
            let tbody = document.getElementById('analisisSumatifBody');
            if (!tbody) return;
            let sumAsms = assessments.filter(a => a.type === 'Sumatif');
            if (sumAsms.length === 0) {
                showModal('Informasi', 'Belum ada penilaian Sumatif untuk dianalisis.', 'ℹ️');
                return;
            }
            let kktp = Grading.config(settings).kktp;
            tbody.innerHTML = students.map(s => {
                let vals = sumAsms.map(a => ({ a, v: scoreOf(s.id, a.id) }));
                let filled = vals.filter(x => x.v !== null);
                let avg = filled.length ? Grading.round1(filled.reduce((t, x) => t + x.v, 0) / filled.length) : null;
                let tuntas = avg !== null && avg >= kktp;
                let detail = vals.map(x => `${esc(x.a.name)}: ${x.v === null ? '-' : x.v}`).join(' | ');
                let below = filled.filter(x => x.v < kktp).map(x => x.a.name);
                let rec = avg === null ? 'Nilai sumatif belum diinput.'
                    : tuntas ? 'Capaian memenuhi KKTP. Dapat diberi pengayaan.'
                    : 'Perlu remedial pada: ' + below.join(', ') + '.';
                let badge = avg === null ? '<span class="px-2 py-1 bg-amber-100 text-amber-800 rounded-lg text-[10px] font-bold">BELUM ADA NILAI</span>'
                    : tuntas ? '<span class="px-2 py-1 bg-emerald-100 text-emerald-800 rounded-lg text-[10px] font-bold">TUNTAS</span>'
                    : '<span class="px-2 py-1 bg-red-100 text-red-800 rounded-lg text-[10px] font-bold">BELUM TUNTAS</span>';
                return `
                    <tr class="hover:bg-slate-50 border-b border-slate-100">
                        <td class="p-3 font-bold text-slate-800">${esc(s.name)}</td>
                        <td class="p-3 text-center font-bold ${tuntas ? 'text-blue-600' : 'text-red-600'}">${fmtScore(avg)}</td>
                        <td class="p-3 text-xs text-slate-600">${detail}</td>
                        <td class="p-3 text-center"><div class="text-[10px] text-slate-500 mb-1">KKTP: ${kktp}</div>${badge}</td>
                        <td class="p-3 text-xs text-slate-600 leading-relaxed">${esc(rec)}</td>
                    </tr>`;
            }).join('');
            document.getElementById('modalAnalisisSumatif').classList.remove('hidden');
        }

        // ---------- Nilai akhir ----------
        // Perhitungan ada di js/domain/grading.js. Fungsi ini hanya mengumpulkan data kelas aktif.
        function calcFinalScore(stId) {
            let byType = t => assessments.filter(a => a.type === t);
            let vals = t => byType(t).map(a => scoreOf(stId, a.id));
            let single = t => { let a = byType(t)[0]; return a ? scoreOf(stId, a.id) : null; };
            let fu = followUps
                .filter(f => f.studentId === stId && f.type === 'Remedial' && f.status === 'Selesai' && f.score !== null && f.score !== undefined && f.score !== '')
                .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))[0];
            return Grading.compute({
                formatif: vals('Formatif'),
                sumatif: vals('Sumatif'),
                uts: single('UTS'),
                uas: single('UAS'),
                attPct: calcAttStats(stId).pct,
                remedialScore: fu ? Number(fu.score) : null
            }, settings);
        }

        function statusBadge(r) {
            if (r.status === 'Tuntas') return '<span class="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded text-[10px] font-bold">TUNTAS</span>';
            if (r.status === 'Belum Tuntas') return '<span class="bg-red-100 text-red-800 px-2 py-0.5 rounded text-[10px] font-bold">BELUM TUNTAS</span>';
            let hint = r.missing.length ? 'Komponen kosong: ' + r.missing.join(', ') : '';
            let label = r.status === 'Sementara' ? 'SEMENTARA' : 'BELUM LENGKAP';
            return `<span title="${esc(hint)}" class="bg-amber-100 text-amber-800 px-2 py-0.5 rounded text-[10px] font-bold">${label}</span>`;
        }

        function renderRecapScores() {
            renderAssessmentList();
            let tbody = document.getElementById('recapScoreBody');
            if (!tbody) return;
            let q = (document.getElementById('searchScore')?.value || '').toLowerCase();
            let attMin = Grading.config(settings).attMin;
            let list = students.filter(s => !q || String(s.name).toLowerCase().includes(q) || String(s.nis).toLowerCase().includes(q));
            tbody.innerHTML = list.map((s, idx) => {
                let r = calcFinalScore(s.id);
                return `
                    <tr>
                        <td class="px-4 py-3">${idx + 1}</td>
                        <td class="px-4 py-3 font-semibold">${esc(s.nis)}</td>
                        <td class="px-4 py-3 font-bold">${esc(s.name)}</td>
                        <td class="px-2 py-3 text-center">${fmtScore(r.f)}</td>
                        <td class="px-2 py-3 text-center">${fmtScore(r.sum)}</td>
                        <td class="px-2 py-3 text-center">${fmtScore(r.uts)}</td>
                        <td class="px-2 py-3 text-center">${fmtScore(r.uas)}</td>
                        <td class="px-2 py-3 text-center font-bold ${r.attPct < attMin ? 'text-red-600' : 'text-emerald-600'}">${r.attPct}%</td>
                        <td class="px-3 py-3 text-center font-bold bg-blue-50 text-blue-800">${fmtScore(r.final)}${r.remedialApplied ? ' <span class="text-[9px] font-normal">(remedial)</span>' : ''}</td>
                        <td class="px-2 py-3 text-center font-bold">${r.pred}</td>
                        <td class="px-4 py-3 text-center">${statusBadge(r)}</td>
                    </tr>
                `;
            }).join('');
        }

        function csvCell(v) {
            if (v === null || v === undefined) return '';
            let t = String(v);
            if (/^([=+@]|-.)/.test(t)) t = "'" + t; // cegah injeksi rumus spreadsheet (tanda "-" tunggal aman)
            return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
        }

        function exportScoresCSV() {
            if (!students.length) return;
            let rows = [["NISN", "Nama Siswa", "R. Formatif", "R. Sumatif", "UTS", "UAS", "% Hadir", "Nilai Akhir", "Predikat", "Status"]];
            students.forEach(s => {
                let r = calcFinalScore(s.id);
                rows.push([s.nis, s.name, r.f, r.sum, r.uts, r.uas, r.attPct + '%', r.final, r.pred, r.status]);
            });
            let csv = rows.map(r => r.map(csvCell).join(',')).join('\n');
            let blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            let link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = `Rekap_Nilai_${activePeriodId}.csv`;
            link.click();
        }
