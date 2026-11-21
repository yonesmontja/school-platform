"use client";
// Siapkan HP untuk dipakai offline sejak aplikasi pertama dibuka: saat online, sekali sehari per login,
// halaman input (Nilai, Jurnal, Presensi, Portofolio) dan data kelas pengguna diambil di latar belakang sehingga
// service worker menyimpan salinannya (public/sw.js). Alamat API di sini harus sama persis dengan yang
// dipanggil halaman, karena salinan dicari berdasarkan alamatnya.
// Guru juga bisa menekan "Siapkan sekarang" (components/SiapOffline.jsx) sebelum berangkat ke kelas tanpa sinyal.
import { API_URL } from "@/app/lib/config";

const HALAMAN = ["/dashboard", "/dashboard/hari-ini", "/dashboard/nilai", "/dashboard/jurnal", "/dashboard/presensi", "/dashboard/portofolio", "/dashboard/akun", "/dashboard/panduan"];
const KUNCI = "offline_siap";
export const SIAP_EVENT = "offline-siap";
const MAKS_PERMINTAAN = 150;
const MAKS_KELAS = 12;

// Tanggal lokal perangkat, sama dengan bawaan tanggal di halaman Input Nilai
const hariIni = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const qs = (obj) => new URLSearchParams(obj).toString();
const sesiSaatIni = () => { try { return (localStorage.getItem("token") || "").slice(-16); } catch (e) { return ""; } };

/** Status persiapan terakhir untuk login ini: { tanggal, waktu, jumlah, kelas, lembar } atau null. */
export function statusSiapOffline() {
  try {
    const s = JSON.parse(localStorage.getItem(KUNCI) || "null");
    return s && s.sesi === sesiSaatIni() ? s : null;
  } catch (e) { return null; }
}

/** Mengapa HP ini belum bisa disiapkan (null = bisa). */
export function alasanTakBisaSiap(user) {
  if (typeof navigator === "undefined") return "Tidak tersedia.";
  if (!user || !["admin", "kepsek", "guru"].includes(user.role)) return "Mode offline untuk input tersedia bagi guru, kepala sekolah, dan admin.";
  if (!("serviceWorker" in navigator) || !window.isSecureContext) return "Browser ini tidak mendukung mode offline. Gunakan Chrome di HP atau aplikasi SAPrapor.";
  if (!navigator.serviceWorker.controller) return process.env.NODE_ENV !== "production"
    ? "Mode offline hanya aktif di situs utama (bukan jalur kerja pengembang)."
    : "Mode offline sedang dipasang. Muat ulang halaman ini sekali, lalu coba lagi.";
  return null;
}

let berjalan = null;

/**
 * Ambil salinan halaman & data. paksa: abaikan "sudah hari ini". onProgres({ jumlah, tahap }) dipanggil selama berjalan.
 * Mengembalikan status baru, status lama bila tak perlu, atau null bila tidak bisa (offline, tanpa service worker).
 */
export function siapkanOffline(user, { paksa = false, onProgres } = {}) {
  if (berjalan) return berjalan;
  berjalan = jalankan(user, paksa, onProgres).finally(() => { berjalan = null; });
  return berjalan;
}

async function jalankan(user, paksa, onProgres) {
  if (typeof navigator === "undefined" || !navigator.onLine || alasanTakBisaSiap(user)) return null;
  const token = localStorage.getItem("token");
  if (!token) return null;
  const sesi = token.slice(-16);
  const lalu = statusSiapOffline();
  if (!paksa && lalu?.tanggal === hariIni()) return lalu;

  // Halaman beserta skrip & gayanya disimpan oleh service worker
  navigator.serviceWorker.controller.postMessage({ tipe: "hangatkan", halaman: HALAMAN });

  let jumlah = 0;
  let tahap = "Data dasar";
  const lapor = () => onProgres?.({ jumlah, tahap });
  const ambil = async (path) => {
    if (jumlah >= MAKS_PERMINTAAN) return null;
    jumlah++;
    lapor();
    try {
      const res = await fetch(`${API_URL}${path}`, { headers: { Accept: "application/json", Authorization: `Bearer ${token}` } });
      return res.ok ? await res.json() : null;
    } catch (e) { return null; }
  };

  await Promise.all(["/me", "/settings", "/notifikasi", "/classes", "/mbk", "/teachers", "/jurnal", "/hari-ini", "/portofolio/kelas"].map(ambil));
  const filter = await ambil("/nilai/filters");
  if (!filter) return null;
  const periode = (filter.periodes || []).find((p) => p.status_aktif === "AKTIF")?.id_periode;
  if (!periode) return null;
  const kelas = (filter.classes || []).slice(0, MAKS_KELAS);
  const binaan = new Set(user.kelas_binaan || []);
  const bolehPresensi = (k) => user.role !== "guru" || binaan.has(k.id_kelas);
  const tanggal = hariIni();

  tahap = "Kelas & siswa";
  await ambil(`/dashboard?${qs({ id_periode: periode, id_kelas: "ALL" })}`);
  for (const k of kelas) {
    const id_kelas = k.id_kelas;
    await Promise.all([
      ambil(`/students?${qs({ id_kelas })}`),
      ambil(`/materi/by-context?${qs({ id_kelas })}`),
      ambil(`/nilai?${qs({ id_kelas, id_periode: periode })}`),
      bolehPresensi(k) ? ambil(`/presensi?${qs({ id_kelas, id_periode: periode })}`) : null,
      bolehPresensi(k) ? ambil(`/portofolio/kelas?${qs({ id_kelas })}`) : null,
    ]);
  }

  // Presensi per mapel hari ini untuk mapel yang diampu guru (urutan parameter sama dengan halaman Presensi)
  tahap = "Presensi mapel";
  for (const k of user.role === "guru" ? kelas : []) {
    const diampu = new Set(user.mapel_diampu || []);
    await Promise.all((filter.subjects || []).filter((m) => diampu.has(m.id_mapel)).map((m) => ambil(`/presensi/mapel?${qs({ id_kelas: k.id_kelas, id_mapel: m.id_mapel, tanggal })}`)));
  }

  // Lembar nilai hari ini untuk tiap materi mapel yang diampu (urutan parameter sama dengan halaman Input Nilai)
  tahap = "Lembar nilai";
  let lembar = 0;
  for (const k of kelas) {
    for (const m of filter.subjects || []) {
      const materi = await ambil(`/nilai/materi?${qs({ id_kelas: k.id_kelas, id_mapel: m.id_mapel, id_periode: periode })}`);
      for (const mt of materi?.data || []) {
        for (const j of filter.mbks || []) {
          if (await ambil(`/nilai/students?${qs({ id_kelas: k.id_kelas, id_mapel: m.id_mapel, id_periode: periode, id_jenis: j.id_jenis, id_materi: mt.id_materi, tanggal })}`)) lembar++;
        }
      }
    }
  }

  const hasil = { sesi, tanggal, waktu: new Date().toISOString(), jumlah, kelas: kelas.length, lembar, terpotong: jumlah >= MAKS_PERMINTAAN };
  try { localStorage.setItem(KUNCI, JSON.stringify(hasil)); } catch (e) { /* abaikan */ }
  window.dispatchEvent(new Event(SIAP_EVENT));
  return hasil;
}
