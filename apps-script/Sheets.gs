/**
 * Backend Google Spreadsheet untuk Sistem Administrasi Guru (pengganti Supabase).
 *
 * Semua data (akun, sesi, data guru/sekolah) disimpan di Google Spreadsheet milik pemasang.
 * Browser bicara ke Web App Apps Script ini lewat POST dengan body JSON { action: '...', ... }.
 *
 * Sheet (dibuat otomatis saat pertama dipakai):
 *   Pengguna    akun: user_id, email, nama, peran, salt, hash (kata sandi di-hash, tidak pernah disimpan polos)
 *   Sesi        token sesi (hanya hash token), masa berlaku
 *   Data        seluruh catatan aplikasi (tabel, id, pemilik, JSON dipecah per 45.000 karakter)
 *   Undangan    email yang diberi peran lebih dulu oleh Admin
 *   Pengaturan  nama sekolah, dll.
 *
 * Script Properties (opsional):
 *   SPREADSHEET_ID  bila skrip BUKAN dibuat dari menu Extensions > Apps Script di dalam Spreadsheet
 *   REG_CODE        kode pendaftaran sekolah; bila diisi, calon guru wajib memasukkannya saat daftar
 *   SESSION_DAYS    masa berlaku sesi (bawaan 30)
 *
 * Pendaftar PERTAMA otomatis menjadi Admin Sekolah dan menentukan nama sekolah.
 */
var SH_ = { USERS: 'Pengguna', SESS: 'Sesi', DATA: 'Data', INV: 'Undangan', CFG: 'Pengaturan' };
var USER_HEAD_ = ['user_id', 'email', 'nama', 'peran', 'salt', 'hash', 'status', 'dibuat', 'login_terakhir'];
var SESS_HEAD_ = ['token_hash', 'user_id', 'kedaluwarsa'];
var INV_HEAD_ = ['id', 'email', 'peran', 'dibuat', 'diklaim'];
var CFG_HEAD_ = ['kunci', 'nilai'];
var DATA_HEAD_ = ['seq', 'key', 'tbl', 'id', 'owner', 'deleted', 'client_at', 'n', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8'];
var CHUNK_ = 45000;
var MAXCH_ = 8;
var SHARED_TBL_ = ['g_per', 'g_cls', 'g_stu'];
var TEACHER_TBL_ = ['g_mtg', 'g_att', 'g_ass', 'g_scr', 'g_fol', 'g_cp', 'g_tp', 'g_mat', 'g_qst', 'g_pkg', 'g_rdesc', 'g_sch', 'g_jour',
  'g_p5_proj', 'g_assign', 'g_submit', 'g_guardians', 'g_communications', 'g_docs', 'g_dt', 'g_dts', 'g_set'];
var HASH_ROUNDS_ = 1000;

// ---------- utilitas sheet ----------
function ss_() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  var s = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  if (!s) throw new Error('Spreadsheet tidak ditemukan. Isi Script property SPREADSHEET_ID.');
  return s;
}

function sheet_(name, head) {
  var ss = ss_();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange('A:Z').setNumberFormat('@'); // teks polos: cegah ISO-date / angka diubah otomatis
    sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function rows_(sh, ncols) {
  var last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, ncols).getValues();
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function hex_(bytes) {
  var s = '';
  for (var i = 0; i < bytes.length; i++) { var b = (bytes[i] + 256) % 256; s += (b < 16 ? '0' : '') + b.toString(16); }
  return s;
}
function sha256_(str) { return hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, str, Utilities.Charset.UTF_8)); }
function hashPw_(pw, salt) {
  var h = salt + ':' + pw;
  for (var i = 0; i < HASH_ROUNDS_; i++) h = sha256_(h);
  return h;
}
function newSalt_() { return sha256_(Utilities.getUuid() + Date.now()).slice(0, 32); }
function randToken_() { return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, ''); }
function emailOk_(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 120; }
function str_(v, max) { return String(v === undefined || v === null ? '' : v).trim().slice(0, max || 200); }

// ---------- pengaturan ----------
function cfgGet_(key) {
  var r = rows_(sheet_(SH_.CFG, CFG_HEAD_), 2);
  for (var i = 0; i < r.length; i++) if (r[i][0] === key) return String(r[i][1]);
  return '';
}
function cfgSet_(key, val) {
  var sh = sheet_(SH_.CFG, CFG_HEAD_);
  var r = rows_(sh, 2);
  for (var i = 0; i < r.length; i++) if (r[i][0] === key) { sh.getRange(i + 2, 2).setValue(String(val)); return; }
  sh.appendRow([key, String(val)]);
}

// ---------- pengguna ----------
function allUsers_() {
  return rows_(sheet_(SH_.USERS, USER_HEAD_), USER_HEAD_.length).map(function (r, i) {
    return { row: i + 2, id: String(r[0]), email: String(r[1]), name: String(r[2]), role: String(r[3]), salt: String(r[4]), hash: String(r[5]), status: String(r[6]) };
  });
}
function findUserByEmail_(email) {
  var u = allUsers_();
  for (var i = 0; i < u.length; i++) if (u[i].email === email && u[i].status !== 'removed') return u[i];
  return null;
}
function findUserById_(id) {
  var u = allUsers_();
  for (var i = 0; i < u.length; i++) if (u[i].id === id && u[i].status !== 'removed') return u[i];
  return null;
}
function meOf_(u) {
  return { user_id: u.id, email: u.email, name: u.name, role: u.role === 'admin' ? 'admin' : 'teacher', school_id: 'sekolah', school_name: cfgGet_('school_name') };
}

// ---------- sesi ----------
function createSession_(userId) {
  var token = randToken_();
  var days = parseInt(PropertiesService.getScriptProperties().getProperty('SESSION_DAYS') || '30', 10);
  var exp = Date.now() + days * 86400000;
  var sh = sheet_(SH_.SESS, SESS_HEAD_);
  // bersihkan sesi kedaluwarsa (murah, dilakukan saat login)
  var r = rows_(sh, 3), now = Date.now();
  for (var i = r.length - 1; i >= 0; i--) if (Number(r[i][2]) < now) sh.deleteRow(i + 2);
  sh.appendRow([sha256_(token), userId, String(exp)]);
  return token;
}
function userFromToken_(token) {
  token = String(token || '');
  if (token.length < 32 || token.length > 128) return null;
  var h = sha256_(token), now = Date.now();
  var cache = CacheService.getScriptCache();
  var uid = null, c = cache.get('S' + h);
  if (c) {
    var p = c.split('|');
    if (Number(p[1]) > now) uid = p[0];
  } else {
    var r = rows_(sheet_(SH_.SESS, SESS_HEAD_), 3);
    for (var i = 0; i < r.length; i++) {
      if (String(r[i][0]) === h && Number(r[i][2]) > now) { uid = String(r[i][1]); cache.put('S' + h, uid + '|' + r[i][2], 600); break; }
    }
  }
  return uid ? findUserById_(uid) : null; // dibaca tiap permintaan agar perubahan peran / pencabutan langsung berlaku
}
function dropSession_(token) {
  var h = sha256_(String(token || ''));
  CacheService.getScriptCache().remove('S' + h);
  var sh = sheet_(SH_.SESS, SESS_HEAD_);
  var r = rows_(sh, 3);
  for (var i = r.length - 1; i >= 0; i--) if (String(r[i][0]) === h) sh.deleteRow(i + 2);
}
function dropUserSessions_(userId) {
  var sh = sheet_(SH_.SESS, SESS_HEAD_);
  var r = rows_(sh, 3);
  for (var i = r.length - 1; i >= 0; i--) if (String(r[i][1]) === userId) {
    CacheService.getScriptCache().remove('S' + String(r[i][0]));
    sh.deleteRow(i + 2);
  }
}

// ---------- router ----------
function handleSheets_(req) {
  try {
    var a = String(req.action || '');
    if (a === 'status') return actStatus_();
    if (a === 'register') return actRegister_(req);
    if (a === 'login') return actLogin_(req);
    var user = userFromToken_(req.token);
    if (!user) return { ok: false, error: 'AUTH' };
    switch (a) {
      case 'me': return Object.assign({ ok: true }, meOf_(user));
      case 'logout': dropSession_(req.token); return { ok: true };
      case 'change_password': return actChangePassword_(user, req);
      case 'push': return actPush_(user, req);
      case 'pull': return actPull_(user, req);
      case 'get_record': return actGetRecord_(user, req);
    }
    if (user.role !== 'admin') return { ok: false, error: 'FORBIDDEN' };
    switch (a) {
      case 'team': return actTeam_();
      case 'invite': return actInvite_(req);
      case 'revoke_invite': return actRevokeInvite_(req);
      case 'set_role': return actSetRole_(user, req);
      case 'remove_member': return actRemove_(user, req);
      case 'reset_password': return actResetPassword_(req);
    }
    return { ok: false, error: 'BAD_ACTION' };
  } catch (err) {
    return { ok: false, error: 'SERVER', message: String(err && err.message ? err.message : err) };
  }
}

// ---------- autentikasi ----------
function actStatus_() {
  return { ok: true, hasUsers: allUsers_().length > 0, needsCode: !!PropertiesService.getScriptProperties().getProperty('REG_CODE'), schoolName: cfgGet_('school_name') };
}

function actRegister_(req) {
  var name = str_(req.name, 80), email = str_(req.email, 120).toLowerCase(), pw = String(req.password || '');
  if (!name) return { ok: false, reason: 'NAME_REQUIRED' };
  if (!emailOk_(email)) return { ok: false, reason: 'EMAIL_INVALID' };
  if (pw.length < 8 || pw.length > 100) return { ok: false, reason: 'PASSWORD_WEAK' };
  var regCode = PropertiesService.getScriptProperties().getProperty('REG_CODE');
  return withLock_(function () {
    var users = allUsers_();
    for (var i = 0; i < users.length; i++) if (users[i].email === email && users[i].status !== 'removed') return { ok: false, reason: 'EMAIL_EXISTS' };
    var first = users.length === 0, role = 'teacher';
    if (first) {
      var school = str_(req.school, 120);
      if (!school) return { ok: false, reason: 'SCHOOL_REQUIRED' };
      cfgSet_('school_name', school);
      role = 'admin';
    } else {
      var inv = findInvite_(email);
      if (regCode && !inv && !safeEquals_(String(req.code || ''), regCode)) return { ok: false, reason: 'BAD_CODE' };
      if (inv) { role = inv.role; markInviteClaimed_(inv); }
    }
    var salt = newSalt_(), id = 'U-' + Utilities.getUuid().slice(0, 12);
    sheet_(SH_.USERS, USER_HEAD_).appendRow([id, email, name, role, salt, hashPw_(pw, salt), 'active', new Date().toISOString(), '']);
    var u = { id: id, email: email, name: name, role: role };
    return Object.assign({ ok: true, token: createSession_(id) }, meOf_(u));
  });
}

function actLogin_(req) {
  var email = str_(req.email, 120).toLowerCase(), pw = String(req.password || '');
  var cache = CacheService.getScriptCache(), fk = 'F' + sha256_(email);
  var fails = parseInt(cache.get(fk) || '0', 10);
  if (fails >= 6) return { ok: false, reason: 'LOCKED' };
  var u = findUserByEmail_(email);
  // Hash tetap dihitung walau akun tidak ada agar waktu respons seragam.
  var okPw = u ? (hashPw_(pw, u.salt) === u.hash) : (hashPw_(pw, 'x'), false);
  if (!u || !okPw) { cache.put(fk, String(fails + 1), 900); return { ok: false, reason: 'BAD_CREDENTIALS' }; }
  cache.remove(fk);
  return withLock_(function () {
    sheet_(SH_.USERS, USER_HEAD_).getRange(u.row, 9).setValue(new Date().toISOString());
    return Object.assign({ ok: true, token: createSession_(u.id) }, meOf_(u));
  });
}

function actChangePassword_(user, req) {
  var oldPw = String(req.oldPassword || ''), newPw = String(req.newPassword || '');
  if (newPw.length < 8 || newPw.length > 100) return { ok: false, reason: 'PASSWORD_WEAK' };
  if (hashPw_(oldPw, user.salt) !== user.hash) return { ok: false, reason: 'BAD_CREDENTIALS' };
  return withLock_(function () {
    var salt = newSalt_();
    sheet_(SH_.USERS, USER_HEAD_).getRange(user.row, 5, 1, 2).setValues([[salt, hashPw_(newPw, salt)]]);
    return { ok: true };
  });
}

// ---------- undangan & tim (Admin) ----------
function findInvite_(email) {
  var r = rows_(sheet_(SH_.INV, INV_HEAD_), 5);
  for (var i = 0; i < r.length; i++) if (String(r[i][1]) === email && !r[i][4]) return { row: i + 2, id: String(r[i][0]), email: email, role: String(r[i][2]) === 'admin' ? 'admin' : 'teacher' };
  return null;
}
function markInviteClaimed_(inv) { sheet_(SH_.INV, INV_HEAD_).getRange(inv.row, 5).setValue(new Date().toISOString()); }

function actTeam_() {
  var members = allUsers_().filter(function (u) { return u.status !== 'removed'; }).map(function (u) {
    return { user_id: u.id, email: u.email, name: u.name, role: u.role === 'admin' ? 'admin' : 'teacher' };
  });
  var invites = rows_(sheet_(SH_.INV, INV_HEAD_), 5).filter(function (r) { return !r[4]; }).map(function (r) {
    return { id: String(r[0]), email: String(r[1]), role: String(r[2]) };
  });
  return { ok: true, members: members, invites: invites };
}

function actInvite_(req) {
  var email = str_(req.email, 120).toLowerCase(), role = req.role === 'admin' ? 'admin' : 'teacher';
  if (!emailOk_(email)) return { ok: false, reason: 'EMAIL_INVALID' };
  return withLock_(function () {
    if (findUserByEmail_(email)) return { ok: false, reason: 'ALREADY_MEMBER' };
    var old = findInvite_(email);
    if (old) sheet_(SH_.INV, INV_HEAD_).deleteRow(old.row);
    sheet_(SH_.INV, INV_HEAD_).appendRow(['I-' + Utilities.getUuid().slice(0, 10), email, role, new Date().toISOString(), '']);
    return { ok: true };
  });
}

function actRevokeInvite_(req) {
  return withLock_(function () {
    var sh = sheet_(SH_.INV, INV_HEAD_), r = rows_(sh, 5);
    for (var i = 0; i < r.length; i++) if (String(r[i][0]) === String(req.invite_id) && !r[i][4]) { sh.deleteRow(i + 2); return { ok: true }; }
    return { ok: false, reason: 'NOT_FOUND' };
  });
}

function adminCount_() { return allUsers_().filter(function (u) { return u.status !== 'removed' && u.role === 'admin'; }).length; }

function actSetRole_(admin, req) {
  var role = req.role === 'admin' ? 'admin' : 'teacher';
  return withLock_(function () {
    var t = findUserById_(String(req.user_id));
    if (!t) return { ok: false, reason: 'NOT_FOUND' };
    if (t.role === 'admin' && role !== 'admin' && adminCount_() <= 1) return { ok: false, reason: 'LAST_ADMIN' };
    sheet_(SH_.USERS, USER_HEAD_).getRange(t.row, 4).setValue(role);
    return { ok: true };
  });
}

function actRemove_(admin, req) {
  return withLock_(function () {
    var t = findUserById_(String(req.user_id));
    if (!t) return { ok: false, reason: 'NOT_FOUND' };
    if (t.id === admin.id) return { ok: false, reason: 'SELF' };
    if (t.role === 'admin' && adminCount_() <= 1) return { ok: false, reason: 'LAST_ADMIN' };
    sheet_(SH_.USERS, USER_HEAD_).getRange(t.row, 7).setValue('removed');
    dropUserSessions_(t.id);
    return { ok: true };
  });
}

function actResetPassword_(req) {
  return withLock_(function () {
    var t = findUserById_(String(req.user_id));
    if (!t) return { ok: false, reason: 'NOT_FOUND' };
    var temp = randToken_().slice(0, 10), salt = newSalt_();
    sheet_(SH_.USERS, USER_HEAD_).getRange(t.row, 5, 1, 2).setValues([[salt, hashPw_(temp, salt)]]);
    dropUserSessions_(t.id);
    return { ok: true, tempPassword: temp };
  });
}

// ---------- data: push / pull ----------
function validTbl_(t) { return SHARED_TBL_.indexOf(t) >= 0 || TEACHER_TBL_.indexOf(t) >= 0; }

function dataRow_(seq, tbl, id, owner, deleted, clientAt, json) {
  var chunks = [];
  for (var i = 0; i < json.length; i += CHUNK_) chunks.push(json.slice(i, i + CHUNK_));
  var row = [String(seq), tbl + '|' + owner + '|' + id, tbl, id, owner, deleted ? '1' : '', String(clientAt || ''), String(chunks.length)];
  for (var k = 0; k < MAXCH_; k++) row.push(chunks[k] || '');
  return row;
}

function actPush_(user, req) {
  var items = Array.isArray(req.items) ? req.items : [];
  if (items.length > 300) return { ok: false, error: 'SERVER', message: 'Batch terlalu besar' };
  return withLock_(function () {
    var props = PropertiesService.getScriptProperties();
    var sh = sheet_(SH_.DATA, DATA_HEAD_), ncol = DATA_HEAD_.length;
    var last = sh.getLastRow();
    var idx = {};
    if (last > 1) {
      var keys = sh.getRange(2, 2, last - 1, 1).getValues();
      for (var i = 0; i < keys.length; i++) idx[String(keys[i][0])] = i + 2;
    }
    var seq = parseInt(props.getProperty('SEQ') || '0', 10);
    var rejected = [], byKey = {}, order = [];
    items.forEach(function (it) {
      if (!it || !validTbl_(it.tbl) || !it.id) { rejected.push({ tbl: it && it.tbl, id: it && it.id, reason: 'INVALID' }); return; }
      var shared = SHARED_TBL_.indexOf(it.tbl) >= 0;
      if (shared && user.role !== 'admin') { rejected.push({ tbl: it.tbl, id: it.id, reason: 'FORBIDDEN' }); return; }
      var owner = shared ? '' : user.id, id = String(it.id).slice(0, 200), del = !!it.deleted;
      var json = del ? '' : JSON.stringify(it.data === undefined ? null : it.data);
      if (json.length > CHUNK_ * MAXCH_) { rejected.push({ tbl: it.tbl, id: id, reason: 'TOO_LARGE' }); return; }
      var key = it.tbl + '|' + owner + '|' + id;
      if (!byKey[key]) order.push(key);
      byKey[key] = { tbl: it.tbl, id: id, owner: owner, del: del, at: it.client_at, json: json };
    });
    var updates = [], inserts = [];
    order.forEach(function (key) {
      var d = byKey[key];
      seq++;
      var row = dataRow_(seq, d.tbl, d.id, d.owner, d.del, d.at, d.json);
      if (idx[key]) updates.push({ r: idx[key], v: row }); else inserts.push(row);
    });
    if (updates.length > 20) {
      var all = sh.getRange(2, 1, last - 1, ncol).getValues();
      updates.forEach(function (u) { all[u.r - 2] = u.v; });
      sh.getRange(2, 1, all.length, ncol).setValues(all);
    } else {
      updates.forEach(function (u) { sh.getRange(u.r, 1, 1, ncol).setValues([u.v]); });
    }
    if (inserts.length) sh.getRange(Math.max(last, 1) + 1, 1, inserts.length, ncol).setValues(inserts);
    props.setProperty('SEQ', String(seq)); // ditulis SETELAH data agar pull tidak melewatkan baris
    return { ok: true, rejected: rejected };
  });
}

function rowToRecord_(v) {
  var n = Number(v[7]) || 0, json = '';
  for (var k = 0; k < n; k++) json += String(v[8 + k] || '');
  var data = null;
  if (!v[5] && json) { try { data = JSON.parse(json); } catch (e) { data = null; } }
  return { seq: Number(v[0]), tbl: String(v[2]), id: String(v[3]), owner_id: v[4] ? String(v[4]) : null, data: data, deleted: !!v[5], client_at: String(v[6] || '') };
}

function actPull_(user, req) {
  var since = Math.max(0, Number(req.since) || 0), limit = Math.max(1, Math.min(Number(req.limit) || 500, 1000));
  var maxSeq = parseInt(PropertiesService.getScriptProperties().getProperty('SEQ') || '0', 10); // dibaca SEBELUM data
  var sh = sheet_(SH_.DATA, DATA_HEAD_), last = sh.getLastRow(), ncol = DATA_HEAD_.length;
  if (last < 2) return { ok: true, rows: [], last_seq: maxSeq, has_more: false };
  var head = sh.getRange(2, 1, last - 1, 5).getValues(), cand = [];
  for (var i = 0; i < head.length; i++) {
    var s = Number(head[i][0]), owner = String(head[i][4]);
    if (s > since && s <= maxSeq && (owner === '' || owner === user.id)) cand.push({ s: s, r: i + 2 });
  }
  cand.sort(function (a, b) { return a.s - b.s; });
  var page = cand.slice(0, limit), hasMore = cand.length > limit;
  var rows = [];
  if (page.length > 25) {
    var all = sh.getRange(2, 1, last - 1, ncol).getValues();
    page.forEach(function (c) { rows.push(rowToRecord_(all[c.r - 2])); });
  } else {
    page.forEach(function (c) { rows.push(rowToRecord_(sh.getRange(c.r, 1, 1, ncol).getValues()[0])); });
  }
  var lastSeq = hasMore ? page[page.length - 1].s : Math.max(maxSeq, page.length ? page[page.length - 1].s : 0);
  return { ok: true, rows: rows, last_seq: lastSeq, has_more: hasMore };
}

function actGetRecord_(user, req) {
  var tbl = String(req.tbl || ''), id = String(req.id || '');
  if (!validTbl_(tbl)) return { ok: false, reason: 'INVALID' };
  var owner = SHARED_TBL_.indexOf(tbl) >= 0 ? '' : user.id;
  var sh = sheet_(SH_.DATA, DATA_HEAD_), last = sh.getLastRow();
  if (last < 2) return { ok: true, record: null };
  var keys = sh.getRange(2, 2, last - 1, 1).getValues(), key = tbl + '|' + owner + '|' + id;
  for (var i = 0; i < keys.length; i++) {
    if (String(keys[i][0]) === key) return { ok: true, record: rowToRecord_(sh.getRange(i + 2, 1, 1, DATA_HEAD_.length).getValues()[0]) };
  }
  return { ok: true, record: null };
}

/**
 * Jalankan SEKALI dari editor (pilih fungsi ini lalu Run) untuk memberi izin akses Spreadsheet
 * dan membuat semua sheet. Hasil tampil di Execution log.
 */
function setupSheets() {
  [[SH_.USERS, USER_HEAD_], [SH_.SESS, SESS_HEAD_], [SH_.DATA, DATA_HEAD_], [SH_.INV, INV_HEAD_], [SH_.CFG, CFG_HEAD_]].forEach(function (p) { sheet_(p[0], p[1]); });
  Logger.log('Sheet siap di: ' + ss_().getUrl());
  Logger.log('Pengguna terdaftar: ' + allUsers_().length);
}
