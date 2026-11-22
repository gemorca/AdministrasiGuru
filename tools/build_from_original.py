#!/usr/bin/env python3
"""
Memecah sistem_administrasi_guru.html (satu file) menjadi proyek modular (Tahap 0).

Prinsip:
  * Semua baris skrip asli dipetakan TEPAT SATU KALI ke satu modul (diverifikasi).
  * Skrip klasik (bukan ES module) agar onclick="..." di HTML tetap bekerja dan
    index.html tetap bisa dibuka langsung dari file://.
  * Perubahan perilaku hanya lewat daftar PATCH eksplisit di bawah. Setiap patch wajib
    cocok persis satu kali, kalau tidak build gagal.
"""
import re, sys, os, collections

SRC = sys.argv[1]
OUT = sys.argv[2]

L = open(SRC, encoding='utf8').read().split('\n')
N = len(L)

SCRIPT_OPEN = 1963      # baris '    <script>'
BODY_FIRST = 1964       # baris kode pertama
BODY_LAST = 5795        # window.onload = initApp;
SCRIPT_CLOSE = 5796     # baris '    </script>'
assert L[SCRIPT_OPEN - 1].strip() == '<script>', L[SCRIPT_OPEN - 1]
assert L[SCRIPT_CLOSE - 1].strip() == '</script>', L[SCRIPT_CLOSE - 1]
assert L[BODY_LAST - 1].strip() == 'window.onload = initApp;'

# (berkas, [(awal, akhir), ...]) nomor baris asli, inklusif
MODULES = [
    ('js/app/state.js',            [(1964, 2011)]),
    ('js/app/ui.js',               [(2035, 2073)]),
    ('js/app/app.js',              [(2153, 2380)]),
    ('js/modules/uploads.js',      [(2118, 2152)]),
    ('js/modules/dashboard.js',    [(2381, 2430)]),
    ('js/modules/students.js',     [(2431, 2542)]),
    ('js/modules/classes.js',      [(2543, 2625)]),
    ('js/modules/schedule.js',     [(2626, 2695)]),
    ('js/modules/curriculum.js',   [(2074, 2117), (2696, 3003)]),
    ('js/modules/p5.js',           [(2012, 2034), (3004, 3283)]),
    ('js/modules/assignments.js',  [(3284, 3501)]),
    ('js/modules/communication.js',[(3502, 3762)]),
    ('js/modules/modul-ajar.js',   [(3763, 4118)]),
    ('js/modules/bank-soal.js',    [(4119, 4335), (5153, 5433)]),
    ('js/modules/attendance.js',   [(4336, 4454)]),
    ('js/modules/scores.js',       [(4455, 4651)]),
    ('js/modules/remedial.js',     [(4652, 4671)]),
    ('js/modules/portfolio.js',    [(4672, 4693)]),
    ('js/modules/rapor.js',        [(4694, 4763)]),
    ('js/modules/journals.js',     [(4764, 4827)]),
    ('js/modules/backup.js',       [(4828, 4896)]),
    ('js/modules/settings.js',     [(4897, 4947)]),
    ('js/modules/documents.js',    [(4948, 5152)]),
    ('js/modules/daily-test.js',   [(5434, 5794)]),
]
# Urutan pemuatan di index.html
LOAD_ORDER = [
    'js/core/ids.js', 'js/core/sanitize.js', 'js/core/store.js', 'js/core/integrity.js',
    'js/app/state.js', 'js/app/ui.js',
    'js/modules/uploads.js', 'js/modules/dashboard.js', 'js/modules/students.js',
    'js/modules/classes.js', 'js/modules/schedule.js', 'js/modules/curriculum.js',
    'js/modules/p5.js', 'js/modules/assignments.js', 'js/modules/communication.js',
    'js/modules/modul-ajar.js', 'js/modules/bank-soal.js', 'js/modules/attendance.js',
    'js/modules/scores.js', 'js/modules/remedial.js', 'js/modules/portfolio.js',
    'js/modules/rapor.js', 'js/modules/journals.js', 'js/modules/backup.js',
    'js/modules/settings.js', 'js/modules/documents.js', 'js/modules/daily-test.js',
    'js/app/app.js', 'js/app/boot.js',
]

# ---- 1. Verifikasi partisi: setiap baris skrip asli dipakai tepat satu kali ----
used = collections.Counter()
for _, rs in MODULES:
    for a, b in rs:
        for i in range(a, b + 1):
            used[i] += 1
used[BODY_LAST] += 1  # window.onload -> boot.js
missing = [i for i in range(BODY_FIRST, BODY_LAST + 1) if used[i] != 1]
# baris 2012-2034 sudah dipakai p5; pastikan tidak ada yang hilang/ganda
bad = [(i, used[i]) for i in range(BODY_FIRST, BODY_LAST + 1) if used[i] != 1]
if bad:
    print('PARTISI TIDAK VALID:', bad[:20]); sys.exit(1)

# ---- 2. Transformasi per baris (nomor baris asli) ----
lines = {i: L[i - 1] for i in range(BODY_FIRST, BODY_LAST + 1)}
stats = collections.Counter()

# 2a. ID unik
id_re = re.compile(
    r"'([A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?)-'\s*\+\s*Date\.now\(\)"
    r"(?:\s*\+\s*Math\.random\(\)|\s*\+\s*Math\.floor\(Math\.random\(\)\s*\*\s*10000\)|\s*\+\s*i\b)?")
for i, ln in lines.items():
    new, n = id_re.subn(lambda m: "genId('%s')" % m.group(1), ln)
    if n:
        lines[i] = new; stats['id'] += n

# 2b. localStorage -> Store
ls_get = re.compile(r"JSON\.parse\(localStorage\.getItem\('(g_\w+)'\)\s*\|\|\s*'(\[\]|\{\})'\)")
ls_set = re.compile(r"localStorage\.setItem\('(g_\w+)',\s*JSON\.stringify\((\w+)\)\);")
for i, ln in lines.items():
    new, n1 = ls_get.subn(lambda m: "Store.read('%s', %s)" % (m.group(1), m.group(2)), ln)
    new, n2 = ls_set.subn(lambda m: "Store.write('%s', %s);" % (m.group(1), m.group(2)), new)
    if n1 or n2:
        lines[i] = new; stats['store_read'] += n1; stats['store_write'] += n2

# 2c. Escape HTML pada data pengguna di dalam template HTML
ESC_PROPS = {'name', 'nis', 'class', 'className', 'code', 'description', 'model', 'text', 'title',
             'topic', 'dimension', 'docNumber', 'relation', 'subject', 'school', 'teacher',
             'principal', 'nipTeacher', 'nipPrincipal', 'scale', 'year', 'semester', 'fase',
             'theme', 'phone', 'followUp', 'iktp', 'instructions', 'rubric', 'content', 'notes',
             'feedback', 'gradeLevel', 'phase', 'num', 'time', 'deadline', 'gender', 'diff', 'cog', 'type'}
# 'text' hanya properti (m.text menu = konstanta, aman di-escape)
ESC_BARE_HTML = {'iktpClean', 'uploadedRefName', 'uploadedKisiName', 'cName', 'fb', 'gdName',
                 'stName', 'pName', 'tpCode', 'displayVal'}
ESC_BARE_SOAL = {'text', 'instruction', 'left', 'right'}  # hanya di rentang cetak/unduh soal (5237-5433)
SKIP = re.compile(r"showModal\(|showConfirm\(|innerText|\.value\s*=|console\.|csv|CSV|\.download|encodeURIComponent")
interp = re.compile(r"\$\{([^{}]*)\}")
prop_expr = re.compile(r"[A-Za-z_]\w*(?:\??\.\w+)+")
sub_expr = re.compile(r"([A-Za-z_]\w*(?:\??\.\w+)+)\.substring\(\s*\d+\s*,\s*\d+\s*\)")
or_expr = re.compile(r"([A-Za-z_]\w*(?:\??\.\w+)+)\s*\|\|\s*('[^']*'|[A-Za-z_]\w*(?:\??\.\w+)+)")

def esc_wrap(e):
    return '${esc(%s)}' % e

def want_prop(path):
    return path.split('.')[-1].lstrip('?') in ESC_PROPS

def transform_interp(ln, in_modul_ajar, in_soal):
    def repl(m):
        e = m.group(1).strip()
        if prop_expr.fullmatch(e):
            if want_prop(e):
                stats['esc_prop'] += 1; return esc_wrap(e)
            return m.group(0)
        ms = sub_expr.fullmatch(e)
        if ms and want_prop(ms.group(1)):
            stats['esc_prop'] += 1; return esc_wrap(e)
        mo = or_expr.fullmatch(e)
        if mo and want_prop(mo.group(1)):
            stats['esc_prop'] += 1; return esc_wrap(e)
        if re.fullmatch(r"[A-Za-z_]\w*", e):
            if e in ESC_BARE_HTML or (in_soal and e in ESC_BARE_SOAL):
                stats['esc_bare'] += 1; return esc_wrap(e)
        return m.group(0)
    return interp.sub(repl, ln)

# Template literal multi-baris: jika SALAH SATU barisnya memuat '<', seluruh baris di dalam
# template itu dianggap konteks HTML (mis. baris `${p.topic}` yang berdiri sendiri).
def template_spans():
    spans, in_tpl, start = [], False, None
    for i in range(BODY_FIRST, BODY_LAST + 1):
        ln = L[i - 1]
        was = in_tpl
        k = 0
        while k < len(ln):
            ch = ln[k]
            if ch == '\\':
                k += 2; continue
            if ch == '`':
                in_tpl = not in_tpl
                if in_tpl: start = i
                else: spans.append((start, i))
            k += 1
    if in_tpl:
        print('PERINGATAN: backtick tidak seimbang di skrip'); 
    return spans
html_lines = set()
for a, b in template_spans():
    if a == b: continue
    if any('<' in L[j - 1] for j in range(a, b + 1)):
        html_lines.update(range(a, b + 1))
stats['html_multiline_lines'] = len(html_lines)

for i, ln in lines.items():
    if SKIP.search(ln):
        continue
    in_modul_ajar = 3763 <= i <= 4118
    in_soal = 5237 <= i <= 5433
    htmlish = '<' in ln or i in html_lines
    if htmlish or in_modul_ajar:
        lines[i] = transform_interp(ln, in_modul_ajar, in_soal)

# ---- 3. Patch eksplisit (cocok persis sekali) ----
def get_module_text(path):
    out = []
    for a, b in dict(MODULES)[path]:
        out.extend(lines[i] for i in range(a, b + 1))
    return '\n'.join(out) + '\n'

PATCHES = {}  # path -> [(old, new)]
def patch(path, old, new):
    PATCHES.setdefault(path, []).append((old, new))

# formatCell: escape teks pengguna (baris pemisah + satu baris)
patch('js/modules/schedule.js',
      'leading-relaxed">${l}</div>`).join(\'\');',
      'leading-relaxed">${esc(l)}</div>`).join(\'\');')
patch('js/modules/schedule.js',
      'return `<div class="leading-relaxed">${text}</div>`;',
      'return `<div class="leading-relaxed">${esc(text)}</div>`;')

# surat resmi: escape isi surat sebelum newline diganti <br>
patch('js/modules/documents.js',
      "`<p class=\"indent-8\">${p.replace(/\\n/g, '<br>')}</p>`",
      "`<p class=\"indent-8\">${esc(p).replace(/\\n/g, '<br>')}</p>`")

# sisa interpolasi HTML yang tidak tertangkap aturan otomatis
patch('js/modules/bank-soal.js',
      "${t.iktp ? t.iktp.substring(0, 50) : t.description.substring(0,50)}...</option>",
      "${esc(t.iktp ? t.iktp.substring(0, 50) : t.description.substring(0,50))}...</option>")
patch('js/modules/modul-ajar.js', "${uploadedRefName || moduleTitle}", "${esc(uploadedRefName || moduleTitle)}")
patch('js/modules/modul-ajar.js', "<b>Model:</b> ${model}.", "<b>Model:</b> ${esc(model)}.")
patch('js/modules/p5.js', "font-bold\">${dimText}</td>", "font-bold\">${esc(dimText)}</td>")
patch('js/modules/p5.js', ": Fase ${p.phase} / Kelas Aktif", ": Fase ${esc(p.phase)} / Kelas Aktif")
patch('js/modules/daily-test.js', "print:inline font-bold\">${mk || '-'}</span>", "print:inline font-bold\">${esc(mk || '-')}</span>")
patch('js/modules/daily-test.js', "${textColor}\">${displayVal || '-'}</span>", "${textColor}\">${esc(displayVal || '-')}</span>")

# initApp: migrasi skema sebelum membaca data
patch('js/app/app.js',
      'function initApp() {\n',
      'function initApp() {\n            Store.migrate();\n')

# Hapus berantai + tampilkan dampak di konfirmasi
patch('js/modules/students.js',
'''        function deleteStudent(id) {
            showConfirm("Apakah Anda yakin ingin menghapus peserta didik ini?", () => {
                allStudents = allStudents.filter(s => s.id !== id);
''',
'''        function deleteStudent(id) {
            showConfirm("Apakah Anda yakin ingin menghapus peserta didik ini?" + Integrity.describe(Integrity.studentDeps(id)), () => {
                Integrity.cascadeStudent(id);
''')
patch('js/modules/classes.js',
'''            showConfirm("Apakah Anda yakin ingin menghapus kelas ini beserta data yang terikat (pastikan siswa sudah dipindahkan)?", () => {
                classes = classes.filter(c => c.classId !== id);
''',
'''            showConfirm("Apakah Anda yakin ingin menghapus kelas ini?" + (Integrity.describe(Integrity.classDeps(id)) || ' Tidak ada data terkait.') + " Disarankan Backup JSON terlebih dahulu.", () => {
                Integrity.cascadeClass(id);
''')
patch('js/modules/curriculum.js',
'''            showConfirm("Apakah Anda yakin menghapus data kurikulum ini secara permanen?", () => {
                allCP = allCP.filter(c => c.cpId !== id);
                allTP = allTP.filter(t => t.cpId !== id); // Hapus TP berdasarkan cpId yang benar
''',
'''            showConfirm("Apakah Anda yakin menghapus data kurikulum ini secara permanen?" + Integrity.describeDetach(Integrity.cpDeps(id)), () => {
                Integrity.cascadeCp(id);
''')
patch('js/modules/communication.js',
'''            showConfirm("Apakah Anda yakin menghapus kontak wali ini?", () => {
                allGuardians = allGuardians.filter(g => g.id !== id);
''',
'''            showConfirm("Apakah Anda yakin menghapus kontak wali ini?" + Integrity.describe(Integrity.guardianDeps(id)), () => {
                Integrity.cascadeGuardian(id);
''')

# Backup/restore: paket asesmen (g_pkg) sebelumnya tidak ikut dicadangkan
patch('js/modules/backup.js',
      'cp: allCP, tp: allTP, materials: allMaterials, questions: allQuestions,\n',
      'cp: allCP, tp: allTP, materials: allMaterials, questions: allQuestions, assessmentPkgs: allAssessmentPkgs,\n')
patch('js/modules/backup.js',
      '                        allQuestions = d.questions || [];\n',
      '                        allQuestions = d.questions || [];\n                        allAssessmentPkgs = d.assessmentPkgs || [];\n')

BOOT = """/**
 * Titik masuk aplikasi.
 * Menghubungkan galat penyimpanan ke modal, menjalankan initApp, lalu memeriksa kuota.
 */
window.onload = function () {
    Store.onError = function (msg) { showModal('Peringatan Penyimpanan', msg, '\\u26A0\\uFE0F'); };
    initApp();
    const u = Store.usage();
    if (u.ratio >= 0.8) {
        const mb = (u.bytes / 1048576).toFixed(1);
        showModal('Penyimpanan Hampir Penuh',
            'Pemakaian penyimpanan browser sekitar ' + mb + ' MB dari perkiraan batas 5 MB. ' +
            'Lakukan Backup JSON dan hapus data periode lama agar data baru tetap bisa disimpan.', '\\u26A0\\uFE0F');
    }
};
"""

# ---- 4. Tulis modul ----
os.makedirs(OUT, exist_ok=True)
applied = collections.Counter()
for path, _ in MODULES:
    text = get_module_text(path)
    for old, new in PATCHES.get(path, []):
        c = text.count(old)
        if c != 1:
            print('PATCH GAGAL (%d kecocokan) di %s:\n%s' % (c, path, old[:120])); sys.exit(1)
        text = text.replace(old, new); applied[path] += 1
    full = os.path.join(OUT, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    header = '// %s\n// Dipecah dari sistem_administrasi_guru.html (Tahap 0). Skrip klasik: fungsi bersifat global.\n' % path
    open(full, 'w', encoding='utf8').write(header + text)
open(os.path.join(OUT, 'js/app/boot.js'), 'w', encoding='utf8').write(BOOT)
unused = [p for p in PATCHES if p not in dict(MODULES)]
assert not unused, unused

# ---- 5. index.html ----
head = L[:SCRIPT_OPEN - 1]
tail = L[SCRIPT_CLOSE:]
html_head = '\n'.join(head)
tw_old = '<script src="https://cdn.tailwindcss.com"></script>'
ch_old = '<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>'
assert html_head.count(tw_old) == 1 and html_head.count(ch_old) == 1
def loader(local, cdn):
    return ('<script src="%s" onerror="document.write(\'<script src=&quot;%s&quot;><\\/script>\')"></script>' % (local, cdn))
html_head = html_head.replace(tw_old, loader('vendor/tailwind.js', 'https://cdn.tailwindcss.com'))
html_head = html_head.replace(ch_old, loader('vendor/chart.umd.js', 'https://cdn.jsdelivr.net/npm/chart.js'))
scripts = '\n'.join('    <script src="%s"></script>' % p for p in LOAD_ORDER)
index = html_head + '\n' + scripts + '\n' + '\n'.join(tail)
open(os.path.join(OUT, 'index.html'), 'w', encoding='utf8').write(index)

print('OK modul:', len(MODULES) + 1, 'patch:', sum(applied.values()))
print('statistik transformasi:', dict(stats))
