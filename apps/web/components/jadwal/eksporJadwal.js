// Ekspor jadwal resmi: Roster mingguan (Senin–Sabtu × jam) atau Daftar sesi, sebagai PDF (jsPDF, A4 lanskap,
// kop sekolah, tanda tangan kepala sekolah, nomor halaman) atau PNG (tata letak HTML yang sama, digambar ke kanvas).
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { GAYA_RESMI, esc, judulHtml, kopHtml, muatSekolah, ttdHtml } from "@/app/lib/dokumenResmi";
import { ATAS_ISI, gayaTabelResmi, kopPdf, selesaikanPdf, teksPdf, ttdPdf } from "@/utils/pdfResmi";

export const HARI = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const pad = (n) => String(n).padStart(2, "0");
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const jam = (d) => `${pad(d.getHours())}.${pad(d.getMinutes())}`;
const tglPanjang = (d) => d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
const tglPendek = (d) => d.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "short", year: "numeric" });
const parse = (s) => { const [t, w = "00:00"] = String(s).replace(" ", "T").split("T"); const [y, m, d] = t.split("-").map(Number); const [h, mi] = w.split(":").map(Number); return new Date(y, m - 1, d, h, mi); };

/** Senin dari minggu yang memuat tanggal d. */
export const seninDari = (d) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); const h = x.getDay(); x.setDate(x.getDate() - (h === 0 ? 6 : h - 1)); return x; };

const namaSesi = (r) => r.mapel?.nama_mapel || r.judul || "Sesi";
const tpSesi = (r) => (r.perangkat || []).filter((p) => p.jenis === "ATP" || p.jenis === "INDIKATOR").map((p) => p.label).filter(Boolean)[0] || r.materi?.nama_materi || "";

/**
 * Siapkan data ekspor.
 * @param {object[]} rows   sesi dari /jadwal (sudah difilter kelas/guru oleh pemanggil)
 * @param {{bentuk: "roster"|"daftar", dari: Date, sampai: Date, keterangan: string}} o
 */
export function susunData(rows, { bentuk, dari, sampai }) {
  const sesi = rows.map((r) => ({ ...r, _m: parse(r.mulai), _s: parse(r.selesai) })).filter((r) => r._m >= dari && r._m < sampai).sort((a, b) => a._m - b._m);
  if (bentuk === "daftar") {
    return { bentuk, sesi, baris: sesi.map((r, i) => [i + 1, tglPendek(r._m), `${jam(r._m)}–${jam(r._s)}`, namaSesi(r), r.guru?.nama_guru || "-", r.kelas?.nama_kelas || "-", r.ruangan?.nama_ruangan || "-", tpSesi(r), r.status_sesi || ""]) };
  }
  // Roster: per minggu, baris = rentang jam unik, kolom = Senin–Sabtu
  const minggu = [];
  for (let s = seninDari(dari); s < sampai; s = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 7)) {
    const akhir = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6);
    const isi = sesi.filter((r) => r._m >= s && r._m < akhir);
    const slot = [...new Set(isi.map((r) => `${jam(r._m)}–${jam(r._s)}`))].sort();
    const sel = slot.map((sl) => HARI.map((_, h) => isi.filter((r) => (r._m.getDay() + 6) % 7 === h && `${jam(r._m)}–${jam(r._s)}` === sl)));
    const tanggal = HARI.map((_, h) => new Date(s.getFullYear(), s.getMonth(), s.getDate() + h));
    minggu.push({ senin: s, sabtu: new Date(s.getFullYear(), s.getMonth(), s.getDate() + 5), slot, sel, tanggal, jumlah: isi.length });
  }
  return { bentuk, sesi, minggu };
}

const rentangTeks = (a, b) => `${tglPanjang(a)} – ${tglPanjang(b)}`;
/** Tanggal terakhir yang dicakup (sampai bersifat eksklusif); hari Minggu dilewati karena libur. */
const akhirCakupan = (sampai) => { const d = new Date(sampai.getFullYear(), sampai.getMonth(), sampai.getDate() - 1); if (d.getDay() === 0) d.setDate(d.getDate() - 1); return d; };
const isiSel = (daftar, { kelas, guru }) => daftar.map((r) => [namaSesi(r), [!kelas && r.kelas?.nama_kelas, !guru && r.guru?.nama_guru, r.ruangan?.nama_ruangan].filter(Boolean).join(" · ")].filter(Boolean).join("\n")).join("\n\n");
export const judulEkspor = (bentuk) => (bentuk === "roster" ? "Jadwal Pelajaran Mingguan" : "Daftar Sesi Jadwal");
const namaBerkas = (o, ext) => `${judulEkspor(o.bentuk)} ${o.keterangan || ""} ${ymd(o.dari)}`.replace(/[^\w\- ]+/g, "").replace(/\s+/g, " ").trim() + `.${ext}`;

// ===================== PDF =====================

export async function unduhPdfJadwal(rows, o, sekolah) {
  const sek = await muatSekolah(sekolah);
  const data = susunData(rows, o);
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const judul = judulEkspor(o.bentuk);
  const subUmum = [o.keterangan, rentangTeks(o.dari, akhirCakupan(o.sampai))].filter(Boolean).join(" · ");
  kopPdf(doc, sek, { judul, sub: subUmum });
  let y = ATAS_ISI;

  if (data.bentuk === "daftar") {
    autoTable(doc, {
      ...gayaTabelResmi, startY: y,
      head: [["No", "Hari, tanggal", "Jam", "Mapel / agenda", "Guru", "Kelas", "Ruang", "TP / materi", "Status"]],
      body: data.baris.map((b) => b.map(teksPdf)),
      columnStyles: { 0: { halign: "center", cellWidth: 9 }, 1: { cellWidth: 38 }, 2: { cellWidth: 22 }, 3: { cellWidth: 40 }, 4: { cellWidth: 34 }, 5: { cellWidth: 16 }, 6: { cellWidth: 20 }, 8: { cellWidth: 20 } },
    });
    y = (doc.lastAutoTable?.finalY || y) + 6;
    if (!data.baris.length) { doc.setFontSize(10).text("Tidak ada sesi pada rentang ini.", 14, y); y += 8; }
  } else {
    data.minggu.forEach((m, i) => {
      if (i > 0) { doc.addPage(); y = ATAS_ISI; }
      doc.setFont("helvetica", "bold").setFontSize(9.5).text(teksPdf(`Minggu ${rentangTeks(m.senin, m.sabtu)}`), 14, y);
      y += 3;
      autoTable(doc, {
        ...gayaTabelResmi, startY: y,
        head: [["Jam", ...HARI.map((h, k) => `${h}\n${m.tanggal[k].toLocaleDateString("id-ID", { day: "numeric", month: "short" })}`)]],
        body: m.slot.length ? m.slot.map((sl, r) => [teksPdf(sl), ...m.sel[r].map((d) => teksPdf(isiSel(d, o)))]) : [["-", { content: "Tidak ada sesi pada minggu ini.", colSpan: 6, styles: { halign: "center" } }]],
        styles: { ...gayaTabelResmi.styles, fontSize: 7.6, valign: "top", minCellHeight: 10 },
        // Enam kolom hari sama lebar (A4 lanskap 297 mm − margin 28 mm − kolom jam 22 mm)
        columnStyles: { 0: { cellWidth: 22, halign: "center", fontStyle: "bold" }, ...Object.fromEntries([1, 2, 3, 4, 5, 6].map((k) => [k, { cellWidth: (297 - 28 - 22) / 6 }])) },
        didParseCell: (c) => { if (c.section === "body" && c.column.index > 0 && c.cell.raw) c.cell.styles.fillColor = [238, 244, 255]; },
      });
      y = (doc.lastAutoTable?.finalY || y) + 6;
    });
  }
  // Tempat & tanggal digambar 5 mm di atas y, jadi beri jarak dari tabel
  ttdPdf(doc, sek, Math.max(y + 12, ATAS_ISI), {});
  selesaikanPdf(doc, sek, { judul, sub: subUmum });
  doc.save(namaBerkas(o, "pdf"));
}

// ===================== PNG =====================

const GAYA_PNG = `
  .lembar { width: 1500px; padding: 36px 44px 40px; background: #fff; color: #111827; font-family: 'Segoe UI', Helvetica, Arial, sans-serif; font-size: 14px; box-sizing: border-box; }
  .lembar h3 { font-size: 15px; margin: 16px 0 6px; }
  table.jd { width: 100%; border-collapse: collapse; table-layout: fixed; }
  table.jd th { background: #1e3a8a; color: #fff; padding: 7px 6px; font-size: 13px; border: 1px solid #1e3a8a; }
  table.jd td { border: 1px solid #cfd6e4; padding: 6px 7px; vertical-align: top; font-size: 12.5px; white-space: pre-line; }
  table.jd td.jam { font-weight: 700; text-align: center; background: #f6f8fc; }
  table.jd td.isi { background: #eef4ff; }
  table.jd tr:nth-child(even) td:not(.isi):not(.jam) { background: #fafbfd; }
  .kosong { color: #6b7280; text-align: center; padding: 18px; }
`;

function htmlLembar(data, o, sek) {
  const judul = judulEkspor(o.bentuk);
  const sub = [o.keterangan, rentangTeks(o.dari, akhirCakupan(o.sampai))].filter(Boolean).join(" · ");
  let isi;
  if (data.bentuk === "daftar") {
    isi = `<table class="jd"><colgroup><col style="width:44px"><col style="width:190px"><col style="width:110px"><col style="width:190px"><col style="width:170px"><col style="width:80px"><col style="width:100px"><col><col style="width:100px"></colgroup>
      <tr><th>No</th><th>Hari, tanggal</th><th>Jam</th><th>Mapel / agenda</th><th>Guru</th><th>Kelas</th><th>Ruang</th><th>TP / materi</th><th>Status</th></tr>
      ${data.baris.length ? data.baris.map((b) => `<tr>${b.map((v, i) => `<td${i === 0 ? ' style="text-align:center"' : ""}>${esc(v)}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="9" class="kosong">Tidak ada sesi pada rentang ini.</td></tr>`}</table>`;
  } else {
    isi = data.minggu.map((m) => `<h3>Minggu ${esc(rentangTeks(m.senin, m.sabtu))}</h3><table class="jd"><colgroup><col style="width:120px"></colgroup>
      <tr><th>Jam</th>${HARI.map((h, k) => `<th>${h}<br><span style="font-weight:400">${esc(m.tanggal[k].toLocaleDateString("id-ID", { day: "numeric", month: "short" }))}</span></th>`).join("")}</tr>
      ${m.slot.length ? m.slot.map((sl, r) => `<tr><td class="jam">${esc(sl)}</td>${m.sel[r].map((d) => `<td class="${d.length ? "isi" : ""}">${esc(isiSel(d, o))}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="7" class="kosong">Tidak ada sesi pada minggu ini.</td></tr>`}</table>`).join("");
  }
  return `<div class="lembar">${kopHtml(sek)}${judulHtml(judul, sub)}${isi}${ttdHtml(sek, {})}</div>`;
}

/** HTML → SVG foreignObject → kanvas → PNG (gambar sudah berupa data URL, jadi kanvas tidak tercemar). */
async function htmlKePng(html, gaya, skala = 2) {
  const wadah = document.createElement("div");
  wadah.style.cssText = "position:fixed;left:-10000px;top:0;";
  wadah.innerHTML = `<style>${gaya}</style>${html}`;
  document.body.appendChild(wadah);
  const lembar = wadah.querySelector(".lembar");
  await Promise.all([...wadah.querySelectorAll("img")].map((i) => (i.complete ? null : new Promise((ok) => { i.onload = i.onerror = ok; }))));
  const w = lembar.offsetWidth, h = lembar.offsetHeight;
  wadah.remove();
  wadah.removeAttribute("style"); // posisi di luar layar hanya untuk mengukur; jangan ikut tergambar
  const xhtml = new XMLSerializer().serializeToString(wadah);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><foreignObject width="100%" height="100%">${xhtml}</foreignObject></svg>`;
  const img = new Image();
  await new Promise((ok, gagal) => { img.onload = ok; img.onerror = () => gagal(new Error("Gambar jadwal tidak bisa dibuat.")); img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`; });
  const kanvas = document.createElement("canvas");
  kanvas.width = w * skala; kanvas.height = h * skala;
  const ctx = kanvas.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, kanvas.width, kanvas.height);
  ctx.scale(skala, skala);
  ctx.drawImage(img, 0, 0);
  return kanvas.toDataURL("image/png");
}

export async function unduhPngJadwal(rows, o, sekolah) {
  const sek = await muatSekolah(sekolah);
  // Gaya resmi dibatasi ke .lembar, agar tidak menyentuh halaman aplikasi selama gambar diukur
  const gaya = GAYA_RESMI.replace(":root", ".lembar").replace("* { box-sizing", ".lembar * { box-sizing").replace("body {", ".lembar {");
  const url = await htmlKePng(htmlLembar(susunData(rows, o), o, sek), `${gaya}${GAYA_PNG}`);
  const a = document.createElement("a");
  a.href = url;
  a.download = namaBerkas(o, "png");
  document.body.appendChild(a);
  a.click();
  a.remove();
}
