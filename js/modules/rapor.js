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
                tbody.innerHTML = tpList.length ? tpList.map(tp => `
                    <tr>
                        <td class="p-2 border font-semibold">${esc(tp.code)} - ${esc(tp.description.substring(0, 50))}...</td>
                        <td class="p-2 border text-center font-bold">${fmtScore(r.final)}</td>
                        <td class="p-2 border text-center font-bold">${r.pred}</td>
                        <td class="p-2 border text-slate-600">Menunjukkan penguasaan yang baik pada tujuan pembelajaran ${esc(tp.code)}.</td>
                    </tr>
                `).join('') : `
                    <tr>
                        <td class="p-2 border font-semibold">Nilai Akhir Mata Pelajaran ${esc(settings.subject)}</td>
                        <td class="p-2 border text-center font-bold">${fmtScore(r.final)}</td>
                        <td class="p-2 border text-center font-bold">${r.pred}</td>
                        <td class="p-2 border text-slate-600">Peserta didik menunjukkan kompetensi yang sangat baik dalam penguasaan materi ${esc(settings.subject)}.</td>
                    </tr>
                `;
            }

            let descObj = allRaporDescriptions.find(d => d.studentId === stId && d.periodId === activePeriodId);
            let narEl = document.getElementById('rpNarration');
            if (narEl) {
                narEl.innerText = descObj ? descObj.text : `Peserta didik mampu menguasai materi ${settings.subject} dengan baik dan menunjukkan keaktifan dalam kegiatan pembelajaran di kelas.`;
            }
        }

        function generateAllNarration() {
            students.forEach(s => {
                let r = calcFinalScore(s.id);
                let text = r.final === null
                    ? `Nilai akhir peserta didik an. ${s.name} pada mata pelajaran ${settings.subject} belum dapat ditetapkan karena komponen penilaian belum lengkap (${r.missing.join(', ')}).`
                    : r.passed
                        ? `Peserta didik an. ${s.name} telah menuntaskan seluruh rangkaian kompetensi mata pelajaran ${settings.subject} dengan Nilai Akhir ${r.final} (Predikat ${r.pred}). Pertahankan prestasi belajar!`
                        : `Peserta didik an. ${s.name} memperoleh Nilai Akhir ${r.final} (Predikat ${r.pred}) pada mata pelajaran ${settings.subject} dan belum mencapai KKTP. Diperlukan pendampingan dan remedial.`;
                let idx = allRaporDescriptions.findIndex(d => d.studentId === s.id && d.periodId === activePeriodId);
                if (idx >= 0) allRaporDescriptions[idx].text = text;
                else allRaporDescriptions.push({ id: genId('RD'), studentId: s.id, periodId: activePeriodId, text });
            });
            saveAllData();
            let sel = document.getElementById('raporStudentSelect');
            if (sel) renderStudentRapor(sel.value);
            showModal("Sukses", "Narasi pencapaian seluruh siswa berhasil digenerate secara otomatis dari data nilai!", "✨");
        }

        function printStudentRapor() { window.print(); }
        function printAllRapor() { window.print(); }

