// Cetak modul ajar RPM (jendela cetak / simpan PDF) dan unduh sebagai dokumen Word (.doc dari HTML).
import { BAGIAN_RPM, LANGKAH_RPM } from "./rpm";

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const teks = (v) => esc(v).replace(/\n/g, "<br>");

const GAYA = `
  @page { size: A4; margin: 18mm 16mm; }
  body { font-family: "Times New Roman", serif; font-size: 12pt; color: #000; margin: 0; line-height: 1.4; }
  .kop { text-align: center; border-bottom: 2px solid #000; padding-bottom: 6px; margin-bottom: 10px; }
  .kop h1 { font-size: 14pt; margin: 0; } .kop h2 { font-size: 13pt; margin: 2px 0 0; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  td, th { border: 1px solid #000; padding: 4px 6px; vertical-align: top; text-align: left; }
  th { background: #eee; } td.l { width: 30%; font-weight: bold; }
  h3 { font-size: 12.5pt; margin: 12px 0 4px; } .meta td { border: none; padding: 1px 8px 1px 0; }
  .ttd { margin-top: 20px; } .ttd td { border: none; width: 50%; text-align: center; } .ttd .ruang { height: 60px; }
  .baru { page-break-before: always; }
`;

function isiHtml(m, sekolah) {
  const isi = m.isi || {};
  const meta = `<table class="meta"><tr><td>Mata pelajaran: <b>${esc(m.mapel?.nama_mapel)}</b></td><td>Kelas/Fase: <b>${esc(m.kelas?.nama_kelas || "-")}${m.fase ? ` / ${m.fase}` : ""}</b></td></tr>
    <tr><td>Materi: <b>${esc(m.materi?.nama_materi || "")}</b></td><td>Alokasi waktu: <b>${m.jumlah_pertemuan} pertemuan${m.jp_per_pertemuan ? ` × ${m.jp_per_pertemuan} JP` : ""}</b></td></tr>
    <tr><td colspan="2">Penyusun: <b>${esc(m.pembuat?.name || "")}</b> · ${esc(m.periode ? `${m.periode.tahun_ajaran} ${m.periode.semester}` : "")}</td></tr></table>`;
  const bagian = (b) => `<h3>${esc(b.judul)}</h3><table>${b.isian.map((x) => `<tr><td class="l">${esc(x.label)}</td><td>${teks(isi[b.kunci]?.[x.k])}</td></tr>`).join("")}
    ${b.kunci === "identifikasi" ? `<tr><td class="l">Dimensi profil lulusan</td><td>${esc((isi.identifikasi?.profil_lulusan || []).join(", "))}</td></tr>` : ""}</table>`;
  const tp = (m.tp_detail || []).map((t) => `<li>${esc(t.deskripsi)}</li>`).join("");
  const pengalaman = (isi.pertemuan || []).map((p) => `<table><tr><th colspan="2">Pertemuan ${p.ke}${p.jp ? ` (${p.jp} JP)` : ""}</th></tr>
    ${LANGKAH_RPM.map((l) => `<tr><td class="l">${esc(l.label)}</td><td>${teks(p[l.k])}</td></tr>`).join("")}</table>`).join("");
  return `<div class="kop"><h1>${esc(sekolah?.nama_sekolah || "")}</h1><h2>PERENCANAAN PEMBELAJARAN MENDALAM</h2><div>${esc(m.judul)}</div></div>${meta}
    ${tp ? `<h3>Tujuan pembelajaran yang dicakup</h3><ol>${tp}</ol>` : ""}
    ${bagian(BAGIAN_RPM[0])}${bagian(BAGIAN_RPM[1])}
    <h3>C. Pengalaman Belajar</h3>${pengalaman}
    ${bagian(BAGIAN_RPM[2])}${m.paket ? `<p>Paket soal asesmen akhir: <b>${esc(m.paket.judul)}</b></p>` : ""}
    ${isi.diferensiasi ? `<h3>Diferensiasi</h3><p>${teks(isi.diferensiasi)}</p>` : ""}
    <table class="ttd"><tr><td>Mengetahui,<br>Kepala Sekolah<div class="ruang"></div><b>${esc(sekolah?.nama_kepsek || "....................")}</b>${sekolah?.nip_kepsek ? `<br>NIP ${esc(sekolah.nip_kepsek)}` : ""}</td>
      <td>${esc(sekolah?.kota || "")}${sekolah?.kota ? ", " : ""}${new Date(m.disetujui_pada || Date.now()).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}<br>Guru<div class="ruang"></div><b>${esc(m.pembuat?.name || "....................")}</b></td></tr></table>
    ${isi.lkpd ? `<div class="baru"></div><div class="kop"><h2>LEMBAR KERJA PESERTA DIDIK</h2><div>${esc(m.judul)}</div></div><p>Nama: ..................................... Kelas: ........</p><p>${teks(isi.lkpd)}</p>` : ""}`;
}

export function cetakModul(m, sekolah) {
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(`<!doctype html><html lang="id"><head><meta charset="utf-8"><title>${esc(m.judul)}</title><style>${GAYA}</style></head><body>${isiHtml(m, sekolah)}<script>window.onload=()=>window.print()</script></body></html>`);
  w.document.close();
  return true;
}

/** Unduh sebagai .doc (HTML yang dibuka Word) agar guru bisa menyunting di Word. */
export function unduhWord(m, sekolah) {
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" lang="id"><head><meta charset="utf-8"><title>${esc(m.judul)}</title><style>${GAYA}</style></head><body>${isiHtml(m, sekolah)}</body></html>`;
  const url = URL.createObjectURL(new Blob(["﻿", html], { type: "application/msword" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${m.judul.replace(/[^\w\- ]+/g, "").trim() || "modul-ajar"}.doc`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
