# Backend Google Apps Script

Salinan cadangan kode server proyek Apps Script **"Registrasi Lapas Sukamiskin"**
(diambil dari Google Drive pada 22 November 2026, versi tersimpan terakhir 12 November 2026).

Folder ini hanya cadangan. Situs di GitHub Pages tetap memanggil Web App yang sudah
di-deploy; mengubah file di sini tidak mengubah server.

| File | Isi |
|---|---|
| `Kode.gs` | Server: `doPost` / `api()`, cek kode akses, baca tulis Google Sheets, pembaca dokumen Claude |
| `Index.html` | Halaman lama yang disajikan `doGet()` (versi Apps Script dari situs) |
| `appsscript.json` | Manifest: zona Asia/Jakarta, V8, Web App dijalankan sebagai pemilik, akses siapa saja |

## Rahasia tidak ada di repo

Semua nilai rahasia disimpan di **Project Settings > Script properties** di editor Apps Script,
bukan di kode. Jangan pernah menyalin nilainya ke repo ini (repo ini publik).

| Properti | Kegunaan |
|---|---|
| `SHEET_ID` | ID Google Sheets tempat data (dibuat otomatis oleh `siapkan()`) |
| `KODE_EDITOR` | Kode akses peran editor |
| `KODE_LIHAT` | Kode akses peran lihat saja |
| `KODE_P2U` | Kode akses P2U (hanya agenda hari ini, centang selesai) |
| `ANTHROPIC_API_KEY` | Kunci API untuk membaca surat dan foto |
| `CLAUDE_MODEL` | Opsional, model Claude yang dipakai |
| `MAKS_BACA_PER_HARI` | Opsional, batas pembacaan dokumen per hari (bawaan 100) |

`VER` dan `BACA_HARI` diisi otomatis oleh skrip.

## Memulihkan ke proyek Apps Script baru

1. Buat proyek baru di script.google.com, lalu salin isi `Kode.gs`, `Index.html`,
   dan `appsscript.json` (aktifkan "Show appsscript.json" di Project Settings).
2. Jalankan `siapkan()` sekali dari editor, atau isi `SHEET_ID` dengan ID lembar data lama.
3. Isi Script properties di atas.
4. Deploy > New deployment > Web app, lalu ganti `API_URL` di `index.html` dan `tv.html`
   bila URL deployment berubah.

Atau dengan [clasp](https://github.com/google/clasp): `clasp clone <scriptId>` lalu `clasp push`
dari folder ini. File `.clasp.json` sengaja tidak disimpan di repo.

## Memperbarui cadangan

Setelah mengubah kode di editor Apps Script, salin ulang ketiga file ke folder ini
(atau `clasp pull`), lalu commit.
