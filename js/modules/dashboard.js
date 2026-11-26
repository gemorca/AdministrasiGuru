// js/modules/dashboard.js
// Dipecah dari sistem_administrasi_guru.html (Tahap 0). Skrip klasik: fungsi bersifat global.
        function renderDashboard() {
            let elTot = document.getElementById('dTotalSiswa');
            if (elTot) elTot.innerText = students.length;
            let lCount = students.filter(s => s.gender === 'L').length;
            let pCount = students.filter(s => s.gender === 'P').length;
            let elGen = document.getElementById('dGenderInfo');
            if (elGen) elGen.innerText = `L: ${lCount} | P: ${pCount}`;

            let totAtt = 0, validScores = 0, sumScores = 0, tuntasCount = 0, pengayaanCount = 0;
            const cfg = Grading.config(settings);
            const warnings = [];
            students.forEach(s => {
                let att = calcAttStats(s.id);
                if (att.tot) totAtt += att.pct;
                let r = calcFinalScore(s.id);
                if (r.final !== null) {
                    validScores++;
                    sumScores += r.final;
                    if (r.passed) {
                        tuntasCount++;
                        if (r.final >= cfg.predA) pengayaanCount++;
                    }
                }
                const lowAtt = att.tot > 0 && att.pct < cfg.attMin;
                const lowScore = r.final !== null && !r.passed;
                if (lowAtt || lowScore) {
                    warnings.push({ student: s, attPct: att.tot ? Math.round(att.pct) : null, final: r.final, lowAtt, lowScore });
                }
            });

            let elHadir = document.getElementById('dAvgHadir');
            if (elHadir) elHadir.innerText = (students.length && meetings.length) ? Math.round((totAtt / students.length) * 10) / 10 + '%' : '0%';
            let elMtg = document.getElementById('dMeetInfo');
            if (elMtg) elMtg.innerText = `${meetings.length} Pertemuan`;
            let elNilai = document.getElementById('dAvgNilai');
            if (elNilai) elNilai.innerText = validScores ? Math.round((sumScores / validScores) * 10) / 10 : '0';
            let elScInfo = document.getElementById('dScoreInfo');
            if (elScInfo) elScInfo.innerText = `KKTP: ${cfg.kktp}`;
            let elKett = document.getElementById('dKetuntasan');
            if (elKett) elKett.innerText = validScores ? Math.round((tuntasCount / validScores) * 100) + '%' : '0%';
            let elPass = document.getElementById('dPassInfo');
            if (elPass) elPass.innerText = `${tuntasCount} Tuntas | ${validScores - tuntasCount} Belum`;

            let elWarn = document.getElementById('dWarnings');
            if (elWarn) {
                if (!students.length) {
                    elWarn.innerHTML = `<div class="text-xs text-slate-500 bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 text-center">Belum ada peserta didik di kelas aktif ini.</div>`;
                } else if (!warnings.length) {
                    elWarn.innerHTML = `<div class="text-xs text-emerald-800 bg-emerald-50/80 border border-emerald-200 rounded-xl p-3.5 flex items-center gap-2.5"><span class="text-base">✅</span><span>Tidak ada siswa dengan peringatan kehadiran maupun ketuntasan nilai saat ini.</span></div>`;
                } else {
                    elWarn.innerHTML = warnings.map(w => `
                        <div class="flex items-center justify-between gap-3 p-3 rounded-xl border border-amber-200/80 bg-amber-50/50 text-xs">
                            <div class="min-w-0">
                                <span class="font-bold text-slate-800">${esc(w.student.name)}</span>
                                <span class="text-slate-400 ml-1">(${esc(w.student.nis)})</span>
                            </div>
                            <div class="flex items-center gap-1.5 flex-wrap justify-end">
                                ${w.lowAtt ? `<span class="px-2 py-0.5 rounded-full font-bold bg-red-100 text-red-700">Hadir ${w.attPct}%</span>` : ''}
                                ${w.lowScore ? `<span class="px-2 py-0.5 rounded-full font-bold bg-amber-100 text-amber-800">Nilai ${w.final}</span>` : ''}
                                <button type="button" onclick="switchView('${w.lowScore ? 'remedial' : 'recap-attendance'}')" class="px-2.5 py-1 rounded-lg font-bold bg-white border border-slate-200 text-blue-700 hover:bg-blue-50 transition">Tindak Lanjut</button>
                            </div>
                        </div>
                    `).join('');
                }
            }

            if (chart1) chart1.destroy();
            if (chart2) chart2.destroy();

            let ctx1 = document.getElementById('chartTuntas');
            let ctx2 = document.getElementById('chartTindak');
            if (ctx1 && ctx2) {
                const hasScoreData = validScores > 0;
                chart1 = new Chart(ctx1.getContext('2d'), {
                    type: 'doughnut',
                    data: hasScoreData
                        ? { labels: ['Tuntas', 'Belum Tuntas'], datasets: [{ data: [tuntasCount, validScores - tuntasCount], backgroundColor: ['#10b981', '#f43f5e'], borderWidth: 0, hoverOffset: 6 }] }
                        : { labels: ['Belum Ada Nilai Akhir'], datasets: [{ data: [1], backgroundColor: ['#e2e8f0'], borderWidth: 0 }] },
                    options: { responsive: true, maintainAspectRatio: false, cutout: '66%', plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, padding: 16, font: { size: 11, weight: '600' } } } } }
                });
                chart2 = new Chart(ctx2.getContext('2d'), {
                    type: 'bar',
                    data: {
                        labels: ['Perlu Remedial', 'Tuntas Reguler', 'Pengayaan (A)'],
                        datasets: [{
                            data: [validScores - tuntasCount, Math.max(0, tuntasCount - pengayaanCount), pengayaanCount],
                            backgroundColor: ['#f43f5e', '#3b82f6', '#10b981'],
                            borderRadius: 8,
                            maxBarThickness: 48
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false } } },
                        plugins: { legend: { display: false } }
                    }
                });
            }
        }
