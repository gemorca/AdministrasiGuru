// js/modules/rapor.js
// Dipecah dari sistem_administrasi_guru.html (Tahap 0). Skrip klasik: fungsi bersifat global.
        function initRaporModule() {
            let sel = document.getElementById('raporStudentSelect');
            if (sel) {
                sel.innerHTML = students.map(s => `<option value="${s.id}">${esc(s.name)} (${esc(s.nis)})</option>`).join('');
                if (students.length > 0) renderStudentRapor(students[0].id);
            }
        }

        function renderStudentRapor(stId) {
            let s = students.find(x => x.id === stId);
            if (!s) return;
            let r = calcFinalScore(s.id);

            document.getElementById('rpName').innerText = s.name;
            document.getElementById('rpNis').innerText = s.nis;
            document.getElementById('rpClass').innerText = s.class;
            document.getElementById('rpSubject').innerText = settings.subject;
            let active = periods.find(p => p.id === activePeriodId);
            document.getElementById('rpPeriod').innerText = active ? `${active.semester} / ${active.year}` : (settings.semester + ' / ' + settings.academicYear);
            document.getElementById('rpPrincipal').innerText = settings.principal;
            let elRpNipPri = document.getElementById('rpNipPrincipal');
            if(elRpNipPri) elRpNipPri.innerText = settings.nipPrincipal || '-';
            
            document.getElementById('rpTeacher').innerText = settings.teacher;
            let elRpNipTea = document.getElementById('rpNipTeacher');
            if(elRpNipTea) elRpNipTea.innerText = settings.nipTeacher || '-';

            let tbody = document.getElementById('rpTableBody');
            if (tbody) {
                let cfg = Grading.config(settings);
                let rowsTp = tpList.map(tp => {
                    let v = tpScoreOf(s.id, tp.tpId);
                    let pred = v === null ? '-' : Grading.predicate(v, cfg);
                    let desc = v === null ? 'Belum ada penilaian yang dikaitkan dengan tujuan pembelajaran ini.'
                        : (v >= cfg.kktp ? 'Mencapai KKTP pada tujuan pembelajaran ini.' : 'Belum mencapai KKTP; perlu penguatan pada tujuan pembelajaran ini.');
                    return `
                    <tr>
                        <td class="p-2 border font-semibold">${esc(tp.code)} - ${esc(String(tp.description || '').substring(0, 50))}...</td>
                        <td class="p-2 border text-center font-bold">${fmtScore(v)}</td>
                        <td class="p-2 border text-center font-bold">${esc(pred)}</td>
                        <td class="p-2 border text-slate-600">${esc(desc)}</td>
                    </tr>`;
                }).join('');
                let finalDesc = r.final === null ? 'Nilai akhir belum dapat ditetapkan: komponen ' + r.missing.join(', ') + ' belum lengkap.'
                    : (r.passed ? 'Mencapai KKTP dan syarat ketuntasan.' : 'Belum mencapai ketuntasan.');
                tbody.innerHTML = rowsTp + `
                    <tr class="bg-slate-50">
                        <td class="p-2 border font-semibold">Nilai Akhir Mata Pelajaran ${esc(settings.subject)}</td>
                        <td class="p-2 border text-center font-bold">${fmtScore(r.final)}</td>
                        <td class="p-2 border text-center font-bold">${esc(r.pred)}</td>
                        <td class="p-2 border text-slate-600">${esc(finalDesc)}</td>
                    </tr>`;
            }

            let descObj = allRaporDescriptions.find(d => d.studentId === stId && d.periodId === activePeriodId);
            let narEl = document.getElementById('rpNarration');
            if (narEl) {
                narEl.innerText = descObj ? descObj.text : 'Belum ada narasi deskripsi capaian. Klik \'Generate Narasi Otomatis\' untuk menyusun draf, lalu setujui.';
            }
        }

        // ---------- Data bersama untuk fitur AI Tahap 5 (rapor, laporan wali, surat) ----------
        function tpScoreOf(stId, tpId) {
            let v = assessments.filter(a => a.tpId === tpId).map(a => scoreOf(stId, a.id)).filter(x => x !== null);
            return v.length ? Grading.round1(Grading.avg(v)) : null;
        }

        /** Fakta satu siswa (tanpa nama) untuk prompt. Semua angka dihitung di sini, bukan oleh AI. */
        function aiFactsOf(stId) {
            let r = calcFinalScore(stId), att = calcAttStats(stId), kktp = Grading.config(settings).kktp;
            let seq = assessments.filter(a => a.type === 'Formatif' || a.type === 'Sumatif')
                .slice().sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
                .map(a => scoreOf(stId, a.id)).filter(v => v !== null);
            let tpOk = [], tpWeak = [];
            tpList.forEach(tp => { let v = tpScoreOf(stId, tp.tpId); if (v === null) return; (v >= kktp ? tpOk : tpWeak).push(tp); });
            return {
                final: r.final, pred: r.pred, passed: !!r.passed, status: r.status, missing: r.missing || [],
                attPct: att.pct, H: att.H, S: att.S, I: att.I, A: att.A,
                taskDone: submissions.filter(x => x.studentId === stId).length, taskTotal: assignments.length,
                trend: AITasks.trendOf(seq), tpOk, tpWeak
            };
        }

        async function generateAllNarration() {
            let rows = [], skipped = 0;
            students.forEach(s => {
                let f = aiFactsOf(s.id);
                if (f.final === null || f.status === 'Sementara') { skipped++; return; }
                rows.push({ id: s.id, ...f });
            });
            if (!rows.length) { showModal("Informasi", "Belum ada siswa dengan nilai akhir lengkap. Lengkapi nilai terlebih dahulu.", "ℹ️"); return; }
            if (!AIUI.ensureReady()) return;

            let btn = document.querySelector('button[onclick="generateAllNarration()"]');
            let out = await AIUI.run(btn, 'AI menyusun narasi', async (signal) => {
                const pii = AIUI.pii();
                rows.forEach(r => { r.code = pii.code(r.id); });
                const ctx = { subject: settings.subject, fase: settings.fase, kktp: Grading.config(settings).kktp };
                const all = [];
                for (let i = 0; i < rows.length; i += AITasks.rapor.BATCH) {
                    const t = AITasks.rapor.build({ rows: rows.slice(i, i + AITasks.rapor.BATCH), ctx });
                    const r = await AIService.generate({ task: 'narasi-rapor', ...t, signal, pii });
                    all.push(...r.data.narasi);
                }
                return { all, pii };
            });
            if (!out) return;

            let byCode = new Map(rows.map(r => [r.code, r]));
            let items = out.all.map(n => ({ st: students.find(x => x.id === byCode.get(n.kode).id), text: out.pii.restore(n.teks) }));
            AIUI.review({
                title: 'Draf Narasi Rapor', saveLabel: 'Simpan Narasi Terpilih',
                info: `${items.length} narasi dibuat.` + (skipped ? ` ${skipped} siswa tidak diberi narasi karena nilai akhir belum lengkap.` : '') + ' Teks dapat diedit. Hanya yang dicentang yang disimpan dan menggantikan narasi lama.',
                items: items.map(x => `<div class="font-bold mb-1">${esc(x.st.name)}</div><textarea rows="4" class="w-full text-xs border border-slate-200 rounded-lg p-2" data-narasi>${esc(x.text)}</textarea>`),
                onSave: sel => {
                    let areas = document.querySelectorAll('#aiReviewList textarea[data-narasi]');
                    let saved = 0;
                    sel.forEach(i => {
                        let text = String(areas[i] ? areas[i].value : '').trim();
                        if (!text) return;
                        let st = items[i].st;
                        let idx = allRaporDescriptions.findIndex(d => d.studentId === st.id && d.periodId === activePeriodId);
                        if (idx >= 0) allRaporDescriptions[idx].text = text;
                        else allRaporDescriptions.push({ id: genId('RD'), studentId: st.id, periodId: activePeriodId, text, source: 'ai' });
                        saved++;
                    });
                    saveAllData(); loadActiveContextData();
                    let sel2 = document.getElementById('raporStudentSelect');
                    if (sel2) renderStudentRapor(sel2.value);
                    showModal("Tersimpan", `${saved} narasi rapor disimpan.`, "✅");
                }
            });
        }

        function printStudentRapor() { window.print(); }
        function printAllRapor() { window.print(); }
