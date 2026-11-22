// js/modules/dashboard.js
// Dipecah dari sistem_administrasi_guru.html (Tahap 0). Skrip klasik: fungsi bersifat global.
        function renderDashboard() {
            let elTot = document.getElementById('dTotalSiswa');
            if (elTot) elTot.innerText = students.length;
            let lCount = students.filter(s => s.gender === 'L').length;
            let pCount = students.filter(s => s.gender === 'P').length;
            let elGen = document.getElementById('dGenderInfo');
            if (elGen) elGen.innerText = `L: ${lCount} | P: ${pCount}`;

            let totAtt = 0, validScores = 0, sumScores = 0, tuntasCount = 0;
            students.forEach(s => {
                let att = calcAttStats(s.id);
                if (att.tot) totAtt += att.pct;
                let r = calcFinalScore(s.id);
                if (r.final !== null) {
                    validScores++;
                    sumScores += r.final;
                    if (r.passed) tuntasCount++;
                }
            });

            let elHadir = document.getElementById('dAvgHadir');
            if (elHadir) elHadir.innerText = students.length ? Math.round((totAtt / students.length) * 10) / 10 + '%' : '0%';
            let elMtg = document.getElementById('dMeetInfo');
            if (elMtg) elMtg.innerText = `${meetings.length} Pertemuan`;
            let elNilai = document.getElementById('dAvgNilai');
            if (elNilai) elNilai.innerText = validScores ? Math.round((sumScores / validScores) * 10) / 10 : '0';
            let elKett = document.getElementById('dKetuntasan');
            if (elKett) elKett.innerText = validScores ? Math.round((tuntasCount / validScores) * 100) + '%' : '0%';
            let elPass = document.getElementById('dPassInfo');
            if (elPass) elPass.innerText = `${tuntasCount} Tuntas | ${validScores - tuntasCount} Belum`;

            if (chart1) chart1.destroy();
            if (chart2) chart2.destroy();

            let ctx1 = document.getElementById('chartTuntas');
            let ctx2 = document.getElementById('chartTindak');
            if (ctx1 && ctx2) {
                chart1 = new Chart(ctx1.getContext('2d'), {
                    type: 'doughnut',
                    data: { labels: ['Tuntas', 'Belum Tuntas'], datasets: [{ data: [tuntasCount, validScores - tuntasCount], backgroundColor: ['#10b981', '#ef4444'], borderWidth: 0 }] },
                    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
                });
                chart2 = new Chart(ctx2.getContext('2d'), {
                    type: 'bar',
                    data: { labels: ['Remedial', 'Tuntas', 'Pengayaan'], datasets: [{ data: [validScores - tuntasCount, tuntasCount, 0], backgroundColor: ['#ef4444', '#3b82f6', '#10b981'], borderRadius: 6 }] },
                    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
                });
            }
        }

