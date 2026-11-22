// js/modules/curriculum.js
// Dipecah dari sistem_administrasi_guru.html (Tahap 0). Skrip klasik: fungsi bersifat global.
        function importTP(e) {
            let file = e.target.files[0];
            if (!file) return;
            
            let reader = new FileReader();
            reader.onload = function(evt) {
                let lines = evt.target.result.split('\n').map(l => l.trim()).filter(l => l.length > 3);
                if(lines.length === 0) {
                    showModal("Gagal", "File kosong atau format tidak valid.", "❌");
                    return;
                }

                let cpId = genId('CP-MANUAL');
                let description = "Capaian Pembelajaran (Berdasarkan TP Unggahan Mandiri)";
                let content = "Materi Kustom (Unggahan)";
                let uniTp = lines.map((l, i) => `${i+1}. ${l}`).join('\n');
                
                // Menyimpan CP sebagai wadah utama
                allCP.push({
                    cpId, periodId: activePeriodId, element: "Materi Utama", description, cogLevel: 'C3 (Menerapkan)', 
                    competence: "Menyesuaikan TP", content, uniTp, uniAtp: "-", uniIktp: uniTp, uniKktp: "-"
                });

                // Memecah menjadi baris TP tunggal agar masuk ke Generator
                lines.forEach((line, idx) => {
                    let tpId_new = 'TP-' + cpId + '-' + (idx + 1);
                    let code = 'TP-M.' + (idx + 1);
                    let desc = line.replace(/^\d+\.\s*/, '').trim(); // Hapus nomor di awal jika ada
                    allTP.push({
                        tpId: tpId_new, periodId: activePeriodId, cpId: cpId, code: code, hours: 2,
                        description: desc, atp: "-", iktp: desc, kktp: "-"
                    });
                });
                
                saveAllData();
                loadActiveContextData();
                renderCurriculum();
                renderGeneratorTab();
                showModal("Sukses", `Berhasil mengunggah dan memproses ${lines.length} Tujuan Pembelajaran secara mandiri. TP kini tersedia di Kurikulum dan Generator Modul Ajar.`, "✅");
            };
            reader.readAsText(file);
            e.target.value = ''; // Reset form agar bisa upload ulang
        }

        function renderCurriculum() {
            let tbody = document.getElementById('curriculumTableBody');
            if (!tbody) return;
            
            tbody.innerHTML = cpList.length ? cpList.map(cp => `
                <tr class="hover:bg-slate-50 transition border-b border-slate-300">
                    <td class="border border-slate-300 p-3 align-top">
                        <div class="text-xs text-slate-700 text-justify">${formatCell(cp.description)}</div>
                    </td>
                    <td class="border border-slate-300 p-3 align-top">
                        <div class="text-xs text-blue-700 font-semibold">${formatCell(cp.competence)}</div>
                    </td>
                    <td class="border border-slate-300 p-3 align-top text-center">
                        <span class="inline-block bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold text-[11px] px-2 py-1 rounded-lg">${cp.cogLevel || 'C3 (Menerapkan)'}</span>
                    </td>
                    <td class="border border-slate-300 p-3 align-top">
                        <div class="text-xs text-emerald-700 font-semibold">${formatCell(cp.content)}</div>
                    </td>
                    <td class="border border-slate-300 p-3 align-top">
                        <div class="text-xs text-slate-800 font-medium">${formatCell(cp.uniTp)}</div>
                    </td>
                    <td class="border border-slate-300 p-3 align-top">
                        <div class="text-xs text-slate-600">${formatCell(cp.uniAtp)}</div>
                    </td>
                    <td class="border border-slate-300 p-3 align-top">
                        <div class="text-xs text-slate-800 font-medium">${formatCell(cp.uniIktp)}</div>
                    </td>
                    <td class="border border-slate-300 p-3 align-top">
                        <div class="text-xs text-slate-600">${formatCell(cp.uniKktp)}</div>
                    </td>
                    <td class="border border-slate-300 p-3 align-middle text-center no-print">
                        <div class="flex flex-col gap-1.5 justify-center items-center">
                            <button onclick="openAnalisisCP('${cp.cpId}')" class="bg-blue-100 text-blue-700 hover:bg-blue-200 px-3 py-1.5 rounded-lg text-xs font-bold w-full transition border border-blue-200">✏️ Edit</button>
                            <button onclick="deleteCPUnified('${cp.cpId}')" class="bg-red-100 text-red-700 hover:bg-red-200 px-3 py-1.5 rounded-lg text-xs font-bold w-full transition border border-red-200">🗑️ Hapus</button>
                        </div>
                    </td>
                </tr>
            `).join('') : `<tr><td colspan="9" class="text-center py-10 text-slate-400 italic">Belum ada data Kurikulum. Klik tombol '+ Tambah Analisis CP' di atas.</td></tr>`;
        }

        function openAnalisisCP(id = null) {
            let form = document.getElementById('formCPUnified');
            if(form) form.reset();
            let elId = document.getElementById('uniCpId');
            if(elId) elId.value = '';
            
            if(id && typeof id === 'string') {
                let c = allCP.find(x => x.cpId === id);
                if(c) {
                    if(elId) elId.value = c.cpId;
                    document.getElementById('uniCpDesc').value = c.description || '';
                    if (document.getElementById('uniSpecificTopic')) document.getElementById('uniSpecificTopic').value = (c.element && c.element !== "Materi Utama") ? c.element : '';
                    if (document.getElementById('uniCogLevel')) document.getElementById('uniCogLevel').value = c.cogLevel || 'C3 (Menerapkan)';
                    document.getElementById('uniComp').value = c.competence || '';
                    document.getElementById('uniMat').value = c.content || '';
                    document.getElementById('uniTp').value = c.uniTp || '';
                    document.getElementById('uniAtp').value = c.uniAtp || '';
                    document.getElementById('uniIktp').value = c.uniIktp || '';
                    document.getElementById('uniKktp').value = c.uniKktp || '';
                }
            }
            
            let cpRefInd = document.getElementById('cpRefIndicator');
            let cpRefName = document.getElementById('cpRefName');
            if(cpRefInd && cpRefName) {
                if(uploadedRefName) {
                    cpRefName.innerText = uploadedRefName;
                    cpRefInd.classList.remove('hidden');
                } else {
                    cpRefInd.classList.add('hidden');
                }
            }
            
            switchView('analisis-cp');
        }

        async function analyzeAndGenerateAllAI() {
            let desc = document.getElementById('uniCpDesc').value.trim();
            let specificTopic = document.getElementById('uniSpecificTopic').value.trim();
            if(!desc) { showModal("Peringatan", "Tempelkan (Paste) Teks Capaian Pembelajaran (CP) terlebih dahulu sebelum diklik Analisis.", "⚠️"); return; }
            if (!AIUI.ensureReady()) return;

            let btn = document.getElementById('btnGenAllAI');
            await AIUI.run(btn, 'AI menganalisis CP', async (signal) => {
                const pii = AIUI.pii();
                const t = AITasks.cp.build({
                    desc: pii.scrub(desc), topic: pii.scrub(specificTopic),
                    subject: settings.subject, fase: settings.fase, ref: uploadedRefDoc, scrub: pii.scrub
                });
                const r = await AIService.generate({ task: 'cp', ...t, validate: d => AITasks.cp.validate(d), signal, pii });
                const f = AITasks.cp.toFields(r.data);
                document.getElementById('uniComp').value = f.comp;
                document.getElementById('uniMat').value = f.mat;
                document.getElementById('uniTp').value = f.tp;
                document.getElementById('uniAtp').value = f.atp;
                document.getElementById('uniIktp').value = f.iktp;
                document.getElementById('uniKktp').value = f.kktp;
                let lv = document.getElementById('uniCogLevel');
                if (lv) lv.value = f.cogLevel;
                showModal("Draf Siap Ditinjau", `AI menyusun ${f.count} Tujuan Pembelajaran berjenjang${uploadedRefDoc ? ' dengan merujuk "' + uploadedRefDoc.name + '"' : ''}. Ini draf: periksa dan ubah bila perlu, lalu klik Simpan.`, "✅");
            });
        }

        function saveCPUnified(e) {
            e.preventDefault();
            let elId = document.getElementById('uniCpId');
            let cpId = (elId && elId.value) ? elId.value : genId('CP');
            let description = document.getElementById('uniCpDesc').value.trim();
            let element = document.getElementById('uniSpecificTopic').value.trim() || "Materi Utama";
            let cogLevel = document.getElementById('uniCogLevel') ? document.getElementById('uniCogLevel').value : 'C3 (Menerapkan)';
            let competence = document.getElementById('uniComp').value.trim();
            let content = document.getElementById('uniMat').value.trim();
            let uniTp = document.getElementById('uniTp').value.trim();
            let uniAtp = document.getElementById('uniAtp').value.trim();
            let uniIktp = document.getElementById('uniIktp').value.trim();
            let uniKktp = document.getElementById('uniKktp').value.trim();
            
            let existingIdx = allCP.findIndex(c => c.cpId === cpId);
            if(existingIdx >= 0) {
                allCP[existingIdx].description = description;
                allCP[existingIdx].element = element;
                allCP[existingIdx].cogLevel = cogLevel;
                allCP[existingIdx].competence = competence;
                allCP[existingIdx].content = content;
                allCP[existingIdx].uniTp = uniTp;
                allCP[existingIdx].uniAtp = uniAtp;
                allCP[existingIdx].uniIktp = uniIktp;
                allCP[existingIdx].uniKktp = uniKktp;
            } else {
                allCP.push({ cpId, periodId: activePeriodId, element, description, cogLevel, competence, content, uniTp, uniAtp, uniIktp, uniKktp });
            }
            
            // Auto sinkronisasi ke tabel allTP: memecah setiap baris Tujuan Pembelajaran menjadi TP terpisah!
            allTP = allTP.filter(t => t.cpId !== cpId); // Hapus TP lama terkait CP ini untuk diperbarui
            
            let tpLines = uniTp.split('\n').filter(l => l.trim().length > 0);
            let atpLines = uniAtp.split('\n').filter(l => l.trim().length > 0);
            let iktpLines = uniIktp.split('\n').filter(l => l.trim().length > 0);
            let kktpLines = uniKktp.split('\n').filter(l => l.trim().length > 0);
            
            tpLines.forEach((line, idx) => {
                let tpId_new = 'TP-' + cpId + '-' + (idx + 1);
                let code = 'TP-' + cpId.toString().slice(-4) + '.' + (idx + 1);
                
                // Membersihkan nomor di awal (misal "1. ")
                let desc = line.replace(/^\d+\.\s*/, '').trim();
                let atp = atpLines[idx] ? atpLines[idx].replace(/^\d+\.\s*/, '').trim() : '';
                let iktp = iktpLines[idx] ? iktpLines[idx].replace(/^\d+\.\s*/, '').trim() : '';
                let kktp = kktpLines[idx] ? kktpLines[idx].replace(/^\d+\.\s*/, '').trim() : '';
                
                allTP.push({ 
                    tpId: tpId_new, 
                    periodId: activePeriodId, 
                    cpId: cpId, 
                    code: code, 
                    hours: 2, 
                    description: desc, 
                    atp: atp, 
                    iktp: iktp, 
                    kktp: kktp 
                });
            });

            saveAllData();
            loadActiveContextData();
            switchView('curriculum');
            renderGeneratorTab(); // Segarkan dropdown di Modul Ajar agar muncul satu per satu
            showModal("Sukses Menyimpan", "Seluruh rancangan kurikulum berhasil direkam. TP telah dipisah satu per satu berdasarkan level kognitifnya!", "✅");
        }

        function deleteCPUnified(id) {
            showConfirm("Apakah Anda yakin menghapus data kurikulum ini secara permanen?" + Integrity.describeDetach(Integrity.cpDeps(id)), () => {
                Integrity.cascadeCp(id);
                saveAllData();
                loadActiveContextData();
                renderCurriculum();
                renderGeneratorTab();
            });
        }

