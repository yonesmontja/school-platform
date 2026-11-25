# Bab VII Penutup

## 7.1 Kesimpulan

1. **Integrasi data kurikulum hingga rapor tercapai.** Dengan memperlakukan CP, ATP, TP, dan indikator sebagai struktur data, setiap nilai harian tertaut ke tujuan pembelajarannya. Rapor deskriptif, laporan ketuntasan per indikator, dan analitik lintas semester dihasilkan dari data yang sama tanpa pengetikan ulang.
2. **Model STNKM menyatukan akademik dan perilaku.** Nilai dan jurnal anekdotal diterjemahkan ke lima dimensi yang sama, sehingga perkembangan keterampilan, konsep, nalar, karakter, dan minat dapat dipantau berdampingan dan dibandingkan dari waktu ke waktu.
3. **Arsitektur offline-first membuat sistem layak dipakai di kelas.** Antrean per akun, penyiapan halaman, dan deteksi bentrok memungkinkan guru mengisi nilai, jurnal, presensi, dan portofolio tanpa sinyal, tanpa kehilangan maupun menimpa data orang lain.
4. **AI dimanfaatkan sebagai asisten yang akuntabel.** Draf perangkat ajar, soal, catatan, dan analisis disusun AI dari data agregat dan dokumen resmi, lalu diperiksa guru dan disetujui kepala sekolah. Data pribadi siswa tidak dikirim ke penyedia AI.
5. **Kesinambungan dan akuntabilitas data terjaga.** Riwayat rombel per semester, kunci semester, jejak audit hanya-tambah, pencadangan terverifikasi, dan dokumen resmi yang dapat diverifikasi publik menjaga data dari kelas 1 hingga lulus.
6. **Pengembangan iteratif dengan gerbang tes efektif.** Sebanyak 27 fase dikembangkan dengan tes otomatis yang wajib lulus sebelum setiap rilis, dan uji coba lapangan mencapai 17 dari 21 tugas mandiri tanpa temuan kritis.

## 7.2 Keterbatasan

| Keterbatasan | Dampak | Kondisi saat ini |
|---|---|---|
| Satu sekolah per instalasi | Belum dapat melayani beberapa sekolah sekaligus | Ditunda sampai ada kebutuhan |
| Server di satu komputer sekolah | Ketersediaan bergantung pada listrik dan perangkat itu | Pemantau uptime, backup harian, salinan Google Drive |
| Ekspor e-Rapor berupa rekap | Masih perlu disalin ke aplikasi e-Rapor | Menunggu berkas *Format Nilai* resmi dari operator |
| WhatsApp otomatis bergantung pada Fonnte | Tanpa gateway, pesan dikirim manual lewat wa.me | Kabar rapor, remedial, akses, dan peringatan siap diaktifkan |
| Pembayaran daring belum terhubung | Pembayaran dicatat manual dengan tujuan bayar | Gateway QRIS/VA belum dipilih |
| Mutu AI bergantung penyedia | Hasil dapat berbeda antar penyedia | Persetujuan manusia, cadangan heuristik, rujukan pustaka |
| Uji lapangan berskala kecil | Generalisasi ke sekolah lain terbatas | Dasbor pemakaian memantau adopsi secara berkelanjutan |

## 7.3 Saran Pengembangan

1. **Ekspor e-Rapor format resmi** segera setelah berkas Format Nilai diterima, agar rapor tidak perlu disalin.
2. **Aktivasi gateway WhatsApp** untuk kabar otomatis kepada orang tua dan peringatan admin.
3. **Integrasi tes pihak ketiga** (QTI, API/webhook, LTI 1.3) agar nilai dari platform ujian luar masuk ke Input Nilai per TP.
4. **Multi-sekolah dan penyimpanan objek** (R2/S3) bila sistem dipakai lebih dari satu sekolah.
5. **Gateway pembayaran** QRIS/VA untuk keuangan sekolah.
6. **Penelitian lanjutan** tentang validitas model STNKM: korelasi skor jurnal dengan capaian akademik, konsistensi antar-penilai, dan dampaknya terhadap ketuntasan siswa dalam beberapa tahun ajaran.

## 7.4 Daftar Pustaka

- Badan Standar, Kurikulum, dan Asesmen Pendidikan. (2025). *Keputusan Kepala BSKAP Nomor 058/H/KR/2025 tentang Capaian Pembelajaran*. Kementerian Pendidikan Dasar dan Menengah.
- Kementerian Pendidikan Dasar dan Menengah. (2025). *Peraturan Menteri Nomor 13 Tahun 2025* (kokurikuler dan profil lulusan).
- Kementerian Pendidikan, Kebudayaan, Riset, dan Teknologi. (2022). *Panduan Pembelajaran dan Asesmen*. Jakarta.
- Black, P., & Wiliam, D. (1998). Assessment and classroom learning. *Assessment in Education: Principles, Policy & Practice*, 5(1), 7–74.
- Pressman, R. S., & Maxim, B. R. (2020). *Software Engineering: A Practitioner's Approach* (9th ed.). McGraw-Hill.
- Sommerville, I. (2016). *Software Engineering* (10th ed.). Pearson.
- Fowler, M. (2002). *Patterns of Enterprise Application Architecture*. Addison-Wesley.
- Kleppmann, M., Wiggins, A., van Hardenberg, P., & McGranaghan, M. (2019). Local-first software: You own your data, in spite of the cloud. *Proceedings of Onward! 2019*, ACM.
- OWASP Foundation. (2021). *OWASP Top 10*. https://owasp.org/Top10/
- UNESCO. (2023). *Guidance for Generative AI in Education and Research*. Paris: UNESCO.
- Dokumentasi resmi Laravel, Next.js, PostgreSQL, dan Playwright (versi yang dipakai pada Bab V).
- Repositori school-platform: README, roadmap pengembangan, dan riwayat commit (sumber primer dokumen ini).
