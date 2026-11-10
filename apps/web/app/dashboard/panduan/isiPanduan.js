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
      "Isi username dan kata sandi dari admin sekolah, lalu tekan Masuk. Username guru biasanya NIP/NIK, username siswa adalah NISN. Tekan ikon mata untuk melihat kata sandi yang Anda ketik.",
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
    tips: ["Halaman yang pernah dibuka tetap bisa dibuka saat sinyal putus. Lihat bagian Mengisi saat sinyal putus."],
  },
  {
    id: "offline", kelompok: "mulai", judul: "Mengisi saat sinyal putus (offline)", icon: "bi-wifi-off",
    langkah: [
      "Saat aplikasi dibuka dengan sinyal, EduRapor otomatis menyiapkan halaman Input Nilai, Jurnal, dan Presensi beserta data kelas Anda di HP (sekali sehari, di latar belakang). Bila memakai aplikasi terpasang, buka sekali saat ada sinyal setiap pagi.",
      "Bila sinyal putus, pita kuning Anda sedang offline muncul. Isi nilai, jurnal, atau presensi seperti biasa lalu tekan Simpan.",
      "Muncul pesan Disimpan di HP, dan ikon awan dengan angka di bagian atas menunjukkan jumlah kiriman yang menunggu.",
      "Begitu tersambung lagi, kiriman terkirim otomatis dan muncul pesan berhasil dikirim. Tekan ikon awan untuk melihat daftarnya atau Kirim sekarang.",
    ],
    tips: [
      "Jangan keluar (logout) sebelum kiriman terkirim. Kiriman tersimpan per akun di HP itu.",
      "Bila kiriman ditolak server (misalnya data sudah diubah orang lain), tandanya merah di daftar. Periksa lalu isi ulang atau buang.",
      "Jurnal yang ditulis offline dianalisis STNKM saat terkirim. Kabar WhatsApp dikirim setelah tersambung, dari linimasa atau lembar presensi.",
    ],
  },
  {
    id: "tindakan", kelompok: "mulai", judul: "Perlu Tindakan: daftar pekerjaan Anda", icon: "bi-bell",
    href: "/dashboard/notifikasi",
    gambar: "/panduan/notifikasi.jpg",
    langkah: [
      "Lihat lonceng di kanan atas. Angka merah berarti ada hal mendesak.",
      "Buka Perlu Tindakan untuk melihat daftarnya: remedial yang jatuh tempo, nilai di bawah KKM yang belum punya rencana, presensi yang belum diisi, sesi jadwal yang belum ditandai, catatan wali yang belum lengkap.",
      "Tekan Buka untuk langsung membuka pekerjaannya. Untuk nilai dan remedial, lembar nilai yang dimaksud langsung terbuka dengan siswanya disorot biru.",
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
      "Pilih Kelas, Mata Pelajaran, Periode Akademik, Jenis Penilaian, dan Topik/Materi. Biarkan tipe penilaian Reguler. Bila Anda punya jadwal mengajar hari ini, kelas, mapel, dan materinya sudah terisi otomatis.",
      "Isi Tanggal Penilaian. Memilih tanggal yang sudah pernah dinilai membuka nilai lama untuk diedit.",
      "Centang indikator (IKTP) yang dinilai pada sesi ini. Indikator baru bisa ditambah langsung di sini.",
      "Isi nilai 0–100 per indikator. Tekan Enter untuk pindah ke siswa berikutnya. Kosongkan bila siswa tidak hadir.",
      "Tekan Simpan Nilai Kelas. Nilai materi = rata-rata indikator yang terisi.",
    ],
    tips: [
      "Guru hanya bisa menilai mapel yang ia ampu. Guru yang mengampu satu mapel langsung mendapati mapelnya terpilih.",
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
      "Simpan bukti pelaksanaan: tekan status rencana di kolom Tindak Lanjut, lalu Unggah berkas (foto, PDF) atau tempel tautan Google Drive di bagian Bukti pelaksanaan.",
    ],
    tips: [
      "Nilai asli tetap tersimpan. Nilai remedial di rapor mengikuti kebijakan sekolah (bawaan: paling tinggi setinggi KKM).",
      "Remedial yang lewat tanggal muncul di Perlu Tindakan sampai nilainya diisi.",
      "Bila rencana masuk Jadwal, bukti disimpan sebagai lampiran sesi itu: cukup satu berkas untuk semua siswa di sesi yang sama, dan terlihat juga di Jadwal. Ikon klip pada status rencana berarti buktinya sudah ada.",
    ],
  },
  {
    id: "perangkat-ajar", kelompok: "guru", judul: "Perangkat ajar: CP, ATP, dan modul ajar", icon: "bi-journal-richtext",
    href: "/dashboard/perangkat-ajar",
    langkah: [
      "Buka TDU - Jadwal → Perangkat Ajar, tab Capaian Pembelajaran. Pilih mapel, lalu tekan Tempel dokumen CP: salin teks CP resmi, tempel, dan tekan Pecah per elemen. Periksa elemen dan fasenya, lalu Simpan. Bila CP nasional untuk mapel/fase itu belum ada (mis. Bahasa Inggris Fase A atau mulok), pilih CP resmi belum ada: AI susun draf; hasilnya ditandai CP sekolah.",
      "Buka tab ATP, tekan ATP baru: pilih mapel, kelas, periode, JP per minggu, dan minggu efektif.",
      "Tekan Susun dengan AI. AI menurunkan TP dari CP fase kelas itu, memakai TP sekolah yang sudah ada, dan menambah alokasi untuk TP yang capaian siswanya rendah.",
      "Periksa setiap baris: elemen, materi, TP (yang ada atau TP baru bertanda +), JP, minggu, dimensi STNKM, dan profil lulusan. Geser urutan dengan panah, lalu Simpan.",
      "Tekan Ajukan. Kepala sekolah menyetujui atau mengembalikan dengan catatan (muncul di Perlu Tindakan).",
      "Setelah disetujui, TP dan materi baru otomatis masuk ke Referensi Penilaian, sehingga langsung bisa dipakai di Input Nilai, kisi-kisi, dan Bank Soal. Tekan Cetak untuk PDF bertanda tangan.",
    ],
    tips: [
      "Fase dihitung dari nama kelas: kelas 1–2 fase A, 3–4 fase B, 5–6 fase C.",
      "Mengubah ATP yang sudah disetujui membuatnya kembali menjadi draf versi baru dan perlu diajukan ulang.",
      "Total JP dibandingkan dengan JP per minggu × minggu efektif; tanda merah muncul bila melebihi.",
      "Modul ajar: di ATP yang sudah disetujui tekan Buat modul ajar (atau tab Modul Ajar → Modul baru), centang TP yang dicakup, isi jumlah pertemuan dan JP, lalu Susun dengan AI.",
      "Modul memakai format Perencanaan Pembelajaran Mendalam: identifikasi, desain pembelajaran, pengalaman belajar per pertemuan (awal, memahami, mengaplikasi, merefleksi, penutup), asesmen, diferensiasi, dan LKPD.",
      "AI memakai data kelas tanpa nama siswa: sebaran gaya belajar dan minat dari Asesmen Diagnostik, rata-rata nilai TP terkait, dan jumlah siswa yang sedang remedial.",
      "Tautkan paket soal di bagian asesmen akhir. Modul bisa dicetak (PDF) atau diunduh sebagai Word untuk disunting.",
      "Di Jadwal, pilih Modul ajar dan Pertemuan ke saat membuat sesi. Jadwal berulang otomatis memakai pertemuan berikutnya. Detail sesi menampilkan langkah pertemuan itu.",
      "Saat menulis jurnal, panel Rencana pembelajaran hari ini menampilkan langkah dari modul untuk kelas itu; tekan Pakai materi sesi ini untuk mengisi materi.",
      "Daftar modul menampilkan kemajuan: berapa pertemuan yang sudah berstatus Selesai di Jadwal.",
    ],
  },
  {
    id: "studio-video", kelompok: "guru", judul: "Studio Rakit Video (motion graphic)", icon: "bi-easel3",
    href: "/dashboard/studio-video",
    langkah: [
      "Admin membuka TDU - Jadwal → Studio Rakit Video dan menunjuk satu pembuat video motion graphic. Hanya akun itu yang bisa merakit.",
      "Pembuat video membuka Studio. Naskah contoh langsung tampil; pilih rasio (9:16 untuk Reels/TikTok/Status WA, 16:9 untuk proyektor/YouTube, 1:1 untuk feed, 4:3).",
      "Cara cepat: tekan Papan cerita AI, pilih tujuan, tulis satu-dua kalimat video yang diinginkan (mis. promosi PPDB dengan kegiatan literasi dan olahraga), pilih jumlah adegan dan penyedia AI. AI menyusun adegan, teks, emoji, dan narasi dengan tata letak yang rapi; sunting sesukanya. Pilih juga gaya visualnya (Ceria, Elegan, Formal, Modern); tata letak yang tersedia: pembuka, emoji besar, daftar, fakta (angka menghitung naik), kutipan, perbandingan, linimasa, dan ajakan.",
      "Gaya visual: tombol Gaya visual mengatur sekaligus font judul & isi (Nunito, Poppins, Playfair Display), hiasan latar bergerak, gerak kamera, transisi, animasi teks kata demi kata, dan kartu kaca di semua adegan; centang Ganti warna latar untuk memakai palet gaya itu. Hasilnya bisa dibatalkan dengan Ctrl+Z.",
      "Pustaka aset: tombol Pustaka aset membuka 1.595 emoji 3D dan 6.287 ikon yang bisa dicari dengan kata Indonesia (mis. guru, juara, roket). Klik untuk menambah ke adegan; pada elemen terpilih, Ganti ikon atau Cari di pustaka emoji 3D mengganti isinya tanpa mengubah posisi & animasi. Emoji kini tampil 3D bila tersedia (bisa dikembalikan ke Datar); warna dan garis tipis ikon diatur di panel Properti.",
      "Di panel adegan tersedia Gerak kamera (zoom masuk/keluar, geser) dan Hiasan bergerak (gumpalan warna, bokeh, garis, titik, gelombang). Di panel teks tersedia font per teks, Kartu kaca, serta animasi masuk Kata demi kata dan Angka menghitung naik.",
      "Di kiri, kelola adegan: tambah, gandakan, ubah urutan, hapus. Di panel kanan tab Adegan, tulis narasi (dibacakan suara AI dan menjadi subtitle), lama adegan, transisi, dan latar (warna, gradien, atau gambar).",
      "Tambahkan Teks, Emoji, Gambar, atau Bentuk dari bilah di atas kanvas. Geser elemen langsung di kanvas dan tarik kotak biru di sudutnya untuk mengubah ukuran.",
      "Pilih elemen untuk mengatur isi, ukuran, warna, latar teks, garis tepi, bayangan, putaran, animasi masuk (12 pilihan, dengan waktu mulai dan lama) serta gerak setelah muncul.",
      "Atur waktu di Timeline adegan (di bawah kanvas): geser batang elemen untuk waktu muncul, tarik ujung kanannya agar elemen hilang sebelum adegan selesai, dan klik penggaris untuk melihat kanvas pada detik itu.",
      "Tab Musik: unggah musik latar (MP3/M4A), atur volumenya; musik otomatis mengecil saat narasi berbicara.",
      "Tekan Putar adegan ini atau Putar semua untuk pratinjau (tanpa narasi), lalu Render video: pilih tujuan (Pembelajaran, Promosi/PPDB, Pengumuman, Acara), isi judul, mapel/kelas (opsional), dan suara narasi. Video masuk Pustaka Video sebagai draf lalu diajukan ke kepala sekolah seperti biasa.",
    ],
    tips: [
      "Tab Merek: logo sekolah (tampil di semua adegan), huruf, dan palet warna. Tekan Jadikan merek bawaan sekolah agar naskah baru langsung memakainya.",
      "Pintasan: Ctrl+Z batalkan, Ctrl+Y ulangi, Delete hapus elemen, Ctrl+D gandakan, panah menggeser halus (Shift+panah lebih jauh).",
      "Pada rasio 9:16, garis putus-putus menandai area aman yang tidak tertutup tombol aplikasi media sosial.",
      "Draf naskah tersimpan otomatis di perangkat ini. Video rakitan bisa dibuka lagi dari Pustaka Video lewat Buka di Studio lalu dirender ulang.",
      "Saat mengunggah gambar, Studio menanyakan apakah gambar memuat foto siswa dan apakah orang tua sudah memberi izin. Video promosi, pengumuman, dan acara yang memakai foto siswa tanpa izin ditolak saat dikirim ke render.",
      "Di jendela Render, centang rasio lain (mis. 16:9 selain 9:16) agar satu naskah dirender sekaligus menjadi beberapa video. Periksa dulu tampilannya dengan tombol rasio di atas kanvas.",
      "Papan cerita untuk video Pembelajaran ikut membaca Pustaka Dokumen (pilih mapelnya) agar isinya sesuai CP dan panduan resmi.",
      "Hanya video bertujuan Pembelajaran yang tampil di Portal Siswa; video lain diunduh dari Pustaka Video (tombol Unduh) untuk dibagikan setelah disetujui.",
      "Tombol Templat: simpan naskah sebagai templat sekolah berkategori (Pembelajaran, PPDB & promosi, Pengumuman, Hari besar, Prestasi) dan pakai lagi untuk video berikutnya.",
      "Naskah video tidak terikat satu mesin render. Admin memilih mesin di kartu pengaturan Studio: Remotion (bawaan, semua templat) atau Revideo (lisensi MIT, khusus video rakitan Studio). Pratinjau di browser selalu memakai Remotion; kedua mesin menghitung gerak dari rumus yang sama sehingga hasilnya sama. Render ulang memakai mesin yang sedang dipilih.",
    ],
  },
  {
    id: "pustaka-dokumen", kelompok: "guru", judul: "Pustaka dokumen resmi untuk AI", icon: "bi-folder2-open",
    href: "/dashboard/pustaka-dokumen",
    langkah: [
      "Buka Referensi Penilaian → Pustaka Dokumen, lalu tekan Tambah dokumen.",
      "Pilih Unggah berkas (PDF berteks, DOCX, atau TXT) atau Tautan resmi (halaman/PDF situs pemerintah). Isi judul, jenis (CP, kurikulum, regulasi, panduan), dan bila perlu mapel serta fasenya.",
      "Admin dan kepala sekolah: dokumen langsung dipakai AI. Guru: dokumen diajukan dan dipakai AI setelah kepala sekolah menyetujuinya (muncul di Perlu Tindakan).",
      "Buka dokumen untuk melihat teks yang dibaca AI, lalu tekan Analisis dengan AI untuk ringkasan isi pokoknya.",
      "Saat AI menyusun CP, ATP, modul ajar, atau soal, bagian dokumen yang relevan ikut dibaca; judul dokumennya disebut di pesan hasil sebagai Rujukan pustaka.",
    ],
    tips: [
      "Admin mengatur izin unggah guru lewat sakelar di atas daftar dokumen.",
      "Dokumen dengan mapel tertentu hanya dibaca untuk mapel itu; dokumen tanpa mapel dibaca untuk semua mapel.",
      "Bila peraturan berubah, buka menu ⋮ → Unggah versi baru. Dokumen lama yang tidak berlaku bisa diatur Jangan dipakai AI.",
      "PDF hasil pindai (foto) belum bisa dibaca; pakai PDF berteks dari situs resmi atau DOCX.",
      "Bagian Uji: bagian dokumen mana yang dibaca AI? menunjukkan kutipan yang akan dibaca AI untuk suatu topik.",
    ],
  },
  {
    id: "video-belajar", kelompok: "guru", judul: "Video belajar", icon: "bi-play-btn",
    href: "/dashboard/video-belajar",
    langkah: [
      "Buat sendiri: buka TDU - Jadwal → Video Belajar → Buat video motion graphic. Pilih templat (Kartu Gambar & Suku Kata, Berhitung, Urutan & Siklus, atau Pecahan); isi contoh langsung bisa diubah.",
      "Pilih rasio aspek: 16:9 untuk proyektor/YouTube, 9:16 untuk Reels/TikTok/Status WA, 1:1 untuk feed Instagram/Facebook, 4:3 untuk layar kelas lama. Tata letak menyesuaikan otomatis.",
      "Isi setiap adegan: gambar (emoji), kata atau angka, dan narasi yang akan dibacakan. Pratinjau di sebelah kanan berubah seketika (tanpa suara).",
      "Pilih suara narasi (Suara AI lokal gratis, atau ElevenLabs/Gemini bila API key sudah diisi admin), lalu tekan Buat video. Server membuat suara dan videonya dalam beberapa menit; halaman boleh ditutup.",
      "Atau unggah video sendiri: tekan Unggah video, pilih berkas MP4 (maks. 20MB, 1–2 menit di 720p sudah cukup), isi judul, mapel, dan kelas.",
      "Video khusus yang lebih kaya (mis. Siklus Air) bisa dibuatkan Claude di folder remotion-video lalu diunggah di sini dengan Asal video = Motion graphic.",
      "Buka video, tekan Ajukan. Kepala sekolah menonton lalu menyetujui; siswa baru bisa melihatnya setelah disetujui.",
      "Tautkan video yang sama ke mana saja: di modul ajar (Video belajar pertemuan …), di detail sesi Jadwal (Video untuk sesi ini), atau sebagai Video stimulus di editor soal.",
      "Siswa dan orang tua melihat video di Portal (Video Belajar) dan bisa mengunduhnya untuk ditonton tanpa sinyal.",
    ],
    tips: [
      "Video untuk anak yang belum lancar membaca: sedikit tulisan, gambar besar, gerak pelan, dan narasi suara yang jelas. Tulis narasi dengan kalimat pendek.",
      "Lama setiap adegan mengikuti panjang narasinya; 6–10 adegan biasanya menghasilkan video 1–2 menit.",
      "Bila render gagal, muncul di Perlu Tindakan. Buka videonya, tekan Ubah & render ulang.",
      "Video stimulus ikut ke tes online: siswa menonton dulu, lalu menjawab.",
      "Mengubah video yang sudah disetujui menjadikannya draf lagi dan perlu disetujui ulang.",
    ],
  },
  {
    id: "bank-soal", kelompok: "guru", judul: "Bank soal, kisi-kisi, dan AI", icon: "bi-patch-question",
    href: "/dashboard/bank-soal",
    langkah: [
      "Buka TDU - Jadwal → Bank Soal.",
      "Kisi-kisi: tekan Kisi-kisi baru, isi judul dan mapel, lalu tambahkan baris per TP (bentuk soal, level kognitif C1–C6, tingkat kesulitan, dimensi STNKM yang ditonjolkan, dan jumlah soal).",
      "Pada kisi-kisi yang sudah disimpan, tekan Buat dengan AI di setiap baris. AI menyusun draf soal lengkap dengan kunci, pengecoh, rubrik, dan diagram bila diminta.",
      "Bisa juga menulis soal sendiri (Tulis soal) atau memindahkan paket soal lama di tab Impor Paket (tempel teks, Word, PDF, atau foto).",
      "Periksa setiap draf: tekan ikon pensil untuk mengedit pertanyaan, pilihan, kunci, gambar, dan bobot STNKM.",
      "Untuk gambar soal, tekan Gambar AI di editor: pilih penyedia AI, pilih Ilustrasi (gambar berwarna; Gemini, OpenKey, atau OpenRouter) atau Diagram (garis rapi; semua penyedia), tulis apa yang diinginkan, lalu Pakai gambar ini.",
      "Tekan ikon kirim (atau centang beberapa soal lalu Ajukan ke kepala sekolah). Soal baru bisa dipakai setelah disetujui.",
    ],
    tips: [
      "Semua hasil AI masuk sebagai draf; tidak ada soal yang dipakai tanpa diperiksa guru dan disetujui kepala sekolah.",
      "AI belajar dari sekolah: draf baru diberi contoh soal yang sudah disetujui (yang teruji baik didahulukan), catatan soal yang bermasalah menurut analisis butir, dan capaian siswa pada TP itu.",
      "Soal yang pernah dipakai dan dianalisis bertanda Teruji baik atau Perlu ditinjau, lengkap dengan persen siswa yang menjawab benar dan daya bedanya.",
      "Bila Ilustrasi gagal, pesan dari penyedia AI ditampilkan apa adanya (mis. kuota habis atau model tidak tersedia). Coba model gambar lain di bagian Model gambar (lanjutan), atau pakai Diagram.",
      "PDF dan foto paket soal hanya bisa dibaca dengan Gemini atau Claude.",
      "Soal yang dikembalikan kepala sekolah muncul di Perlu Tindakan beserta catatannya. Perbaiki, lalu ajukan lagi.",
      "Mengubah soal yang sudah disetujui membuatnya kembali menjadi draf dan perlu disetujui ulang.",
    ],
  },
  {
    id: "paket-soal", kelompok: "guru", judul: "Paket soal: cetak, koreksi, dan analisis butir", icon: "bi-journal-text",
    href: "/dashboard/bank-soal",
    langkah: [
      "Buka Bank Soal → tab Paket Soal, lalu tekan Paket baru. Isi judul, kelas, jenis penilaian, dan tanggal; pilih kisi-kisi bila ada agar soal langsung terisi.",
      "Di bagian Susun, tambahkan soal yang sudah disetujui, atur urutan dan skor maksimal, lalu tekan Simpan susunan.",
      "Tekan Cetak → Naskah + lembar jawaban (pilih Simpan sebagai PDF bila ingin berkasnya). Kunci & rubrik dicetak terpisah untuk guru.",
      "Setelah ujian, buka bagian Koreksi. Ketik jawaban tiap siswa: A untuk pilihan ganda, AC untuk pilihan ganda kompleks, BSB untuk benar/salah, teks untuk isian; nilai langsung terhitung. Uraian, menjodohkan, dan mengurutkan diisi skornya.",
      "Atau tekan ikon kamera di baris siswa, unggah foto lembar jawabannya, lalu Baca AI. Periksa hasil bacaan AI sebelum Simpan.",
      "Uraian: tekan Nilai uraian (AI) untuk semua siswa, atau Nilai uraian dengan AI di rincian satu siswa. AI mengusulkan skor sesuai rubrik dari jawaban tes online atau foto lembar jawaban, beserta alasannya. Periksa, ubah bila perlu, lalu Simpan.",
      "Tekan Kirim ke Input Nilai: nilai per TP masuk ke Input Nilai pada tanggal paket, termasuk perhitungan STNKM dan tanda remedial untuk nilai di bawah KKM.",
      "Buka bagian Analisis untuk melihat tingkat kesukaran, daya beda, pengecoh yang tidak dipilih siswa, capaian per TP, dan profil STNKM kelas.",
    ],
    tips: [
      "Isi baris siswa dan tekan Enter untuk turun ke siswa berikutnya pada nomor yang sama, sehingga koreksi bisa per nomor.",
      "Siswa yang barisnya kosong dianggap tidak ikut dan tidak dikirim ke Input Nilai.",
      "Soal dalam paket adalah salinan saat ditambahkan; mengubah soal di bank tidak mengubah naskah yang sudah dicetak.",
      "Baca foto hanya bisa dengan Gemini atau Claude. Foto yang terang dan lurus memberi hasil terbaik.",
      "Daya beda dihitung bila minimal 4 siswa selesai dikoreksi. Butir bertanda Perlu diperbaiki sebaiknya direvisi sebelum dipakai lagi.",
      "Skor uraian dari AI hanyalah usulan dan baru tersimpan setelah guru menekan Simpan. Arahkan kursor ke kolom bertanda bintang untuk membaca alasan AI.",
      "Hasil analisis butir tersimpan ke bank soal saat Analisis dibuka atau nilai dikirim, sehingga draf AI berikutnya ikut belajar.",
    ],
  },
  {
    id: "tes-online", kelompok: "guru", judul: "Tes online di HP siswa", icon: "bi-phone",
    href: "/dashboard/bank-soal",
    langkah: [
      "Siapkan paket soal (Bank Soal → Paket Soal), lalu buka bagian Tes Online.",
      "Atur waktu mengerjakan, jadwal buka-tutup (boleh dikosongkan), acak soal & pilihan, dan token. Tekan Buat token acak bila perlu.",
      "Tekan Buka tes online, lalu tulis token di papan. Siswa masuk dengan akun siswa → menu Tes Online → Mulai → masukkan token.",
      "Pantau siswa: status, jumlah soal terjawab, sisa waktu, dan berapa kali siswa keluar dari halaman tes. Halaman pantau menyegarkan diri tiap 15 detik.",
      "Siswa yang HP-nya mati atau kehabisan waktu bisa diakhiri sesinya (Akhiri). Siswa yang perlu mengulang: tekan Ulang (jawabannya dihapus).",
      "Setelah selesai, nilai uraian di bagian Koreksi, lalu Kirim ke Input Nilai dan buka Analisis seperti biasa. Tekan Tutup tes bila sudah selesai.",
    ],
    tips: [
      "Pilihan ganda, benar/salah, isian, menjodohkan, mengurutkan, dan melengkapi gambar langsung dinilai; uraian dan membaca nyaring menunggu skor guru.",
      "Membaca nyaring: siswa merekam suaranya di HP. Di bagian Koreksi, tekan ikon mikrofon merah di baris siswa untuk mendengarkan rekamannya, lalu isi skornya sesuai rubrik.",
      "Waktu dihitung server sejak siswa menekan Mulai. Jawaban tersimpan otomatis; bila sinyal putus, HP mencoba menyimpan lagi.",
      "Satu paket bisa dicampur: sebagian siswa online, sebagian kertas yang dikoreksi di bagian Koreksi.",
      "Bentuk Melengkapi gambar memerlukan gambar bernomor 1, 2, 3…; minta AI membuat diagramnya atau unggah gambar sendiri.",
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
      "Deskripsi capaian tiap mapel disusun otomatis dari nilai per TP: dua TP terkuat yang sudah mencapai KKM dan dua TP terendah yang belum. Buka Cara membaca deskripsi capaian di atas pratinjau untuk penjelasan lengkap.",
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
    id: "keluarga", kelompok: "pengelola", judul: "Data orang tua dan wali", icon: "bi-house-heart",
    href: "/dashboard/master-keluarga",
    langkah: [
      "Buka Master Data → Orang Tua & Wali.",
      "Tekan Tambah data keluarga, lalu pilih Orang tua kandung atau Wali.",
      "Isi nama ayah dan/atau ibu (atau nama wali), pekerjaan, nomor WhatsApp, dan alamat.",
      "Centang anak-anaknya di daftar siswa. Satu data bisa untuk kakak-adik; siswa yang sudah punya data lain akan dipindah.",
      "Tekan Simpan (atau Ctrl+Enter). Kotak di atas tabel menunjukkan siswa yang belum terhubung.",
      "Setelah itu, buat akun orang tua di Manajemen Pengguna dengan tombol generate orang tua.",
    ],
    tips: [
      "Nomor WhatsApp di sini dipakai untuk kabar presensi, remedial, dan rapor ke orang tua.",
      "Data yang sudah punya akun portal tidak bisa dihapus; hapus atau ubah akunnya dulu.",
    ],
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
    id: "setujui-soal", kelompok: "pengelola", judul: "Menyetujui soal dari guru", icon: "bi-patch-check", peran: ["kepsek"],
    href: "/dashboard/bank-soal?status=DIAJUKAN",
    langkah: [
      "Soal yang diajukan guru muncul di Perlu Tindakan. Tekan Buka, atau buka Bank Soal dengan status Menunggu persetujuan.",
      "Tekan ikon mata untuk melihat soal beserta kuncinya, gambar, TP, dan bobot STNKM.",
      "Setujui satu per satu (ikon centang), atau centang beberapa soal lalu tekan Setujui.",
      "Bila perlu perbaikan, centang soalnya, tekan Kembalikan, lalu tulis catatan untuk guru.",
    ],
    tips: ["Kepala sekolah juga bisa langsung memperbaiki soal; soal yang diperbaiki kepala sekolah tetap berstatus disetujui."],
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
    id: "pemakaian", kelompok: "pengelola", judul: "Memantau pemakaian aplikasi", icon: "bi-activity", peran: ["admin", "kepsek"],
    href: "/dashboard/pemakaian",
    langkah: [
      "Buka Laporan → Pemakaian Aplikasi. Pilih rentang 7, 30, atau 90 hari.",
      "Adopsi fitur: berapa persen guru yang sudah memakai setiap fitur. Batang merah berarti fitur itu belum banyak disentuh.",
      "Pemakaian per guru: angka hijau berarti guru menyimpan pekerjaan di fitur itu, angka abu-abu berarti baru dibuka. Baris kuning = guru yang belum aktif.",
      "Jejak kerja nyata: jumlah nilai, jurnal, presensi, sesi selesai, modul, soal, tes online, dan remedial selama rentang waktu.",
      "Hambatan: permintaan yang gagal dan halaman yang lambat. Laporkan ke admin bila ada yang berulang.",
    ],
    tips: [
      "Gunakan selama masa pakai untuk melihat di mana guru berhenti, lalu dampingi guru yang belum aktif.",
      "Pembuatan dengan AI tidak dihitung sebagai lambat karena memang menunggu penyedia AI.",
    ],
  },
  {
    id: "dokumentasi-api", kelompok: "pengelola", judul: "Dokumentasi API", icon: "bi-braces", peran: ["admin"],
    href: "/dashboard/dokumentasi-api",
    langkah: [
      "Buka Akun & Sistem → Dokumentasi API (khusus admin).",
      "Cari endpoint berdasarkan jalur, keterangan, atau nama aksi; saring per peran untuk melihat apa yang boleh diakses guru, siswa, atau orang tua.",
      "Klik endpoint untuk melihat aksi controller, batas laju, dan contoh curl yang bisa disalin.",
      "Tekan Unduh OpenAPI (JSON) untuk mengimpor seluruh API ke Postman, Insomnia, atau Swagger UI.",
    ],
    tips: [
      "Daftar dibaca langsung dari server, jadi endpoint baru otomatis muncul setelah diterbitkan.",
      "Keterangan diambil dari komentar kode, lalu dari tabel endpoint README. Setelah README diperbarui, jalankan python infra/perbarui-dokumentasi-api.py.",
      "Token didapat dari POST /api/login; jangan bagikan token atau contoh berisi token asli.",
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
    id: "kerjakan-tes", kelompok: "ortu", judul: "Mengerjakan tes online", icon: "bi-pencil-square", peran: ["siswa", "admin", "kepsek"],
    href: "/dashboard/ujian",
    langkah: [
      "Buka menu Tes Online (atau tekan Buka Tes Online di Portal Siswa).",
      "Pilih tes yang bertanda Bisa dikerjakan, baca petunjuknya, masukkan token dari guru bila diminta, lalu tekan Mulai mengerjakan.",
      "Jawab satu per satu. Tekan Ragu-ragu untuk menandai soal yang ingin diperiksa lagi; nomor soal di bawah menunjukkan mana yang sudah dijawab.",
      "Menjodohkan: ketuk kotak di kiri, lalu ketuk pasangannya. Mengurutkan: pakai tombol panah. Melengkapi gambar: pilih atau tulis nama bagian bernomor.",
      "Membaca nyaring: tekan Mulai merekam, izinkan mikrofon bila diminta, bacakan teksnya dengan jelas, lalu tekan Selesai membaca. Dengarkan hasilnya; tekan Rekam ulang bila ingin mengulang.",
      "Tekan Kumpulkan bila sudah selesai. Saat waktu habis, jawaban dikumpulkan otomatis.",
    ],
    tips: [
      "Jawaban tersimpan otomatis. Bila tulisan belum tersimpan muncul, periksa sinyal; HP akan mencoba lagi.",
      "Jangan keluar dari halaman tes saat mengerjakan; guru dapat melihatnya.",
    ],
  },
  {
    id: "portal", kelompok: "ortu", judul: "Melihat perkembangan anak", icon: "bi-house-heart",
    href: "/dashboard/portal",
    langkah: [
      "Masuk dengan akun dari sekolah. Halaman Portal Siswa langsung terbuka.",
      "Ringkasan: kotak Perlu didampingi di paling atas berisi tanggal remedial beserta saran mendampingi di rumah, mapel di bawah KKM, TP yang belum dikuasai, dan ketidakhadiran. Ketuk salah satu untuk melihat rinciannya.",
      "Capaian TP: per mapel dan materi, indikator mana yang sudah dan belum dikuasai. Angka merah pada tab menunjukkan jumlah TP yang belum dikuasai.",
      "Tindak Lanjut: jadwal dan hasil remedial beserta tips mendampingi anak di rumah.",
      "Jadwal, Kehadiran, dan Catatan Positif dari guru.",
      "Rapor: pratinjau dan cetak rapor setelah dibagikan sekolah.",
    ],
    tips: [
      "Tombol Buka di Perlu Tindakan (ikon lonceng) langsung membuka remedial atau kehadiran anak yang dimaksud.",
      "Capaian TP, Tindak Lanjut, dan Riwayat penilaian bisa dicari, difilter, dan diunduh sebagai PDF.",
      "Bingung membaca deskripsi di rapor? Buka Cara membaca deskripsi capaian di tab Capaian TP atau Rapor.",
      "Portal hanya untuk melihat. Hubungi wali kelas bila ada data yang perlu diperbaiki.",
    ],
  },
];

// Bagian yang terlihat untuk satu peran
export const bagianUntuk = (role) =>
  BAGIAN.filter((b) => {
    const kelompok = KELOMPOK.find((k) => k.id === b.kelompok);
    return kelompok.peran.includes(role) && (!b.peran || b.peran.includes(role));
  });
