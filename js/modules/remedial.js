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

        // ---------- Rekomendasi AI (disetujui guru -> tersimpan ke tindak lanjut) ----------
        function weakTpsOf(stId, kktp) {
            let ids = new Set();
            assessments.forEach(a => {
                if (!a.tpId) return;
                let v = scoreOf(stId, a.id);
                if (v !== null && v < kktp) ids.add(a.tpId);
            });
            return Array.from(ids).map(id => tpList.find(t => t.tpId === id)).filter(Boolean);
        }

        async function recommendFollowUpsAI() {
            let kktp = Grading.config(settings).kktp;
            let rows = [], skipped = 0;
            students.forEach(s => {
                let r = calcFinalScore(s.id);
                if (r.final === null || r.status === 'Sementara') { skipped++; return; }
                rows.push({ id: s.id, final: r.final, passed: r.passed, weak: weakTpsOf(s.id, kktp) });
            });
            if (!rows.length) { showModal("Informasi", "Belum ada siswa dengan nilai akhir lengkap. Lengkapi nilai terlebih dahulu.", "ℹ️"); return; }
            if (!AIUI.ensureReady()) return;

            let btn = document.getElementById('btnRecommendAI');
            let recs = await AIUI.run(btn, 'AI menyusun rekomendasi', async (signal) => {
                const pii = AIUI.pii();
                rows.forEach(r => { r.code = pii.code(r.id); });
                const ctx = { subject: settings.subject, fase: settings.fase };
                const out = [];
                for (let i = 0; i < rows.length; i += AITasks.followup.BATCH) {
                    const batch = rows.slice(i, i + AITasks.followup.BATCH);
                    const t = AITasks.followup.build({ rows: batch, kktp, ctx });
                    const r = await AIService.generate({ task: 'tindaklanjut', ...t, signal, pii });
                    out.push(...r.data.rekomendasi);
                }
                return out;
            });
            if (!recs) return;

            let byCode = new Map(rows.map(r => [r.code, r]));
            let items = recs.map(r => ({ r, row: byCode.get(r.kode), st: students.find(s => s.id === byCode.get(r.kode).id) }));
            let dup = x => followUps.some(f => f.studentId === x.st.id && f.type === x.r.jenis && f.status === 'Direncanakan');
            let fresh = items.filter(x => !dup(x));
            let info = `${recs.length} rekomendasi dibuat.` + (items.length - fresh.length ? ` ${items.length - fresh.length} dilewati karena siswa itu sudah punya tindak lanjut Direncanakan sejenis.` : '') + (skipped ? ` ${skipped} siswa tidak dimasukkan karena nilai akhir belum lengkap.` : '');
            AIUI.review({
                title: 'Draf Rekomendasi Tindak Lanjut', info: info + ' Hanya yang dicentang yang disimpan, dengan status Direncanakan.', saveLabel: 'Simpan sebagai Tindak Lanjut',
                items: fresh.map(x => `<div class="font-bold">${esc(x.st.name)} <span class="text-[11px] font-normal ${x.r.jenis === 'Remedial' ? 'text-red-600' : 'text-emerald-700'}">${esc(x.r.jenis)}</span> <span class="text-[11px] font-normal text-slate-500">nilai ${x.row.final}</span></div><div class="text-xs">${esc(x.r.aktivitas)}</div>`),
                onSave: sel => {
                    let today = new Date().toISOString().split('T')[0];
                    sel.forEach(i => {
                        let x = fresh[i];
                        allFollowUps.push({ id: genId('FOL'), periodId: activePeriodId, classId: activeClassId, studentId: x.st.id, type: x.r.jenis, date: today, note: x.r.aktivitas, score: null, status: 'Direncanakan', source: 'ai' });
                    });
                    saveAllData(); loadActiveContextData(); renderAnalysis();
                    showModal("Tersimpan", `${sel.length} tindak lanjut disimpan dengan status Direncanakan. Anda dapat mengubahnya lewat tombol Tindak Lanjut.`, "✅");
                }
            });
        }
