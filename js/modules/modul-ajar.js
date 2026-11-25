// js/modules/modul-ajar.js
// Dipecah dari sistem_administrasi_guru.html (Tahap 0). Skrip klasik: fungsi bersifat global.
        // -------------------------------------------------------------

        function renderGeneratorTab() {
            let sel = document.getElementById('genTpSelect');
            if (sel) sel.innerHTML = tpList.map(t => `<option value="${t.tpId}">${esc(t.code)}: ${esc(t.description.substring(0,60))}...</option>`).join('');
            renderSavedModul();
        }

        // ---------- Modul ajar tersimpan ----------
        let lastGeneratedModul = null;

        function savedModulList() {
            return allMaterials.filter(m => m.periodId === activePeriodId && (!m.classId || m.classId === activeClassId))
                .sort((a, b) => String(b.savedAt || '').localeCompare(String(a.savedAt || '')));
        }

        function renderSavedModul() {
            let tbody = document.getElementById('savedModulBody');
            if (!tbody) return;
            let list = savedModulList();
            tbody.innerHTML = list.length ? list.map(m => {
                let tp = tpList.find(t => t.tpId === m.tpId);
                return `<tr class="border-b border-slate-100">
                    <td class="px-4 py-2 text-sm font-semibold">${esc(m.title)}</td>
                    <td class="px-4 py-2 text-xs">${esc(tp ? tp.code : '-')}</td>
                    <td class="px-4 py-2 text-xs">${esc(m.model)}</td>
                    <td class="px-4 py-2 text-xs">${esc(String(m.savedAt || '').slice(0, 10))}</td>
                    <td class="px-4 py-2 text-center whitespace-nowrap">
                        <button onclick="openSavedModul('${m.id}')" class="bg-blue-600 text-white px-3 py-1 rounded text-xs font-bold">Buka</button>
                        <button onclick="deleteSavedModul('${m.id}')" class="bg-red-50 text-red-600 border border-red-100 px-3 py-1 rounded text-xs font-bold">Hapus</button>
                    </td></tr>`;
            }).join('') : '<tr><td colspan="5" class="px-4 py-4 text-center text-slate-400 italic text-sm">Belum ada modul tersimpan.</td></tr>';
        }

        function saveModulAjar() {
            let cont = document.getElementById('genResultContent');
            if (!lastGeneratedModul || !cont || !cont.innerHTML.trim()) {
                showModal('Peringatan', 'Belum ada modul untuk disimpan. Generate modul terlebih dahulu.', '⚠️');
                return;
            }
            let m = lastGeneratedModul;
            allMaterials.push({
                id: genId('MAT'), periodId: activePeriodId, classId: activeClassId,
                tpId: m.tpId, model: m.model, title: m.title,
                html: cont.innerHTML, savedAt: new Date().toISOString()
            });
            saveAllData();
            loadActiveContextData();
            renderSavedModul();
            showModal('Sukses', 'Modul ajar tersimpan dan dapat dibuka kembali kapan saja.', '✅');
        }

        function openSavedModul(id) {
            let m = allMaterials.find(x => x.id === id);
            if (!m) return;
            document.getElementById('genResultContent').innerHTML = sanitizeHtml(m.html);
            document.getElementById('genResultContainer').classList.remove('hidden');
            lastGeneratedModul = { tpId: m.tpId, model: m.model, title: m.title };
            document.getElementById('genResultContainer').scrollIntoView({ behavior: 'smooth' });
        }

        function deleteSavedModul(id) {
            showConfirm('Hapus modul ajar tersimpan ini?', () => {
                allMaterials = allMaterials.filter(m => m.id !== id);
                saveAllData();
                loadActiveContextData();
                renderSavedModul();
            });
        }

        // ---------- Modul ajar dari Gemini ----------
        const mjNl = t => esc(t).replace(/\n/g, '<br>');
        const mjGS = t => esc(t).replace(/\b(Guru|Siswa):/g, '<b>$1:</b>').replace(/\n/g, '<br>');

        function renderModulAjar(d, c) {
            const thCls = "border border-black p-2 font-bold bg-slate-100 align-top";
            const tdCls = "border border-black p-2 align-top";
            const tr = (lbl, val) => `<tr><td class="${thCls} w-1/4">${lbl}</td><td class="${tdCls}">${val}</td></tr>`;
            const h = t => `<h6 class="font-bold text-sm bg-blue-100 text-blue-900 p-2 border border-black uppercase mt-4">${t}</h6>`;
            const table = body => `<table class="w-full text-xs text-left border-collapse border border-black mb-4"><tbody>${body}</tbody></table>`;
            const kegTable = (title, rows) => `
                <b class="block mb-1 bg-slate-100 p-1">${title} (${rows.reduce((a, r) => a + r.menit, 0)} Menit)</b>
                <table class="w-full border-collapse border border-black mb-3 text-xs text-left">
                    <thead class="bg-slate-200"><tr class="border-b border-black"><th class="${thCls} w-1/5">Kegiatan</th><th class="${thCls}">Deskripsi Tindakan Guru &amp; Siswa</th><th class="${thCls} w-16 text-center">Waktu</th><th class="${thCls} w-1/5">Profil / Karakter</th></tr></thead>
                    <tbody>${rows.map(r => `<tr><td class="${tdCls} font-bold">${esc(r.kegiatan)}</td><td class="${tdCls}">${mjGS(r.deskripsi)}</td><td class="${tdCls} text-center font-bold">${r.menit} Menit</td><td class="${tdCls}">${esc(r.profil)}</td></tr>`).join('')}</tbody>
                </table>`;
            const refName = c.refName ? esc(c.refName) : '';
            return `
                <div class="no-print bg-amber-50 border border-amber-200 text-amber-900 text-[11px] rounded-lg p-2 mb-4">Dibuat dengan AI (Gemini): mohon diperiksa dan disesuaikan sebelum dipakai. Bagian B berisi perkiraan umum, sesuaikan dengan kondisi kelas Anda.</div>
                <div class="text-center mb-6">
                    <h4 class="font-bold text-lg uppercase text-slate-900">RENCANA PELAKSANAAN PEMBELAJARAN MENDALAM</h4>
                    <h5 class="font-bold text-md text-slate-700">(RPPM 01)</h5>
                </div>
                ${h('A. IDENTITAS RPPM')}
                ${table(
                    tr('Nama Sekolah', `: ${esc(settings.school)}`) + tr('Nama Penyusun', `: ${esc(settings.teacher)}`) +
                    tr('NIP', `: ${esc(settings.nipTeacher || '-')}`) + tr('Mata Pelajaran', `: ${esc(settings.subject)}`) +
                    tr('Fase / Kelas', `: ${esc(settings.fase)} / ${esc(c.kelas)}`) + tr('Semester', `: ${esc(c.semester)}`) +
                    tr('Tahun Pelajaran', `: ${esc(c.period)}`) + tr('Judul Modul', `: ${esc(d.judul)}`) +
                    tr('Referensi Materi Utama', `: ${refName ? `<b>${refName}</b> (modul disesuaikan dengan sumber ini)` : 'Buku teks / sumber yang Anda pilih'}`) +
                    tr('Alokasi Waktu', `: ${c.meetings} x Pertemuan (${c.meetings * 2} JP x 40 Menit)`) +
                    tr('Pendekatan', ': Deep Learning (Mindful, Meaningful, Joyful Learning)'))}
                ${h('B. IDENTIFIKASI KEBUTUHAN BELAJAR PESERTA DIDIK')}
                ${table(tr('Kesiapan Belajar', mjNl(d.kebutuhan.kesiapan)) + tr('Minat Belajar', mjNl(d.kebutuhan.minat)) + tr('Gaya Belajar', mjNl(d.kebutuhan.gaya_belajar)))}
                ${h('C. KARAKTERISTIK MATA PELAJARAN')}
                ${table(tr('Cakupan Pengetahuan', mjNl(d.karakteristik.cakupan)) + tr('Relevansi dengan Kehidupan Nyata', mjNl(d.karakteristik.relevansi)) +
                    tr('Tingkat Kesulitan', mjNl(d.karakteristik.tingkat_kesulitan)) +
                    tr('Struktur Materi', d.karakteristik.struktur.map((x, i) => `${i + 1}. ${esc(x)}`).join('<br>')) + tr('Integrasi Nilai Karakter', mjNl(d.karakteristik.karakter)))}
                ${h('D. DIMENSI PROFIL LULUSAN')}
                <table class="w-full text-xs text-left border-collapse border border-black mb-4"><thead><tr class="bg-slate-100"><th class="${thCls}">Dimensi Profil Lulusan</th><th class="${thCls}">Keterangan</th></tr></thead>
                <tbody>${d.profil.map(p => `<tr><td class="${tdCls}">${esc(p.dimensi)}</td><td class="${tdCls}">${mjNl(p.keterangan)}</td></tr>`).join('')}</tbody></table>
                ${h('E. DESAIN PEMBELAJARAN')}
                ${table(tr('Capaian Pembelajaran', mjNl(d.desain.capaian)) + tr('Lintas Disiplin Ilmu', mjNl(d.desain.lintas_disiplin)) +
                    tr('Tujuan Pembelajaran', mjNl(c.tp.description)) +
                    tr('Praktik Pedagogis', `<b>Model:</b> ${esc(c.model)}.<br>${mjNl(d.desain.metode)}`) +
                    tr('Kemitraan Pembelajaran', mjNl(d.desain.kemitraan)) + tr('Lingkungan Belajar', mjNl(d.desain.lingkungan)) +
                    tr('Pemanfaatan Digital', mjNl(d.desain.digital)) + tr('Saran Media / Gambar', d.media.map(m => '- ' + esc(m)).join('<br>')))}
                ${h('F. LANGKAH-LANGKAH PEMBELAJARAN')}
                ${d.pertemuan.map((p, i) => `
                    <div class="border border-black p-4 text-xs mb-4">
                        <h4 class="font-bold underline text-sm mb-2">PERTEMUAN ${i + 1} (2 x 40 Menit)</h4>
                        <p class="mb-2"><b>Model Pembelajaran:</b> ${esc(c.model)}<br><b>Tujuan Pembelajaran:</b> ${mjNl(p.tujuan)}</p>
                        ${kegTable('A. Pendahuluan', p.pendahuluan)}${kegTable('B. Kegiatan Inti', p.inti)}${kegTable('C. Penutup', p.penutup)}
                    </div>`).join('')}
                <div class="border border-black p-4 text-xs mb-4">
                    <h4 class="font-bold underline text-sm mb-2 text-center">LEMBAR KERJA PESERTA DIDIK (LKPD) 1.1</h4>
                    ${table(tr('Judul', esc(d.lkpd.judul)) + tr('Tujuan Pembelajaran', mjNl(c.tp.description)) + tr('Uraian Singkat', mjNl(d.lkpd.uraian)) +
                        tr('Aktivitas Peserta Didik', d.lkpd.aktivitas.map((a, i) => `${i + 1}. ${esc(a)}`).join('<br>')))}
                    <table class="w-full border-collapse border border-black text-xs text-center mb-1"><thead class="bg-slate-100"><tr><th class="border border-black p-1 w-8">No</th>${d.lkpd.kolom.map(k => `<th class="border border-black p-1">${esc(k)}</th>`).join('')}</tr></thead>
                    <tbody>${[1, 2, 3].map(n => `<tr><td class="border border-black p-1">${n}</td>${d.lkpd.kolom.map(() => '<td class="border border-black p-3"></td>').join('')}</tr>`).join('')}</tbody></table>
                </div>
                ${h('G. ASESMEN PEMBELAJARAN')}
                <div class="border border-black p-4 text-xs mb-4 space-y-4">
                    <div><b class="block mb-1">1. Asesmen Diagnostik</b>
                        <table class="w-full border-collapse border border-black text-left"><thead class="bg-slate-100"><tr><th class="${thCls} w-8">No</th><th class="${thCls}">Pertanyaan</th><th class="${thCls}">Kunci / Penilaian</th></tr></thead>
                        <tbody>${d.asesmen.diagnostik.map((q, i) => `<tr><td class="${tdCls}">${i + 1}</td><td class="${tdCls}">${mjNl(q.pertanyaan)}</td><td class="${tdCls}">${mjNl(q.kunci)}</td></tr>`).join('')}</tbody></table>
                        <p class="mt-1 text-[10px] italic">Tindak lanjut: bila skor diagnostik di bawah KKTP (${esc(c.kktp)}), siswa mendapat bimbingan awal sebelum materi inti.</p></div>
                    <div><b class="block mb-1">2. Asesmen Formatif</b>
                        <table class="w-full border-collapse border border-black text-left"><thead class="bg-slate-100"><tr><th class="${thCls}">Aspek</th><th class="${thCls}">Skor 1 (Kurang)</th><th class="${thCls}">Skor 4 (Sangat Baik)</th></tr></thead>
                        <tbody>${d.asesmen.formatif.map(f => `<tr><td class="${tdCls} font-bold">${esc(f.aspek)}</td><td class="${tdCls}">${mjNl(f.skor1)}</td><td class="${tdCls}">${mjNl(f.skor4)}</td></tr>`).join('')}</tbody></table></div>
                </div>
                ${h('H. KISI-KISI SOAL DAN CONTOH INSTRUMEN')}
                <div class="border border-black p-4 text-xs mb-4">
                    <b class="block mb-1">Kisi-Kisi Penulisan Soal:</b>
                    <table class="w-full border-collapse border border-black mb-4 text-left"><thead class="bg-slate-100"><tr><th class="${thCls} w-8 text-center">No</th><th class="${thCls}">Indikator Soal</th><th class="${thCls} w-16 text-center">Level</th><th class="${thCls} w-32">Bentuk</th></tr></thead>
                    <tbody>${d.kisi.map((k, i) => `<tr><td class="${tdCls} text-center">${i + 1}</td><td class="${tdCls}">${mjNl(k.indikator)}</td><td class="${tdCls} text-center font-bold">${esc(k.level)}</td><td class="${tdCls}">${esc(k.bentuk)}</td></tr>`).join('')}</tbody></table>
                    <b class="block mb-2">Contoh Butir Soal:</b>
                    <div class="bg-slate-50 p-3 border border-slate-200 rounded space-y-3 leading-relaxed">${d.contoh_soal.map((q, i) => `<div><p><b>${i + 1}. (${esc(q.bentuk)})</b> ${mjNl(q.soal)}<br><i class="text-blue-700 font-bold">Kunci: ${mjNl(q.kunci)}</i></p></div>`).join('')}</div>
                    <p class="mt-2 italic text-[10px]">Butir soal lengkap dapat disusun di menu Bank Soal.</p>
                </div>
                ${h('I. PENGAYAAN DAN REMEDIAL')}
                <div class="border border-black p-4 text-xs mb-4">
                    <p class="mb-2"><b>1. Pengayaan</b> (untuk siswa yang mencapai KKTP &gt;= ${esc(c.kktp)}): ${mjNl(d.pengayaan)}</p>
                    <p><b>2. Remedial</b> (untuk siswa di bawah KKTP ${esc(c.kktp)}): ${mjNl(d.remedial)}</p>
                </div>
                ${h('LAMPIRAN: BAHAN AJAR')}
                <div class="border border-black p-4 text-xs mb-4">
                    ${refName ? `<p class="mb-3 text-[11px] italic bg-indigo-50 text-indigo-900 p-2 border border-indigo-200">Disusun dengan merujuk dokumen: <b>${refName}</b>.</p>` : ''}
                    ${d.bahan_ajar.map(b => `<p class="mb-3"><b>${esc(b.judul)}</b><br>${mjNl(b.isi)}</p>`).join('')}
                </div>`;
        }

        async function generateModulAjarAI() {
            let tp = tpList.find(t => t.tpId === document.getElementById('genTpSelect').value);
            let model = document.getElementById('genModel').value;
            let meetings = Math.max(1, Math.min(3, parseInt(document.getElementById('genMeetings')?.value) || 2));
            if (!tp) { showModal("Peringatan", "Pilih TP terlebih dahulu.", "⚠️"); return; }
            if (!AIUI.ensureReady()) return;

            let btn = document.querySelector('button[onclick="generateModulAjarAI()"]');
            await AIUI.run(btn, 'AI menyusun modul ajar', async (signal) => {
                const pii = AIUI.pii();
                const cls = classes.find(c => c.classId === activeClassId);
                const active = periods.find(p => p.id === activePeriodId);
                const ctx = { subject: settings.subject, fase: settings.fase, kelas: cls ? cls.className : '-', kktp: Grading.config(settings).kktp };
                const t = AITasks.modul.build({ tp, model, meetings, ctx, ref: uploadedRefDoc, scrub: pii.scrub });
                const r = await AIService.generate({ task: 'modul', ...t, signal, pii });
                document.getElementById('genResultContainer').classList.remove('hidden');
                document.getElementById('genResultContent').innerHTML = renderModulAjar(r.data, {
                    tp, model, meetings, kelas: ctx.kelas, kktp: ctx.kktp,
                    period: active ? active.year : settings.academicYear, semester: active ? active.semester : settings.semester,
                    refName: uploadedRefDoc ? uploadedRefDoc.name : ''
                });
                lastGeneratedModul = { tpId: tp.tpId, model, title: `${tp.code} (${model})` };
                document.getElementById('genResultContainer').scrollIntoView({ behavior: 'smooth' });
            });
        }
