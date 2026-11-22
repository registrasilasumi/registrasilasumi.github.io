/**
 * Registrasi Lapas Sukamiskin - server Google Apps Script.
 * Data disimpan di Google Sheets. Akses lewat kode akses bersama yang diperiksa di sini, bukan di browser.
 * Pengaturan rahasia ada di Project Settings > Script properties (lihat PANDUAN.md).
 */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Registrasi Lapas Sukamiskin')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/* ---------- pengaturan awal: jalankan sekali dari editor ---------- */
function siapkan() {
  var P = PropertiesService.getScriptProperties();
  if (!P.getProperty('SHEET_ID')) {
    var ss = SpreadsheetApp.create('Data Registrasi Lapas Sukamiskin');
    var sh = ss.getSheets()[0];
    sh.setName('docs');
    sh.appendRow(['coll', 'id', 'data', 'updated_at']);
    sh.setFrozenRows(1);
    P.setProperty('SHEET_ID', ss.getId());
    Logger.log('Lembar data dibuat: ' + ss.getUrl());
  } else {
    Logger.log('Lembar data sudah ada: https://docs.google.com/spreadsheets/d/' + P.getProperty('SHEET_ID'));
  }
  if (!P.getProperty('KODE_EDITOR')) Logger.log('LANGKAH BERIKUT: isi KODE_EDITOR di Project Settings > Script properties.');
  if (!P.getProperty('ANTHROPIC_API_KEY')) Logger.log('Untuk membaca surat dan foto: isi ANTHROPIC_API_KEY di Script properties.');
}

/* ---------- helper ---------- */
function prop_(k) { return PropertiesService.getScriptProperties().getProperty(k) || ''; }

function sheet_() {
  var id = prop_('SHEET_ID');
  if (!id) throw new Error('Jalankan fungsi siapkan() dulu dari editor Apps Script.');
  var ss = SpreadsheetApp.openById(id);
  return ss.getSheetByName('docs') || ss.insertSheet('docs');
}

// Sheets bisa mengubah teks seperti 2026-11-04 menjadi tanggal; kembalikan ke teks agar id selalu cocok.
function kunci_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return String(v);
}

function sama_(a, b) {
  a = String(a); b = String(b);
  var d = a.length ^ b.length;
  var n = Math.max(a.length, b.length);
  for (var i = 0; i < n; i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0;
}

function cekKode_(kode) {
  var cache = CacheService.getScriptCache();
  var n = parseInt(cache.get('gagal') || '0', 10);
  if (n >= 20) throw new Error('Terlalu banyak percobaan kode yang salah. Tunggu 10 menit lalu coba lagi.');
  var ed = prop_('KODE_EDITOR'), li = prop_('KODE_LIHAT');
  kode = String(kode == null ? '' : kode);
  var role = (ed && sama_(kode, ed)) ? 'editor' : (li && sama_(kode, li)) ? 'viewer' : null;
  if (!role) cache.put('gagal', String(n + 1), 600);
  else if (n > 0) cache.remove('gagal');
  return role;
}

function naik_() { PropertiesService.getScriptProperties().setProperty('VER', String(new Date().getTime())); }

/* ---------- pintu masuk dari halaman web ---------- */
function api(kode, op, args) {
  try {
    args = args || {};
    var p2u = prop_('KODE_P2U');
    var role = (p2u && String(kode) === p2u) ? 'p2u' : cekKode_(kode);
    if (!role) return { error: { code: 'login_failed', message: 'Kode akses salah.' } };
    // 'ai' diberi tahu ke halaman supaya unggah berkas langsung dibaca Claude (hanya editor)
    if (op === 'login') return { ok: true, role: role, ai: role === 'editor' && !!prop_('ANTHROPIC_API_KEY') };
    if (op === 'ver') return { ok: true, ver: prop_('VER') || '0' };
    if (op === 'foto') return { ok: true, fotos: role === 'p2u' ? {} : bacaFoto_() };
    if (op === 'snapshot') {
      var docs = bacaSemua_();
      if (role === 'p2u') {
        // P2U hanya menerima agenda HARI INI (zona Jakarta): sidang, pemeriksaan, dan mutasi
        var hariIni = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd');
        docs = docs.filter(function (d) { return (d.coll === 'events' || d.coll === 'mutasi') && d.data && String(d.data.tgl) === hariIni; });
      }
      return { ok: true, ver: prop_('VER') || '0', docs: docs };
    }
    if (role === 'p2u') {
      // P2U hanya boleh mengubah centang selesai pada jadwal dan mutasi
      if (op !== 'update') return { error: { code: 'not_granted', message: 'Kode ini hanya bisa melihat agenda.' } };
      var c = String(args.coll || ''), dt = args.data || {}, ks = Object.keys(dt), ok = (c === 'events' || c === 'mutasi') && ks.length > 0;
      for (var i = 0; i < ks.length; i++) if (ks[i] !== 'done' && ks[i] !== 'done_at') ok = false;
      if (!ok) return { error: { code: 'not_granted', message: 'Kode ini hanya bisa mencentang selesai.' } };
      return tulis_(op, args);
    }
    if (op === 'set' || op === 'update' || op === 'delete' || op === 'ask') {
      if (role !== 'editor') return { error: { code: 'not_granted', message: 'Kode ini hanya bisa melihat.' } };
      return op === 'ask' ? tanya_(args) : tulis_(op, args);
    }
    return { error: { code: 'invalid_argument', message: 'Operasi tidak dikenal.' } };
  } catch (e) {
    return { error: { code: 'unavailable', message: String((e && e.message) || e) } };
  }
}

/* ---------- foto penghuni: sheet 'foto' kolom A = nomor register ternormalisasi, kolom B = JPEG base64 ---------- */
function bacaFoto_() {
  var sh = SpreadsheetApp.openById(prop_('SHEET_ID')).getSheetByName('foto');
  if (!sh || sh.getLastRow() < 2) return {};
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues(), o = {};
  for (var i = 0; i < v.length; i++) if (v[i][0] && v[i][1]) o[String(v[i][0])] = String(v[i][1]);
  return o;
}

/* ---------- baca tulis data ---------- */
function bacaSemua_() {
  var sh = sheet_(), last = sh.getLastRow();
  if (last < 2) return [];
  var v = sh.getRange(2, 1, last - 1, 3).getValues(), out = [];
  for (var i = 0; i < v.length; i++) {
    if (!v[i][0]) continue;
    var d;
    try { d = JSON.parse(v[i][2]); } catch (e) { continue; }
    out.push({ coll: String(v[i][0]), id: kunci_(v[i][1]), data: d });
  }
  return out;
}

var NAMA_OK = /^[A-Za-z0-9_\-.~:@+]{1,200}$/;

function tulis_(op, a) {
  var coll = String(a.coll || ''), id = String(a.id || '');
  if (!NAMA_OK.test(coll) || !NAMA_OK.test(id)) return { error: { code: 'invalid_argument', message: 'Nama koleksi atau id tidak valid.' } };
  var data = a.data;
  if (op !== 'delete' && (!data || typeof data !== 'object' || Array.isArray(data))) return { error: { code: 'invalid_argument', message: 'Isi dokumen harus berupa objek.' } };
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = sheet_(), last = sh.getLastRow(), row = -1;
    if (last >= 2) {
      var keys = sh.getRange(2, 1, last - 1, 2).getValues();
      for (var i = 0; i < keys.length; i++) if (kunci_(keys[i][0]) === coll && kunci_(keys[i][1]) === id) row = i + 2; // ambil baris paling bawah (terbaru) bila ada duplikat
    }
    var now = new Date().toISOString();
    if (op === 'delete') {
      if (row > 0) sh.deleteRow(row);
    } else {
      var merged = data;
      if (op === 'update') {
        if (row < 0) return { error: { code: 'invalid_argument', message: 'Dokumen belum ada: ' + coll + '/' + id } };
        var old = {};
        try { old = JSON.parse(sh.getRange(row, 3, 1, 1).getValues()[0][0]); } catch (e) { old = {}; }
        merged = {};
        for (var k in old) merged[k] = old[k];
        for (var k2 in data) merged[k2] = data[k2];
      }
      var text = JSON.stringify(merged);
      if (text.length > 45000) return { error: { code: 'invalid_argument', message: 'Dokumen terlalu besar.' } };
      if (row < 0) row = Math.max(sh.getLastRow(), 1) + 1;
      var rg = sh.getRange(row, 1, 1, 4);
      rg.setNumberFormat('@'); // paksa teks supaya id tanggal tidak diubah jadi Date
      rg.setValues([[coll, id, text, now]]);
    }
    naik_();
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/* ---------- pembaca dokumen (Claude) ---------- */
function tanya_(a) {
  var key = prop_('ANTHROPIC_API_KEY');
  if (!key) return { error: { code: 'unavailable', message: 'Kunci API Anthropic belum diisi di Script properties.' } };
  var prompt = String(a.prompt || '');
  var images = Array.isArray(a.images) ? a.images.slice(0, 3) : [];
  if (!prompt || prompt.length > 200000) return { error: { code: 'invalid_argument', message: 'Teks kosong atau terlalu panjang.' } };
  for (var i = 0; i < images.length; i++) {
    if (!images[i] || typeof images[i].data !== 'string' || images[i].data.length > 6000000) return { error: { code: 'image_rejected', message: 'Gambar terlalu besar.' } };
  }
  // batas pemakaian per hari, supaya biaya API tidak tak terkendali
  var P = PropertiesService.getScriptProperties();
  var hari = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd');
  var maks = parseInt(prop_('MAKS_BACA_PER_HARI') || '100', 10);
  var cur = (P.getProperty('BACA_HARI') || '').split(':');
  var n = cur[0] === hari ? parseInt(cur[1] || '0', 10) : 0;
  if (n >= maks) return { error: { code: 'rate_limited', message: 'Batas pembacaan dokumen hari ini sudah tercapai (' + maks + ').' } };
  var content = [];
  for (var j = 0; j < images.length; j++) content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: images[j].data } });
  content.push({ type: 'text', text: prompt });
  var res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify({ model: prop_('CLAUDE_MODEL') || 'claude-sonnet-5-5', max_tokens: 4096, messages: [{ role: 'user', content: content }] }),
    muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  if (code === 429) return { error: { code: 'rate_limited', message: 'Batas pemakaian Anthropic tercapai. Coba lagi nanti.' } };
  if (code !== 200) { Logger.log('anthropic ' + code + ' ' + res.getContentText().slice(0, 500)); return { error: { code: 'upstream_error', message: 'Layanan pembaca dokumen gagal (kode ' + code + ').' } }; }
  P.setProperty('BACA_HARI', hari + ':' + (n + 1));
  var out = JSON.parse(res.getContentText()), text = '';
  var parts = out.content || [];
  for (var p = 0; p < parts.length; p++) if (parts[p].type === 'text') text += (text ? '\n' : '') + parts[p].text;
  return { ok: true, text: text };
}


function doPost(e) { var r; try { var b = JSON.parse((e && e.postData && e.postData.contents) || '{}'); r = api(b.kode, b.op, b.args); } catch (x) { r = { error: { code: 'invalid_argument', message: 'Permintaan tidak terbaca.' } }; } return ContentService.createTextOutput(JSON.stringify(r)).setMimeType(ContentService.MimeType.JSON); }