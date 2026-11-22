// js/modules/p5.js
// Dipecah dari sistem_administrasi_guru.html (Tahap 0). Skrip klasik: fungsi bersifat global.
        function updateProyekTopics() {
            let tema = document.getElementById('aiProyekTema').value;
            let topics = P5_THEMES[tema] || [];
            let sel = document.getElementById('aiProyekTopicSelect');
            if (sel) {
                sel.innerHTML = topics.map(t => `<option value="${t}">${t}</option>`).join('');
                checkCustomTopic(sel.value);
            }
        }

        function checkCustomTopic(val) {
            let input = document.getElementById('aiProyekTopic');
            if(val === "Lainnya...") {
                input.classList.remove('hidden');
                input.required = true;
                input.value = "";
            } else {
                input.classList.add('hidden');
                input.required = false;
                input.value = val;
            }
        }

        // --- PROYEK DIMENSI PROFIL LULUSAN (AI) ---
        function renderP5() {
            let q = document.getElementById('searchP5')?.value.toLowerCase() || '';
            let tbody = document.getElementById('p5TableBody');
            let filtered = p5List.filter(p => (p.title || '').toLowerCase().includes(q) || (p.dimension || '').toLowerCase().includes(q));
            if (!tbody) return;
            tbody.innerHTML = filtered.length ? filtered.map((p, idx) => `
                <tr class="hover:bg-slate-50 transition">
                    <td class="p-3 font-medium text-slate-500">${idx + 1}</td>
                    <td class="p-3 font-bold text-indigo-700">${esc(p.title || p.topic)}</td>
                    <td class="p-3 font-semibold text-slate-700">
                        <span class="block text-[10px] text-slate-400 uppercase">${esc(p.theme || '-')}</span>
                        ${esc(p.topic)}
                    </td>
                    <td class="p-3 text-xs font-bold text-emerald-700"><span class="bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100">${esc(p.dimension)}</span></td>
                    <td class="p-3 text-xs text-slate-600 line-clamp-2">${esc(p.description || '-')}</td>
                    <td class="p-3 text-center flex gap-1 justify-center">
                        <button data-ai onclick="generateModulP5AI('${p.id}')" id="btnGenP5Modul_${p.id}" class="text-white font-bold text-[10px] bg-indigo-600 border border-indigo-700 px-2.5 py-1.5 rounded-lg hover:bg-indigo-700 transition shadow-sm">Modul AI</button>
                        <button onclick="deleteP5('${p.id}')" class="text-red-600 font-bold text-[10px] bg-red-50 border border-red-100 px-2.5 py-1.5 rounded-lg hover:bg-red-100 transition shadow-sm">Hapus</button>
                    </td>
                </tr>
            `).join('') : `<tr><td colspan="6" class="text-center py-8 text-slate-400 italic">Belum ada Proyek Profil Lulusan yang digenerate. Klik 'Generate Proyek AI'.</td></tr>`;
        }

        function openModalProyekAI() {
            let form = document.getElementById('formProyekAI');
            if(form) form.reset();
            updateProyekTopics(); // Inisialisasi topik berdasarkan tema awal
            let modal = document.getElementById('modalProyekAI');
            if(modal) modal.classList.remove('hidden');
        }

        function processGenerateProyekAI(e) {
            e.preventDefault();
            let tema = document.getElementById('aiProyekTema').value;
            let topicSelect = document.getElementById('aiProyekTopicSelect').value;
            let topic = topicSelect === "Lainnya..." ? document.getElementById('aiProyekTopic').value.trim() : topicSelect;
            let dimension = document.getElementById('aiProyekDimension').value;
            let scale = document.getElementById('aiProyekScale').value;
            
            let btn = document.getElementById('btnGenProyekAI');
            btn.innerHTML = "⏳ AI Sedang Berpikir...";
            btn.disabled = true;
            btn.classList.add('opacity-70');

            setTimeout(() => {
                // Simulasi AI Generating content
                let aiTitle = `Aksi Nyata: Satgas ${topic.split(' ')[0] || 'Kreatif'} Sekolah`;
                let aiDesc = `Peserta didik secara berkelompok merancang dan mengeksekusi kampanye kesadaran serta aksi langsung mengenai ${topic}, mengintegrasikan nilai ${dimension} dalam lingkungan sekolah. Skala: ${scale}.`;
                
                if(dimension.includes('Kreativitas')) {
                    aiTitle = `Pameran Inovasi: Solusi ${topic.split(' ')[0]}`;
                    aiDesc = `Menciptakan prototipe atau produk daur ulang kreatif yang menyelesaikan masalah terkait ${topic}, meningkatkan kapasitas ${dimension} siswa.`;
                } else if(dimension.includes('Kritis')) {
                    aiTitle = `Forum Debat & Analisis: Isu ${topic}`;
                    aiDesc = `Penelitian lapangan dan presentasi debat memecahkan masalah seputar ${topic}. Melatih kemampuan ${dimension} secara komprehensif.`;
                }

                allP5Projects.push({
                    id: genId('PROYEK'),
                    periodId: activePeriodId,
                    theme: tema,
                    topic: topic,
                    title: aiTitle,
                    description: aiDesc,
                    dimension: dimension,
                    scale: scale,
                    phase: settings.fase || 'D'
                });

                saveAllData();
                loadActiveContextData();
                renderP5();
                
                btn.innerHTML = "✨ Generate Proyek";
                btn.disabled = false;
                btn.classList.remove('opacity-70');
                document.getElementById('modalProyekAI').classList.add('hidden');
                showModal("Sukses AI", "Proyek Dimensi Profil Lulusan berhasil digenerate oleh AI.", "✅");
            }, 1200);
        }

        function deleteP5(id) {
            showConfirm("Apakah Anda yakin ingin menghapus perencanaan Proyek Profil Lulusan ini?", () => {
                allP5Projects = allP5Projects.filter(p => p.id !== id);
                saveAllData();
                loadActiveContextData();
                renderP5();
                document.getElementById('p5ModuleContainer').classList.add('hidden');
            });
        }
        
        function generateModulP5AI(id) {
            let p = p5List.find(x => x.id === id);
            if (!p) return;

            let btn = document.getElementById(`btnGenP5Modul_${id}`);
            let origText = btn.innerHTML;
            btn.innerHTML = "⏳ Menyusun Modul...";
            btn.disabled = true;

            setTimeout(() => {
                let container = document.getElementById('p5ModuleContainer');
                let content = document.getElementById('p5ModuleContent');
                
                let active = periods.find(per => per.id === activePeriodId);
                let periodStr = active ? `${active.year}` : settings.academicYear;

                const thCls = "border border-black p-2 font-bold bg-indigo-50 align-top text-indigo-900";
                const tdCls = "border border-black p-2 align-top";
                const tr = (lbl, val) => `<tr><td class="${thCls} w-1/4">${lbl}</td><td class="${tdCls}">${val}</td></tr>`;

                let dimText = p.dimension;
                let subElemen = "Sub-elemen sesuai dengan rubrik dimensi profil pelajar Pancasila yang berlaku (misal: Mengenali dan mengeksplorasi potensi diri, Berkolaborasi, Berpikir kritis).";

                // Generate Simulated Links based on Topic
                let safeTopic = encodeURIComponent(p.topic);
                let videoLink = `https://www.youtube.com/results?search_query=${safeTopic}+edukasi+dokumenter`;
                let articleLink = `https://www.google.com/search?q=artikel+berita+fakta+tentang+${safeTopic}`;

                let html = `
                    <div class="text-center mb-6">
                        <h4 class="font-bold text-lg uppercase text-slate-900">MODUL PROYEK PENGUATAN PROFIL PELAJAR PANCASILA</h4>
                        <h5 class="font-bold text-md text-slate-700">Tema: ${esc(p.theme || 'Tema Proyek Profil')}</h5>
                    </div>
                    
                    <h6 class="font-bold text-sm bg-indigo-100 text-indigo-900 p-2 border border-black uppercase mt-4">A. INFORMASI UMUM PROYEK</h6>
                    <table class="w-full text-xs text-left border-collapse border border-black mb-4">
                        <tbody>
                            ${tr('Nama Sekolah', `: ${esc(settings.school)}`)}
                            ${tr('Koordinator Proyek', `: ${esc(settings.teacher)}`)}
                            ${tr('Judul Proyek', `: <b>${esc(p.title)}</b>`)}
                            ${tr('Topik Spesifik', `: ${esc(p.topic)}`)}
                            ${tr('Fase / Kelas', `: Fase ${esc(p.phase)} / Kelas Aktif`)}
                            ${tr('Tahun Pelajaran', `: ${periodStr}`)}
                            ${tr('Alokasi Waktu', `: ${esc(p.scale)}`)}
                            ${tr('Fokus Dimensi Profil', `: <b>${esc(p.dimension)}</b>`)}
                        </tbody>
                    </table>

                    <h6 class="font-bold text-sm bg-indigo-100 text-indigo-900 p-2 border border-black uppercase mt-4">B. DESKRIPSI SINGKAT PROYEK</h6>
                    <div class="border border-black p-4 text-xs mb-4 text-justify">
                        <p>${esc(p.description)}</p>
                        <p class="mt-2">Melalui proyek ini, peserta didik diajak untuk tidak hanya memahami konsep teoretis dari isu <b>${esc(p.topic)}</b>, melainkan juga mengambil peran aktif. Proyek ini didesain agar siswa secara langsung melatih dimensi <b>${esc(p.dimension)}</b> melalui tahap observasi, perencanaan solusi, hingga aksi nyata (kampanye/pameran/karya).</p>
                    </div>

                    <h6 class="font-bold text-sm bg-indigo-100 text-indigo-900 p-2 border border-black uppercase mt-4">C. TUJUAN & RUBRIK PENCAPAIAN</h6>
                    <table class="w-full text-xs text-left border-collapse border border-black mb-4">
                        <thead class="bg-indigo-50">
                            <tr>
                                <th class="${thCls} w-1/4">Dimensi</th>
                                <th class="${thCls} w-1/4">Elemen & Sub-Elemen</th>
                                <th class="${thCls}">Target Pencapaian di Akhir Fase</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td class="${tdCls} font-bold">${esc(dimText)}</td>
                                <td class="${tdCls}">${subElemen}</td>
                                <td class="${tdCls}">Peserta didik mampu menginisiasi aksi, berkolaborasi dengan beragam pihak, serta menyampaikan argumen rasional dan inovatif terkait pemecahan masalah ${esc(p.topic)}.</td>
                            </tr>
                        </tbody>
                    </table>

                    <h6 class="font-bold text-sm bg-indigo-100 text-indigo-900 p-2 border border-black uppercase mt-4">D. TAHAPAN PELAKSANAAN PROYEK</h6>
                    <div class="border border-black p-4 text-xs mb-4 space-y-4">
                        <div>
                            <h5 class="font-bold text-sm mb-1 text-slate-800">Tahap 1: Pengenalan (Eksplorasi Isu)</h5>
                            <ul class="list-disc pl-5 space-y-1">
                                <li>Guru memberikan pemantik berupa penayangan video atau pembacaan artikel mengenai isu ${esc(p.topic)}.<br>
                                    <span class="text-[11px] text-slate-600 italic block mt-1">Referensi Video: <a href="${videoLink}" target="_blank" class="text-blue-700 underline">${videoLink}</a></span>
                                    <span class="text-[11px] text-slate-600 italic block">Referensi Artikel: <a href="${articleLink}" target="_blank" class="text-blue-700 underline">${articleLink}</a></span>
                                </li>
                                <li>Siswa melakukan curah pendapat (brainstorming) mengidentifikasi masalah utama.</li>
                                <li>Diskusi kelompok mendalami akar masalah.</li>
                            </ul>
                        </div>
                        <div>
                            <h5 class="font-bold text-sm mb-1 text-slate-800">Tahap 2: Kontekstualisasi (Observasi Lapangan)</h5>
                            <ul class="list-disc pl-5">
                                <li>Siswa turun ke lapangan (lingkungan sekolah/sekitar) untuk melihat fakta riil isu tersebut.</li>
                                <li>Siswa mengumpulkan data (wawancara, kuesioner, atau pengamatan langsung).</li>
                                <li>Siswa mempresentasikan temuan awal di depan kelas.</li>
                            </ul>
                        </div>
                        <div>
                            <h5 class="font-bold text-sm mb-1 text-slate-800">Tahap 3: Aksi Nyata (Pembuatan Karya / Solusi)</h5>
                            <ul class="list-disc pl-5">
                                <li>Berdasarkan rumusan solusi, siswa mulai menyusun karya (misal: Poster kampanye, prototipe alat daur ulang, atau persiapan pameran).</li>
                                <li>Pelaksanaan aksi: Melakukan kampanye atau pameran mini karya di lingkungan sekolah.</li>
                            </ul>
                        </div>
                        <div>
                            <h5 class="font-bold text-sm mb-1 text-slate-800">Tahap 4: Refleksi dan Tindak Lanjut</h5>
                            <ul class="list-disc pl-5">
                                <li>Evaluasi bersama: Apa yang sudah berjalan baik dan apa kendalanya.</li>
                                <li>Pengisian lembar refleksi diri dan refleksi antar teman.</li>
                                <li>Penyusunan komitmen bersama untuk mempertahankan perilaku positif setelah proyek selesai.</li>
                            </ul>
                        </div>
                    </div>

                    <h6 class="font-bold text-sm bg-indigo-100 text-indigo-900 p-2 border border-black uppercase mt-4">E. ASESMEN & LEMBAR REFLEKSI</h6>
                    <div class="border border-black p-4 text-xs mb-4">
                        <p class="mb-2"><b>1. Asesmen Formatif (Penilaian Proses):</b> Dilakukan selama Tahap 1, 2, dan 3 menggunakan lembar observasi guru (fokus pada kolaborasi dan nalar kritis kelompok).</p>
                        <p class="mb-2"><b>2. Asesmen Sumatif (Produk & Pameran):</b> Penilaian terhadap kualitas karya akhir dan cara penyampaian (presentasi) saat aksi nyata di Tahap 3.</p>
                        <p><b>3. Lembar Refleksi Diri (Contoh Pertanyaan):</b><br>
                        - Bagian mana dari proyek ini yang paling berkesan bagimu?<br>
                        - Nilai profil pelajar Pancasila apa yang paling berkembang dalam dirimu selama proyek ini?<br>
                        - Apa yang akan kamu lakukan selanjutnya terkait isu ${esc(p.topic)} ini di kehidupan sehari-hari?</p>
                    </div>

                    <h6 class="font-bold text-sm bg-indigo-100 text-indigo-900 p-2 border border-black uppercase mt-4">F. LAMPIRAN MEDIA PEMBELAJARAN</h6>
                    <div class="border border-black p-4 text-xs mb-4">
                        <p class="mb-3">Untuk mendukung tahap Pengenalan dan Kontekstualisasi, guru dapat menggunakan tautan berikut sebagai bahan diskusi bersama peserta didik atau menyalin tautan ini untuk diberikan kepada siswa:</p>
                        <ul class="list-disc pl-5 space-y-3">
                            <li><b>Video Edukasi Interaktif:</b> Penjelasan visual mengenai studi kasus, penyebab, dan dampak dari masalah ${esc(p.topic)}. Membantu mengakomodasi siswa dengan gaya belajar visual-auditori.<br>
                            🔗 Tautan: <a href="${videoLink}" target="_blank" class="text-blue-700 underline break-all">${videoLink}</a></li>
                            
                            <li><b>Artikel Referensi Kritis:</b> Teks bacaan berupa berita atau fakta ilmiah untuk melatih kemampuan literasi dan nalar kritis siswa dalam menemukan akar permasalahan terkait isu ${esc(p.topic)}.<br>
                            🔗 Tautan: <a href="${articleLink}" target="_blank" class="text-blue-700 underline break-all">${articleLink}</a></li>
                        </ul>
                    </div>

                    <div class="flex justify-between text-xs text-center mt-12 px-8">
                        <div>
                            <p>Mengetahui,</p>
                            <p>Kepala Sekolah</p>
                            <br><br><br><br>
                            <p class="underline font-bold">${esc(settings.principal)}</p>
                            <p>NIP. ${esc(settings.nipPrincipal)}</p>
                        </div>
                        <div>
                            <p>Talaga Jaya, ..................... 2026</p>
                            <p>Koordinator Proyek P5</p>
                            <br><br><br><br>
                            <p class="underline font-bold">${esc(settings.teacher)}</p>
                            <p>NIP. ${esc(settings.nipTeacher)}</p>
                        </div>
                    </div>
                `;

                content.innerHTML = html;
                container.classList.remove('hidden');
                
                setTimeout(() => {
                    container.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 100);

                btn.innerHTML = origText;
                btn.disabled = false;
                showModal("Sukses", "Modul Proyek P5 berhasil disusun oleh AI berdasarkan parameter proyek.", "✨");
            }, 1200);
        }

        function downloadModulP5Doc() {
            let content = document.getElementById('p5ModuleContent').innerHTML;
            if(!content || content.trim() === '') {
                showModal("Peringatan", "Modul Proyek belum digenerate.", "⚠️");
                return;
            }
            
            let preHtml = "<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>Modul Proyek P5</title></head><body>";
            let postHtml = "</body></html>";
            let html = preHtml + content + postHtml;

            let blob = new Blob(['\ufeff', html], { type: 'application/msword' });
            
            let link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            
            let clsObj = classes.find(c => c.classId === activeClassId);
            let clsName = clsObj ? clsObj.className : '';
            link.download = `Modul_Proyek_P5_${clsName}.doc`;
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }

