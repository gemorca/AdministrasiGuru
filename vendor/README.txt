Letakkan dua berkas ini di folder ini agar aplikasi jalan tanpa internet:

  tailwind.js    <- isi dari https://cdn.tailwindcss.com  (simpan sebagai tailwind.js)
  chart.umd.js   <- isi dari https://cdn.jsdelivr.net/npm/chart.js  (simpan sebagai chart.umd.js)

Selama berkas ini belum ada, index.html otomatis memakai CDN (perlu internet).
Catatan: Tailwind versi CDN dimaksudkan untuk pengembangan. Untuk produksi, bangun CSS dengan Tailwind CLI (opsional, Tahap 6).
