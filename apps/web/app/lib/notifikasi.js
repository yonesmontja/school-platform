// Pusat notifikasi: satu penyimpanan bersama untuk lonceng di topbar dan halaman Perlu Tindakan.
// Data dimuat ulang tiap 2 menit, saat tab kembali aktif, dan setelah ditandai dibaca.
import { useEffect, useSyncExternalStore } from "react";
import { API_URL, authHeaders } from "@/app/lib/akses";
import { kabariPerangkat } from "@/app/lib/pwa";

export const TINGKAT = {
  danger: { label: "Mendesak", warna: "danger", ikon: "bi-exclamation-octagon" },
  warning: { label: "Perlu perhatian", warna: "warning", ikon: "bi-exclamation-triangle" },
  info: { label: "Informasi", warna: "info", ikon: "bi-info-circle" },
  success: { label: "Kabar baik", warna: "success", ikon: "bi-patch-check" },
};

const KOSONG = { data: [], belum_dibaca: 0, mendesak: 0, memuat: true, galat: "" };
let state = KOSONG;
const pendengar = new Set();
const ubah = (baru) => { state = { ...state, ...baru }; pendengar.forEach((f) => f()); };

let sedangMuat = null;
export function muatNotifikasi() {
  if (typeof window === "undefined" || !localStorage.getItem("token")) return Promise.resolve();
  sedangMuat ??= fetch(`${API_URL}/notifikasi`, { headers: authHeaders(false) })
    .then(async (res) => {
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.message || "Gagal memuat notifikasi");
      ubah({ ...d, memuat: false, galat: "" });
      kabariPerangkat(d.data || []);
    })
    .catch((e) => ubah({ memuat: false, galat: e.message }))
    .finally(() => { sedangMuat = null; });
  return sedangMuat;
}

/** Tandai dibaca: daftar kunci, atau semua yang sedang tampil bila kosong. Tampilan diperbarui lebih dulu. */
export async function tandaiDibaca(kunci) {
  const semua = !kunci?.length;
  const data = state.data.map((n) => (semua || kunci.includes(n.kunci) ? { ...n, dibaca: true } : n));
  ubah({ data, belum_dibaca: data.filter((n) => !n.dibaca).length, mendesak: data.filter((n) => !n.dibaca && n.tingkat === "danger").length });
  try {
    await fetch(`${API_URL}/notifikasi/baca`, { method: "POST", headers: authHeaders(), body: JSON.stringify(semua ? {} : { kunci }) });
  } finally { muatNotifikasi(); }
}

let jumlahPemakai = 0;
let pewaktu = null;
const saatFokus = () => { if (document.visibilityState === "visible") muatNotifikasi(); };

export function useNotifikasi() {
  const snap = useSyncExternalStore((f) => { pendengar.add(f); return () => pendengar.delete(f); }, () => state, () => KOSONG);
  useEffect(() => {
    // Satu pewaktu untuk semua komponen yang memakai notifikasi
    if (jumlahPemakai++ === 0) {
      muatNotifikasi();
      pewaktu = setInterval(muatNotifikasi, 120000);
      document.addEventListener("visibilitychange", saatFokus);
    }
    return () => {
      if (--jumlahPemakai === 0) { clearInterval(pewaktu); document.removeEventListener("visibilitychange", saatFokus); }
    };
  }, []);
  return snap;
}

export const waktuRelatif = (iso) => {
  const t = new Date(iso);
  const hari = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(t).setHours(0, 0, 0, 0)) / 86400000);
  if (hari === 0) return "Hari ini";
  if (hari === 1) return "Kemarin";
  if (hari === -1) return "Besok";
  if (hari < 0) return `${-hari} hari lagi`;
  return `${hari} hari lalu`;
};
