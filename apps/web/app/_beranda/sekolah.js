// app/_beranda/sekolah.js — data publik untuk beranda & halaman SPMB, dibaca di server (bila gagal pakai bawaan)
// Identitas sekolah dibaca di server dan disegarkan tiap 5 menit; bila API belum terjangkau (mis. saat build) pakai bawaan
const API_INTERNAL_URL = (process.env.API_INTERNAL_URL || "http://localhost:8000").replace(/\/+$/, "");
const BAWAAN = { nama_sekolah: "Sekolah Anak Papua", kota: "Nabire", alamat_sekolah: "", npsn: "", ada_logo: true };

export async function muatSekolah() {
  try {
    const r = await fetch(`${API_INTERNAL_URL}/api/sekolah-publik`, { next: { revalidate: 300 }, signal: AbortSignal.timeout(3000) });
    if (!r.ok) return BAWAAN;
    const d = (await r.json()).data || {};
    return { ...BAWAAN, ...Object.fromEntries(Object.entries(d).filter(([, v]) => v !== null && v !== "")) };
  } catch {
    return BAWAAN;
  }
}

/** Gelombang SPMB yang sedang/akan dibuka (untuk pita pengumuman di beranda); kosong bila API belum terjangkau. */
export async function muatSpmb() {
  try {
    const r = await fetch(`${API_INTERNAL_URL}/api/spmb/info`, { next: { revalidate: 300 }, signal: AbortSignal.timeout(3000) });
    if (!r.ok) return [];
    return (await r.json()).data?.gelombang || [];
  } catch {
    return [];
  }
}
