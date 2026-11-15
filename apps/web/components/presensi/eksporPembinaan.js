// Ekspor Rencana Pembinaan Kehadiran: PDF resmi (kop sekolah, catatan kaya termasuk foto & daftar centang, catatan progres
// jurnal, riwayat versi, tanda tangan) dan Excel (rencana, catatan progres, riwayat versi).
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { muatSekolah } from "@/app/lib/dokumenResmi";
import { ATAS_ISI, BAWAH_ISI, gayaTabelResmi, kopPdf, selesaikanPdf, teksPdf, ttdPdf } from "@/utils/pdfResmi";
import { teksDariHtml } from "@/components/editor/EditorKaya";
import { waktuVersi } from "@/components/editor/RiwayatVersi";
import { teksPengisi } from "@/components/dashboard/Pengisi";

const pengisiCatatan = (j) => ({ guru: j.guru_nama, idGuru: j.id_guru, pengisi: j.pencatat_nama, idGuruPengisi: j.pencatat_id_guru });
const pengisiRencana = (r) => ({ guru: r.kelas?.wali_kelas?.nama_guru, idGuru: r.kelas?.wali_kelas?.id_guru, pengisi: r.pembuat?.name, idGuruPengisi: r.pembuat?.id_guru });

const LABEL_STATUS = { OTOMATIS: "Otomatis", BERLANGSUNG: "Berlangsung", SELESAI: "Selesai", BATAL: "Batal", DIRENCANAKAN: "Direncanakan" };
const tgl = (s) => { if (!s) return "-"; const [y, m, d] = String(s).slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }); };
const namaBerkas = (judul, ext) => `${judul}`.replace(/[^\w\- ]+/g, "").replace(/\s+/g, " ").trim() + `.${ext}`;

export function teksStatusEkspor(r, hariPulih = 10) {
  const ef = r.efektif || {};
  const dasar = LABEL_STATUS[ef.status] || ef.status || "-";
  if (!ef.otomatis) return dasar;
  return `Otomatis - ${dasar}${ef.status === "DIRENCANAKAN" ? "" : ` (${ef.beruntun}/${hariPulih} hari hadir beruntun)`}`;
}
const kondisiAwal = (a) => (a && a.hari ? `${a.hari} hari tercatat: hadir ${a.hadir} (${a.persen ?? "-"}%), sakit ${a.sakit}, izin ${a.izin}, alpa ${a.alpa}` : "-");

/** Foto (URL aplikasi) → JPEG data URL + ukuran, untuk jsPDF. */
async function fotoPdf(src) {
  try {
    const img = await new Promise((ok, gagal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = gagal; i.src = src; });
    const skala = Math.min(1, 1400 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * skala); c.height = Math.round(img.naturalHeight * skala);
    const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
    return { data: c.toDataURL("image/jpeg", 0.85), w: c.width, h: c.height };
  } catch (e) { return null; }
}

// ===================== PDF =====================

/** @param daftar rincian dari GET /presensi/pembinaan/{id} (dengan riwayat & versi jurnal) */
export async function unduhPdfPembinaan(daftar, { namaKelas, sekolah, hariPulih = 10, pencetak } = {}) {
  const sek = await muatSekolah(sekolah);
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pw = doc.internal.pageSize.getWidth(), ph = doc.internal.pageSize.getHeight();
  const m = 14, lebar = pw - 2 * m;
  const judul = "Rencana Pembinaan Kehadiran";
  const sub = [namaKelas ? `Kelas ${namaKelas}` : null, daftar.length === 1 ? daftar[0].siswa?.nama_siswa : `${daftar.length} siswa`].filter(Boolean).join(" · ");
  kopPdf(doc, sek, { judul, sub });
  let y = ATAS_ISI;
  const cukup = (tinggi) => { if (y + tinggi > ph - BAWAH_ISI - 4) { doc.addPage(); y = ATAS_ISI; } };
  const teks = (isi, { ukuran = 9.2, gaya = "normal", x = m, w = lebar, warna = [17, 24, 39] } = {}) => {
    doc.setFont("helvetica", gaya).setFontSize(ukuran).setTextColor(...warna);
    const tinggi = ukuran * 0.43;
    for (const b of doc.splitTextToSize(teksPdf(isi), w)) { cukup(tinggi); doc.text(b, x, y + tinggi * 0.8); y += tinggi; }
    doc.setTextColor(17, 24, 39);
  };
  const subjudul = (isi) => { cukup(12); y += 2.5; doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(30, 58, 138).text(teksPdf(isi), m, y + 3.5); doc.setTextColor(17, 24, 39); y += 6; };
  const tabel = (opsi) => { autoTable(doc, { ...gayaTabelResmi, startY: y, ...opsi }); y = (doc.lastAutoTable?.finalY || y) + 3; };

  for (const [i, r] of daftar.entries()) {
    if (i > 0) { doc.addPage(); y = ATAS_ISI; }
    doc.setFont("times", "bold").setFontSize(12).text(teksPdf(`${daftar.length > 1 ? `${i + 1}. ` : ""}${r.siswa?.nama_siswa || "-"}`), m, y + 4);
    y += 7;
    const rv = r.riwayat?.[0];
    tabel({
      body: [
        ["Kelas", r.kelas?.nama_kelas || namaKelas || "-"],
        ["Tindakan pembinaan", (r.tindakan || []).map((t) => `- ${t}`).join("\n")],
        ["Mulai / tindak lanjut", `${tgl(r.tanggal_mulai)}  ->  ${tgl(r.tanggal_tindak_lanjut)}`],
        ["Status", teksStatusEkspor(r, hariPulih) + (r.tanggal_selesai ? ` · selesai ${tgl(r.tanggal_selesai)}` : "")],
        ["Kondisi awal", kondisiAwal(r.ringkasan_awal)],
        ["Hasil", r.hasil || "-"],
        ["Wali kelas / pengisi", teksPengisi(pengisiRencana(r))],
        ["Versi rencana", rv ? `v${rv.versi} · ${waktuVersi(rv.waktu)} · oleh ${rv.oleh || "-"}${rv.keterangan ? ` · ${rv.keterangan}` : ""}` : "-"],
      ].map(([a, b]) => [teksPdf(a), teksPdf(b)]),
      columnStyles: { 0: { cellWidth: 42, fontStyle: "bold", fillColor: [238, 244, 255] } },
      alternateRowStyles: {},
    });

    // Catatan / latar belakang (HTML editor)
    subjudul("Catatan / latar belakang");
    const gambarMedia = async (md, x = m) => {
      const src = md.getAttribute("src");
      if (md.tagName === "VIDEO") { teks(`Video: ${location.origin}${src}`, { warna: [30, 58, 138], x }); return; }
      const f = await fotoPdf(src);
      if (!f) { teks("[foto tidak dapat dimuat]", { warna: [91, 100, 117], x }); return; }
      let w = Math.min(100, lebar - (x - m)), h = (w * f.h) / f.w;
      if (h > 85) { h = 85; w = (h * f.w) / f.h; }
      cukup(h + 3);
      doc.addImage(f.data, "JPEG", x, y + 1, w, h);
      y += h + 3;
    };
    if (!r.catatan) teks("-", { warna: [91, 100, 117] });
    else {
      const akar = new DOMParser().parseFromString(`<div>${r.catatan}</div>`, "text/html").body.firstChild;
      for (const n of akar.childNodes) {
        if (n.nodeType === 3) { if (n.textContent.trim()) teks(n.textContent); continue; }
        if (n.nodeType !== 1) continue;
        const tag = n.tagName.toLowerCase();
        const media = n.matches("img, video") ? [n] : [...n.querySelectorAll("img, video")];
        if (tag === "ul" || tag === "ol") {
          for (const [k, li] of [...n.children].entries()) {
            const isi = li.textContent.replace(/\s+/g, " ").trim();
            const tanda = n.classList.contains("cek") ? (li.getAttribute("data-cek") === "1" ? "[x]" : "[  ]") : tag === "ol" ? `${k + 1}.` : "-";
            if (isi) teks(`${tanda} ${isi}`, { x: m + 3, w: lebar - 3 });
            for (const md of li.querySelectorAll("img, video")) await gambarMedia(md, m + 6); // foto yang tersisip di dalam butir
          }
          y += 1;
        } else if (tag === "table") {
          const rows = [...n.querySelectorAll("tr")].map((tr) => [...tr.children].map((c) => teksPdf(c.textContent.trim())));
          if (rows.length) tabel({ head: [rows[0]], body: rows.slice(1), styles: { ...gayaTabelResmi.styles, fontSize: 7.6 } });
        } else if (media.length) {
          if (n.textContent.trim()) teks(n.textContent.replace(/\s+/g, " ").trim());
          for (const md of media) await gambarMedia(md);
        } else {
          teks(n.textContent.replace(/\s+/g, " ").trim(), { gaya: /^h[34]$/.test(tag) ? "bold" : tag === "blockquote" ? "italic" : "normal", ukuran: /^h[34]$/.test(tag) ? 10 : 9.2 });
          y += 1.2;
        }
      }
    }

    // Catatan progres (jurnal)
    subjudul("Catatan progres di jurnal");
    const jd = r.jurnal_detail || [];
    if (!jd.length) teks("Belum ada catatan progres.", { warna: [91, 100, 117] });
    else tabel({
      head: [["Tanggal", "Catatan", "Dicatat oleh", "Versi"]],
      body: jd.map((j) => [tgl(j.tanggal), j.narasi_kejadian ?? "(catatan tertutup)", teksPengisi(pengisiCatatan(j)),
        j.versi_terakhir ? `v${j.versi_terakhir}${j.versi?.[0] ? `\n${waktuVersi(j.versi[0].waktu)}\n${j.versi[0].oleh || ""}` : ""}` : "-"].map(teksPdf)),
      columnStyles: { 0: { cellWidth: 26 }, 2: { cellWidth: 30 }, 3: { cellWidth: 28 } },
    });

    // Riwayat versi gabungan
    const log = [
      ...(r.riwayat || []).map((v) => ({ ...v, objek: "Rencana" })),
      ...jd.flatMap((j) => (j.versi || []).map((v) => ({ ...v, objek: `Catatan ${tgl(j.tanggal)}` }))),
    ].sort((a, b) => String(b.waktu).localeCompare(String(a.waktu)));
    if (log.length) {
      subjudul("Riwayat versi");
      tabel({
        head: [["Waktu", "Objek", "Versi", "Oleh", "Keterangan perubahan"]],
        body: log.map((v) => [waktuVersi(v.waktu), v.objek, `v${v.versi}`, v.oleh || "-", v.keterangan || "-"].map(teksPdf)),
        columnStyles: { 0: { cellWidth: 32 }, 1: { cellWidth: 36 }, 2: { cellWidth: 13, halign: "center" }, 3: { cellWidth: 32 } },
      });
    }
  }
  ttdPdf(doc, sek, Math.max(y + 12, ATAS_ISI), { kanan: { jabatan: "Guru pembina", nama: pencetak || "" } });
  selesaikanPdf(doc, sek, { judul, sub });
  doc.save(namaBerkas(`${judul} ${daftar.length === 1 ? daftar[0].siswa?.nama_siswa || "" : namaKelas || ""} ${new Date().toISOString().slice(0, 10)}`, "pdf"));
}

// ===================== EXCEL =====================

export async function unduhExcelPembinaan(daftar, { namaKelas, hariPulih = 10 } = {}) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const rencana = daftar.map((r, i) => ({
    No: i + 1, Siswa: r.siswa?.nama_siswa || "", Kelas: r.kelas?.nama_kelas || namaKelas || "",
    Tindakan: (r.tindakan || []).join("; "), "Catatan / latar belakang": r.catatan_teks ?? teksDariHtml(r.catatan),
    Mulai: r.tanggal_mulai, "Tindak lanjut": r.tanggal_tindak_lanjut, Status: teksStatusEkspor(r, hariPulih),
    "Hadir awal (%)": r.ringkasan_awal?.persen ?? "", "Alpa awal": r.ringkasan_awal?.alpa ?? "", "Hari hadir beruntun": r.efektif?.beruntun ?? "",
    Hasil: r.hasil || "", Selesai: r.tanggal_selesai || "", "Wali kelas / pengisi": teksPengisi(pengisiRencana(r)),
    "Catatan progres": (r.jurnal_detail || []).length, "Versi rencana": r.versi_terakhir ? `v${r.versi_terakhir}` : "",
  }));
  const progres = daftar.flatMap((r) => (r.jurnal_detail || []).map((j) => ({
    Siswa: r.siswa?.nama_siswa || "", Tanggal: j.tanggal, Catatan: j.isi?.catatan ?? j.narasi_kejadian ?? "(catatan tertutup)", "Respons siswa": j.isi?.respons || "",
    "Dicatat oleh": teksPengisi(pengisiCatatan(j)), Versi: j.versi_terakhir ? `v${j.versi_terakhir}` : "", "Terakhir diubah": j.versi?.[0] ? waktuVersi(j.versi[0].waktu) : "",
    "Diubah oleh": j.versi?.[0]?.oleh || "",
  })));
  const log = daftar.flatMap((r) => [
    ...(r.riwayat || []).map((v) => ({ Siswa: r.siswa?.nama_siswa || "", Objek: "Rencana", Versi: `v${v.versi}`, Waktu: waktuVersi(v.waktu), Oleh: v.oleh || "", Keterangan: v.keterangan || "",
      Isi: `Tindakan: ${(v.isi?.tindakan || []).join("; ")}\nCatatan: ${teksDariHtml(v.isi?.catatan)}\nStatus: ${v.isi?.status || ""}${v.isi?.hasil ? `\nHasil: ${v.isi.hasil}` : ""}` })),
    ...(r.jurnal_detail || []).flatMap((j) => (j.versi || []).map((v) => ({ Siswa: r.siswa?.nama_siswa || "", Objek: `Catatan jurnal ${j.tanggal}`, Versi: `v${v.versi}`, Waktu: waktuVersi(v.waktu),
      Oleh: v.oleh || "", Keterangan: v.keterangan || "", Isi: `${v.isi?.catatan || ""}${v.isi?.respons ? `\nRespons siswa: ${v.isi.respons}` : ""}` }))),
  ]);
  const lembar = (baris, kolom) => {
    const ws = XLSX.utils.json_to_sheet(baris.length ? baris : [{ Keterangan: "Tidak ada data" }]);
    ws["!cols"] = kolom.map((w) => ({ wch: w }));
    return ws;
  };
  XLSX.utils.book_append_sheet(wb, lembar(rencana, [4, 24, 8, 40, 60, 11, 12, 30, 10, 8, 10, 30, 11, 18, 10, 8]), "Rencana Pembinaan");
  XLSX.utils.book_append_sheet(wb, lembar(progres, [24, 11, 60, 40, 20, 7, 18, 20]), "Catatan Progres");
  XLSX.utils.book_append_sheet(wb, lembar(log, [24, 24, 7, 18, 20, 30, 70]), "Riwayat Versi");
  XLSX.writeFile(wb, namaBerkas(`Rencana Pembinaan Kehadiran ${namaKelas || ""} ${new Date().toISOString().slice(0, 10)}`, "xlsx"));
}
