/* Tema terang / gelap / otomatis untuk halaman pendaftaran kunjungan.
   Memakai kunci localStorage 'tema' yang sama dengan dashboard, jadi pilihan ikut terbawa.
   Muat di <head> supaya tema terpasang sebelum halaman tergambar (tanpa kedip). */
(function (root) {
  'use strict';
  function baca() { try { return root.localStorage.getItem('tema') || 'auto'; } catch (e) { return 'auto'; } }
  function pasang(v) {
    var r = document.documentElement;
    if (v === 'light' || v === 'dark') r.setAttribute('data-theme', v); else r.removeAttribute('data-theme');
    var m = document.querySelector('meta[name=theme-color]');
    if (m) m.setAttribute('content', getComputedStyle(document.body || r).getPropertyValue('--top').trim() || '#ffffff');
  }
  pasang(baca());
  var IKON = {
    auto: 'M3 5h18v11H3zM8 20h8M12 16v4',
    light: 'M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
    dark: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z'
  };
  function svg(d) { var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'), p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); p.setAttribute('d', d); s.appendChild(p); return s; }
  root.Tema = {
    pasang: pasang,
    mount: function (box) {
      function gambar() {
        var cur = baca(); box.textContent = '';
        [['auto', 'Otomatis'], ['light', 'Terang'], ['dark', 'Gelap']].forEach(function (t) {
          var b = document.createElement('button');
          b.type = 'button'; b.title = t[1]; b.setAttribute('aria-label', 'Tema ' + t[1]); b.setAttribute('aria-pressed', cur === t[0] ? 'true' : 'false');
          b.appendChild(svg(IKON[t[0]]));
          b.onclick = function () { try { root.localStorage.setItem('tema', t[0]); } catch (e) { /* berlaku sampai halaman ditutup */ } pasang(t[0]); gambar(); };
          box.appendChild(b);
        });
      }
      box.className = 'tema'; box.setAttribute('role', 'group'); box.setAttribute('aria-label', 'Tema tampilan');
      gambar();
    }
  };
})(window);
