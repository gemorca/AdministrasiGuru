// js/modules/classes.js
// Dipecah dari sistem_administrasi_guru.html (Tahap 0). Skrip klasik: fungsi bersifat global.
        function requireAdminClassAction() {
            if (typeof Cloud !== 'undefined' && !Cloud.isAdmin()) {
                showModal("Akses Dibatasi", "Daftar kelas dan rombel merupakan data sekolah yang dikelola oleh Admin Sekolah.", "🔒");
                return false;
            }
            return true;
        }

        function renderClasses() {
            let tbody = document.getElementById('classListBody');
            if (!tbody) return;
            const hideAct = (typeof Cloud !== 'undefined' && !Cloud.isAdmin()) ? 'hidden' : '';
            tbody.innerHTML = classes.length ? classes.map(c => {
                let count = allStudents.filter(s => s.periodId === activePeriodId && s.classId === c.classId).length;
                return `
                    <tr>
                        <td class="p-3 font-bold text-slate-800">${esc(c.className)}</td>
                        <td class="p-3">${esc(c.gradeLevel)}</td>
                        <td class="p-3">${esc(c.phase)}</td>
                        <td class="p-3 text-center font-bold text-blue-600">${count} Siswa</td>
                        <td class="p-3 text-center"><span class="px-2 py-1 bg-emerald-50 text-emerald-700 text-xs font-bold rounded">Aktif</span></td>
                        <td class="p-3 text-center">
                            <div class="flex justify-center gap-1.5">
                                <button onclick="changeGlobalClass('${c.classId}'); switchView('dashboard');" class="btn btn-primary py-1 px-3 text-xs">Pilih Aktif</button>
                                <button data-admin-only onclick="openModalClass('${c.classId}')" class="btn btn-secondary py-1 px-2.5 text-xs ${hideAct}">Edit</button>
                                <button data-admin-only onclick="deleteClass('${c.classId}')" class="btn btn-danger-outline py-1 px-2.5 text-xs ${hideAct}">Hapus</button>
                            </div>
                        </td>
                    </tr>
                `;
            }).join('') : `<tr><td colspan="6" class="text-center py-8 text-slate-400 italic">Belum ada kelas terdaftar pada periode ini.</td></tr>`;
        }

        function openModalClass(id = null) { 
            if (!requireAdminClassAction()) return;
            let form = document.getElementById('formClass');
            if(form) form.reset();
            let elId = document.getElementById('clsId');
            if(elId) elId.value = '';
            
            if (id && typeof id === 'string') {
                let c = classes.find(x => x.classId === id);
                if (c) {
                    if(elId) elId.value = c.classId;
                    document.getElementById('clsName').value = c.className;
                    document.getElementById('clsGrade').value = c.gradeLevel;
                    document.getElementById('clsPhase').value = c.phase;
                }
            }
            document.getElementById('modalClass').classList.remove('hidden'); 
        }

        function saveClass(e) {
            if (e) e.preventDefault();
            if (!requireAdminClassAction()) return;
            let elId = document.getElementById('clsId');
            let cId = (elId && elId.value) ? elId.value : genId('CLS');
            let cName = document.getElementById('clsName').value.trim();
            let grade = document.getElementById('clsGrade').value;
            let phase = document.getElementById('clsPhase').value.trim();
            
            let existingIdx = classes.findIndex(c => c.classId === cId);
            if (existingIdx >= 0) {
                classes[existingIdx].className = cName;
                classes[existingIdx].gradeLevel = grade;
                classes[existingIdx].phase = phase;
            } else {
                classes.push({ classId: cId, periodId: activePeriodId, className: cName, gradeLevel: grade, phase, status: 'active' });
            }
            
            saveAllData();
            document.getElementById('modalClass').classList.add('hidden');
            renderClasses();
            updateHeader();
            showModal("Sukses", "Data kelas berhasil disimpan.", "✅");
        }
        
        function deleteClass(id) {
            if (!requireAdminClassAction()) return;
            if (classes.length <= 1) {
                showModal("Peringatan", "Gagal! Minimal harus ada 1 kelas tersisa di dalam sistem.", "⚠️");
                return;
            }
            showConfirm("Apakah Anda yakin ingin menghapus kelas ini?" + (Integrity.describe(Integrity.classDeps(id)) || ' Tidak ada data terkait.') + " Disarankan Backup JSON terlebih dahulu.", () => {
                Integrity.cascadeClass(id);
                if (activeClassId === id) {
                    activeClassId = classes[0].classId; // Alihkan otomatis jika kelas aktif dihapus
                }
                saveAllData();
                loadActiveContextData();
                renderClasses();
                updateHeader();
            });
        }
