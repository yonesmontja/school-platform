"use client";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const NAMA_SISTEM = "Sistem Informasi Akademik & Analitik STNKM";

// Latar putih agar gambar hasil ekspor tidak transparan
const latarPutih = {
  id: "latarPutih",
  beforeDraw(chart) {
    const { ctx, width, height } = chart;
    ctx.save();
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  },
};

/**
 * Gambar ulang grafik di kanvas tersembunyi berukuran tetap dengan warna tema terang,
 * agar hasil ekspor tajam dan rapi walau aplikasi sedang dalam mode gelap.
 */
export async function renderGrafikStatis(config, lebar, tinggi, skala = 2) {
  const { default: Chart } = await import("chart.js/auto");
  const wadah = document.createElement("div");
  wadah.style.cssText = `position:fixed;left:-10000px;top:0;width:${lebar}px;height:${tinggi}px;`;
  const canvas = document.createElement("canvas");
  canvas.width = lebar;
  canvas.height = tinggi;
  wadah.appendChild(canvas);
  document.body.appendChild(wadah);

  const asli = { color: Chart.defaults.color, borderColor: Chart.defaults.borderColor };
  Chart.defaults.color = "#495057";
  Chart.defaults.borderColor = "rgba(0,0,0,0.08)";
  let chart;
  try {
    chart = new Chart(canvas, {
      ...config,
      data: { ...config.data, datasets: config.data.datasets.map((d) => ({ ...d, data: [...d.data] })) },
      options: { ...config.options, responsive: false, maintainAspectRatio: false, animation: false, devicePixelRatio: skala },
      plugins: [...(config.plugins || []), latarPutih],
    });
    const salinan = document.createElement("canvas");
    salinan.width = canvas.width;
    salinan.height = canvas.height;
    salinan.getContext("2d").drawImage(canvas, 0, 0);
    return salinan;
  } finally {
    chart?.destroy();
    Chart.defaults.color = asli.color;
    Chart.defaults.borderColor = asli.borderColor;
    wadah.remove();
  }
}

const unduh = (href, nama) => {
  const a = document.createElement("a");
  a.href = href;
  a.download = nama;
  a.click();
};
export const namaFileAman = (s) => String(s).replace(/[^\w\-]+/g, "_").replace(/_+/g, "_").slice(0, 80);
const tanggalCetak = () => new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });

// PNG berkop: judul grafik, nama sekolah, konteks (kelas/periode), lalu grafik
export async function eksporPNG({ config, judul, konteks, sekolah, namaFile }) {
  const W = 1200, PAD = 32, KOP = 118, CH = 560, KAKI = 40, S = 2;
  const grafik = await renderGrafikStatis(config, W - PAD * 2, CH, S);
  const canvas = document.createElement("canvas");
  canvas.width = W * S;
  canvas.height = (KOP + CH + KAKI) * S;
  const ctx = canvas.getContext("2d");
  ctx.scale(S, S);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, KOP + CH + KAKI);
  ctx.textAlign = "center";
  ctx.fillStyle = "#212529";
  ctx.font = "700 24px system-ui, sans-serif";
  ctx.fillText(judul, W / 2, 42, W - PAD * 2);
  ctx.font = "600 15px system-ui, sans-serif";
  ctx.fillText(sekolah?.nama_sekolah || NAMA_SISTEM, W / 2, 70);
  ctx.fillStyle = "#6c757d";
  ctx.font = "13px system-ui, sans-serif";
  ctx.fillText(konteks, W / 2, 94, W - PAD * 2);
  ctx.drawImage(grafik, PAD, KOP, W - PAD * 2, CH);
  ctx.strokeStyle = "#dee2e6";
  ctx.beginPath(); ctx.moveTo(PAD, KOP + CH + 8); ctx.lineTo(W - PAD, KOP + CH + 8); ctx.stroke();
  ctx.font = "11px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(NAMA_SISTEM, PAD, KOP + CH + 26);
  ctx.textAlign = "right";
  ctx.fillText(`Dicetak: ${tanggalCetak()}`, W - PAD, KOP + CH + 26);
  unduh(canvas.toDataURL("image/png"), `${namaFileAman(namaFile)}.png`);
}

export function eksporCSV({ table, namaFile }) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [table.headers.map(esc).join(","), ...table.rows.map((r) => r.map(esc).join(","))].join("\r\n");
  // BOM agar Excel membaca UTF-8 dengan benar
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  unduh(url, `${namaFileAman(namaFile)}.csv`);
  URL.revokeObjectURL(url);
}

const kopPDF = (doc, { judul, konteks, sekolah }) => {
  const pw = doc.internal.pageSize.getWidth();
  doc.setTextColor(33, 37, 41);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(String(sekolah?.nama_sekolah || NAMA_SISTEM).toUpperCase(), pw / 2, 14, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const alamat = [sekolah?.alamat_sekolah, sekolah?.npsn ? `NPSN: ${sekolah.npsn}` : null].filter(Boolean).join(" • ");
  if (alamat) doc.text(alamat, pw / 2, 19, { align: "center" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(judul.toUpperCase(), pw / 2, 27, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(108, 117, 125);
  doc.text(`${konteks} • Dicetak: ${tanggalCetak()}`, pw / 2, 32, { align: "center" });
  doc.setDrawColor(33, 37, 41);
  doc.setLineWidth(0.6);
  doc.line(12, 35, pw - 12, 35);
  return 40;
};

const ttdPDF = (doc, y, { sekolah, petugas, jabatanKanan = "Guru / Petugas Analitik" }) => {
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  if (y > ph - 45) { doc.addPage(); y = 20; }
  doc.setTextColor(33, 37, 41);
  doc.setFontSize(10);
  const kiri = pw * 0.25, kanan = pw * 0.75;
  doc.text("Mengetahui,", kiri, y, { align: "center" });
  doc.text("Kepala Sekolah", kiri, y + 5, { align: "center" });
  doc.text(`${sekolah?.kota || "-"}, ${tanggalCetak()}`, kanan, y, { align: "center" });
  doc.text(jabatanKanan, kanan, y + 5, { align: "center" });
  doc.setFont("helvetica", "bold");
  doc.text(sekolah?.nama_kepsek || "....................................", kiri, y + 27, { align: "center" });
  doc.text(petugas || "....................................", kanan, y + 27, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.text(`NIP. ${sekolah?.nip_kepsek || "-"}`, kiri, y + 32, { align: "center" });
};

// PDF: kop, grafik proporsional, tabel rincian, dan tanda tangan
export async function eksporPDF({ config, judul, konteks, table, sekolah, petugas, namaFile }) {
  const doc = new jsPDF("landscape", "mm", "a4");
  const pw = doc.internal.pageSize.getWidth();
  let y = kopPDF(doc, { judul, konteks, sekolah });
  if (config) {
    const lebarMm = pw - 24, tinggiMm = 95;
    const grafik = await renderGrafikStatis(config, Math.round(lebarMm * 4), Math.round(tinggiMm * 4), 3);
    doc.addImage(grafik.toDataURL("image/png"), "PNG", 12, y, lebarMm, tinggiMm);
    y += tinggiMm + 4;
  }
  if (table?.rows?.length) {
    autoTable(doc, {
      head: [["No", ...table.headers]],
      body: table.rows.map((r, i) => [i + 1, ...r]),
      startY: y,
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 1.6 },
      headStyles: { fillColor: [52, 58, 64], textColor: 255, halign: "center" },
      margin: { left: 12, right: 12 },
    });
    y = doc.lastAutoTable.finalY + 10;
  }
  ttdPDF(doc, y, { sekolah, petugas });
  doc.save(`${namaFileAman(namaFile)}.pdf`);
}

// PDF laporan EWS: statistik ringkas + tabel rincian temuan
export function eksporPDFEws({ records, judulFilter, konteks, sekolah, petugas, namaFile }) {
  const doc = new jsPDF("landscape", "mm", "a4");
  let y = kopPDF(doc, { judul: "Laporan Sistem Peringatan Dini (EWS)", konteks: `${judulFilter} • ${konteks}`, sekolah });
  const hitung = (s) => records.filter((r) => r.skor === s).length;
  doc.setTextColor(33, 37, 41);
  doc.setFontSize(9);
  doc.text(`Total terdeteksi: ${records.length} siswa   |   Bahaya: ${hitung(3)}   |   Perhatian: ${hitung(2)}   |   Waspada: ${hitung(1)}`, 12, y);
  autoTable(doc, {
    head: [["No", "Peserta Didik", "Kelas", "Tingkat Risiko", "Kategori", "Detail Temuan", "Rencana Tindak Lanjut"]],
    body: records.map((r, i) => [i + 1, `${r.nama_siswa}\nNISN: ${r.nisn || r.id_siswa}`, r.kelas, r.tingkatan, r.kategori.join(", "),
      r.issues.map((x) => `• [${x.kategori}] ${x.deskripsi}`).join("\n"), "Konseling / pendampingan khusus"]),
    startY: y + 3,
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 1.6, valign: "middle" },
    headStyles: { fillColor: [220, 53, 69], textColor: 255, halign: "center" },
    columnStyles: { 0: { cellWidth: 9, halign: "center" }, 5: { cellWidth: 95 } },
    margin: { left: 12, right: 12 },
  });
  ttdPDF(doc, doc.lastAutoTable.finalY + 10, { sekolah, petugas, jabatanKanan: "Koordinator BK / Wali Kelas" });
  doc.save(`${namaFileAman(namaFile)}.pdf`);
}

// Ringkasan EWS sebagai gambar (maks. 10 siswa teratas)
export function eksporPNGEws({ records, judulFilter, konteks, sekolah, namaFile }) {
  const W = 1000, baris = Math.min(records.length, 10), H = 170 + baris * 34 + (records.length > 10 ? 30 : 0) + 20, S = 2;
  const canvas = document.createElement("canvas");
  canvas.width = W * S;
  canvas.height = H * S;
  const ctx = canvas.getContext("2d");
  ctx.scale(S, S);
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H);
  const grad = ctx.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, "#dc3545"); grad.addColorStop(1, "#f97316");
  ctx.fillStyle = grad; ctx.fillRect(0, 0, W, 72);
  ctx.fillStyle = "#fff"; ctx.font = "700 21px system-ui, sans-serif";
  ctx.fillText("LAPORAN PERINGATAN DINI (EWS)", 28, 34);
  ctx.font = "13px system-ui, sans-serif";
  ctx.fillText(sekolah?.nama_sekolah || NAMA_SISTEM, 28, 56);
  ctx.fillStyle = "#495057"; ctx.font = "13px system-ui, sans-serif";
  ctx.fillText(`${judulFilter} • ${konteks} • ${tanggalCetak()}`, 28, 102, W - 56);
  let y = 140;
  ctx.font = "700 12px system-ui, sans-serif"; ctx.fillStyle = "#6c757d";
  [["NO", 32], ["NAMA SISWA", 72], ["TINGKAT RISIKO", 330], ["TEMUAN UTAMA", 490]].forEach(([t, x]) => ctx.fillText(t, x, y));
  y += 22;
  records.slice(0, 10).forEach((r, i) => {
    ctx.fillStyle = i % 2 ? "#ffffff" : "#f8f9fa"; ctx.fillRect(24, y - 18, W - 48, 32);
    ctx.fillStyle = "#212529"; ctx.font = "12px system-ui, sans-serif"; ctx.fillText(String(i + 1), 32, y);
    ctx.font = "700 12px system-ui, sans-serif"; ctx.fillText(r.nama_siswa.slice(0, 30), 72, y);
    ctx.fillStyle = r.skor === 3 ? "#dc3545" : r.skor === 2 ? "#d39e00" : "#0aa2c0"; ctx.fillText(r.tingkatan, 330, y);
    ctx.fillStyle = "#495057"; ctx.font = "11px system-ui, sans-serif";
    const d = r.issues[0]?.deskripsi || "-";
    ctx.fillText(d.length > 70 ? `${d.slice(0, 70)}…` : d, 490, y);
    y += 34;
  });
  if (records.length > 10) {
    ctx.fillStyle = "#868e96"; ctx.font = "italic 11px system-ui, sans-serif";
    ctx.fillText(`… dan ${records.length - 10} siswa lainnya. Ekspor PDF untuk laporan lengkap.`, 32, y + 4);
  }
  unduh(canvas.toDataURL("image/png"), `${namaFileAman(namaFile)}.png`);
}
