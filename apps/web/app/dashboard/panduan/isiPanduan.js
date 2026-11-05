// Isi Panduan Pengguna. Setiap bagian: peran yang melihatnya, tautan ke halaman terkait,
// langkah berurutan, tips, dan tangkapan layar (public/panduan, data contoh dengan nama fiktif). Teks yang sama dipakai untuk dokumen panduan cetak, jadi
// perbarui di sini bila alur halaman berubah.

export const KELOMPOK = [
  { id: "mulai", label: "Mulai di sini", icon: "bi-flag", peran: ["admin", "kepsek", "guru", "siswa", "ortu"] },
  { id: "guru", label: "Guru", icon: "bi-person-video3", peran: ["admin", "kepsek", "guru"] },
  { id: "wali", label: "Wali Kelas", icon: "bi-person-badge", peran: ["admin", "kepsek", "guru"] },
  { id: "pengelola", label: "Admin & Kepala Sekolah", icon: "bi-shield-lock", peran: ["admin", "kepsek"] },
  { id: "ortu", label: "Orang Tua & Siswa", icon: "bi-house-heart", peran: ["admin", "kepsek", "siswa", "ortu"] },
];

export const BAGIAN = [
  // ---------- Mulai di sini ----------
  {
    id: "masuk", kelompok: "mulai", judul: "Masuk pertama kali dan ganti kata sandi", icon: "bi-box-arrow-in-right",
    href: "/dashboard/akun",
    gambar: "/panduan/akun.jpg",
    langkah: [
      "Buka web.saprapor.com di HP atau laptop.",
      "Isi username dan kata sandi dari admin sekolah. Username guru biasanya NIP/NIK, username siswa adalah NISN.",
      "Saat pertama masuk, aplikasi langsung membuka Akun Saya. Isi kata sandi lama (dari admin), lalu kata sandi baru dua kali.",
      "Kata sandi baru minimal 8 karakter dan memuat huruf serta angka. Setelah disimpan, Anda diarahkan ke halaman awal.",
    ],
    tips: [
      "Lupa kata sandi? Minta admin menekan Reset Password di Manajemen Pengguna. Anda akan diberi sandi sementara.",
      "Gagal masuk 5 kali dalam semenit membuat akun dikunci sebentar. Tunggu beberapa menit lalu coba lagi.",
    ],
  },
  {
    id: "pasang", kelompok: "mulai", judul: "Pasang EduRapor di HP", icon: "bi-phone",
    langkah: [
      "Buka EduRapor di Chrome (Android) dan masuk.",
      "Tekan tombol Pasang aplikasi di bagian atas layar, lalu pilih Pasang.",
      "Di iPhone: buka di Safari, tekan Bagikan, lalu Tambah ke Layar Utama.",
      "Ikon EduRapor muncul di layar utama dan terbuka layar penuh seperti aplikasi biasa.",
    ],
    tips: ["Aplikasi tetap butuh internet. Bila sinyal putus, muncul halaman offline; data yang belum disimpan tidak ikut tersimpan."],
  },
  {
    id: "tindakan", kelompok: "mulai", judul: "Perlu Tindakan: daftar pekerjaan Anda", icon: "bi-bell",
    href: "/dashboard/notifikasi",
    gambar: "/panduan/notifikasi.jpg",
    langkah: [
      "Lihat lonceng di kanan atas. Angka merah berarti ada hal mendesak.",
      "Buka Perlu Tindakan untuk melihat daftarnya: remedial yang jatuh tempo, nilai di bawah KKM yang belum punya rencana, presensi yang belum diisi, sesi jadwal yang belum ditandai, catatan wali yang belum lengkap.",
      "Tekan salah satu notifikasi untuk langsung membuka halaman pekerjaannya.",
      "Notifikasi hilang sendiri setelah pekerjaannya selesai.",
    ],
    tips: ["Nyalakan sakelar notifikasi perangkat di halaman Perlu Tindakan agar hal mendesak muncul di HP."],
  },
  {
    id: "cari-menu", kelompok: "mulai", judul: "Menemukan menu dengan cepat", icon: "bi-search",
    langkah: [
      "Di HP, tekan ikon garis tiga di kiri atas untuk membuka menu.",
      "Ketik nama menu di kotak Cari menu (di laptop: tekan Ctrl+K), lalu tekan Enter.",
      "Menu yang tampil menyesuaikan peran Anda. Menu yang tidak ada berarti memang bukan tugas peran Anda.",
    ],
  },

  // ---------- Guru ----------
  {
    id: "nilai", kelompok: "guru", judul: "Input nilai per indikator", icon: "bi-pencil-square",
    href: "/dashboard/nilai",
    gambar: "/panduan/nilai.jpg",
    langkah: [
      "Buka TDU - Jadwal → Input Nilai.",
      "Pilih Kelas, Mata Pelajaran, Periode Akademik, Jenis Penilaian, dan Topik/Materi. Biarkan tipe penilaian Reguler.",
      "Isi Tanggal Penilaian. Memilih tanggal yang sudah pernah dinilai membuka nilai lama untuk diedit.",
      "Centang indikator (IKTP) yang dinilai pada sesi ini. Indikator baru bisa ditambah langsung di sini.",
      "Isi nilai 0–100 per indikator. Tekan Enter untuk pindah ke siswa berikutnya. Kosongkan bila siswa tidak hadir.",
      "Tekan Simpan Nilai Kelas. Nilai materi = rata-rata indikator yang terisi.",
    ],
    tips: [
      "Guru hanya bisa menilai mapel yang ia ampu.",
      "Baris kuning berarti nilai sudah diubah tetapi belum disimpan.",
      "Predikat (Cukup/Baik/Sangat Baik) mengikuti batas KKTP sekolah; tuntas atau tidak mengikuti KKM mapel.",
    ],
  },
  {
    id: "tindak-lanjut", kelompok: "guru", judul: "Tindak lanjut dan remedial", icon: "bi-life-preserver",
    href: "/dashboard/nilai",
    gambar: "/panduan/remedial.jpg",
    langkah: [
      "Setelah nilai disimpan, siswa di bawah KKM memiliki tombol Tindak Lanjut di lembar nilai.",
      "Tekan Tindak Lanjut, pilih bentuknya (mis. Tes Ulang, Tutor Sebaya), tanggal, jam, dan catatan. Centang Masukkan ke Jadwal Pembelajaran bila perlu.",
      "Pada hari pelaksanaan, buka Input Nilai dengan pilihan yang sama, lalu ubah tipe penilaian menjadi Remedial.",
      "Lembar remedial hanya memuat siswa yang punya rencana, dan hanya indikator yang belum tuntas. Isi nilai perbaikannya.",
      "Tekan Simpan Nilai Remedial. Centang kabari orang tua bila hasilnya ingin dikirim lewat WhatsApp.",
    ],
    tips: [
      "Nilai asli tetap tersimpan. Nilai remedial di rapor mengikuti kebijakan sekolah (bawaan: paling tinggi setinggi KKM).",
      "Remedial yang lewat tanggal muncul di Perlu Tindakan sampai nilainya diisi.",
    ],
  },
  {
    id: "import", kelompok: "guru", judul: "Import nilai atau jurnal dari Excel", icon: "bi-file-earmark-arrow-up",
    href: "/dashboard/import-excel",
    langkah: [
      "Buka TDU - Jadwal → Import Excel dan pilih Jenis Data (nilai atau jurnal).",
      "Unduh template. Template nilai sudah berisi daftar siswa dan satu kolom per indikator aktif materi.",
      "Isi template di Excel tanpa mengubah judul kolom, lalu simpan.",
      "Unggah file. Periksa pratinjau; nyalakan Tampilkan hanya baris bermasalah untuk melihat baris yang salah.",
      "Perbaiki baris bermasalah di Excel bila ada, lalu simpan impor.",
    ],
    tips: ["Cocok untuk nilai yang dikerjakan di kertas lalu diketik sekaligus."],
  },
  {
    id: "jurnal", kelompok: "guru", judul: "Menulis jurnal anekdotal", icon: "bi-journal-text",
    href: "/dashboard/jurnal",
    gambar: "/panduan/jurnal.jpg",
    langkah: [
      "Buka TDU - Jadwal → Jurnal.",
      "Pilih jalur konteks: Pembelajaran di Kelas (terkait materi) atau Observasi Perilaku Bebas (istirahat, ekskul, di luar KBM).",
      "Pilih Kelas, Siswa, dan Tanggal, lalu tulis narasi kejadian apa adanya: apa yang dilakukan dan dikatakan siswa.",
      "Pilih mesin analisis (AI atau Heuristik). Aplikasi mengisi nilai dimensi STNKM dari narasi.",
      "Simpan. Jurnal tampil di linimasa dan tabel, dan bisa dikirim ke orang tua lewat WhatsApp.",
    ],
    tips: [
      "Bila AI gagal, analisis otomatis beralih ke Heuristik; jurnal tetap tersimpan.",
      "Orang tua hanya melihat catatan positif di portal.",
    ],
  },
  {
    id: "jadwal", kelompok: "guru", judul: "Jadwal mengajar", icon: "bi-calendar3-week",
    href: "/dashboard/jadwal",
    langkah: [
      "Buka TDU - Jadwal → Jadwal. Pilih tampilan hari, minggu, atau bulan.",
      "Tambah sesi dengan menekan slot kosong di kalender; sesi bisa diulang mingguan pada hari tertentu.",
      "Geser sesi untuk memindahkan waktunya.",
      "Setelah mengajar, buka sesinya dan tandai Selesai (atau Batal). Sesi yang belum ditandai muncul di Perlu Tindakan.",
    ],
  },
  {
    id: "diagnostik-kognitif", kelompok: "guru", judul: "Asesmen diagnostik awal semester", icon: "bi-clipboard2-pulse",
    href: "/dashboard/diagnostik",
    langkah: [
      "Nilai diagnostik diisi lewat Input Nilai seperti biasa, dengan Jenis Penilaian (aktivitas) berjenis Diagnostik.",
      "Buka TDU - Jadwal → Asesmen Diagnostik, tab Kognitif, lalu pilih Semester, Kelas, dan sesi diagnostik.",
      "Siswa dikelompokkan otomatis: perlu pendampingan intensif, siap dengan penguatan, dan siap/mahir, lengkap dengan saran pembelajaran.",
      "Unduh Excel pengelompokan bila perlu untuk menyusun kelompok belajar.",
    ],
    tips: ["Nilai diagnostik tidak masuk rapor, laporan, maupun remedial."],
  },

  // ---------- Wali kelas ----------
  {
    id: "presensi", kelompok: "wali", judul: "Presensi harian", icon: "bi-calendar-check",
    href: "/dashboard/presensi",
    gambar: "/panduan/presensi.jpg",
    langkah: [
      "Buka TDU - Jadwal → Presensi, pilih Kelas dan Periode, lalu tanggal hari ini.",
      "Tekan Tandai Semua Hadir, lalu ubah siswa yang Sakit (S), Izin (I), atau Alpa (A).",
      "Simpan. Panel WhatsApp muncul untuk mengabari orang tua siswa yang tidak hadir dan mengirim rekap ke grup guru/kepala sekolah.",
    ],
    tips: ["Kelas yang belum diisi presensinya hari ini muncul di Perlu Tindakan wali kelas, admin, dan kepala sekolah."],
  },
  {
    id: "diagnostik-nonkognitif", kelompok: "wali", judul: "Diagnostik non-kognitif", icon: "bi-heart-pulse",
    href: "/dashboard/diagnostik",
    langkah: [
      "Buka Asesmen Diagnostik, tab Non-kognitif, lalu pilih Semester dan Kelas.",
      "Isi per siswa: gaya belajar (visual/auditori/kinestetik), minat/bakat, kesejahteraan sosial-emosional, dukungan belajar di rumah, dan catatan.",
      "Simpan. Ringkasan kelas menampilkan profil gaya belajar beserta tips mengajar dan siswa yang perlu perhatian.",
    ],
    tips: ["Data ini pribadi: tidak tampil di rapor maupun portal orang tua."],
  },
  {
    id: "proyek", kelompok: "wali", judul: "Proyek kokurikuler", icon: "bi-stars",
    href: "/dashboard/p5",
    langkah: [
      "Buka TDU - Jadwal → Proyek, pilih Periode dan Kelas.",
      "Buat kegiatan: judul, bentuk kegiatan, deskripsi/fokus, dan target Dimensi Profil Lulusan.",
      "Di tab nilai, tetapkan predikat tiap siswa per dimensi (bisa diambil dari data STNKM).",
      "Di tab catatan, tulis catatan proses tiap siswa, atau buat dengan bantuan AI lalu sunting.",
    ],
  },
  {
    id: "rapor", kelompok: "wali", judul: "Catatan wali dan cetak rapor", icon: "bi-file-earmark-richtext",
    href: "/dashboard/rapor",
    gambar: "/panduan/rapor.jpg",
    langkah: [
      "Buka Laporan → Rapor, pilih Periode, Kelas, dan Peserta Didik.",
      "Periksa pratinjau: nilai akhir, deskripsi capaian (disusun otomatis dari indikator), kehadiran, dan kokurikuler.",
      "Tekan Catatan Wali. Tulis sendiri atau buat dengan AI, sunting, lalu simpan.",
      "Pilih Tanggal Rapor dan Jenis Dokumen, lalu tekan Cetak PDF. Di jendela cetak, pilih printer atau Simpan sebagai PDF.",
      "Gunakan panah siswa sebelumnya/berikutnya untuk berpindah siswa tanpa memilih ulang.",
      "Bila diminta, tekan e-Rapor untuk mengunduh rekap satu kelas (Excel) yang disalin ke aplikasi e-Rapor Dinas.",
    ],
    tips: [
      "Catatan wali yang belum lengkap muncul di Perlu Tindakan.",
      "Setelah menyimpan catatan, panel WhatsApp bisa langsung mengirim ringkasan ke orang tua.",
    ],
  },

  // ---------- Admin & kepala sekolah ----------
  {
    id: "awal-semester", kelompok: "pengelola", judul: "Persiapan awal semester", icon: "bi-calendar-week",
    href: "/dashboard/master-periode",
    langkah: [
      "Referensi Penilaian → Semester: tambahkan semester baru dan atur statusnya Aktif.",
      "Master Data: periksa Master Kelas (wali kelas), Master Siswa (siswa baru dan kenaikan kelas), Master Guru, dan Master Mapel (KKM per mapel).",
      "Referensi Penilaian: lengkapi High Level (Elemen CP), Aktivitas (jenis asesmen diagnostik/formatif/sumatif), serta Materi berisi Tujuan Pembelajaran dan indikatornya.",
      "Pastikan setiap guru punya akun yang terhubung ke data Master Guru (Manajemen Pengguna).",
    ],
    tips: ["Guru juga bisa menambah indikator dan aktivitas untuk mapel yang ia ampu; kepala sekolah hanya melihat."],
  },
  {
    id: "pengguna", kelompok: "pengelola", judul: "Membuat akun guru, siswa, dan orang tua", icon: "bi-people",
    href: "/dashboard/pengguna", peran: ["admin"],
    langkah: [
      "Buka Akun & Sistem → Manajemen Pengguna.",
      "Untuk banyak akun sekaligus, tekan generate guru, siswa, atau orang tua. Username guru memakai NIP/NIK, siswa memakai NISN.",
      "Sandi awal dibuat acak dan hanya ditampilkan sekali. Salin daftarnya lalu bagikan ke masing-masing pemilik akun.",
      "Untuk satu akun, tekan tambah, isi nama, peran, username, dan hubungkan ke data guru/siswa/orang tua.",
      "Bila ada yang lupa sandi, tekan Reset Password pada akunnya.",
    ],
    tips: ["Akun baru wajib mengganti sandi saat pertama masuk. Akun yang dinonaktifkan tidak bisa masuk tetapi datanya tetap ada."],
  },
  {
    id: "pengaturan", kelompok: "pengelola", judul: "Pengaturan sekolah", icon: "bi-gear-fill",
    href: "/dashboard/pengaturan", peran: ["admin"],
    langkah: [
      "Buka Akun & Sistem → Pengaturan Sekolah.",
      "Lengkapi profil sekolah, nama dan tanda tangan kepala sekolah (dipakai di rapor).",
      "Atur batas KKTP (bawaan 70/80/90), kebijakan nilai remedial di rapor, dan skala predikat kokurikuler.",
      "Isi nomor WA kepala sekolah dan Nomor WA Admin (penerima peringatan login gagal). Aktifkan Fonnte bila ingin WhatsApp terkirim otomatis.",
      "Isi API key AI bila ingin memakai analisis AI. Kunci tersimpan terenkripsi.",
    ],
  },
  {
    id: "pantau", kelompok: "pengelola", judul: "Memantau sekolah", icon: "bi-speedometer2",
    href: "/dashboard",
    langkah: [
      "Dashboard: lihat Indikator Perlu Perhatian (ketuntasan terendah) dan Efektivitas Tindak Lanjut.",
      "Laporan → STNKM: rata-rata dimensi per kelas dan siswa, dengan grafik tren.",
      "Perlu Tindakan: rekap seluruh sekolah, termasuk kelas yang belum presensi hari ini.",
      "Akun & Sistem → Log Aktivitas: siapa mengubah apa dan kapan, termasuk nilai sebelum dan sesudah.",
    ],
  },
  {
    id: "backup", kelompok: "pengelola", judul: "Backup dan pemulihan data", icon: "bi-hdd-stack",
    peran: ["admin"],
    langkah: [
      "Backup dibuat otomatis setiap hari setelah pukul 01.00, selama laptop server menyala. Bila laptop mati, backup dibuat begitu laptop menyala lagi.",
      "File tersimpan di folder backups (harian 14 hari terakhir, bulanan 12 bulan) dan ikut tersinkron ke Google Drive.",
      "Periksa sesekali di Google Drive → Komputer → backups/harian bahwa file tanggal terbaru ada.",
      "Pemulihan data dilakukan oleh pengelola teknis dengan perintah di README (bagian Backup data). Jangan menghapus atau memindah file backup secara manual.",
    ],
    tips: ["Sebelum perubahan besar (misalnya kenaikan kelas), minta pengelola teknis membuat backup manual."],
  },

  // ---------- Orang tua & siswa ----------
  {
    id: "portal", kelompok: "ortu", judul: "Melihat perkembangan anak", icon: "bi-house-heart",
    href: "/dashboard/portal",
    langkah: [
      "Masuk dengan akun dari sekolah. Halaman Portal Siswa langsung terbuka.",
      "Ringkasan: kotak Perlu didampingi (remedial terjadwal, mapel di bawah KKM, ketidakhadiran) dan grafik perkembangan nilai.",
      "Capaian TP: per mapel dan materi, indikator mana yang sudah dan belum dikuasai.",
      "Tindak Lanjut: jadwal remedial beserta tips mendampingi anak di rumah.",
      "Jadwal, Kehadiran, dan Catatan Positif dari guru.",
      "Rapor: pratinjau dan cetak rapor setelah dibagikan sekolah.",
    ],
    tips: ["Portal hanya untuk melihat. Hubungi wali kelas bila ada data yang perlu diperbaiki."],
  },
];

// Bagian yang terlihat untuk satu peran
export const bagianUntuk = (role) =>
  BAGIAN.filter((b) => {
    const kelompok = KELOMPOK.find((k) => k.id === b.kelompok);
    return kelompok.peran.includes(role) && (!b.peran || b.peran.includes(role));
  });
