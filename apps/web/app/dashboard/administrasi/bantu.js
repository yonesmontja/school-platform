// Alat bantu bersama halaman Administrasi Sekolah (Surat & Arsip, Inventaris, …).
import { useCallback, useRef } from "react";
import Swal from "sweetalert2";
import { API_URL, authHeaders } from "@/app/lib/akses";

export const esc = (x) => String(x ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
export const toast = (title, icon = "success") => Swal.fire({ toast: true, position: "top-end", icon, title, showConfirmButton: false, timer: 2800 });
export const tgl = (t) => (t ? new Date(`${String(t).slice(0, 10)}T00:00:00`).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "-");
export const gagal = (e) => Swal.fire("Belum bisa", e.message, "warning");
export const nilai = (id) => document.getElementById(id)?.value?.trim() ?? "";
export const rp = (n) => `Rp${Number(n || 0).toLocaleString("id-ID")}`;

/** Kirim FormData (dengan berkas) ke API; galat dilempar sebagai Error berpesan ramah. */
export async function kirimForm(path, data) {
  const fd = new FormData();
  Object.entries(data).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    if (Array.isArray(v)) v.forEach((x) => fd.append(`${k}[]`, x));
    else fd.append(k, v);
  });
  const res = await fetch(`${API_URL}${path}`, { method: "POST", headers: authHeaders(false), body: fd });
  if (res.status === 401) { window.location.href = "/login"; throw new Error("Sesi berakhir, silakan masuk lagi."); }
  const isi = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((isi.errors && Object.values(isi.errors)[0]?.[0]) || isi.message || `Gagal (status ${res.status}).`);
  return isi;
}

/** Berkas di disk privat: diambil dengan token lalu dibuka di tab baru (tab dibuka dulu agar tidak diblokir). */
export async function lihatBerkas(path) {
  const tab = window.open("", "_blank");
  try {
    const res = await fetch(`${API_URL}${path}`, { headers: authHeaders(false) });
    if (!res.ok) throw new Error("Berkas tidak dapat dibuka.");
    const url = URL.createObjectURL(await res.blob());
    if (tab) tab.location.href = url; else window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e) { tab?.close(); Swal.fire("Gagal", e.message, "error"); }
}

/** Swal dengan input alasan wajib; mengembalikan teks alasan atau null bila batal. */
export async function mintaAlasan(title, { text, tombol = "Lanjutkan", label = "Alasan" } = {}) {
  const r = await Swal.fire({ title, text, input: "text", inputLabel: label, inputValidator: (v) => (!v?.trim() ? `Tulis ${label.toLowerCase()}.` : null),
    showCancelButton: true, confirmButtonText: tombol, cancelButtonText: "Kembali", confirmButtonColor: "#d33" });
  return r.isConfirmed ? r.value : null;
}

/** Konfirmasi sederhana. */
export async function yakin(title, text, tombol = "Hapus") {
  const r = await Swal.fire({ title, text, icon: "warning", showCancelButton: true, confirmButtonText: tombol, cancelButtonText: "Batal", confirmButtonColor: "#d33" });
  return r.isConfirmed;
}

/** Deretan tab pill yang tersimpan di ?tab= pada URL. */
export function gantiTabUrl(t) {
  const url = new URL(window.location.href);
  url.searchParams.set("tab", t);
  ["status", "id"].forEach((k) => url.searchParams.delete(k));
  window.history.replaceState(null, "", url);
}

/**
 * Hanya balasan permintaan terakhir yang dipakai: bila daftar dimuat ulang beberapa kali berturut-turut (saringan
 * berubah, aksi selesai), balasan lama yang datang belakangan dibiarkan menggantung agar tidak menimpa data baru.
 */
export function useTerbaru() {
  const urut = useRef(0);
  return useCallback((janji) => {
    const id = ++urut.current;
    return janji.then((x) => (id === urut.current ? x : new Promise(() => {})), (e) => (id === urut.current ? Promise.reject(e) : new Promise(() => {})));
  }, []);
}
