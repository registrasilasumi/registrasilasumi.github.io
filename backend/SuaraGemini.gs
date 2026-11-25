/**
 * Suara panggilan antrian kunjungan memakai Gemini TTS (Google AI Studio).
 *
 * Pasang:
 * 1. Di Apps Script "Registrasi Lapas Sukamiskin", tambah file baru bernama SuaraGemini, tempel isi file ini.
 * 2. Di Kode.gs, fungsi api(), tepat di bawah baris  if (op === 'ver') ...  tambahkan satu baris:
 *        if (op === 'tts') return suaraGemini_(args);
 * 3. Project Settings > Script properties > tambah GEMINI_API_KEY (buat di https://aistudio.google.com/apikey).
 *    Opsional: GEMINI_TTS_MODEL (bawaan gemini-3.8-flash-tts), MAKS_SUARA_PER_HARI (bawaan 600).
 * 4. Deploy > Manage deployments > edit > Version: New version > Deploy (alamat /exec tetap sama).
 *
 * Kunci API hanya ada di Script properties, tidak pernah dikirim ke browser.
 * Hasil: audio PCM 16-bit mono 24 kHz dalam base64; halaman kunjungan.html membungkusnya jadi WAV.
 */

function suaraGemini_(a) {
  a = a || {};
  var key = prop_('GEMINI_API_KEY');
  if (!key) return { error: { code: 'unavailable', message: 'GEMINI_API_KEY belum diisi di Script properties.' } };
  var text = String(a.text || '').trim();
  if (!text || text.length > 600) return { error: { code: 'invalid_argument', message: 'Teks panggilan kosong atau terlalu panjang.' } };
  var voice = /^[A-Za-z]{2,24}$/.test(String(a.voice || '')) ? String(a.voice) : 'Nyla';   // nama suara di AI Studio, mis. Nyla, Fola, Enya
  var gaya = String(a.gaya || 'Bacakan pengumuman resmi petugas lembaga pemasyarakatan berikut dalam bahasa Indonesia: formal, tegas, jelas, tempo tenang, intonasi datar profesional, tanpa terdengar akrab atau ceria').slice(0, 300);

  // simpan hasil di cache 6 jam supaya teks yang sama (mis. tombol Ulangi) tidak memakai kuota lagi
  var ck = 'tts:' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, voice + '|' + gaya + '|' + text, Utilities.Charset.UTF_8));
  var cache = CacheService.getScriptCache();
  var hit = cacheAmbil_(cache, ck);
  if (hit) return { ok: true, audio: hit, rate: 24000, cache: true };

  var P = PropertiesService.getScriptProperties();
  var hari = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd');
  var maks = parseInt(prop_('MAKS_SUARA_PER_HARI') || '600', 10);
  var cur = (P.getProperty('SUARA_HARI') || '').split(':');
  var n = cur[0] === hari ? parseInt(cur[1] || '0', 10) : 0;
  if (n >= maks) return { error: { code: 'rate_limited', message: 'Batas suara Gemini hari ini tercapai (' + maks + ').' } };

  var model = prop_('GEMINI_TTS_MODEL') || 'gemini-3.8-flash-tts';
  var res = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-goog-api-key': key },
    payload: JSON.stringify({
      contents: [{ parts: [{ text: gaya + '.\n\n## Transcript:\n' + text }] }],
      generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } }
    }),
    muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  if (code === 429) return { error: { code: 'rate_limited', message: 'Kuota Gemini sedang habis. Coba lagi sebentar.' } };
  if (code !== 200) { Logger.log('gemini ' + code + ' ' + res.getContentText().slice(0, 500)); return { error: { code: 'upstream_error', message: 'Suara Gemini gagal (kode ' + code + ').' } }; }
  var out = JSON.parse(res.getContentText());
  var parts = (((out.candidates || [])[0] || {}).content || {}).parts || [];
  var audio = '';
  for (var i = 0; i < parts.length; i++) if (parts[i].inlineData && parts[i].inlineData.data) { audio = parts[i].inlineData.data; break; }
  if (!audio) return { error: { code: 'upstream_error', message: 'Gemini tidak mengirim audio.' } };
  P.setProperty('SUARA_HARI', hari + ':' + (n + 1));
  cacheSimpan_(cache, ck, audio);
  return { ok: true, audio: audio, rate: 24000 };
}

/* CacheService maksimal 100 KB per kunci, jadi audio dipecah */
function cacheSimpan_(cache, ck, s) {
  try {
    var size = 90000, n = Math.ceil(s.length / size), m = {};
    if (n > 20) return;
    for (var i = 0; i < n; i++) m[ck + ':' + i] = s.slice(i * size, (i + 1) * size);
    m[ck] = String(n);
    cache.putAll(m, 21600);
  } catch (e) {}
}
function cacheAmbil_(cache, ck) {
  try {
    var n = parseInt(cache.get(ck) || '0', 10);
    if (!n) return '';
    var ks = [];
    for (var i = 0; i < n; i++) ks.push(ck + ':' + i);
    var g = cache.getAll(ks), s = '';
    for (var j = 0; j < n; j++) { if (!g[ks[j]]) return ''; s += g[ks[j]]; }
    return s;
  } catch (e) { return ''; }
}

/* Jalankan dari editor untuk mencoba: lihat Execution log */
function cobaSuaraGemini() {
  var r = suaraGemini_({ text: 'Nomor antrian, 3. Atas nama, Budi Santoso. Dipersilakan menuju ruang kunjungan. Terima kasih.' });
  Logger.log(r.error ? r.error.message : 'OK, audio ' + r.audio.length + ' karakter base64');
}
