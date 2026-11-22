// js/modules/schedule.js
// Dipecah dari sistem_administrasi_guru.html (Tahap 0). Skrip klasik: fungsi bersifat global.
        function renderSchedule() {
            let grid = document.getElementById('scheduleGridBody');
            if (!grid) return;
            let days = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
            let maxHour = 10;
            let html = '';
            for(let i = 1; i <= maxHour; i++) {
                html += `<tr><td class="p-2 border font-bold text-center bg-slate-50 text-slate-700">${i}</td>`;
                days.forEach(day => {
                    let sch = schedules.find(s => {
                        if(s.day !== day) return false;
                        let parts = s.hour.split('-').map(Number);
                        if(parts.length === 1) return parts[0] === i;
                        return i >= parts[0] && i <= parts[1];
                    });
                    if(sch) {
                        let clsObj = classes.find(c => c.classId === sch.classId);
                        let cName = clsObj ? clsObj.className : '-';
                        html += `<td class="p-2 border bg-blue-50 text-center relative group transition-colors hover:bg-blue-100">
                            <span class="font-bold text-blue-700 text-xs block">Kelas ${esc(cName)}</span>
                            <button onclick="deleteSchedule('${sch.id}')" class="hidden group-hover:block absolute top-1 right-1 bg-red-500 hover:bg-red-600 text-white text-[10px] w-4 h-4 rounded-full shadow-sm leading-none items-center justify-center font-bold">×</button>
                        </td>`;
                    } else {
                        html += `<td class="p-2 border text-center text-slate-300 font-light">-</td>`;
                    }
                });
                html += `</tr>`;
            }
            grid.innerHTML = html;
        }

        function openModalSchedule() { 
            let sel = document.getElementById('schClass');
            if(sel) sel.innerHTML = classes.map(c => `<option value="${c.classId}">Kelas ${esc(c.className)}</option>`).join('');
            document.getElementById('modalSchedule').classList.remove('hidden'); 
        }

        function saveSchedule(e) {
            e.preventDefault();
            let classId = document.getElementById('schClass').value;
            let day = document.getElementById('schDay').value;
            let hour = document.getElementById('schHour').value;
            allSchedules.push({ id: genId('SCH'), periodId: activePeriodId, classId, day, hour });
            saveAllData();
            loadActiveContextData();
            renderSchedule();
            document.getElementById('modalSchedule').classList.add('hidden');
            document.getElementById('formSchedule').reset();
            showModal("Sukses", "Jadwal mengajar berhasil ditambahkan.", "✅");
        }

        function deleteSchedule(id) {
            showConfirm("Apakah Anda yakin ingin menghapus jadwal ini?", () => {
                allSchedules = allSchedules.filter(s => s.id !== id);
                saveAllData();
                loadActiveContextData();
                renderSchedule();
            });
        }

        function formatCell(text) {
            if (!text) return '-';
            // Memisahkan teks berdasarkan baris baru, lalu memberikan garis pembatas (border-bottom) pada setiap poinnya
            let lines = text.split('\n').filter(l => l.trim().length > 0);
            if (lines.length > 1) {
                return lines.map(l => `<div class="border-b border-slate-300 border-dashed pb-2 mb-2 last:border-0 last:pb-0 last:mb-0 leading-relaxed">${esc(l)}</div>`).join('');
            }
            return `<div class="leading-relaxed">${esc(text)}</div>`;
        }

