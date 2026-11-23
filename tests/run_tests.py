#!/usr/bin/env python3
"""
Uji Tahap 0 (Playwright, Chromium headless, tanpa internet).

Pemakaian:
    python3 tests/run_tests.py [path/ke/sistem_administrasi_guru_asli.html]

Argumen opsional = file HTML asli. Jika ada, dijalankan juga uji paritas (tampilan tiap menu
harus sama dengan file asli) dan uji pembanding XSS (file asli harus gagal, versi baru lulus).
CDN Tailwind/Chart.js dicegat: Tailwind dikosongkan, Chart.js diganti stub kecil.
"""
import json, sys, pathlib, re, copy, tempfile
from playwright.sync_api import sync_playwright

import threading, functools, http.server, socketserver

ROOT = pathlib.Path(__file__).resolve().parents[1]
ORIG = pathlib.Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else None

class _Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

def serve(directory):
    """Server HTTP lokal. Dipakai karena localStorage di file:// tidak konsisten antar muat ulang di Chromium."""
    handler = functools.partial(_Quiet, directory=str(directory))
    srv = socketserver.TCPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return 'http://127.0.0.1:%d' % srv.server_address[1]

INDEX = serve(ROOT) + '/index.html'
ORIG_URL = (serve(ORIG.parent) + '/' + ORIG.name) if ORIG else None

PAYLOAD = '<img src=x onerror="window.__xss=1">'

# ------------------------------------------------------------------ data uji (format LAMA)
PER = 'PER-2026-2027-GENAP'
T0 = 1700000000000  # penanda waktu pada ID lama
def legacy_seed():
    s = {}
    s['g_set'] = {"school": "SMP Negeri 1 Uji", "subject": "IPA", "teacher": "Bu Guru", "nipTeacher": "1",
                  "principal": "Kepsek", "nipPrincipal": "2", "fase": "D", "semester": "GENAP",
                  "academicYear": "2026/2027", "kktp": 75, "wForm": 30, "wSum": 30, "wUts": 20, "wUas": 20}
    s['g_per'] = [{"id": PER, "year": "2026/2027", "semester": "GENAP", "isActive": True}]
    s['g_cls'] = [{"classId": "CLS-VII1", "periodId": PER, "className": "VII.1", "gradeLevel": "VII", "phase": "D", "status": "active"},
                  {"classId": "CLS-VII2", "periodId": PER, "className": "VII.2", "gradeLevel": "VII", "phase": "D", "status": "active"}]
    names = ["Ahmad Fauzan", "Siti Aminah", "Budi O'Brien & Co", 'Dewi "Cantik" Lestari', "Eka <Putra>", "Fajar"]
    s['g_stu'] = []
    for i, n in enumerate(names, 1):
        cid = "CLS-VII1" if i <= 4 else "CLS-VII2"
        s['g_stu'].append({"id": f"STU-{T0 + i}", "periodId": PER, "classId": cid, "nis": str(1000 + i), "name": n,
                           "gender": "L" if i % 2 else "P", "class": "VII.1" if i <= 4 else "VII.2"})
    s['g_mtg'] = [{"id": f"MTG-{T0 + 100}", "periodId": PER, "classId": "CLS-VII1", "num": 1, "date": "2026-07-20", "time": "07:30", "topic": "Pengantar"},
                  {"id": f"MTG-{T0 + 101}", "periodId": PER, "classId": "CLS-VII1", "num": 2, "date": "2026-07-27", "time": "07:30", "topic": "Zat"}]
    s['g_att'] = []
    for m in (T0 + 100, T0 + 101):
        for i in range(1, 5):
            s['g_att'].append({"id": f"ATT-{m}-{i}", "periodId": PER, "meetingId": f"MTG-{m}", "studentId": f"STU-{T0 + i}", "status": "H" if (i + m) % 3 else "S"})
    s['g_cp'] = [{"cpId": f"CP-{T0 + 200}", "periodId": PER, "element": "Zat dan Perubahannya", "description": "Peserta didik mampu menganalisis zat.",
                  "cogLevel": "C4 (Menganalisis)", "competence": "1. Menganalisis", "content": "1. Zat", "uniTp": "1. TP satu", "uniAtp": "1. ATP satu",
                  "uniIktp": "1. IKTP satu", "uniKktp": "1. KKTP satu"}]
    s['g_tp'] = [{"tpId": f"TP-{T0 + 201}", "periodId": PER, "cpId": f"CP-{T0 + 200}", "code": "TP-1.1", "hours": 2,
                  "description": "Peserta didik mampu menganalisis klasifikasi zat", "atp": "ATP 1", "iktp": "1. Mampu menganalisis (C4) klasifikasi zat pada level C4", "kktp": "75"}]
    s['g_ass'] = [{"id": f"ASM-{T0 + 300}", "periodId": PER, "classId": "CLS-VII1", "type": "Formatif", "name": "Formatif 1", "topic": "Zat", "tpId": f"TP-{T0 + 201}", "date": "2026-07-28"},
                  {"id": f"ASM-{T0 + 301}", "periodId": PER, "classId": "CLS-VII1", "type": "Sumatif", "name": "Sumatif 1", "topic": "Zat", "tpId": f"TP-{T0 + 201}", "date": "2026-08-10"}]
    s['g_scr'] = []
    for a in (T0 + 300, T0 + 301):
        for i in range(1, 5):
            s['g_scr'].append({"id": f"SCR-{i}-{a}", "periodId": PER, "assessmentId": f"ASM-{a}", "studentId": f"STU-{T0 + i}", "score": 60 + i * 7})
    for i in range(1, 5):
        s['g_scr'].append({"id": f"SCR-U{i}", "periodId": PER, "assessmentId": "UTS", "studentId": f"STU-{T0 + i}", "score": 70 + i})
    s['g_fol'] = [{"id": f"FOL-{T0 + 400}", "periodId": PER, "classId": "CLS-VII1", "studentId": f"STU-{T0 + 1}", "type": "Remedial", "note": "Ulang TP"}]
    s['g_mat'] = []
    s['g_qst'] = [{"id": f"Q-{T0 + 500}", "periodId": PER, "code": "PG-001", "text": "Apa itu zat?\nA. a\nB. b", "type": "Pilihan Ganda", "cog": "C2", "diff": "Mudah"}]
    s['g_pkg'] = [{"id": f"PKG-{T0 + 600}", "periodId": PER, "name": "Paket A", "questionIds": [f"Q-{T0 + 500}"]}]
    s['g_rdesc'] = [{"id": f"RD-{T0 + 700}", "studentId": f"STU-{T0 + 1}", "periodId": PER, "text": "Narasi satu."}]
    s['g_sch'] = [{"id": f"SCH-{T0 + 800}", "periodId": PER, "classId": "CLS-VII1", "day": "Senin", "hour": "1-2"},
                  {"id": f"SCH-{T0 + 801}", "periodId": PER, "classId": "CLS-VII2", "day": "Selasa", "hour": "3"}]
    s['g_jour'] = [{"id": f"JOUR-{T0 + 900}", "periodId": PER, "classId": "CLS-VII1", "date": "2026-07-20", "num": 1, "topic": "Pengantar",
                    "model": "PBL", "status": "Terlaksana", "reflection": "Baik."}]
    s['g_p5_proj'] = [{"id": f"PROYEK-{T0 + 1000}", "periodId": PER, "theme": "Kearifan Lokal", "topic": "Batik", "title": "Pameran Batik",
                       "description": "Deskripsi proyek.", "dimension": "Kreativitas", "scale": "1 Minggu", "phase": "D"}]
    s['g_assign'] = [{"id": f"ASG-{T0 + 1100}", "periodId": PER, "classId": "CLS-VII1", "tpId": f"TP-{T0 + 201}", "title": "LKPD Zat", "type": "LKPD",
                      "instructions": "Kerjakan.", "rubric": "1. Isi", "deadline": "2026-08-01", "status": "Aktif"}]
    s['g_submit'] = [{"id": f"SUB-{T0 + 1101}", "periodId": PER, "assignmentId": f"ASG-{T0 + 1100}", "studentId": f"STU-{T0 + 1}", "status": "Sudah",
                      "score": 88, "feedback": "Bagus", "submittedAt": "2026-07-30"}]
    s['g_guardians'] = [{"id": f"GRD-{T0 + 1200}", "periodId": PER, "studentId": f"STU-{T0 + 1}", "name": "Pak Ahmad", "relation": "Ayah", "phone": "0812", "isPrimary": True}]
    s['g_communications'] = [{"id": f"COM-{T0 + 1300}", "periodId": PER, "classId": "CLS-VII1", "studentId": f"STU-{T0 + 1}", "guardianId": f"GRD-{T0 + 1200}",
                              "date": "2026-07-25", "type": "WhatsApp", "topic": "Kehadiran", "summary": "Dibahas.", "followUp": "Pantau", "status": "Selesai"}]
    s['g_docs'] = [{"id": f"DOC-{T0 + 1400}", "periodId": PER, "classId": "CLS-VII1", "studentId": f"STU-{T0 + 1}", "docNumber": "001/SK/2026",
                    "type": "Surat Apresiasi", "date": "2026-07-26", "content": "Isi surat."}]
    s['g_dt'] = [{"id": f"DT-{T0 + 1500}", "periodId": PER, "classId": "CLS-VII1", "topic": "Ulangan 1", "date": "2026-07-29", "qCount": 5, "type": "PG",
                  "masterKey": ["A", "B", "C", "D", "A"]}]
    s['g_dts'] = [{"testId": f"DT-{T0 + 1500}", "studentId": f"STU-{T0 + i}", "answers": ["A", "B", "C", "D", "B"]} for i in range(1, 5)]
    return s

FREE_TEXT = {'name', 'nis', 'className', 'description', 'text', 'title', 'topic', 'summary', 'followUp', 'relation',
             'phone', 'content', 'reflection', 'instructions', 'rubric', 'feedback', 'competence', 'uniTp', 'uniAtp',
             'uniIktp', 'uniKktp', 'theme', 'iktp', 'atp', 'docNumber', 'note', 'element', 'class', 'code', 'model',
             'school', 'teacher', 'subject', 'principal'}
def payload_seed():
    s = copy.deepcopy(legacy_seed())
    for k, v in s.items():
        recs = [v] if isinstance(v, dict) else v
        for r in recs:
            if not isinstance(r, dict): continue
            for f in list(r):
                if f in FREE_TEXT and isinstance(r[f], str):
                    r[f] = PAYLOAD + r[f]
    return s

# ------------------------------------------------------------------ infrastruktur
STUB_CHART = "window.Chart=function(){this.destroy=function(){};this.update=function(){}};"
RESULTS = []
def check(name, ok, detail=''):
    RESULTS.append((name, bool(ok), detail))
    print(('PASS ' if ok else 'FAIL ') + name + ((' :: ' + str(detail)) if detail and not ok else ''))

def new_ctx(browser):
    ctx = browser.new_context(accept_downloads=True)
    def route(r):
        u = r.request.url
        if 'cdn.tailwindcss.com' in u: return r.fulfill(status=200, content_type='application/javascript', body='')
        if 'cdn.jsdelivr.net' in u: return r.fulfill(status=200, content_type='application/javascript', body=STUB_CHART)
        if u.startswith('file://') or u.startswith('http://127.0.0.1'): return r.continue_()
        return r.abort()
    ctx.route('**/*', route)
    return ctx

DET = "(()=>{let s=12345;Math.random=()=>{s=(s*16807)%2147483647;return (s-1)/2147483646;};})();"
def seed_script(data):
    return DET + "if(!localStorage.getItem('__seeded')){const d=%s;for(const k in d)localStorage.setItem(k,JSON.stringify(d[k]));localStorage.setItem('__seeded','1');}" % json.dumps(data)

def open_page(ctx, url, data=None, extra=''):
    page = ctx.new_page()
    errs = []
    page.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)[:200]))
    page.on('console', lambda m: errs.append('console.error: ' + m.text[:200]) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
    if data is not None: page.add_init_script(seed_script(data))
    if extra: page.add_init_script(extra)
    page.goto(url)
    page.wait_for_function("typeof initApp==='function' && document.querySelectorAll('#navMenu button').length>0")
    return page, errs

def visit_all_views(page):
    texts = {}
    n = page.locator('#navMenu button').count()
    for i in range(n):
        btn = page.locator('#navMenu button').nth(i)
        label = btn.inner_text().strip()
        btn.click()
        page.wait_for_timeout(30)
        t = page.evaluate("(document.querySelector('.view-section.active')||{}).innerText||''")
        texts[label] = re.sub(r'\s+', ' ', t).strip()
    return texts

def modal_text(page):
    return page.evaluate("document.getElementById('customModal').classList.contains('hidden') ? '' : (document.getElementById('modalTitle').innerText+' | '+document.getElementById('modalMessage').innerText)")

# ------------------------------------------------------------------ uji

def t1_seed():
    """Kelas VII.1 dengan 4 siswa, kehadiran 100%, asesmen lengkap untuk siswa 1: F 80, S 70, UTS 90, UAS 60."""
    d = legacy_seed()
    for a in d['g_att']: a['status'] = 'H'
    d['g_scr'] = []
    d['g_ass'] = [
        {"id": "ASM-F1", "periodId": PER, "classId": "CLS-VII1", "type": "Formatif", "name": "Formatif TP-1.1", "topic": "TP-1.1", "tpId": f"TP-{T0 + 201}", "date": "2026-07-28"},
        {"id": "ASM-S1", "periodId": PER, "classId": "CLS-VII1", "type": "Sumatif", "name": "Sumatif 1", "topic": "Zat", "tpId": None, "date": "2026-08-10"},
        {"id": "ASM-UTS", "periodId": PER, "classId": "CLS-VII1", "type": "UTS", "name": "UTS", "topic": "UTS", "tpId": None, "date": "2026-09-01"},
        {"id": "ASM-UAS", "periodId": PER, "classId": "CLS-VII1", "type": "UAS", "name": "UAS", "topic": "UAS", "tpId": None, "date": "2026-12-01"},
    ]
    vals = {1: (80, 70, 90, 60), 2: (50, 50, 50, 50), 3: (100, 100, 100, 100), 4: (60, 60, 60, None)}
    for i, (f, sm, ut, ua) in vals.items():
        for aid, v in (("ASM-F1", f), ("ASM-S1", sm), ("ASM-UTS", ut), ("ASM-UAS", ua)):
            if v is not None:
                d['g_scr'].append({"id": f"SCR-{i}-{aid}", "periodId": PER, "assessmentId": aid, "studentId": f"STU-{T0 + i}", "score": v})
    d['g_fol'] = []
    d['g_mat'] = []
    return d

def row_for(page, name):
    """Teks baris rekap nilai untuk siswa bernama `name`, dipecah per sel."""
    return page.evaluate("""(n) => { const r=[...document.querySelectorAll('#recapScoreBody tr')].find(x=>x.innerText.includes(n));
        return r ? [...r.children].map(c=>c.innerText.trim()) : null; }""", n=name) if False else page.evaluate(
        "(n)=>{const r=[...document.querySelectorAll('#recapScoreBody tr')].find(x=>x.innerText.includes(n));return r?[...r.children].map(c=>c.innerText.trim()):null;}", name)

def goto_view(page, label):
    page.locator('#navMenu button', has_text=label).click(); page.wait_for_timeout(40)

def set_settings_ui(page, **kw):
    ids = {'kktp': 'setKktp', 'wForm': 'setWForm', 'wSum': 'setWSum', 'wUts': 'setWUts', 'wUas': 'setWUas', 'attMin': 'setAttMin',
           'predA': 'setPredA', 'predB': 'setPredB', 'predC': 'setPredC'}
    for k, v in kw.items():
        if k in ids: page.fill('#' + ids[k], str(v))
        elif k == 'missingPolicy': page.select_option('#setMissingPolicy', v)
        elif k == 'remedialMode': page.select_option('#setRemedialMode', v)
        elif k == 'attPenalty': page.set_checked('#setAttPenalty', v)
        elif k == 'attRequired': page.set_checked('#setAttRequired', v)
    page.evaluate("saveGradingSettings()")

def run_tahap1(br):
    import subprocess
    ur = subprocess.run(['node', '--test'] + [str(f) for f in sorted((ROOT / 'tests' / 'unit').glob('*.test.js'))], capture_output=True, text=True)
    m = re.search(r'# pass (\d+)', ur.stdout); f = re.search(r'# fail (\d+)', ur.stdout)
    check('V0 uji unit logika penilaian dan analisis butir (node:test)', ur.returncode == 0 and m and f and f.group(1) == '0', (ur.stdout[-300:], ur.stderr[-200:]))

    # --- V1 pengaturan penilaian
    ctx = new_ctx(br); page, errs = open_page(ctx, INDEX, t1_seed()); goto_view(page, 'Pengaturan')
    set_settings_ui(page, wForm=40, wSum=30, wUts=10, wUas=10)  # total 90
    vis = page.evaluate("!document.getElementById('gradingErrors').classList.contains('hidden')")
    txt = page.evaluate("document.getElementById('gradingErrors').innerText")
    stored = page.evaluate("JSON.parse(localStorage.getItem('g_set')).wForm")
    check('V1a bobot total != 100 ditolak dengan pesan dan tidak tersimpan', vis and 'Total bobot' in txt and stored == 30, (vis, txt, stored))
    set_settings_ui(page, wForm=40, wSum=30, wUts=15, wUas=15)
    page.wait_for_timeout(50)
    stored = page.evaluate("JSON.parse(localStorage.getItem('g_set')).wForm")
    page.reload(); page.wait_for_function("document.querySelectorAll('#navMenu button').length>0"); goto_view(page, 'Pengaturan')
    shown = page.input_value('#setWForm')
    check('V1b bobot valid tersimpan permanen dan tampil lagi setelah muat ulang', stored == 40 and shown == '40', (stored, shown))
    set_settings_ui(page, predA=60, predB=70, predC=80)
    check('V1c batas predikat tidak berurutan ditolak', page.evaluate("document.getElementById('gradingErrors').innerText").find('predikat') >= 0)
    ctx.close()

    # --- V2 nilai akhir memakai bobot Pengaturan (contoh PRD 75,5)
    ctx = new_ctx(br); page, errs = open_page(ctx, INDEX, t1_seed()); goto_view(page, 'Pengaturan')
    set_settings_ui(page, wForm=40, wSum=30, wUts=15, wUas=15, attPenalty=False)
    goto_view(page, 'Daftar Nilai')
    r1 = row_for(page, 'Ahmad Fauzan')
    check('V2a nilai akhir siswa 80/70/90/60 dengan bobot 40/30/15/15 = 75,5 (contoh PRD)', r1 and r1[8].startswith('75.5') and 'TUNTAS' in r1[10].upper(), r1)
    goto_view(page, 'Pengaturan'); set_settings_ui(page, wForm=100, wSum=0, wUts=0, wUas=0)
    goto_view(page, 'Daftar Nilai'); r1 = row_for(page, 'Ahmad Fauzan')
    check('V2b mengubah bobot langsung mengubah nilai akhir (100% formatif = 80)', r1 and r1[8].startswith('80'), r1)
    ctx.close()

    # --- V3 nilai kosong
    ctx = new_ctx(br); page, errs = open_page(ctx, INDEX, t1_seed()); goto_view(page, 'Pengaturan')
    set_settings_ui(page, attPenalty=False); goto_view(page, 'Daftar Nilai')
    r4 = row_for(page, 'Dewi')
    check('V3a UAS kosong: UAS tampil "-", nilai akhir "-", status BELUM LENGKAP (bukan 80)', r4 and r4[6] == '-' and r4[8] == '-' and 'BELUM LENGKAP' in r4[10].upper(), r4)
    goto_view(page, 'Remedial')
    txt = page.evaluate("[...document.querySelectorAll('#analysisBody tr')].find(x=>x.innerText.includes('Dewi')).innerText")
    check('V3b Remedial: siswa belum lengkap tidak dikategorikan remedial/tuntas', 'Belum Lengkap' in txt and 'UAS' in txt, txt)
    goto_view(page, 'Dashboard')
    info = page.evaluate("document.getElementById('dPassInfo').innerText")
    check('V3c Dashboard hanya menghitung siswa dengan nilai akhir lengkap (3 siswa)', '2 Tuntas' in info and '1 Belum' in info, info)
    goto_view(page, 'Pengaturan'); set_settings_ui(page, missingPolicy='partial', attPenalty=False)
    goto_view(page, 'Daftar Nilai'); r4 = row_for(page, 'Dewi')
    check('V3d kebijakan "hitung sementara": nilai dari komponen yang ada, status SEMENTARA', r4 and r4[8].startswith('60') and 'SEMENTARA' in r4[10].upper(), r4)
    ctx.close()

    # --- V4/V5 buat asesmen tanpa nilai acak, input nilai, UTS/UAS nyata
    ctx = new_ctx(br); d = t1_seed(); d['g_ass'] = [a for a in d['g_ass'] if a['type'] not in ('UTS', 'UAS')]; d['g_scr'] = [x for x in d['g_scr'] if 'UTS' not in x['assessmentId'] and 'UAS' not in x['assessmentId']]
    page, errs = open_page(ctx, INDEX, d); goto_view(page, 'Daftar Nilai')
    before = page.evaluate("allScores.length")
    page.evaluate("openAssessModal('Sumatif')"); page.fill('#asmTopic', 'Bab Baru')
    page.evaluate("document.getElementById('formAssessment').requestSubmit()")
    after = page.evaluate("allScores.length")
    n_inputs = page.locator('#scoreEntryBody .score-entry-input').count()
    check('V4a membuat asesmen TIDAK mengisi nilai acak; form input nilai terbuka untuk 4 siswa', after == before and n_inputs == 4, (before, after, n_inputs))
    page.locator('#scoreEntryBody .score-entry-input').nth(0).fill('150')
    page.evaluate("saveScoreEntry()")
    err = page.evaluate("document.getElementById('scoreEntryError').innerText")
    check('V4b nilai di luar 0-100 ditolak dan tidak disimpan', 'Ahmad' in err and page.evaluate("allScores.length") == before, err)
    page.locator('#scoreEntryBody .score-entry-input').nth(0).fill('85,5')
    page.locator('#scoreEntryBody .score-entry-input').nth(1).fill('72')
    page.evaluate("saveScoreEntry()")
    sc = page.evaluate("JSON.parse(localStorage.getItem('g_scr')).filter(s=>!['ASM-F1','ASM-S1'].includes(s.assessmentId)).map(s=>s.score).sort((a,b)=>a-b)")
    check('V4c nilai tersimpan permanen (koma desimal diterima), kolom kosong tidak jadi 0', sc == [72, 85.5], sc)
    page.evaluate("openAssessModal('UTS')"); page.evaluate("document.getElementById('formAssessment').requestSubmit()")
    page.locator('#scoreEntryBody .score-entry-input').nth(0).fill('95'); page.evaluate("saveScoreEntry()")
    goto_view(page, 'Daftar Nilai'); r1 = row_for(page, 'Ahmad Fauzan')
    check('V5a nilai UTS yang diinput benar-benar masuk perhitungan (di file asli selalu 80)', r1 and r1[5] == '95', r1)
    n_before = page.evaluate("allScores.length")
    page.evaluate("openAssessModal('UTS')"); page.evaluate("document.getElementById('formAssessment').requestSubmit()")
    still = page.evaluate("allScores.length"); open_ = page.evaluate("!document.getElementById('modalScoreEntry').classList.contains('hidden')")
    check('V5b membuat UTS kedua membuka UTS yang ada, nilai lama tidak terhapus', still == n_before and open_, (n_before, still, open_))
    page.evaluate("document.getElementById('searchScore').value='Siti'"); page.evaluate("renderRecapScores()")
    rows = page.evaluate("document.querySelectorAll('#recapScoreBody tr').length")
    check('V5c kolom cari siswa pada Daftar Nilai berfungsi', rows == 1, rows)
    ctx.close()

    # --- V6 remedial / pengayaan
    ctx = new_ctx(br); page, errs = open_page(ctx, INDEX, t1_seed()); goto_view(page, 'Pengaturan'); set_settings_ui(page, attPenalty=False); goto_view(page, 'Remedial')
    sid = f"STU-{T0 + 2}"  # siswa nilai 50
    page.evaluate("(id)=>openFollowUp(id)", sid)
    check('V6a siswa belum tuntas: jenis awal = Remedial', page.input_value('#fuType') == 'Remedial')
    page.select_option('#fuStatus', 'Selesai'); page.fill('#fuNote', 'Ulangan ulang TP 1')
    page.evaluate("document.getElementById('formFollowUp').requestSubmit()")
    check('V6b remedial berstatus Selesai tanpa nilai ditolak', 'perlu nilai' in page.evaluate("document.getElementById('fuError').innerText"))
    page.fill('#fuScore', '90'); page.evaluate("document.getElementById('formFollowUp').requestSubmit()")
    fol = page.evaluate("JSON.parse(localStorage.getItem('g_fol'))")
    ok = len(fol) == 1 and fol[0]['studentId'] == sid and fol[0]['score'] == 90 and fol[0]['type'] == 'Remedial' and fol[0]['status'] == 'Selesai' and re.fullmatch(r'FOL-[0-9a-f-]{36}', fol[0]['id'])
    check('V6c tindak lanjut tersimpan ke followUps (UUID, kelas, periode)', ok, fol)
    page.reload(); page.wait_for_function("document.querySelectorAll('#navMenu button').length>0"); goto_view(page, 'Remedial')
    txt = page.evaluate("[...document.querySelectorAll('#analysisBody tr')].find(x=>x.innerText.includes('Siti')).innerText")
    check('V6d riwayat tindak lanjut tampil lagi setelah muat ulang', 'Remedial' in txt and 'Selesai' in txt and '90' in txt, txt)
    goto_view(page, 'Daftar Nilai'); rs = row_for(page, 'Siti')
    check('V6e mode "hanya dicatat": nilai akhir tidak berubah (50)', rs and rs[8].startswith('50'), rs)
    goto_view(page, 'Pengaturan'); set_settings_ui(page, remedialMode='kktp', attPenalty=False)
    goto_view(page, 'Daftar Nilai'); rs = row_for(page, 'Siti')
    check('V6f mode "naikkan ke KKTP": nilai akhir jadi 75 dan berstatus TUNTAS', rs and rs[8].startswith('75') and 'TUNTAS' in rs[10].upper() and 'remedial' in rs[8], rs)
    goto_view(page, 'Remedial')
    page.evaluate("(id)=>deleteFollowUp(id)", fol[0]['id']); page.evaluate("executeConfirm()")
    check('V6g hapus tindak lanjut: tersimpan dan nilai akhir kembali 50', page.evaluate("JSON.parse(localStorage.getItem('g_fol')).length") == 0 and page.evaluate("calcFinalScore('%s').final" % sid) == 50)
    ctx.close()

    # --- V7 analisis butir
    ctx = new_ctx(br); page, errs = open_page(ctx, INDEX, t1_seed()); goto_view(page, 'Analisis Ulangan')
    page.evaluate("openDailyTestDetail(allDailyTests[0].id)")
    rows = page.evaluate("document.querySelectorAll('#itemAnalysisBox tbody tr').length")
    t_a = page.evaluate("document.getElementById('itemAnalysisBox').innerText")
    check('V7a analisis butir tampil untuk 5 butir dengan p, D, kategori', rows == 5 and 'Mudah' in t_a and 'Sukar' in t_a and 'indikatif' in t_a, (rows, t_a[:200]))
    page.evaluate("openDailyTestDetail(allDailyTests[0].id)")
    t_b = page.evaluate("document.getElementById('itemAnalysisBox').innerText")
    check('V7b hasil analisis identik saat dibuka ulang (tidak acak)', t_a == t_b)
    inp = page.locator('input[data-testid][data-q="4"]').first
    inp.fill('A'); inp.dispatch_event('change')
    t_c = page.evaluate("document.getElementById('itemAnalysisBox').innerText")
    check('V7c mengubah jawaban memperbarui analisis butir', t_c != t_a, t_c[:120])
    ctx.close()

    # --- V8 modul ajar tersimpan (modul dibuat oleh Gemini tiruan)
    ctx = new_ctx(br); page, errs = open_page(ctx, INDEX, t1_seed()); mock_ai(ctx, modul_handler()); ai_ready(page); goto_view(page, 'Generator')
    page.evaluate("saveModulAjar()")
    check('V8a simpan tanpa modul digenerate memberi peringatan, tidak membuat data', page.evaluate("allMaterials.length") == 0)
    page.evaluate("document.querySelector('button[onclick=\"generateModulAjarAI()\"]').click()")
    page.wait_for_function("!document.getElementById('genResultContainer').classList.contains('hidden')", timeout=15000)
    page.evaluate("saveModulAjar()")
    mats = page.evaluate("JSON.parse(localStorage.getItem('g_mat'))")
    check('V8b modul tersimpan dengan TP, model, dan isi lengkap', len(mats) == 1 and mats[0]['tpId'] and len(mats[0]['html']) > 3000 and re.fullmatch(r'MAT-[0-9a-f-]{36}', mats[0]['id']), [len(m.get('html', '')) for m in mats])
    page.reload(); page.wait_for_function("document.querySelectorAll('#navMenu button').length>0"); goto_view(page, 'Generator')
    rows = page.evaluate("document.querySelectorAll('#savedModulBody tr').length")
    page.evaluate("(id)=>openSavedModul(id)", mats[0]['id'])
    opened = page.evaluate("document.getElementById('genResultContent').innerText")
    check('V8c setelah muat ulang modul muncul di daftar dan dapat dibuka kembali', rows == 1 and 'RENCANA PELAKSANAAN' in opened, (rows, opened[:80]))
    ctx.close()
    ctx = new_ctx(br); d = t1_seed()
    d['g_mat'] = [{"id": "MAT-X", "periodId": PER, "classId": "CLS-VII1", "tpId": f"TP-{T0 + 201}", "model": "PBL", "title": "Uji", "savedAt": "2026-08-01T00:00:00Z",
                   "html": '<p>aman</p><img src=x onerror="window.__xss=1"><script>window.__xss=1</script><a href="javascript:window.__xss=1">x</a>'}]
    page, errs = open_page(ctx, INDEX, d); goto_view(page, 'Generator'); page.evaluate("openSavedModul('MAT-X')"); page.wait_for_timeout(150)
    fired = page.evaluate("window.__xss === 1"); has_script = page.evaluate("document.querySelectorAll('#genResultContent script').length")
    check('V8d modul tersimpan/hasil restore yang disusupi skrip dibersihkan saat dibuka', not fired and has_script == 0 and 'aman' in page.evaluate("document.getElementById('genResultContent').innerText"), (fired, has_script))
    page.evaluate("deleteClass('CLS-VII1')"); page.evaluate("executeConfirm()")
    check('V8e hapus kelas ikut menghapus modul ajar tersimpannya; audit bersih', page.evaluate("allMaterials.length") == 0 and page.evaluate('Integrity.audit()') == [])
    ctx.close()

    # --- V9 analisis sumatif jujur + CSV aman
    ctx = new_ctx(br); d = t1_seed(); d['g_stu'][1]['name'] = '=HYPERLINK("x")'; d['g_stu'][2]['name'] = 'Budi, "B"'
    page, errs = open_page(ctx, INDEX, d); goto_view(page, 'Pengaturan'); set_settings_ui(page, attPenalty=False); goto_view(page, 'Daftar Nilai')
    page.evaluate("analyzeSumatif()")
    a1 = page.evaluate("document.getElementById('analisisSumatifBody').innerText")
    page.evaluate("analyzeSumatif()")
    a2 = page.evaluate("document.getElementById('analisisSumatifBody').innerText")
    check('V9a analisis sumatif memakai nilai asli: tanpa pola acak, identik tiap dibuka', a1 == a2 and '✔' not in a1 and '❌' not in a1 and '70' in a1, a1[:150])
    with page.expect_download() as dl: page.evaluate("exportScoresCSV()")
    csv = pathlib.Path(dl.value.path()).read_text(encoding='utf8')
    lines = csv.split('\n')
    dewi = next(l for l in lines if 'Dewi' in l)
    check('V9b CSV: nilai kosong dikosongkan (bukan 80), status ikut, rumus dan tanda kutip diamankan',
          dewi.split(',')[-5] == '' and dewi.split(',')[-3] == '' and dewi.split(',')[-2] == '-' and 'Belum Lengkap' in dewi and "'=HYPERLINK" in csv and '"Budi, ""B"""' in csv, (dewi, lines[:4]))
    ctx.close()

# ------------------------------------------------------------------ Tahap 2: mesin AI
GEM_OK = {"candidates": [{"content": {"parts": [{"text": "{\"ok\": true}"}]}, "finishReason": "STOP"}], "usageMetadata": {"totalTokenCount": 11}}
CORS = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS'}
SECRET = 'SECRET-XYZ-98765'
PROXY_URL = 'https://script.google.com/macros/s/TEST123/exec'

def mock_ai(ctx, handler):
    """Meniru Gemini dan proxy Apps Script. handler(req_dict) -> (status, json). Mengembalikan daftar permintaan."""
    log = []
    def route(r):
        req = r.request
        if req.method == 'OPTIONS':
            return r.fulfill(status=204, headers=CORS)
        body = None
        try: body = json.loads(req.post_data) if req.post_data else None
        except Exception: body = req.post_data
        rec = {'url': req.url, 'headers': {k.lower(): v for k, v in req.headers.items()}, 'body': body}
        log.append(rec)
        status, js = handler(rec)
        r.fulfill(status=status, headers={**CORS, 'content-type': 'application/json'}, body=json.dumps(js))
    ctx.route('**://generativelanguage.googleapis.com/**', route)
    ctx.route('**://script.google.com/**', route)
    return log

def ai_form(page, enabled=True, mode='proxy', url=PROXY_URL, secret=SECRET, model='gemini-3.8-flash', privacy=True):
    goto_view(page, 'Pengaturan')
    page.set_checked('#setAiEnabled', enabled)
    page.select_option('#setAiMode', mode)
    page.fill('#setAiProxyUrl', url); page.fill('#setAiModel', model)
    if secret is not None: page.fill('#setAiSecret', secret)
    page.set_checked('#setAiPrivacy', privacy)
    page.evaluate("AIUI.save()")

def ai_msg(page): return page.evaluate("document.getElementById('aiStatusMsg').innerText")

def ai_test(page):
    page.evaluate("AIUI.test()")
    page.wait_for_function("!document.getElementById('aiStatusMsg').innerText.includes('Menguji')", timeout=20000)
    return ai_msg(page)

def make_docx(path, paragraphs):
    import zipfile
    body = ''.join('<w:p><w:r><w:t>%s</w:t></w:r></w:p>' % t for t in paragraphs)
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('[Content_Types].xml', '<Types/>')
        z.writestr('word/document.xml', '<?xml version="1.0"?><w:document xmlns:w="x"><w:body>%s</w:body></w:document>' % body)

def run_tahap2(br):
    import subprocess
    tmp = pathlib.Path(tempfile.mkdtemp())

    # --- W1 kartu pengaturan AI + validasi
    ctx = new_ctx(br); page, errs = open_page(ctx, INDEX, t1_seed()); goto_view(page, 'Pengaturan')
    check('W1a kartu Pengaturan AI tampil dengan mode proxy sebagai bawaan', page.evaluate("document.getElementById('setAiMode').value") == 'proxy' and page.evaluate("!document.getElementById('aiProxyRow').classList.contains('hidden')"))
    page.select_option('#setAiMode', 'direct')
    check('W1b mode langsung menyembunyikan URL proxy dan menampilkan peringatan key di browser',
          page.evaluate("document.getElementById('aiProxyRow').classList.contains('hidden') && !document.getElementById('aiDirectWarn').classList.contains('hidden')"))
    page.select_option('#setAiMode', 'proxy')
    ai_form(page, secret='', privacy=True); m = ai_msg(page)
    check('W1c mengaktifkan AI tanpa token ditolak', 'Isi token' in m and page.evaluate("settings.ai.enabled") is False, m)
    ai_form(page, secret=SECRET, privacy=False); m = ai_msg(page)
    check('W1d mengaktifkan AI tanpa persetujuan privasi ditolak', 'privasi' in m.lower() and page.evaluate("settings.ai.enabled") is False, m)
    ai_form(page, url='http://script.google.com/x', privacy=True); m = ai_msg(page)
    check('W1e URL proxy non-https ditolak', 'https' in m, m)
    ai_form(page, model='gpt-4', privacy=True); m = ai_msg(page)
    check('W1f nama model non-gemini ditolak', 'model' in m.lower(), m)
    ai_form(page, secret='abc def'); m = ai_msg(page)
    check('W1g token berspasi ditolak', 'spasi' in m, m)
    ctx.close()

    # --- W2 penyimpanan rahasia & uji koneksi via proxy
    ctx = new_ctx(br)
    def proxy_ok(rec):
        env = rec['body'] or {}
        if env.get('token') != SECRET: return 200, {"proxyError": "AUTH"}
        if env.get('op') == 'ping': return 200, {"ok": True, "status": 200, "ping": True}
        return 200, {"ok": True, "status": 200, "data": GEM_OK}
    page, errs = open_page(ctx, INDEX, t1_seed()); log = mock_ai(ctx, proxy_ok)
    ai_form(page)
    st = page.evaluate("({ai: JSON.parse(localStorage.getItem('g_set')).ai, sec: localStorage.getItem('g_ai_secret'), g_set: localStorage.getItem('g_set')})")
    check('W2a pengaturan AI tersimpan; rahasia di kunci terpisah, bukan di g_set',
          st['ai']['enabled'] and st['ai']['proxyUrl'] == PROXY_URL and st['sec'] == SECRET and SECRET not in st['g_set'], st['ai'])
    before_msg = ai_msg(page)
    check('W2a2 setelah simpan, pesan jujur: menyuruh Uji Koneksi, tidak mengklaim "siap dipakai"', 'Uji Koneksi' in before_msg and 'siap dipakai' not in before_msg, before_msg)
    msg = ai_test(page)
    check('W2b Uji Koneksi via proxy berhasil: melaporkan waktu proxy, model, dan gaya keluaran', 'Koneksi berhasil' in msg and 'Proxy' in msg and 'gemini-3.8-flash' in msg and '"format"' in msg, msg)
    check('W2b2 uji koneksi proxy: permintaan 1 = op ping (tanpa isi Gemini), permintaan 2 = Gemini', log[0]['body'].get('op') == 'ping' and 'request' not in log[0]['body'] and 'request' in log[1]['body'], [list(x['body']) for x in log])
    page.reload(); page.wait_for_function("document.querySelectorAll('#navMenu button').length>0"); goto_view(page, 'Pengaturan')
    check('W2b3 setelah uji berhasil status menjadi "Terhubung" dan tersimpan setelah muat ulang', 'Terhubung' in ai_msg(page), ai_msg(page))
    r = log[1]
    check('W2c permintaan ke proxy: text/plain, memuat token, TANPA API key Gemini, skema JSON dikirim',
          r['headers'].get('content-type', '').startswith('text/plain') and r['body']['token'] == SECRET and r['body']['model'] == 'gemini-3.8-flash'
          and 'x-goog-api-key' not in r['headers'] and 'responseFormat' in r['body']['request']['generationConfig'], r['headers'])
    check('W2d penghitung pemakaian tampil dan bertambah', '1 permintaan' in page.evaluate("document.getElementById('aiUsageInfo').innerText"), page.evaluate("document.getElementById('aiUsageInfo').innerText"))
    page.reload(); page.wait_for_function("document.querySelectorAll('#navMenu button').length>0"); goto_view(page, 'Pengaturan')
    ph = page.evaluate("document.getElementById('setAiSecret').placeholder"); val = page.input_value('#setAiSecret')
    check('W2e setelah muat ulang rahasia TIDAK ditampilkan kembali (hanya penanda tersimpan)', val == '' and 'tersimpan' in ph and SECRET not in page.content(), (val, ph))
    # token salah -> pesan jelas
    page.fill('#setAiSecret', 'token-salah'); page.evaluate("AIUI.save()")
    msg = ai_test(page)
    check('W2f token salah: pesan jelas dengan kode PROXY_AUTH dan tahap 1', 'PROXY_AUTH' in msg and 'Token aplikasi ditolak' in msg and 'tahap 1' in msg, msg)
    ctx.close()

    # --- W3 jalur langsung + CORS + retry 429 + fallback gaya
    ctx = new_ctx(br); n = {'i': 0}
    def direct(rec):
        n['i'] += 1
        if n['i'] == 1: return 429, {"error": {"code": 429, "status": "RESOURCE_EXHAUSTED"}}
        return 200, GEM_OK
    page, errs = open_page(ctx, INDEX, t1_seed()); log = mock_ai(ctx, direct)
    ai_form(page, mode='direct', url='')
    msg = ai_test(page)
    check('W3a jalur langsung: 429 diulang otomatis lalu berhasil', 'Koneksi berhasil' in msg and len(log) == 2, (msg, len(log)))
    check('W3b key hanya di header x-goog-api-key, tidak di URL maupun body',
          log[0]['headers'].get('x-goog-api-key') == SECRET and SECRET not in log[0]['url'] and SECRET not in json.dumps(log[0]['body']), log[0]['headers'])
    check('W3c endpoint dan nama model sesuai dokumentasi', log[0]['url'] == 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent', log[0]['url'])
    ctx.close()

    ctx = new_ctx(br)
    def fallback(rec):
        gc = rec['body']['generationConfig']
        if 'responseFormat' in gc: return 400, {"error": {"code": 400, "status": "INVALID_ARGUMENT", "message": 'Invalid JSON payload received. Unknown name "responseFormat"'}}
        return 200, GEM_OK
    page, errs = open_page(ctx, INDEX, t1_seed()); log = mock_ai(ctx, fallback)
    ai_form(page); page.evaluate("AIService.use({})")
    ai_form(page, mode='direct', url='')
    msg = ai_test(page)
    page.reload(); page.wait_for_function("document.querySelectorAll('#navMenu button').length>0")
    resolved = page.evaluate("settings.ai.styleResolved")
    check('W3d gaya skema ditolak API: otomatis beralih ke gaya lama, berhasil, dan gaya diingat setelah muat ulang', 'Koneksi berhasil' in msg and '"legacy"' in msg and resolved == 'legacy', (msg, resolved))
    ctx.close()

    ctx = new_ctx(br)
    page, errs = open_page(ctx, INDEX, t1_seed()); log = mock_ai(ctx, lambda rec: (403, {"error": {"code": 403, "status": "PERMISSION_DENIED"}}))
    ai_form(page, mode='direct', url=''); msg = ai_test(page)
    check('W3e 403: pesan AUTH berbahasa Indonesia, tidak diulang', 'AUTH' in msg and 'tidak valid' in msg and len(log) == 1, (msg, len(log)))
    ctx.close()

    # --- W3f model cadangan saat 503
    ctx = new_ctx(br)
    def overloaded(rec):
        if 'gemini-3.6-flash' in rec['url']: return 200, GEM_OK
        return 503, {"error": {"code": 503, "status": "UNAVAILABLE", "message": "The model is overloaded. Please try again later."}}
    page, errs = open_page(ctx, INDEX, t1_seed()); log = mock_ai(ctx, overloaded)
    ai_form(page, mode='direct', url=''); page.fill('#setAiFallback', 'bukan model'); page.evaluate("AIUI.save()"); m_bad = ai_msg(page)
    check('W3f1 nama model cadangan yang tidak valid ditolak', 'cadangan' in m_bad, m_bad)
    page.fill('#setAiFallback', 'gemini-3.6-flash'); page.evaluate("AIUI.save()")
    check('W3f2 model cadangan tersimpan', page.evaluate("JSON.parse(localStorage.getItem('g_set')).ai.fallbackModel") == 'gemini-3.6-flash')
    msg = ai_test(page)
    check('W3f3 model utama 503 berulang: otomatis pindah ke model cadangan dan Uji Koneksi melaporkannya', 'Koneksi berhasil' in msg and 'MODEL CADANGAN' in msg and 'gemini-3.6-flash' in msg, msg)
    ctx.close()
    ctx = new_ctx(br); page, errs = open_page(ctx, INDEX, t1_seed()); mock_ai(ctx, overloaded)
    ai_form(page, mode='direct', url=''); msg = ai_test(page)
    check('W3f4 tanpa model cadangan: pesan 503 memuat alasan asli dari Gemini dan saran', 'SERVER' in msg and 'model is overloaded' in msg and 'Model cadangan' in msg, msg)
    ctx.close()

    # --- W4 offline
    ctx = new_ctx(br)
    page, errs = open_page(ctx, INDEX, t1_seed()); mock_ai(ctx, lambda rec: (200, GEM_OK)); ai_form(page, mode='direct', url='')
    ctx.set_offline(True)
    msg = ai_test(page)
    page.evaluate("window.dispatchEvent(new Event('offline'))")
    still = row_for if False else page.evaluate("document.querySelectorAll('#navMenu button').length")
    check('W4a offline: pesan OFFLINE jelas dan aplikasi tetap berfungsi', ('OFFLINE' in msg or 'NETWORK' in msg) and still == 23, msg)
    ctx.set_offline(False); ctx.close()

    # --- W5 backup/restore tidak membawa atau menimpa rahasia
    ctx = new_ctx(br)
    page, errs = open_page(ctx, INDEX, t1_seed()); mock_ai(ctx, lambda rec: (200, GEM_OK)); ai_form(page)
    with page.expect_download() as dl: page.evaluate("backupJSON()")
    raw = pathlib.Path(dl.value.path()).read_text(encoding='utf8')
    check('W5a backup tidak memuat rahasia, URL proxy, maupun konfigurasi AI', SECRET not in raw and 'TEST123' not in raw and 'proxyUrl' not in raw and 'g_ai_secret' not in raw)
    d = json.loads(raw); d['settings']['ai'] = {"enabled": True, "mode": "proxy", "proxyUrl": "https://evil.example/exec", "model": "gemini-x"}
    bad = tmp / 'hostile.json'; bad.write_text(json.dumps(d), encoding='utf8')
    goto_view(page, 'Backup'); page.set_input_files('#fileRestore', str(bad)); page.evaluate("restoreJSON()"); page.wait_for_timeout(150); page.evaluate("executeConfirm()"); page.wait_for_timeout(150)
    after = page.evaluate("({url: settings.ai.proxyUrl, sec: localStorage.getItem('g_ai_secret'), en: settings.ai.enabled})")
    check('W5b restore dari file yang disusupi tidak mengubah URL proxy dan tidak menghapus rahasia', after['url'] == PROXY_URL and after['sec'] == SECRET and after['en'] is True, after)
    ctx.close()

    # --- W6 hapus kunci
    ctx = new_ctx(br)
    page, errs = open_page(ctx, INDEX, t1_seed()); mock_ai(ctx, lambda rec: (200, GEM_OK)); ai_form(page)
    page.evaluate("AIUI.clearSecret()")
    st = page.evaluate("({sec: localStorage.getItem('g_ai_secret'), en: settings.ai.enabled, ready: AIService.status().ready})")
    check('W6 Hapus Kunci: rahasia hilang dari browser, AI dimatikan', st['sec'] is None and st['en'] is False and st['ready'] is False, st)
    ctx.close()

    # --- W7 penjaga kesiapan + privasi
    ctx = new_ctx(br); page, errs = open_page(ctx, INDEX, t1_seed())
    ok1 = page.evaluate("AIUI.ensureReady()"); m1 = modal_text(page)
    check('W7a AI belum dikonfigurasi: fitur AI diblokir dengan petunjuk ke Pengaturan', ok1 is False and 'AI Belum Siap' in m1, m1)
    page.evaluate("document.getElementById('customModal').classList.add('hidden')")
    page.evaluate("()=>{ settings.ai.enabled=true; settings.ai.proxyUrl='https://script.google.com/macros/s/Z/exec'; Store.secretSet('t'); }")
    ok2 = page.evaluate("AIUI.ensureReady()"); vis = page.evaluate("!document.getElementById('modalAiPrivacy').classList.contains('hidden')")
    check('W7b belum setuju privasi: modal pemberitahuan privasi muncul', ok2 is False and vis)
    page.evaluate("AIUI.acceptPrivacy()")
    check('W7c setuju privasi tercatat dan fitur siap', page.evaluate("AIUI.ensureReady()") is True and page.evaluate("!!JSON.parse(localStorage.getItem('g_set')).ai.privacyAckAt"))
    n_ai = page.evaluate("document.querySelectorAll('[data-ai]').length") + page.evaluate("(document.body.innerHTML.match(/data-ai/g)||[]).length")
    check('W7d tombol fitur AI bertanda data-ai (siap disembunyikan saat AI mati di Tahap 3)', n_ai >= 7, n_ai)
    ctx.close()

    # --- W8 pembaca dokumen referensi
    ctx = new_ctx(br); page, errs = open_page(ctx, INDEX, t1_seed())
    inp = 'input[onchange*="handleFileUpload(event, \'Kurikulum\'"]'
    docx = tmp / 'cp.docx'; make_docx(docx, ['Capaian Pembelajaran Fase D', 'ZXQUNIK123 mampu menganalisis zat &amp; perubahannya'])
    page.set_input_files(inp, str(docx)); page.wait_for_timeout(300)
    st = page.evaluate("({name: uploadedRefName, kind: uploadedRefDoc && uploadedRefDoc.kind, text: uploadedRefDoc && uploadedRefDoc.text, modal: document.getElementById('modalTitle').innerText})")
    check('W8a DOCX: isi benar-benar terbaca dan disimpan di memori sesi', st['name'] == 'cp.docx' and st['kind'] == 'text' and 'ZXQUNIK123 mampu menganalisis zat & perubahannya' in st['text'] and 'Terbaca' in st['modal'], st)
    check('W8b isi dokumen tidak disimpan permanen di localStorage', 'ZXQUNIK123' not in json.dumps(page.evaluate("Object.assign({}, localStorage)")))
    pdf = tmp / 'ref.pdf'; pdf.write_bytes(b'%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF')
    page.set_input_files(inp, str(pdf)); page.wait_for_timeout(300)
    st = page.evaluate("({kind: uploadedRefDoc.kind, mime: uploadedRefDoc.inline && uploadedRefDoc.inline.mimeType, len: uploadedRefDoc.inline && uploadedRefDoc.inline.data.length})")
    check('W8c PDF: siap dilampirkan ke Gemini sebagai base64', st['kind'] == 'pdf' and st['mime'] == 'application/pdf' and st['len'] > 10, st)
    for name, content, expect in [('lama.doc', b'x', 'lama'), ('palsu.pdf', b'bukan pdf', 'bukan PDF'), ('x.png', b'x', 'tidak didukung')]:
        f = tmp / name; f.write_bytes(content)
        page.set_input_files(inp, str(f)); page.wait_for_timeout(250)
        st = page.evaluate("({name: uploadedRefName, title: document.getElementById('modalTitle').innerText, msg: document.getElementById('modalMessage').innerText})")
        check(f'W8d {name} ditolak dengan pesan jelas; referensi sebelumnya tidak berubah', expect in st['msg'] and 'Tidak Dapat' in st['title'] and st['name'] == 'ref.pdf', st)
    big = tmp / 'besar.txt'; big.write_bytes(b'a' * (10 * 1024 * 1024 + 10))
    page.set_input_files(inp, str(big)); page.wait_for_timeout(500)
    check('W8e berkas > 10 MB ditolak', '10 MB' in page.evaluate("document.getElementById('modalMessage').innerText"))
    kisi = 'input[onchange*="handleKisiUpload"]'
    page.set_input_files(kisi, str(docx)); page.wait_for_timeout(300)
    st = page.evaluate("({n: uploadedKisiName, s: document.getElementById('uploadedKisiStatus') && document.getElementById('uploadedKisiStatus').innerText})")
    check('W8f unggah kisi-kisi memakai pembaca yang sama dan menampilkan status "Terbaca"', st['n'] == 'cp.docx' and 'Terbaca' in (st['s'] or ''), st)
    ctx.close()

    # --- W9 rahasia tidak bocor ke mana pun
    ctx = new_ctx(br); logs = []
    page, errs = open_page(ctx, INDEX, t1_seed()); page.on('console', lambda m: logs.append(m.text))
    reqs = mock_ai(ctx, lambda rec: (200, {"ok": True, "status": 200, "data": GEM_OK}))
    ai_form(page); ai_test(page); visit_all_views(page)
    ls = page.evaluate("Object.fromEntries(Object.entries(localStorage))")
    leak_ls = [k for k, v in ls.items() if SECRET in v and k != 'g_ai_secret']
    check('W9 rahasia tidak muncul di localStorage lain, konsol, isi halaman, maupun URL', not leak_ls and not any(SECRET in l for l in logs) and SECRET not in page.content() and not any(SECRET in r['url'] for r in reqs), (leak_ls, logs[:3]))
    ctx.close()

# ------------------------------------------------------------------ Tahap 3: perangkat ajar dengan Gemini tiruan
STYPES = ['Pilihan Ganda', 'Pilihan Ganda Kompleks', 'Benar-Salah', 'Isian Singkat', 'Menjodohkan', 'Uraian']

def gem(obj):
    return 200, {"candidates": [{"content": {"parts": [{"text": json.dumps(obj, ensure_ascii=False)}]}, "finishReason": "STOP"}], "usageMetadata": {"totalTokenCount": 777}}

def ai_ready(page):
    page.evaluate("""()=>{ settings.ai = {enabled:true, mode:'direct', proxyUrl:'', model:'gemini-3.8-flash', style:'auto', styleResolved:null, privacyAckAt:new Date().toISOString(), allowNames:false};
        Store.secretSet('KEY-T3'); saveAllData(); }""")

def prompt_of(rec): return rec['body']['contents'][0]['parts'][0]['text']

def make_item(tipe, uid, **kw):
    b = {"level": "C3", "kesulitan": "Sedang", "indikator": f"Peserta didik dapat menganalisis zat nomor {uid}", "pembahasan": f"Pembahasan butir {uid}."}
    if tipe == 'Pilihan Ganda':
        b.update(tipe=tipe, pertanyaan=f"Manakah yang termasuk zat padat pada soal {uid}?", opsi=["Air", "Batu", "Udara", "Uap"], kunci="B")
    elif tipe == 'Pilihan Ganda Kompleks':
        b.update(tipe=tipe, pertanyaan=f"Pilih pernyataan benar tentang zat pada soal {uid}!", opsi=["Zat punya massa", "Zat tidak punya ruang", "Zat bisa berubah wujud", "Zat selalu padat"], kunci="A, C")
    elif tipe == 'Benar-Salah':
        b.update(tipe=tipe, pertanyaan=f"Air membeku pada suhu nol derajat Celsius, butir {uid}.", kunci="Benar")
    elif tipe == 'Isian Singkat':
        b.update(tipe=tipe, pertanyaan=f"Wujud air pada suhu kamar adalah ... (butir {uid})", kunci="cair")
    elif tipe == 'Menjodohkan':
        b.update(tipe=tipe, pertanyaan=f"Jodohkan zat dengan wujudnya pada butir {uid}!", pasangan=[{"kiri": "Air", "kanan": "Cair"}, {"kiri": "Batu", "kanan": "Padat"}, {"kiri": "Udara", "kanan": "Gas"}], kunci="")
    else:
        b.update(tipe='Uraian', pertanyaan=f"Jelaskan proses penguapan beserta contohnya pada butir {uid}!", kunci="Perubahan cair menjadi gas. Skor 4 bila contoh benar.")
    b.update(kw); return b

def soal_handler(bad_first=False, existing_dup=None):
    st = {'uid': 0, 'calls': 0}
    def h(rec):
        pr = prompt_of(rec); st['calls'] += 1
        n = int(re.search(r'Jumlah butir: (\d+)', pr).group(1))
        plan = re.findall(r'^\d+\. (Pilihan Ganda Kompleks|Pilihan Ganda|Benar-Salah|Isian Singkat|Menjodohkan|Uraian)$', pr, re.M) or [STYPES[i % 6] for i in range(n)]
        items = []
        for i in range(n):
            st['uid'] += 1; items.append(make_item(plan[i % len(plan)], st['uid']))
        if bad_first and st['calls'] == 1: items[1] = make_item('Pilihan Ganda', 999, opsi=["a", "b", "c"])      # hanya 3 opsi
        if existing_dup and st['calls'] == 1: items[0] = make_item('Pilihan Ganda', 998, pertanyaan=existing_dup)
        return gem({"soal": items})
    return h

def modul_data(n=2, menit=(15, 55, 10), payload=None):
    kg = lambda m, t='Guru: membuka kelas dengan pertanyaan. Siswa: menjawab dan berdiskusi.': {"kegiatan": "Orientasi", "deskripsi": t, "menit": m, "profil": "Bernalar kritis"}
    def pert(): return {"tujuan": "Peserta didik mampu menganalisis klasifikasi zat.", "pendahuluan": [kg(menit[0] - 5), kg(5)], "inti": [kg(menit[1] - 20), kg(20)], "penutup": [kg(menit[2] - 5), kg(5)]}
    P = payload or ''
    return {"judul": P + "Klasifikasi Zat", "kebutuhan": {"kesiapan": "Perkiraan umum: sudah mengenal zat.", "minat": "Perkiraan umum: suka praktik.", "gaya_belajar": "Perkiraan umum: visual dan kinestetik."},
        "karakteristik": {"cakupan": P + "Faktual dan konseptual.", "relevansi": "Dekat dengan kehidupan.", "tingkat_kesulitan": "Sedang untuk fase D.", "struktur": ["Konsep", "Klasifikasi"], "karakter": "Bernalar kritis dan mandiri."},
        "profil": [{"dimensi": "Bernalar Kritis", "keterangan": "Menganalisis data pengamatan."}, {"dimensi": "Kolaborasi", "keterangan": "Bekerja dalam kelompok."}],
        "desain": {"capaian": "Menganalisis zat.", "lintas_disiplin": "Matematika.", "metode": "Diskusi dan praktik.", "kemitraan": "Guru dan orang tua.", "lingkungan": "Kelas dan halaman.", "digital": "Video singkat."},
        "pertemuan": [pert() for _ in range(n)],
        "lkpd": {"judul": "Observasi Zat", "uraian": "Mengamati sifat zat.", "aktivitas": ["Amati benda", "Catat ciri"], "kolom": ["Objek", "Ciri", "Kesimpulan"]},
        "asesmen": {"diagnostik": [{"pertanyaan": "Apa itu zat?", "kunci": "Segala sesuatu bermassa"}, {"pertanyaan": "Sebutkan wujud zat.", "kunci": "Padat cair gas"}], "formatif": [{"aspek": "Nalar", "skor1": "Keliru", "skor4": "Tepat"}, {"aspek": "Kerja sama", "skor1": "Pasif", "skor4": "Aktif"}]},
        "kisi": [{"indikator": "Menyebutkan jenis zat", "level": "C1", "bentuk": "Pilihan Ganda"}, {"indikator": "Menjelaskan sifat zat", "level": "C2", "bentuk": "Isian Singkat"}, {"indikator": "Menganalisis klasifikasi", "level": "C4", "bentuk": "Uraian"}],
        "contoh_soal": [{"bentuk": "Pilihan Ganda", "soal": "Manakah zat padat? A. Air B. Batu", "kunci": "B"}, {"bentuk": "Uraian", "soal": "Jelaskan klasifikasi zat berdasarkan wujudnya.", "kunci": "Padat, cair, gas"}],
        "pengayaan": "Proyek klasifikasi benda di sekolah.", "remedial": "Bimbingan kelompok kecil dengan benda nyata.",
        "bahan_ajar": [{"judul": "Pengertian Zat", "isi": "Zat adalah segala sesuatu yang memiliki massa dan menempati ruang di sekitar kita sehari-hari."}, {"judul": "Wujud Zat", "isi": "Zat berwujud padat, cair, dan gas dengan ciri susunan partikel yang berbeda satu sama lain."}, {"judul": "Klasifikasi", "isi": "Klasifikasi zat dilakukan berdasarkan wujud, sifat, dan komposisi penyusunnya secara ilmiah."}],
        "media": ["Foto benda padat, cair, gas"]}

def modul_handler(first_bad=False, payload=None):
    st = {'calls': 0}
    def h(rec):
        st['calls'] += 1
        n = int(re.search(r'Jumlah pertemuan: (\d+)', prompt_of(rec)).group(1))
        return gem(modul_data(n, (15, 40, 10) if (first_bad and st['calls'] == 1) else (15, 55, 10), payload))
    return h

def cp_handler():
    def h(rec):
        mk = lambda k, m, lv, tp: {"kompetensi": k, "materi": m, "level": lv, "tp": tp, "atp": f"Tahap {lv}.", "iktp": f"Mampu {k.lower()} {m.lower()} ({lv}).", "kktp": f"{k} dengan tepat."}
        return gem({"butir": [mk('Menganalisis', 'Klasifikasi zat', 'C4', 'Melalui diskusi, peserta didik mampu menganalisis klasifikasi zat.'),
                              mk('Menyebutkan', 'Jenis zat', 'C1', 'Melalui membaca, peserta didik mampu menyebutkan jenis zat.'),
                              mk('Menjelaskan', 'Sifat zat', 'C2', 'Melalui pengamatan, peserta didik mampu menjelaskan sifat zat.'),
                              mk('Menerapkan', 'Pemisahan campuran', 'C3', 'Melalui praktik, peserta didik mampu menerapkan pemisahan campuran.')]})
    return h

def wait_modal(page, text, timeout=15000):
    page.wait_for_function("(t)=>!document.getElementById('customModal').classList.contains('hidden') && (document.getElementById('modalTitle').innerText+document.getElementById('modalMessage').innerText).includes(t)", arg=text, timeout=timeout)

def run_tahap3(br):
    tmp = pathlib.Path(tempfile.mkdtemp())
    SEEDQ = 1   # seed memuat satu soal

    # --- X1 Analisis CP
    ctx = new_ctx(br); page, errs = open_page(ctx, INDEX, t1_seed()); log = mock_ai(ctx, cp_handler()); ai_ready(page); goto_view(page, 'Kurikulum')
    page.evaluate("openAnalisisCP()"); page.fill('#uniCpDesc', 'Peserta didik mampu menganalisis zat dan perubahannya.'); page.fill('#uniSpecificTopic', 'Zat')
    tp_before = page.evaluate("allTP.length")
    page.evaluate("document.getElementById('btnGenAllAI').click()"); wait_modal(page, 'Draf Siap Ditinjau')
    v = page.evaluate("({comp: uniComp.value, tp: uniTp.value, iktp: uniIktp.value, lvl: uniCogLevel.value, btn: document.getElementById('btnGenAllAI').innerText})")
    pr = prompt_of(log[0])
    check('X1a Analisis CP: kolom terisi, bernomor, urut level C1->C4, level tertinggi C4',
          v['comp'].split('\n')[0] == '1. Menyebutkan [C1]' and v['comp'].split('\n')[3] == '4. Menganalisis [C4]' and len(v['tp'].split('\n')) == 4 and v['lvl'].startswith('C4'), v)
    check('X1b permintaan memuat teks CP, fokus materi, dan skema terstruktur; tombol kembali normal',
          'menganalisis zat dan perubahannya' in pr and 'Fokus materi khusus dari guru: Zat' in pr and 'responseFormat' in log[0]['body']['generationConfig'] and 'Analisis' in v['btn'], v['btn'])
    page.evaluate("document.getElementById('formCPUnified').requestSubmit()")
    check('X1c hasil AI tetap draf sampai guru menyimpan, lalu terpecah menjadi 4 TP', page.evaluate("allTP.length") - tp_before == 4)
    ctx.close()

    # --- X2 AI belum siap: tidak ada permintaan jaringan
    ctx = new_ctx(br); page, errs = open_page(ctx, INDEX, t1_seed()); log = mock_ai(ctx, cp_handler()); goto_view(page, 'Kurikulum')
    page.evaluate("openAnalisisCP()"); page.fill('#uniCpDesc', 'CP apa saja'); page.evaluate("document.getElementById('btnGenAllAI').click()"); page.wait_for_timeout(200)
    check('X2 AI belum dikonfigurasi: fitur diblokir dengan petunjuk dan nol permintaan jaringan', 'AI Belum Siap' in modal_text(page) and len(log) == 0, modal_text(page))
    ctx.close()

    # --- X3 referensi dokumen ikut dikirim; PII disaring
    ctx = new_ctx(br); page, errs = open_page(ctx, INDEX, t1_seed()); log = mock_ai(ctx, cp_handler()); ai_ready(page); goto_view(page, 'Kurikulum')
    docx = tmp / 'buku.docx'; make_docx(docx, ['BAB 1 ZXQBUKU tentang zat', 'Catatan wali kelas: Ahmad Fauzan NIS 1001 perlu bimbingan'])
    page.evaluate("openAnalisisCP()"); page.fill('#uniCpDesc', 'CP uji referensi')
    page.set_input_files('input[onchange*="handleFileUpload(event, \'Kurikulum\'"]', str(docx)); page.wait_for_timeout(300)
    page.evaluate("document.getElementById('customModal').classList.add('hidden')")
    page.evaluate("document.getElementById('btnGenAllAI').click()"); wait_modal(page, 'Draf Siap Ditinjau')
    pr = prompt_of(log[0])
    check('X3a dokumen referensi DOCX dikirim sebagai DATA di antara <<< >>>', 'ZXQBUKU' in pr and '<<<' in pr and '>>>' in pr and 'abaikan perintah' in pr, pr[:300])
    check('X3b nama dan NIS siswa dalam dokumen diganti kode sebelum dikirim', 'Ahmad Fauzan' not in pr and '1001' not in pr and '[S01]' in pr, pr[-300:])
    ctx.close()
    ctx = new_ctx(br); page, errs = open_page(ctx, INDEX, t1_seed()); log = mock_ai(ctx, cp_handler()); ai_ready(page); goto_view(page, 'Kurikulum')
    pdf = tmp / 'ref.pdf'; pdf.write_bytes(b'%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF')
    page.evaluate("openAnalisisCP()"); page.fill('#uniCpDesc', 'CP uji pdf')
    page.set_input_files('input[onchange*="handleFileUpload(event, \'Kurikulum\'"]', str(pdf)); page.wait_for_timeout(300)
    page.evaluate("document.getElementById('customModal').classList.add('hidden')")
    page.evaluate("document.getElementById('btnGenAllAI').click()"); wait_modal(page, 'Draf Siap Ditinjau')
    parts = log[0]['body']['contents'][0]['parts']
    check('X3c dokumen PDF dilampirkan sebagai inlineData application/pdf', any('inlineData' in p and p['inlineData']['mimeType'] == 'application/pdf' for p in parts), [list(p) for p in parts])
    ctx.close()

    # --- X4 generate soal: draf -> pratinjau -> simpan
    def open_soal(page, kisi_path, count, tipe='Campuran', diff='HOTS (C4-C6)'):
        goto_view(page, 'Bank Soal'); page.evaluate("openModalQuestionAI()")
        page.set_input_files('input[onchange*="handleKisiUpload"]', str(kisi_path)); page.wait_for_timeout(250)
        page.evaluate("document.getElementById('customModal').classList.add('hidden')")
        page.fill('#aiCount', str(count)); page.select_option('#aiType', tipe); page.select_option('#aiDiff', diff)
        page.evaluate("document.getElementById('formQuestionAI').requestSubmit()")
        page.wait_for_function("!document.getElementById('modalAiPreview').classList.contains('hidden')", timeout=20000)
    kisi = tmp / 'kisi.docx'; make_docx(kisi, ['Kisi-kisi: indikator 1 klasifikasi zat ZXQKISI', 'Indikator 2: sifat zat'])
    ctx = new_ctx(br); page, errs = open_page(ctx, INDEX, t1_seed()); log = mock_ai(ctx, soal_handler()); ai_ready(page)
    open_soal(page, kisi, 3)
    pr = prompt_of(log[0]); body = log[0]['body']
    n_prev = page.evaluate("document.querySelectorAll('#aiPreviewList label').length")
    check('X4a pratinjau 3 butir; NOL tersimpan sebelum guru menyetujui', n_prev == 3 and page.evaluate("allQuestions.length") == SEEDQ, (n_prev, page.evaluate("allQuestions.length")))
    check('X4b permintaan memuat TP, IKTP, kisi-kisi unggahan, rencana bentuk (Campuran), dan tingkat HOTS',
          'TP-1.1' in pr and 'ZXQKISI' in pr and '1. Pilihan Ganda' in pr and '2. Pilihan Ganda Kompleks' in pr and '3. Benar-Salah' in pr and 'Sulit' in pr and 'responseFormat' in body['generationConfig'], pr[:400])
    schema_sent = json.dumps(body['generationConfig']['responseFormat'])
    check('X4c skema yang dikirim tidak memuat kata kunci tak didukung Gemini (minLength)', 'minLength' not in schema_sent and 'minItems' in schema_sent)
    page.evaluate("aiPreview.items[1].include = false"); page.evaluate("saveAiPreview()")
    qs = page.evaluate("JSON.parse(localStorage.getItem('g_qst')).filter(q=>q.source==='ai')")
    ok = len(qs) == 2 and qs[0]['key'] == 'B' and qs[0]['explanation'] and qs[0]['tpId'] and qs[0]['indicator'] and re.fullmatch(r'AI-PG-001', qs[0]['code']) and re.fullmatch(r'Q-[0-9a-f-]{36}', qs[0]['id']) and qs[1]['type'] == 'Benar-Salah' and qs[1]['code'] == 'AI-BS-001'
    check('X4d hanya butir terpilih disimpan, lengkap dengan kunci, pembahasan, TP, indikator, kode berurutan', ok, qs)
    tbl = page.evaluate("document.getElementById('bankSoalTableBody').innerText")
    check('X4e Bank Soal menampilkan kunci dan pembahasan', 'Kunci: B' in tbl and 'Pembahasan butir' in tbl, tbl[:200])
    page.evaluate("prepareKisiKisiDom()"); kk = page.evaluate("document.getElementById('kisiKisiTbody').innerText")
    page.evaluate("window.print = () => {}"); page.evaluate("printKartuSoal()"); kartu = page.evaluate("document.getElementById('printKartuSoalCanvas').innerText")
    check('X4f kisi-kisi dan kartu soal kini memuat TP, indikator, kunci, pembahasan (sebelumnya "-")', 'TP-1.1' in kk and 'Peserta didik dapat menganalisis zat nomor' in kk and 'Kunci Jawaban' in kartu and 'Pembahasan' in kartu, (kk[:160], kartu[:200]))
    ctx.close()

    # --- X5 butir cacat dibuang dan kekurangan ditambah sekali
    ctx = new_ctx(br); page, errs = open_page(ctx, INDEX, t1_seed()); h = soal_handler(bad_first=True); log = mock_ai(ctx, h); ai_ready(page)
    open_soal(page, kisi, 3)
    n_prev = page.evaluate("document.querySelectorAll('#aiPreviewList label').length"); info = page.evaluate("document.getElementById('aiPreviewInfo').innerText")
    check('X5 butir tidak lolos (3 opsi) dibuang lalu kekurangan diminta ulang: tetap 3 butir, 2 permintaan, info jelas',
          n_prev == 3 and len(log) == 2 and 'Jumlah butir: 1' in prompt_of(log[1]) and 'dibuang' in info, (n_prev, len(log), info))
    ctx.close()

    # --- X6 duplikat dengan Bank Soal dibuang
    ctx = new_ctx(br); page, errs = open_page(ctx, INDEX, t1_seed()); log = mock_ai(ctx, soal_handler(existing_dup='Apa itu zat?')); ai_ready(page)
    open_soal(page, kisi, 1, tipe='Pilihan Ganda')
    txt = page.evaluate("document.getElementById('aiPreviewList').innerText")
    check('X6 soal kembar dengan yang sudah ada di Bank Soal dibuang dan diganti', len(log) == 2 and 'Apa itu zat?' not in txt.split('\n')[1] and page.evaluate("document.querySelectorAll('#aiPreviewList label').length") == 1, (len(log), txt[:120]))
    ctx.close()

    # --- X7 20 butir dibagi 3 permintaan (8, 8, 4)
    ctx = new_ctx(br); page, errs = open_page(ctx, INDEX, t1_seed()); log = mock_ai(ctx, soal_handler()); ai_ready(page)
    open_soal(page, kisi, 20, tipe='Uraian')
    counts = [int(re.search(r'Jumlah butir: (\d+)', prompt_of(r)).group(1)) for r in log]
    check('X7 20 butir dipecah menjadi permintaan 8+8+4 dan 20 butir masuk pratinjau', counts == [8, 8, 4] and page.evaluate("document.querySelectorAll('#aiPreviewList label').length") == 20, counts)
    ctx.close()

    # --- X8 kisi-kisi AI
    ctx = new_ctx(br); page, errs = open_page(ctx, INDEX, t1_seed()); log = mock_ai(ctx, soal_handler()); ai_ready(page); goto_view(page, 'Bank Soal')
    page.evaluate("openModalKisiKisiAI()"); page.fill('#aiKisiCount', '4'); page.evaluate("document.getElementById('formKisiKisiAI').requestSubmit()")
    page.wait_for_function("!document.getElementById('modalAiPreview').classList.contains('hidden')", timeout=20000)
    title = page.evaluate("document.getElementById('aiPreviewTitle').innerText"); pr = prompt_of(log[0])
    check('X8 kisi-kisi AI: pratinjau berjudul kisi-kisi, prompt meminta indikator berbeda dan level disebar',
          'Kisi-Kisi' in title and 'indikator soal yang BERBEDA' in pr and 'C1 sampai C4' in pr and page.evaluate("document.querySelectorAll('#aiPreviewList label').length") == 4, (title, pr[:200]))
    ctx.close()

    # --- X9 modul ajar
    ctx = new_ctx(br); page, errs = open_page(ctx, INDEX, t1_seed()); log = mock_ai(ctx, modul_handler()); ai_ready(page); goto_view(page, 'Generator')
    page.select_option('#genMeetings', '2'); page.evaluate("document.querySelector('button[onclick=\"generateModulAjarAI()\"]').click()")
    page.wait_for_function("!document.getElementById('genResultContainer').classList.contains('hidden')", timeout=20000)
    txt = page.evaluate("document.getElementById('genResultContent').innerText")
    check('X9a modul: identitas dari Pengaturan (bukan AI), 2 pertemuan, catatan "Dibuat dengan AI", gambar acak picsum tidak ada',
          'SMP Negeri 1 Uji' in txt and txt.count('PERTEMUAN') == 2 and 'Dibuat dengan AI' in txt and 'picsum' not in page.evaluate("document.getElementById('genResultContent').innerHTML") and 'Klasifikasi Zat' in txt, txt[:200])
    body = log[0]['body']
    check('X9b permintaan modul: batas waktu panjang, token besar, skema terstruktur, memuat model dan KKTP',
          'Jumlah pertemuan: 2' in prompt_of(log[0]) and body['generationConfig']['maxOutputTokens'] >= 12000 and 'responseFormat' in body['generationConfig'] and 'KKTP (nilai): 75' in prompt_of(log[0]))
    ctx.close()
    ctx = new_ctx(br); page, errs = open_page(ctx, INDEX, t1_seed()); log = mock_ai(ctx, modul_handler(first_bad=True)); ai_ready(page); goto_view(page, 'Generator')
    page.evaluate("document.querySelector('button[onclick=\"generateModulAjarAI()\"]').click()")
    page.wait_for_function("!document.getElementById('genResultContainer').classList.contains('hidden')", timeout=20000)
    rep_turn = log[1]['body']['contents'][-1]['parts'][0]['text'] if len(log) > 1 else ''
    check('X9c total menit tidak 80: diperbaiki otomatis lewat satu permintaan ulang yang menyebut masalahnya', len(log) == 2 and 'total menit' in rep_turn, (len(log), rep_turn[:150]))
    ctx.close()
    PL = '<img src=x onerror="window.__xss=1">'
    ctx = new_ctx(br); page, errs = open_page(ctx, INDEX, t1_seed()); log = mock_ai(ctx, modul_handler(payload=PL)); ai_ready(page); goto_view(page, 'Generator')
    page.evaluate("document.querySelector('button[onclick=\"generateModulAjarAI()\"]').click()")
    page.wait_for_function("!document.getElementById('genResultContainer').classList.contains('hidden')", timeout=20000); page.wait_for_timeout(200)
    check('X9d XSS: keluaran AI berisi <img onerror> ditampilkan sebagai teks, tidak dieksekusi',
          page.evaluate("window.__xss === 1") is False and page.evaluate("document.querySelectorAll('#genResultContent img[src=x]').length") == 0 and '<img src=x' in page.evaluate("document.getElementById('genResultContent').innerText"))
    ctx.close()

    # --- X10 galat ditampilkan jelas, data tidak berubah, tombol pulih
    ctx = new_ctx(br); page, errs = open_page(ctx, INDEX, t1_seed()); log = mock_ai(ctx, lambda rec: (403, {"error": {"status": "PERMISSION_DENIED"}})); ai_ready(page)
    open_soal_btn = lambda: page.evaluate("document.getElementById('formQuestionAI').requestSubmit()")
    goto_view(page, 'Bank Soal'); page.evaluate("openModalQuestionAI()"); page.set_input_files('input[onchange*="handleKisiUpload"]', str(kisi)); page.wait_for_timeout(250)
    page.evaluate("document.getElementById('customModal').classList.add('hidden')"); open_soal_btn(); wait_modal(page, 'AUTH')
    check('X10a 403: modal "AI Gagal (AUTH)" berbahasa Indonesia, tombol pulih, Bank Soal tidak berubah',
          page.evaluate("document.getElementById('btnGenAI').innerText").startswith('✨') and page.evaluate("allQuestions.length") == SEEDQ and 'tidak valid' in modal_text(page), modal_text(page))
    ctx.close()
    ctx = new_ctx(br); page, errs = open_page(ctx, INDEX, t1_seed()); log = mock_ai(ctx, lambda rec: (429, {"error": {"status": "RESOURCE_EXHAUSTED", "details": [{"retryDelay": "45s"}]}})); ai_ready(page); goto_view(page, 'Generator')
    page.evaluate("document.querySelector('button[onclick=\"generateModulAjarAI()\"]').click()"); wait_modal(page, 'QUOTA')
    check('X10b kuota habis (retryDelay 45 dtk): pesan menyebut lama tunggu, tidak menunggu/ulang otomatis', '45 detik' in modal_text(page) and len(log) == 1, (modal_text(page), len(log)))
    ctx.close()

    # --- X11 pembatalan
    ctx = new_ctx(br); page, errs = open_page(ctx, INDEX, t1_seed()); ai_ready(page); goto_view(page, 'Generator'); hung = []
    ctx.route('**://generativelanguage.googleapis.com/**', lambda r: hung.append(r) if r.request.method != 'OPTIONS' else r.fulfill(status=204, headers=CORS))
    page.evaluate("document.querySelector('button[onclick=\"generateModulAjarAI()\"]').click()"); page.wait_for_timeout(500)
    busy = page.evaluate("document.querySelector('button[onclick=\"generateModulAjarAI()\"]').innerText")
    page.evaluate("document.querySelector('button[onclick=\"generateModulAjarAI()\"]').click()"); wait_modal(page, 'Dibatalkan')
    after = page.evaluate("document.querySelector('button[onclick=\"generateModulAjarAI()\"]').innerText")
    check('X11 tombol berubah jadi "klik untuk batal"; klik lagi membatalkan permintaan dan tombol pulih', 'klik untuk batal' in busy and 'Generate Modul' in after and page.evaluate("allMaterials.length") == 0, (busy, after))
    for r in hung:
        try: r.abort()
        except Exception: pass
    ctx.close()

    # --- X12 jaring pengaman privasi
    ctx = new_ctx(br); page, errs = open_page(ctx, INDEX, t1_seed()); log = mock_ai(ctx, modul_handler()); ai_ready(page); goto_view(page, 'Generator')
    page.evaluate("tpList[0].description = 'Ahmad Fauzan mampu menganalisis zat'"); page.evaluate("document.querySelector('button[onclick=\"generateModulAjarAI()\"]').click()"); wait_modal(page, 'PII_BLOCKED')
    check('X12 nama siswa lolos ke prompt: permintaan dibatalkan sebelum dikirim (nol permintaan)', len(log) == 0, modal_text(page))
    ctx.close()

# ------------------------------------------------------------------ Tahap 4
P5D = {"judul": "Pameran Inovasi Daur Ulang", "deskripsi": "Peserta didik merancang karya daur ulang untuk mengurangi sampah sekolah dan memamerkannya kepada warga sekolah.",
       "tujuan": ["Mengidentifikasi jenis sampah sekolah", "Membuat karya dari bahan bekas"],
       "tahapan": [{"nama": "Mengenal masalah", "kegiatan": "Mengamati sampah di sekolah dan mencatatnya."}, {"nama": "Merancang", "kegiatan": "Membuat sketsa karya dalam kelompok."}, {"nama": "Membuat", "kegiatan": "Mengerjakan karya dan menguji kekuatannya."}],
       "produk_akhir": "Karya daur ulang dan pameran", "sub_elemen": ["Menghasilkan gagasan orisinal", "Bekerja sama"]}

def p5m_data(P=''):
    return {"judul": P + "Modul Pameran Daur Ulang", "latar": P + "Sampah sekolah menumpuk sehingga perlu aksi nyata dari peserta didik.", "tujuan": ["Memilah sampah", "Membuat karya"],
        "dimensi": [{"dimensi": "Kreativitas", "sub_elemen": "Menghasilkan gagasan", "indikator": "Menyampaikan gagasan orisinal."}],
        "tahapan": [{"tahap": f"Tahap {i}", "waktu": f"Hari {i}", "kegiatan": f"Guru dan siswa melakukan kegiatan nomor {i} secara bertahap.", "hasil": "Catatan"} for i in range(1, 5)],
        "asesmen": {"formatif": ["Observasi kerja kelompok", "Jurnal harian"], "sumatif": ["Penilaian produk akhir"]},
        "rubrik": [{"aspek": a, "skor1": "Belum tampak", "skor2": "Mulai tampak", "skor3": "Tampak", "skor4": "Sangat menonjol"} for a in ("Gagasan", "Kolaborasi", "Produk")],
        "produk": "Karya daur ulang dan pameran kelas", "kata_kunci": ["daur ulang sampah", "ecobrick"], "refleksi": ["Apa yang kamu pelajari?", "Apa yang bisa diperbaiki?"]}

def asg_data(w=(40, 40, 20)):
    return {"judul": "LKPD Klasifikasi Zat", "pengantar": "Lembar ini membimbing kalian mengamati zat di sekitar.", "langkah": ["Amati tiga benda", "Catat sifatnya", "Kelompokkan benda"], "dikumpulkan": "Lembar kerja yang telah diisi",
            "rubrik": [{"kriteria": k, "bobot": b, "skor4": "Sangat baik", "skor1": "Kurang"} for k, b in zip(("Data", "Analisis", "Kesimpulan"), w)]}

def seq_handler(builders):
    st = {'n': 0}
    def h(rec):
        b = builders[min(st['n'], len(builders) - 1)]; st['n'] += 1
        return gem(b(rec) if callable(b) else b)
    return h

def followup_builder(wrong_first=False):
    st = {'n': 0}
    def b(rec):
        st['n'] += 1; pr = prompt_of(rec); out = []
        for m in re.finditer(r'^(\[S\d+\]) \| status: (Tuntas|Belum Tuntas)', pr, re.M):
            jenis = 'Pengayaan' if m.group(2) == 'Tuntas' else 'Remedial'
            if wrong_first and st['n'] == 1 and not out: jenis = 'Pengayaan' if jenis == 'Remedial' else 'Remedial'
            out.append({"kode": m.group(1), "jenis": jenis, "aktivitas": f"Aktivitas {jenis.lower()} untuk {m.group(1)} selama 30 menit."})
        return {"rekomendasi": out}
    return b

INTERP = {"ringkasan": "Sebagian butir terlalu mudah dan perlu direvisi agar lebih membedakan.", "butir": [{"no": 1, "penyebab": "Pengecoh kurang menarik bagi siswa.", "saran": "Revisi pengecoh agar lebih masuk akal."}],
          "remedial": ["Bimbingan kelompok kecil pada materi sukar"], "pengayaan": ["Soal HOTS tambahan"]}

def seed_many(n):
    d = t1_seed()
    for i in range(5, n + 1):
        d['g_stu'].append({"id": f"STU-{T0 + i}", "periodId": PER, "classId": "CLS-VII1", "nis": str(1000 + i), "name": f"Murid Nomor{i} Uji", "gender": "L", "class": "VII.1"})
        for aid in ("ASM-F1", "ASM-S1", "ASM-UTS", "ASM-UAS"):
            d['g_scr'].append({"id": f"SCR-{i}-{aid}", "periodId": PER, "assessmentId": aid, "studentId": f"STU-{T0 + i}", "score": 85 if i % 2 else 55})
    return d

def run_tahap4(br):
    # --- Y1 proyek P5: draf -> tinjau -> simpan
    ctx = new_ctx(br); page, errs = open_page(ctx, INDEX, t1_seed()); log = mock_ai(ctx, lambda rec: gem(P5D)); ai_ready(page); goto_view(page, 'Proyek')
    n0 = page.evaluate("allP5Projects.length")
    page.evaluate("openModalProyekAI()"); page.select_option('#aiProyekDimension', index=1); page.evaluate("document.getElementById('formProyekAI').requestSubmit()")
    page.wait_for_function("!document.getElementById('modalAiReview').classList.contains('hidden')", timeout=15000)
    pr = prompt_of(log[0]); sel = page.evaluate("({tema: aiProyekTema.value, dim: aiProyekDimension.value, scale: aiProyekScale.value})")
    check('Y1a proyek P5: permintaan memuat tema, dimensi, skala; draf muncul dan NOL tersimpan sebelum disetujui',
          sel['tema'] in pr and sel['dim'] in pr and sel['scale'] in pr and page.evaluate("allP5Projects.length") == n0, (sel, pr[:200]))
    page.evaluate("AIUI.reviewCancel()")
    check('Y1b "Buang Semua" tidak menyimpan apa pun', page.evaluate("allP5Projects.length") == n0)
    page.evaluate("document.getElementById('formProyekAI').requestSubmit()"); page.wait_for_function("!document.getElementById('modalAiReview').classList.contains('hidden')", timeout=15000)
    page.evaluate("AIUI.reviewSave()")
    pj = page.evaluate("JSON.parse(localStorage.getItem('g_p5_proj')).slice(-1)[0]")
    check('Y1c proyek tersimpan lengkap: judul, tujuan, tahapan, produk, sub-elemen, source=ai, ID UUID',
          pj['title'] == P5D['judul'] and len(pj['goals']) == 2 and len(pj['stages']) == 3 and pj['product'] and pj['subElements'] and pj['source'] == 'ai' and re.fullmatch(r'PROYEK-[0-9a-f-]{36}', pj['id']), pj)
    ctx.close()

    # --- Y2 modul P5
    ctx = new_ctx(br); page, errs = open_page(ctx, INDEX, t1_seed()); log = mock_ai(ctx, lambda rec: gem(p5m_data())); ai_ready(page); goto_view(page, 'Proyek')
    pid = page.evaluate("allP5Projects[0].id")
    page.evaluate("(id)=>document.getElementById('btnGenP5Modul_'+id).click()", pid)
    page.wait_for_function("!document.getElementById('p5ModuleContainer').classList.contains('hidden')", timeout=15000)
    txt = page.evaluate("document.getElementById('p5ModuleContent').innerText"); html = page.evaluate("document.getElementById('p5ModuleContent').innerHTML")
    check('Y2a modul P5: struktur lengkap, identitas dari Pengaturan, catatan AI, tanpa tautan karangan dan tanpa nama tempat tetap',
          'MODUL PROYEK' in txt and 'SMP Negeri 1 Uji' in txt and 'RUBRIK' in txt and 'Dibuat dengan AI' in txt and 'youtube' not in html.lower() and 'google.com' not in html.lower() and 'Talaga' not in txt, txt[:160])
    check('Y2b permintaan memuat judul proyek tersimpan dan batas waktu panjang', 'Pameran Batik' in prompt_of(log[0]) and log[0]['body']['generationConfig']['maxOutputTokens'] >= 8000)
    ctx.close()
    PL = '<img src=x onerror="window.__xss=1">'
    ctx = new_ctx(br); page, errs = open_page(ctx, INDEX, t1_seed()); mock_ai(ctx, lambda rec: gem(p5m_data(PL))); ai_ready(page); goto_view(page, 'Proyek')
    pid = page.evaluate("allP5Projects[0].id"); page.evaluate("(id)=>document.getElementById('btnGenP5Modul_'+id).click()", pid)
    page.wait_for_function("!document.getElementById('p5ModuleContainer').classList.contains('hidden')", timeout=15000); page.wait_for_timeout(200)
    check('Y2c XSS: keluaran AI modul P5 berisi <img onerror> tampil sebagai teks, tidak dieksekusi', page.evaluate("window.__xss === 1") is False and page.evaluate("document.querySelectorAll('#p5ModuleContent img[src=x]').length") == 0)
    ctx.close()

    # --- Y3 tugas / LKPD
    ctx = new_ctx(br); page, errs = open_page(ctx, INDEX, t1_seed()); log = mock_ai(ctx, seq_handler([asg_data((40, 40, 15)), asg_data()])); ai_ready(page); goto_view(page, 'Tugas')
    page.evaluate("openModalAssignment()"); page.select_option('#asgType', 'LKPD'); page.evaluate("document.getElementById('btnGenAsgAI').click()")
    wait_modal(page, 'Draf Siap Ditinjau')
    v = page.evaluate("({t: asgTitle.value, i: asgInstructions.value, r: asgRubric.value, d: asgDeadline.value})")
    pcts = [int(x) for x in re.findall(r'\((\d+)%\)', v['r'])]
    check('Y3a bobot rubrik tidak 100 pada percobaan pertama: diperbaiki otomatis; hasil total tepat 100 dan 2 permintaan',
          len(log) == 2 and sum(pcts) == 100 and 'jumlah bobot rubrik 95' in log[1]['body']['contents'][-1]['parts'][0]['text'], (len(log), pcts))
    check('Y3b judul, instruksi (tujuan, langkah, hasil), rubrik, dan tenggat terisi', v['t'] == 'LKPD Klasifikasi Zat' and 'Langkah Pengerjaan' in v['i'] and '1. Amati tiga benda' in v['i'] and v['d'], v)
    ctx.close()

    # --- Y4 interpretasi analisis ulangan
    ctx = new_ctx(br); page, errs = open_page(ctx, INDEX, t1_seed()); log = mock_ai(ctx, lambda rec: gem(INTERP)); ai_ready(page); goto_view(page, 'Analisis Ulangan')
    dtb = page.evaluate("localStorage.getItem('g_dts')")
    page.evaluate("openDailyTestDetail(allDailyTests[0].id)"); page.evaluate("document.getElementById('btnInterpretItems').click()")
    page.wait_for_function("document.getElementById('itemInterpBox').innerText.includes('Tafsiran AI')", timeout=15000)
    pr = prompt_of(log[0]); box = page.evaluate("document.getElementById('itemInterpBox').innerText")
    check('Y4a tafsiran tampil, memuat butir bermasalah dan strategi remedial/pengayaan', 'Butir 1' in box and 'Strategi remedial' in box and 'Strategi pengayaan' in box and 'Dibuat dengan AI' in box, box[:200])
    check('Y4b permintaan hanya statistik butir: tanpa nama, NIS, atau jawaban per siswa', 'Butir 1: kesukaran' in pr and not re.search(r'Ahmad|Siti|Budi|Dewi|Fajar|1001|1002', pr) and 'answers' not in json.dumps(log[0]['body']), pr[:300])
    check('Y4c tafsiran hanya ditampilkan, data ulangan tidak berubah', page.evaluate("localStorage.getItem('g_dts')") == dtb)
    ctx.close()

    # --- Y5 rekomendasi tindak lanjut
    ctx = new_ctx(br); page, errs = open_page(ctx, INDEX, t1_seed()); log = mock_ai(ctx, seq_handler([followup_builder()])); ai_ready(page)
    goto_view(page, 'Pengaturan'); set_settings_ui(page, attPenalty=False); goto_view(page, 'Remedial')
    n_fu = page.evaluate("allFollowUps.length"); page.evaluate("document.getElementById('btnRecommendAI').click()")
    page.wait_for_function("!document.getElementById('modalAiReview').classList.contains('hidden')", timeout=15000)
    pr = prompt_of(log[0]); items = page.evaluate("[...document.querySelectorAll('#aiReviewList label')].map(l=>l.innerText)")
    check('Y5a prompt memakai KODE saja (tanpa nama/NIS); siswa dengan nilai belum lengkap tidak diikutkan',
          '[S02] | status: Belum Tuntas' in pr and 'Siti' not in pr and '1002' not in pr and '[S04]' not in pr, pr[:350])
    check('Y5b pratinjau menampilkan NAMA asli (dipulihkan lokal), 3 siswa, dan info siswa belum lengkap', len(items) == 3 and 'Siti Aminah' in ' '.join(items) and '1 siswa tidak dimasukkan' in page.evaluate("document.getElementById('aiReviewInfo').innerText"), items)
    check('Y5c NOL tindak lanjut tersimpan sebelum disetujui', page.evaluate("allFollowUps.length") == n_fu)
    page.evaluate("AIUI.reviewSave()")
    fu = page.evaluate("JSON.parse(localStorage.getItem('g_fol'))")
    check('Y5d disetujui: 3 tindak lanjut tersimpan, status Direncanakan, jenis sesuai status siswa, source=ai',
          len(fu) == 3 and all(f['status'] == 'Direncanakan' and f['source'] == 'ai' and f['score'] is None for f in fu) and {f['type'] for f in fu} == {'Remedial', 'Pengayaan'}, fu)
    page.evaluate("document.getElementById('btnRecommendAI').click()"); page.wait_for_function("!document.getElementById('modalAiReview').classList.contains('hidden')", timeout=15000)
    check('Y5e permintaan ulang: siswa yang sudah punya tindak lanjut sejenis dilewati (tidak dobel)', 'dilewati' in page.evaluate("document.getElementById('aiReviewInfo').innerText") and page.evaluate("document.querySelectorAll('#aiReviewList label').length") == 0)
    ctx.close()
    ctx = new_ctx(br); page, errs = open_page(ctx, INDEX, t1_seed()); log = mock_ai(ctx, seq_handler([followup_builder(wrong_first=True), followup_builder()])); ai_ready(page)
    goto_view(page, 'Pengaturan'); set_settings_ui(page, attPenalty=False); goto_view(page, 'Remedial'); page.evaluate("document.getElementById('btnRecommendAI').click()")
    page.wait_for_function("!document.getElementById('modalAiReview').classList.contains('hidden')", timeout=15000)
    check('Y5f jenis rekomendasi tidak sesuai status siswa: ditolak dan diperbaiki otomatis (2 permintaan)', len(log) == 2 and 'jenis harus' in log[1]['body']['contents'][-1]['parts'][0]['text'], len(log))
    ctx.close()
    ctx = new_ctx(br); page, errs = open_page(ctx, INDEX, seed_many(12)); log = mock_ai(ctx, seq_handler([followup_builder()])); ai_ready(page)
    goto_view(page, 'Pengaturan'); set_settings_ui(page, attPenalty=False); goto_view(page, 'Remedial'); page.evaluate("document.getElementById('btnRecommendAI').click()")
    page.wait_for_function("!document.getElementById('modalAiReview').classList.contains('hidden')", timeout=20000)
    sizes = [len(re.findall(r'^\[S\d+\] \| status', prompt_of(r), re.M)) for r in log]
    check('Y5g 11 siswa berhak (1 belum lengkap) dibagi 10 + 1 per permintaan', sizes == [10, 1] and page.evaluate("document.querySelectorAll('#aiReviewList label').length") == 11, sizes)
    ctx.close()

    # --- Y6 AI belum siap & privasi di input teks bebas
    ctx = new_ctx(br); page, errs = open_page(ctx, INDEX, t1_seed()); log = mock_ai(ctx, lambda rec: gem(INTERP))
    goto_view(page, 'Remedial'); page.evaluate("recommendFollowUpsAI()"); m1 = modal_text(page)
    page.evaluate("document.getElementById('customModal').classList.add('hidden')"); goto_view(page, 'Analisis Ulangan'); page.evaluate("openDailyTestDetail(allDailyTests[0].id)")
    page.evaluate("interpretItemAnalysis(allDailyTests[0].id)")
    check('Y6a AI belum diatur: rekomendasi dan tafsiran diblokir dengan petunjuk, nol permintaan jaringan', ('AI Belum Siap' in m1 or 'Belum ada siswa' in m1 or 'nilai akhir' in m1) and len(log) == 0, (m1, len(log)))
    ctx.close()
    ctx = new_ctx(br); page, errs = open_page(ctx, INDEX, t1_seed()); log = mock_ai(ctx, lambda rec: gem(P5D)); ai_ready(page); goto_view(page, 'Proyek')
    page.evaluate("openModalProyekAI()"); page.select_option('#aiProyekTopicSelect', 'Lainnya...'); page.fill('#aiProyekTopic', 'Bantu Siti Aminah NIS 1002 mengelola sampah')
    page.evaluate("document.getElementById('formProyekAI').requestSubmit()"); page.wait_for_function("!document.getElementById('modalAiReview').classList.contains('hidden')", timeout=15000)
    pr = prompt_of(log[0])
    check('Y6b nama dan NIS yang diketik guru di topik bebas diganti kode sebelum dikirim', 'Siti Aminah' not in pr and '1002' not in pr and '[S02]' in pr, pr[:300])
    ctx.close()

def main():
    with sync_playwright() as p:
        br = p.chromium.launch()

        # --- U1: seluruh menu terbuka tanpa galat + paritas dengan file asli
        ctx = new_ctx(br)
        page, errs = open_page(ctx, INDEX, legacy_seed())
        n_nav = page.locator('#navMenu button').count()
        check('U1a 23 menu navigasi tampil', n_nav == 23, n_nav)
        new_texts = visit_all_views(page)
        check('U1b semua menu terbuka tanpa galat JavaScript', not errs, errs[:3])
        empty = [k for k, v in new_texts.items() if len(v) < 20]
        check('U1c tiap menu memuat konten', not empty, empty)

        if ORIG:
            octx = new_ctx(br)
            opage, oerrs = open_page(octx, ORIG_URL, legacy_seed())
            old_texts = visit_all_views(opage)
            diffs = [k for k in new_texts if new_texts[k] != old_texts.get(k)]
            # Menu yang SENGAJA berubah di Tahap 1 (nilai kosong tidak lagi 80, input nilai, remedial, simpan modul, pengaturan)
            EXPECTED = ('Dashboard', 'Generator', 'Daftar Nilai', 'Remedial', 'Rapor', 'Komunikasi', 'Pengaturan')
            unexpected = [k for k in diffs if not any(e in k for e in EXPECTED)]
            detail = []
            for k in unexpected[:3]:
                a, b = old_texts.get(k, ''), new_texts[k]
                j = next((i for i in range(min(len(a), len(b))) if a[i] != b[i]), min(len(a), len(b)))
                detail.append(f'{k}: asli ...{a[max(0,j-30):j+40]!r} baru ...{b[max(0,j-30):j+40]!r}')
            check('U1d paritas: menu di luar daftar perubahan sengaja identik dengan file asli (%d dari 23)' % (len(new_texts) - len(diffs)), not unexpected and len(new_texts) - len(diffs) >= 16, detail)
            check('U1e galat JS baru tidak melebihi file asli', len(errs) <= len(oerrs), (errs, oerrs))
            octx.close()
        ctx.close()

        # --- U2: migrasi data lama
        ctx = new_ctx(br)
        seed = legacy_seed()
        page, errs = open_page(ctx, INDEX, seed)
        res = page.evaluate("""() => {
            const out = {schema: localStorage.getItem('g_schema'), backup: !!localStorage.getItem(Store.BACKUP_KEY), lists: {}};
            for (const k of Store.LIST_KEYS) { const raw = localStorage.getItem(k); out.lists[k] = raw ? JSON.parse(raw) : null; }
            return out;
        }""")
        check('U2a g_schema = 1 setelah migrasi', res['schema'] == '1', res['schema'])
        check('U2b snapshot cadangan g_backup_pre_v1 dibuat', res['backup'])
        key_id = {'g_cp': 'cpId', 'g_tp': 'tpId', 'g_cls': 'classId'}
        bad_count, bad_id, bad_meta, bad_val = [], [], [], []
        META = {'ownerId', 'createdAt', 'updatedAt'}
        for k, old in seed.items():
            if k == 'g_set': continue
            new = res['lists'].get(k) or []
            if len(new) != len(old): bad_count.append((k, len(old), len(new)))
            idf = key_id.get(k, 'id')
            if k == 'g_dts':
                if [(r['testId'], r['studentId']) for r in old] != [(r['testId'], r['studentId']) for r in new]: bad_id.append(k)
            elif [r.get(idf) for r in old] != [r.get(idf) for r in new]: bad_id.append(k)
            for o, n in zip(old, new):
                if not (n.get('ownerId', 'MISSING') is None and n.get('createdAt') and n.get('updatedAt')): bad_meta.append(k)
                if {a: b for a, b in n.items() if a not in META} != o: bad_val.append(k)
        check('U2c jumlah record per tabel tidak berubah', not bad_count, bad_count)
        check('U2d ID lama tidak berubah', not bad_id, bad_id)
        check('U2e semua record punya ownerId=null, createdAt, updatedAt', not bad_meta, sorted(set(bad_meta)))
        check('U2f isi record lama tidak berubah (selain metadata)', not bad_val, sorted(set(bad_val)))
        stu0 = res['lists']['g_stu'][0]
        from datetime import datetime, timezone
        expect = datetime.fromtimestamp((T0 + 1) / 1000, tz=timezone.utc).strftime('%Y-%m-%dT%H:%M:%S')
        check('U2g createdAt data lama diambil dari penanda waktu pada ID', stu0['createdAt'].startswith(expect), stu0['createdAt'])
        before = {k: [r.get('updatedAt') for r in (res['lists'][k] or [])] for k in ('g_stu', 'g_scr')}
        page.reload(); page.wait_for_function("document.querySelectorAll('#navMenu button').length>0")
        after = page.evaluate("()=>({g_stu:JSON.parse(localStorage.getItem('g_stu')).map(r=>r.updatedAt), g_scr:JSON.parse(localStorage.getItem('g_scr')).map(r=>r.updatedAt)})")
        check('U2h muat ulang tidak mengubah updatedAt record yang tidak diedit', before == after)
        check('U2i audit relasi data awal bersih', page.evaluate('Integrity.audit()') == [], page.evaluate('Integrity.audit()'))
        ctx.close()

        # --- U3: ID baru UUID, updatedAt hanya berubah pada record yang diedit
        ctx = new_ctx(br)
        page, errs = open_page(ctx, INDEX, legacy_seed())
        page.evaluate("openModalStudent()")
        page.fill('#stNis', '2001'); page.fill('#stName', 'Siswa Baru')
        page.evaluate("document.getElementById('formStudent').requestSubmit()")
        newrec = page.evaluate("JSON.parse(localStorage.getItem('g_stu')).find(s=>s.name==='Siswa Baru')")
        check('U3a ID siswa baru berformat PREFIX-UUID', re.fullmatch(r'STU-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}', newrec['id'] or ''), newrec['id'])
        check('U3b siswa baru punya createdAt/updatedAt/ownerId', newrec['createdAt'] and newrec['updatedAt'] and newrec['ownerId'] is None)
        other_before = page.evaluate("JSON.parse(localStorage.getItem('g_stu')).find(s=>s.name==='Ahmad Fauzan').updatedAt")
        page.wait_for_timeout(25)
        page.evaluate("""(id) => { openModalStudent(id); }""", newrec['id'])
        page.fill('#stName', 'Siswa Baru Diedit')
        page.evaluate("document.getElementById('formStudent').requestSubmit()")
        rows = page.evaluate("JSON.parse(localStorage.getItem('g_stu'))")
        edited = next(r for r in rows if r['id'] == newrec['id'])
        other_after = next(r for r in rows if r['name'] == 'Ahmad Fauzan')['updatedAt']
        check('U3c edit mengubah updatedAt record itu saja', edited['updatedAt'] > newrec['updatedAt'] and other_after == other_before, (newrec['updatedAt'], edited['updatedAt'], other_before, other_after))
        ids = page.evaluate("(()=>{const s=new Set();for(let i=0;i<20000;i++)s.add(genId('X'));return s.size})()")
        check('U3d genId: 20.000 ID semuanya unik', ids == 20000, ids)
        leftovers = []
        for f in (ROOT / 'js').rglob('*.js'):
            t = f.read_text(encoding='utf8')
            if re.search(r"'[A-Z0-9-]+-'\s*\+\s*Date\.now\(\)", t): leftovers.append(f.name)
        check('U3e tidak ada lagi pembuat ID berbasis Date.now()', not leftovers, leftovers)
        ctx.close()

        # --- U4: XSS
        def xss_run(url, label, must_be_safe):
            c = new_ctx(br)
            pg, e = open_page(c, url, payload_seed())
            visit_all_views(pg)
            # buka beberapa modal edit & detail yang merender data
            pg.evaluate("""() => { try { openModalStudent(allStudents[0].id); } catch(e){}
                                    try { openDailyTestDetail(allDailyTests[0].id); } catch(e){}
                                    try { openSubmissions(allAssignments[0].id); } catch(e){}
                                    try { switchView('communication'); } catch(e){} }""")
            pg.wait_for_timeout(100)
            fired = pg.evaluate("window.__xss === 1")
            imgs = pg.evaluate("document.querySelectorAll('img[src=\"x\"]').length")
            c.close()
            return fired, imgs
        fired, imgs = xss_run(INDEX, 'baru', True)
        check('U4a XSS: data berisi <img onerror> tidak dieksekusi (versi baru)', not fired and imgs == 0, (fired, imgs))
        if ORIG:
            ofired, oimgs = xss_run(ORIG_URL, 'asli', False)
            check('U4b pembanding: file asli memang rentan (uji ini sah)', ofired or oimgs > 0, (ofired, oimgs))

        # --- U4c: XSS lewat jalur cetak/unduh/generator
        HOOK = ("window.__cap=[];window.open=function(){const d={write(s){window.__cap.push(String(s));},close(){},writeln(s){this.write(s);}};"
                "return {document:d,focus(){},print(){},close(){}};};const _B=window.Blob;window.Blob=function(p,o){(p||[]).forEach(x=>{if(typeof x==='string')window.__cap.push(x);});return new _B(p,o);};window.print=function(){};")
        CALLS = ["generateModulAjarAI()", "generateModulP5AI(allP5Projects[0].id)", "printFormalLetter(allDocuments[0].id)", "printKartuSoal()",
                 "downloadSoalDoc()", "printKisiKisi()", "downloadKisiKisiDoc()", "downloadModulDoc()", "downloadModulP5Doc()",
                 "printReport('view-students','X')", "analyzeSumatif()", "renderStudentRapor(allStudents[0].id)", "generateAllNarration()",
                 "generateProgressAI()", "generateDocAI()", "generateAssignmentAI()"]
        ctx = new_ctx(br)
        page, errs = open_page(ctx, INDEX, payload_seed(), HOOK)
        visit_all_views(page)
        leaks = []
        for c in CALLS:
            page.evaluate("()=>{window.__cap=[];window.__xss=0;document.querySelectorAll('img[src=x]').forEach(e=>e.remove());}")
            page.evaluate("()=>{try{" + c + "}catch(e){}}")
            page.wait_for_timeout(1300 if c.startswith('generate') else 120)
            if page.evaluate("window.__cap.some(s=>s.includes('<img src=x'))") or page.evaluate("document.querySelectorAll('img[src=x]').length") or page.evaluate("window.__xss===1"):
                leaks.append(c)
        check('U4c XSS: 16 jalur cetak/unduh/generator tidak membocorkan payload', not leaks, leaks)
        ctx.close()

        # --- U5: hapus berantai
        ctx = new_ctx(br)
        page, errs = open_page(ctx, INDEX, legacy_seed())
        sid = f"STU-{T0 + 1}"
        page.evaluate("(id)=>deleteStudent(id)", sid)
        msg = page.evaluate("document.getElementById('confirmMessage').innerText")
        check('U5a konfirmasi hapus siswa menyebut jumlah data terkait', 'absensi' in msg and 'nilai' in msg, msg)
        page.evaluate("executeConfirm()")
        c = page.evaluate("""(id)=>({stu: allStudents.some(s=>s.id===id), att: allAttendance.filter(a=>a.studentId===id).length,
            scr: allScores.filter(a=>a.studentId===id).length, grd: allGuardians.length, com: allCommunications.length,
            sub: allSubmissions.length, dts: allDailyScores.filter(a=>a.studentId===id).length, doc: allDocuments.length, rd: allRaporDescriptions.length, fol: allFollowUps.length})""", sid)
        check('U5b hapus siswa membersihkan semua turunan', c == {'stu': False, 'att': 0, 'scr': 0, 'grd': 0, 'com': 0, 'sub': 0, 'dts': 0, 'doc': 0, 'rd': 0, 'fol': 0}, c)
        check('U5c audit sesudah hapus siswa bersih', page.evaluate('Integrity.audit()') == [], page.evaluate('Integrity.audit()'))
        persisted = page.evaluate("JSON.parse(localStorage.getItem('g_att')).filter(a=>a.studentId==='%s').length" % sid)
        check('U5d hasil hapus tersimpan permanen', persisted == 0, persisted)

        page.evaluate("deleteClass('CLS-VII1')"); page.evaluate("executeConfirm()")
        c = page.evaluate("""()=>({cls: classes.map(c=>c.classId), stu: allStudents.map(s=>s.classId), mtg: allMeetings.length, att: allAttendance.length,
            asm: allAssessments.length, dt: allDailyTests.length, dts: allDailyScores.length, asg: allAssignments.length, jour: allJournals.length,
            sch: allSchedules.map(s=>s.classId), active: activeClassId})""")
        check('U5e hapus kelas membersihkan siswa, pertemuan, asesmen, tugas, ulangan, jurnal, jadwal',
              c['cls'] == ['CLS-VII2'] and set(c['stu']) == {'CLS-VII2'} and c['mtg'] == 0 and c['att'] == 0 and c['asm'] == 0 and c['dt'] == 0 and c['dts'] == 0 and c['asg'] == 0 and c['jour'] == 0 and c['sch'] == ['CLS-VII2'] and c['active'] == 'CLS-VII2', c)
        check('U5f audit sesudah hapus kelas bersih', page.evaluate('Integrity.audit()') == [], page.evaluate('Integrity.audit()'))
        ctx.close()

        ctx = new_ctx(br)
        page, errs = open_page(ctx, INDEX, legacy_seed())
        cp = f"CP-{T0 + 200}"
        page.evaluate("(id)=>deleteCPUnified(id)", cp)
        msg = page.evaluate("document.getElementById('confirmMessage').innerText")
        page.evaluate("executeConfirm()")
        c = page.evaluate("()=>({cp: allCP.length, tp: allTP.length, asmTp: allAssessments.map(a=>a.tpId), asgTp: allAssignments.map(a=>a.tpId)})")
        check('U5g hapus CP: TP ikut terhapus, kaitan asesmen/tugas dilepas (tpId=null), data tetap ada',
              c == {'cp': 0, 'tp': 0, 'asmTp': [None, None], 'asgTp': [None]} and 'Dampak' in msg, (c, msg))
        page.evaluate("(id)=>deleteGuardian(id)", f"GRD-{T0 + 1200}"); page.evaluate("executeConfirm()")
        check('U5h hapus wali menghapus catatan komunikasinya', page.evaluate("allCommunications.length") == 0 and page.evaluate('Integrity.audit()') == [])
        ctx.close()

        # --- U6: backup & restore
        ctx = new_ctx(br)
        page, errs = open_page(ctx, INDEX, legacy_seed())
        page.locator('#navMenu button', has_text='Backup').click()
        with page.expect_download() as dl:
            page.evaluate("backupJSON()")
        path = dl.value.path()
        data = json.loads(pathlib.Path(path).read_text(encoding='utf8'))
        check('U6a backup memuat paket asesmen (sebelumnya tidak ikut)', data.get('assessmentPkgs') and len(data['assessmentPkgs']) == 1, list(data)[:30])
        page.evaluate("()=>{ for (const k of Store.DATA_KEYS) localStorage.removeItem(k); }")
        page.set_input_files('#fileRestore', path)
        page.evaluate("restoreJSON()"); page.wait_for_timeout(150)
        page.evaluate("executeConfirm()"); page.wait_for_timeout(100)
        r = page.evaluate("()=>({pkg: JSON.parse(localStorage.getItem('g_pkg')||'[]').length, stu: JSON.parse(localStorage.getItem('g_stu')||'[]').length, scr: JSON.parse(localStorage.getItem('g_scr')||'[]').length})")
        check('U6b restore memulihkan data termasuk paket asesmen', r['pkg'] == 1 and r['stu'] == 6 and r['scr'] == len(legacy_seed()['g_scr']), r)
        ctx.close()

        # --- U7: kuota penuh dan data rusak
        ctx = new_ctx(br)
        page, errs = open_page(ctx, INDEX, legacy_seed())
        page.evaluate("""()=>{ window.__orig = Storage.prototype.setItem;
            Storage.prototype.setItem = function(){ throw new DOMException('quota','QuotaExceededError'); }; }""")
        page.evaluate("saveAllData()")
        m = modal_text(page)
        check('U7a kuota penuh: pengguna diberi tahu, aplikasi tidak crash', 'penuh' in m.lower() and not errs, (m, errs))
        page.evaluate("()=>{ Storage.prototype.setItem = window.__orig; }")
        ctx.close()

        ctx = new_ctx(br)
        page = ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)[:200]))
        page.add_init_script("if(!localStorage.getItem('__s')){localStorage.setItem('g_stu','{bad json');localStorage.setItem('__s','1');}")
        page.goto(INDEX)
        page.wait_for_function("document.querySelectorAll('#navMenu button').length>0")
        k = page.evaluate("Object.keys(localStorage).filter(x=>x.startsWith('g_corrupt_g_stu_'))")
        raw = page.evaluate("(k)=>k?localStorage.getItem(k):null", k[0] if k else None)
        check('U7b data rusak: salinan mentah diselamatkan ke g_corrupt_*, aplikasi tetap jalan', k and raw == '{bad json' and not errs, (k, errs))
        ctx.close()

        ctx = new_ctx(br)
        page, errs = open_page(ctx, INDEX, legacy_seed(), "if(!localStorage.getItem('__fill')){localStorage.setItem('zz_filler','x'.repeat(2300000));localStorage.setItem('__fill','1');}")
        page.wait_for_timeout(100)
        m = modal_text(page)
        check('U7c peringatan saat pemakaian penyimpanan >= 80%', 'Hampir Penuh' in m, m)
        ctx.close()

        run_tahap1(br)
        run_tahap2(br)
        run_tahap3(br)
        run_tahap4(br)

        br.close()

    fails = [r for r in RESULTS if not r[1]]
    print('\n%d/%d lulus' % (len(RESULTS) - len(fails), len(RESULTS)))
    sys.exit(1 if fails else 0)

if __name__ == '__main__':
    main()
