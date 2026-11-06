// PWA: daftar service worker, tombol "Pasang aplikasi", dan notifikasi perangkat untuk hal yang mendesak.
import { useSyncExternalStore } from "react";

let promptPasang = null;
const pendengar = new Set();
const beritahu = () => pendengar.forEach((f) => f());

export function daftarkanPwa() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  if (!window.isSecureContext) return; // service worker hanya di HTTPS atau localhost
  if (process.env.NODE_ENV !== "production") {
    // Jalur kerja (next dev): aset tanpa hash akan basi bila di-cache service worker
    navigator.serviceWorker.getRegistrations().then((list) => list.forEach((r) => r.unregister())).catch(() => {});
    return;
  }
  navigator.serviceWorker.register("/sw.js").catch(() => { /* PWA opsional */ });
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); promptPasang = e; beritahu(); });
  window.addEventListener("appinstalled", () => { promptPasang = null; beritahu(); });
}

export const sudahTerpasang = () =>
  typeof window !== "undefined" && (window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true);
export const perangkatIos = () => typeof navigator !== "undefined" && /iPhone|iPad|iPod/.test(navigator.userAgent);

/** "prompt" (Chrome/Edge/Android siap dipasang), "ios" (pasang manual lewat Bagikan), atau null */
export function useBisaDipasang() {
  return useSyncExternalStore(
    (f) => { pendengar.add(f); return () => pendengar.delete(f); },
    () => (sudahTerpasang() ? null : promptPasang ? "prompt" : perangkatIos() ? "ios" : null),
    () => null,
  );
}

export async function pasangAplikasi() {
  if (!promptPasang) return false;
  promptPasang.prompt();
  const { outcome } = await promptPasang.userChoice;
  promptPasang = null; beritahu();
  return outcome === "accepted";
}

// ===== Notifikasi perangkat =====
const KUNCI_AKTIF = "notif_perangkat";
const KUNCI_TERKABAR = "notif_terkabar";
const baca = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
const tulis = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* abaikan */ } };

export const notifPerangkatDidukung = () => typeof window !== "undefined" && "Notification" in window;
export const notifPerangkatAktif = () => notifPerangkatDidukung() && Notification.permission === "granted" && baca(KUNCI_AKTIF, false);

export async function aturNotifPerangkat(aktif, dataSaatIni = []) {
  if (!notifPerangkatDidukung()) return false;
  if (aktif && Notification.permission !== "granted" && (await Notification.requestPermission()) !== "granted") return false;
  tulis(KUNCI_AKTIF, aktif);
  // Yang sudah ada saat diaktifkan tidak dikabarkan ulang; hanya yang baru muncul sesudahnya
  if (aktif) tulis(KUNCI_TERKABAR, dataSaatIni.map((n) => n.kunci));
  return aktif;
}

/** Tampilkan notifikasi perangkat untuk item mendesak/perlu perhatian yang baru muncul dan belum dibaca. */
export async function kabariPerangkat(data) {
  if (!notifPerangkatAktif()) return;
  const terkabar = new Set(baca(KUNCI_TERKABAR, []));
  const baru = data.filter((n) => !n.dibaca && ["danger", "warning"].includes(n.tingkat) && !terkabar.has(n.kunci));
  if (!baru.length) return;
  tulis(KUNCI_TERKABAR, [...data.map((n) => n.kunci)]);
  const reg = await navigator.serviceWorker?.getRegistration?.().catch(() => null);
  for (const n of baru.slice(0, 3)) {
    const opsi = { body: n.pesan, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", tag: n.kunci, data: { url: n.tautan || "/dashboard/notifikasi" } };
    if (reg) reg.showNotification(n.judul, opsi);
    else new Notification(n.judul, opsi);
  }
}
