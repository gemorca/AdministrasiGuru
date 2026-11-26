// js/app/state.js
// Dipecah dari sistem_administrasi_guru.html (Tahap 0). Skrip klasik: fungsi bersifat global.
        const DEFAULT_SETTINGS = {
            school: "SMP Negeri 1 Talaga Jaya",
            subject: "Ilmu Pengetahuan Alam (IPA)",
            teacher: "Guru Mapel",
            nipTeacher: "-",
            pangkatTeacher: "",
            phoneTeacher: "",
            emailTeacher: "",
            principal: "Kepala Sekolah, M.Pd.",
            nipPrincipal: "-",
            fase: "D",
            semester: "GENAP",
            academicYear: "2026/2027",
            kktp: 75,
            wForm: 30,
            wSum: 30,
            wUts: 20,
            wUas: 20,
            ...Grading.DEFAULTS,
            printAiMark: true,
            ai: {
                enabled: false, mode: 'proxy', proxyUrl: '', model: 'gemini-3.6-flash', fallbackModel: '',
                style: 'auto', styleResolved: null, privacyAckAt: null, allowNames: false,
                styleTerse: false, custom: false, touched: false, modelChosen: false, lastTestOk: null
            }
        };

        let settings = {};
        let periods = [];
        let activePeriodId = null;
        let classes = [], activeClassId = null;
        let allStudents = [], allMeetings = [], allAttendance = [], allAssessments = [], allScores = [], allFollowUps = [];
        let allCP = [], allTP = [], allMaterials = [], allQuestions = [], allAssessmentPkgs = [], allRaporDescriptions = [], allSchedules = [], allJournals = [];
        let allP5Projects = [], allAssignments = [], allSubmissions = []; // TAHAP 18
        let allGuardians = [], allCommunications = []; // TAHAP 19
        let allDocuments = []; // TAHAP 20
        let allDailyTests = [], allDailyScores = []; // ANALISIS ULANGAN
        
        let students = [], meetings = [], attendance = [], assessments = [], scores = [], followUps = [], schedules = [], journals = [];
        let cpList = [], tpList = [], materialList = [], questionList = [];
        let p5List = [], assignments = [], submissions = []; // TAHAP 18
        let guardians = [], communications = []; // TAHAP 19
        let docList = []; // TAHAP 20
        let dailyTests = [], dailyScores = []; // ANALISIS ULANGAN
        let chart1 = null, chart2 = null;
        let uploadedRefName = ""; // Menyimpan nama materi/buku yang diunggah
        let uploadedKisiName = ""; // Menyimpan nama file kisi-kisi yang diunggah

        const P5_THEMES = {
            "Gaya Hidup Berkelanjutan": ["Pengelolaan Sampah Plastik", "Jejak Karbon di Sekolah", "Pembuatan Kompos dan Taman Kelas", "Daur Ulang Barang Bekas", "Lainnya..."],
            "Kearifan Lokal": ["Eksplorasi Kuliner Tradisional", "Seni Budaya dan Tarian Daerah", "Permainan Tradisional Nusantara", "Batik dan Kriya Lokal", "Lainnya..."],
            "Bhinneka Tunggal Ika": ["Kampanye Anti Perundungan (Bullying)", "Mengenal Keberagaman Budaya Nusantara", "Toleransi Beragama di Sekolah", "Festival Pakaian Adat", "Lainnya..."],
            "Bangunlah Jiwa dan Raganya": ["Kesehatan Mental Remaja", "Senam Kreasi Pelajar", "Kampanye Anti Narkoba", "Gizi Seimbang dan Bekal Sehat", "Lainnya..."],
            "Suara Demokrasi": ["Pemilihan Ketua OSIS", "Simulasi Sidang Parlemen", "Musyawarah Mufakat di Kelas", "Kebebasan Berpendapat yang Bertanggung Jawab", "Lainnya..."],
            "Rekayasa dan Teknologi": ["Desain Alat Penjernih Air", "Smart Farming Sederhana", "Robotika Dasar", "Aplikasi/Web Informasi Sekolah", "Lainnya..."],
            "Kewirausahaan": ["Bazar Produk Inovatif", "Koperasi Siswa", "Budidaya Tanaman Hias", "Kerajinan Bernilai Jual", "Lainnya..."]
        };
