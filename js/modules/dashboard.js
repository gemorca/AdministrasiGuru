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
                    elWarn.innerHTML = `<div class="px-5 py-8 text-xs text-slate-500 text-center">Belum ada peserta didik terdaftar pada kelas aktif ini.</div>`;
                } else if (!warnings.length) {
                    elWarn.innerHTML = `<div class="px-5 py-8 text-xs text-slate-600 text-center">Seluruh siswa berada di atas batas kehadiran dan ketuntasan saat ini.</div>`;
                } else {
                    elWarn.innerHTML = warnings.map(w => `
                        <div class="px-5 py-3 flex items-center justify-between gap-3 text-xs hover:bg-slate-50">
                            <div class="min-w-0">
                                <p class="font-medium text-slate-900 truncate">${esc(w.student.name)}</p>
                                <p class="text-[11px] text-slate-500 tabular-nums">NISN ${esc(w.student.nis)}</p>
                            </div>
                            <div class="flex items-center gap-1.5 flex-wrap justify-end flex-shrink-0">
                                ${w.lowAtt ? `<span class="px-2 py-0.5 rounded bg-red-50 text-red-700 border border-red-200 font-medium tabular-nums">Hadir ${w.attPct}%</span>` : ''}
                                ${w.lowScore ? `<span class="px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 font-medium tabular-nums">Nilai ${w.final}</span>` : ''}
                                <button type="button" onclick="switchView('${w.lowScore ? 'remedial' : 'recap-attendance'}')" class="btn btn-secondary py-1 px-2.5 text-[11px]">Tindak Lanjut</button>
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
                        ? { labels: ['Tuntas', 'Belum Tuntas'], datasets: [{ data: [tuntasCount, validScores - tuntasCount], backgroundColor: ['#15803d', '#dc2626'], borderWidth: 0, hoverOffset: 4 }] }
                        : { labels: ['Belum Ada Nilai Akhir'], datasets: [{ data: [1], backgroundColor: ['#e5e7eb'], borderWidth: 0 }] },
                    options: { responsive: true, maintainAspectRatio: false, cutout: '68%', plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, padding: 14, font: { size: 11, weight: '500' } } } } }
                });
                chart2 = new Chart(ctx2.getContext('2d'), {
                    type: 'bar',
                    data: {
                        labels: ['Remedial', 'Reguler', 'Pengayaan'],
                        datasets: [{
                            data: [validScores - tuntasCount, Math.max(0, tuntasCount - pengayaanCount), pengayaanCount],
                            backgroundColor: ['#dc2626', '#1d4ed8', '#15803d'],
                            borderRadius: 4,
                            maxBarThickness: 36
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: { y: { beginAtZero: true, ticks: { precision: 0, font: { size: 11 } }, grid: { color: '#f3f4f6' } }, x: { ticks: { font: { size: 11 } }, grid: { display: false } } },
                        plugins: { legend: { display: false } }
                    }
                });
            }
        }
