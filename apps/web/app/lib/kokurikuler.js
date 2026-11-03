// Kokurikuler (Permendikdasmen 13/2025): 8 Dimensi Profil Lulusan, bentuk kegiatan, dan skala predikat sekolah.
// Predikat selalu disimpan 4 tingkat (BB/MB/BSH/SB); skala 3 tingkat e-Rapor hanya mengelompokkannya saat ditampilkan.

export const DIMENSI_LULUSAN = [
  "Keimanan dan Ketakwaan", "Kewargaan", "Penalaran Kritis", "Kreativitas",
  "Kolaborasi", "Kemandirian", "Kesehatan", "Komunikasi",
];

export const BENTUK_KOKURIKULER = [
  { value: "PROYEK", label: "Proyek lintas mapel", icon: "bi-diagram-3" },
  { value: "KEBIASAAN", label: "7 Kebiasaan Anak Indonesia Hebat", icon: "bi-sunrise" },
  { value: "INTRAKURIKULER", label: "Penguatan intrakurikuler", icon: "bi-book" },
];
export const labelBentuk = (v) => BENTUK_KOKURIKULER.find((b) => b.value === v)?.label || BENTUK_KOKURIKULER[0].label;

// kode = kode tampilan; simpan = kode 4 tingkat yang dikirim ke server saat guru memilih
const SKALA = {
  4: [
    { kode: "SB", singkat: "SB", label: "Sangat Berkembang", color: "success", simpan: "SB" },
    { kode: "BSH", singkat: "BSH", label: "Berkembang Sesuai Harapan", color: "primary", simpan: "BSH" },
    { kode: "MB", singkat: "MB", label: "Mulai Berkembang", color: "warning", simpan: "MB" },
    { kode: "BB", singkat: "BB", label: "Belum Berkembang", color: "danger", simpan: "BB" },
  ],
  3: [
    { kode: "MAHIR", singkat: "Mahir", label: "Mahir", color: "success", simpan: "SB" },
    { kode: "CAKAP", singkat: "Cakap", label: "Cakap", color: "primary", simpan: "BSH" },
    { kode: "BERKEMBANG", singkat: "Berkembang", label: "Berkembang", color: "warning", simpan: "MB" },
  ],
};
const KE_TIGA = { SB: "MAHIR", BSH: "CAKAP", MB: "BERKEMBANG", BB: "BERKEMBANG" };

export const skalaDari = (settings) => (String(settings?.skala_kokurikuler) === "3" ? 3 : 4);
/** Tingkat predikat dari tertinggi ke terendah untuk skala sekolah. */
export const tingkatPredikat = (skala) => SKALA[skala === 3 ? 3 : 4];
/** Tingkat tampilan untuk predikat tersimpan (BB/MB/BSH/SB). */
export const predikatTampil = (kode, skala) => {
  if (!kode) return null;
  const k = skala === 3 ? KE_TIGA[kode] : kode;
  return tingkatPredikat(skala).find((t) => t.kode === k) || null;
};
export const keteranganSkala = (skala) =>
  tingkatPredikat(skala).slice().reverse().map((t) => (skala === 3 ? t.label : `${t.singkat} = ${t.label}`)).join(" | ");

// Urutan untuk merata-rata predikat beberapa target dalam satu dimensi
const NILAI_PREDIKAT = { BB: 0, MB: 1, BSH: 2, SB: 3 };
const PREDIKAT_DARI_NILAI = ["BB", "MB", "BSH", "SB"];

/**
 * Deskripsi kualitatif kokurikuler untuk rapor: dimensi yang sudah kuat (≥ BSH/Cakap) dan yang perlu penguatan.
 * dimensi: [{ nama, targets: [{ predikat }] }]
 */
export function deskripsiKokurikuler(dimensi, skala) {
  const per = dimensi.map((d) => {
    const nilai = d.targets.map((t) => NILAI_PREDIKAT[t.predikat]).filter((v) => v !== undefined);
    if (!nilai.length) return null;
    const rata = Math.round(nilai.reduce((a, b) => a + b, 0) / nilai.length);
    return { nama: d.nama.toLowerCase(), predikat: PREDIKAT_DARI_NILAI[rata] };
  }).filter(Boolean);
  if (!per.length) return null;

  const gabung = (list) => (list.length <= 1 ? list.join("") : `${list.slice(0, -1).join(", ")} serta ${list[list.length - 1]}`);
  const bagian = [];
  // Kelompokkan dimensi kuat per tingkat, dari yang tertinggi
  tingkatPredikat(skala).forEach((t) => {
    const nama = per.filter((p) => NILAI_PREDIKAT[p.predikat] >= 2 && predikatTampil(p.predikat, skala).kode === t.kode).map((p) => p.nama);
    if (nama.length) bagian.push(`${t.label.toLowerCase()} dalam ${gabung(nama)}`);
  });
  const perlu = per.filter((p) => NILAI_PREDIKAT[p.predikat] < 2).map((p) => p.nama);

  const kuat = bagian.length ? `menunjukkan capaian ${gabung(bagian)}` : "";
  const lemah = perlu.length ? `masih perlu penguatan dalam ${gabung(perlu)}` : "";
  return `Peserta didik ${[kuat, lemah].filter(Boolean).join("; ")}.`;
}
