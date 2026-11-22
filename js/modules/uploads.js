// js/modules/uploads.js
// Unggah dokumen referensi untuk AI. Isi dokumen BENAR-BENAR dibaca (js/ai/fileReader.js).
// Hasil hanya disimpan di memori sesi, bukan localStorage.

        let uploadedRefDoc = null;   // hasil AIFiles.read untuk referensi CP / modul ajar
        let uploadedKisiDoc = null;  // hasil AIFiles.read untuk kisi-kisi

        function describeDoc(doc) {
            if (doc.kind === 'pdf') return `PDF ${(doc.size / 1048576).toFixed(1)} MB (isinya dibaca Gemini saat permintaan AI dikirim)`;
            return `${doc.text.length.toLocaleString('id-ID')} karakter teks terbaca${doc.truncated ? ' (dipotong ke ' + AIFiles.MAX_TEXT_CHARS.toLocaleString('id-ID') + ' karakter pertama)' : ''}`;
        }

        async function handleFileUpload(e, context) {
            let input = e.target;
            let file = input.files[0];
            if (!file) return;
            try {
                let doc = await AIFiles.read(file);
                uploadedRefDoc = doc;
                uploadedRefName = doc.name;
                let cpRefInd = document.getElementById('cpRefIndicator');
                let cpRefName = document.getElementById('cpRefName');
                if (cpRefInd && cpRefName) {
                    cpRefName.innerText = doc.name;
                    cpRefInd.classList.remove('hidden');
                }
                showModal("Dokumen Terbaca", `"${doc.name}": ${describeDoc(doc)}. Disimpan untuk sesi ini saja (tidak disimpan permanen).`, "✅");
            } catch (err) {
                showModal("Dokumen Tidak Dapat Dibaca", err.message || 'Terjadi kesalahan saat membaca file.', "❌");
            }
            input.value = ''; // izinkan memilih file yang sama lagi
        }

        async function handleKisiUpload(e) {
            let input = e.target;
            let file = input.files[0];
            if (!file) return;
            let statusEl = document.getElementById('uploadedKisiStatus');
            try {
                let doc = await AIFiles.read(file);
                uploadedKisiDoc = doc;
                uploadedKisiName = doc.name;
                if (statusEl) {
                    statusEl.innerText = `✔️ Terbaca: ${doc.name}`;
                    statusEl.className = "ml-2 font-bold text-emerald-700 italic text-[11px]";
                }
                showModal("Kisi-Kisi Terbaca", `"${doc.name}": ${describeDoc(doc)}.`, "✅");
            } catch (err) {
                if (statusEl) {
                    statusEl.innerText = `✖ Gagal dibaca`;
                    statusEl.className = "ml-2 font-bold text-red-600 italic text-[11px]";
                }
                showModal("Dokumen Tidak Dapat Dibaca", err.message || 'Terjadi kesalahan saat membaca file.', "❌");
            }
            input.value = '';
        }
