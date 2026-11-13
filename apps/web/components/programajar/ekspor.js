// Ekspor Prota & Promes: Excel (.xlsx, beberapa lembar), CSV, dan PDF resmi (kop sekolah, tanda tangan, kaki halaman bernomor).
import * as XLSX from "xlsx";
import { STATUS_TP, matriksPromes, namaFile } from "./program";
import { bingkaiMengalir, esc, gayaHalamanMengalir, judulHtml, muatSekolah, siapkanJendela, ttdHtml, tulisJendela } from "@/app/lib/dokumenResmi";

const tglId = (s) => new Date(`${s}T00:00`).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
const tglJam = (s) => new Date(s).toLocaleString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const st = (k) => STATUS_TP[k]?.label || k;
const labelMinggu = (m) => `${m.nama_bulan.slice(0, 3)} M${m.ke_bulan}${m.efektif ? "" : " (TE)"}`;

// ---------- susunan tabel ----------
function tabelPromes(d) {
  const kepala = ["No", "Elemen CP", "Materi", "Tujuan Pembelajaran", "Alokasi JP", ...d.minggu.map(labelMinggu), "JP Terlaksana", "Ketercapaian (%)", "Status"];
  const isi = matriksPromes(d).map(({ b, sel }) => [b.no, b.elemen || "", b.materi || "", b.tp || "", b.alokasi_jp, ...sel.map((c) => c.rencana || ""), b.jp_selesai, b.persen, st(b.status)]);
  const total = ["", "", "", "Jumlah JP", d.ringkasan.jp_rencana, ...d.minggu.map((_, i) => matriksPromes(d).reduce((n, { sel }) => n + sel[i].rencana, 0) || ""), d.ringkasan.jp_selesai, d.ringkasan.persen, ""];
  return [kepala, ...isi, total];
}
const tabelMingguEfektif = (d) => [
  ["Bulan", "Jumlah Minggu", "Minggu Tidak Efektif", "Minggu Efektif", "Keterangan"],
  ...d.bulan.map((b) => [b.nama, b.jumlah_minggu, b.tidak_efektif, b.efektif, b.keterangan.join("; ")]),
  ["Jumlah", d.bulan.reduce((n, b) => n + b.jumlah_minggu, 0), d.bulan.reduce((n, b) => n + b.tidak_efektif, 0), d.ringkasan.minggu_efektif, ""],
];
const tabelSesi = (d) => [
  ["No TP", "Tujuan Pembelajaran", "Tanggal & Jam", "JP", "Status Sesi", "Pertemuan ke"],
  ...d.baris.flatMap((b) => b.sesi.map((s) => [b.no, b.tp || b.materi || "", `${tglJam(s.mulai)}–${s.selesai}`, s.jp, s.status, s.pertemuan_ke || ""])),
  ...d.sesi_lepas.map((s) => ["-", "(belum tertaut ke TP)", `${tglJam(s.mulai)}–${s.selesai}`, s.jp, s.status, s.pertemuan_ke || ""]),
];
function tabelProta(data) {
  const isi = [["No", "Semester", "Elemen CP", "Materi", "Tujuan Pembelajaran", "Alokasi JP", "Minggu Efektif", "JP Terlaksana", "Ketercapaian (%)", "Status"]];
  let no = 0;
  data.semester.forEach((d) => d.baris.forEach((b) => isi.push([++no, d.periode.semester, b.elemen || "", b.materi || "", b.tp || "", b.alokasi_jp, b.minggu_teks || "", b.jp_selesai, b.persen, st(b.status)])));
  data.semester.forEach((d) => isi.push(["", `Jumlah ${d.periode.semester}`, "", "", "", d.ringkasan.jp_rencana, d.ringkasan.minggu_efektif, d.ringkasan.jp_selesai, d.ringkasan.persen, ""]));
  return isi;
}
const identitas = (judul, mapel, kelas, periode, guru) => [[judul], [`Mata pelajaran: ${mapel}`], [`Kelas: ${kelas || "Semua kelas"}`], [periode], ...(guru ? [[`Guru: ${guru}`]] : []), []];

// ---------- Excel ----------
function lembar(baris, lebar = []) {
  const ws = XLSX.utils.aoa_to_sheet(baris);
  ws["!cols"] = lebar.map((w) => ({ wch: w }));
  return ws;
}

export function excelPromes(d, { mapel, kelas }) {
  const wb = XLSX.utils.book_new();
  const periode = `Semester ${d.periode.semester} ${d.periode.tahun_ajaran} (${tglId(d.periode.tanggal_mulai)} – ${tglId(d.periode.tanggal_selesai)})`;
  const head = identitas("PROGRAM SEMESTER (PROMES)", mapel, kelas, periode, d.atp?.guru);
  XLSX.utils.book_append_sheet(wb, lembar([...head, ...tabelPromes(d)], [5, 18, 22, 48, 9, ...d.minggu.map(() => 9), 12, 12, 12]), "Promes");
  XLSX.utils.book_append_sheet(wb, lembar([...head, ...tabelMingguEfektif(d)], [18, 14, 18, 14, 60]), "Minggu Efektif");
  XLSX.utils.book_append_sheet(wb, lembar([...head, ...tabelSesi(d)], [7, 48, 24, 6, 12, 12]), "Realisasi Sesi");
  XLSX.writeFile(wb, `Promes_${namaFile(mapel)}_${namaFile(kelas || "Semua")}_${d.periode.semester}_${namaFile(d.periode.tahun_ajaran)}.xlsx`);
}

export function excelProta(data, { mapel, kelas }) {
  const wb = XLSX.utils.book_new();
  const head = identitas("PROGRAM TAHUNAN (PROTA)", mapel, kelas, `Tahun ajaran ${data.tahun_ajaran}`, data.semester.find((d) => d.atp)?.atp?.guru);
  XLSX.utils.book_append_sheet(wb, lembar([...head, ...tabelProta(data)], [5, 12, 18, 22, 50, 10, 12, 12, 12, 12]), "Prota");
  data.semester.forEach((d) => {
    XLSX.utils.book_append_sheet(wb, lembar([[`Promes Semester ${d.periode.semester}`], [], ...tabelPromes(d)], [5, 18, 22, 48, 9, ...d.minggu.map(() => 9), 12, 12, 12]), `Promes ${d.periode.semester}`);
    XLSX.utils.book_append_sheet(wb, lembar(tabelMingguEfektif(d), [18, 14, 18, 14, 60]), `Minggu Efektif ${d.periode.semester}`);
  });
  XLSX.writeFile(wb, `Prota_${namaFile(mapel)}_${namaFile(kelas || "Semua")}_${namaFile(data.tahun_ajaran)}.xlsx`);
}

// ---------- CSV ----------
function unduhCsv(baris, nama) {
  const sel = (v) => { const t = String(v ?? ""); return /[",\n;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const blob = new Blob(["﻿" + baris.map((r) => r.map(sel).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: nama });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
export const csvPromes = (d, { mapel, kelas }) => unduhCsv(tabelPromes(d), `Promes_${namaFile(mapel)}_${namaFile(kelas || "Semua")}_${d.periode.semester}_${namaFile(d.periode.tahun_ajaran)}.csv`);
export const csvProta = (data, { mapel, kelas }) => unduhCsv(tabelProta(data), `Prota_${namaFile(mapel)}_${namaFile(kelas || "Semua")}_${namaFile(data.tahun_ajaran)}.csv`);

// ---------- PDF (jendela cetak → simpan sebagai PDF) ----------
const GAYA = `
  body { font-size: 9pt; }
  .meta td { padding: 1px 14px 1px 0; }
  table.t { width: 100%; border-collapse: collapse; margin: 6px 0 10px; }
  .t th, .t td { border: 1px solid #000; padding: 3px 4px; vertical-align: top; }
  .t th { background: var(--aksen); color: #fff; font-weight: 600; }
  .t td.c, .t th.c { text-align: center; } .t td.n { text-align: center; white-space: nowrap; }
  .t .wk { width: 16px; padding: 2px 1px; text-align: center; font-size: 7.5pt; }
  .t th.te, .t td.te { background: #e5e7eb !important; color: #555; }
  .t td.rc { background: #dbeafe; font-weight: 600; } .t td.ok { background: #bbf7d0; font-weight: 600; } .t td.tl { background: #fecaca; font-weight: 600; }
  .t tfoot td { font-weight: 700; background: #f1f5f9; }
  .ket { font-size: 8pt; color: #333; margin: 2px 0 8px; }
  .st { display: inline-block; padding: 0 5px; border-radius: 3px; color: #fff; font-size: 7.5pt; }
  h2 { font-size: 11pt; margin: 12px 0 4px; }
  .ringkas { display: flex; gap: 18px; margin: 4px 0 8px; font-size: 9pt; } .ringkas b { font-size: 11pt; }
`;
const lencana = (k) => `<span class="st" style="background:${STATUS_TP[k]?.warna || "#666"}">${esc(st(k))}</span>`;

function htmlPromes(d, judulSeksi = null) {
  const m = matriksPromes(d);
  const grupBulan = [];
  d.minggu.forEach((w) => { const g = grupBulan[grupBulan.length - 1]; if (g && g.n0 === w.nama_bulan) g.n++; else grupBulan.push({ n0: w.nama_bulan, n: 1 }); });
  const kini = d.minggu_ini;
  const baris = m.map(({ b, sel }) => `<tr><td class="c">${b.no}</td><td>${esc(b.materi || "")}</td><td>${esc(b.tp || "")}</td><td class="c">${b.alokasi_jp}</td>
    ${sel.map((c, i) => {
      const kelas = !c.efektif ? "te" : c.realisasi ? "ok" : c.rencana && i < kini && b.status !== "TUNTAS" ? "tl" : c.rencana ? "rc" : "";
      return `<td class="wk ${kelas}">${c.realisasi ? Math.round(c.realisasi * 10) / 10 : c.rencana || ""}</td>`;
    }).join("")}
    <td class="c">${b.jp_selesai}</td><td class="c">${lencana(b.status)}</td></tr>`).join("");
  const jumlahMinggu = d.minggu.map((_, i) => m.reduce((n, { sel }) => n + sel[i].rencana, 0));
  return `${judulSeksi ? `<h2>${esc(judulSeksi)}</h2>` : ""}
    <div class="ringkas"><span>Minggu efektif <b>${d.ringkasan.minggu_efektif}</b>/${d.ringkasan.minggu_total}</span><span>JP rencana <b>${d.ringkasan.jp_rencana}</b></span>
      <span>JP terlaksana <b>${d.ringkasan.jp_selesai}</b> (${d.ringkasan.persen}%)</span><span>TP tuntas <b>${d.ringkasan.tp_tuntas}</b>/${d.ringkasan.tp_total}</span><span>TP terlambat <b>${d.ringkasan.tp_terlambat}</b></span></div>
    <table class="t"><thead>
      <tr><th rowspan="2" class="c">No</th><th rowspan="2">Materi</th><th rowspan="2">Tujuan Pembelajaran</th><th rowspan="2" class="c">JP</th>
        ${grupBulan.map((g) => `<th class="c" colspan="${g.n}">${esc(g.n0)}</th>`).join("")}<th rowspan="2" class="c">Terlaksana</th><th rowspan="2" class="c">Status</th></tr>
      <tr>${d.minggu.map((w) => `<th class="wk${w.efektif ? "" : " te"}" title="${esc(w.ditandai || "")}">${w.ke_bulan}</th>`).join("")}</tr>
    </thead><tbody>${baris || `<tr><td colspan="${6 + d.minggu.length}" class="c">Belum ada ATP untuk mapel, kelas, dan semester ini.</td></tr>`}</tbody>
    <tfoot><tr><td colspan="3">Jumlah</td><td class="c">${d.ringkasan.jp_rencana}</td>${jumlahMinggu.map((n, i) => `<td class="wk${d.minggu[i].efektif ? "" : " te"}">${n || ""}</td>`).join("")}<td class="c">${d.ringkasan.jp_selesai}</td><td></td></tr></tfoot></table>
    <div class="ket">Angka pada kolom minggu = JP rencana (ATP); <span style="background:#bbf7d0">hijau</span> = JP terlaksana pada minggu itu, <span style="background:#dbeafe">biru</span> = rencana mendatang,
      <span style="background:#fecaca">merah</span> = rencana lewat dan belum terlaksana, <span style="background:#e5e7eb">abu-abu</span> = minggu tidak efektif.</div>
    <table class="t" style="width:auto"><thead><tr><th>Bulan</th><th class="c">Jumlah Minggu</th><th class="c">Tidak Efektif</th><th class="c">Efektif</th><th>Keterangan</th></tr></thead>
      <tbody>${d.bulan.map((b) => `<tr><td>${esc(b.nama)}</td><td class="c">${b.jumlah_minggu}</td><td class="c">${b.tidak_efektif}</td><td class="c">${b.efektif}</td><td>${esc(b.keterangan.join("; "))}</td></tr>`).join("")}</tbody>
      <tfoot><tr><td>Jumlah</td><td class="c">${d.ringkasan.minggu_total}</td><td class="c">${d.ringkasan.minggu_total - d.ringkasan.minggu_efektif}</td><td class="c">${d.ringkasan.minggu_efektif}</td><td></td></tr></tfoot></table>`;
}

async function cetak(judul, sub, isi, sekolah, guru) {
  const w = siapkanJendela();
  if (!w) return false;
  const sek = await muatSekolah(sekolah);
  const html = bingkaiMengalir(sek, `${judulHtml(judul, sub)}${isi}${ttdHtml(sek, { kanan: { jabatan: "Guru Mata Pelajaran", nama: guru } })}`);
  return tulisJendela(w, `${judul} ${sub}`, `${gayaHalamanMengalir(sek, judul, { ukuran: "A4 landscape", margin: "12mm 10mm 14mm" })}${GAYA}`, html);
}

export function pdfPromes(d, { mapel, kelas, sekolah }) {
  const meta = `<table class="meta"><tr><td>Mata pelajaran: <b>${esc(mapel)}</b></td><td>Kelas/Fase: <b>${esc(kelas || "Semua kelas")}${d.atp?.fase ? ` / ${esc(d.atp.fase)}` : ""}</b></td>
    <td>Semester: <b>${esc(d.periode.semester)} ${esc(d.periode.tahun_ajaran)}</b></td><td>Rentang: <b>${tglId(d.periode.tanggal_mulai)} – ${tglId(d.periode.tanggal_selesai)}</b></td>
    <td>Acuan: <b>${esc(d.atp?.judul || "-")}</b>${d.atp && d.atp.status !== "DISETUJUI" ? " (belum disetujui)" : ""}</td></tr></table>`;
  return cetak("Program Semester (Promes)", `${mapel} · ${kelas || "Semua kelas"} · ${d.periode.semester} ${d.periode.tahun_ajaran}`, meta + htmlPromes(d), sekolah, d.atp?.guru);
}

export function pdfProta(data, { mapel, kelas, sekolah }) {
  const t = tabelProta(data);
  const isi = `<table class="meta"><tr><td>Mata pelajaran: <b>${esc(mapel)}</b></td><td>Kelas: <b>${esc(kelas || "Semua kelas")}</b></td><td>Tahun ajaran: <b>${esc(data.tahun_ajaran)}</b></td></tr></table>
    <table class="t"><thead><tr>${t[0].map((h) => `<th class="c">${esc(h)}</th>`).join("")}</tr></thead>
    <tbody>${t.slice(1).map((r) => `<tr>${r.map((v, i) => `<td class="${[0, 1, 5, 6, 7, 8].includes(i) ? "c" : ""}">${i === 9 && v ? lencana(Object.keys(STATUS_TP).find((k) => STATUS_TP[k].label === v)) : esc(v)}</td>`).join("")}</tr>`).join("")}</tbody></table>
    ${data.semester.map((d) => `<div style="break-before: page">${htmlPromes(d, `Program Semester ${d.periode.semester} ${d.periode.tahun_ajaran}`)}</div>`).join("")}`;
  return cetak("Program Tahunan (Prota)", `${mapel} · ${kelas || "Semua kelas"} · ${data.tahun_ajaran}`, isi, sekolah, data.semester.find((d) => d.atp)?.atp?.guru);
}
