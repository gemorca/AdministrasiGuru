// js/modules/paket.js
// Paket asesmen (Tahap 6). Logika murni di js/domain/package.js; berkas ini menghubungkan ke layar dan cetak.
        // Paket lama (sebelum Tahap 6) belum punya jenis, kelas, dan durasi: tetap tampil dan bisa dicetak.
        const paketKind = p => p.kind || 'Asesmen';
        function paketList() { return allAssessmentPkgs.filter(p => p.periodId === activePeriodId && (!p.classId || p.classId === activeClassId)); }

        function renderPaket() {
            let box = document.getElementById('paketListBody');
            if (!box) return;
            let mark = document.getElementById('paketAiMark'); if (mark) mark.checked = settings.printAiMark !== false;
            let list = paketList();
            box.innerHTML = list.length ? list.map(p => {
                let k = Paket.answerKey(p, allQuestions);
                let warn = k.warnings.length ? `<div class="text-[11px] text-amber-700">${esc(k.warnings.join(' '))}</div>` : '';
                return `<tr class="border-b border-slate-100">
                    <td class="p-3 font-bold text-slate-800">${esc(p.name)}${warn}</td>
                    <td class="p-3 text-xs">${esc(paketKind(p))}</td>
                    <td class="p-3 text-xs text-center">${k.rows.length}</td>
                    <td class="p-3 text-xs text-center">${p.duration ? esc(p.duration) + ' menit' : '-'}</td>
                    <td class="p-3 text-center whitespace-nowrap">
                        <button onclick="printPaket('${p.id}', 'naskah')" class="bg-slate-800 text-white px-2.5 py-1 rounded text-xs font-bold">🖨️ Naskah</button>
                        <button onclick="printPaket('${p.id}', 'kunci')" class="bg-emerald-600 text-white px-2.5 py-1 rounded text-xs font-bold">🖨️ Kunci</button>
                        <button onclick="openModalPaket('${p.id}')" class="bg-blue-50 text-blue-700 border border-blue-100 px-2.5 py-1 rounded text-xs font-bold">Ubah</button>
                        <button onclick="deletePaket('${p.id}')" class="bg-red-50 text-red-600 border border-red-100 px-2.5 py-1 rounded text-xs font-bold">Hapus</button>
                    </td></tr>`;
            }).join('') : `<tr><td colspan="5" class="p-5 text-center text-slate-400 italic text-sm">Belum ada paket asesmen. Klik + Buat Paket.</td></tr>`;
        }

        function openModalPaket(id) {
            let p = id ? allAssessmentPkgs.find(x => x.id === id) : null;
            if (!questionList.length) { showModal("Informasi", "Bank Soal masih kosong. Tambahkan soal lebih dulu.", "ℹ️"); return; }
            document.getElementById('pkId').value = p ? p.id : '';
            document.getElementById('pkName').value = p ? p.name : '';
            document.getElementById('pkKind').value = p && p.kind ? p.kind : 'Formatif';
            document.getElementById('pkDuration').value = p && p.duration ? p.duration : '';
            document.getElementById('pkInstruction').value = p ? (p.instruction || '') : '';
            let chosen = new Set(p ? p.questionIds : []);
            document.getElementById('pkQuestions').innerHTML = questionList.map(q => `
                <label class="flex items-start gap-2 text-xs border border-slate-200 rounded-lg p-2 cursor-pointer">
                    <input type="checkbox" class="mt-0.5" value="${q.id}" ${chosen.has(q.id) ? 'checked' : ''}>
                    <span><b>${esc(q.code)}</b> <span class="text-slate-500">${esc(q.type)} | ${esc(q.diff)}</span><br>${esc(String(q.text).slice(0, 110))}</span>
                </label>`).join('');
            document.getElementById('modalPaket').classList.remove('hidden');
        }

        function savePaket(e) {
            e.preventDefault();
            let id = document.getElementById('pkId').value;
            let ids = Array.from(document.querySelectorAll('#pkQuestions input:checked')).map(c => c.value);
            let rec = {
                name: document.getElementById('pkName').value.trim(), kind: document.getElementById('pkKind').value,
                duration: document.getElementById('pkDuration').value.trim() === '' ? null : Number(document.getElementById('pkDuration').value),
                instruction: document.getElementById('pkInstruction').value.trim(), questionIds: ids
            };
            let errs = Paket.validate(rec, allQuestions);
            if (errs.length) { showModal("Periksa Isian", errs.join(' '), "⚠️"); return; }
            if (id) { let p = allAssessmentPkgs.find(x => x.id === id); if (p) Object.assign(p, rec); }
            else allAssessmentPkgs.push({ id: genId('PKG'), periodId: activePeriodId, classId: activeClassId, ...rec });
            saveAllData(); loadActiveContextData(); renderPaket();
            document.getElementById('modalPaket').classList.add('hidden');
            showModal("Sukses", "Paket asesmen tersimpan.", "✅");
        }

        function deletePaket(id) {
            showConfirm("Hapus paket asesmen ini? Butir soal di Bank Soal tidak ikut terhapus.", () => {
                allAssessmentPkgs = allAssessmentPkgs.filter(p => p.id !== id);
                saveAllData(); loadActiveContextData(); renderPaket();
            });
        }

        function setPrintAiMark(on) { settings.printAiMark = !!on; saveAllData(); }

        function paketHeaderHtml(p, title) {
            let cls = classes.find(c => c.classId === p.classId || c.classId === activeClassId);
            let active = periods.find(x => x.id === p.periodId);
            return `
                <div class="text-center border-b-2 border-black pb-2 mb-4">
                    <div class="font-bold uppercase">${esc(settings.school)}</div>
                    <div class="font-bold uppercase text-lg">${esc(title)}</div>
                    <div class="text-xs">${esc(p.name)} | ${esc(settings.subject)} | Kelas ${esc(cls ? cls.className : '-')} | ${esc(active ? active.year + ' / ' + active.semester : '-')}${p.duration ? ' | Waktu ' + esc(p.duration) + ' menit' : ''}</div>
                </div>`;
        }

        function paketAiNote(items) {
            return settings.printAiMark !== false && items.some(q => q.source === 'ai')
                ? '<p class="text-[10px] italic mt-4">Catatan: sebagian butir soal dibuat dengan bantuan AI dan telah ditinjau guru.</p>' : '';
        }

        /** HTML naskah soal. TIDAK memuat kunci maupun pembahasan. */
        function paketNaskahHtml(id) {
            let p = allAssessmentPkgs.find(x => x.id === id); if (!p) return '';
            let { items } = Paket.resolve(p, allQuestions);
            return paketHeaderHtml(p, 'NASKAH SOAL ' + paketKind(p)) + `
                <div class="grid grid-cols-2 gap-2 text-xs mb-3"><div>Nama : ........................................</div><div>No. Absen : ..........</div></div>
                ${p.instruction ? `<div class="text-xs border border-black p-2 mb-4 whitespace-pre-wrap"><b>Petunjuk:</b> ${esc(p.instruction)}</div>` : ''}
                <div class="space-y-3 text-sm">${items.map((q, i) => `<div class="flex gap-2 break-inside-avoid"><b>${i + 1}.</b><div class="whitespace-pre-wrap">${esc(q.text)}</div></div>`).join('')}</div>` + paketAiNote(items);
        }

        /** HTML kunci jawaban dan skor. Untuk guru, bukan untuk dibagikan ke siswa. */
        function paketKunciHtml(id) {
            let p = allAssessmentPkgs.find(x => x.id === id); if (!p) return '';
            let { items } = Paket.resolve(p, allQuestions);
            let k = Paket.answerKey(p, allQuestions);
            return paketHeaderHtml(p, 'KUNCI JAWABAN DAN PENSKORAN') + `
                ${k.warnings.length ? `<div class="text-xs border border-black p-2 mb-3"><b>Perhatian:</b> ${esc(k.warnings.join(' '))}</div>` : ''}
                <table class="w-full border-collapse border border-black text-xs">
                    <thead><tr class="bg-slate-100"><th class="border border-black p-1.5 w-10">No</th><th class="border border-black p-1.5">Kode</th><th class="border border-black p-1.5">Bentuk</th><th class="border border-black p-1.5">Kunci / Pedoman</th><th class="border border-black p-1.5 w-16">Skor</th></tr></thead>
                    <tbody>${k.rows.map(r => `<tr class="break-inside-avoid"><td class="border border-black p-1.5 text-center">${r.no}</td><td class="border border-black p-1.5">${esc(r.code)}</td><td class="border border-black p-1.5">${esc(r.type)}</td><td class="border border-black p-1.5 whitespace-pre-wrap">${r.key ? esc(r.key) : '<i>(belum ada kunci)</i>'}${r.explanation ? `<div class="text-[10px] text-slate-600">${esc(r.explanation)}</div>` : ''}</td><td class="border border-black p-1.5 text-center">${r.points}</td></tr>`).join('')}</tbody>
                    <tfoot><tr><td colspan="4" class="border border-black p-1.5 text-right font-bold">Total</td><td class="border border-black p-1.5 text-center font-bold">${k.total}</td></tr></tfoot>
                </table>` + paketAiNote(items);
        }

        function printPaket(id, mode) {
            let p = allAssessmentPkgs.find(x => x.id === id); if (!p) return;
            let canvas = document.getElementById('printPaketCanvas'), main = document.getElementById('bankSoalMainContent');
            if (!canvas || !main) return;
            canvas.innerHTML = mode === 'kunci' ? paketKunciHtml(id) : paketNaskahHtml(id);
            canvas.classList.remove('hidden'); main.classList.add('hidden');
            let paket = document.getElementById('paketSection'); if (paket) paket.classList.add('hidden');
            let header = document.getElementById('printHeaderTemplate'); if (header) header.style.display = 'none';
            let view = document.getElementById('view-bank-soal'); view.classList.add('active-print');
            setTimeout(() => {
                window.print();
                canvas.classList.add('hidden'); main.classList.remove('hidden');
                if (paket) paket.classList.remove('hidden');
                view.classList.remove('active-print');
                if (header) header.style.display = '';
            }, 100);
        }
