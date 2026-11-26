/* Formulir Bukti Pendaftaran Online (cetak A4 / A5), dipakai daftar.html (pengunjung) dan petugas.html.
   Butuh: qrcode-generator (global qrcode). Logo diambil dari index.html seperti halaman Kunjungan dan Mode TV.
   Pemakaian: Formulir.cetak(tiket, fotoBase64, 'A5' | 'A4') */
(function (root) {
  'use strict';
  var HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', "Jum'at", 'Sabtu'];
  var BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  var logos = null;

  var CSS = '#cetak{display:none}' +
    '#cetak .slip{font-family:"Times New Roman",Times,serif;color:#000;line-height:1.3}' +
    '#cetak .slip.a5{font-size:7.6pt}#cetak .a5 .kop img{width:4em;height:4em}#cetak .a5 td{padding:.18em .5em}#cetak .a5 h2{margin:.7em 0 .2em}#cetak .a5 h1{margin-top:.6em}#cetak .a5 .ttd{margin-top:.6em}#cetak .a5 .ttd .sp{height:2.4em}#cetak .a5 td.ft img{max-width:7em}#cetak .a5 .ft2{margin-top:.8em}#cetak .slip.a4{font-size:11.5pt}' +
    '#cetak .kop{display:grid;grid-template-columns:5em 1fr 5em;gap:.6em;align-items:center;text-align:center;border-bottom:.35em solid #000;padding-bottom:.6em}' +
    '#cetak .kop img{width:4.8em;height:4.8em;object-fit:contain;display:block;margin:auto}' +
    '#cetak .kop .t{text-transform:uppercase;font-size:.9em}#cetak .kop .t b{display:block;font-size:1.1em}#cetak .kop .a{font-size:.75em;text-transform:none}' +
    '#cetak h1{font-size:1.1em;text-align:center;margin-top:1em;text-transform:uppercase;font-weight:700}#cetak h1 u{display:block;margin-top:.15em}' +
    '#cetak h2{font-family:Arial,Helvetica,sans-serif;font-size:.95em;font-weight:700;margin:1em 0 .3em;text-transform:uppercase}' +
    '#cetak table{width:100%;border-collapse:collapse}' +
    '#cetak td{border:.07em solid #000;padding:.28em .5em;vertical-align:middle}' +
    '#cetak td.k{width:28%}#cetak td.c{width:2.4%;text-align:center;padding:0}' +
    '#cetak td.qr{width:27%;text-align:center;padding:.4em;font-family:monospace;font-size:.62em;word-break:break-all}' +
    '#cetak td.qr canvas{width:100%;height:auto;max-width:11em;display:block;margin:0 auto .3em;image-rendering:pixelated}' +
    '#cetak td.ft{text-align:center;padding:.4em}#cetak td.ft img{width:100%;max-width:8.6em;aspect-ratio:3/4;object-fit:cover;display:block;margin:0 auto;border:.07em solid #000}' +
    '#cetak .no{font-weight:700;font-size:1.3em}' +
    '#cetak .pk b{display:block;margin-bottom:.15em}#cetak .pk span{display:inline-block;width:11em}' +
    '#cetak .ttd{display:flex;justify-content:space-between;margin:1.2em 1em 0;text-align:center}#cetak .ttd>div{width:42%}#cetak .ttd .sp{height:3.6em}' +
    '#cetak .ft2{margin-top:1.4em;text-align:center;font-style:italic;font-size:.8em}' +
    '@media print{body{background:#fff!important}body>*:not(#cetak){display:none!important}#cetak{display:block}}';

  function css() {
    if (document.getElementById('formulir-css')) return;
    var s = document.createElement('style'); s.id = 'formulir-css'; s.textContent = CSS; document.head.appendChild(s);
  }
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    for (var k in attrs || {}) { if (k === 'text') e.textContent = attrs[k]; else if (attrs[k] != null) e.setAttribute(k, attrs[k]); }
    [].concat(kids || []).forEach(function (c) { if (c != null) e.append(c); });
    return e;
  }
  function tglID(t) { var p = t.split('-'), d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); return HARI[d.getUTCDay()] + ', ' + (+p[2]) + ' ' + BULAN[+p[1] - 1] + ' ' + p[0]; }
  function qrCanvas(text) {
    var q = root.qrcode(0, 'M'); q.addData(text); q.make();
    var n = q.getModuleCount(), px = 8, pad = 2, c = document.createElement('canvas');
    c.width = c.height = (n + pad * 2) * px;
    var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.fillStyle = '#000';
    for (var r = 0; r < n; r++) for (var k = 0; k < n; k++) if (q.isDark(r, k)) x.fillRect((k + pad) * px, (r + pad) * px, px, px);
    return c;
  }
  function muatLogo() {
    if (logos) return Promise.resolve(logos);
    return fetch('index.html', { credentials: 'omit' }).then(function (r) { return r.text(); }).then(function (t) {
      logos = {};
      ['k', 'l'].forEach(function (n) { var m = new RegExp('--logo-' + n + ':url\\((data:image/[a-z]+;base64,[A-Za-z0-9+/=]+)\\)').exec(t); if (m) logos[n] = m[1]; });
      return logos;
    }).catch(function () { logos = {}; return logos; });
  }

  function bangun(r, foto, ukuran) {
    function baris(k, v, kls) { return el('tr', null, [el('td', { class: 'k', text: k }), el('td', { class: 'c', text: ':' }), el('td', { class: kls || '', text: v })]); }
    var rows = [
      baris('Kode Pendaftaran', r.kode), baris('No. Antrian', r.no, 'no'), baris('Tgl. Kunjungan', tglID(r.tgl)), baris('Nama', r.nama),
      baris('No. Identitas', r.nik || (r.nik4 ? '************' + r.nik4 : '-')), baris('Hubungan Keluarga', r.relasi),
      baris('Jenis Kelamin', r.jk === 'P' ? 'Perempuan' : r.jk === 'L' ? 'Laki-Laki' : '-'), baris('No HP', r.hp || '-'), baris('Alamat', r.alamat || '-'),
      el('tr', null, el('td', { colspan: '3', class: 'pk' }, [el('b', { text: 'Jumlah Pengikut' }),
        el('div', null, [el('span', { text: 'Laki-Laki (Dewasa)' }), '= ' + (r.pl || 0) + ' Orang']),
        el('div', null, [el('span', { text: 'Perempuan (Dewasa)' }), '= ' + (r.pp || 0) + ' Orang']),
        el('div', null, [el('span', { text: 'Anak-Anak' }), '= ' + (r.pa || 0) + ' Orang'])]))
    ];
    rows[0].append(el('td', { class: 'qr', rowspan: '6' }, [qrCanvas(r.kode), r.kode]));
    rows[6].append(el('td', { class: 'ft', rowspan: '4' }, foto ? el('img', { src: 'data:image/jpeg;base64,' + foto, alt: 'Foto pengunjung' }) : el('div', { text: 'Foto' })));
    var layanan = String(r.layananNama || '').toUpperCase();
    return el('div', { class: 'slip ' + (ukuran === 'A4' ? 'a4' : 'a5') }, [
      el('div', { class: 'kop' }, [
        logos.k ? el('img', { src: logos.k, alt: '' }) : el('span'),
        el('div', { class: 't' }, [el('div', { text: 'Kementerian Imigrasi dan Pemasyarakatan RI' }), el('div', { text: 'Direktorat Jenderal Pemasyarakatan' }), el('div', { text: 'Kantor Wilayah Dirjenpas Jawa Barat' }),
          el('b', { text: 'Lembaga Pemasyarakatan Kelas I Sukamiskin' }), el('div', { class: 'a', text: 'Jl. A.H. Nasution No. 114, Cisaranten Kidul, Gedebage, Kota Bandung, Jawa Barat' })]),
        logos.l ? el('img', { src: logos.l, alt: '' }) : el('span')
      ]),
      el('h1', null, ['Formulir Bukti Pendaftaran Online', el('u', { text: 'Layanan ' + layanan })]),
      el('h2', { text: 'A. Identitas Pengunjung' }), el('table', null, el('tbody', null, rows)),
      el('h2', { text: 'B. Identitas WBP' }), el('table', null, el('tbody', null, baris('Nama / Kamar', r.wbp + (r.blok ? ' / ' + r.blok : '')))),
      el('h2', { text: 'C. Daftar Barang Bawaan dan Jumlah Makanan' }), el('table', null, el('tbody', null, el('tr', null, el('td', { text: r.barang || '-' })))),
      el('div', { class: 'ttd' }, [
        el('div', null, [el('div', { text: ' ' }), el('b', { text: 'Petugas Layanan' }), el('div', { class: 'sp' }), el('div', { text: '-----------------------------' })]),
        el('div', null, [el('div', { text: 'Bandung, ' + tglID(r.tgl) }), el('b', { text: 'Pengunjung' }), el('div', { class: 'sp' }), el('div', { text: r.nama })])
      ]),
      el('div', { class: 'ft2', text: 'Auto Generated by Lapas Sukamiskin Apps. Tunjukkan QR dan KTP asli kepada petugas.' })
    ]);
  }

  root.Formulir = {
    cetak: function (tiket, foto, ukuran) {
      css();
      if (typeof root.qrcode !== 'function') return Promise.reject(new Error('Pembuat QR belum termuat. Periksa koneksi lalu coba lagi.'));
      return muatLogo().then(function () {
        var box = document.getElementById('cetak');
        if (!box) { box = el('div', { id: 'cetak', 'aria-hidden': 'true' }); document.body.append(box); }
        box.textContent = '';
        box.append(bangun(tiket, foto || '', ukuran));
        var st = document.getElementById('formulir-page') || el('style', { id: 'formulir-page' });
        st.textContent = '@page{size:' + (ukuran === 'A4' ? 'A4' : 'A5') + ' portrait;margin:' + (ukuran === 'A4' ? '14mm' : '7mm') + '}';
        document.head.append(st);
        return new Promise(function (ok) { setTimeout(function () { root.print(); ok(); }, 250); });
      });
    }
  };
})(window);
