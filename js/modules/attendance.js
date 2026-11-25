// js/modules/attendance.js
// Dipecah dari sistem_administrasi_guru.html (Tahap 0). Skrip klasik: fungsi bersifat global.
        function renderAttInput() {
            let today = new Date().toISOString().split('T')[0];
            let elDate = document.getElementById('meetDate');
            if (elDate && !elDate.value) elDate.value = today;
            let elNum = document.getElementById('meetNum');
            if (elNum && !elNum.value) elNum.value = meetings.length + 1;
            let elInfo = document.getElementById('attStudentCountInfo');
            if (elInfo) elInfo.innerText = `Total Siswa: ${students.length}`;

            let tbody = document.getElementById('attendanceInputBody');
            if (!tbody) return;
            tbody.innerHTML = students.length ? students.map((s, idx) => `
                <tr class="hover:bg-slate-50 transition">
                    <td class="px-4 py-2.5 text-slate-500 font-medium">${idx + 1}</td>
                    <td class="px-4 py-2.5 font-semibold text-slate-700">${esc(s.nis)}</td>
                    <td class="px-4 py-2.5 font-bold text-slate-900">${esc(s.name)}</td>
                    <td class="px-4 py-2.5 text-center">
                        <div class="flex gap-2 justify-center text-xs font-bold">
                            <label class="px-2 py-1 bg-emerald-50 text-emerald-700 rounded cursor-pointer border"><input type="radio" name="att_${s.id}" value="H" class="att-rad mr-1" checked> H</label>
                            <label class="px-2 py-1 bg-amber-50 text-amber-700 rounded cursor-pointer border"><input type="radio" name="att_${s.id}" value="S" class="att-rad mr-1"> S</label>
                            <label class="px-2 py-1 bg-blue-50 text-blue-700 rounded cursor-pointer border"><input type="radio" name="att_${s.id}" value="I" class="att-rad mr-1"> I</label>
                            <label class="px-2 py-1 bg-red-50 text-red-700 rounded cursor-pointer border"><input type="radio" name="att_${s.id}" value="A" class="att-rad mr-1"> A</label>
                        </div>
                    </td>
                    <td class="px-4 py-2.5"><input type="text" id="att_n_${s.id}" placeholder="Keterangan..." class="border border-slate-200 px-3 py-1 text-xs w-full rounded-lg"></td>
                </tr>
            `).join('') : `<tr><td colspan="5" class="text-center py-8 text-slate-400 italic">Belum ada data peserta didik di kelas ini.</td></tr>`;
        }

        function setAllPresent() { document.querySelectorAll('.att-rad[value="H"]').forEach(r => r.checked = true); }

        function saveAttendance() {
            if (!students.length) return;
            let num = document.getElementById('meetNum').value;
            let date = document.getElementById('meetDate').value;
            let time = document.getElementById('meetTime').value;
            let topic = document.getElementById('meetTopic').value;
            let mId = genId('MTG');
            allMeetings.push({ id: mId, periodId: activePeriodId, classId: activeClassId, num, date, time, topic });
            students.forEach(s => {
                let stat = document.querySelector(`input[name="att_${s.id}"]:checked`)?.value || 'H';
                allAttendance.push({ id: genId('ATT'), periodId: activePeriodId, meetingId: mId, studentId: s.id, status: stat });
            });
            saveAllData();
            loadActiveContextData();
            renderAttInput();
            renderMtgHistory();
            showModal("Sukses", "Absensi dan jurnal berhasil disimpan.", "✅");
        }

        function renderMtgHistory() {
            let tbody = document.getElementById('meetingHistoryBody');
            if (!tbody) return;
            tbody.innerHTML = meetings.length ? meetings.map(m => `
                <tr>
                    <td class="px-4 py-3 font-bold">${esc(m.num)}</td>
                    <td class="px-4 py-3">${m.date}</td>
                    <td class="px-4 py-3">${esc(m.time)}</td>
                    <td class="px-4 py-3 font-bold">${esc(m.topic)}</td>
                    <td class="px-4 py-3 text-xs">-</td>
                    <td class="px-4 py-3 text-center text-xs">Hadir Lengkap</td>
                    <td class="px-4 py-3 text-center"><button onclick="deleteMeeting('${m.id}')" class="text-red-600 font-bold text-xs bg-red-50 px-2 py-1 rounded">Hapus</button></td>
                </tr>
            `).join('') : `<tr><td colspan="7" class="text-center py-8 text-slate-400 italic">Belum ada riwayat jurnal.</td></tr>`;
        }

        function deleteMeeting(id) {
            showConfirm("Apakah Anda yakin ingin menghapus pertemuan ini?", () => {
                allMeetings = allMeetings.filter(m => m.id !== id);
                allAttendance = allAttendance.filter(a => a.meetingId !== id);
                saveAllData();
                loadActiveContextData();
                renderMtgHistory();
            });
        }

        function calcAttStats(stId) {
            let stAtt = attendance.filter(a => a.studentId === stId);
            let tot = stAtt.length;
            let H = stAtt.filter(a => a.status === 'H').length;
            let pct = tot ? Math.round((H / tot) * 10000) / 100 : 100;
            return { tot, H, S: stAtt.filter(a => a.status === 'S').length, I: stAtt.filter(a => a.status === 'I').length, A: stAtt.filter(a => a.status === 'A').length, pct };
        }

        function renderRecapAtt() {
            let tbody = document.getElementById('recapAttendanceBody');
            if (!tbody) return;
            tbody.innerHTML = students.map((s, idx) => {
                let st = calcAttStats(s.id);
                return `
                    <tr>
                        <td class="px-4 py-3">${idx + 1}</td>
                        <td class="px-4 py-3 font-semibold">${esc(s.nis)}</td>
                        <td class="px-4 py-3 font-bold">${esc(s.name)}</td>
                        <td class="px-2 py-3 text-center">${st.H}</td>
                        <td class="px-2 py-3 text-center">${st.S}</td>
                        <td class="px-2 py-3 text-center">${st.I}</td>
                        <td class="px-2 py-3 text-center">${st.A}</td>
                        <td class="px-2 py-3 text-center">0</td>
                        <td class="px-3 py-3 text-center font-bold bg-blue-50 text-blue-700">${st.pct}%</td>
                    </tr>
                `;
            }).join('');
        }

        function exportAttendanceCSV() {
            if (!students.length) return;
            let csv = "NISN,Nama Siswa,H,S,I,A,Persentase Hadir\n";
            students.forEach(s => {
                let st = calcAttStats(s.id);
                csv += `${s.nis},"${s.name}",${st.H},${st.S},${st.I},${st.A},${st.pct}%\n`;
            });
            let blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            let link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = `Rekap_Kehadiran_${activePeriodId}.csv`;
            link.click();
        }
