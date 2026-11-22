// js/modules/portfolio.js
// Dipecah dari sistem_administrasi_guru.html (Tahap 0). Skrip klasik: fungsi bersifat global.
        function renderPortfolio() {
            let q = document.getElementById('searchPortfolio')?.value.toLowerCase() || '';
            let tbody = document.getElementById('portfolioTableBody');
            if (!tbody) return;
            
            let filtered = students.filter(s => s.name.toLowerCase().includes(q));
            
            tbody.innerHTML = filtered.length ? filtered.map((s, idx) => {
                let stSubs = (typeof submissions !== 'undefined') ? submissions.filter(sub => sub.studentId === s.id) : [];
                return `
                <tr class="hover:bg-slate-50 transition border-b border-slate-50">
                    <td class="p-3 text-xs font-semibold text-slate-500">${idx + 1}</td>
                    <td class="p-3 font-bold text-slate-800">${esc(s.name)}</td>
                    <td class="p-3 text-center font-bold text-blue-600">${stSubs.length} Bukti</td>
                    <td class="p-3 text-center text-xs text-slate-500">-</td>
                    <td class="p-3 text-center">
                        <button onclick="showModal('Galeri Portofolio ${s.name}', 'Galeri Portofolio akan terhubung secara otomatis dengan karya yang dikumpulkan melalui modul Tugas & LKPD.', '📁')" class="text-blue-600 font-bold text-[10px] bg-blue-50 border border-blue-100 px-3 py-1.5 rounded-lg shadow-sm hover:bg-blue-100 transition">Lihat Galeri</button>
                    </td>
                </tr>`;
            }).join('') : `<tr><td colspan="5" class="text-center py-8 text-slate-400 italic">Belum ada data siswa.</td></tr>`;
        }

