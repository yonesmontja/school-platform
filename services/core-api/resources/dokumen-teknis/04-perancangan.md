# Bab IV Perancangan Sistem

## 4.1 Arsitektur Sistem

SAPrapor memakai arsitektur **klien–server tiga lapis** dalam satu *monorepo*. Lapisan presentasi adalah aplikasi Next.js yang dijalankan di browser, sebagai PWA, atau di dalam aplikasi Android (TWA). Lapisan layanan adalah API REST Laravel yang memegang seluruh aturan bisnis dan hak akses. Lapisan data adalah PostgreSQL untuk data terstruktur, Redis untuk cache dan antrean, serta penyimpanan berkas lokal untuk unggahan. Layanan pendukung berjalan sebagai kontainer terpisah: perender video, pencadangan, dan penjadwal tugas.

Keputusan arsitektural utamanya:

1. **Semua aturan di server.** Browser hanya menampilkan; hak akses, perhitungan STNKM, KKM, kenaikan kelas, dan kunci semester dihitung di API, sehingga tidak dapat dilewati dari klien.
2. **Satu domain.** Next.js meneruskan `/api` ke Laravel, sehingga klien tidak bergantung pada CORS dan token cukup dikirim sebagai header `Authorization: Bearer`.
3. **Logika bisnis dalam *service*.** Controller tipis; perhitungan yang dipakai banyak fitur (STNKM, remedial, riwayat rombel, notifikasi, AI) berada di kelas *service* yang dapat diuji.
4. **AI dipanggil dari server.** Kunci API tersimpan terenkripsi di basis data dan tidak pernah dikirim ke browser.

```diagram
{"jenis":"alir","nomor":"4.1","judul":"Arsitektur logis SAPrapor",
 "kolom_lebar":178,"baris_tinggi":100,
 "kelompok":[
  {"teks":"LAPISAN PRESENTASI (perangkat pengguna)","x1":0,"y1":0,"x2":3,"y2":0},
  {"teks":"WEB — Next.js 16 · React 18","x1":0,"y1":1,"x2":3,"y2":1},
  {"teks":"LAYANAN — Laravel 13 · PHP 8.3","x1":0,"y1":2,"x2":3,"y2":2},
  {"teks":"DATA","x1":0,"y1":3,"x2":3,"y2":3},
  {"teks":"EKSTERNAL","x1":4,"y1":0,"x2":4,"y2":3,"gaya":"aksen"}
 ],
 "simpul":[
  {"id":"br","teks":"Browser / PWA","sub":"AdminLTE · Tabler · Chart.js","x":0,"y":0.1},
  {"id":"sw","teks":"Service worker","sub":"cache halaman & data","x":1,"y":0.1},
  {"id":"idb","teks":"IndexedDB","sub":"antrean offline per akun","x":2,"y":0.1,"bentuk":"db"},
  {"id":"tw","teks":"Aplikasi Android","sub":"Trusted Web Activity","x":3,"y":0.1},
  {"id":"pg","teks":"Server Next.js","sub":"halaman App Router per peran · proxy /api · HTTPS, HSTS, header keamanan","x":1,"y":1.1,"w":330},
  {"id":"mw","teks":"Middleware","sub":"Sanctum · peran · throttle · audit · kunci semester","x":0,"y":2.1,"w":165},
  {"id":"ct","teks":"Controller API","sub":"±80 controller, rute per peran","x":1,"y":2.1},
  {"id":"sv","teks":"Service","sub":"STNKM, remedial, rapor, AI, notifikasi","x":2,"y":2.1},
  {"id":"sc","teks":"Scheduler","sub":"status sesi, arsip log, pantau situs","x":3,"y":2.1},
  {"id":"db","teks":"PostgreSQL 16","sub":"data akademik & administrasi","x":0.5,"y":3.1,"bentuk":"db","w":160},
  {"id":"rd","teks":"Redis 7","sub":"cache · batas laju","x":1.6,"y":3.1,"bentuk":"db","w":140},
  {"id":"st","teks":"Penyimpanan berkas","sub":"privat + tautan bertanda tangan","x":2.7,"y":3.1,"bentuk":"db","w":160},
  {"id":"ai","teks":"Penyedia AI","sub":"Gemini · Claude · Qwen · DeepSeek · OpenKey","x":4,"y":0.6,"bentuk":"awan","w":160},
  {"id":"wa","teks":"WhatsApp","sub":"Fonnte / wa.me","x":4,"y":1.6,"bentuk":"awan","w":160},
  {"id":"vr","teks":"video-render","sub":"Remotion · Revideo · Piper; mengambil antrean dari API","x":4,"y":2.6,"w":160}
 ],
 "panah":[
  {"dari":"br","ke":"pg"},{"dari":"tw","ke":"pg"},{"dari":"sw","ke":"br","putus":true},{"dari":"idb","ke":"sw","putus":true,"panah":"dua"},
  {"dari":"pg","ke":"mw"},
  {"dari":"mw","ke":"ct"},{"dari":"ct","ke":"sv"},{"dari":"sv","ke":"db"},{"dari":"sv","ke":"rd"},{"dari":"sv","ke":"st"},{"dari":"sc","ke":"sv","putus":true},
  {"dari":"sv","ke":"ai","putus":true},{"dari":"sv","ke":"wa","putus":true}
 ]}
```

## 4.2 Arsitektur Fisik (Deployment)

Seluruh layanan berjalan sebagai kontainer Docker di satu komputer sekolah. Akses dari internet melalui **Cloudflare named tunnel**, sehingga komputer sekolah tidak perlu IP publik maupun membuka port; semua port Docker hanya terikat ke `127.0.0.1`. Jalur kerja (`web-dev`, port 3001) dan API uji (`core-api-e2e`, port 8090, basis data `school_platform_e2e`) dijalankan hanya bila diperlukan.

```diagram
{"jenis":"alir","nomor":"4.2","judul":"Diagram deployment",
 "kolom_lebar":172,"baris_tinggi":96,
 "kelompok":[
  {"teks":"KOMPUTER SEKOLAH — Docker host (port terikat 127.0.0.1)","x1":1,"y1":0,"x2":4,"y2":3},
  {"teks":"PENYIMPANAN","x1":5,"y1":2,"x2":5,"y2":3,"gaya":"aksen"}
 ],
 "simpul":[
  {"id":"hp","teks":"HP / laptop pengguna","x":0,"y":0.1,"bentuk":"aktor"},
  {"id":"cf","teks":"Cloudflare","sub":"web.saprapor.com · HTTPS","x":0,"y":1.7,"bentuk":"awan","w":150},
  {"id":"tn","teks":"cloudflared","sub":"named tunnel","x":1,"y":0.3,"w":140},
  {"id":"web","teks":"web :3000","sub":"Next.js build produksi","x":2,"y":0.3,"gaya":"utama","w":150},
  {"id":"api","teks":"core-api :8000","sub":"Laravel, kode bind mount","x":3,"y":0.3,"gaya":"utama","w":150},
  {"id":"e2e","teks":"core-api-e2e :8090","sub":"profil e2e, DB uji","x":4,"y":0.3,"gaya":"lemah","w":150},
  {"id":"dev","teks":"web-dev :3001","sub":"profil dev (menyunting)","x":1,"y":1.3,"gaya":"lemah","w":140},
  {"id":"ai","teks":"ai-engine :8001","sub":"Django (cadangan)","x":2,"y":1.3,"gaya":"lemah","w":150},
  {"id":"sch","teks":"scheduler","sub":"tugas terjadwal","x":4,"y":1.3,"w":150},
  {"id":"rd","teks":"redis :6379","x":2,"y":2.3,"bentuk":"db","w":130},
  {"id":"db","teks":"db :5432","sub":"PostgreSQL 16","x":3,"y":2.3,"bentuk":"db","w":140},
  {"id":"vr","teks":"video-render","sub":"antrean render","x":4,"y":2.3,"w":150},
  {"id":"bk","teks":"db-backup","sub":"harian 01.00 WIT","x":3,"y":3.3,"w":150},
  {"id":"bf","teks":"backups/","sub":"harian 14 hari · bulanan 12 bulan","x":5,"y":2.4,"bentuk":"db","w":150},
  {"id":"gd","teks":"Google Drive","sub":"salinan di luar laptop","x":5,"y":3.4,"bentuk":"awan","w":150}
 ],
 "panah":[
  {"dari":"hp","ke":"cf"},{"dari":"cf","ke":"tn","panah":"dua"},
  {"dari":"tn","ke":"web"},{"dari":"web","ke":"api","teks":"/api"},
  {"dari":"api","ke":"db"},{"dari":"api","ke":"rd"},{"dari":"sch","ke":"api","putus":true},
  {"dari":"vr","ke":"api","putus":true},{"dari":"bk","ke":"db","putus":true},{"dari":"bk","ke":"bf"},{"dari":"bf","ke":"gd","putus":true,"teks":"sinkron"}
 ]}
```

| Kontainer | Peran | Catatan |
|---|---|---|
| `web` | Situs publik (build produksi) | Diganti hanya bila semua tes lulus (`infra/terbitkan.sh`) |
| `web-dev` | Jalur kerja pengembang | Perubahan langsung terlihat; memakai API dan basis data yang sama |
| `core-api` | API Laravel | Kode di-*bind mount*; vendor di volume Docker agar cepat |
| `core-api-e2e` | API untuk tes end-to-end | Basis data `school_platform_e2e` diisi sekolah fiktif setiap tes |
| `scheduler` | Tugas terjadwal | Status sesi tiap menit, arsip log, pemantau uptime tiap 5 menit |
| `video-render` | Perender video | Remotion dan Revideo, suara Piper lokal |
| `db`, `redis` | Penyimpanan | PostgreSQL 16, Redis 7 |
| `db-backup` | Pencadangan | Dump diverifikasi sebelum disimpan; uji pulih tersedia |
| `cloudflared` | Tunnel publik | Token di `infra/.env`, tidak masuk repo |

## 4.3 Perancangan Basis Data

Basis data relasional dirancang dengan tiga kelompok tabel: **master** (siswa, guru, rombel, mapel, periode, referensi), **kurikulum** (CP, ATP, materi, indikator, modul), dan **transaksi** (berawalan `trans_`: nilai, jurnal, presensi, remedial, rapor, kenaikan, portofolio). Keputusan desain penting:

- **Riwayat per semester.** Keanggotaan rombel (`siswa_rombel`), wali kelas (`wali_kelas_periode`), dan pengampu (`pengampu_mapel`) disimpan per periode. Rapor dan laporan semester lama membaca riwayat ini sehingga tetap utuh setelah siswa naik kelas.
- **Nilai bertanggal dan bertingkat.** `trans_nilai` menyimpan nilai materi per tanggal beserta poin STNKM; `trans_nilai_indikator` menyimpan rincian per indikator.
- **Pemisahan guru penilai dan akun pengisi.** Setiap transaksi mencatat guru yang bertanggung jawab (`id_guru`) dan akun yang mengetik (`diisi_oleh`/`dicatat_oleh`).
- **Cuplikan untuk dokumen resmi.** Rapor resmi (`trans_rapor_terbit`) dan butir paket soal menyimpan salinan isi saat diterbitkan, sehingga dokumen yang sudah dibagikan tidak berubah diam-diam; sidik (hash) dipakai untuk mendeteksi perubahan.
- **Audit dua tingkat.** `log_aktivitas` mencatat tindakan; `log_perubahan` mencatat nilai lama dan baru per baris data.

```diagram
{"jenis":"alir","nomor":"4.3","judul":"ERD konseptual: struktur sekolah dan riwayat per semester",
 "kolom_lebar":205,"baris_tinggi":150,
 "simpul":[
  {"id":"us","teks":"users","bentuk":"entitas","x":0,"y":0,"kolom":["PK id","username, role, aktif","FK id_guru / id_siswa","FK id_ortu / id_wali","wajib_ganti_password"]},
  {"id":"gu","teks":"teachers","bentuk":"entitas","x":1,"y":0,"kolom":["PK id_guru","nama_guru, nip_nik","no_wa, ttd_guru_url"]},
  {"id":"pm","teks":"pengampu_mapel","bentuk":"entitas","x":2,"y":0,"kolom":["PK id","FK id_periode","FK id_kelas","FK id_mapel","FK id_guru"]},
  {"id":"mp","teks":"subjects","bentuk":"entitas","x":3,"y":0,"kolom":["PK id_mapel","nama_mapel, kelompok","kkm, FK id_guru (bawaan)"]},
  {"id":"si","teks":"students","bentuk":"entitas","x":0,"y":1,"kolom":["PK id_siswa","nisn, nama_siswa","FK id_kelas (aktif)","FK id_ortu, id_wali","status_siswa"]},
  {"id":"sr","teks":"siswa_rombel","bentuk":"entitas","x":1,"y":1,"kolom":["PK id","FK id_siswa","FK id_periode","FK id_kelas"]},
  {"id":"kl","teks":"classes","bentuk":"entitas","x":2,"y":1,"kolom":["PK id_kelas","nama_kelas, tingkat","wali_kelas (aktif)"]},
  {"id":"wk","teks":"wali_kelas_periode","bentuk":"entitas","x":3,"y":1,"kolom":["PK id","FK id_kelas","FK id_periode","FK id_guru"]},
  {"id":"or","teks":"master_ortu / master_wali","bentuk":"entitas","x":0,"y":2,"w":190,"kolom":["PK id_ortu / id_wali","nama, pekerjaan","no_wa, alamat"]},
  {"id":"pe","teks":"master_periode","bentuk":"entitas","x":1.5,"y":2,"kolom":["PK id_periode","tahun_ajaran, semester","status_aktif","terkunci, dikunci_pada"]}
 ],
 "panah":[
  {"dari":"us","ke":"gu","panah":"tanpa","kardinal":["0..1","1"]},
  {"dari":"us","ke":"si","panah":"tanpa","kardinal":["0..1","1"]},
  {"dari":"si","ke":"or","panah":"tanpa","kardinal":["N","1"]},
  {"dari":"si","ke":"sr","panah":"tanpa","kardinal":["1","N"]},
  {"dari":"sr","ke":"kl","panah":"tanpa","kardinal":["N","1"]},
  {"dari":"sr","ke":"pe","panah":"tanpa","kardinal":["N","1"]},
  {"dari":"kl","ke":"wk","panah":"tanpa","kardinal":["1","N"]},
  {"dari":"wk","ke":"pe","panah":"tanpa","kardinal":["N","1"],"siku":"v"},
  {"dari":"pm","ke":"gu","panah":"tanpa","kardinal":["N","1"]},
  {"dari":"pm","ke":"mp","panah":"tanpa","kardinal":["N","1"]},
  {"dari":"pm","ke":"kl","panah":"tanpa","kardinal":["N","1"]}
 ]}
```

```diagram
{"jenis":"alir","nomor":"4.4","judul":"ERD konseptual: kurikulum, penilaian, dan pelaporan",
 "kolom_lebar":205,"baris_tinggi":158,
 "simpul":[
  {"id":"ma","teks":"master_materi (TP)","bentuk":"entitas","x":0,"y":0,"w":190,"kolom":["PK id_materi","FK id_mapel, id_kelas","FK id_periode","nama_materi","mat_S … mat_M (bobot)"]},
  {"id":"in","teks":"master_indikator","bentuk":"entitas","x":1,"y":0,"kolom":["PK id_indikator","FK id_materi","deskripsi, urutan","aktif"]},
  {"id":"ni","teks":"trans_nilai_indikator","bentuk":"entitas","x":2,"y":0,"w":185,"kolom":["PK id","FK id_nilai","FK id_indikator","nilai"]},
  {"id":"rr","teks":"trans_rencana_remedial","bentuk":"entitas","x":3,"y":0,"w":190,"kolom":["PK id_rencana","FK id_nilai_asal","opsi_tindakan, status","tanggal_rencana","FK id_jadwal, bukti_url"]},
  {"id":"nl","teks":"trans_nilai","bentuk":"entitas","x":1.5,"y":1,"w":195,"kolom":["PK id_nilai","FK id_siswa, id_kelas","FK id_mapel, id_materi","FK id_periode, id_jenis","FK id_guru, diisi_oleh","tanggal, nilai, tipe_nilai","poin_S … poin_M"]},
  {"id":"jr","teks":"trans_jurnal","bentuk":"entitas","x":0,"y":1.1,"w":190,"kolom":["PK id_jurnal","FK id_siswa, id_kelas","FK id_guru, dicatat_oleh","narasi_kejadian, sensitif","val_S … val_M, ai_mode"]},
  {"id":"pr","teks":"trans_presensi","bentuk":"entitas","x":3,"y":1.1,"w":190,"kolom":["PK id_presensi","FK id_siswa, id_kelas","FK id_periode","tanggal, status_kehadiran","keterangan → FK id_jurnal"]},
  {"id":"si","teks":"students","bentuk":"entitas","x":1.5,"y":2,"w":160,"kolom":["PK id_siswa","nisn, nama_siswa"]},
  {"id":"rt","teks":"trans_rapor_terbit","bentuk":"entitas","x":3,"y":2,"w":190,"kolom":["PK id","FK id_siswa, id_periode","versi, status","kode_verifikasi","ringkasan (cuplikan), sidik"]},
  {"id":"kn","teks":"trans_kenaikan","bentuk":"entitas","x":0,"y":2,"w":190,"kolom":["PK id","FK id_siswa, id_periode","keputusan, ke_tingkat","disahkan, diterapkan_pada"]}
 ],
 "panah":[
  {"dari":"ma","ke":"in","panah":"tanpa","kardinal":["1","N"]},
  {"dari":"in","ke":"ni","panah":"tanpa","kardinal":["1","N"]},
  {"dari":"nl","ke":"ni","panah":"tanpa","kardinal":["1","N"]},
  {"dari":"nl","ke":"ma","panah":"tanpa","kardinal":["N","1"]},
  {"dari":"nl","ke":"rr","panah":"tanpa","kardinal":["1","0..N"]},
  {"dari":"si","ke":"nl","panah":"tanpa","kardinal":["1","N"]},
  {"dari":"si","ke":"jr","panah":"tanpa","kardinal":["1","N"]},
  {"dari":"si","ke":"pr","panah":"tanpa","kardinal":["1","N"]},
  {"dari":"si","ke":"rt","panah":"tanpa","kardinal":["1","N"]},
  {"dari":"si","ke":"kn","panah":"tanpa","kardinal":["1","N"]}
 ]}
```

Daftar lengkap tabel beserta jumlah kolomnya dihitung langsung dari basis data dan disajikan pada Lampiran B.

## 4.4 Perancangan Proses: Diagram Urutan

### 4.4.1 Masuk dan permintaan berotorisasi

```diagram
{"jenis":"urutan","nomor":"4.5","judul":"Diagram urutan: masuk, token, dan pemeriksaan hak akses","jarak":168,
 "peserta":["Pengguna","Web (Next.js)","API (Laravel)","Middleware","PostgreSQL"],
 "pesan":[
  {"dari":0,"ke":1,"teks":"username + kata sandi"},
  {"dari":1,"ke":2,"teks":"POST /api/login"},
  {"dari":2,"ke":2,"teks":"batas percobaan akun+IP"},
  {"dari":2,"ke":4,"teks":"cek akun aktif & hash sandi"},
  {"mulai":"alt","teks":"sandi benar"},
  {"dari":2,"ke":1,"teks":"token Sanctum (7 hari) + peran","balas":true},
  {"dari":1,"ke":0,"teks":"halaman awal sesuai peran; ganti sandi bila wajib","balas":true},
  {"lain":"sandi salah"},
  {"dari":2,"ke":4,"teks":"catat login gagal (log aktivitas)"},
  {"dari":2,"ke":1,"teks":"422 / 429 bila ditahan","balas":true},
  {"selesai":true},
  {"dari":0,"ke":1,"teks":"membuka halaman / menyimpan data"},
  {"dari":1,"ke":2,"teks":"/api/... Authorization: Bearer"},
  {"dari":2,"ke":3,"teks":"auth:sanctum, peran, throttle, kunci semester"},
  {"mulai":"alt","teks":"berhak"},
  {"dari":3,"ke":4,"teks":"query terbatas mapel/rombel pengguna"},
  {"dari":3,"ke":1,"teks":"200 + data; perubahan dicatat sebelum→sesudah","balas":true},
  {"lain":"tidak berhak / peninjau menulis"},
  {"dari":3,"ke":1,"teks":"403 (percobaan ditolak dicatat)","balas":true},
  {"selesai":true}
 ]}
```

### 4.4.2 Menyimpan nilai saat offline

```diagram
{"jenis":"urutan","nomor":"4.6","judul":"Diagram urutan: nilai offline, sinkronisasi, dan penanganan bentrok","jarak":165,
 "peserta":["Guru","Halaman Input Nilai","Antrean (IndexedDB)","API (Laravel)","PostgreSQL"],
 "pesan":[
  {"dari":0,"ke":1,"teks":"isi nilai per indikator, Simpan"},
  {"mulai":"alt","teks":"tidak ada sinyal"},
  {"dari":1,"ke":2,"teks":"simpan kiriman + waktu lembar dibuka"},
  {"dari":1,"ke":0,"teks":"\"Disimpan di HP\", ikon awan bertambah","balas":true},
  {"lain":"ada sinyal"},
  {"dari":1,"ke":3,"teks":"POST /nilai/batch"},
  {"selesai":true},
  {"catatan":"Saat tersambung kembali, antrean dikirim otomatis berurutan per akun","di":[1,3]},
  {"dari":2,"ke":3,"teks":"kirim ulang kiriman tertunda"},
  {"dari":3,"ke":4,"teks":"bandingkan waktu ubah terakhir"},
  {"mulai":"alt","teks":"tidak berubah sejak dibuka"},
  {"dari":3,"ke":4,"teks":"simpan nilai, hitung poin STNKM"},
  {"dari":3,"ke":2,"teks":"200 → hapus dari antrean","balas":true},
  {"lain":"diubah akun lain"},
  {"dari":3,"ke":2,"teks":"409 + nilai di server","balas":true},
  {"dari":2,"ke":0,"teks":"tampilkan dua versi: Timpa atau Buang","balas":true},
  {"dari":0,"ke":3,"teks":"Timpa (paksa=true)"},
  {"selesai":true}
 ]}
```

### 4.4.3 Draf AI dengan persetujuan kepala sekolah

```diagram
{"jenis":"urutan","nomor":"4.7","judul":"Diagram urutan: penyusunan perangkat ajar atau soal berbantuan AI","jarak":160,
 "peserta":["Guru","API (Laravel)","Pustaka Dokumen","Penyedia AI","Kepala sekolah"],
 "pesan":[
  {"dari":0,"ke":1,"teks":"minta draf (CP/ATP/modul/soal) untuk TP terpilih"},
  {"dari":1,"ke":2,"teks":"cari bagian dokumen resmi relevan (full-text)"},
  {"dari":2,"ke":1,"teks":"rujukan pustaka","balas":true},
  {"dari":1,"ke":1,"teks":"susun prompt: TP, capaian kelas agregat, contoh teruji; tanpa nama siswa"},
  {"dari":1,"ke":3,"teks":"panggil penyedia pilihan guru"},
  {"dari":3,"ke":1,"teks":"draf JSON","balas":true},
  {"dari":1,"ke":1,"teks":"validasi & bersihkan (SVG, HTML)"},
  {"dari":1,"ke":0,"teks":"draf berstatus Draf","balas":true},
  {"dari":0,"ke":1,"teks":"sunting, lalu Ajukan"},
  {"dari":1,"ke":4,"teks":"muncul di Perlu Tindakan"},
  {"mulai":"alt","teks":"disetujui"},
  {"dari":4,"ke":1,"teks":"Setujui (versi dikunci, TP usulan masuk referensi)"},
  {"lain":"perlu revisi"},
  {"dari":4,"ke":1,"teks":"Kembalikan + catatan"},
  {"dari":1,"ke":0,"teks":"notifikasi revisi","balas":true},
  {"selesai":true}
 ]}
```

## 4.5 Perancangan Proses: Diagram Aktivitas

### 4.5.1 Siklus pembelajaran satu semester

```diagram
{"jenis":"alir","nomor":"4.8","judul":"Diagram aktivitas siklus pembelajaran satu semester",
 "kolom_lebar":200,"baris_tinggi":80,
 "kelompok":[
  {"teks":"KEPALA SEKOLAH","x1":0,"y1":0,"x2":0,"y2":8},
  {"teks":"GURU / WALI KELAS","x1":1,"y1":0,"x2":2,"y2":8},
  {"teks":"SISTEM","x1":3,"y1":0,"x2":3,"y2":8,"gaya":"aksen"}
 ],
 "simpul":[
  {"id":"m","bentuk":"mulai","x":1.5,"y":0.25},
  {"id":"a1","teks":"Susun CP, ATP, modul ajar","x":1.5,"y":1,"bentuk":"bulat","w":200},
  {"id":"k1","teks":"Setujui perangkat ajar","x":0,"y":1,"bentuk":"bulat","w":170},
  {"id":"a2","teks":"Asesmen diagnostik","x":1.5,"y":2,"bentuk":"bulat","w":200},
  {"id":"s1","teks":"Kelompokkan siswa menurut KKTP","x":3,"y":2,"bentuk":"bulat","w":175},
  {"id":"a3","teks":"Mengajar sesuai jadwal; jurnal & presensi","x":1.5,"y":3,"bentuk":"bulat","w":210},
  {"id":"a4","teks":"Asesmen formatif per indikator","x":1.5,"y":4,"bentuk":"bulat","w":200},
  {"id":"s2","teks":"Hitung STNKM, KKTP, ketuntasan","x":3,"y":4,"bentuk":"bulat","w":175},
  {"id":"d1","teks":"Tuntas?","x":1.5,"y":5,"bentuk":"keputusan","w":110,"h":56},
  {"id":"a5","teks":"Remedial per indikator","x":2.5,"y":5,"bentuk":"bulat","w":150},
  {"id":"a6","teks":"Asesmen sumatif; catatan wali","x":1.5,"y":6,"bentuk":"bulat","w":200},
  {"id":"s3","teks":"Susun deskripsi rapor otomatis","x":3,"y":6,"bentuk":"bulat","w":175},
  {"id":"a7","teks":"Terbitkan rapor resmi","x":1.5,"y":7,"bentuk":"bulat","w":200},
  {"id":"k2","teks":"Sahkan rapor","x":0,"y":7,"bentuk":"bulat","w":150},
  {"id":"e","bentuk":"akhir","x":1.5,"y":7.85}
 ],
 "panah":[
  {"dari":"m","ke":"a1"},{"dari":"a1","ke":"k1","teks":"ajukan"},{"dari":"k1","ke":"a2","siku":"v"},
  {"dari":"a2","ke":"s1","putus":true},{"dari":"a2","ke":"a3"},{"dari":"a3","ke":"a4"},
  {"dari":"a4","ke":"s2","putus":true},{"dari":"a4","ke":"d1"},
  {"dari":"d1","ke":"a5","teks":"tidak"},{"dari":"a5","ke":"a4","teks":"ulang","lewat":[[2.5,4.5],[1.62,4.5]]},
  {"dari":"d1","ke":"a6","teks":"ya"},{"dari":"a6","ke":"s3","putus":true},{"dari":"a6","ke":"a7"},
  {"dari":"a7","ke":"k2"},{"dari":"k2","ke":"e","siku":"v"}
 ]}
```

### 4.5.2 Pergantian semester dan kenaikan kelas

```diagram
{"jenis":"alir","nomor":"4.9","judul":"Diagram aktivitas Tutup Semester dan kenaikan kelas",
 "kolom_lebar":210,"baris_tinggi":82,
 "simpul":[
  {"id":"m","bentuk":"mulai","x":1,"y":0.2},
  {"id":"b","teks":"Backup basis data & periksa dump","x":1,"y":1,"bentuk":"bulat","w":220},
  {"id":"c","teks":"Periksa kelengkapan","sub":"catatan wali, nilai, remedial, sesi, kenaikan","x":1,"y":2,"bentuk":"bulat","w":230},
  {"id":"d","teks":"Lengkap?","x":1,"y":3,"bentuk":"keputusan","w":110,"h":56},
  {"id":"f","teks":"Lengkapi atau catat pengecualian","x":0,"y":3,"bentuk":"bulat","w":190},
  {"id":"g","teks":"Pilih semester berikutnya","x":1,"y":4,"bentuk":"bulat","w":220},
  {"id":"h","teks":"Ganti tahun ajaran?","x":1,"y":5,"bentuk":"keputusan","w":130,"h":60},
  {"id":"i","teks":"Terapkan keputusan kenaikan","sub":"naik · tinggal · lulus → alumni","x":2,"y":5,"bentuk":"bulat","w":200},
  {"id":"j","teks":"Pemetaan rombel","sub":"bagi rata L/P bila rombel > 1","x":2,"y":6,"bentuk":"bulat","w":200},
  {"id":"k","teks":"Salin rombel, pengampu, pola jadwal","x":1,"y":6.6,"bentuk":"bulat","w":220},
  {"id":"l","teks":"Kunci semester lama (hanya baca)","x":1,"y":7.6,"bentuk":"bulat","w":220},
  {"id":"e","bentuk":"akhir","x":1,"y":8.4}
 ],
 "panah":[
  {"dari":"m","ke":"b"},{"dari":"b","ke":"c"},{"dari":"c","ke":"d"},
  {"dari":"d","ke":"f","teks":"tidak"},{"dari":"f","ke":"c","siku":"v"},
  {"dari":"d","ke":"g","teks":"ya"},{"dari":"g","ke":"h"},
  {"dari":"h","ke":"i","teks":"ya"},{"dari":"i","ke":"j"},{"dari":"j","ke":"k","siku":"v"},
  {"dari":"h","ke":"k","teks":"tidak"},{"dari":"k","ke":"l"},{"dari":"l","ke":"e"}
 ]}
```

## 4.6 Perancangan Status Objek

Banyak objek di SAPrapor memiliki daur hidup yang diatur ketat agar dokumen yang sudah disetujui atau dibagikan tidak berubah tanpa jejak.

```diagram
{"jenis":"alir","nomor":"4.10","judul":"Diagram status soal, ATP, dan modul ajar",
 "kolom_lebar":215,"baris_tinggi":92,
 "simpul":[
  {"id":"m","bentuk":"mulai","x":0,"y":0.5},
  {"id":"dr","teks":"Draf","sub":"dibuat guru / AI","x":1,"y":0.5,"bentuk":"bulat","w":130},
  {"id":"dj","teks":"Diajukan","sub":"di Perlu Tindakan","x":2,"y":0.5,"bentuk":"bulat","w":130},
  {"id":"st","teks":"Disetujui","sub":"dipakai di kelas","x":3,"y":0.5,"bentuk":"bulat","w":130,"gaya":"aksen"},
  {"id":"rv","teks":"Perlu revisi","sub":"dengan catatan","x":2,"y":1.6,"bentuk":"bulat","w":130},
  {"id":"kc","teks":"Terkunci","sub":"setelah versi 3","x":4,"y":0.5,"bentuk":"bulat","w":130,"gaya":"lemah"}
 ],
 "panah":[
  {"dari":"m","ke":"dr"},{"dari":"dr","ke":"dj","teks":"ajukan"},{"dari":"dj","ke":"st","teks":"setujui"},
  {"dari":"dj","ke":"rv","teks":"kembalikan"},{"dari":"rv","ke":"dr","teks":"sunting","lewat":[[0.85,1.6]]},
  {"dari":"dj","ke":"dr","teks":"tarik","lewat":[[1.5,-0.25]]},
  {"dari":"st","ke":"dr","teks":"disunting → versi naik","lewat":[[3,2.4],[1.15,2.4]],"putus":true},
  {"dari":"st","ke":"kc","teks":"versi 3"}
 ]}
```

```diagram
{"jenis":"alir","nomor":"4.11","judul":"Diagram status rapor resmi ber-QR",
 "kolom_lebar":220,"baris_tinggi":92,
 "simpul":[
  {"id":"m","bentuk":"mulai","x":0,"y":0.5},
  {"id":"tb","teks":"Terbit","sub":"QR + TTE wali","x":1,"y":0.5,"bentuk":"bulat","w":130},
  {"id":"sh","teks":"Disahkan","sub":"TTE kepala sekolah","x":2,"y":0.5,"bentuk":"bulat","w":130,"gaya":"aksen"},
  {"id":"dt","teks":"Diterima orang tua","sub":"tanggapan tercatat","x":3,"y":0.5,"bentuk":"bulat","w":140,"gaya":"aksen"},
  {"id":"br","teks":"Berubah setelah terbit","sub":"sidik tidak cocok","x":2,"y":1.6,"bentuk":"bulat","w":160},
  {"id":"dg","teks":"Diganti","sub":"kode lama tetap terverifikasi sebagai versi lama","x":3.2,"y":1.6,"bentuk":"bulat","w":170,"gaya":"lemah"}
 ],
 "panah":[
  {"dari":"m","ke":"tb","teks":"terbitkan"},{"dari":"tb","ke":"sh","teks":"sahkan"},{"dari":"sh","ke":"dt","teks":"konfirmasi"},
  {"dari":"tb","ke":"br","putus":true,"teks":"nilai berubah"},{"dari":"sh","ke":"br","putus":true},
  {"dari":"br","ke":"dg","teks":"terbitkan ulang"},{"dari":"dg","ke":"tb","teks":"versi baru","lewat":[[3.2,2.45],[1,2.45]]}
 ]}
```

## 4.7 Perancangan Antarmuka

Antarmuka dirancang untuk guru yang lebih sering memakai HP daripada komputer:

1. **Menu mengikuti alur kerja**, bukan struktur tabel: Perencanaan Ajar, Kegiatan Harian, Asesmen, Rapor & Kelas, Laporan, Administrasi Sekolah, serta Akun & Sistem. Menu disaring per peran, dapat dilipat, dan dapat dicari dengan Ctrl+K.
2. **Perlu Tindakan sebagai pintu masuk**: lonceng dan halaman yang menampilkan pekerjaan nyata yang tertunda, dihitung dari data.
3. **Mode HP "Hari Ini"**: sesi mengajar hari ini dengan presensi, jurnal, dan nilai sekali ketuk.
4. **Konsistensi pengisi**: komponen *Pengisi* menampilkan guru yang bertanggung jawab dan akun pengisi bila berbeda, di semua jenis data.
5. **Tema**: gaya Tabler (bawaan) atau Klasik, mode terang/gelap/otomatis, warna aksen; kertas rapor tidak ikut berubah.
6. **Dokumen resmi**: kop sekolah, tanda tangan, nomor halaman, dan QR pada setiap cetakan; ekspor PDF dan Excel di tabel utama.
7. **Panduan dalam aplikasi** per peran dengan tautan langsung ke halaman, serta Peta Kerja yang menunjukkan langkah berikutnya dari data nyata.
