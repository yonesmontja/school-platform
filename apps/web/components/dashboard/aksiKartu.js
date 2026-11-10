"use client";
// Aksi cepat untuk menu ⋮ di kartu daftar (ATP, modul ajar, video): alur persetujuan dan hapus tanpa membuka editor.
import Swal from "sweetalert2";
import { minta } from "@/components/banksoal/api";

const tanya = async (title, opsi = {}) =>
  (await Swal.fire({ title, icon: "question", showCancelButton: true, confirmButtonText: "Ya", cancelButtonText: "Batal", ...opsi })).isConfirmed;

/** POST aksi status (ajukan/tarik/setujui/revisi), lalu panggil selesai(). */
export async function jalankanAksi(url, { konfirmasi, body, selesai } = {}) {
  if (konfirmasi && !(await tanya(konfirmasi))) return;
  try {
    const r = await minta("POST", url, body);
    Swal.fire({ toast: true, position: "top-end", icon: "success", title: r.message || "Berhasil", showConfirmButton: false, timer: 2500 });
    selesai?.();
  } catch (err) { Swal.fire("Belum bisa", err.message, "warning"); }
}

/** DELETE dengan konfirmasi merah. */
export async function hapusDariKartu(url, { judul, teks, selesai } = {}) {
  if (!(await tanya(judul || "Hapus data ini?", { text: teks, icon: "warning", confirmButtonText: "Hapus", confirmButtonColor: "#dc3545" }))) return;
  try { await minta("DELETE", url); selesai?.(); } catch (err) { Swal.fire("Gagal", err.message, "error"); }
}

/** Kepala sekolah mengembalikan ke guru dengan catatan perbaikan. */
export async function kembalikanDariKartu(url, selesai) {
  const r = await Swal.fire({ title: "Kembalikan ke guru", input: "textarea", inputLabel: "Catatan perbaikan", inputValidator: (x) => (!x?.trim() ? "Tulis catatan perbaikannya." : undefined), showCancelButton: true, confirmButtonText: "Kembalikan", cancelButtonText: "Batal" });
  if (r.isConfirmed) jalankanAksi(`${url}/revisi`, { body: { catatan: r.value }, selesai });
}

/**
 * Item menu alur persetujuan yang sama untuk semua jenis dokumen.
 * @param {{dasar: string, status: string, bisaUbah: boolean, isKepsek: boolean, selesai: Function, bisaTarik?: boolean, pesanSetujui?: string, pesanAjukan?: string}} o
 */
export function itemPersetujuan({ dasar, status, bisaUbah, isKepsek, selesai, bisaTarik = true, pesanSetujui, pesanAjukan }) {
  const diajukan = status === "DIAJUKAN";
  return [
    { label: "Ajukan ke kepala sekolah", ikon: "bi-send", tampil: bisaUbah && ["DRAF", "REVISI"].includes(status),
      onClick: () => jalankanAksi(`${dasar}/ajukan`, { konfirmasi: pesanAjukan || "Ajukan ke kepala sekolah?", selesai }) },
    { label: "Tarik pengajuan", ikon: "bi-arrow-return-left", tampil: bisaTarik && bisaUbah && diajukan && !isKepsek,
      onClick: () => jalankanAksi(`${dasar}/tarik`, { selesai }) },
    { label: "Setujui", ikon: "bi-patch-check", tampil: isKepsek && diajukan,
      onClick: () => jalankanAksi(`${dasar}/setujui`, { konfirmasi: pesanSetujui || "Setujui?", selesai }) },
    { label: "Kembalikan dengan catatan", ikon: "bi-arrow-counterclockwise", tampil: isKepsek && diajukan,
      onClick: () => kembalikanDariKartu(dasar, selesai) },
  ];
}

/** Enter/Spasi pada kartu yang bisa diklik, tapi tidak saat fokus di tombol di dalamnya (mis. ⋮). */
export const tombolKartu = (buka) => (e) => {
  if (e.target !== e.currentTarget) return;
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); buka(); }
};
