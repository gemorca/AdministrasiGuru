// js/modules/p5.js
// Dipecah dari sistem_administrasi_guru.html (Tahap 0). Skrip klasik: fungsi bersifat global.
        function updateProyekTopics() {
            let tema = document.getElementById('aiProyekTema').value;
            let topics = P5_THEMES[tema] || [];
            let sel = document.getElementById('aiProyekTopicSelect');
            if (sel) {
                sel.innerHTML = topics.map(t => `<option value="${t}">${t}</option>`).join('');
                checkCustomTopic(sel.value);
            }
        }

        function checkCustomTopic(val) {
            let input = document.getElementById('aiProyekTopic');
            if(val === "Lainnya...") {
                input.classList.remove('hidden');
                input.required = true;
                input.value = "";
            } else {
                input.classList.add('hidden');
                input.required = false;
                input.value = val;
            }
        }

        // --- PROYEK DIMENSI PROFIL LULUSAN (AI) ---
        function renderP5() {
            let q = document.getElementById('searchP5')?.value.toLowerCase() || '';
            let tbody = document.getElementById('p5TableBody');
            let filtered = p5List.filter(p => (p.title || '').toLowerCase().includes(q) || (p.dimension || '').toLowerCase().includes(q));
            if (!tbody) return;
            tbody.innerHTML = filtered.length ? filtered.map((p, idx) => `
                <tr class="hover:bg-slate-50 transition">
                    <td class="p-3 font-medium text-slate-500">${idx + 1}</td>
                    <td class="p-3 font-bold text-indigo-700">${esc(p.title || p.topic)}</td>
                    <td class="p-3 font-semibold text-slate-700">
                        <span class="block text-[10px] text-slate-400 uppercase">${esc(p.theme || '-')}</span>
                        ${esc(p.topic)}
                    </td>
                    <td class="p-3 text-xs font-bold text-emerald-700"><span class="bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100">${esc(p.dimension)}</span></td>
                    <td class="p-3 text-xs text-slate-600 line-clamp-2">${esc(p.description || '-')}</td>
                    <td class="p-3 text-center flex gap-1 justify-center">
                        <button data-ai onclick="generateModulP5AI('${p.id}')" id="btnGenP5Modul_${p.id}" class="text-white font-bold text-[10px] bg-indigo-600 border border-indigo-700 px-2.5 py-1.5 rounded-lg hover:bg-indigo-700 transition shadow-sm">Modul AI</button>
                        <button onclick="deleteP5('${p.id}')" class="text-red-600 font-bold text-[10px] bg-red-50 border border-red-100 px-2.5 py-1.5 rounded-lg hover:bg-red-100 transition shadow-sm">Hapus</button>
                    </td>
                </tr>
            `).join('') : `<tr><td colspan="6" class="text-center py-8 text-slate-400 italic">Belum ada Proyek Profil Lulusan yang digenerate. Klik 'Generate Proyek AI'.</td></tr>`;
        }

        function openModalProyekAI() {
            let form = document.getElementById('formProyekAI');
            if(form) form.reset();
            updateProyekTopics(); // Inisialisasi topik berdasarkan tema awal
            let modal = document.getElementById('modalProyekAI');
            if(modal) modal.classList.remove('hidden');
        }

        async function processGenerateProyekAI(e) {
            e.preventDefault();
            let tema = document.getElementById('aiProyekTema').value;
            let topicSelect = document.getElementById('aiProyekTopicSelect').value;
            let topic = topicSelect === "Lainnya..." ? document.getElementById('aiProyekTopic').value.trim() : topicSelect;
            let dimension = document.getElementById('aiProyekDimension').value;
            let scale = document.getElementById('aiProyekScale').value;
            if (!topic) { showModal("Peringatan", "Isi topik proyek terlebih dahulu.", "⚠️"); return; }
            if (!AIUI.ensureReady()) return;

            let btn = document.getElementById('btnGenProyekAI');
            let d = await AIUI.run(btn, 'AI merancang proyek', async (signal) => {
                const pii = AIUI.pii();
                const cls = classes.find(c => c.classId === activeClassId);
                const t = AITasks.p5.build({ tema, topik: pii.scrub(topic), dimensi: dimension, skala: scale, fase: settings.fase, kelas: cls ? cls.className : '', subject: settings.subject });
                const r = await AIService.generate({ task: 'p5', ...t, validate: AITasks.p5.validate, signal, pii });
                return r.data;
            });
            if (!d) return;
            AIUI.review({
                title: 'Draf Proyek P5', info: 'Ini draf dari AI. Periksa lalu simpan; tidak ada yang tersimpan sebelum Anda menyetujui.', saveLabel: 'Simpan Proyek',
                items: [`<div class="font-bold text-indigo-700">${esc(d.judul)}</div>
                    <div class="text-xs text-slate-500 mb-1">${esc(tema)} · ${esc(topic)} · ${esc(dimension)} · ${esc(scale)}</div>
                    <div class="mb-1">${esc(d.deskripsi)}</div>
                    <div class="text-xs"><b>Tujuan:</b><ul class="list-disc pl-5">${d.tujuan.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
                    <div class="text-xs"><b>Tahapan:</b><ol class="list-decimal pl-5">${d.tahapan.map(x => `<li><b>${esc(x.nama)}:</b> ${esc(x.kegiatan)}</li>`).join('')}</ol></div>
                    <div class="text-xs"><b>Produk akhir:</b> ${esc(d.produk_akhir)}</div>`],
                onSave: () => {
                    allP5Projects.push({
                        id: genId('PROYEK'), periodId: activePeriodId, theme: tema, topic, title: d.judul, description: d.deskripsi,
                        dimension, scale, phase: settings.fase || 'D',
                        goals: d.tujuan, stages: d.tahapan, product: d.produk_akhir, subElements: d.sub_elemen, source: 'ai'
                    });
                    saveAllData(); loadActiveContextData(); renderP5();
                    document.getElementById('modalProyekAI').classList.add('hidden');
                    showModal("Tersimpan", "Proyek tersimpan. Klik tombol modul pada daftar untuk menyusun Modul Proyek.", "✅");
                }
            });
        }

        function deleteP5(id) {
            showConfirm("Apakah Anda yakin ingin menghapus perencanaan Proyek Profil Lulusan ini?", () => {
                allP5Projects = allP5Projects.filter(p => p.id !== id);
                saveAllData();
                loadActiveContextData();
                renderP5();
                document.getElementById('p5ModuleContainer').classList.add('hidden');
            });
        }
        
        function renderModulP5(d, p, c) {
            const thCls = "border border-black p-2 font-bold bg-indigo-50 align-top text-indigo-900";
            const tdCls = "border border-black p-2 align-top";
            const tr = (lbl, val) => `<tr><td class="${thCls} w-1/4">${lbl}</td><td class="${tdCls}">${val}</td></tr>`;
            const h = t => `<h6 class="font-bold text-sm bg-indigo-100 text-indigo-900 p-2 border border-black uppercase mt-4">${t}</h6>`;
            const nl = t => esc(t).replace(/\n/g, '<br>');
            const ul = a => '<ul class="list-disc pl-5">' + a.map(x => `<li>${esc(x)}</li>`).join('') + '</ul>';
            return `
                <div class="no-print bg-amber-50 border border-amber-200 text-amber-900 text-[11px] rounded-lg p-2 mb-4">Dibuat dengan AI (Gemini): mohon diperiksa dan disesuaikan sebelum dipakai.</div>
                <div class="text-center mb-6">
                    <h4 class="font-bold text-lg uppercase text-slate-900">MODUL PROYEK PENGUATAN PROFIL LULUSAN</h4>
                    <h5 class="font-bold text-md text-slate-700">Tema: ${esc(p.theme || '-')}</h5>
                    <h5 class="font-bold text-md text-indigo-800">${esc(d.judul)}</h5>
                </div>
                ${h('A. IDENTITAS')}
                <table class="w-full text-xs text-left border-collapse border border-black mb-4"><tbody>
                    ${tr('Nama Sekolah', ': ' + esc(settings.school))}${tr('Penyusun', ': ' + esc(settings.teacher))}${tr('Fase / Kelas', ': ' + esc(settings.fase) + ' / ' + esc(c.kelas))}
                    ${tr('Tahun Pelajaran', ': ' + esc(c.period))}${tr('Topik', ': ' + esc(p.topic))}${tr('Alokasi / Skala', ': ' + esc(p.scale || '-'))}
                </tbody></table>
                ${h('B. LATAR BELAKANG')}<div class="border border-black p-3 text-xs mb-4">${nl(d.latar)}</div>
                ${h('C. TUJUAN PROYEK')}<div class="border border-black p-3 text-xs mb-4">${ul(d.tujuan)}</div>
                ${h('D. DIMENSI, SUB-ELEMEN, DAN INDIKATOR')}
                <table class="w-full text-xs text-left border-collapse border border-black mb-4"><thead><tr><th class="${thCls}">Dimensi</th><th class="${thCls}">Sub-elemen</th><th class="${thCls}">Indikator</th></tr></thead>
                <tbody>${d.dimensi.map(x => `<tr><td class="${tdCls}">${esc(x.dimensi)}</td><td class="${tdCls}">${esc(x.sub_elemen)}</td><td class="${tdCls}">${nl(x.indikator)}</td></tr>`).join('')}</tbody></table>
                ${h('E. TAHAPAN KEGIATAN')}
                <table class="w-full text-xs text-left border-collapse border border-black mb-4"><thead><tr><th class="${thCls} w-8">No</th><th class="${thCls}">Tahap</th><th class="${thCls} w-24">Waktu</th><th class="${thCls}">Kegiatan</th><th class="${thCls}">Hasil</th></tr></thead>
                <tbody>${d.tahapan.map((x, i) => `<tr><td class="${tdCls}">${i + 1}</td><td class="${tdCls} font-bold">${esc(x.tahap)}</td><td class="${tdCls}">${esc(x.waktu)}</td><td class="${tdCls}">${nl(x.kegiatan)}</td><td class="${tdCls}">${nl(x.hasil)}</td></tr>`).join('')}</tbody></table>
                ${h('F. PRODUK AKHIR')}<div class="border border-black p-3 text-xs mb-4">${nl(d.produk)}</div>
                ${h('G. ASESMEN')}
                <div class="border border-black p-3 text-xs mb-4"><b>Formatif:</b>${ul(d.asesmen.formatif)}<b class="block mt-2">Sumatif:</b>${ul(d.asesmen.sumatif)}</div>
                ${h('H. RUBRIK PENILAIAN')}
                <table class="w-full text-xs text-left border-collapse border border-black mb-4"><thead><tr><th class="${thCls}">Aspek</th><th class="${thCls}">Skor 1</th><th class="${thCls}">Skor 2</th><th class="${thCls}">Skor 3</th><th class="${thCls}">Skor 4</th></tr></thead>
                <tbody>${d.rubrik.map(r => `<tr><td class="${tdCls} font-bold">${esc(r.aspek)}</td><td class="${tdCls}">${nl(r.skor1)}</td><td class="${tdCls}">${nl(r.skor2)}</td><td class="${tdCls}">${nl(r.skor3)}</td><td class="${tdCls}">${nl(r.skor4)}</td></tr>`).join('')}</tbody></table>
                ${h('I. REFLEKSI')}<div class="border border-black p-3 text-xs mb-4">${ul(d.refleksi)}</div>
                ${h('J. KATA KUNCI PENCARIAN SUMBER BELAJAR')}<div class="border border-black p-3 text-xs mb-6">${d.kata_kunci.map(k => `<span class="inline-block bg-slate-100 border border-slate-300 rounded px-2 py-0.5 mr-1 mb-1">${esc(k)}</span>`).join('')}</div>
                <div class="grid grid-cols-2 gap-8 text-xs text-center mt-8">
                    <div><p>Mengetahui,</p><p>Kepala Sekolah</p><br><br><br><br><p class="underline font-bold">${esc(settings.principal)}</p><p>NIP. ${esc(settings.nipPrincipal)}</p></div>
                    <div><p>....................., ....................</p><p>Koordinator Proyek</p><br><br><br><br><p class="underline font-bold">${esc(settings.teacher)}</p><p>NIP. ${esc(settings.nipTeacher)}</p></div>
                </div>`;
        }

        async function generateModulP5AI(id) {
            let p = p5List.find(x => x.id === id);
            if (!p) return;
            if (!AIUI.ensureReady()) return;
            let btn = document.getElementById(`btnGenP5Modul_${id}`);
            await AIUI.run(btn, 'AI menyusun modul', async (signal) => {
                const pii = AIUI.pii();
                const cls = classes.find(c => c.classId === activeClassId);
                const active = periods.find(per => per.id === activePeriodId);
                const ctx = { subject: settings.subject, fase: settings.fase, kelas: cls ? cls.className : '-' };
                const t = AITasks.p5modul.build({ proyek: p, ctx });
                const r = await AIService.generate({ task: 'p5modul', ...t, signal, pii });
                document.getElementById('p5ModuleContent').innerHTML = renderModulP5(r.data, p, { kelas: ctx.kelas, period: active ? active.year : settings.academicYear });
                let container = document.getElementById('p5ModuleContainer');
                container.classList.remove('hidden');
                setTimeout(() => container.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
            });
        }

        function downloadModulP5Doc() {
            let content = document.getElementById('p5ModuleContent').innerHTML;
            if(!content || content.trim() === '') {
                showModal("Peringatan", "Modul Proyek belum digenerate.", "⚠️");
                return;
            }
            
            let preHtml = "<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>Modul Proyek P5</title></head><body>";
            let postHtml = "</body></html>";
            let html = preHtml + content + postHtml;

            let blob = new Blob(['\ufeff', html], { type: 'application/msword' });
            
            let link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            
            let clsObj = classes.find(c => c.classId === activeClassId);
            let clsName = clsObj ? clsObj.className : '';
            link.download = `Modul_Proyek_P5_${clsName}.doc`;
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }

