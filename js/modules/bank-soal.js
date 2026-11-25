// js/modules/bank-soal.js
// Dipecah dari sistem_administrasi_guru.html (Tahap 0). Skrip klasik: fungsi bersifat global.
        function renderBankSoal() {
            let tbody = document.getElementById('bankSoalTableBody');
            if (!tbody) return;
            tbody.innerHTML = questionList.length ? questionList.map(q => `
                <tr>
                    <td class="p-3 font-bold text-slate-700">${esc(q.code)}</td>
                    <td class="p-3 text-slate-800 whitespace-pre-wrap">${esc(q.text)}${q.key ? `<div class="text-[11px] text-emerald-700 mt-1"><b>Kunci:</b> ${esc(q.key)}</div>` : ''}${q.explanation ? `<div class="text-[11px] text-slate-500">${esc(q.explanation)}</div>` : ''}${q.source === 'ai' ? '<div class="text-[10px] text-indigo-500 no-print">Dibuat dengan AI, sudah Anda tinjau</div>' : ''}</td>
                    <td class="p-3"><span class="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs font-bold rounded">${esc(q.type)}</span></td>
                    <td class="p-3 font-semibold">${esc(q.cog)}</td>
                    <td class="p-3">${esc(q.diff)}</td>
                    <td class="p-3 text-center no-print"><button onclick="deleteQuestion('${q.id}')" class="text-red-600 font-bold text-xs bg-red-50 px-2.5 py-1 rounded-lg">Hapus</button></td>
                </tr>
            `).join('') : `<tr><td colspan="6" class="text-center py-8 text-slate-400 italic">Belum ada butir soal dalam Bank Soal.</td></tr>`;
        }

        function openModalQuestionAI() {
            let form = document.getElementById('formQuestionAI');
            if(form) form.reset();
            
            uploadedKisiName = "";
            uploadedKisiDoc = null;
            let statusEl = document.getElementById('uploadedKisiStatus');
            if(statusEl) {
                statusEl.innerText = "Belum ada file kisi-kisi diunggah";
                statusEl.className = "ml-2 font-semibold text-indigo-900 italic text-[11px]";
            }

            let sel = document.getElementById('aiQuesTp');
            if(sel) {
                sel.innerHTML = tpList.length ? tpList.map(t => `<option value="${t.tpId}">${esc(t.code)} - ${esc(t.iktp ? t.iktp.substring(0, 50) : t.description.substring(0,50))}...</option>`).join('') : '<option value="">(Belum ada TP dirumuskan pada Kurikulum)</option>';
            }
            
            let modal = document.getElementById('modalQuestionAI');
            if(modal) modal.classList.remove('hidden');
        }

        // ---------- Generate soal & kisi-kisi dengan Gemini ----------
        let aiPreview = null; // { items:[{q, include}], tp, mode, info }

        function existingQuestionKeys() {
            return new Set(allQuestions.map(q => AITasks.soal.norm(String(q.text || '').split('\n')[0])));
        }

        /** Meminta soal ke Gemini per kelompok (maks 8), membuang butir tidak valid/duplikat, dan menambah kekurangan sekali. */
        async function generateQuestionDrafts(o) {
            const pii = AIUI.pii();
            const T = AITasks.soal;
            const diff = o.mode === 'kisi' ? { kesulitan: 'Campuran', levels: 'C1 sampai C4 (disebar)' } : T.difficulty(o.diffLabel);
            const plan = o.mode === 'kisi' ? T.plan('Campuran', o.count) : T.plan(o.type, o.count);
            const seen = existingQuestionKeys();
            const accepted = [], dropped = [];
            let offset = 0;
            for (const n of T.batches(o.count)) {
                let need = n, round = 0;
                while (need > 0 && round < 2) {
                    round++;
                    const sub = plan ? plan.slice(offset + (n - need), offset + n) : null;
                    const t = T.build({ mode: o.mode, tp: o.tp, iktp: o.iktp, count: need, plan: sub, diff, kisi: uploadedKisiDoc,
                        scrub: pii.scrub, avoid: accepted.map(a => a.text), offset: offset + (n - need) });
                    const r = await AIService.generate({ task: o.mode === 'kisi' ? 'kisi' : 'soal', ...t, signal: o.signal, pii });
                    for (const item of r.data.soal) {
                        const probs = T.itemProblems(item);
                        if (probs.length) { dropped.push(probs[0]); continue; }
                        const q = T.normalize(item);
                        const k = T.norm(q.text.split('\n')[0]);
                        if (seen.has(k)) { dropped.push('soal kembar'); continue; }
                        if (accepted.length - 0 >= o.count) break;
                        seen.add(k);
                        accepted.push(q);
                        need--;
                        if (need === 0) break;
                    }
                }
                offset += n;
            }
            return { accepted, dropped, requested: o.count };
        }

        function openAiPreview(res, tp, mode) {
            aiPreview = { items: res.accepted.map(q => ({ q, include: true })), tp, mode };
            let box = document.getElementById('aiPreviewList');
            let info = `Diminta ${res.requested} butir, valid ${res.accepted.length}.` + (res.dropped.length ? ` ${res.dropped.length} butir dibuang karena tidak lolos pemeriksaan (${[...new Set(res.dropped)].slice(0, 3).join('; ')}).` : '');
            document.getElementById('aiPreviewInfo').innerText = info;
            document.getElementById('aiPreviewTitle').innerText = mode === 'kisi' ? 'Draf Kisi-Kisi dan Soal AI' : 'Draf Soal AI';
            box.innerHTML = res.accepted.length ? res.accepted.map((q, i) => `
                <label class="block border border-slate-200 rounded-xl p-3 text-sm cursor-pointer">
                    <div class="flex items-start gap-2">
                        <input type="checkbox" checked onchange="aiPreview.items[${i}].include=this.checked" class="mt-1">
                        <div class="flex-1">
                            <div class="text-[11px] font-bold text-blue-700">${i + 1}. ${esc(q.tipe)} · ${esc(q.cog)} · ${esc(q.diff)}</div>
                            <div class="whitespace-pre-wrap">${esc(q.text)}</div>
                            <div class="text-[11px] text-emerald-700 mt-1"><b>Kunci:</b> ${esc(q.key)}</div>
                            <div class="text-[11px] text-slate-500"><b>Pembahasan:</b> ${esc(q.explanation)}</div>
                            <div class="text-[11px] text-slate-500"><b>Indikator:</b> ${esc(q.indicator)}</div>
                        </div>
                    </div>
                </label>`).join('') : '<div class="text-sm text-slate-500 italic p-4">Tidak ada butir yang lolos pemeriksaan. Coba lagi.</div>';
            document.getElementById('modalAiPreview').classList.remove('hidden');
        }

        function saveAiPreview() {
            if (!aiPreview) return;
            let chosen = aiPreview.items.filter(x => x.include).map(x => x.q);
            if (!chosen.length) { showModal('Peringatan', 'Pilih minimal satu butir untuk disimpan.', '⚠️'); return; }
            let codes = allQuestions.map(q => q.code);
            chosen.forEach(q => {
                let code = AITasks.soal.nextCode(q.tipe, codes);
                codes.push(code);
                allQuestions.push({
                    id: genId('Q'), periodId: activePeriodId, code, text: q.text, type: q.tipe, cog: q.cog, diff: q.diff,
                    tpId: aiPreview.tp.tpId, indicator: q.indicator, material: AITasks.oneLine(aiPreview.tp.description),
                    key: q.key, explanation: q.explanation, source: 'ai'
                });
            });
            saveAllData();
            loadActiveContextData();
            renderBankSoal();
            document.getElementById('modalAiPreview').classList.add('hidden');
            ['modalQuestionAI', 'modalKisiKisiAI'].forEach(id => document.getElementById(id)?.classList.add('hidden'));
            aiPreview = null;
            showModal('Tersimpan', `${chosen.length} butir soal disimpan ke Bank Soal. Periksa kunci jawaban sebelum dipakai ke siswa.`, '✅');
        }

        async function processGenerateSoalAI(e) {
            e.preventDefault();
            if (!uploadedKisiDoc) {
                showModal("Perhatian", "Harap unggah file kisi-kisi (PDF, DOCX, atau TXT) terlebih dahulu sebelum meng-generate soal!", "⚠️");
                return;
            }
            let tp = tpList.find(t => t.tpId === document.getElementById('aiQuesTp').value);
            if (!tp) { showModal("Peringatan", "Harap pilih Tujuan Pembelajaran (TP) terkait.", "⚠️"); return; }
            if (!AIUI.ensureReady()) return;
            let count = Math.max(1, Math.min(30, parseInt(document.getElementById('aiCount').value) || 3));
            let btn = document.getElementById('btnGenAI');
            let res = await AIUI.run(btn, 'AI menyusun soal', signal => generateQuestionDrafts({
                mode: 'soal', tp, iktp: tp.iktp || tp.description, count,
                diffLabel: document.getElementById('aiDiff').value, type: document.getElementById('aiType').value, signal
            }));
            if (res) openAiPreview(res, tp, 'soal');
        }

        function openModalKisiKisiAI() {
            let form = document.getElementById('formKisiKisiAI');
            if(form) form.reset();
            
            let sel = document.getElementById('aiKisiTp');
            if(sel) {
                sel.innerHTML = tpList.length ? tpList.map(t => `<option value="${t.tpId}">${esc(t.code)} - ${esc(t.description.substring(0,50))}...</option>`).join('') : '<option value="">(Belum ada TP dirumuskan pada Kurikulum)</option>';
                if(tpList.length > 0) fillIKTPForKisi(tpList[0].tpId);
            }
            
            let modal = document.getElementById('modalKisiKisiAI');
            if(modal) modal.classList.remove('hidden');
        }

        function fillIKTPForKisi(tpId) {
            let tp = tpList.find(t => t.tpId === tpId);
            if(tp) {
                document.getElementById('aiKisiIktp').value = tp.iktp || tp.description;
            }
        }

        async function processGenerateKisiKisiAI(e) {
            e.preventDefault();
            let tp = tpList.find(t => t.tpId === document.getElementById('aiKisiTp').value);
            let iktp = document.getElementById('aiKisiIktp').value.trim();
            if (!tp) { showModal("Peringatan", "Pilih Tujuan Pembelajaran (TP) terlebih dahulu.", "⚠️"); return; }
            if (!iktp) { showModal("Peringatan", "IKTP tidak boleh kosong.", "⚠️"); return; }
            if (!AIUI.ensureReady()) return;
            let count = Math.max(1, Math.min(30, parseInt(document.getElementById('aiKisiCount').value) || 5));
            let btn = document.getElementById('btnGenKisiAI');
            let res = await AIUI.run(btn, 'AI menyusun kisi-kisi', signal => generateQuestionDrafts({ mode: 'kisi', tp, iktp, count, signal }));
            if (res) openAiPreview(res, tp, 'kisi');
        }

        function openModalQuestion() {
            let form = document.getElementById('formQuestionManual');
            if(form) form.reset();
            let codeField = document.getElementById('qManCode');
            if(codeField) codeField.value = "IPA-VII-001";
            let modal = document.getElementById('modalQuestionManual');
            if(modal) modal.classList.remove('hidden');
        }
        
        function saveQuestionManual(e) {
            e.preventDefault();
            let code = document.getElementById('qManCode').value.trim();
            let text = document.getElementById('qManText').value.trim();
            let type = document.getElementById('qManType').value;
            let diff = document.getElementById('qManDiff').value;
            let cog = diff === 'Sulit' ? 'C4' : (diff === 'Mudah' ? 'C1' : 'C2');
            
            allQuestions.push({ id: genId('Q'), periodId: activePeriodId, code, text, type, cog, diff,
                key: (document.getElementById('qManKey')?.value || '').trim(), explanation: (document.getElementById('qManExp')?.value || '').trim() });
            saveAllData();
            loadActiveContextData();
            renderBankSoal();
            document.getElementById('modalQuestionManual').classList.add('hidden');
            showModal("Sukses", "Soal berhasil ditambahkan ke Bank Soal.", "✅");
        }

        function deleteQuestion(id) {
            showConfirm("Apakah Anda yakin ingin menghapus soal ini?", () => {
                allQuestions = allQuestions.filter(q => q.id !== id);
                saveAllData();
                loadActiveContextData();
                renderBankSoal();
            });
        }

        // --- FITUR KISI-KISI & KARTU SOAL ---
        function tpOfQ(q) { return q.tpId ? tpList.find(t => t.tpId === q.tpId) : null; }

        function prepareKisiKisiDom() {
            let tbody = document.getElementById('kisiKisiTbody');
            if(!tbody) return;
            
            tbody.innerHTML = questionList.length ? questionList.map((q, idx) => `
                <tr>
                    <td class="border border-black p-2 text-center">${idx + 1}</td>
                    <td class="border border-black p-2">${esc(tpOfQ(q) ? (tpOfQ(q).code + ': ' + tpOfQ(q).description) : '-')}</td>
                    <td class="border border-black p-2">${esc(q.material || '-')}</td>
                    <td class="border border-black p-2">${esc(q.indicator || 'Peserta didik dapat menyelesaikan/menganalisis persoalan terkait materi dengan tepat.')}</td>
                    <td class="border border-black p-2 text-center font-bold">${esc(q.cog)}</td>
                    <td class="border border-black p-2 text-center">${esc(q.type)}</td>
                    <td class="border border-black p-2 text-center font-bold">${idx + 1}</td>
                </tr>
            `).join('') : `<tr><td colspan="7" class="text-center p-4 italic">Belum ada butir soal.</td></tr>`;

            document.getElementById('kkSchool').innerText = settings.school;
            document.getElementById('kkSubject').innerText = settings.subject;
            document.getElementById('kkTotal').innerText = questionList.length;
            
            let active = periods.find(p => p.id === activePeriodId);
            document.getElementById('kkPeriod').innerText = active ? `${active.year} / ${active.semester}` : '-';
        }

        function downloadKisiKisiDoc() {
            prepareKisiKisiDom();
            
            // Tampilkan sementara ke DOM untuk mengambil HTML-nya
            let canvas = document.getElementById('printKisiKisiCanvas');
            canvas.classList.remove('hidden');
            let content = canvas.innerHTML;
            canvas.classList.add('hidden');
            
            if(!content || content.trim() === '') {
                showModal("Peringatan", "Data Kisi-Kisi kosong.", "⚠️");
                return;
            }
            
            // Styling khusus agar tabel di Word rapi
            let preHtml = "<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>Kisi-Kisi Soal</title><style>table { border-collapse: collapse; width: 100%; font-family: sans-serif; font-size: 12px; } th, td { border: 1px solid black; padding: 8px; text-align: left; } .text-center { text-align: center; } .font-bold { font-weight: bold; }</style></head><body>";
            let postHtml = "</body></html>";
            let html = preHtml + content + postHtml;

            let blob = new Blob(['\ufeff', html], { type: 'application/msword' });
            
            let link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            
            let clsObj = classes.find(c => c.classId === activeClassId);
            let clsName = clsObj ? clsObj.className : '';
            link.download = `Kisi_Kisi_Soal_${settings.subject}_${clsName}.doc`;
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            showModal("Berhasil", "Kisi-kisi soal berhasil diunduh dalam format Word (.doc).", "✅");
        }

        function printKisiKisi() {
            prepareKisiKisiDom();

            let canvas = document.getElementById('printKisiKisiCanvas');
            let mainContent = document.getElementById('bankSoalMainContent');
            
            canvas.classList.remove('hidden');
            mainContent.classList.add('hidden');
            
            let standardHeader = document.getElementById('printHeaderTemplate');
            if(standardHeader) standardHeader.style.display = 'none';

            let targetView = document.getElementById('view-bank-soal');
            targetView.classList.add('active-print');
            
            setTimeout(() => {
                window.print();
                canvas.classList.add('hidden');
                mainContent.classList.remove('hidden');
                targetView.classList.remove('active-print');
                if(standardHeader) standardHeader.style.display = '';
            }, 100);
        }

        function printKartuSoal() {
            let container = document.getElementById('printKartuSoalCanvas');
            if(!container) return;
            
            let active = periods.find(p => p.id === activePeriodId);
            let periodStr = active ? `${active.year} / ${active.semester}` : '-';
            
            container.innerHTML = questionList.length ? questionList.map((q, idx) => `
                <div class="border border-black p-4 break-inside-avoid mb-6 bg-white">
                    <h4 class="font-bold text-center underline mb-4 uppercase">KARTU SOAL NOMOR ${idx + 1}</h4>
                    <div class="grid grid-cols-2 text-xs mb-4 gap-4">
                        <div>
                            <p>Mata Pelajaran : <b>${esc(settings.subject)}</b></p>
                            <p>Kelas / Semester : <b>Kelas Aktif / ${periodStr}</b></p>
                        </div>
                        <div>
                            <p>Kurikulum : <b>Merdeka</b></p>
                            <p>Bentuk Soal : <b>${esc(q.type)}</b></p>
                        </div>
                    </div>
                    <table class="w-full border-collapse border border-black text-xs mb-4">
                        <tr>
                            <td class="border border-black p-2 font-bold w-1/3 bg-slate-50">Tujuan Pembelajaran</td>
                            <td class="border border-black p-2">${esc(tpOfQ(q) ? (tpOfQ(q).code + ': ' + tpOfQ(q).description) : '-')}</td>
                        </tr>
                        <tr>
                            <td class="border border-black p-2 font-bold bg-slate-50">Materi Pokok</td>
                            <td class="border border-black p-2">${esc(q.material || '-')}</td>
                        </tr>
                        <tr>
                            <td class="border border-black p-2 font-bold bg-slate-50">Indikator Soal</td>
                            <td class="border border-black p-2">${esc(q.indicator || 'Peserta didik dapat menyelesaikan/menganalisis persoalan terkait materi dengan tepat.')}</td>
                        </tr>
                        ${q.key ? `<tr><td class="border border-black p-2 font-bold bg-slate-50">Kunci Jawaban</td><td class="border border-black p-2 whitespace-pre-wrap">${esc(q.key)}</td></tr>` : ''}
                        ${q.explanation ? `<tr><td class="border border-black p-2 font-bold bg-slate-50">Pembahasan</td><td class="border border-black p-2">${esc(q.explanation)}</td></tr>` : ''}
                    </table>
                    <div class="border border-black p-4 min-h-[150px] text-sm">
                        <p class="font-bold mb-2">Rumusan Butir Soal:</p>
                        <p>${esc(q.text)}</p>
                    </div>
                    <div class="border border-black border-t-0 p-2 text-xs flex justify-between bg-slate-50">
                        <span>Level Kognitif: <b class="text-blue-700">${esc(q.cog)}</b></span>
                        <span>Tingkat Kesulitan: <b class="text-red-700">${esc(q.diff)}</b></span>
                    </div>
                </div>
            `).join('') : `<p class="text-center italic">Belum ada butir soal.</p>`;

            let canvas = document.getElementById('printKartuSoalCanvas');
            let mainContent = document.getElementById('bankSoalMainContent');
            
            canvas.classList.remove('hidden');
            mainContent.classList.add('hidden');
            
            let standardHeader = document.getElementById('printHeaderTemplate');
            if(standardHeader) standardHeader.style.display = 'none';

            let targetView = document.getElementById('view-bank-soal');
            targetView.classList.add('active-print');
            
            setTimeout(() => {
                window.print();
                canvas.classList.add('hidden');
                mainContent.classList.remove('hidden');
                targetView.classList.remove('active-print');
                if(standardHeader) standardHeader.style.display = '';
            }, 100);
        }

        function downloadSoalDoc() {
            if (!questionList || questionList.length === 0) {
                showModal("Peringatan", "Belum ada soal untuk diunduh.", "⚠️");
                return;
            }

            let clsObj = classes.find(c => c.classId === activeClassId);
            let clsName = clsObj ? clsObj.className : '-';
            let active = periods.find(p => p.id === activePeriodId);
            let periodStr = active ? `${active.year} / ${active.semester}` : '-';

            let htmlContent = `
                <div style="text-align: center; margin-bottom: 20px;">
                    <h3 style="margin: 0; text-transform: uppercase;">NASKAH SOAL ASESMEN</h3>
                    <h4 style="margin: 5px 0;">Mata Pelajaran: ${esc(settings.subject)} | Sekolah: ${esc(settings.school)}</h4>
                    <p style="margin: 0; font-size: 12px;">Tahun Pelajaran: ${periodStr}</p>
                    <hr style="border: 1px solid black; border-bottom: none; margin-top: 10px;" />
                </div>
                <div style="font-size: 11pt; line-height: 1.5; font-family: 'Times New Roman', Times, serif;">
            `;

            questionList.forEach((q, idx) => {
                let lines = q.text.split('\n');
                let formattedQuestion = "";

                if (q.type === 'Menjodohkan') {
                    let instructions = [];
                    let tableRows = [];
                    
                    lines.forEach((line, i) => {
                        let text = line.trim();
                        if (text === '') return;
                        
                        if (text.includes('( )') || text.includes('()')) {
                            // Ekstrak sisi kiri dan kanan dari penanda "( )" untuk dimasukkan ke tabel
                            let parts = text.split(/\(\s?\)/);
                            let left = parts[0].trim();
                            let right = (parts[1] || '').trim();
                            tableRows.push(`
                                <tr>
                                    <td style="padding: 5px; border: 1px solid black; vertical-align: top; width: 45%;">${esc(left)}</td>
                                    <td style="padding: 5px; border: 1px solid black; vertical-align: middle; text-align: center; width: 10%;">......</td>
                                    <td style="padding: 5px; border: 1px solid black; vertical-align: top; width: 45%;">${esc(right)}</td>
                                </tr>
                            `);
                        } else {
                            if (i === 0) {
                                instructions.push(`<p style="margin: 0 0 5px 25px; text-indent: -25px; text-align: justify;"><b>${idx + 1}.</b> ${esc(text)}</p>`);
                            } else {
                                instructions.push(`<p style="margin: 2px 0 5px 25px; text-align: justify;">${esc(text)}</p>`);
                            }
                        }
                    });
                    
                    formattedQuestion = instructions.join('');
                    if (tableRows.length > 0) {
                        formattedQuestion += `
                            <table style="width: 95%; border-collapse: collapse; margin-left: 25px; margin-top: 5px; margin-bottom: 10px;" border="1">
                                ${tableRows.join('')}
                            </table>
                        `;
                    }
                } else if (q.type === 'Benar-Salah') {
                    let firstLine = lines[0].trim();
                    let restLines = lines.slice(1).join('<br>').trim();
                    
                    let instruction = firstLine;
                    let statement = restLines;
                    
                    // Jika AI menyatukan instruksi dan pernyataan dalam satu baris (dipisah titik dua)
                    if (!restLines && firstLine.includes(':')) {
                        let splitIdx = firstLine.indexOf(':');
                        instruction = firstLine.substring(0, splitIdx + 1);
                        statement = firstLine.substring(splitIdx + 1).trim();
                    }

                    formattedQuestion = `
                        <p style="margin: 0 0 5px 25px; text-indent: -25px; text-align: justify;"><b>${idx + 1}.</b> ${esc(instruction)}</p>
                        <table style="width: 95%; border-collapse: collapse; margin-left: 25px; margin-top: 5px; margin-bottom: 10px;" border="1">
                            <tr>
                                <td style="padding: 8px; text-align: justify; border: 1px solid black;">${statement || '......................................................................'}</td>
                                <td style="padding: 8px; text-align: center; width: 50px; border: 1px solid black; font-weight: bold;">B</td>
                                <td style="padding: 8px; text-align: center; width: 50px; border: 1px solid black; font-weight: bold;">S</td>
                            </tr>
                        </table>
                    `;
                } else {
                    formattedQuestion = lines.map((line, i) => {
                        let text = line.trim();
                        if (text === '') return '';
                        
                        text = text.replace(/  /g, '&nbsp;&nbsp;');

                        if (i === 0) {
                            return `<p style="margin: 0 0 5px 25px; text-indent: -25px; text-align: justify;"><b>${idx + 1}.</b> ${esc(text)}</p>`;
                        } else {
                            let isOption = /^([A-E]\.|\[\s?\]|\d+\.|[a-e]\.)\s/.test(line.trim()) || text.includes('&nbsp;&nbsp;( )');
                            let marginL = isOption ? '45px' : '25px';
                            return `<p style="margin: 2px 0 2px ${marginL}; text-align: left;">${esc(text)}</p>`;
                        }
                    }).join('');
                }

                htmlContent += `
                    <div style="margin-bottom: 15px;">
                        <p style="margin: 0 0 4px 0; font-size: 9pt; color: #555555; font-style: italic;">
                            [Bentuk: ${esc(q.type)} | Kognitif: ${esc(q.cog)} | Kesulitan: ${esc(q.diff)}]
                        </p>
                        ${formattedQuestion}
                    </div>
                `;
            });

            htmlContent += `</div>`;

            let preHtml = "<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>Kumpulan Soal</title></head><body>";
            let postHtml = "</body></html>";
            let finalHtml = preHtml + htmlContent + postHtml;

            let blob = new Blob(['\ufeff', finalHtml], { type: 'application/msword' });
            let link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `Naskah_Soal_${settings.subject}_${clsName}.doc`;
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            showModal("Berhasil", "Naskah soal berhasil diunduh dengan tabel rapi untuk soal Menjodohkan dan Benar-Salah.", "✅");
        }
