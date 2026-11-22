// js/modules/documents.js
// Dipecah dari sistem_administrasi_guru.html (Tahap 0). Skrip klasik: fungsi bersifat global.
        // --- TAHAP 20 LOGIC : MANAJEMEN SURAT & DOKUMEN RESMI ---
        function renderDocuments() {
            let q = document.getElementById('searchDoc')?.value.toLowerCase() || '';
            let tbody = document.getElementById('documentTableBody');
            if (!tbody) return;
            
            let filtered = docList.filter(d => d.docNumber.toLowerCase().includes(q) || d.type.toLowerCase().includes(q));
            
            tbody.innerHTML = filtered.length ? filtered.map((d, idx) => {
                let st = students.find(s => s.id === d.studentId);
                let stName = st ? st.name : 'Peserta Didik Tidak Ditemukan';
                return `
                <tr class="hover:bg-slate-50 transition border-b border-slate-100">
                    <td class="p-3 text-xs font-medium text-slate-500">${idx + 1}</td>
                    <td class="p-3 text-xs font-semibold">${d.date}</td>
                    <td class="p-3 font-bold text-slate-800">${esc(d.docNumber)}</td>
                    <td class="p-3 text-xs"><span class="bg-blue-50 border border-blue-100 text-blue-700 px-2.5 py-1 rounded-lg font-bold">${esc(d.type)}</span></td>
                    <td class="p-3 text-xs font-semibold text-slate-600">${esc(stName)}</td>
                    <td class="p-3 text-center flex gap-1 justify-center">
                        <button onclick="printFormalLetter('${d.id}')" class="text-white bg-slate-800 font-bold text-[10px] px-3 py-1.5 rounded-lg shadow-sm hover:bg-slate-700 transition">🖨️ Cetak</button>
                        <button onclick="deleteDocument('${d.id}')" class="text-red-600 font-bold text-[10px] bg-red-50 border border-red-100 px-3 py-1.5 rounded-lg shadow-sm hover:bg-red-100 transition">🗑️ Hapus</button>
                    </td>
                </tr>`;
            }).join('') : `<tr><td colspan="6" class="text-center py-8 text-slate-400 italic">Belum ada dokumen surat resmi yang dibuat.</td></tr>`;
        }

        function openModalDocument() {
            let form = document.getElementById('formDocument');
            if(form) form.reset();
            
            let selSt = document.getElementById('docStudentId');
            if(selSt) {
                selSt.innerHTML = students.map(s => `<option value="${s.id}">${esc(s.name)} (${esc(s.nis)})</option>`).join('');
            }
            
            let d = document.getElementById('docDate');
            if(d) d.value = new Date().toISOString().split('T')[0];
            
            document.getElementById('modalDocument').classList.remove('hidden');
        }

        function generateDocAI() {
            let type = document.getElementById('docType').value;
            let stId = document.getElementById('docStudentId').value;
            let st = students.find(s => s.id === stId);
            let pName = st ? st.name : '(Nama Siswa)';
            
            let btn = document.querySelector('button[onclick="generateDocAI()"]');
            let origHTML = btn.innerHTML;
            btn.innerHTML = "⏳ AI Menyusun...";
            btn.disabled = true;

            setTimeout(() => {
                let text = "";
                if (type.includes("Pemanggilan")) {
                    text = `Dengan hormat,\n\nSeiring dengan proses evaluasi kegiatan belajar mengajar pada semester ini, kami mengamati adanya beberapa hal yang memerlukan komunikasi dan diskusi lebih lanjut terkait perkembangan akademik serta kedisiplinan ananda ${pName}.\n\nOleh karena itu, kami mengundang Bapak/Ibu Wali Murid untuk dapat hadir ke sekolah guna berkonsultasi secara langsung pada waktu yang disepakati. Kehadiran Bapak/Ibu sangat berarti bagi sinergi kita dalam mendukung kemajuan belajar ananda ke depannya.\n\nDemikian surat pemanggilan ini kami sampaikan. Atas perhatian dan kerja sama yang baik dari Bapak/Ibu, kami ucapkan terima kasih.`;
                } else if (type.includes("Apresiasi")) {
                    text = `Dengan hormat,\n\nMelalui surat ini, kami selaku pendidik dan pihak sekolah ingin menyampaikan rasa bangga serta apresiasi yang setinggi-tingginya atas pencapaian, dedikasi, dan perkembangan positif yang luar biasa dari ananda ${pName} selama periode pembelajaran ini.\n\nAnanda telah menunjukkan tanggung jawab yang sangat baik dalam menyelesaikan tugas akademik maupun partisipasi aktif di kelas. Kami sangat berharap momentum prestasi dan sikap positif ini dapat terus dipertahankan.\n\nDemikian surat apresiasi ini kami sampaikan. Kami berterima kasih atas dukungan penuh Bapak/Ibu dari rumah yang turut membentuk karakter positif ananda.`;
                } else if (type.includes("Peringatan")) {
                    text = `Dengan hormat,\n\nBerdasarkan pantauan harian dan catatan portofolio akademik, kami ingin menginformasikan bahwa ananda ${pName} tercatat mengalami keterlambatan dalam pengumpulan beberapa tugas esensial yang menjadi prasyarat penilaian kompetensi.\n\nKami mohon bantuan dan pendampingan Bapak/Ibu di rumah agar ananda dapat segera menyelesaikan tugas-tugas yang tertinggal, agar tidak mempengaruhi evaluasi nilai akhir. \n\nDemikian pemberitahuan ini kami sampaikan demi kelancaran proses belajar ananda. Terima kasih atas pengertiannya.`;
                } else {
                    text = `Dengan hormat,\n\nBersama surat ini, kami memberitahukan perihal penting terkait proses dan kelancaran kegiatan akademik yang melibatkan ananda ${pName}. Kami memohon Bapak/Ibu dapat meninjau informasi yang terlampir dan terus mendampingi proses belajar ananda secara konsisten.\n\nDemikian pemberitahuan ini kami buat untuk dapat menjadi perhatian bersama. Atas kerja samanya, kami ucapkan terima kasih.`;
                }
                
                document.getElementById('docContent').value = text;
                
                btn.innerHTML = origHTML;
                btn.disabled = false;
                showModal("AI Generator", "Draft isi surat berhasil dibuat secara instan. Silakan modifikasi teks tersebut sesuai kebutuhan riil.", "✨");
            }, 800);
        }

        function saveDocument(e) {
            e.preventDefault();
            let docNumber = document.getElementById('docNumber').value.trim();
            let type = document.getElementById('docType').value;
            let studentId = document.getElementById('docStudentId').value;
            let date = document.getElementById('docDate').value;
            let content = document.getElementById('docContent').value.trim();
            
            allDocuments.push({
                id: genId('DOC'),
                periodId: activePeriodId,
                classId: activeClassId,
                studentId, docNumber, type, date, content
            });
            
            saveAllData();
            loadActiveContextData();
            renderDocuments();
            document.getElementById('modalDocument').classList.add('hidden');
            showModal("Sukses", "Dokumen surat resmi berhasil disimpan di arsip.", "✅");
        }

        function deleteDocument(id) {
            showConfirm("Apakah Anda yakin ingin menghapus surat ini dari arsip secara permanen?", () => {
                allDocuments = allDocuments.filter(d => d.id !== id);
                saveAllData();
                loadActiveContextData();
                renderDocuments();
            });
        }
        
        function printFormalLetter(id) {
            let doc = docList.find(d => d.id === id);
            if(!doc) return;
            let st = students.find(s => s.id === doc.studentId);
            
            // Format Tanggal Lokal
            const options = { year: 'numeric', month: 'long', day: 'numeric' };
            const dt = new Date(doc.date);
            const formattedDate = dt.toLocaleDateString('id-ID', options);
            
            document.getElementById('plNumber').innerText = doc.docNumber;
            document.getElementById('plSubject').innerText = doc.type;
            document.getElementById('plStudentName').innerText = st ? st.name : '-';
            document.getElementById('plDateStr').innerText = `Gorontalo, ${formattedDate}`; // Ubah ke nama kota dinamis jika ada di pengaturan
            
            // Format Paragraf (replace newline with <br> and wrap in styling)
            let formattedContent = doc.content.split('\n\n').map(p => `<p class="indent-8">${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
            document.getElementById('plContent').innerHTML = formattedContent;
            
            // Data Setup Sekolah
            document.getElementById('plSchool').innerText = settings.school;
            document.getElementById('plPrincipal').innerText = settings.principal || '(Nama Kepala Sekolah)';
            document.getElementById('plNipPrincipal').innerText = settings.nipPrincipal || '-';
            document.getElementById('plTeacher').innerText = settings.teacher || '(Nama Guru)';
            document.getElementById('plNipTeacher').innerText = settings.nipTeacher || '-';
            
            // Hide standard UI elements, show only print canvas
            let canvas = document.getElementById('printLetterCanvas');
            let listContainer = document.getElementById('docListContainer');
            
            canvas.classList.remove('hidden');
            listContainer.classList.add('hidden');
            
            let targetView = document.getElementById('view-documents');
            targetView.classList.add('active-print');
            
            setTimeout(() => {
                window.print();
                
                // Restore UI after print dialog closes
                canvas.classList.add('hidden');
                listContainer.classList.remove('hidden');
                targetView.classList.remove('active-print');
            }, 100);
        }

        function printReport(viewId, title) {
            // Mengatur teks judul dokumen dan informasi kelas
            let elTitle = document.getElementById('printDocTitle');
            if (elTitle) elTitle.innerText = title;
            
            let elSchool = document.getElementById('printSchoolName');
            if (elSchool) elSchool.innerText = settings.school || "NAMA SEKOLAH";
            
            let clsObj = classes.find(c => c.classId === activeClassId);
            let clsName = clsObj ? clsObj.className : '-';
            let elSubInfo = document.getElementById('printSubInfo');
            if (elSubInfo) elSubInfo.innerText = `${settings.subject || '-'} | Kelas ${clsName} | Semester ${settings.semester || '-'} | ${settings.academicYear || '-'}`;

            // Atur agar hanya view yang ditargetkan yang muncul di mode print
            document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active-print'));
            let targetView = document.getElementById(viewId);
            if (targetView) targetView.classList.add('active-print');
            
            setTimeout(() => {
                window.print();
                
                // Setelah print selesai, kembalikan ke view yang sedang aktif
                document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active-print'));
                let activeView = document.querySelector('.view-section.active');
                if (activeView) activeView.classList.add('active-print');
            }, 100);
        }

        function downloadModulDoc() {
            let content = document.getElementById('genResultContent').innerHTML;
            if(!content || content.trim() === '') {
                showModal("Peringatan", "Modul Ajar belum digenerate.", "⚠️");
                return;
            }
            
            // Format HTML yang ditoleransi Word (.doc)
            let preHtml = "<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>Modul Ajar</title></head><body>";
            let postHtml = "</body></html>";
            let html = preHtml + content + postHtml;

            let blob = new Blob(['\ufeff', html], {
                type: 'application/msword'
            });
            
            let link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            
            let clsObj = classes.find(c => c.classId === activeClassId);
            let clsName = clsObj ? clsObj.className : '';
            link.download = `Modul_Ajar_${settings.subject}_${clsName}.doc`;
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }

