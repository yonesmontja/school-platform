// Kriteria Ketercapaian Tujuan Pembelajaran (KKTP): tingkat capaian dari nilai 0-100.
// Batas bawah tiap tingkat diatur sekolah (Pengaturan Sekolah); batas tuntas tetap KKM per mapel.
export const KKTP_BAWAAN = { kktp_cukup: 70, kktp_baik: 80, kktp_sangat_baik: 90 };

/** Daftar tingkat dari tertinggi ke terendah: { key, label, min, range, color }. */
export function tingkatKktp(settings) {
  const b = { ...KKTP_BAWAAN };
  Object.keys(b).forEach((k) => { if (Number.isFinite(Number(settings?.[k])) && settings?.[k] !== null) b[k] = Number(settings[k]); });
  return [
    { key: "sb", label: "Sangat Baik", min: b.kktp_sangat_baik, range: `≥ ${b.kktp_sangat_baik}`, color: "success" },
    { key: "b", label: "Baik", min: b.kktp_baik, range: `${b.kktp_baik} – ${b.kktp_sangat_baik - 1}`, color: "primary" },
    { key: "c", label: "Cukup", min: b.kktp_cukup, range: `${b.kktp_cukup} – ${b.kktp_baik - 1}`, color: "warning" },
    { key: "k", label: "Perlu Bimbingan", min: -Infinity, range: `< ${b.kktp_cukup}`, color: "danger" },
  ];
}

export const tingkatNilai = (nilai, tingkat) => tingkat.find((t) => nilai >= t.min);
