// js/modules/assignments.js
// Dipecah dari sistem_administrasi_guru.html (Tahap 0). Skrip klasik: fungsi bersifat global.
        // --- MANAJEMEN TUGAS & PENGUMPULAN (TAHAP 18) ---
        function renderAssignments() {
            let q = document.getElementById('searchAssignment')?.value.toLowerCase() || '';
            let tbody = document.getElementById('assignmentTableBody');
            let filtered = assignments.filter(a => a.title.toLowerCase().includes(q) || a.type.toLowerCase().includes(q));
            
            let total = filtered.length;
            let active = filtered.filter(a => a.status === 'Aktif').length;
            
            document.getElementById('asgTotal').innerText = total;
            document.getElementById('asgActive').innerText = active;
            
            if (!tbody) return;
            tbody.innerHTML = filtered.length ? filtered.map(a => {
                let tp = tpList.find(t => t.tpId === a.tpId);
                let tpCode = tp ? tp.code : '-';
                
                // Menghitung siswa yang sudah mengumpulkan/terlambat
                let subs = submissions.filter(s => s.assignmentId === a.id && (s.status === 'Sudah' || s.status === 'Terlambat'));
                let subCount = subs.length;
                
                let bgStat = a.status === 'Aktif' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-600';
                let rubricBadge = a.rubric ? '<span class="text-[9px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded border border-purple-200 ml-1 block mt-1 w-max">Terlampir Rubrik</span>' : '';
                
                return `
                <tr class="hover:bg-slate-50 transition">
                    <td class="p-3"><span class="px-2 py-0.5 rounded text-xs font-bold border border-slate-200 bg-white text-slate-700">${esc(a.type)}</span></td>
                    <td class="p-3 font-bold text-slate-800 leading-tight">${esc(a.title)} ${rubricBadge}</td>
                    <td class="p-3 font-semibold text-slate-600 text-xs">${esc(tpCode)}</td>
                    <td class="p-3 text-xs font-medium">${esc(a.deadline)}</td>
                    <td class="p-3 text-center"><span class="px-2 py-1 rounded-lg text-xs font-bold ${bgStat}">${a.status}</span></td>
                    <td class="p-3 text-center text-xs font-bold text-emerald-600">${subCount} / ${students.length}</td>
                    <td class="p-3 text-center">
                        <div class="flex justify-center gap-1">
                            <button onclick="openSubmissions('${a.id}')" class="text-blue-600 font-bold text-xs bg-blue-50 px-2.5 py-1.5 rounded-lg hover:bg-blue-100 shadow-sm transition">📝 Lihat/Nilai</button>
                            <button onclick="deleteAssignment('${a.id}')" class="text-red-600 font-bold text-xs bg-red-50 px-2.5 py-1.5 rounded-lg hover:bg-red-100 shadow-sm transition">Hapus</button>
                        </div>
                    </td>
                </tr>
                `;
            }).join('') : `<tr><td colspan="7" class="text-center py-8 text-slate-400 italic">Belum ada tugas atau LKPD. Klik 'Buat Tugas Baru'.</td></tr>`;
        }

        function openModalAssignment() {
            let form = document.getElementById('formAssignment');
            if(form) form.reset();
            let sel = document.getElementById('asgTpSelect');
            if(sel) sel.innerHTML = tpList.map(t => `<option value="${t.tpId}">${esc(t.code)} - ${esc(t.description.substring(0,50))}...</option>`).join('');
            
            document.getElementById('modalAssignment').classList.remove('hidden');
        }

        function generateAssignmentAI() {
            let tpId = document.getElementById('asgTpSelect').value;
            let type = document.getElementById('asgType').value;
            let tp = tpList.find(t => t.tpId === tpId);
            if(!tp) { showModal("Peringatan", "Pilih TP terlebih dahulu.", "⚠️"); return; }
            
            let btn = document.getElementById('btnGenAsgAI');
            btn.innerHTML = "⏳ AI Menyusun...";
            btn.disabled = true;

            setTimeout(() => {
                document.getElementById('asgTitle').value = `${type}: Analisis ${tp.description.split(' ')[0] || 'Materi'} Berbasis TP ${tp.code}`;
                
                let inst = `Tujuan Pembelajaran: ${tp.description}\n\n`;
                let rubric = "";

                if(type === 'LKPD') {
                    inst += `Petunjuk Pengerjaan:\n1. Amati fenomena di sekitar terkait materi.\n2. Catat hasil pengamatan pada tabel.\n3. Jawab pertanyaan pemantik berdasarkan data.\n\nPertanyaan Pemantik:\n- Mengapa fenomena tersebut bisa terjadi?\n- Kesimpulan apa yang dapat ditarik?`;
                    rubric = "1. Kelengkapan Data Pengamatan (40%)\n2. Ketepatan Analisis & Jawaban (40%)\n3. Kesimpulan & Refleksi (20%)";
                } else if(type === 'Proyek' || type === 'Hasil Karya') {
                    inst += `Tahapan Proyek:\n1. Tentukan masalah kontekstual.\n2. Rancang solusi berupa prototipe/desain.\n3. Implementasikan solusi dalam waktu 1 minggu.\n4. Presentasikan hasil akhir.\n\nKriteria Keberhasilan: Solusi harus aplikatif dan menyertakan refleksi.`;
                    rubric = "1. Perencanaan & Desain (20%)\n2. Pelaksanaan & Kolaborasi (30%)\n3. Kualitas Produk Akhir (30%)\n4. Presentasi (20%)";
                } else if (type === 'Presentasi') {
                    inst += `Instruksi Presentasi:\n1. Buat salindia (slide) materi sesuai topik.\n2. Pastikan ada pendahuluan, isi, dan kesimpulan.\n3. Waktu presentasi maksimal 10 menit per grup.`;
                    rubric = "1. Penguasaan Materi (40%)\n2. Keterampilan Komunikasi (30%)\n3. Desain Salindia/Media (20%)\n4. Tanya Jawab (10%)";
                } else {
                    inst += `Instruksi:\n1. Kerjakan tugas sesuai pedoman.\n2. Kumpulkan hasil sebelum batas waktu yang ditentukan.`;
                    rubric = "1. Pemahaman Konsep (50%)\n2. Kerapian & Sistematika (30%)\n3. Ketepatan Waktu (20%)";
                }
                
                document.getElementById('asgInstructions').value = inst;
                document.getElementById('asgRubric').value = rubric;
                
                let d = new Date();
                d.setDate(d.getDate() + 7);
                document.getElementById('asgDeadline').value = d.toISOString().split('T')[0];
                
                btn.innerHTML = "🪄 Draft via AI";
                btn.disabled = false;
            }, 1000);
        }

        function saveAssignment(e) {
            e.preventDefault();
            let title = document.getElementById('asgTitle').value.trim();
            let type = document.getElementById('asgType').value;
            let tpId = document.getElementById('asgTpSelect').value;
            let instructions = document.getElementById('asgInstructions').value.trim();
            let rubric = document.getElementById('asgRubric').value.trim();
            let deadline = document.getElementById('asgDeadline').value;
            let status = document.getElementById('asgStatus').value;

            allAssignments.push({
                id: genId('ASG'),
                periodId: activePeriodId,
                classId: activeClassId,
                tpId, title, type, instructions, rubric, deadline, status,
                createdAt: new Date().toISOString()
            });

            saveAllData();
            loadActiveContextData();
            renderAssignments();
            document.getElementById('modalAssignment').classList.add('hidden');
            showModal("Sukses", `Tugas "${title}" beserta rubriknya berhasil disimpan.`, "✅");
        }

        function deleteAssignment(id) {
            showConfirm("Hapus tugas ini? Riwayat pengumpulan siswa untuk tugas ini juga akan terhapus.", () => {
                allAssignments = allAssignments.filter(a => a.id !== id);
                allSubmissions = allSubmissions.filter(s => s.assignmentId !== id);
                saveAllData();
                loadActiveContextData();
                renderAssignments();
            });
        }
        
        function openSubmissions(asgId) {
            let asg = assignments.find(a => a.id === asgId);
            if(!asg) return;
            document.getElementById('submTitle').innerText = "Penilaian: " + asg.title;
            document.getElementById('currentSubmAsgId').value = asgId;
            
            let tbody = document.getElementById('submissionsTableBody');
            tbody.innerHTML = students.map((s, idx) => {
                let sub = submissions.find(subm => subm.studentId === s.id && subm.assignmentId === asgId);
                let stat = sub ? sub.status : 'Belum';
                let score = sub && sub.score !== null && sub.score !== undefined ? sub.score : '';
                let fb = sub ? (sub.feedback || '') : '';
                
                return `
                <tr class="hover:bg-slate-50 transition">
                    <td class="p-3 text-xs text-slate-500 text-center">${idx + 1}</td>
                    <td class="p-3 font-bold text-slate-800">${esc(s.name)}</td>
                    <td class="p-3">
                        <select id="subm_stat_${s.id}" class="w-full border border-slate-200 rounded-lg p-1.5 text-xs font-semibold focus:outline-none focus:border-blue-400 ${stat==='Belum'?'bg-red-50 text-red-700':(stat==='Terlambat'?'bg-amber-50 text-amber-700':'bg-emerald-50 text-emerald-700')}">
                            <option value="Belum" ${stat==='Belum'?'selected':''}>Belum Kumpul</option>
                            <option value="Sudah" ${stat==='Sudah'?'selected':''}>Sudah Kumpul</option>
                            <option value="Terlambat" ${stat==='Terlambat'?'selected':''}>Terlambat</option>
                            <option value="Revisi" ${stat==='Revisi'?'selected':''}>Revisi</option>
                        </select>
                    </td>
                    <td class="p-3">
                        <input type="number" id="subm_score_${s.id}" value="${score}" max="100" min="0" placeholder="0-100" class="w-full border border-slate-200 rounded-lg p-1.5 text-xs text-center font-bold text-blue-700 focus:outline-none focus:border-blue-400">
                    </td>
                    <td class="p-3">
                        <input type="text" id="subm_fb_${s.id}" value="${esc(fb)}" placeholder="Catatan perbaikan / Apresiasi..." class="w-full border border-slate-200 rounded-lg p-1.5 text-xs focus:outline-none focus:border-blue-400">
                    </td>
                </tr>
                `;
            }).join('');
            
            document.getElementById('modalSubmissions').classList.remove('hidden');
        }

        function saveSubmissions(e) {
            e.preventDefault();
            let asgId = document.getElementById('currentSubmAsgId').value;
            let changesMade = false;

            students.forEach(s => {
                let stat = document.getElementById(`subm_stat_${s.id}`).value;
                let scoreRaw = document.getElementById(`subm_score_${s.id}`).value;
                let score = scoreRaw !== '' ? parseInt(scoreRaw) : null;
                let fb = document.getElementById(`subm_fb_${s.id}`).value.trim();
                
                let existingIdx = allSubmissions.findIndex(sub => sub.studentId === s.id && sub.assignmentId === asgId);
                
                if(stat !== 'Belum' || score !== null || fb !== '') {
                    changesMade = true;
                    if(existingIdx >= 0) {
                        allSubmissions[existingIdx].status = stat;
                        allSubmissions[existingIdx].score = score;
                        allSubmissions[existingIdx].feedback = fb;
                    } else {
                        allSubmissions.push({
                            id: genId('SUB'),
                            periodId: activePeriodId,
                            assignmentId: asgId,
                            studentId: s.id,
                            status: stat,
                            score: score,
                            feedback: fb,
                            submittedAt: new Date().toISOString().split('T')[0]
                        });
                    }
                } else if(existingIdx >= 0) {
                    // Reverted back to empty state
                    allSubmissions[existingIdx].status = 'Belum';
                    allSubmissions[existingIdx].score = null;
                    allSubmissions[existingIdx].feedback = '';
                    changesMade = true;
                }
            });
            
            if(changesMade) {
                saveAllData();
                loadActiveContextData();
                renderAssignments();
                renderPortfolio(); // Update the portfolio count if open
            }
            
            document.getElementById('modalSubmissions').classList.add('hidden');
            showModal("Berhasil Disimpan", "Data pengumpulan, nilai, dan catatan tugas telah direkap.", "✅");
        }
        
