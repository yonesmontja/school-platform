"use client";

import { useEffect, useMemo, useState } from "react";

// Peran: admin, kepsek, guru (staf) · siswa, ortu (portal). Backend tetap memeriksa ulang setiap aksi;
// pembatasan di sini hanya agar menu & tombol yang tidak berlaku tidak ditampilkan.
export const API_URL = "http://localhost:8000/api";
export const AKSES_EVENT = "akses-berubah";

export const ROLE_LABEL = {
  admin: "Admin",
  kepsek: "Kepala Sekolah",
  guru: "Guru",
  siswa: "Siswa",
  ortu: "Orang Tua / Wali",
};
export const ROLE_WARNA = { admin: "danger", kepsek: "warning", guru: "primary", siswa: "success", ortu: "info" };

const STAF = ["admin", "kepsek", "guru"];
const PORTAL = ["siswa", "ortu"];

// Halaman yang dibatasi perannya (dicocokkan dengan awalan path); halaman staf lain terbuka untuk semua staf
const ATURAN_HALAMAN = [
  { awalan: "/dashboard/akun", peran: [...STAF, ...PORTAL] },
  { awalan: "/dashboard/portal", peran: PORTAL },
  { awalan: "/dashboard/pengguna", peran: ["admin"] },
  { awalan: "/dashboard/pengaturan", peran: ["admin"] },
];

export const halamanAwal = (user) =>
  !user ? "/login" : user.wajib_ganti_password ? "/dashboard/akun" : PORTAL.includes(user.role) ? "/dashboard/portal" : "/dashboard";

export function bolehBuka(role, pathname) {
  if (!role) return false;
  const aturan = ATURAN_HALAMAN.find((a) => pathname === a.awalan || pathname.startsWith(`${a.awalan}/`));
  return aturan ? aturan.peran.includes(role) : STAF.includes(role);
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
  const isPengelola = isAdmin || isKepsek;
  const kelasBinaan = user?.kelas_binaan || [];
  const mapelDiampu = user?.mapel_diampu || [];
  return {
    user, role, isAdmin, isKepsek, isGuru, isPengelola,
    isStaf: STAF.includes(role),
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
