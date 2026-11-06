/* Isi template berkas pengeluaran sidang (template-sidang.docx) memakai JSZip */
(function (root) {
  var BLN = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  var HR = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
  function pi(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? { y: +m[1], m: +m[2], d: +m[3] } : null; }
  function tgl(iso) { var p = pi(iso); return p ? p.d + ' ' + BLN[p.m - 1] + ' ' + p.y : ''; }
  function hari(iso) { var p = pi(iso); return p ? HR[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()] : ''; }
  function tg(x) { return pi(x) ? tgl(x) : (x || ''); }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  /* d: isian form. photo: Uint8Array JPEG (opsional). Mengembalikan Promise<Uint8Array> */
  function isi(JSZip, templateBytes, d, photo) {
    var pk = /peninjauan/i.test(d.agenda);
    var n = +d.nomorAwal, pre = 'WP.11.PAS.2-PK.02.02-';
    var pidanaLine = d.pidana + (d.denda ? ', Denda Rp. ' + d.denda + (d.subsider ? '    Sub Kurungan: ' + d.subsider : '') : '') + (d.up ? ', Uang Pengganti Rp. ' + d.up + (d.upSub ? '    Sub Kurungan: ' + d.upSub : '') : '');
    var V = {
      NO_SK: pre + n, NO_PENG: pre + (n + 1), NO_BA: pre + (n + 2),
      TGL_SURAT: tgl(d.tanggal), TGL: tgl(d.tanggal), HARI: hari(d.tanggal),
      AGENDA: d.agenda, AGENDA_UP: d.agenda.toUpperCase(), AGENDA_PENDEK: d.agenda.replace('Sidang Peninjauan Kembali', 'Sidang PK'),
      NAMA: d.nama, NOREG: d.noreg, PERKARA: d.perkara, PERKARA_BA: d.perkaraBA || d.perkara,
      PUTUSAN: d.putusanNo, TGL_PUTUSAN: tg(d.putusanTgl), PIDANA_LINE: pidanaLine, PIDANA_BA: d.pidanaBA || d.pidana,
      EKSP: d.ekspirasi, TGL_DITAHAN: tg(d.tglDitahan), UMUR: d.umur, JK: d.jk,
      KOTA_PN: d.kotaPN, KOTA_DI: d.kotaDi || d.kotaPN, ALAMAT_PN: d.alamatPN,
      SURAT_PN: d.suratPN, SURAT_NO: d.suratNo, SURAT_TGL: tgl(d.suratTgl),
      JAM_BERANGKAT: d.jamBerangkat, JAM_SIDANG: d.jamSidang, KEPALA: d.kepala,
      TPP_NO: d.tppNo || '[ISI NOMOR SIDANG TPP]', TPP_TGL: d.tppTgl ? tgl(d.tppTgl) : '[ISI TANGGAL SIDANG TPP]'
    };
    return JSZip.loadAsync(templateBytes).then(function (z) {
      return z.file('word/document.xml').async('string').then(function (xml) {
        xml = xml.replace(/\{\{([A-Z_]+)\}\}/g, function (m, k) { return V[k] != null ? esc(V[k]) : m; });
        z.file('word/document.xml', xml);
        if (photo) z.file('word/media/image3.jpeg', photo);
        return z.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
      });
    });
  }
  root.BerkasSidang = { isi: isi, tgl: tgl, hari: hari };
})(typeof window !== 'undefined' ? window : globalThis);

/* Isi template Surat Lepas (surat-lepas-bebas.docx / surat-lepas-pb.docx) */
(function (root) {
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  /* d: {NAMA, NO_REG, ...} sesuai penanda {{...}} di template. Mengembalikan Promise<Uint8Array> */
  /* foto: Uint8Array PNG, atau {bytes, w, h} (ukuran asli foto). Foto dimuat penuh, tidak dipotong:
     kotak foto di surat disesuaikan dengan rasio foto, rata kanan dan atas. */
  function sesuaikan(xml, rid, w, h) {
    return xml.replace(/<wp:anchor\b[\s\S]*?<\/wp:anchor>/g, function (a) {
      if (a.indexOf('r:embed="' + rid + '"') < 0) return a;
      var m = a.match(/<wp:extent cx="(\d+)" cy="(\d+)"\/>/); if (!m) return a;
      var cx = +m[1], cy = +m[2], r = w / h, nx, ny;
      if (r >= cx / cy) { nx = cx; ny = Math.round(cx / r); } else { ny = cy; nx = Math.round(cy * r); }
      a = a.replace(/(<wp:extent cx=")\d+(" cy=")\d+/, '$1' + nx + '$2' + ny).replace(/(<a:ext cx=")\d+(" cy=")\d+/, '$1' + nx + '$2' + ny);
      return a.replace(/(<wp:positionH[^>]*><wp:posOffset>)(-?\d+)/, function (q, pre, v) { return pre + (+v + cx - nx); });
    });
  }
  function isi(JSZip, bytes, d, foto) {
    return JSZip.loadAsync(bytes).then(function (z) {
      return z.file('word/document.xml').async('string').then(function (xml) {
        /* pengadilan kosong: hapus barisnya supaya tidak ada jarak kosong */
        if (!d.PN) {
          var guard = 0, i;
          while ((i = xml.indexOf('{{PN}}')) >= 0 && guard++ < 10) {
            var a = Math.max(xml.lastIndexOf('<w:p ', i), xml.lastIndexOf('<w:p>', i)), b = xml.indexOf('</w:p>', i) + 6;
            xml = xml.slice(0, a) + xml.slice(b);
          }
        }
        xml = xml.replace(/\{\{([A-Z_]+)\}\}/g, function (m, k) { return d[k] != null ? esc(d[k]) : m; });
        if (foto) {
          var bytesF = foto.bytes || foto;
          if (foto.w && foto.h) { xml = sesuaikan(xml, 'rId5', foto.w, foto.h); xml = sesuaikan(xml, 'rId7', foto.w, foto.h); }
          z.file('word/media/image1.png', bytesF); z.file('word/media/image3.png', bytesF);
        }
        z.file('word/document.xml', xml);
        return z.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
      });
    });
  }
  root.BerkasLepas = { isi: isi };
})(typeof window !== 'undefined' ? window : globalThis);
