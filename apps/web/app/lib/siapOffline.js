"use client";
// Siapkan HP untuk dipakai offline sejak aplikasi pertama dibuka: saat online, sekali sehari per login,
// halaman input (Nilai, Jurnal, Presensi) dan data kelas pengguna diambil di latar belakang sehingga
// service worker menyimpan salinannya (public/sw.js). Alamat API di sini harus sama persis dengan yang
// dipanggil halaman, karena salinan dicari berdasarkan alamatnya.
import { API_URL } from "@/app/lib/config";

const HALAMAN = ["/dashboard", "/dashboard/nilai", "/dashboard/jurnal", "/dashboard/presensi", "/dashboard/akun", "/dashboard/panduan"];
const KUNCI = "offline_siap";
const MAKS_PERMINTAAN = 150;
const MAKS_KELAS = 12;

// Tanggal lokal perangkat, sama dengan bawaan tanggal di halaman Input Nilai
const hariIni = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const qs = (obj) => new URLSearchParams(obj).toString();

/** Status persiapan terakhir: { tanggal, jumlah } atau null. */
export function statusSiapOffline() {
  try { return JSON.parse(localStorage.getItem(KUNCI) || "null"); } catch (e) { return null; }
}

export async function siapkanOffline(user, { paksa = false } = {}) {
  if (typeof navigator === "undefined" || !navigator.onLine || !navigator.serviceWorker?.controller) return null;
  const token = localStorage.getItem("token");
  if (!token || !user || !["admin", "kepsek", "guru"].includes(user.role)) return null;
  const sesi = token.slice(-16);
  const lalu = statusSiapOffline();
  if (!paksa && lalu?.sesi === sesi && lalu?.tanggal === hariIni()) return lalu;

  // Halaman beserta skrip & gayanya disimpan oleh service worker
  navigator.serviceWorker.controller.postMessage({ tipe: "hangatkan", halaman: HALAMAN });

  let jumlah = 0;
  const ambil = async (path) => {
    if (jumlah >= MAKS_PERMINTAAN) return null;
    jumlah++;
    try {
      const res = await fetch(`${API_URL}${path}`, { headers: { Accept: "application/json", Authorization: `Bearer ${token}` } });
      return res.ok ? await res.json() : null;
    } catch (e) { return null; }
  };

  await Promise.all(["/me", "/settings", "/notifikasi", "/classes", "/mbk", "/teachers", "/jurnal"].map(ambil));
  const filter = await ambil("/nilai/filters");
  if (!filter) return null;
  const periode = (filter.periodes || []).find((p) => p.status_aktif === "AKTIF")?.id_periode;
  if (!periode) return null;
  const kelas = (filter.classes || []).slice(0, MAKS_KELAS);
  const binaan = new Set(user.kelas_binaan || []);
  const bolehPresensi = (k) => user.role !== "guru" || binaan.has(k.id_kelas);

  await ambil(`/dashboard?${qs({ id_periode: periode, id_kelas: "ALL" })}`);
  for (const k of kelas) {
    const id_kelas = k.id_kelas;
    await Promise.all([
      ambil(`/students?${qs({ id_kelas })}`),
      ambil(`/materi/by-context?${qs({ id_kelas })}`),
      ambil(`/nilai?${qs({ id_kelas, id_periode: periode })}`),
      bolehPresensi(k) ? ambil(`/presensi?${qs({ id_kelas, id_periode: periode })}`) : null,
    ]);
  }

  // Lembar nilai hari ini untuk tiap materi mapel yang diampu (urutan parameter sama dengan halaman Input Nilai)
  const tanggal = hariIni();
  for (const k of kelas) {
    for (const m of filter.subjects || []) {
      const materi = await ambil(`/nilai/materi?${qs({ id_kelas: k.id_kelas, id_mapel: m.id_mapel, id_periode: periode })}`);
      for (const mt of materi?.data || []) {
        for (const j of filter.mbks || []) {
          await ambil(`/nilai/students?${qs({ id_kelas: k.id_kelas, id_mapel: m.id_mapel, id_periode: periode, id_jenis: j.id_jenis, id_materi: mt.id_materi, tanggal })}`);
        }
      }
    }
  }

  const hasil = { sesi, tanggal, jumlah };
  try { localStorage.setItem(KUNCI, JSON.stringify(hasil)); } catch (e) { /* abaikan */ }
  return hasil;
}
