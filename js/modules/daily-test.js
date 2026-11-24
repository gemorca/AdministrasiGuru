// js/modules/daily-test.js
// Dipecah dari sistem_administrasi_guru.html (Tahap 0). Skrip klasik: fungsi bersifat global.
        // --- ANALISIS ULANGAN HARIAN ---
        function renderDailyTestList() {
            let tbody = document.getElementById('dailyTestListBody');
            if(!tbody) return;
            
            document.getElementById('dailyTestDetailArea').classList.add('hidden');
            document.getElementById('dailyTestListContainer').classList.remove('hidden');

            tbody.innerHTML = dailyTests.length ? dailyTests.map(dt => {
                let isNumeric = ['PGK', 'IS', 'MJD', 'UR'].includes(dt.type);
                let dtSc = dailyScores.filter(s => s.testId === dt.id);
                let totalNilai = 0, tuntasCount = 0;
                
                let mk = dt.masterKey || Array(dt.qCount).fill('');
                let totalMaxScore = 0;
                if(isNumeric) {
                    mk.forEach(m => totalMaxScore += (parseFloat(m) || 0));
                    if(totalMaxScore === 0) totalMaxScore = dt.qCount;
                } else {
                    totalMaxScore = dt.qCount;
                }

                dtSc.forEach(s => {
                    let stScoreVal = 0;
                    if(isNumeric) {
                        s.answers.forEach(v => stScoreVal += (parseFloat(v) || 0));
                    } else {
                        s.answers.forEach((v, i) => {
                            if(mk[i] && String(v).toUpperCase() === String(mk[i]).toUpperCase()) stScoreVal++;
                        });
                    }
                    let n = Math.round((stScoreVal / totalMaxScore) * 100);
                    if(isNaN(n)) n = 0;
                    totalNilai += n;
                    if(n >= settings.kktp) tuntasCount++;
                });
                let avg = dtSc.length ? Math.round(totalNilai / dtSc.length) : 0;
                let passPct = dtSc.length ? Math.round((tuntasCount / dtSc.length) * 100) : 0;

                return `
                <tr class="hover:bg-slate-50 transition">
                    <td class="p-3 font-semibold text-xs text-slate-500">${dt.date}</td>
                    <td class="p-3 font-bold text-slate-800">${esc(dt.topic)} <span class="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded ml-1 font-normal border">${esc(dt.type || 'PG')}</span></td>
                    <td class="p-3 text-center">${dt.qCount} Butir</td>
                    <td class="p-3 text-center font-bold text-blue-700">${avg}</td>
                    <td class="p-3 text-center"><span class="px-2 py-1 rounded-lg text-[10px] font-bold ${passPct >= 50 ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}">${passPct}% Tuntas</span></td>
                    <td class="p-3 text-center flex justify-center gap-1">
                        <button onclick="openDailyTestDetail('${dt.id}')" class="text-white font-bold text-[10px] bg-blue-600 px-3 py-1.5 rounded-lg shadow-sm hover:bg-blue-700 transition">Input / Lihat Analisis</button>
                        <button onclick="deleteDailyTest('${dt.id}')" class="text-red-600 font-bold text-[10px] bg-red-50 border border-red-100 px-3 py-1.5 rounded-lg hover:bg-red-100 transition">Hapus</button>
                    </td>
                </tr>`;
            }).join('') : `<tr><td colspan="6" class="text-center py-8 text-slate-400 italic">Belum ada Analisis Ulangan Harian. Klik 'Buat Analisis Baru'.</td></tr>`;
        }

        function openModalDailyTest() {
            document.getElementById('formDailyTest').reset();
            document.getElementById('dtDate').value = new Date().toISOString().split('T')[0];
            document.getElementById('modalDailyTest').classList.remove('hidden');
        }

        function saveDailyTest(e) {
            e.preventDefault();
            let topic = document.getElementById('dtTopic').value.trim();
            let date = document.getElementById('dtDate').value;
            let qCount = parseInt(document.getElementById('dtQCount').value);
            let type = document.getElementById('dtType').value;
            
            let newId = genId('DT');
            let defMaster = Array(qCount).fill('');
            if(['PGK', 'IS', 'MJD', 'UR'].includes(type)) {
                defMaster = Array(qCount).fill('1'); // Default skor maksimal 1
            }

            allDailyTests.push({ id: newId, periodId: activePeriodId, classId: activeClassId, topic, date, qCount, type, masterKey: defMaster });
            
            students.forEach(st => {
                allDailyScores.push({
                    testId: newId,
                    studentId: st.id,
                    answers: Array(qCount).fill('')
                });
            });

            saveAllData();
            loadActiveContextData();
            renderDailyTestList();
            document.getElementById('modalDailyTest').classList.add('hidden');
            showModal("Sukses", "Analisis Ulangan Harian berhasil dibuat. Silakan klik tombol 'Input / Lihat Analisis'.", "✅");
        }

        function deleteDailyTest(id) {
            showConfirm("Apakah Anda yakin menghapus data analisis ini secara permanen?", () => {
                allDailyTests = allDailyTests.filter(d => d.id !== id);
                allDailyScores = allDailyScores.filter(s => s.testId !== id);
                saveAllData();
                loadActiveContextData();
                renderDailyTestList();
            });
        }

        function openDailyTestDetail(id) {
            let dt = dailyTests.find(d => d.id === id);
            if(!dt) return;
            
            if(!dt.masterKey) dt.masterKey = Array(dt.qCount).fill('');
            
            let syncNeeded = false;
            students.forEach(st => {
                if(!allDailyScores.find(s => s.testId === id && s.studentId === st.id)) {
                    allDailyScores.push({ testId: id, studentId: st.id, answers: Array(dt.qCount).fill('') });
                    syncNeeded = true;
                }
            });
            if(syncNeeded) {
                saveAllData();
                loadActiveContextData();
            }

            let isNumeric = ['PGK', 'IS', 'MJD', 'UR'].includes(dt.type);
            let mkLabel = isNumeric ? "SKOR MAKSIMAL TIAP BUTIR ➔" : "KUNCI JAWABAN (MASTER) ➔";
            let ansHeader = isNumeric ? "Skor Perolehan Tiap Butir Soal" : "Kunci / Jawaban Siswa (A/B/C/D/E/B/S)";

            let totalMaxScore = 0;
            if(isNumeric) {
                dt.masterKey.forEach(m => totalMaxScore += (parseFloat(m) || 0));
                if(totalMaxScore === 0) totalMaxScore = dt.qCount;
            } else {
                totalMaxScore = dt.qCount;
            }

            document.getElementById('dailyTestListContainer').classList.add('hidden');
            let container = document.getElementById('dailyTestDetailArea');
            container.classList.remove('hidden');
            
            let html = `
                <div class="flex justify-between items-center border-b pb-4 mb-2 no-print">
                    <div>
                        <h4 class="font-bold text-lg text-slate-800">Analisis Butir Soal: ${esc(dt.topic)}</h4>
                        <p class="text-xs text-slate-500">Tanggal: ${dt.date} | Jumlah Soal: ${dt.qCount}</p>
                    </div>
                    <div class="flex gap-2">
                        <button onclick="renderDailyTestList()" class="bg-slate-100 text-slate-700 px-4 py-2 rounded-xl text-xs font-bold hover:bg-slate-200 transition">Kembali</button>
                        <button onclick="printReport('view-daily-analysis', 'ANALISIS BUTIR SOAL ULANGAN HARIAN')" class="bg-slate-800 text-white px-4 py-2 rounded-xl text-xs font-bold shadow hover:bg-slate-700 transition">🖨️ Cetak Analisis</button>
                    </div>
                </div>
                
                <div class="hidden print:block text-center mb-6">
                    <h3 class="font-bold text-lg uppercase">Analisis Butir Soal Ulangan Harian</h3>
                    <p class="text-xs font-bold mt-1">Topik: ${esc(dt.topic)} &nbsp;|&nbsp; Tanggal: ${dt.date}</p>
                </div>

                <div class="overflow-x-auto">
                    <table class="w-full text-xs text-center border-collapse border border-slate-300">
                        <thead class="bg-slate-100 font-bold">
                            <tr>
                                <th class="border border-slate-300 p-2 text-left min-w-[160px]" rowspan="2">Nama Peserta Didik</th>
                                <th class="border border-slate-300 p-1" colspan="${dt.qCount}">${ansHeader}</th>
                                <th class="border border-slate-300 p-2 w-16 bg-blue-50 text-blue-800" rowspan="2">Total<br>Skor</th>
                                <th class="border border-slate-300 p-2 w-16 bg-indigo-50 text-indigo-800" rowspan="2">Nilai<br>Akhir</th>
                                <th class="border border-slate-300 p-2 w-16" rowspan="2">Ketuntasan</th>
                            </tr>
                            <tr>
                                ${Array.from({length: dt.qCount}, (_, i) => `<th class="border border-slate-300 p-1 min-w-[28px]">${i+1}</th>`).join('')}
                            </tr>
                        </thead>
                        <tbody>
                            <tr class="bg-amber-50 border-b-2 border-amber-200">
                                <td class="border border-slate-300 p-2 text-right font-bold text-amber-800">${mkLabel}</td>
                                ${dt.masterKey.map((mk, i) => `
                                    <td class="border border-slate-300 p-1 align-middle">
                                        <input type="text" maxlength="${isNumeric ? '4' : '1'}" value="${mk}" class="w-6 h-6 text-center font-bold text-amber-900 bg-white border border-amber-300 rounded uppercase focus:outline-none focus:ring-2 focus:ring-amber-500 print:hidden" onchange="updateMasterKey('${dt.id}', ${i}, this.value)">
                                        <span class="hidden print:inline font-bold">${esc(mk || '-')}</span>
                                    </td>
                                `).join('')}
                                <td class="border border-slate-300 p-2 bg-amber-100" colspan="3"></td>
                            </tr>
                            ${students.map(st => {
                                let stScore = dailyScores.find(s => s.studentId === st.id);
                                let ans = stScore ? stScore.answers : Array(dt.qCount).fill('');
                                
                                let stScoreVal = 0;
                                ans.forEach((val, i) => {
                                    if(isNumeric) {
                                        stScoreVal += (parseFloat(val) || 0);
                                    } else {
                                        if(dt.masterKey[i] && String(val).toUpperCase() === String(dt.masterKey[i]).toUpperCase()) stScoreVal++;
                                    }
                                });
                                
                                let nilai = Math.round((stScoreVal / totalMaxScore) * 100);
                                if(isNaN(nilai)) nilai = 0;
                                let tuntas = nilai >= settings.kktp;
                                
                                return `
                                <tr class="hover:bg-slate-50 border-b border-slate-200">
                                    <td class="border border-slate-300 p-2 text-left font-semibold text-slate-700 truncate">${esc(st.name)}</td>
                                    ${ans.map((val, qIdx) => {
                                        let isCorrect = false;
                                        let textColor = 'text-slate-800';
                                        if(val !== '') {
                                            if(!isNumeric) {
                                                isCorrect = dt.masterKey[qIdx] && String(val).toUpperCase() === String(dt.masterKey[qIdx]).toUpperCase();
                                                textColor = isCorrect ? 'text-emerald-600' : 'text-red-500';
                                            } else {
                                                textColor = 'text-blue-700'; 
                                            }
                                        }
                                        
                                        let displayVal = val;
                                        return `
                                        <td class="border border-slate-300 p-1 align-middle">
                                            <input type="text" maxlength="${isNumeric ? '4' : '1'}" value="${esc(displayVal)}" class="w-6 h-6 text-center font-bold ${textColor} bg-white border border-slate-200 rounded uppercase focus:outline-none focus:ring-2 focus:ring-blue-500 print:hidden" data-testid="${dt.id}" data-st="${st.id}" data-q="${qIdx}" onchange="updateDTAnswer(this)">
                                            <span class="hidden print:inline font-mono ${textColor}">${esc(displayVal || '-')}</span>
                                        </td>`;
                                    }).join('')}
                                    <td class="border border-slate-300 p-2 font-bold bg-blue-50/50" id="dt_benar_${st.id}">${stScoreVal}</td>
                                    <td class="border border-slate-300 p-2 font-bold text-indigo-700 bg-indigo-50/50" id="dt_nilai_${st.id}">${nilai}</td>
                                    <td class="border border-slate-300 p-2 font-bold ${tuntas ? 'text-emerald-600' : 'text-red-600'}" id="dt_tuntas_${st.id}">${tuntas ? 'Tuntas' : 'Belum'}</td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                        <tfoot class="bg-blue-50/60 font-bold text-[11px]" id="dtFoot">
                        </tfoot>
                    </table>
                </div>
            `;
            container.innerHTML = html;
            container.insertAdjacentHTML('beforeend', '<div id="itemAnalysisBox" class="mt-6"></div>');
            calculateDTFoot(dt.id, dt.qCount);
            renderItemAnalysis(dt.id);
        }

        // ---------- Analisis butir (tingkat kesukaran, daya pembeda, pengecoh) ----------
        // Perhitungan ada di js/domain/itemAnalysis.js. Deterministik: data sama selalu hasil sama.
        function renderItemAnalysis(testId) {
            let box = document.getElementById('itemAnalysisBox');
            let dt = dailyTests.find(d => d.id === testId);
            if (!box || !dt) return;
            let rows = allDailyScores.filter(s => s.testId === testId && students.find(st => st.id === s.studentId));
            let numeric = ['PGK', 'IS', 'MJD', 'UR'].includes(dt.type);
            let mk = dt.masterKey || [];
            let anyAnswer = rows.some(r => (r.answers || []).some(a => a !== '' && a !== null && a !== undefined));
            let keyReady = numeric ? mk.some(m => parseFloat(m) > 0) : mk.some(m => m);
            if (!anyAnswer || !keyReady) {
                box.innerHTML = `<div class="border border-slate-200 rounded-xl p-4 text-xs text-slate-500">Analisis butir akan muncul setelah ${numeric ? 'skor maksimal butir' : 'kunci jawaban'} dan jawaban siswa diisi.</div>`;
                return;
            }
            let input = ItemAnalysis.fromDailyTest(dt, rows);
            let res = ItemAnalysis.analyze(input.items, input.students);
            let notes = [];
            if (res.indicative) notes.push(`Jumlah siswa ${res.n} (kurang dari 10): hasil bersifat indikatif.`);
            notes.push(`Kelompok atas/bawah masing-masing ${res.groupSize} siswa (27%).`);
            if (res.reliability !== null) notes.push(`Reliabilitas KR-20: ${res.reliability}.`);
            let colorP = l => l === 'Sedang' ? 'text-emerald-700' : 'text-amber-700';
            let colorD = l => (l === 'Sangat baik' || l === 'Baik') ? 'text-emerald-700' : (l === 'Cukup' ? 'text-amber-700' : 'text-red-600');
            box.innerHTML = `
                <div class="border border-slate-300 rounded-xl overflow-hidden">
                    <div class="bg-slate-100 px-4 py-2 font-bold text-sm flex justify-between items-center">
                        <span>Analisis Butir Soal</span>
                        <button data-ai id="btnInterpretItems" onclick="interpretItemAnalysis('${dt.id}')" class="no-print px-3 py-1 bg-indigo-100 text-indigo-700 rounded-lg text-[11px] font-bold hover:bg-indigo-200 transition">🪄 Tafsirkan dengan AI</button>
                    </div>
                    <div id="itemInterpBox"></div>
                    <div class="px-4 py-2 text-[11px] text-slate-500">${notes.map(esc).join(' ')}</div>
                    <div class="overflow-x-auto">
                    <table class="w-full text-xs text-left border-t">
                        <thead class="bg-slate-50"><tr>
                            <th class="p-2">No</th><th class="p-2 text-center">Kesukaran (p)</th><th class="p-2">Kategori</th>
                            <th class="p-2 text-center">Daya Pembeda (D)</th><th class="p-2">Kategori</th><th class="p-2">Catatan</th>
                        </tr></thead>
                        <tbody>
                        ${res.items.map(it => `
                            <tr class="border-t">
                                <td class="p-2 font-bold">${it.no}</td>
                                <td class="p-2 text-center">${String(it.p).replace('.', ',')}</td>
                                <td class="p-2 font-semibold ${colorP(it.pLabel)}">${it.pLabel}</td>
                                <td class="p-2 text-center">${String(it.d).replace('.', ',')}</td>
                                <td class="p-2 font-semibold ${colorD(it.dLabel)}">${it.dLabel}</td>
                                <td class="p-2 text-slate-600">${esc(it.advice)}${it.distractorNotes && it.distractorNotes.length ? '<br><i>' + esc(it.distractorNotes.join('; ')) + '.</i>' : ''}</td>
                            </tr>`).join('')}
                        </tbody>
                    </table>
                    </div>
                </div>`;
        }

        function updateMasterKey(testId, qIdx, val) {
            let dt = allDailyTests.find(d => d.id === testId);
            if(dt) {
                if(!dt.masterKey) dt.masterKey = Array(dt.qCount).fill('');
                dt.masterKey[qIdx] = val.toUpperCase();
                saveAllData();
                loadActiveContextData();
                openDailyTestDetail(testId); 
            }
        }

        function updateDTAnswer(el) {
            let testId = el.getAttribute('data-testid');
            let stId = el.getAttribute('data-st');
            let qIdx = parseInt(el.getAttribute('data-q'));
            let val = el.value.toUpperCase();
            
            let dt = dailyTests.find(d => d.id === testId);
            let isNumeric = dt && ['PGK', 'IS', 'MJD', 'UR'].includes(dt.type);
            
            if(isNumeric) {
                 val = el.value; 
            }
            el.value = val;
            
            let stScore = allDailyScores.find(s => s.testId === testId && s.studentId === stId);
            if(stScore) stScore.answers[qIdx] = val;
            saveAllData();
            
            let mk = dt.masterKey || Array(dt.qCount).fill('');
            let totalMaxScore = 0;
            if(isNumeric) {
                mk.forEach(m => totalMaxScore += (parseFloat(m) || 0));
                if(totalMaxScore === 0) totalMaxScore = dt.qCount;
            } else {
                totalMaxScore = dt.qCount;
            }

            let stScoreVal = 0;
            stScore.answers.forEach((ans, i) => {
                if(isNumeric) {
                    stScoreVal += (parseFloat(ans) || 0);
                } else {
                    if(dt.masterKey[i] && String(ans).toUpperCase() === String(dt.masterKey[i]).toUpperCase()) stScoreVal++;
                }
            });
            
            let nilai = Math.round((stScoreVal / totalMaxScore) * 100);
            if(isNaN(nilai)) nilai = 0;
            let tuntas = nilai >= settings.kktp;
            
            document.getElementById(`dt_benar_${stId}`).innerText = stScoreVal;
            document.getElementById(`dt_nilai_${stId}`).innerText = nilai;
            
            let elTuntas = document.getElementById(`dt_tuntas_${stId}`);
            elTuntas.innerText = tuntas ? 'Tuntas' : 'Belum';
            elTuntas.className = `border border-slate-300 p-2 font-bold ${tuntas ? 'text-emerald-600' : 'text-red-600'}`;
            
            let textColor = 'text-slate-800';
            if(val !== '') {
                if(!isNumeric) {
                    let isCorrect = dt.masterKey[qIdx] && val === dt.masterKey[qIdx];
                    textColor = isCorrect ? 'text-emerald-600' : 'text-red-500';
                } else {
                    textColor = 'text-blue-700';
                }
            }
            el.className = `w-6 h-6 text-center font-bold ${textColor} bg-white border border-slate-200 rounded uppercase focus:outline-none focus:ring-2 focus:ring-blue-500 print:hidden`;
            
            el.nextElementSibling.innerText = val || '-';
            el.nextElementSibling.className = `hidden print:inline font-mono ${textColor}`;

            calculateDTFoot(testId, dt.qCount);
            renderItemAnalysis(testId);
        }
        
        function calculateDTFoot(testId, qCount) {
            let foot = document.getElementById('dtFoot');
            if(!foot) return;
            
            let dt = dailyTests.find(d => d.id === testId);
            let isNumeric = dt && ['PGK', 'IS', 'MJD', 'UR'].includes(dt.type);
            let mk = dt.masterKey || Array(qCount).fill('');
            let dtScores = allDailyScores.filter(s => s.testId === testId && students.find(st => st.id === s.studentId));
            let totalSiswa = students.length;
            
            let row1Title = isNumeric ? "Total Skor Klasikal" : "Jml Menjawab Benar";
            let row2Title = isNumeric ? "Rata-rata Skor Butir" : "Daya Serap Butir (%)";
            
            let html = `<tr><td class="border border-slate-300 p-2 text-right">${row1Title}</td>`;
            for(let i=0; i<qCount; i++) {
                let sum = 0;
                dtScores.forEach(s => {
                    if(isNumeric) {
                        sum += (parseFloat(s.answers[i]) || 0);
                    } else {
                        if(mk[i] && String(s.answers[i]).toUpperCase() === String(mk[i]).toUpperCase()) sum++;
                    }
                });
                html += `<td class="border border-slate-300 p-1.5">${isNumeric ? (Math.round(sum*10)/10) : sum}</td>`;
            }
            html += `<td class="border border-slate-300 p-2 bg-slate-100" colspan="3"></td></tr>`;
            
            html += `<tr><td class="border border-slate-300 p-2 text-right text-blue-800">${row2Title}</td>`;
            for(let i=0; i<qCount; i++) {
                let sum = 0;
                dtScores.forEach(s => {
                    if(isNumeric) {
                        sum += (parseFloat(s.answers[i]) || 0);
                    } else {
                        if(mk[i] && String(s.answers[i]).toUpperCase() === String(mk[i]).toUpperCase()) sum++;
                    }
                });
                
                if (isNumeric) {
                    let avgScore = totalSiswa ? (Math.round((sum/totalSiswa)*10)/10) : 0;
                    let maxS = parseFloat(mk[i]) || 1;
                    let pct = Math.round((avgScore / maxS) * 100);
                    if(isNaN(pct)) pct = 0;
                    let textColor = pct < 50 ? 'text-red-600' : 'text-blue-700';
                    html += `<td class="border border-slate-300 p-1.5 ${textColor}">${avgScore}</td>`;
                } else {
                    let daya = totalSiswa ? Math.round((sum/totalSiswa)*100) : 0;
                    let textColor = daya < 50 ? 'text-red-600' : 'text-blue-700';
                    html += `<td class="border border-slate-300 p-1.5 ${textColor}">${daya}%</td>`;
                }
            }
            html += `<td class="border border-slate-300 p-2 bg-slate-100" colspan="3"></td></tr>`;
            
            foot.innerHTML = html;
        }


        // ---------- Tafsiran AI atas analisis butir (angka tetap dari kode) ----------
        async function interpretItemAnalysis(testId) {
            let dt = dailyTests.find(d => d.id === testId);
            if (!dt) return;
            let rows = allDailyScores.filter(s => s.testId === testId && students.find(st => st.id === s.studentId));
            let input = ItemAnalysis.fromDailyTest(dt, rows);
            let stats = ItemAnalysis.analyze(input.items, input.students);
            if (!stats.items.length) { showModal("Peringatan", "Isi kunci/skor maksimal dan jawaban siswa terlebih dahulu.", "⚠️"); return; }
            if (!AIUI.ensureReady()) return;
            let btn = document.getElementById('btnInterpretItems');
            // Hanya statistik butir yang dikirim: tidak ada nama atau jawaban per siswa.
            let d = await AIUI.run(btn, 'AI menafsirkan', async (signal) => {
                const pii = AIUI.pii();
                const tp = dt.tpId ? tpList.find(t => t.tpId === dt.tpId) : null;
                const t = AITasks.interp.build({ dt, tp, stats });
                const r = await AIService.generate({ task: 'interpretasi', ...t, terse: true, signal, pii });
                return r.data;
            });
            if (!d) return;
            let box = document.getElementById('itemInterpBox');
            if (!box) return;
            box.innerHTML = `
                <div class="m-3 border border-indigo-200 bg-indigo-50/50 rounded-xl p-3 text-xs space-y-2">
                    <div class="font-bold text-indigo-800">Tafsiran AI <span class="font-normal text-[10px] text-indigo-500">(Dibuat dengan AI, mohon diperiksa. Angka di tabel dihitung aplikasi.)</span></div>
                    <p>${esc(d.ringkasan)}</p>
                    ${d.butir.length ? `<div><b>Butir bermasalah:</b><ul class="list-disc pl-5">${d.butir.map(b => `<li><b>Butir ${b.no}:</b> ${esc(b.penyebab)} <i>Saran: ${esc(b.saran)}</i></li>`).join('')}</ul></div>` : ''}
                    <div><b>Strategi remedial:</b><ul class="list-disc pl-5">${d.remedial.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
                    <div><b>Strategi pengayaan:</b><ul class="list-disc pl-5">${d.pengayaan.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
                </div>`;
        }
