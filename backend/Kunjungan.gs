/**
 * Pendaftaran kunjungan online (MVP) - berkas tambahan untuk proyek Apps Script "Registrasi Lapas Sukamiskin".
 *
 * Pemasangan:
 *  1. Tambahkan berkas ini sebagai Kunjungan.gs di proyek Apps Script.
 *  2. Di Kode.gs, pada awal doPost setelah JSON.parse, tambahkan satu baris:
 *       if (String(b.op || '').indexOf('kj.') === 0) r = kunjungan_(b); else
 *     (lihat backend/Kode.kunjungan.diff).
 *  3. Isi Script property KODE_KUNJUNGAN (kode akses petugas kunjungan). Editor juga bisa masuk.
 *  4. Jalankan kjSiapkan() sekali dari editor (membuat sheet, garam NIK, dan pemicu hapus otomatis harian).
 *  5. Terapkan > Kelola deployment > edit > Versi baru (URL tetap).
 *
 * Data pendaftaran ada di sheet 'kunjungan' (terpisah dari 'docs'), jadi tidak ikut snapshot situs utama.
 * NIK tidak pernah disimpan utuh: hanya HMAC-SHA256 (dengan garam rahasia) dan 4 digit terakhir.
 */

var KJ_KOLOM = ['kode', 'tgl', 'no', 'layanan', 'wbp_reg', 'wbp_nama', 'relasi', 'nama', 'hp', 'nik_h', 'nik4', 'pengikut', 'status', 'dibuat', 'hadir_at', 'petugas'];
var KJ_LAYANAN = { tatap: { nama: 'Kunjungan tatap muka', awal: 'A' }, titip: { nama: 'Penitipan barang', awal: 'B' } };
var KJ_BAWAAN = {
  hari: [1, 2, 3, 4, 5, 6],          // 0 = Minggu ... 6 = Sabtu
  kuota: { tatap: 150, titip: 100 },  // kuota bawaan per tanggal
  kuotaTgl: {},                       // { 'yyyy-MM-dd': { tatap: n, titip: n } }
  libur: [],                          // ['yyyy-MM-dd']
  hariDepan: 7,                       // berapa hari ke depan bisa didaftar
  tutupJam: '12:00',                  // pendaftaran untuk HARI INI ditutup setelah jam ini (WIB)
  relasi: ['Orang tua', 'Suami/Istri', 'Anak', 'Saudara kandung', 'Keluarga lain', 'Kuasa hukum', 'Teman'],
  maksPengikut: 3,
  nik: 'hash',                        // 'hash' = NIK wajib, disimpan tersandi; 'off' = NIK tidak diminta
  simpanHari: 30,                     // data dihapus otomatis setelah sekian hari
  info: 'Bawa KTP asli. Datang sesuai tanggal dan tunjukkan QR ke petugas.'
};
var KJ_TZ = 'Asia/Jakarta';

/* ---------- pintu masuk ---------- */
function kunjungan_(b) {
  try {
    var op = String(b.op || ''), a = b.args || {};
    // operasi publik (tanpa kode akses)
    if (op === 'kj.info') return kjInfo_();
    if (op === 'kj.wbp') return kjCariWbp_(a);
    if (op === 'kj.daftar') return kjDaftar_(a);
    if (op === 'kj.tiket') return kjTiket_(a);
    // operasi petugas
    var who = kjPetugas_(b.kode);
    if (!who) return { error: { code: 'login_failed', message: 'Kode akses salah.' } };
    if (op === 'kj.login') return { ok: true, role: who };
    if (op === 'kj.list') return kjList_(a);
    if (op === 'kj.cari') return kjCari_(a);
    if (op === 'kj.hadir') return kjHadir_(a, who);
    if (op === 'kj.conf') return { ok: true, conf: kjConf_() };
    if (op === 'kj.confset') return kjConfSet_(a);
    return { error: { code: 'invalid_argument', message: 'Operasi tidak dikenal.' } };
  } catch (e) {
    return { error: { code: 'unavailable', message: String((e && e.message) || e) } };
  }
}

/* ---------- pengaturan ---------- */
function kjConf_() {
  var c = {}, raw = prop_('KJ_CONF'), s = {};
  try { s = raw ? JSON.parse(raw) : {}; } catch (e) { s = {}; }
  for (var k in KJ_BAWAAN) c[k] = s[k] !== undefined ? s[k] : KJ_BAWAAN[k];
  return c;
}

function kjConfSet_(a) {
  var c = kjConf_(), x = a.conf || {};
  function tglOk(t) { return /^\d{4}-\d{2}-\d{2}$/.test(String(t)); }
  function n(v, max) { v = parseInt(v, 10); return v >= 0 && v <= max ? v : null; }
  if (Array.isArray(x.hari)) c.hari = x.hari.map(Number).filter(function (d) { return d >= 0 && d <= 6; });
  if (x.kuota) { var kt = n(x.kuota.tatap, 2000), kp = n(x.kuota.titip, 2000); if (kt !== null) c.kuota.tatap = kt; if (kp !== null) c.kuota.titip = kp; }
  if (x.kuotaTgl && typeof x.kuotaTgl === 'object') {
    var o = {};
    Object.keys(x.kuotaTgl).forEach(function (t) {
      var v = x.kuotaTgl[t] || {}; if (!tglOk(t)) return;
      var a1 = n(v.tatap, 2000), a2 = n(v.titip, 2000);
      if (a1 !== null || a2 !== null) o[t] = { tatap: a1 !== null ? a1 : c.kuota.tatap, titip: a2 !== null ? a2 : c.kuota.titip };
    });
    c.kuotaTgl = o;
  }
  if (Array.isArray(x.libur)) c.libur = x.libur.filter(tglOk).slice(0, 200);
  if (n(x.hariDepan, 30) !== null && x.hariDepan > 0) c.hariDepan = n(x.hariDepan, 30);
  if (/^\d{2}:\d{2}$/.test(String(x.tutupJam || ''))) c.tutupJam = x.tutupJam;
  if (Array.isArray(x.relasi)) { var r = x.relasi.map(function (s) { return String(s).trim().slice(0, 40); }).filter(Boolean).slice(0, 20); if (r.length) c.relasi = r; }
  if (n(x.maksPengikut, 10) !== null) c.maksPengikut = n(x.maksPengikut, 10);
  if (x.nik === 'hash' || x.nik === 'off') c.nik = x.nik;
  if (n(x.simpanHari, 365) !== null && x.simpanHari >= 7) c.simpanHari = n(x.simpanHari, 365);
  if (typeof x.info === 'string') c.info = x.info.slice(0, 500);
  // buang kuota tanggal yang sudah lewat
  var hari = kjHari_(0);
  Object.keys(c.kuotaTgl).forEach(function (t) { if (t < hari) delete c.kuotaTgl[t]; });
  PropertiesService.getScriptProperties().setProperty('KJ_CONF', JSON.stringify(c));
  return { ok: true, conf: c };
}

/* ---------- bantu ---------- */
function kjHari_(plus) { return Utilities.formatDate(new Date(Date.now() + plus * 86400000), KJ_TZ, 'yyyy-MM-dd'); }
function kjJam_() { return Utilities.formatDate(new Date(), KJ_TZ, 'HH:mm'); }
function kjDow_(t) { var p = t.split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay(); }

function kjSheet_() {
  var ss = SpreadsheetApp.openById(prop_('SHEET_ID'));
  var sh = ss.getSheetByName('kunjungan');
  if (!sh) {
    sh = ss.insertSheet('kunjungan');
    sh.getRange(1, 1, 1, KJ_KOLOM.length).setValues([KJ_KOLOM]);
    sh.setFrozenRows(1);
    sh.getRange('A:P').setNumberFormat('@');
  }
  return sh;
}

function kjBaca_() {
  var sh = kjSheet_(), last = sh.getLastRow();
  if (last < 2) return [];
  var v = sh.getRange(2, 1, last - 1, KJ_KOLOM.length).getValues(), out = [];
  for (var i = 0; i < v.length; i++) {
    if (!v[i][0]) continue;
    var o = { _row: i + 2 };
    for (var j = 0; j < KJ_KOLOM.length; j++) o[KJ_KOLOM[j]] = kunci_(v[i][j]);
    o.no = parseInt(o.no, 10) || 0;
    o.pengikut = parseInt(o.pengikut, 10) || 0;
    out.push(o);
  }
  return out;
}

function kjNik_(nik) {
  var garam = prop_('KJ_SALT');
  if (!garam) throw new Error('Jalankan kjSiapkan() dulu dari editor Apps Script.');
  var b = Utilities.computeHmacSha256Signature(String(nik), garam);
  return Utilities.base64EncodeWebSafe(b).slice(0, 32);
}

function kjHp_(hp) {
  hp = String(hp || '').replace(/[\s\-().]/g, '');
  if (/^\+?62/.test(hp)) hp = '0' + hp.replace(/^\+?62/, '');
  return /^08\d{7,12}$/.test(hp) ? hp : '';
}

function kjNoTampil_(r) { return (KJ_LAYANAN[r.layanan] ? KJ_LAYANAN[r.layanan].awal : '') + ('00' + r.no).slice(-3); }

// batas permintaan per menit untuk seluruh pengunjung (Apps Script tidak tahu alamat IP)
function kjBatas_(nama, maks) {
  var c = CacheService.getScriptCache(), k = 'kjrl_' + nama + '_' + Math.floor(Date.now() / 60000);
  var n = parseInt(c.get(k) || '0', 10);
  if (n >= maks) return false;
  c.put(k, String(n + 1), 120);
  return true;
}

function kjKuota_(c, tgl, lay) { var o = c.kuotaTgl[tgl]; return o && o[lay] != null ? o[lay] : (c.kuota[lay] || 0); }

function kjTanggal_(c, rows) {
  var hasil = [], terpakai = {};
  rows.forEach(function (r) { if (r.status !== 'batal') { var k = r.tgl + '|' + r.layanan; terpakai[k] = (terpakai[k] || 0) + 1; } });
  for (var i = 0; i <= c.hariDepan; i++) {
    var t = kjHari_(i), buka = c.hari.indexOf(kjDow_(t)) >= 0 && c.libur.indexOf(t) < 0;
    if (i === 0 && kjJam_() >= c.tutupJam) buka = false;
    var sisa = {};
    Object.keys(KJ_LAYANAN).forEach(function (l) { sisa[l] = Math.max(0, kjKuota_(c, t, l) - (terpakai[t + '|' + l] || 0)); });
    hasil.push({ tgl: t, buka: buka, sisa: sisa });
  }
  return hasil;
}

/* ---------- soal hitungan (anti bot sederhana), ditandatangani server supaya tidak perlu disimpan ---------- */
function kjSoal_() {
  var x = 2 + Math.floor(Math.random() * 8), y = 1 + Math.floor(Math.random() * 9);
  var exp = Date.now() + 30 * 60000, nonce = Utilities.getUuid().slice(0, 8);
  var isi = (x + y) + '.' + exp + '.' + nonce;
  var sig = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(isi, prop_('KJ_SALT') + ':soal')).slice(0, 22);
  // jawaban tidak dikirim terbuka: token hanya berisi exp, nonce, dan tanda tangan
  return { teks: x + ' + ' + y, token: exp + '.' + nonce + '.' + sig };
}

function kjCekSoal_(token, jawab) {
  var p = String(token || '').split('.');
  if (p.length !== 3 || !(+p[0] > Date.now())) return false;
  var isi = parseInt(jawab, 10) + '.' + p[0] + '.' + p[1];
  var sig = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(isi, prop_('KJ_SALT') + ':soal')).slice(0, 22);
  if (!sama_(sig, p[2])) return false;
  var c = CacheService.getScriptCache(), k = 'kjsoal_' + p[1];
  if (c.get(k)) return false; // token sekali pakai
  c.put(k, '1', 1900);
  return true;
}

/* ---------- daftar penghuni (dari koleksi 'master' situs utama) ---------- */
function kjPenghuni_() {
  var c = CacheService.getScriptCache(), n = parseInt(c.get('kjwbp_n') || '-1', 10);
  if (n >= 0) {
    var keys = []; for (var i = 0; i < n; i++) keys.push('kjwbp_' + i);
    var got = c.getAll(keys), parts = [];
    for (var j = 0; j < n; j++) { if (got['kjwbp_' + j] == null) { parts = null; break; } parts.push(got['kjwbp_' + j]); }
    if (parts) return JSON.parse(parts.join(''));
  }
  var list = [];
  bacaSemua_().forEach(function (d) {
    if (d.coll !== 'master' || !d.data || !d.data.rows) return;
    d.data.rows.forEach(function (r) { if (r && r.k && r.n) list.push([String(r.k), String(r.n)]); });
  });
  var s = JSON.stringify(list), size = 90000, put = {}, cnt = Math.ceil(s.length / size);
  for (var p = 0; p < cnt; p++) put['kjwbp_' + p] = s.slice(p * size, (p + 1) * size);
  put.kjwbp_n = String(cnt);
  try { c.putAll(put, 1800); } catch (e) { /* cache penuh: lewati */ }
  return list;
}

/* ---------- operasi publik ---------- */
function kjInfo_() {
  if (!kjBatas_('info', 300)) return { error: { code: 'rate_limited', message: 'Server sedang sibuk. Coba lagi sebentar.' } };
  var c = kjConf_();
  var layanan = Object.keys(KJ_LAYANAN).map(function (k) { return { id: k, nama: KJ_LAYANAN[k].nama }; });
  return { ok: true, tanggal: kjTanggal_(c, kjBaca_().filter(function (r) { return r.tgl >= kjHari_(0); })), layanan: layanan, relasi: c.relasi, maksPengikut: c.maksPengikut, nik: c.nik, info: c.info, soal: kjSoal_() };
}

function kjCariWbp_(a) {
  if (!kjBatas_('wbp', 200)) return { error: { code: 'rate_limited', message: 'Server sedang sibuk. Coba lagi sebentar.' } };
  var q = String(a.q || '').toUpperCase().replace(/[^A-Z' .]/g, '').replace(/\s+/g, ' ').trim();
  if (q.replace(/[ .']/g, '').length < 3) return { ok: true, hasil: [] };
  var kata = q.split(' ');
  var hasil = kjPenghuni_().filter(function (r) {
    var n = r[1].toUpperCase();
    for (var i = 0; i < kata.length; i++) if (n.indexOf(kata[i]) < 0) return false;
    return true;
  }).slice(0, 8);
  // hanya nama dan nomor register; blok, perkara, dan data lain tidak dibuka ke publik
  return { ok: true, hasil: hasil.map(function (r) { return { k: r[0], n: r[1] }; }) };
}

function kjDaftar_(a) {
  if (!kjBatas_('daftar', 30)) return { error: { code: 'rate_limited', message: 'Terlalu banyak pendaftaran saat ini. Coba lagi dalam satu menit.' } };
  if (a.situs) return { error: { code: 'invalid_argument', message: 'Pendaftaran ditolak.' } }; // kolom jebakan bot terisi
  if (!kjCekSoal_(a.token, a.jawab)) return { error: { code: 'captcha', message: 'Jawaban hitungan salah atau kedaluwarsa. Muat ulang soal lalu coba lagi.' } };
  var c = kjConf_();
  var tgl = String(a.tgl || ''), lay = String(a.layanan || ''), relasi = String(a.relasi || '');
  var nama = String(a.nama || '').replace(/\s+/g, ' ').trim().toUpperCase();
  var hp = kjHp_(a.hp), nik = String(a.nik || '').replace(/\D/g, ''), ikut = parseInt(a.pengikut, 10) || 0;
  var reg = String(a.wbp || '');
  if (!KJ_LAYANAN[lay]) return kjSalah_('Pilih layanan.');
  if (!/^[A-Z' .,]{3,60}$/.test(nama)) return kjSalah_('Nama pengunjung 3 sampai 60 huruf, sesuai KTP.');
  if (!hp) return kjSalah_('Nomor HP tidak valid. Contoh: 081234567890.');
  if (c.nik === 'hash' && !/^\d{16}$/.test(nik)) return kjSalah_('NIK harus 16 angka.');
  if (c.relasi.indexOf(relasi) < 0) return kjSalah_('Pilih hubungan dengan WBP.');
  if (ikut < 0 || ikut > c.maksPengikut) return kjSalah_('Jumlah pengikut paling banyak ' + c.maksPengikut + '.');
  var wbp = null, P = kjPenghuni_();
  for (var i = 0; i < P.length; i++) if (P[i][0] === reg) { wbp = P[i]; break; }
  if (!wbp) return kjSalah_('WBP tidak ditemukan. Cari dan pilih nama dari daftar.');

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var rows = kjBaca_();
    var tg = kjTanggal_(c, rows.filter(function (r) { return r.tgl >= kjHari_(0); })), slot = null;
    for (var t = 0; t < tg.length; t++) if (tg[t].tgl === tgl) slot = tg[t];
    if (!slot || !slot.buka) return kjSalah_('Tanggal itu tidak melayani pendaftaran.');
    if (slot.sisa[lay] <= 0) return kjSalah_('Kuota ' + KJ_LAYANAN[lay].nama.toLowerCase() + ' tanggal itu sudah penuh.');
    var nikH = c.nik === 'hash' ? kjNik_(nik) : '';
    var max = 0;
    for (var j = 0; j < rows.length; j++) {
      var r = rows[j];
      if (r.tgl !== tgl) continue;
      if (r.layanan === lay && r.no > max) max = r.no;
      if (r.status === 'batal' || r.layanan !== lay) continue;
      if (r.hp === hp || (nikH && r.nik_h === nikH)) return kjSalah_('Nomor HP atau NIK ini sudah terdaftar untuk ' + KJ_LAYANAN[lay].nama.toLowerCase() + ' pada tanggal itu. Kode: ' + r.kode);
    }
    var kode = kjKodeBaru_(rows);
    var baru = { kode: kode, tgl: tgl, no: max + 1, layanan: lay, wbp_reg: wbp[0], wbp_nama: wbp[1], relasi: relasi, nama: nama, hp: hp, nik_h: nikH, nik4: nik ? nik.slice(-4) : '', pengikut: ikut, status: 'daftar', dibuat: new Date().toISOString(), hadir_at: '', petugas: '' };
    var sh = kjSheet_(), row = Math.max(sh.getLastRow(), 1) + 1, rg = sh.getRange(row, 1, 1, KJ_KOLOM.length);
    rg.setNumberFormat('@');
    rg.setValues([KJ_KOLOM.map(function (k) { return String(baru[k]); })]);
    return { ok: true, tiket: kjTiketPublik_(baru) };
  } finally { lock.releaseLock(); }
}

function kjSalah_(m) { return { error: { code: 'invalid_argument', message: m } }; }

function kjKodeBaru_(rows) {
  var ada = {}; rows.forEach(function (r) { ada[r.kode] = 1; });
  var huruf = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (var n = 0; n < 50; n++) {
    var b = Utilities.getUuid().replace(/-/g, ''), s = 'KJ';
    for (var i = 0; i < 6; i++) s += huruf.charAt(parseInt(b.substr(i * 2, 2), 16) % huruf.length);
    if (!ada[s]) return s;
  }
  throw new Error('Gagal membuat kode, coba lagi.');
}

// data yang boleh dilihat pemegang tiket: tanpa HP lengkap dan tanpa NIK
function kjTiketPublik_(r) {
  return { kode: r.kode, tgl: r.tgl, no: kjNoTampil_(r), layanan: r.layanan, layananNama: KJ_LAYANAN[r.layanan] ? KJ_LAYANAN[r.layanan].nama : r.layanan, wbp: r.wbp_nama, relasi: r.relasi, nama: r.nama, pengikut: r.pengikut, status: r.status };
}

// buka ulang tiket: kode + 4 digit akhir nomor HP
function kjTiket_(a) {
  if (!kjBatas_('tiket', 60)) return { error: { code: 'rate_limited', message: 'Server sedang sibuk. Coba lagi sebentar.' } };
  var kode = String(a.kode || '').toUpperCase().trim(), hp4 = String(a.hp4 || '').replace(/\D/g, '');
  if (!/^KJ[A-Z0-9]{6}$/.test(kode) || hp4.length !== 4) return kjSalah_('Isi kode pendaftaran dan 4 angka terakhir nomor HP.');
  var rows = kjBaca_();
  for (var i = 0; i < rows.length; i++) if (rows[i].kode === kode && rows[i].hp.slice(-4) === hp4) return { ok: true, tiket: kjTiketPublik_(rows[i]) };
  return kjSalah_('Pendaftaran tidak ditemukan.');
}

/* ---------- petugas ---------- */
function kjPetugas_(kode) {
  var c = CacheService.getScriptCache(), n = parseInt(c.get('kjgagal') || '0', 10);
  if (n >= 20) throw new Error('Terlalu banyak percobaan kode yang salah. Tunggu 10 menit lalu coba lagi.');
  kode = String(kode == null ? '' : kode);
  var kj = prop_('KODE_KUNJUNGAN'), ed = prop_('KODE_EDITOR');
  var who = (kj && sama_(kode, kj)) ? 'kunjungan' : (ed && sama_(kode, ed)) ? 'editor' : null;
  if (!who) c.put('kjgagal', String(n + 1), 600);
  return who;
}

function kjPetugasRow_(r) {
  var o = kjTiketPublik_(r);
  o.hp = r.hp; o.nik4 = r.nik4; o.wbp_reg = r.wbp_reg; o.urut = r.no; o.dibuat = r.dibuat; o.hadir_at = r.hadir_at;
  return o;
}

function kjList_(a) {
  var tgl = String(a.tgl || kjHari_(0));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tgl)) return kjSalah_('Tanggal tidak valid.');
  var c = kjConf_(), rows = kjBaca_();
  var isi = rows.filter(function (r) { return r.tgl === tgl; }).sort(function (x, y) { return x.layanan === y.layanan ? x.no - y.no : (x.layanan < y.layanan ? -1 : 1); });
  var kuota = {}; Object.keys(KJ_LAYANAN).forEach(function (l) { kuota[l] = kjKuota_(c, tgl, l); });
  return { ok: true, tgl: tgl, kuota: kuota, rows: isi.map(kjPetugasRow_) };
}

function kjCari_(a) {
  var q = String(a.q || '').trim().toUpperCase();
  if (q.length < 3) return kjSalah_('Ketik minimal 3 karakter.');
  var rows = kjBaca_(), digit = q.replace(/\D/g, ''), nikH = '';
  if (/^\d{16}$/.test(digit) && prop_('KJ_SALT')) nikH = kjNik_(digit);
  var hp = kjHp_(q);
  var hasil = rows.filter(function (r) {
    if (r.kode === q) return true;
    if (nikH && r.nik_h === nikH) return true;
    if (hp && r.hp === hp) return true;
    if (/^\d{4}$/.test(q) && (r.nik4 === q || r.hp.slice(-4) === q)) return true;
    return /[A-Z]/.test(q) && (r.nama.indexOf(q) >= 0 || r.wbp_nama.indexOf(q) >= 0);
  }).sort(function (x, y) { return x.tgl < y.tgl ? 1 : x.tgl > y.tgl ? -1 : x.no - y.no; }).slice(0, 50);
  return { ok: true, rows: hasil.map(kjPetugasRow_) };
}

function kjHadir_(a, who) {
  var kode = String(a.kode || '').toUpperCase(), st = String(a.status || 'hadir');
  if (['hadir', 'daftar', 'batal'].indexOf(st) < 0) return kjSalah_('Status tidak valid.');
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var rows = kjBaca_(), r = null;
    for (var i = 0; i < rows.length; i++) if (rows[i].kode === kode) r = rows[i];
    if (!r) return kjSalah_('Kode ' + kode + ' tidak ditemukan.');
    var sh = kjSheet_();
    r.status = st; r.hadir_at = st === 'hadir' ? new Date().toISOString() : ''; r.petugas = st === 'daftar' ? '' : who;
    ['status', 'hadir_at', 'petugas'].forEach(function (k) { sh.getRange(r._row, KJ_KOLOM.indexOf(k) + 1, 1, 1).setNumberFormat('@').setValues([[r[k]]]); });
    return { ok: true, row: kjPetugasRow_(r) };
  } finally { lock.releaseLock(); }
}

/* ---------- pemasangan dan hapus otomatis ---------- */
function kjSiapkan() {
  var P = PropertiesService.getScriptProperties();
  if (!P.getProperty('KJ_SALT')) P.setProperty('KJ_SALT', Utilities.getUuid() + Utilities.getUuid());
  kjSheet_();
  var ada = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'kjBersihkan'; });
  if (!ada) ScriptApp.newTrigger('kjBersihkan').timeBased().everyDays(1).atHour(1).inTimezone(KJ_TZ).create();
  if (!P.getProperty('KODE_KUNJUNGAN')) Logger.log('LANGKAH BERIKUT: isi KODE_KUNJUNGAN di Project Settings > Script properties.');
  Logger.log('Pendaftaran kunjungan siap.');
}

function kjBersihkan() {
  var c = kjConf_(), batas = kjHari_(-c.simpanHari);
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sh = kjSheet_(), rows = kjBaca_();
    for (var i = rows.length - 1; i >= 0; i--) if (rows[i].tgl < batas) sh.deleteRow(rows[i]._row);
  } finally { lock.releaseLock(); }
}
