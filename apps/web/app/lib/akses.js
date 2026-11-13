"use client";

import { useEffect, useMemo, useState } from "react";
import { API_URL } from "@/app/lib/config";
export { API_URL };

// Peran: admin, kepsek, guru (staf) · siswa, ortu (portal) · wakakur, wakasis, yayasan (peninjau, lihat saja). Backend tetap memeriksa ulang setiap aksi;
// pembatasan di sini hanya agar menu & tombol yang tidak berlaku tidak ditampilkan.
export const AKSES_EVENT = "akses-berubah";

export const ROLE_LABEL = {
  admin: "Admin",
  kepsek: "Kepala Sekolah",
  guru: "Guru",
  siswa: "Siswa",
  ortu: "Orang Tua / Wali",
  wakakur: "Wakasek Kurikulum",
  wakasis: "Wakasek Kesiswaan",
  yayasan: "Yayasan",
};
export const ROLE_WARNA = { admin: "danger", kepsek: "warning", guru: "primary", siswa: "success", ortu: "info", wakakur: "dark", wakasis: "dark", yayasan: "secondary" };

const STAF = ["admin", "kepsek", "guru"];
const PORTAL = ["siswa", "ortu"];
// Peninjau: melihat semua menu milik admin & kepala sekolah, tanpa bisa mengubah (server menolak perubahan)
export const PENINJAU = ["wakakur", "wakasis", "yayasan"];

/** Peran boleh membuka sesuatu yang dibatasi ke daftar peran; peninjau ikut hak baca admin/kepala sekolah. */
export const peranBoleh = (daftar, role) =>
  daftar.includes(role) || (PENINJAU.includes(role) && (daftar.includes("admin") || daftar.includes("kepsek")));

// Halaman yang dibatasi perannya (dicocokkan dengan awalan path); halaman staf lain terbuka untuk semua staf
const ATURAN_HALAMAN = [
  { awalan: "/dashboard/akun", peran: [...STAF, ...PORTAL] },
  { awalan: "/dashboard/notifikasi", peran: [...STAF, ...PORTAL] },
  { awalan: "/dashboard/panduan", peran: [...STAF, ...PORTAL] },
  { awalan: "/dashboard/portal", peran: PORTAL },
  { awalan: "/dashboard/ujian", peran: ["siswa"] },
  { awalan: "/dashboard/pengguna", peran: ["admin"] },
  { awalan: "/dashboard/dokumentasi-api", peran: ["admin"] },
  { awalan: "/dashboard/pemakaian", peran: ["admin", "kepsek"] },
  { awalan: "/dashboard/pengaturan", peran: ["admin"] },
  // Master data & semester hanya untuk pengelola; guru tetap membacanya lewat dropdown di halaman lain
  { awalan: "/dashboard/master-siswa", peran: ["admin", "kepsek"] },
  { awalan: "/dashboard/master-keluarga", peran: ["admin", "kepsek"] },
  { awalan: "/dashboard/master-guru", peran: ["admin", "kepsek"] },
  { awalan: "/dashboard/master-kelas", peran: ["admin", "kepsek"] },
  { awalan: "/dashboard/master-mapel", peran: ["admin", "kepsek"] },
  { awalan: "/dashboard/master-periode", peran: ["admin", "kepsek"] },
];

export const halamanAwal = (user) =>
  !user ? "/login" : user.wajib_ganti_password ? "/dashboard/akun" : PORTAL.includes(user.role) ? "/dashboard/portal" : "/dashboard";

export function bolehBuka(role, pathname) {
  if (!role) return false;
  const aturan = ATURAN_HALAMAN.find((a) => pathname === a.awalan || pathname.startsWith(`${a.awalan}/`));
  return aturan ? peranBoleh(aturan.peran, role) : STAF.includes(role) || PENINJAU.includes(role);
}

export function bacaUser() {
  try { return JSON.parse(localStorage.getItem("user") || "null"); } catch (e) { return null; }
}

export function simpanUser(user) {
  try { localStorage.setItem("user", JSON.stringify(user)); } catch (e) { /* storage diblokir */ }
  window.dispatchEvent(new Event(AKSES_EVENT));
}

export function keluar() {
  try { localStorage.removeItem("token"); localStorage.removeItem("user"); } catch (e) { /* abaikan */ }
}

export const authHeaders = (json = true) => ({
  Accept: "application/json",
  ...(json ? { "Content-Type": "application/json" } : {}),
  Authorization: `Bearer ${typeof window === "undefined" ? "" : localStorage.getItem("token")}`,
});

// Turunan izin dari profil akses (/api/me)
export function aksesDari(user) {
  const role = user?.role || null;
  const isAdmin = role === "admin";
  const isKepsek = role === "kepsek";
  const isGuru = role === "guru";
  const isPeninjau = PENINJAU.includes(role);
  // Peninjau melihat seluruh data seperti pengelola; tombol ubah boleh tampil, tetapi server menolak perubahannya
  const isPengelola = isAdmin || isKepsek || isPeninjau;
  const kelasBinaan = user?.kelas_binaan || [];
  const mapelDiampu = user?.mapel_diampu || [];
  return {
    user, role, isAdmin, isKepsek, isGuru, isPengelola, isPeninjau,
    isStaf: STAF.includes(role) || isPeninjau,
    isPortal: PORTAL.includes(role),
    idGuru: user?.id_guru || null,
    kelasBinaan, mapelDiampu,
    bolehKelolaKelas: (idKelas) => isPengelola || (isGuru && kelasBinaan.includes(idKelas)),
    bolehNilaiMapel: (idMapel) => isPengelola || (isGuru && mapelDiampu.includes(idMapel)),
    // Guru hanya mengubah data yang ia buat sendiri (jurnal, jadwal)
    milikSendiri: (idGuru) => !isGuru || (!!user?.id_guru && idGuru === user.id_guru),
  };
}

// Profil akses dari localStorage; ikut berubah saat layout menyegarkannya dari /api/me
export function useAkses() {
  const [user, setUser] = useState(null);
  useEffect(() => {
    const muat = () => setUser(bacaUser());
    muat();
    window.addEventListener(AKSES_EVENT, muat);
    window.addEventListener("storage", muat);
    return () => {
      window.removeEventListener(AKSES_EVENT, muat);
      window.removeEventListener("storage", muat);
    };
  }, []);
  return useMemo(() => aksesDari(user), [user]);
}
