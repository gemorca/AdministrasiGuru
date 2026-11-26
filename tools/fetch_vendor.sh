#!/bin/sh
# Mengunduh Tailwind (runtime) dan Chart.js ke vendor/ agar aplikasi jalan tanpa CDN.
# Jalankan SEKALI dari akar proyek, di komputer yang punya internet:  sh tools/fetch_vendor.sh
# index.html sudah memuat vendor/ lebih dulu dan baru jatuh ke CDN bila berkasnya tidak ada.
set -e
mkdir -p vendor
curl -fsSL https://cdn.tailwindcss.com/3.4.17 -o vendor/tailwind.js
curl -fsSL https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.js -o vendor/chart.umd.js
curl -fsSL https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js -o vendor/supabase.js
ls -l vendor
