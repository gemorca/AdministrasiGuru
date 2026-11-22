// js/modules/remedial.js
// Remedial & Pengayaan (Tahap 1): tindak lanjut tersimpan di allFollowUps.

        function followUpsOf(stId) {
            return followUps.filter(f => f.studentId === stId).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
        }

        function followUpSummary(f) {
            let t = `${f.type} · ${f.status}`;
            if (f.score !== null && f.score !== undefined && f.score !== '') t += ` · nilai ${f.score}`;
            return t;
        }

        function renderAnalysis(tab) {
            let tbody = document.getElementById('analysisBody');
            if (!tbody) return;
            let kktp = Grading.config(settings).kktp;
            tbody.innerHTML = students.map((s, idx) => {
                let r = calcFinalScore(s.id);
                let incomplete = r.status === 'Belum Lengkap' || r.status === 'Sementara';
                let cat = incomplete ? 'Belum Lengkap' : (r.passed ? 'Tuntas' : 'Remedial');
                let catCls = incomplete ? 'bg-amber-100 text-amber-800' : (r.passed ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800');
                let rec = incomplete ? 'Lengkapi nilai: ' + (r.missing.join(', ') || '-')
                    : (r.passed ? 'Pengayaan materi lanjutan' : 'Bimbingan ulang TP terkait');
                let fl = followUpsOf(s.id);
                let hist = fl.length ? esc(followUpSummary(fl[0])) + (fl.length > 1 ? ` (+${fl.length - 1})` : '') : 'Belum ada tindak lanjut';
                return `
                    <tr>
                        <td class="px-4 py-3">${idx + 1}</td>
                        <td class="px-4 py-3 font-bold">${esc(s.name)}</td>
                        <td class="px-3 py-3 text-center font-bold">${fmtScore(r.final)}${r.remedialApplied ? ' <span class="text-[9px] font-normal">(setelah remedial)</span>' : ''}</td>
                        <td class="px-3 py-3 text-center">${kktp}</td>
                        <td class="px-4 py-3"><span class="px-2 py-0.5 rounded text-xs font-bold ${catCls}">${cat}</span></td>
                        <td class="px-4 py-3 text-xs text-slate-600">${esc(rec)}</td>
                        <td class="px-4 py-3 text-center">
                            <button onclick="openFollowUp('${s.id}')" class="bg-blue-600 text-white px-3 py-1 rounded text-xs font-bold">Tindak Lanjut</button>
                            <div class="text-[10px] text-slate-500 mt-1">${hist}</div>
                        </td>
                    </tr>
                `;
            }).join('');
        }

        function openFollowUp(stId, editId) {
            let s = students.find(x => x.id === stId);
            if (!s) return;
            let r = calcFinalScore(stId);
            document.getElementById('fuStudentId').value = stId;
            document.getElementById('fuEditId').value = '';
            document.getElementById('fuTitle').innerText = 'Tindak Lanjut: ' + s.name;
            document.getElementById('fuType').value = (r.status === 'Tuntas') ? 'Pengayaan' : 'Remedial';
            document.getElementById('fuDate').value = new Date().toISOString().split('T')[0];
            document.getElementById('fuNote').value = '';
            document.getElementById('fuScore').value = '';
            document.getElementById('fuStatus').value = 'Direncanakan';
            let err = document.getElementById('fuError'); err.classList.add('hidden'); err.innerText = '';
            renderFollowUpHistory(stId);
            if (editId) editFollowUp(editId);
            document.getElementById('modalFollowUp').classList.remove('hidden');
        }

        function renderFollowUpHistory(stId) {
            let box = document.getElementById('fuHistory');
            let fl = followUpsOf(stId);
            box.innerHTML = fl.length ? fl.map(f => `
                <div class="flex justify-between items-start gap-2 border-b border-slate-100 py-2 text-xs">
                    <div><b>${esc(f.date)}</b> · ${esc(followUpSummary(f))}<div class="text-slate-500">${esc(f.note || '')}</div></div>
                    <div class="whitespace-nowrap">
                        <button type="button" onclick="editFollowUp('${f.id}')" class="text-blue-600 font-bold">Ubah</button>
                        <button type="button" onclick="deleteFollowUp('${f.id}')" class="text-red-600 font-bold ml-2">Hapus</button>
                    </div>
                </div>`).join('') : '<div class="text-xs text-slate-400 italic py-2">Belum ada riwayat.</div>';
        }

        function editFollowUp(id) {
            let f = allFollowUps.find(x => x.id === id);
            if (!f) return;
            document.getElementById('fuEditId').value = id;
            document.getElementById('fuType').value = f.type;
            document.getElementById('fuDate').value = f.date || '';
            document.getElementById('fuNote').value = f.note || '';
            document.getElementById('fuScore').value = (f.score === null || f.score === undefined) ? '' : f.score;
            document.getElementById('fuStatus').value = f.status || 'Direncanakan';
        }

        function saveFollowUp(e) {
            e.preventDefault();
            let stId = document.getElementById('fuStudentId').value;
            let editId = document.getElementById('fuEditId').value;
            let type = document.getElementById('fuType').value;
            let date = document.getElementById('fuDate').value;
            let note = document.getElementById('fuNote').value.trim();
            let rawScore = document.getElementById('fuScore').value.trim().replace(',', '.');
            let status = document.getElementById('fuStatus').value;
            let err = document.getElementById('fuError');
            let score = null;
            if (rawScore !== '') {
                score = Number(rawScore);
                if (isNaN(score) || score < 0 || score > 100) { err.innerText = 'Nilai harus angka 0 sampai 100, atau dikosongkan.'; err.classList.remove('hidden'); return; }
            }
            if (!date) { err.innerText = 'Tanggal wajib diisi.'; err.classList.remove('hidden'); return; }
            if (status === 'Selesai' && type === 'Remedial' && score === null) {
                err.innerText = 'Remedial berstatus Selesai perlu nilai remedial.'; err.classList.remove('hidden'); return;
            }
            err.classList.add('hidden');
            let idx = editId ? allFollowUps.findIndex(f => f.id === editId) : -1;
            if (idx >= 0) {
                Object.assign(allFollowUps[idx], { type, date, note, score, status });
            } else {
                allFollowUps.push({ id: genId('FOL'), periodId: activePeriodId, classId: activeClassId, studentId: stId, type, date, note, score, status });
            }
            saveAllData();
            loadActiveContextData();
            document.getElementById('fuEditId').value = '';
            document.getElementById('fuNote').value = '';
            document.getElementById('fuScore').value = '';
            renderFollowUpHistory(stId);
            renderAnalysis();
        }

        function deleteFollowUp(id) {
            let f = allFollowUps.find(x => x.id === id);
            if (!f) return;
            showConfirm('Hapus catatan tindak lanjut ini?', () => {
                allFollowUps = allFollowUps.filter(x => x.id !== id);
                saveAllData();
                loadActiveContextData();
                renderFollowUpHistory(f.studentId);
                renderAnalysis();
            });
        }
