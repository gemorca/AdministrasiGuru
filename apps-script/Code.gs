/**
 * Proxy Gemini untuk Sistem Administrasi Guru (Google Apps Script Web App).
 *
 * Tujuan: API key Gemini tersimpan di sini (Script Properties), tidak pernah sampai ke browser guru.
 * Browser hanya memegang APP_TOKEN yang dapat diganti kapan saja.
 *
 * Script Properties (Project Settings > Script properties):
 *   GEMINI_API_KEY  (wajib)  API key dari Google AI Studio
 *   APP_TOKEN       (wajib)  string acak panjang, mis. 32+ karakter; sama dengan yang diisi di aplikasi
 *   DAILY_LIMIT     (opsional) batas permintaan per hari, bawaan 300
 *
 * Deploy: Deploy > New deployment > Web app
 *   Execute as: Me
 *   Who has access: Anyone      (token di atas yang melindungi, bukan login)
 * Setelah mengubah kode, deploy ulang sebagai versi baru agar URL /exec memakai kode terbaru.
 *
 * Privasi: kode ini tidak menulis isi permintaan/jawaban ke log atau penyimpanan apa pun.
 */
var GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';
var MODEL_RE = /^gemini-[a-z0-9][a-z0-9.\-]{0,60}$/;

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function safeEquals_(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  var r = 0;
  for (var i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function doGet() {
  return json_({ ok: true, service: 'gemini-proxy' });
}

function doPost(e) {
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty('GEMINI_API_KEY');
  var token = props.getProperty('APP_TOKEN');
  if (!key || !token) return json_({ proxyError: 'CONFIG' });

  var req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return json_({ proxyError: 'BAD_REQUEST' }); }
  if (!safeEquals_(String(req.token || ''), token)) return json_({ proxyError: 'AUTH' });

  // Uji cepat dari aplikasi: membuktikan URL, deploy, dan token benar tanpa memanggil Gemini
  // dan tanpa mengurangi batas harian.
  if (req.op === 'ping') return json_({ ok: true, status: 200, ping: true });

  // Daftar model yang tersedia untuk key ini (aplikasi memakainya untuk dropdown). Tidak dihitung
  // pada batas harian karena tidak memakai model.
  if (req.op === 'models') {
    var pt = req.pageToken ? String(req.pageToken) : '';
    if (pt && !/^[A-Za-z0-9_\-=.]{1,300}$/.test(pt)) return json_({ proxyError: 'BAD_REQUEST' });
    var mresp = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200' + (pt ? '&pageToken=' + encodeURIComponent(pt) : ''), {
      headers: { 'x-goog-api-key': key }, muteHttpExceptions: true
    });
    var mdata;
    try { mdata = JSON.parse(mresp.getContentText()); } catch (err) { mdata = { error: { message: 'Respons Gemini bukan JSON' } }; }
    var mcode = mresp.getResponseCode();
    return json_({ ok: mcode >= 200 && mcode < 300, status: mcode, data: mdata });
  }

  var model = String(req.model || '');
  if (!MODEL_RE.test(model)) return json_({ proxyError: 'BAD_MODEL' });
  if (!req.request || typeof req.request !== 'object') return json_({ proxyError: 'BAD_REQUEST' });

  // Batas harian (per zona waktu skrip). Dihitung per permintaan yang diteruskan.
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (err) {
    return json_({ ok: false, status: 503, data: { error: { message: 'Proxy sibuk' } } });
  }
  try {
    var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    var limit = parseInt(props.getProperty('DAILY_LIMIT') || '300', 10);
    var rec = {};
    try { rec = JSON.parse(props.getProperty('USAGE') || '{}'); } catch (err) { rec = {}; }
    if (rec.date !== today) rec = { date: today, count: 0 };
    if (rec.count >= limit) return json_({ proxyError: 'LIMIT' });
    rec.count++;
    props.setProperty('USAGE', JSON.stringify(rec));
  } finally {
    lock.releaseLock();
  }

  var resp = UrlFetchApp.fetch(GEMINI_BASE + model + ':generateContent', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-goog-api-key': key },
    payload: JSON.stringify(req.request),
    muteHttpExceptions: true
  });
  var data;
  try { data = JSON.parse(resp.getContentText()); } catch (err) { data = { error: { message: 'Respons Gemini bukan JSON' } }; }
  var code = resp.getResponseCode();
  return json_({ ok: code >= 200 && code < 300, status: code, data: data });
}

/**
 * Jalankan SEKALI dari editor Apps Script (pilih fungsi ini lalu Run) untuk memberi izin akses
 * jaringan dan memeriksa konfigurasi. Hasil tampil di Execution log.
 * Tidak mengirim data apa pun selain daftar model (tanpa isi permintaan guru).
 */
function setupCheck() {
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty('GEMINI_API_KEY');
  var token = props.getProperty('APP_TOKEN');
  Logger.log('GEMINI_API_KEY: ' + (key ? 'terisi' : 'BELUM diisi'));
  Logger.log('APP_TOKEN: ' + (token ? (token.length >= 24 ? 'terisi' : 'terisi tetapi terlalu pendek (disarankan 32+ karakter)') : 'BELUM diisi'));
  Logger.log('DAILY_LIMIT: ' + (props.getProperty('DAILY_LIMIT') || '300 (bawaan)'));
  if (!key) return;
  var r = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', {
    headers: { 'x-goog-api-key': key }, muteHttpExceptions: true
  });
  Logger.log('Uji key ke Gemini: HTTP ' + r.getResponseCode() + (r.getResponseCode() === 200 ? ' (key valid)' : ' (periksa key dan ketersediaan layanan)'));
}

/**
 * Tes langsung ke Gemini dari editor Apps Script, tanpa aplikasi. Mengukur berapa lama Gemini menjawab.
 * Model diambil dari Script property TEST_MODEL (bawaan gemini-3.6-flash). Ganti TEST_MODEL untuk
 * membandingkan model. Lihat hasil di Execution log. Bila eksekusi menggantung lebih dari 1-2 menit,
 * masalahnya ada di sisi Gemini/key/proyek, bukan di aplikasi guru.
 */
function testGemini() {
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty('GEMINI_API_KEY');
  var model = props.getProperty('TEST_MODEL') || 'gemini-3.6-flash';
  if (!key) { Logger.log('GEMINI_API_KEY belum diisi'); return; }
  var t0 = Date.now();
  var r = UrlFetchApp.fetch(GEMINI_BASE + model + ':generateContent', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-goog-api-key': key },
    payload: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Balas satu kata: halo' }] }], generationConfig: { maxOutputTokens: 64 } }),
    muteHttpExceptions: true
  });
  Logger.log('Model ' + model + ': HTTP ' + r.getResponseCode() + ' dalam ' + (Date.now() - t0) + ' ms');
  Logger.log(r.getContentText().slice(0, 300));
}
