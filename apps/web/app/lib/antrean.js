"use client";
// Antrean kiriman offline: nilai, jurnal & presensi yang disimpan saat tidak ada sinyal ditaruh di IndexedDB HP,
// lalu dikirim otomatis begitu tersambung lagi (event "online", saat aplikasi dibuka, dan tiap menit).
// Kiriman yang ditolak server (mis. validasi) tidak dihapus: ditandai gagal agar pengguna bisa memutuskan.
import { useSyncExternalStore } from "react";
import { API_URL } from "@/app/lib/config";
import { AKSES_EVENT } from "@/app/lib/akses";
import Swal from "sweetalert2";

const DB = "edurapor-offline";
const STORE = "antrean";
export const ANTREAN_EVENT = "antrean-berubah";

let ringkas = { jumlah: 0, gagal: 0, mengirim: false, daftar: [] };
const pendengar = new Set();
const beritahu = () => { pendengar.forEach((f) => f()); window.dispatchEvent(new Event(ANTREAN_EVENT)); };

function bukaDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function transaksi(mode, kerja) {
  const db = await bukaDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const hasil = kerja(tx.objectStore(STORE));
    tx.oncomplete = () => { db.close(); resolve(hasil?.result ?? hasil); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

// Setiap kiriman milik akun yang membuatnya: di HP bersama, akun lain tidak melihat atau mengirimnya
const pemilikSaatIni = () => {
  try { return JSON.parse(localStorage.getItem("user") || "null")?.id ?? null; } catch (e) { return null; }
};
const semua = async () => {
  const pemilik = pemilikSaatIni();
  return ((await transaksi("readonly", (s) => s.getAll())) || []).filter((x) => x.pemilik === pemilik);
};

async function segarkan() {
  const daftar = (await semua().catch(() => [])) || [];
  ringkas = { ...ringkas, daftar, jumlah: daftar.length, gagal: daftar.filter((x) => x.galat).length };
  beritahu();
}

/** Simpan kiriman ke antrean. jenis: "nilai" | "jurnal" | "presensi"; label: teks singkat untuk daftar antrean. */
export async function tambahAntrean({ jenis, label, url, method = "POST", body, aiMode = null }) {
  await transaksi("readwrite", (s) => s.add({ jenis, label, url, method, body, aiMode, pemilik: pemilikSaatIni(), dibuat: new Date().toISOString(), galat: null }));
  await segarkan();
}

export async function hapusAntrean(id) {
  await transaksi("readwrite", (s) => s.delete(id));
  await segarkan();
}

const ubah = (item) => transaksi("readwrite", (s) => s.put(item));

/** Galat jaringan (offline, server tak terjangkau), bukan penolakan dari server. */
export const galatJaringan = (err) => err instanceof TypeError || /Failed to fetch|NetworkError|Load failed/i.test(String(err?.message));

/** Pesan saat data gagal dimuat: offline tanpa salinan di HP dijelaskan dengan bahasa sederhana. */
export const pesanGagalMuat = (err) => (galatJaringan(err) || sedangOffline()
  ? "Data ini belum tersimpan di HP ini. Saat ada sinyal, buka halaman ini dan pilih kelasnya sekali; setelah itu bisa dibuka walau offline."
  : err?.message || "Terjadi kesalahan saat memuat data.");

/** Popup gagal memuat: saat offline tanpa salinan tampil sebagai info, bukan error teknis. */
export const swalGagalMuat = (err) => (galatJaringan(err) || sedangOffline()
  ? Swal.fire({ icon: "info", title: "Belum tersedia offline", text: pesanGagalMuat(err), confirmButtonText: "Mengerti" })
  : Swal.fire("Error", err?.message, "error"));

export const sedangOffline = () => typeof navigator !== "undefined" && navigator.onLine === false;

async function kirimJson(url, method, body) {
  const token = localStorage.getItem("token");
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error((data.errors && Object.values(data.errors)[0]?.[0]) || data.message || `Ditolak server (${res.status})`);
    e.status = res.status;
    throw e;
  }
  return data;
}

// Jurnal yang ditulis offline belum dianalisis STNKM-nya: analisis dijalankan dulu saat dikirim
async function siapkanBody(item) {
  if (item.jenis !== "jurnal" || item.body.ai_mode) return item.body;
  const hasil = await kirimJson(`${API_URL}/jurnal/analyze`, "POST", { narasi_kejadian: item.body.narasi_kejadian, ai_mode: item.aiMode || "HEURISTIK" });
  const ai = hasil.data || {};
  const angka = (v) => (v === null || v === undefined || v === "" ? null : Number(v));
  return { ...item.body, val_S: angka(ai.S), val_T: angka(ai.T), val_N: angka(ai.N), val_K: angka(ai.K), val_M: angka(ai.M), ai_mode: ai.mode || "HEURISTIK", ai_raw_response: ai.raw || null };
}

/** Kirim semua antrean berurutan. Mengembalikan { terkirim, gagal }. */
export async function kirimAntrean() {
  if (ringkas.mengirim || sedangOffline() || !localStorage.getItem("token")) return { terkirim: 0, gagal: 0 };
  ringkas = { ...ringkas, mengirim: true }; beritahu();
  let terkirim = 0, gagal = 0;
  try {
    for (const item of await semua()) {
      try {
        const body = await siapkanBody(item);
        await kirimJson(item.url, item.method, body);
        await transaksi("readwrite", (s) => s.delete(item.id));
        terkirim++;
      } catch (err) {
        if (galatJaringan(err)) break; // sinyal putus lagi: coba nanti, urutan tetap
        if (err.status === 401) break; // sesi berakhir: tunggu login ulang
        await ubah({ ...item, galat: err.message });
        gagal++;
      }
    }
  } finally {
    ringkas = { ...ringkas, mengirim: false };
    await segarkan();
  }
  return { terkirim, gagal };
}

let dimulai = false;
/** Dipanggil sekali dari layout dashboard: muat antrean & kirim otomatis saat tersambung. */
export function mulaiAntrean(onTerkirim) {
  if (dimulai || typeof indexedDB === "undefined") return;
  dimulai = true;
  const coba = async () => {
    if (!ringkas.jumlah) return;
    const hasil = await kirimAntrean();
    if (hasil.terkirim) onTerkirim?.(hasil);
  };
  segarkan().then(coba);
  window.addEventListener("online", coba);
  // Ganti akun di HP yang sama: tampilkan & kirim antrean milik akun yang baru
  window.addEventListener(AKSES_EVENT, () => segarkan().then(coba));
  setInterval(coba, 60_000);
}

/** Jumlah kiriman yang masih menunggu (dibaca langsung dari IndexedDB). */
export async function jumlahAntrean() {
  await segarkan();
  return ringkas.jumlah;
}

export function useAntrean() {
  return useSyncExternalStore(
    (f) => { pendengar.add(f); return () => pendengar.delete(f); },
    () => ringkas,
    () => ringkas,
  );
}

/** Status koneksi browser (true = online). */
export function useOnline() {
  return useSyncExternalStore(
    (f) => { window.addEventListener("online", f); window.addEventListener("offline", f); return () => { window.removeEventListener("online", f); window.removeEventListener("offline", f); }; },
    () => navigator.onLine,
    () => true,
  );
}

/** Saat keluar: hapus salinan data offline di HP (antrean dibiarkan bila masih ada, lihat konfirmasi di layout). */
export async function hapusSalinanOffline() {
  try { await caches.delete("edurapor-api"); await caches.delete("edurapor-halaman"); } catch (e) { /* abaikan */ }
}
