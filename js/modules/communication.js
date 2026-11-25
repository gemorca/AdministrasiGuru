// js/modules/communication.js
// Dipecah dari sistem_administrasi_guru.html (Tahap 0). Skrip klasik: fungsi bersifat global.
        // --- TAHAP 19: KOMUNIKASI & LAYANAN ORANG TUA / WALI ---
        function switchCommTab(tabId) {
            document.querySelectorAll('.comm-content').forEach(el => el.classList.add('hidden'));
            document.querySelectorAll('.comm-tab-btn').forEach(btn => {
                btn.classList.remove('bg-white', 'text-blue-700', 'shadow-sm');
                btn.classList.add('text-slate-600');
            });
            document.getElementById(`comm-${tabId}`).classList.remove('hidden');
            let btn = document.getElementById(`btnTab${tabId.charAt(0).toUpperCase() + tabId.slice(1)}`);
            if (btn) {
                btn.classList.remove('text-slate-600');
                btn.classList.add('bg-white', 'text-blue-700', 'shadow-sm');
            }
        }

        function renderGuardians() {
            let q = document.getElementById('searchGuardian')?.value.toLowerCase() || '';
            let tbody = document.getElementById('guardianTableBody');
            if (!tbody) return;
            
            let html = '';
            students.forEach(st => {
                let stGuards = guardians.filter(g => g.studentId === st.id);
                if (stGuards.length === 0) {
                    if (st.name.toLowerCase().includes(q)) {
                        html += `<tr><td class="p-3 font-bold text-slate-800">${esc(st.name)}</td><td colspan="4" class="p-3 text-slate-400 italic text-xs">Belum ada data wali</td><td class="p-3 text-center"><button onclick="openModalGuardian('${st.id}')" class="text-blue-600 font-bold text-xs bg-blue-50 px-2.5 py-1 rounded-lg">Tambah</button></td></tr>`;
                    }
                } else {
                    stGuards.forEach(g => {
                        if (g.name.toLowerCase().includes(q) || st.name.toLowerCase().includes(q)) {
                            let statusBadge = g.isPrimary ? '<span class="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-[10px] font-bold">Utama</span>' : '<span class="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-bold">Alternatif</span>';
                            html += `
                            <tr class="hover:bg-slate-50 transition border-b border-slate-50">
                                <td class="p-3 font-bold text-slate-800">${esc(st.name)}</td>
                                <td class="p-3 font-semibold text-slate-700">${esc(g.name)}</td>
                                <td class="p-3 text-xs">${esc(g.relation)}</td>
                                <td class="p-3 text-xs font-mono">${esc(g.phone || '-')}</td>
                                <td class="p-3 text-center">${statusBadge}</td>
                                <td class="p-3 text-center">
                                    <button onclick="deleteGuardian('${g.id}')" class="text-red-600 font-bold text-xs bg-red-50 px-2.5 py-1 rounded-lg">Hapus</button>
                                </td>
                            </tr>`;
                        }
                    });
                }
            });
            tbody.innerHTML = html || `<tr><td colspan="6" class="text-center py-8 text-slate-400 italic">Tidak ada data wali yang cocok.</td></tr>`;
        }

        function openModalGuardian(prefillStudentId = null) {
            let form = document.getElementById('formGuardian');
            if(form) form.reset();
            let sel = document.getElementById('grdStudentId');
            if(sel) {
                sel.innerHTML = students.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
                if (prefillStudentId) sel.value = prefillStudentId;
            }
            document.getElementById('modalGuardian').classList.remove('hidden');
        }

        function saveGuardian(e) {
            e.preventDefault();
            let studentId = document.getElementById('grdStudentId').value;
            let name = document.getElementById('grdName').value.trim();
            let relation = document.getElementById('grdRelation').value;
            let phone = document.getElementById('grdPhone').value.trim();
            let isPrimary = document.getElementById('grdPrimary').checked;

            allGuardians.push({
                id: genId('GRD'),
                periodId: activePeriodId,
                studentId, name, relation, phone, isPrimary
            });
            saveAllData();
            loadActiveContextData();
            renderGuardians();
            document.getElementById('modalGuardian').classList.add('hidden');
            showModal("Sukses", `Data wali untuk ${name} berhasil disimpan.`, "✅");
        }

        function deleteGuardian(id) {
            showConfirm("Apakah Anda yakin menghapus kontak wali ini?" + Integrity.describe(Integrity.guardianDeps(id)), () => {
                Integrity.cascadeGuardian(id);
                saveAllData();
                loadActiveContextData();
                renderGuardians();
            });
        }

        function renderCommunications() {
            let q = document.getElementById('searchComm')?.value.toLowerCase() || '';
            let tbody = document.getElementById('communicationTableBody');
            if (!tbody) return;
            
            let filtered = communications.filter(c => c.topic.toLowerCase().includes(q) || c.summary.toLowerCase().includes(q));
            
            tbody.innerHTML = filtered.length ? filtered.map(c => {
                let st = students.find(s => s.id === c.studentId);
                let gd = guardians.find(g => g.id === c.guardianId);
                let stName = st ? st.name : 'Unknown';
                let gdName = gd ? gd.name : 'Unknown';
                let bgStat = c.status === 'Selesai' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700';
                
                return `
                <tr class="hover:bg-slate-50 transition border-b border-slate-50">
                    <td class="p-3 text-xs font-semibold">${c.date}</td>
                    <td class="p-3 font-bold text-slate-800">${esc(stName)}</td>
                    <td class="p-3 text-xs text-slate-600">${esc(gdName)}</td>
                    <td class="p-3 text-xs"><b>${esc(c.type)}</b>: ${esc(c.topic)}</td>
                    <td class="p-3 text-xs line-clamp-2">${esc(c.followUp || '-')}</td>
                    <td class="p-3 text-center"><span class="px-2 py-1 rounded-lg text-[10px] font-bold ${bgStat}">${c.status}</span></td>
                    <td class="p-3 text-center">
                        <button onclick="deleteCommunication('${c.id}')" class="text-red-600 font-bold text-xs bg-red-50 px-2 py-1 rounded-lg">Hapus</button>
                    </td>
                </tr>`;
            }).join('') : `<tr><td colspan="7" class="text-center py-8 text-slate-400 italic">Belum ada riwayat komunikasi.</td></tr>`;
        }

        function updateCommGuardianOptions(stId) {
            let sel = document.getElementById('comGuardianId');
            if (!sel) return;
            let stGuards = guardians.filter(g => g.studentId === stId);
            sel.innerHTML = stGuards.length ? stGuards.map(g => `<option value="${g.id}">${esc(g.name)} (${esc(g.relation)})</option>`).join('') : '<option value="">(Tidak ada data wali)</option>';
        }

        function openModalCommunication() {
            let form = document.getElementById('formCommunication');
            if(form) form.reset();
            
            let selSt = document.getElementById('comStudentId');
            if(selSt) {
                selSt.innerHTML = students.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
                if (students.length > 0) updateCommGuardianOptions(students[0].id);
            }
            
            let d = document.getElementById('comDate');
            if(d) d.value = new Date().toISOString().split('T')[0];
            
            document.getElementById('modalCommunication').classList.remove('hidden');
        }

        function saveCommunication(e) {
            e.preventDefault();
            let studentId = document.getElementById('comStudentId').value;
            let guardianId = document.getElementById('comGuardianId').value;
            
            if (!guardianId) {
                showModal("Perhatian", "Peserta didik ini belum memiliki data wali. Harap tambahkan di tab Data Wali terlebih dahulu.", "⚠️");
                return;
            }

            allCommunications.push({
                id: genId('COM'),
                periodId: activePeriodId,
                classId: activeClassId,
                studentId, guardianId,
                date: document.getElementById('comDate').value,
                type: document.getElementById('comType').value,
                topic: document.getElementById('comTopic').value,
                summary: document.getElementById('comSummary').value.trim(),
                followUp: document.getElementById('comFollowUp').value.trim(),
                status: document.getElementById('comStatus').value
            });

            saveAllData();
            loadActiveContextData();
            renderCommunications();
            document.getElementById('modalCommunication').classList.add('hidden');
            showModal("Sukses", "Catatan komunikasi wali berhasil disimpan.", "✅");
        }

        function deleteCommunication(id) {
            showConfirm("Hapus catatan komunikasi ini?", () => {
                allCommunications = allCommunications.filter(c => c.id !== id);
                saveAllData();
                loadActiveContextData();
                renderCommunications();
            });
        }

        function renderStudentProgress(stId) {
            let st = students.find(s => s.id === stId);
            if (!st) return;

            // Identity
            document.getElementById('prName').innerText = st.name;
            document.getElementById('prNis').innerText = st.nis;
            document.getElementById('prClass').innerText = st.class;
            let active = periods.find(p => p.id === activePeriodId);
            document.getElementById('prPeriod').innerText = active ? `${active.semester} / ${active.year}` : '-';
            document.getElementById('prTeacher').innerText = settings.teacher;
            
            let primGuard = guardians.find(g => g.studentId === st.id && g.isPrimary) || guardians.find(g => g.studentId === st.id);
            document.getElementById('prGuardian').innerText = primGuard ? primGuard.name : 'Belum Ada Data';

            // Stats
            let att = calcAttStats(st.id);
            document.getElementById('prAttPct').innerText = `${att.pct}%`;

            let r = calcFinalScore(st.id);
            document.getElementById('prAvgScore').innerText = r.final !== null ? r.final : '0';
            
            if (r.final !== null) {
                document.getElementById('prPassStatus').innerHTML = r.passed ? '<span class="text-emerald-600">TUNTAS</span>' : '<span class="text-red-600">BELUM</span>';
            } else {
                document.getElementById('prPassStatus').innerHTML = '-';
            }

            // Tasks
            let stSubs = submissions.filter(s => s.studentId === st.id);
            document.getElementById('prTaskCount').innerText = `${stSubs.length} / ${assignments.length}`;

            // Communication History
            let stComms = communications.filter(c => c.studentId === st.id);
            let commList = document.getElementById('prCommList');
            if (commList) {
                commList.innerHTML = stComms.length ? stComms.map(c => `
                    <li><b>${c.date} (${esc(c.type)})</b>: Membahas ${esc(c.topic)}. <i>Tindak lanjut: ${esc(c.followUp || 'Tidak ada spesifik')}</i>. [${c.status}]</li>
                `).join('') : `<li class="italic text-slate-400">Belum ada riwayat komunikasi tercatat pada periode ini.</li>`;
            }
            
            // Clear or Set Narrative
            let descObj = allRaporDescriptions.find(d => d.studentId === st.id && d.periodId === activePeriodId);
            let narEl = document.getElementById('prNarrative');
            if (narEl) narEl.value = descObj ? descObj.text : "";
        }

        async function generateProgressAI() {
            let stId = document.getElementById('progStudentSelect').value;
            let st = students.find(s => s.id === stId);
            if (!st) return;
            if (!AIUI.ensureReady()) return;

            let btn = document.querySelector('button[onclick="generateProgressAI()"]');
            let out = await AIUI.run(btn, 'AI menyusun', async (signal) => {
                const pii = AIUI.pii();
                const row = { code: pii.code(st.id), ...aiFactsOf(st.id) };
                const ctx = { subject: settings.subject, kktp: Grading.config(settings).kktp };
                const t = AITasks.progress.build({ row, ctx });
                const r = await AIService.generate({ task: 'laporan-wali', ...t, signal, pii });
                return pii.restore(String(r.data.laporan).trim());
            });
            if (!out) return;
            // Draf saja: masuk ke kolom teks, belum tersimpan sampai guru menekan Simpan.
            document.getElementById('prNarrative').value = out;
            showModal("Draf Siap", "Draf laporan perkembangan sudah masuk ke kolom catatan. Periksa dan ubah bila perlu, lalu tekan Simpan Catatan.", "✨");
        }

        function saveProgressNarrative() {
            let stId = document.getElementById('progStudentSelect').value;
            let st = students.find(s => s.id === stId);
            if (!st) return;
            let text = document.getElementById('prNarrative').value.trim();
            if (!text) { showModal("Peringatan", "Catatan masih kosong.", "⚠️"); return; }
            let doSave = () => {
                let idx = allRaporDescriptions.findIndex(d => d.studentId === st.id && d.periodId === activePeriodId);
                if (idx >= 0) allRaporDescriptions[idx].text = text;
                else allRaporDescriptions.push({ id: genId('RD'), studentId: st.id, periodId: activePeriodId, text });
                saveAllData(); loadActiveContextData();
                showModal("Tersimpan", "Catatan perkembangan disimpan.", "✅");
            };
            let old = allRaporDescriptions.find(d => d.studentId === st.id && d.periodId === activePeriodId);
            if (old && old.text !== text) showConfirm("Catatan ini dipakai juga sebagai narasi rapor siswa tersebut. Timpa narasi yang sudah ada?", doSave);
            else doSave();
        }
