// Notebook AI → perangkat ajar (Fase 23 Tahap B): pilihan "Bahan dari Notebook" di dialog Susun dengan AI (ATP, modul ajar, peta tema).
// Catatan yang dipilih dikirim sebagai id_catatan_notebook; server menambahkannya ke bahan rujukan AI.
// Tombol Jadikan… di Notebook membuka Perangkat Ajar dengan ?notebook=<id catatan> sehingga catatan itu terpilih otomatis.
import { minta } from "@/components/banksoal/api";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** Catatan notebook milik akun ini (kosong bila gagal: pilihan tidak ditampilkan). */
export const muatCatatanNotebook = () => minta("GET", "/notebook/catatan").then((r) => r.data || []).catch(() => []);

/** Id catatan yang dibawa dari tombol Jadikan… di Notebook. */
export const catatanDariUrl = () => {
  if (typeof window === "undefined") return null;
  const v = new URLSearchParams(window.location.search).get("notebook");
  return v && /^\d+$/.test(v) ? Number(v) : null;
};

/** HTML pilihan untuk dialog SweetAlert; kosong bila belum punya catatan. */
export function pilihanNotebookHtml(daftar) {
  if (!daftar.length) return "";
  const terpilih = catatanDariUrl();
  return `<label for="aiNotebook" class="form-label small fw-semibold d-block text-start mt-3 mb-1"><i class="bi bi-journal-richtext me-1"></i>Bahan dari Notebook (opsional)</label>`
    + `<select id="aiNotebook" class="form-select"><option value="">Tanpa catatan Notebook</option>`
    + daftar.map((c) => `<option value="${c.id}"${c.id === terpilih ? " selected" : ""}>${esc(c.judul.length > 80 ? `${c.judul.slice(0, 80)}…` : c.judul)} · ${esc(c.notebook?.judul)}</option>`).join("")
    + `</select>`;
}

/** Nilai pilihan di dialog yang sedang terbuka (untuk preConfirm). */
export const bacaPilihanNotebook = () => {
  const v = document.getElementById("aiNotebook")?.value;
  return v ? Number(v) : null;
};
