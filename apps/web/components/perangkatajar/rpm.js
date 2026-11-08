// Susunan modul ajar format Perencanaan Pembelajaran Mendalam (RPM), sama dengan ModulAjar di backend.
export const BAGIAN_RPM = [
  { kunci: "identifikasi", judul: "A. Identifikasi", isian: [
    { k: "peserta_didik", label: "Peserta didik", bantuan: "Kesiapan, minat, gaya belajar, dan kebutuhan siswa kelas ini" },
    { k: "materi", label: "Materi pelajaran", bantuan: "Jenis pengetahuan, relevansi dengan kehidupan siswa, tingkat kesulitan" },
  ] },
  { kunci: "desain", judul: "B. Desain Pembelajaran", isian: [
    { k: "capaian", label: "Capaian pembelajaran" },
    { k: "lintas_disiplin", label: "Lintas disiplin ilmu" },
    { k: "tujuan", label: "Tujuan pembelajaran" },
    { k: "topik", label: "Topik pembelajaran" },
    { k: "praktik_pedagogis", label: "Praktik pedagogis", bantuan: "Model, strategi, dan metode" },
    { k: "kemitraan", label: "Kemitraan pembelajaran", bantuan: "Orang tua, masyarakat, ahli setempat" },
    { k: "lingkungan", label: "Lingkungan pembelajaran", bantuan: "Ruang fisik, virtual, dan budaya belajar" },
    { k: "digital", label: "Pemanfaatan digital" },
  ] },
  { kunci: "asesmen", judul: "D. Asesmen Pembelajaran", isian: [
    { k: "awal", label: "Asesmen awal (diagnostik)" },
    { k: "proses", label: "Asesmen proses (formatif)" },
    { k: "akhir", label: "Asesmen akhir (sumatif)" },
  ] },
];

export const LANGKAH_RPM = [
  { k: "awal", label: "Kegiatan awal", bantuan: "Berkesadaran, bermakna, menggembirakan" },
  { k: "memahami", label: "Inti: memahami" },
  { k: "mengaplikasi", label: "Inti: mengaplikasi" },
  { k: "merefleksi", label: "Inti: merefleksi" },
  { k: "penutup", label: "Kegiatan penutup" },
];

export const isiKosong = (pertemuan = 1) => ({
  identifikasi: { peserta_didik: "", materi: "", profil_lulusan: [] },
  desain: Object.fromEntries(BAGIAN_RPM[1].isian.map((i) => [i.k, ""])),
  asesmen: { awal: "", proses: "", akhir: "" },
  pertemuan: Array.from({ length: pertemuan }, (_, i) => ({ ke: i + 1, jp: null, awal: "", memahami: "", mengaplikasi: "", merefleksi: "", penutup: "" })),
  diferensiasi: "",
  lkpd: "",
});
