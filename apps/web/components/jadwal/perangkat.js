// Jenis perangkat ajar yang bisa ditautkan ke sesi jadwal (editor jadwal, detail sesi, Prota & Promes).
// CP/ATP/INDIKATOR/SOAL disimpan di kolom JSON `perangkat`; MODUL & MATERI memakai kolom sesi; VIDEO lewat tautan video.
export const JENIS_PERANGKAT = [
  { id: "ATP", label: "ATP / TP", ikon: "bi-diagram-3", warna: "#206bc4", kosong: "Belum ada ATP untuk mapel ini.", buat: "/dashboard/perangkat-ajar" },
  { id: "MODUL", label: "Modul Ajar", ikon: "bi-journal-richtext", warna: "#ae3ec9", kosong: "Belum ada modul ajar untuk mapel ini.", buat: "/dashboard/perangkat-ajar?tab=modul" },
  { id: "CP", label: "Capaian Pembelajaran", singkat: "CP", ikon: "bi-bullseye", warna: "#4263eb", kosong: "Belum ada Capaian Pembelajaran untuk mapel & fase ini.", buat: "/dashboard/perangkat-ajar?tab=cp" },
  { id: "INDIKATOR", label: "Indikator", ikon: "bi-list-check", warna: "#0ca678", kosong: "Belum ada indikator (TP) untuk materi mapel ini.", buat: "/dashboard/master-materi" },
  { id: "MATERI", label: "Materi", ikon: "bi-journal-bookmark", warna: "#1098ad", kosong: "Belum ada materi untuk mapel ini.", buat: "/dashboard/master-materi" },
  { id: "SOAL", label: "Bank Soal", ikon: "bi-patch-question", warna: "#f76707", kosong: "Belum ada butir soal untuk mapel ini.", buat: "/dashboard/bank-soal" },
  { id: "VIDEO", label: "Video", ikon: "bi-play-btn", warna: "#d63939", kosong: "Belum ada video belajar untuk mapel ini.", buat: "/dashboard/video-belajar" },
];
export const JENIS_MAP = Object.fromEntries(JENIS_PERANGKAT.map((j) => [j.id, j]));

/** Kelompokkan perangkat tersimpan per jenis, urut sesuai toolbar. */
export const kelompokPerangkat = (daftar = []) =>
  JENIS_PERANGKAT.map((j) => ({ ...j, item: daftar.filter((p) => p.jenis === j.id) })).filter((g) => g.item.length);
