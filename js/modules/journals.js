// js/modules/journals.js
// Dipecah dari sistem_administrasi_guru.html (Tahap 0). Skrip klasik: fungsi bersifat global.
        function renderJournals() {
            let q = document.getElementById('searchJournal')?.value.toLowerCase() || '';
            let tbody = document.getElementById('journalTableBody');
            let filtered = journals.filter(j => j.topic.toLowerCase().includes(q) || j.model.toLowerCase().includes(q));
            if (!tbody) return;
            tbody.innerHTML = filtered.length ? filtered.map((j, idx) => `
                <tr class="hover:bg-slate-50 transition">
                    <td class="p-3 font-medium text-slate-500">${idx + 1}</td>
                    <td class="p-3 font-semibold text-slate-700">${j.date}</td>
                    <td class="p-3 font-bold">${esc(j.num)}</td>
                    <td class="p-3 font-bold text-slate-900">${esc(j.topic)}</td>
                    <td class="p-3 text-xs">${esc(j.model)}</td>
                    <td class="p-3 text-center"><span class="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-xs font-bold rounded">100% Hadir</span></td>
                    <td class="p-3 text-center"><span class="px-2 py-1 bg-blue-50 text-blue-700 text-xs font-bold rounded">${j.status}</span></td>
                    <td class="p-3 text-center">
                        <button onclick="deleteJournal('${j.id}')" class="text-red-600 font-bold text-xs bg-red-50 px-2.5 py-1 rounded-lg">Hapus</button>
                    </td>
                </tr>
            `).join('') : `<tr><td colspan="8" class="text-center py-8 text-slate-400 italic">Belum ada jurnal & refleksi mengajar tercatat.</td></tr>`;
        }

        function openModalJournal() {
            let form = document.getElementById('formJournal');
            if(form) form.reset();
            let d = document.getElementById('jourDate');
            if(d) d.value = new Date().toISOString().split('T')[0];
            let num = document.getElementById('jourNum');
            if(num) num.value = journals.length + 1;
            let modal = document.getElementById('modalJournal');
            if(modal) modal.classList.remove('hidden');
        }

        function saveJournal(e) {
            e.preventDefault();
            let date = document.getElementById('jourDate').value;
            let num = document.getElementById('jourNum').value;
            let topic = document.getElementById('jourTopic').value.trim();
            let model = document.getElementById('jourModel').value;
            let status = document.getElementById('jourStatus').value;
            let reflection = document.getElementById('jourReflect').value.trim();

            allJournals.push({
                id: genId('JOUR'),
                periodId: activePeriodId,
                classId: activeClassId,
                date, num, topic, model, status, reflection
            });

            saveAllData();
            loadActiveContextData();
            renderJournals();
            document.getElementById('modalJournal').classList.add('hidden');
            showModal("Sukses", "Jurnal dan refleksi guru berhasil disimpan.", "✅");
        }

        function deleteJournal(id) {
            showConfirm("Apakah Anda yakin ingin menghapus jurnal ini?", () => {
                allJournals = allJournals.filter(j => j.id !== id);
                saveAllData();
                loadActiveContextData();
                renderJournals();
            });
        }

