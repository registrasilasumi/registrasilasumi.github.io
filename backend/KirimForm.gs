/**
 * Kirim laporan harian ke Google Form lewat server, supaya hasilnya bisa dipastikan.
 * Browser tidak boleh membaca balasan Google (CORS); Apps Script boleh.
 *
 * Pasang: tambahkan berkas ini ke proyek Apps Script, lalu di Kode.gs, di dalam fungsi api(),
 * tepat sebelum baris `if (op === 'set' || op === 'update' || ...`, tambahkan:
 *
 *   if (op === 'kirimform') return role === 'editor' ? kirimForm_(args) : { error: { code: 'not_granted', message: 'Hanya editor yang bisa mengirim laporan.' } };
 *
 * Lalu Deploy > Manage deployments > Edit > Version: New version > Deploy (alamat /exec tetap sama).
 */

// Hanya form ini yang boleh dikirimi, supaya API tidak bisa dipakai mengirim ke form lain.
var FORM_LAPORAN_ = {
  over: '1FAIpQLSfPgO7nVVUWnsfxpvdf62NaT8gJhqEzhmQGAwnESVGXL7UdgA',
  tahanan: '1FAIpQLSeLI5Da-3D4Lbivm5L0QmcaVCJzxLZjhTc_O8GcudqFN1YPNw',
  pidsus: '1FAIpQLSc7Oi7q2ILGA85fsAGbtwmOPU95lRNjUlME6LxrFxgkSeySyQ'
};

function kirimForm_(a) {
  var id = FORM_LAPORAN_[String(a.form || '')];
  if (!id) return { error: { code: 'invalid_argument', message: 'Form tidak dikenal.' } };
  var f = a.fields || {}, payload = {}, n = 0;
  for (var k in f) {
    if (!/^entry\.\d{1,12}(_year|_month|_day)?$/.test(k)) return { error: { code: 'invalid_argument', message: 'Nama isian tidak valid.' } };
    var v = String(f[k]);
    if (v.length > 200) return { error: { code: 'invalid_argument', message: 'Isian terlalu panjang.' } };
    payload[k] = v; n++;
  }
  if (!n || n > 60) return { error: { code: 'invalid_argument', message: 'Jumlah isian tidak wajar.' } };
  var hal = parseInt(a.hal, 10) || 0;
  var hist = []; for (var i = 0; i <= Math.min(hal, 10); i++) hist.push(i);
  payload.pageHistory = hist.join(',');
  var res = UrlFetchApp.fetch('https://docs.google.com/forms/d/e/' + id + '/formResponse', {
    method: 'post', payload: payload, followRedirects: true, muteHttpExceptions: true
  });
  var code = res.getResponseCode(), body = res.getContentText();
  // Halaman konfirmasi Google memuat teks ini (Indonesia atau Inggris).
  var oke = code === 200 && /telah direkam|has been recorded|ViewResponseConfirmationMessage/i.test(body);
  if (oke) return { ok: true, terkirim: true };
  Logger.log('kirimform ' + a.form + ' http ' + code + ' ' + body.slice(0, 300).replace(/\s+/g, ' '));
  var msg = code === 200 ? 'Google menolak isiannya (mungkin ada pertanyaan wajib yang kosong atau form berubah).' : 'Google membalas kode ' + code + '.';
  return { error: { code: 'upstream_error', message: msg } };
}
