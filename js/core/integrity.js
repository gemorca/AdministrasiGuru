/**
 * Integritas relasi antar data.
 *
 * Aplikasi menyimpan data sebagai daftar datar (allStudents, allScores, dst.).
 * Menghapus induk tanpa membersihkan turunan meninggalkan data yatim.
 * Modul ini: (1) menghitung turunan sebelum dihapus agar bisa ditampilkan di konfirmasi,
 * (2) menghapus berantai, (3) audit data yatim.
 *
 * Bergantung pada variabel global all* dari js/app/state.js (dibaca saat dipanggil).
 */
const Integrity = (() => {
    const ids = arr => new Set(arr);

    function countList(parts) {
        return parts.filter(p => p.n > 0);
    }

    function describe(parts) {
        const list = countList(parts);
        if (!list.length) return '';
        return ' Data terkait yang ikut terhapus permanen: ' + list.map(p => `${p.n} ${p.label}`).join(', ') + '.';
    }

    // ---------- Siswa ----------
    function studentDeps(id) {
        return [
            { label: 'absensi', n: allAttendance.filter(a => a.studentId === id).length },
            { label: 'nilai', n: allScores.filter(s => s.studentId === id).length },
            { label: 'tindak lanjut', n: allFollowUps.filter(f => f.studentId === id).length },
            { label: 'pengumpulan tugas', n: allSubmissions.filter(s => s.studentId === id).length },
            { label: 'nilai ulangan harian', n: allDailyScores.filter(s => s.studentId === id).length },
            { label: 'kontak wali', n: allGuardians.filter(g => g.studentId === id).length },
            { label: 'catatan komunikasi', n: allCommunications.filter(c => c.studentId === id).length },
            { label: 'surat', n: allDocuments.filter(d => d.studentId === id).length },
            { label: 'narasi rapor', n: allRaporDescriptions.filter(d => d.studentId === id).length }
        ];
    }
    function cascadeStudent(id) {
        const guardianIds = ids(allGuardians.filter(g => g.studentId === id).map(g => g.id));
        allStudents = allStudents.filter(s => s.id !== id);
        allAttendance = allAttendance.filter(a => a.studentId !== id);
        allScores = allScores.filter(s => s.studentId !== id);
        allFollowUps = allFollowUps.filter(f => f.studentId !== id);
        allSubmissions = allSubmissions.filter(s => s.studentId !== id);
        allDailyScores = allDailyScores.filter(s => s.studentId !== id);
        allGuardians = allGuardians.filter(g => g.studentId !== id);
        allCommunications = allCommunications.filter(c => c.studentId !== id && !guardianIds.has(c.guardianId));
        allDocuments = allDocuments.filter(d => d.studentId !== id);
        allRaporDescriptions = allRaporDescriptions.filter(d => d.studentId !== id);
    }

    // ---------- Wali ----------
    function guardianDeps(id) {
        return [{ label: 'catatan komunikasi', n: allCommunications.filter(c => c.guardianId === id).length }];
    }
    function cascadeGuardian(id) {
        allGuardians = allGuardians.filter(g => g.id !== id);
        allCommunications = allCommunications.filter(c => c.guardianId !== id);
    }

    // ---------- Kelas ----------
    function classDeps(classId) {
        const stu = ids(allStudents.filter(s => s.classId === classId).map(s => s.id));
        const mtg = ids(allMeetings.filter(m => m.classId === classId).map(m => m.id));
        const asm = ids(allAssessments.filter(a => a.classId === classId).map(a => a.id));
        const asg = ids(allAssignments.filter(a => a.classId === classId).map(a => a.id));
        const dt = ids(allDailyTests.filter(d => d.classId === classId).map(d => d.id));
        return [
            { label: 'siswa', n: stu.size },
            { label: 'pertemuan', n: mtg.size },
            { label: 'absensi', n: allAttendance.filter(a => mtg.has(a.meetingId) || stu.has(a.studentId)).length },
            { label: 'asesmen', n: asm.size },
            { label: 'nilai', n: allScores.filter(s => asm.has(s.assessmentId) || stu.has(s.studentId)).length },
            { label: 'tugas', n: asg.size },
            { label: 'pengumpulan tugas', n: allSubmissions.filter(s => asg.has(s.assignmentId) || stu.has(s.studentId)).length },
            { label: 'ulangan harian', n: dt.size },
            { label: 'jurnal', n: allJournals.filter(j => j.classId === classId).length },
            { label: 'komunikasi', n: allCommunications.filter(c => c.classId === classId || stu.has(c.studentId)).length },
            { label: 'surat', n: allDocuments.filter(d => d.classId === classId || stu.has(d.studentId)).length },
            { label: 'tindak lanjut', n: allFollowUps.filter(f => f.classId === classId || stu.has(f.studentId)).length },
            { label: 'modul ajar tersimpan', n: allMaterials.filter(m => m.classId === classId).length }
        ];
    }
    function cascadeClass(classId) {
        const studentIds = allStudents.filter(s => s.classId === classId).map(s => s.id);
        studentIds.forEach(cascadeStudent);
        const mtg = ids(allMeetings.filter(m => m.classId === classId).map(m => m.id));
        const asm = ids(allAssessments.filter(a => a.classId === classId).map(a => a.id));
        const asg = ids(allAssignments.filter(a => a.classId === classId).map(a => a.id));
        const dt = ids(allDailyTests.filter(d => d.classId === classId).map(d => d.id));
        allMeetings = allMeetings.filter(m => m.classId !== classId);
        allAttendance = allAttendance.filter(a => !mtg.has(a.meetingId));
        allAssessments = allAssessments.filter(a => a.classId !== classId);
        allScores = allScores.filter(s => !asm.has(s.assessmentId));
        allAssignments = allAssignments.filter(a => a.classId !== classId);
        allSubmissions = allSubmissions.filter(s => !asg.has(s.assignmentId));
        allDailyTests = allDailyTests.filter(d => d.classId !== classId);
        allDailyScores = allDailyScores.filter(s => !dt.has(s.testId));
        allJournals = allJournals.filter(j => j.classId !== classId);
        allCommunications = allCommunications.filter(c => c.classId !== classId);
        allDocuments = allDocuments.filter(d => d.classId !== classId);
        allFollowUps = allFollowUps.filter(f => f.classId !== classId);
        allMaterials = allMaterials.filter(m => m.classId !== classId);
        allSchedules = allSchedules.filter(s => s.classId !== classId);
        classes = classes.filter(c => c.classId !== classId);
    }

    // ---------- CP / TP (referensi lemah: dilepas, bukan dihapus) ----------
    function cpTpIds(cpId) { return ids(allTP.filter(t => t.cpId === cpId).map(t => t.tpId)); }
    function cpDeps(cpId) {
        const tp = cpTpIds(cpId);
        return [
            { label: 'asesmen kehilangan kaitan TP', n: allAssessments.filter(a => tp.has(a.tpId)).length },
            { label: 'tugas kehilangan kaitan TP', n: allAssignments.filter(a => tp.has(a.tpId)).length },
            { label: 'modul ajar kehilangan kaitan TP', n: allMaterials.filter(m => tp.has(m.tpId)).length }
        ];
    }
    function describeDetach(parts) {
        const list = countList(parts);
        if (!list.length) return '';
        return ' Dampak: ' + list.map(p => `${p.n} ${p.label}`).join(', ') + ' (datanya tetap ada, hanya kaitannya dilepas).';
    }
    function cascadeCp(cpId) {
        const tp = cpTpIds(cpId);
        allAssessments.forEach(a => { if (tp.has(a.tpId)) a.tpId = null; });
        allAssignments.forEach(a => { if (tp.has(a.tpId)) a.tpId = null; });
        allMaterials.forEach(m => { if (tp.has(m.tpId)) m.tpId = null; });
        allCP = allCP.filter(c => c.cpId !== cpId);
        allTP = allTP.filter(t => t.cpId !== cpId);
    }

    // ---------- Audit ----------
    /** Mengembalikan daftar data yatim tanpa mengubah apa pun. */
    function audit() {
        const stu = ids(allStudents.map(s => s.id));
        const cls = ids(classes.map(c => c.classId));
        const mtg = ids(allMeetings.map(m => m.id));
        const asm = ids(allAssessments.map(a => a.id).concat(['UTS', 'UAS']));
        const asg = ids(allAssignments.map(a => a.id));
        const dt = ids(allDailyTests.map(d => d.id));
        const grd = ids(allGuardians.map(g => g.id));
        const out = [];
        const chk = (label, arr, fn) => { const n = arr.filter(fn).length; if (n) out.push({ label, n }); };
        chk('siswa tanpa kelas', allStudents, s => s.classId && !cls.has(s.classId));
        chk('absensi tanpa siswa', allAttendance, a => a.studentId && !stu.has(a.studentId));
        chk('absensi tanpa pertemuan', allAttendance, a => a.meetingId && !mtg.has(a.meetingId));
        chk('nilai tanpa siswa', allScores, s => s.studentId && !stu.has(s.studentId));
        chk('nilai tanpa asesmen', allScores, s => s.assessmentId && !asm.has(s.assessmentId));
        chk('pengumpulan tanpa tugas', allSubmissions, s => s.assignmentId && !asg.has(s.assignmentId));
        chk('pengumpulan tanpa siswa', allSubmissions, s => s.studentId && !stu.has(s.studentId));
        chk('nilai ulangan tanpa tes', allDailyScores, s => s.testId && !dt.has(s.testId));
        chk('nilai ulangan tanpa siswa', allDailyScores, s => s.studentId && !stu.has(s.studentId));
        chk('wali tanpa siswa', allGuardians, g => g.studentId && !stu.has(g.studentId));
        chk('komunikasi tanpa wali', allCommunications, c => c.guardianId && !grd.has(c.guardianId));
        chk('komunikasi tanpa siswa', allCommunications, c => c.studentId && !stu.has(c.studentId));
        chk('surat tanpa siswa', allDocuments, d => d.studentId && !stu.has(d.studentId));
        chk('pertemuan tanpa kelas', allMeetings, m => m.classId && !cls.has(m.classId));
        chk('asesmen tanpa kelas', allAssessments, a => a.classId && !cls.has(a.classId));
        chk('modul ajar tanpa kelas', allMaterials, m => m.classId && !cls.has(m.classId));
        chk('tindak lanjut tanpa siswa', allFollowUps, f => f.studentId && !stu.has(f.studentId));
        return out;
    }

    return {
        describe, describeDetach,
        studentDeps, cascadeStudent,
        guardianDeps, cascadeGuardian,
        classDeps, cascadeClass,
        cpDeps, cascadeCp,
        audit
    };
})();
