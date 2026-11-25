# Bab II Landasan Konseptual

## 2.1 Kurikulum Merdeka sebagai Kerangka Data

Kurikulum Merdeka menyusun pembelajaran sebagai rantai turunan. **Capaian Pembelajaran (CP)** ditetapkan per mata pelajaran, per fase (fase A untuk kelas 1–2, B untuk kelas 3–4, C untuk kelas 5–6), dan per elemen. Sekolah menurunkan CP menjadi **Alur Tujuan Pembelajaran (ATP)** yang berisi urutan **Tujuan Pembelajaran (TP)** per semester. Setiap TP diukur melalui beberapa **Indikator Ketercapaian Tujuan Pembelajaran (IKTP)**, yang menjadi dasar penilaian sehari-hari. Rencana pertemuan dituangkan dalam **modul ajar**, yang di SAPrapor mengikuti format Perencanaan Pembelajaran Mendalam (RPM 2025).

SAPrapor memperlakukan rantai ini sebagai struktur data, bukan dokumen lepas. Elemen CP disimpan sebagai *High Level*, TP disimpan sebagai *Materi*, dan IKTP sebagai indikator milik materi. Akibatnya, sebuah nilai yang diinput guru hari ini dapat ditelusuri ke indikator, TP, ATP, dan CP-nya, dan sebaliknya CP dapat dilihat ketercapaiannya dari seluruh nilai yang masuk.

```diagram
{"jenis":"alir","nomor":"2.1","judul":"Rantai kurikulum hingga rapor dalam model data SAPrapor",
 "kolom_lebar":165,"baris_tinggi":100,
 "simpul":[
  {"id":"cp","teks":"Capaian Pembelajaran","sub":"mapel × fase × elemen","x":0,"y":0,"gaya":"utama"},
  {"id":"atp","teks":"ATP","sub":"urutan TP per semester, JP, minggu","x":1,"y":0},
  {"id":"tp","teks":"TP (Materi)","sub":"bobot STNKM","x":2,"y":0},
  {"id":"ik","teks":"Indikator (IKTP)","sub":"dapat diurutkan & dinonaktifkan","x":3,"y":0},
  {"id":"mod","teks":"Modul ajar (RPM)","sub":"pertemuan, asesmen, LKPD","x":1,"y":1},
  {"id":"jad","teks":"Jadwal & Jurnal","sub":"sesi terhubung modul","x":2,"y":1},
  {"id":"as","teks":"Asesmen","sub":"diagnostik · formatif · sumatif","x":3,"y":1,"gaya":"utama"},
  {"id":"nil","teks":"Nilai per indikator","sub":"0–100, KKTP, KKM","x":4,"y":1},
  {"id":"tl","teks":"Tindak lanjut","sub":"remedial / pengayaan","x":4,"y":0},
  {"id":"rap","teks":"Rapor & portofolio","sub":"deskripsi capaian, STNKM","x":4,"y":2,"gaya":"aksen"},
  {"id":"st","teks":"Profil STNKM","sub":"S · T · N · K · M","x":3,"y":2,"gaya":"aksen"},
  {"id":"jr","teks":"Jurnal anekdotal","sub":"narasi perilaku → skor","x":2,"y":2}
 ],
 "panah":[
  {"dari":"cp","ke":"atp"},{"dari":"atp","ke":"tp"},{"dari":"tp","ke":"ik"},
  {"dari":"atp","ke":"mod"},{"dari":"mod","ke":"jad"},{"dari":"jad","ke":"as"},
  {"dari":"ik","ke":"as"},{"dari":"as","ke":"nil"},{"dari":"nil","ke":"tl","teks":"< KKM"},
  {"dari":"tl","ke":"ik","putus":true,"teks":"ulang indikator","lewat":[[4,-0.47],[3,-0.47]]},
  {"dari":"nil","ke":"st"},{"dari":"jr","ke":"st"},{"dari":"st","ke":"rap"},{"dari":"nil","ke":"rap"}
 ]}
```

## 2.2 Asesmen dalam Kurikulum Merdeka

| Jenis asesmen | Waktu | Tujuan | Perlakuan di SAPrapor |
|---|---|---|---|
| Diagnostik kognitif | Awal semester / awal materi | Memetakan kemampuan prasyarat | Nilai tidak masuk rapor, laporan, atau remedial; siswa dikelompokkan otomatis menurut KKTP (perlu pendampingan intensif, siap dengan penguatan, siap/mahir). |
| Diagnostik nonkognitif | Awal semester | Gaya belajar, minat, kesejahteraan, dukungan rumah | Diisi wali kelas, bersifat pribadi, dipakai untuk diferensiasi dan ringkasan data kelas bagi AI tanpa nama siswa. |
| Formatif | Selama pembelajaran | Umpan balik dan perbaikan | Nilai per indikator; nilai di bawah KKM memicu rencana tindak lanjut di Perlu Tindakan. |
| Sumatif | Akhir lingkup materi / semester | Mengukur capaian TP | Masuk rapor; paket soal, koreksi, dan analisis butir terhubung ke nilai. |

**Kriteria Ketercapaian Tujuan Pembelajaran (KKTP)** diatur sekolah sebagai pita predikat (bawaan 70/80/90 untuk Cukup/Baik/Sangat Baik), sedangkan ketuntasan tetap memakai **KKM** per mata pelajaran. Untuk kokurikuler dan profil lulusan, sekolah dapat memilih skala empat tingkat (BB/MB/BSH/SB) atau tiga tingkat Berkembang/Cakap/Mahir sesuai BSKAP 058/H/KR/2025, dengan *Cakap* sebagai standar.

### 2.2.1 Siklus Remedial

Remedial dalam SAPrapor bersifat **per indikator**: hanya indikator yang belum tuntas yang diulang, dan nilai remedial dihitung sebagai rata-rata indikator setelah perbaikan. Nilai asli tetap tersimpan; kebijakan sekolah menentukan apakah nilai remedial di rapor dibatasi setinggi KKM atau dipakai apa adanya. Setiap rencana tindak lanjut mencatat bentuknya (tes ulang, tutor sebaya, dan sebagainya), jadwal, dan hasilnya, sehingga efektivitas tiap bentuk tindak lanjut dapat dianalisis.

## 2.3 Model STNKM

STNKM adalah model lima dimensi yang dipakai SAPrapor untuk membaca perkembangan siswa secara utuh:

| Dimensi | Makna | Contoh bukti |
|---|---|---|
| **S** — Skill | Keterampilan teknis dan prosedural | Mempraktikkan langkah percobaan, menulis rapi, berhitung cepat |
| **T** — Teori | Penguasaan konsep akademik | Menjelaskan konsep, menjawab soal pemahaman |
| **N** — Nalar | Analisis dan pemecahan masalah | Menemukan pola, menyelesaikan soal cerita, berargumen |
| **K** — Karakter | Etika, sikap, disiplin | Jujur, bertanggung jawab, membantu teman |
| **M** — Minat | Antusiasme dan eksplorasi | Bertanya lebih jauh, mencoba hal baru, aktif |

Model ini menjembatani dua sumber data yang selama ini terpisah:

1. **Sumber akademik.** Setiap materi (TP) memiliki bobot STNKM. Saat nilai disimpan, sistem menghitung poin S–M dari nilai dan bobot tersebut (skala 0–100). Soal di bank soal juga dapat diberi bobot dimensi sendiri.
2. **Sumber jurnal.** Guru menulis narasi kejadian (jurnal anekdotal). Narasi dianalisis menjadi skor −5 sampai +5 per dimensi oleh salah satu penyedia AI atau, bila AI tidak tersedia, oleh analisis heuristik berbasis kamus perilaku. Perilaku positif bernilai positif; pelanggaran bernilai negatif.

Laporan STNKM dapat membaca keduanya terpisah, atau bersama-sama dengan dua sumbu (akademik di kiri, jurnal di kanan) atau dengan konversi jurnal ke 0–100 melalui rumus (v + 5) × 10. Nilai nol atau kosong diabaikan agar ketiadaan data tidak dibaca sebagai capaian rendah.

```diagram
{"jenis":"alir","nomor":"2.2","judul":"Dua sumber data yang diterjemahkan ke lima dimensi STNKM",
 "kolom_lebar":200,"baris_tinggi":82,
 "simpul":[
  {"id":"n","teks":"Nilai per indikator","sub":"Input Nilai, Import, paket soal, tes online","x":0,"y":0,"gaya":"utama"},
  {"id":"j","teks":"Narasi jurnal anekdotal","sub":"catatan kejadian oleh guru","x":0,"y":2,"gaya":"utama"},
  {"id":"pa","teks":"Poin akademik","sub":"nilai × bobot STNKM materi/soal → 0–100","x":1,"y":0},
  {"id":"pj","teks":"Skor jurnal","sub":"AI (5 penyedia) atau heuristik → −5..+5","x":1,"y":2},
  {"id":"d","teks":"Lima dimensi STNKM","bentuk":"entitas","w":210,"x":2.15,"y":1,"gaya":"aksen",
   "kolom":["S  Skill — keterampilan","T  Teori — konsep","N  Nalar — pemecahan masalah","K  Karakter — sikap, etika","M  Minat — antusiasme"]},
  {"id":"l","teks":"Laporan STNKM","sub":"Akademik · Jurnal · Lengkap (dua sumbu / konversi (v+5)×10)","x":3.35,"y":0.35,"w":190},
  {"id":"r","teks":"Rapor & profil lulusan","sub":"deskripsi dimensi otomatis","x":3.35,"y":1.75,"w":190,"gaya":"aksen"}
 ],
 "panah":[
  {"dari":"n","ke":"pa"},{"dari":"j","ke":"pj"},
  {"dari":"pa","ke":"d"},{"dari":"pj","ke":"d"},
  {"dari":"d","ke":"l"},{"dari":"d","ke":"r"}
 ]}
```

## 2.4 Pembelajaran Berbasis Data dan Peringatan Dini

Data yang terintegrasi memungkinkan sekolah bergerak dari pelaporan ke **tindakan dini**. SAPrapor menghitung beberapa sinyal secara otomatis: indikator dengan ketuntasan terendah, efektivitas tiap bentuk tindak lanjut, skor risiko siswa (alpa dan tren kehadiran, mapel di bawah KKM, nilai menurun, tes terlewat, catatan perilaku negatif), risiko tidak naik kelas sepanjang tahun, serta TP yang lemah lintas angkatan. Prinsipnya, notifikasi **dihitung dari data** dan hilang sendiri setelah pekerjaannya selesai, sehingga guru tidak dibebani daftar tugas yang harus ditutup manual.

## 2.5 Offline-First dan Aplikasi Web Progresif

Pada jaringan tidak stabil, aplikasi yang menunggu server sebelum menyimpan akan kehilangan data. Pendekatan *offline-first* membalik urutannya: data disimpan dulu di perangkat, lalu disinkronkan saat koneksi kembali. SAPrapor menerapkannya dengan:

- **Service worker** yang menyimpan aset aplikasi dan salinan terakhir halaman serta data, dengan strategi jaringan-dulu agar tampilan selalu terbaru saat daring.
- **Antrean IndexedDB per akun** untuk nilai, jurnal, presensi harian dan per mapel, serta unggahan portofolio.
- **Deteksi konflik optimistis**: kiriman nilai membawa waktu lembar dibuka; bila data di server sudah diubah orang lain, server menolak dengan kode 409 dan pengguna memilih menimpa atau membuang.
- **Penyiapan offline**: halaman dan data kelas pengguna disiapkan otomatis sekali sehari saat ada sinyal, atau manual sebelum masuk kelas.

Aplikasi dapat dipasang sebagai PWA dan sebagai aplikasi Android berbasis *Trusted Web Activity*, sehingga satu basis kode melayani browser, layar utama HP, dan APK.

## 2.6 Kecerdasan Buatan dalam Pendidikan: Asisten, Bukan Pengambil Keputusan

AI generatif dapat menghemat waktu guru untuk menyusun draf, tetapi keluarannya dapat keliru, bias, atau tidak sesuai konteks. SAPrapor menerapkan empat prinsip:

1. **Manusia memutuskan.** Draf AI (soal, ATP, modul ajar, catatan wali, saran pembelajaran ulang) selalu diperiksa guru, dan perangkat ajar serta soal disetujui kepala sekolah sebelum dipakai.
2. **Privasi data anak.** Prompt hanya berisi data agregat atau nama yang disamarkan; nama siswa tidak dikirim ke penyedia AI untuk analisis kelas.
3. **Berakar pada sumber resmi.** Pustaka Dokumen menyimpan CP, regulasi, dan panduan resmi; bagian yang relevan disertakan sebagai rujukan saat AI menyusun perangkat ajar, dan notebook riset hanya menjawab dari dokumen dengan kutipan yang divalidasi.
4. **Tahan gagal.** Tersedia beberapa penyedia (Gemini, Claude, Qwen, DeepSeek, OpenKey); bila semuanya gagal, analisis jurnal jatuh ke heuristik lokal. Kunci API disimpan terenkripsi di basis data dan dipakai dari server, tidak pernah dikirim ke browser.

## 2.7 Keamanan, Privasi, dan Akuntabilitas

Sistem sekolah menyimpan data anak, sehingga keamanan dirancang berlapis: kontrol akses berbasis peran di server (bukan hanya menyembunyikan menu), batas laju permintaan, token berumur terbatas, HTTPS dengan header keamanan, penyensoran data sensitif di log, serta **jejak audit hanya-tambah** yang mencatat siapa mengubah apa beserta nilai sebelum dan sesudahnya. Catatan jurnal dapat ditandai *sensitif* sehingga narasinya hanya terbaca pihak yang berhak. Berkas pribadi (pas foto, portofolio) disajikan melalui tautan bertanda tangan yang kedaluwarsa. Keaslian dokumen resmi (rapor, surat, kartu pelajar) dapat diverifikasi publik melalui kode QR tanpa membuka data lain.

## 2.8 Penelitian dan Sistem Terkait

Aplikasi e-Rapor resmi berfokus pada pengolahan nilai akhir dan pencetakan rapor, sedangkan sistem informasi sekolah umum (SIAKAD) berfokus pada data administrasi. Platform pembelajaran daring berfokus pada penyampaian materi dan kuis. SAPrapor mengambil posisi di antara ketiganya: titik beratnya adalah **siklus asesmen formatif harian** yang tersambung ke perencanaan, tindak lanjut, dan pelaporan, dengan dimensi perilaku yang terukur dan kemampuan bekerja tanpa sinyal. Untuk kebutuhan resmi, SAPrapor menyediakan ekspor rekap ke e-Rapor, sehingga sekolah tidak harus memilih salah satu.
