// js/modules/classes.js
// Dipecah dari sistem_administrasi_guru.html (Tahap 0). Skrip klasik: fungsi bersifat global.
        function renderClasses() {
            let tbody = document.getElementById('classListBody');
            if (!tbody) return;
            tbody.innerHTML = classes.map(c => {
                let count = allStudents.filter(s => s.periodId === activePeriodId && s.classId === c.classId).length;
                return `
                    <tr>
                        <td class="p-3 font-bold text-slate-800">${esc(c.className)}</td>
                        <td class="p-3">${esc(c.gradeLevel)}</td>
                        <td class="p-3">${esc(c.phase)}</td>
                        <td class="p-3 text-center font-bold text-blue-600">${count} Siswa</td>
                        <td class="p-3 text-center"><span class="px-2 py-1 bg-emerald-50 text-emerald-700 text-xs font-bold rounded">Aktif</span></td>
                        <td class="p-3 text-center">
                            <div class="flex justify-center gap-1">
                                <button onclick="changeGlobalClass('${c.classId}'); switchView('dashboard');" class="bg-blue-600 text-white px-3 py-1 rounded-lg text-xs font-bold hover:bg-blue-700 transition">Pilih Aktif</button>
                                <button onclick="openModalClass('${c.classId}')" class="text-blue-600 font-bold text-xs bg-blue-50 px-2.5 py-1 rounded-lg hover:bg-blue-100 transition">✏️</button>
                                <button onclick="deleteClass('${c.classId}')" class="text-red-600 font-bold text-xs bg-red-50 px-2.5 py-1 rounded-lg hover:bg-red-100 transition">🗑️</button>
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');
        }

        function openModalClass(id = null) { 
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
            e.preventDefault();
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
