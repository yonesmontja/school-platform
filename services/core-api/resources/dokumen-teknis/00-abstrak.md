# Abstrak

Sekolah dasar di daerah dengan konektivitas terbatas menghadapi dua beban sekaligus. Pertama, Kurikulum Merdeka menuntut asesmen yang lebih rinci: Capaian Pembelajaran (CP) diturunkan menjadi Tujuan Pembelajaran (TP), indikator ketercapaian, asesmen diagnostik–formatif–sumatif, tindak lanjut, dan rapor yang deskriptif. Kedua, pekerjaan administrasi itu masih banyak dikerjakan dengan kertas dan lembar kerja terpisah, sehingga data penilaian, jurnal perilaku, presensi, dan rapor sulit disatukan.

Dokumen ini menguraikan rancang bangun **SAPrapor**, sistem informasi berbasis web yang menyatukan perencanaan pembelajaran, penilaian, jurnal anekdotal, presensi, remedial, rapor, portal orang tua, dan administrasi sekolah dalam satu basis data. Inti konseptualnya adalah model **STNKM** (Skill, Teori, Nalar, Karakter, Minat): setiap nilai akademik dan setiap catatan perilaku diterjemahkan ke lima dimensi yang sama, sehingga perkembangan siswa dapat dibaca utuh, bukan hanya angka rata-rata.

Sistem dibangun dengan arsitektur tiga lapis: antarmuka Next.js yang dapat dipasang sebagai aplikasi (PWA dan Android TWA) dan tetap dapat dipakai saat offline, API Laravel dengan kontrol akses berbasis sembilan peran, serta basis data PostgreSQL. Kecerdasan buatan generatif dipakai sebagai asisten (draf soal, ATP, modul ajar, analisis jurnal, catatan wali kelas) dengan prinsip *manusia memutuskan*: setiap keluaran AI diperiksa guru dan disetujui kepala sekolah, dan data pribadi siswa tidak dikirim ke penyedia AI.

Pengembangan dilakukan secara iteratif dalam 27 fase dan diuji dengan tes otomatis backend dan tes antarmuka end-to-end yang wajib lulus sebelum setiap rilis, serta uji coba lapangan bersama guru dan orang tua (17 dari 21 tugas diselesaikan mandiri tanpa temuan kritis). Hasilnya menunjukkan bahwa satu sistem terintegrasi yang dirancang dari kebutuhan nyata sekolah dapat mengurangi pekerjaan berulang, menjaga jejak data dari kelas 1 hingga lulus, dan membuat keputusan pedagogis lebih berbasis data.

**Kata kunci:** Kurikulum Merdeka, sistem informasi sekolah, asesmen formatif, STNKM, rapor digital, offline-first, AI dalam pendidikan, Papua.

*Isi dokumen terakhir diperbarui {{diperbarui}}. Statistik sistem pada Bab V dan lampiran dihitung otomatis setiap dokumen dibuka.*
