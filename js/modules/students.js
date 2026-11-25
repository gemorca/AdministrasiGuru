// js/modules/students.js
// Dipecah dari sistem_administrasi_guru.html (Tahap 0). Skrip klasik: fungsi bersifat global.
        function renderStudents() {
            let q = document.getElementById('searchStudent').value.toLowerCase();
            let tbody = document.getElementById('studentTableBody');
            let filtered = students.filter(s => s.name.toLowerCase().includes(q) || s.nis.includes(q));
            if (!tbody) return;
            tbody.innerHTML = filtered.length ? filtered.map((s, idx) => `
                <tr class="hover:bg-slate-50 transition">
                    <td class="px-4 py-3 text-slate-500 font-medium">${idx + 1}</td>
                    <td class="px-4 py-3 font-semibold text-slate-700">${esc(s.nis)}</td>
                    <td class="px-4 py-3 font-bold text-slate-900">${esc(s.name)}</td>
                    <td class="px-4 py-3"><span class="px-2 py-0.5 rounded text-xs font-bold bg-blue-50 text-blue-700">${esc(s.gender)}</span></td>
                    <td class="px-4 py-3 font-medium text-slate-600">${esc(s.class)}</td>
                    <td class="px-4 py-3 text-center no-print">
                        <div class="flex justify-center gap-1">
                            <button onclick="openModalStudent('${s.id}')" class="text-blue-600 hover:text-blue-800 font-bold text-xs bg-blue-50 px-2.5 py-1 rounded-lg transition-colors" title="Edit Data">✏️</button>
                            <button onclick="deleteStudent('${s.id}')" class="text-red-600 hover:text-red-800 font-bold text-xs bg-red-50 px-2.5 py-1 rounded-lg transition-colors" title="Hapus Data">🗑️</button>
                        </div>
                    </td>
                </tr>
            `).join('') : `<tr><td colspan="6" class="text-center py-8 text-slate-400 italic">Belum ada peserta didik di kelas ini.</td></tr>`;
        }

        function openModalStudent(id = null) {
            let form = document.getElementById('formStudent');
            if(form) form.reset();
            let elId = document.getElementById('stId');
            if(elId) elId.value = '';
            
            if (id && typeof id === 'string') {
                let s = students.find(x => x.id === id);
                if (s) {
                    if(elId) elId.value = s.id;
                    document.getElementById('stNis').value = s.nis;
                    document.getElementById('stName').value = s.name;
                    document.getElementById('stGender').value = s.gender;
                    document.getElementById('stClass').value = s.class;
                }
            }
            
            let modal = document.getElementById('modalStudent');
            if(modal) modal.classList.remove('hidden');
        }

        function saveStudent(e) {
            e.preventDefault();
            let elId = document.getElementById('stId');
            let id = (elId && elId.value) ? elId.value : genId('STU');
            let nis = document.getElementById('stNis').value.trim();
            let name = document.getElementById('stName').value.trim();
            let gender = document.getElementById('stGender').value;
            let clsObj = classes.find(c => c.classId === activeClassId);
            let clsName = clsObj ? clsObj.className : 'VII.1';

            let existingIdx = allStudents.findIndex(s => s.id === id);
            if (existingIdx >= 0) {
                allStudents[existingIdx].nis = nis;
                allStudents[existingIdx].name = name;
                allStudents[existingIdx].gender = gender;
                allStudents[existingIdx].class = document.getElementById('stClass').value;
            } else {
                let data = { id, periodId: activePeriodId, classId: activeClassId, nis, name, gender, class: clsName };
                allStudents.push(data);
            }
            
            saveAllData();
            loadActiveContextData();
            document.getElementById('modalStudent').classList.add('hidden');
            renderStudents();
            showModal("Berhasil", "Data peserta didik berhasil disimpan.", "✅");
        }

        function deleteStudent(id) {
            showConfirm("Apakah Anda yakin ingin menghapus peserta didik ini?" + Integrity.describe(Integrity.studentDeps(id)), () => {
                Integrity.cascadeStudent(id);
                saveAllData();
                loadActiveContextData();
                renderStudents();
            });
        }

        function exportStudentsCSV() {
            if (!students.length) return;
            let csv = "NISN,Nama,JK,Kelas\n";
            students.forEach(s => csv += `${s.nis},"${s.name}",${s.gender},${s.class}\n`);
            let blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            let link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = `Siswa_${activePeriodId}.csv`;
            link.click();
        }

        function importStudentsCSV(e) {
            let file = e.target.files[0];
            if (!file) return;
            let reader = new FileReader();
            reader.onload = function(evt) {
                let lines = evt.target.result.split('\n').map(l => l.trim()).filter(l => l);
                for (let i = 1; i < lines.length; i++) {
                    let cols = lines[i].split(',').map(c => c.replace(/^"|"$/g, '').trim());
                    if (cols.length >= 3) {
                        let clsObj = classes.find(c => c.classId === activeClassId);
                        allStudents.push({ id: genId('STU'), periodId: activePeriodId, classId: activeClassId, nis: cols[0], name: cols[1], gender: cols[2], class: clsObj ? clsObj.className : 'VII.1' });
                    }
                }
                saveAllData();
                loadActiveContextData();
                renderStudents();
                showModal("Sukses", "Data siswa berhasil diimport.", "✅");
            };
            reader.readAsText(file);
        }
