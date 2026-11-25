# Bab III Analisis Sistem

## 3.1 Analisis Kondisi Awal

Sebelum SAPrapor, siklus akademik sekolah berjalan di beberapa tempat terpisah. Guru menilai di buku nilai atau lembar kerja, menulis catatan perilaku di buku, mengisi presensi di kertas, lalu wali kelas menyalin ringkasannya ke aplikasi e-Rapor di akhir semester. Perangkat ajar (ATP, modul ajar) dan soal disusun sebagai dokumen pengolah kata tanpa tautan ke nilai siswa. Kondisi ini menimbulkan masalah berikut:

| Kode | Masalah | Akibat |
|---|---|---|
| M1 | Data diketik berulang di beberapa tempat | Waktu guru habis untuk administrasi; risiko salah salin |
| M2 | Nilai tidak tertaut ke indikator dan TP | Rapor deskriptif disusun dari ingatan; TP yang lemah tidak terlihat |
| M3 | Catatan perilaku tidak terukur | Karakter dan minat tidak tercermin dalam laporan perkembangan |
| M4 | Tindak lanjut tidak terpantau | Siswa di bawah KKM terlewat; efektivitas remedial tidak diketahui |
| M5 | Ketergantungan pada sinyal | Aplikasi daring gagal dipakai di kelas |
| M6 | Orang tua menerima informasi di akhir semester | Pendampingan di rumah terlambat |
| M7 | Riwayat siswa terputus saat naik kelas atau ganti wali | Rekam jejak dari kelas 1 tidak utuh |
| M8 | Tidak ada jejak perubahan data | Sulit menelusuri kesalahan atau penyalahgunaan |

## 3.2 Identifikasi Aktor

| Aktor | Jenis | Deskripsi dan batas akses |
|---|---|---|
| Admin | Manusia | Mengelola master data, akun, pengaturan sekolah, pergantian semester, dan seluruh data. |
| Kepala sekolah | Manusia | Menyetujui soal, ATP, modul, video, dan dokumen pustaka; mengesahkan rapor dan kenaikan kelas; memantau mutu; menunjuk operator. |
| Guru | Manusia | Menilai, menulis jurnal, mengisi presensi per mapel, menyusun perangkat ajar dan soal, terbatas pada mapel dan rombel yang diampu. |
| Wali kelas | Manusia (guru dengan kelas binaan) | Presensi harian, catatan wali, rapor, kenaikan, portofolio, pesan orang tua untuk kelas binaannya. |
| Siswa | Manusia | Portal baca, tes online, mengirim karya portofolio. |
| Orang tua / wali | Manusia | Portal baca untuk anaknya, pesan dengan wali kelas, menerima rapor resmi, melihat tagihan. |
| Peninjau (Wakasek Kurikulum, Wakasek Kesiswaan, Yayasan) | Manusia | Membuka semua menu seperti pengelola, tetapi setiap perubahan ditolak server. |
| Operator sekolah | Manusia (tata usaha) | Hanya submodul administrasi yang ditunjuk kepala sekolah (SPMB, keuangan, surat, inventaris). |
| Publik | Manusia tanpa akun | Beranda sekolah, formulir SPMB, verifikasi QR rapor/surat/kartu, unduh APK. |
| Penyedia AI | Sistem eksternal | Gemini, Claude, Qwen, DeepSeek, OpenKey/OpenRouter, Azure Speech, ElevenLabs. |
| Gateway WhatsApp | Sistem eksternal | Fonnte untuk pesan otomatis; tanpa itu tautan wa.me dibuka manual. |
| Canva | Sistem eksternal | Impor desain ke Studio Rakit Video melalui OAuth. |
| Aplikasi luar | Sistem eksternal | Klien API Render v1 (mis. asisten AI Muse) dengan kunci API. |

## 3.3 Diagram Konteks

```diagram
{"jenis":"alir","nomor":"3.1","judul":"Diagram konteks SAPrapor",
 "kolom_lebar":180,"baris_tinggi":92,
 "simpul":[
  {"id":"sys","teks":"SAPrapor","sub":"web · API · basis data","x":2,"y":2,"w":170,"h":70,"gaya":"utama"},
  {"id":"g","teks":"Guru & wali kelas","x":0,"y":0.6,"bentuk":"aktor"},
  {"id":"ks","teks":"Kepala sekolah","x":2,"y":0,"bentuk":"aktor"},
  {"id":"ad","teks":"Admin","x":4,"y":0.6,"bentuk":"aktor"},
  {"id":"op","teks":"Operator & peninjau","x":4,"y":2.1,"bentuk":"aktor"},
  {"id":"so","teks":"Siswa & orang tua","x":0,"y":2.1,"bentuk":"aktor"},
  {"id":"pb","teks":"Publik","x":0,"y":3.6,"bentuk":"aktor"},
  {"id":"ai","teks":"Penyedia AI","x":1.1,"y":4,"bentuk":"awan","w":130},
  {"id":"wa","teks":"WhatsApp / Fonnte","x":2.6,"y":4,"bentuk":"awan","w":130},
  {"id":"cv","teks":"Canva · Aplikasi luar","x":3.7,"y":3.7,"bentuk":"awan","w":150}
 ],
 "panah":[
  {"dari":"g","ke":"sys","teks":"nilai, jurnal, presensi, perangkat ajar","panah":"dua"},
  {"dari":"ks","ke":"sys","teks":"persetujuan, pengesahan","panah":"dua"},
  {"dari":"ad","ke":"sys","teks":"master data, akun, semester","panah":"dua"},
  {"dari":"op","ke":"sys","teks":"SPMB, keuangan, surat","panah":"dua"},
  {"dari":"so","ke":"sys","teks":"portal, tes, pesan","panah":"dua"},
  {"dari":"pb","ke":"sys","teks":"SPMB, verifikasi QR"},
  {"dari":"sys","ke":"ai","teks":"prompt tanpa nama siswa","panah":"dua","putus":true},
  {"dari":"sys","ke":"wa","teks":"kabar & akses","putus":true},
  {"dari":"cv","ke":"sys","teks":"desain / Scene JSON","putus":true}
 ]}
```

## 3.4 Kebutuhan Fungsional

| Kode | Kebutuhan | Aktor utama |
|---|---|---|
| KF-01 | Autentikasi token, sembilan peran, ganti sandi wajib untuk akun baru, akun nonaktif ditolak | Semua |
| KF-02 | Master data siswa, guru, rombel, mapel (KKM), periode, orang tua/wali, referensi | Admin |
| KF-03 | Kurikulum: elemen CP, materi (TP) dengan bobot STNKM, indikator (IKTP), jenis asesmen | Admin, guru |
| KF-04 | Perangkat ajar: CP, ATP, modul ajar RPM dengan bantuan AI dan persetujuan kepala sekolah | Guru, kepala sekolah |
| KF-05 | Jadwal pembelajaran terhubung perangkat ajar; status sesi otomatis; Prota & Promes; Peta Tema | Guru, kepala sekolah |
| KF-06 | Input nilai per indikator, Import Excel, pindahkan lembar nilai, poin STNKM otomatis | Guru |
| KF-07 | Jurnal anekdotal dengan analisis STNKM (AI atau heuristik) dan penanda sensitif | Guru |
| KF-08 | Presensi harian dan per mapel; pembinaan kehadiran | Wali kelas, guru |
| KF-09 | Remedial per indikator dengan rencana, jadwal, hasil, dan kabar orang tua | Guru |
| KF-10 | Bank soal, kisi-kisi, paket soal, koreksi, analisis butir, tes online, sesi CBT | Guru, siswa |
| KF-11 | Rapor: deskripsi capaian otomatis, catatan wali, kokurikuler, rapor resmi ber-QR, ekspor e-Rapor | Wali kelas, kepala sekolah |
| KF-12 | Pergantian semester, kunci semester, pembagian mengajar, kenaikan kelas, rekam jejak | Admin, wali kelas, kepala sekolah |
| KF-13 | Laporan STNKM, dasbor, analitik lintas semester, peringatan dini, pantauan kenaikan | Pengelola, guru |
| KF-14 | Portal siswa dan orang tua, pesan dua arah, rapor berjalan, e-portofolio | Siswa, orang tua, wali kelas |
| KF-15 | Pusat notifikasi Perlu Tindakan yang dihitung dari data | Semua |
| KF-16 | Administrasi sekolah: SPMB, keuangan, surat & arsip, inventaris, dengan operator per submodul | Operator, kepala sekolah |
| KF-17 | Media belajar: video belajar, Studio Rakit Video, Pustaka Dokumen dan notebook AI | Guru |
| KF-18 | Log aktivitas, pemakaian aplikasi, dokumentasi API, dokumen teknis, kirim akses WhatsApp | Admin |

## 3.5 Kebutuhan Nonfungsional

| Kode | Kategori | Kebutuhan | Cara pemenuhan |
|---|---|---|---|
| KNF-01 | Keamanan | Hak akses dicek di server untuk setiap permintaan | Middleware peran, pembatasan data per guru/rombel, peninjau ditolak menulis (403) |
| KNF-02 | Keamanan | Tahan serangan tebak sandi dan banjir permintaan | Batas login per akun+IP, 300 permintaan/menit per akun, batas khusus AI dan unggahan |
| KNF-03 | Privasi | Data anak tidak bocor ke pihak ketiga | Prompt AI tanpa nama siswa, berkas privat bertanda tangan, jurnal sensitif |
| KNF-04 | Akuntabilitas | Setiap perubahan tercatat dan tidak dapat diubah | Log aktivitas hanya-tambah dengan diff sebelum–sesudah, arsip bulanan |
| KNF-05 | Ketersediaan | Pekerjaan harian tetap jalan tanpa sinyal | Service worker, antrean IndexedDB, deteksi konflik 409 |
| KNF-06 | Ketahanan data | Data dapat dipulihkan setelah kerusakan | Backup harian/bulanan dengan verifikasi, salinan di luar laptop, uji restore |
| KNF-07 | Kinerja | Halaman utama terasa cepat di HP | Build produksi, cache, pemuatan malas, vendor PHP di volume Docker |
| KNF-08 | Kegunaan | Dapat dipakai guru dengan sedikit pelatihan | Alur menu per tahap kerja, Panduan per peran, Peta Kerja, mode HP Hari Ini |
| KNF-09 | Keterpeliharaan | Perubahan tidak merusak fitur lama | Tes backend dan end-to-end wajib lulus sebelum terbit |
| KNF-10 | Kepatuhan | Sesuai Kurikulum Merdeka dan kebijakan nasional | CP/TP/IKTP, BSKAP 058, Permendikdasmen 13/2025 (kokurikuler), e-Rapor |
| KNF-11 | Zona waktu | "Hari ini" mengikuti waktu sekolah | `ZONA_SEKOLAH` = Asia/Jayapura (WIT) |

## 3.6 Diagram Use Case

Diagram berikut memperlihatkan fungsi utama per kelompok aktor. Relasi «include» berarti fungsi itu selalu dijalankan sebagai bagian dari fungsi asalnya; «extend» berarti fungsi tambahan yang dijalankan pada kondisi tertentu.

```diagram
{"jenis":"usecase","nomor":"3.2","judul":"Diagram use case Guru: kegiatan harian di kelas","sistem":"SAPrapor — kegiatan harian","kolom":1,"lebar_kasus":250,
 "aktor_kiri":[{"id":"g","nama":"Guru"}],
 "aktor_kanan":[{"id":"ai","nama":"Penyedia AI"}],
 "kasus":[
  {"id":"u1","nama":"Melihat Perlu Tindakan & Hari Ini","aktor":["g"]},
  {"id":"u16","nama":"Mengelola jadwal & sesi","aktor":["g"]},
  {"id":"u6","nama":"Mengisi presensi per mapel","aktor":["g"]},
  {"id":"u8","nama":"Bekerja offline (antrean HP)","aktor":["g"]},
  {"id":"u2","nama":"Menginput nilai per indikator","aktor":["g"],"utama":true},
  {"id":"u7","nama":"Merencanakan & mencatat remedial","aktor":["g"]},
  {"id":"u3","nama":"Mengimpor nilai dari Excel","aktor":["g"]},
  {"id":"u4","nama":"Memindahkan lembar nilai","aktor":["g"]},
  {"id":"u5","nama":"Menulis jurnal anekdotal","aktor":["g"],"utama":true},
  {"id":"u14","nama":"Menganalisis STNKM jurnal","aktor":["ai"]}
 ],
 "relasi":[
  {"dari":"u8","ke":"u2","jenis":"extend"},{"dari":"u2","ke":"u7","jenis":"extend"},
  {"dari":"u5","ke":"u14","jenis":"include"}
 ]}
```

```diagram
{"jenis":"usecase","nomor":"3.3","judul":"Diagram use case Guru: perencanaan dan asesmen","sistem":"SAPrapor — perencanaan & asesmen","kolom":1,"lebar_kasus":250,
 "aktor_kiri":[{"id":"g","nama":"Guru"}],
 "aktor_kanan":[{"id":"ai","nama":"Penyedia AI"},{"id":"ks","nama":"Kepala sekolah"}],
 "kasus":[
  {"id":"p1","nama":"Menyusun CP & ATP","aktor":["g","ai"]},
  {"id":"p2","nama":"Menyusun modul ajar RPM","aktor":["g","ai"]},
  {"id":"p3","nama":"Menyusun bank soal & kisi-kisi","aktor":["g","ai"]},
  {"id":"p4","nama":"Mengajukan untuk disetujui","aktor":["ks"],"utama":true},
  {"id":"p5","nama":"Membuat paket soal & koreksi","aktor":["g"]},
  {"id":"p6","nama":"Menyelenggarakan tes online / CBT","aktor":["g"]},
  {"id":"p7","nama":"Menilai uraian berbantuan AI","aktor":["g","ai"]},
  {"id":"p8","nama":"Membaca laporan STNKM & analitik","aktor":["g"]},
  {"id":"p9","nama":"Meriset Pustaka Dokumen (notebook)","aktor":["g","ai"]}
 ],
 "relasi":[
  {"dari":"p1","ke":"p4","jenis":"include"},{"dari":"p2","ke":"p4","jenis":"include"},{"dari":"p3","ke":"p4","jenis":"include"},
  {"dari":"p6","ke":"p7","jenis":"extend"}
 ]}
```

```diagram
{"jenis":"usecase","nomor":"3.4","judul":"Diagram use case Wali kelas","sistem":"SAPrapor — kelas binaan","kolom":1,"lebar_kasus":220,
 "aktor_kiri":[{"id":"w","nama":"Wali kelas"}],
 "aktor_kanan":[{"id":"ks","nama":"Kepala sekolah"},{"id":"ot","nama":"Orang tua"},{"id":"wa","nama":"WhatsApp"}],
 "kasus":[
  {"id":"a1","nama":"Mengisi presensi harian","aktor":["w"],"kolom":1},
  {"id":"a2","nama":"Mengelola pembinaan kehadiran","aktor":["w"],"kolom":1},
  {"id":"a3","nama":"Mengisi asesmen diagnostik nonkognitif","aktor":["w"],"kolom":1},
  {"id":"a4","nama":"Menyusun catatan wali (AI)","aktor":["w"],"kolom":1},
  {"id":"a5","nama":"Mengelola kokurikuler (Proyek)","aktor":["w"],"kolom":1},
  {"id":"a6","nama":"Memantau peringatan dini & kenaikan","aktor":["w"],"kolom":1},
  {"id":"a7","nama":"Mengelola e-portofolio","aktor":["w"],"kolom":1},
  {"id":"b1","nama":"Mencetak & mendistribusikan rapor","aktor":["w","wa"],"kolom":2},
  {"id":"b2","nama":"Menerbitkan rapor resmi ber-QR","aktor":["w"],"kolom":1,"utama":true},
  {"id":"b3","nama":"Mengesahkan rapor","aktor":["ks"],"kolom":2},
  {"id":"b4","nama":"Memutuskan kenaikan kelas","aktor":["w","ks"],"kolom":2},
  {"id":"b5","nama":"Berkirim pesan & rapor berjalan","aktor":["w","ot","wa"],"kolom":2},
  {"id":"b6","nama":"Meninjau kiriman karya","aktor":["w","ot"],"kolom":2}
 ],
 "relasi":[{"dari":"b2","ke":"b3","jenis":"include"},{"dari":"a7","ke":"b6","jenis":"extend"}]}
```

```diagram
{"jenis":"usecase","nomor":"3.5","judul":"Diagram use case Admin, Kepala sekolah, dan Peninjau","sistem":"SAPrapor — pengelolaan","kolom":1,"lebar_kasus":225,
 "aktor_kiri":[{"id":"ad","nama":"Admin"},{"id":"ks","nama":"Kepala sekolah"}],
 "aktor_kanan":[{"id":"pn","nama":"Peninjau (lihat saja)"}],
 "kasus":[
  {"id":"c1","nama":"Mengelola master data & referensi","aktor":["ad"],"kolom":1},
  {"id":"c2","nama":"Mengelola akun & kirim akses WhatsApp","aktor":["ad"],"kolom":1},
  {"id":"c3","nama":"Mengatur sekolah, AI & integrasi","aktor":["ad"],"kolom":1},
  {"id":"c4","nama":"Menutup semester & mengunci","aktor":["ad"],"kolom":1,"utama":true},
  {"id":"c5","nama":"Mengatur pembagian mengajar","aktor":["ad"],"kolom":1},
  {"id":"c6","nama":"Membaca log aktivitas","aktor":["ad","ks"],"kolom":1},
  {"id":"c7","nama":"Membaca dokumentasi API & dokumen teknis","aktor":["ad"],"kolom":1},
  {"id":"d1","nama":"Menyetujui soal, ATP, modul, video, dokumen","aktor":["ks"],"kolom":2},
  {"id":"d2","nama":"Mengesahkan rapor & kenaikan","aktor":["ks"],"kolom":2},
  {"id":"d3","nama":"Menetapkan Peta Tema","aktor":["ks"],"kolom":2},
  {"id":"d4","nama":"Menunjuk operator administrasi","aktor":["ks"],"kolom":2},
  {"id":"d5","nama":"Memantau pemakaian & analitik","aktor":["ad","ks","pn"],"kolom":2},
  {"id":"d6","nama":"Melihat seluruh menu & data","aktor":["pn"],"kolom":2}
 ],
 "relasi":[]}
```

```diagram
{"jenis":"usecase","nomor":"3.6","judul":"Diagram use case Siswa, Orang tua, dan Publik","sistem":"SAPrapor — portal & layanan publik","kolom":1,"lebar_kasus":215,
 "aktor_kiri":[{"id":"s","nama":"Siswa"},{"id":"o","nama":"Orang tua"}],
 "aktor_kanan":[{"id":"p","nama":"Publik"}],
 "kasus":[
  {"id":"e1","nama":"Mengerjakan tes online","aktor":["s"],"kolom":1},
  {"id":"e2","nama":"Melihat capaian TP & tindak lanjut","aktor":["s","o"],"kolom":1},
  {"id":"e3","nama":"Melihat jadwal & kehadiran","aktor":["s","o"],"kolom":1},
  {"id":"e4","nama":"Menonton video belajar","aktor":["s"],"kolom":1},
  {"id":"e5","nama":"Mengirim karya portofolio","aktor":["s","o"],"kolom":1},
  {"id":"e6","nama":"Menerima rapor resmi","aktor":["o"],"kolom":1},
  {"id":"e7","nama":"Berkirim pesan dengan wali","aktor":["o"],"kolom":1},
  {"id":"e8","nama":"Melihat tagihan sekolah","aktor":["o"],"kolom":1},
  {"id":"f1","nama":"Memverifikasi QR rapor / surat / kartu","aktor":["p","o"],"kolom":2},
  {"id":"f2","nama":"Mendaftar SPMB & cek status","aktor":["p"],"kolom":2},
  {"id":"f3","nama":"Membuka beranda sekolah","aktor":["p"],"kolom":2},
  {"id":"f4","nama":"Mengunduh aplikasi Android","aktor":["p"],"kolom":2}
 ],
 "relasi":[{"dari":"e6","ke":"f1","jenis":"extend"}]}
```

```diagram
{"jenis":"usecase","nomor":"3.7","judul":"Diagram use case Operator administrasi sekolah","sistem":"SAPrapor — administrasi","kolom":1,"lebar_kasus":215,
 "aktor_kiri":[{"id":"op","nama":"Operator"}],
 "aktor_kanan":[{"id":"ks","nama":"Kepala sekolah"},{"id":"pb","nama":"Pendaftar"}],
 "kasus":[
  {"id":"g1","nama":"Memverifikasi berkas SPMB","aktor":["op"],"kolom":1},
  {"id":"g2","nama":"Menetapkan hasil seleksi","aktor":["op","ks"],"kolom":1},
  {"id":"g3","nama":"Menjadikan pendaftar siswa","aktor":["op"],"kolom":1},
  {"id":"g4","nama":"Membuat tagihan & mencatat pembayaran","aktor":["op"],"kolom":1},
  {"id":"g5","nama":"Mencetak kuitansi & buku kas","aktor":["op"],"kolom":1},
  {"id":"h1","nama":"Menyusun surat keluar ber-QR","aktor":["op"],"kolom":2},
  {"id":"h2","nama":"Menandatangani surat","aktor":["ks"],"kolom":2},
  {"id":"h3","nama":"Mencatat surat masuk & disposisi","aktor":["op","ks"],"kolom":2},
  {"id":"h4","nama":"Mengelola inventaris & pengadaan","aktor":["op"],"kolom":2},
  {"id":"h5","nama":"Mengisi formulir pendaftaran","aktor":["pb"],"kolom":2}
 ],
 "relasi":[{"dari":"h1","ke":"h2","jenis":"include"},{"dari":"g1","ke":"g2","jenis":"include"}]}
```

## 3.7 Skenario Use Case Utama

### 3.7.1 Menginput nilai per indikator

| Unsur | Uraian |
|---|---|
| Aktor | Guru (juga admin/kepala sekolah atas nama guru pengampu) |
| Prasyarat | Guru masuk; mengampu mapel di rombel itu pada semester aktif; semester tidak terkunci |
| Alur utama | 1) Guru membuka Input Nilai; kelas, mapel, dan materi terisi dari jadwal hari ini. 2) Guru memilih jenis penilaian, tanggal, dan indikator yang dinilai. 3) Sistem menampilkan ringkasan penilaian terakhir dan lembar siswa. 4) Guru mengisi nilai 0–100 per indikator lalu menyimpan. 5) Sistem menghitung nilai materi (rata-rata indikator terisi), poin STNKM, predikat KKTP, dan ketuntasan KKM. 6) Nilai di bawah KKM masuk Perlu Tindakan sebagai calon tindak lanjut. |
| Alur alternatif | 4a) Tanpa sinyal: kiriman masuk antrean HP dan terkirim otomatis saat tersambung. 4b) Data sudah diubah akun lain: server menolak (409); guru memilih Timpa atau Buang. 4c) Salah materi/tanggal setelah tersimpan: guru memakai Pindahkan lembar. |
| Pascakondisi | Nilai, guru penilai, dan akun pengisi tersimpan; perubahan tercatat di log aktivitas |

### 3.7.2 Menerbitkan rapor resmi ber-QR

| Unsur | Uraian |
|---|---|
| Aktor | Wali kelas, kepala sekolah, orang tua, publik |
| Prasyarat | Nilai, kehadiran, dan catatan wali semester itu lengkap |
| Alur utama | 1) Wali kelas mengatur mode kalkulasi, bobot, dan tanggal rapor. 2) Wali kelas menekan Terbitkan rapor kelas; sistem menyimpan cuplikan nilai dan membuat kode QR per siswa dengan tanda tangan elektronik wali. 3) Kepala sekolah mengesahkan; tanda tangan elektroniknya ikut tercantum. 4) Orang tua menerima pemberitahuan, membaca rapor di portal, dan menyatakan sudah menerima. 5) Siapa pun memindai QR di rapor kertas untuk mencocokkan nilai di halaman verifikasi. |
| Alur alternatif | 2a) Data berubah setelah terbit: panel menandai "berubah setelah terbit"; terbit ulang membuat kode baru, kode lama berstatus diganti, pengesahan diulang. 2b) Semester terkunci: hanya admin yang dapat menerbitkan. |
| Pascakondisi | Rapor resmi dan status pengesahan serta tanda terima tersimpan; QR dapat diverifikasi publik |

### 3.7.3 Menutup semester

| Unsur | Uraian |
|---|---|
| Aktor | Admin |
| Prasyarat | Semester aktif berjalan; backup terbaru tersedia |
| Alur utama | 1) Admin membuka wizard Tutup Semester. 2) Sistem memeriksa kelengkapan: catatan wali, mapel tanpa nilai, remedial terbuka, sesi jadwal, keputusan kenaikan. 3) Admin memilih semester berikutnya. 4) Sistem menyalin status rombel, pembagian mengajar, dan pola jadwal mingguan (melewati hari libur). 5) Pada pergantian tahun ajaran, keputusan kenaikan diterapkan (naik, tinggal, lulus) dengan pemetaan rombel bila perlu. 6) Semester lama dikunci menjadi hanya-baca. |
| Alur alternatif | 2a) Ada kekurangan: admin dapat menunda atau melanjutkan dengan catatan. 6a) Perlu koreksi: admin membuka kunci di menu Semester. |
| Pascakondisi | Semester baru aktif; rapor dan laporan semester lama tetap utuh melalui riwayat rombel |
