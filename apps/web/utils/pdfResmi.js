// Tampilan resmi bersama untuk PDF jsPDF: kop sekolah (diulang tiap halaman), judul dokumen,
// tanda tangan kepala sekolah, dan kaki halaman "Halaman x dari y". Selaras dengan app/lib/dokumenResmi.js.
import { NAMA_SISTEM, muatSekolah } from "@/app/lib/dokumenResmi";

export { muatSekolah };

const AKSEN = [30, 58, 138];
const ABU = [91, 100, 117];
const GARIS = [207, 214, 228];
const HITAM = [17, 24, 39];

// Huruf bawaan jsPDF hanya Latin-1
export const teksPdf = (v) => String(v ?? "").replace(/[–—−]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .replace(/•/g, "-").replace(/…/g, "...").replace(/[^\x00-\xff\n]/g, "");

const tanggalPanjang = (d = new Date()) => new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
const inisial = (nama) => {
  const kata = String(nama || "").split(/\s+/).filter((k) => k && !/^(SD|SMP|SMA|SMK|MI|MTS|MA|TK|PAUD)$/i.test(k));
  return (kata.length ? kata : ["S"]).slice(0, 3).map((k) => k[0].toUpperCase()).join("");
};

/** Tinggi area kop + judul di setiap halaman (mm); isi halaman mulai di bawahnya. */
export const ATAS_ISI = 44;
/** Ruang kaki halaman (mm). */
export const BAWAH_ISI = 14;

/** Gambar kop sekolah + judul di halaman aktif. Mengembalikan posisi y awal isi. */
export function kopPdf(doc, sek, { judul, sub } = {}) {
  const pw = doc.internal.pageSize.getWidth();
  const m = 14;
  // Lambang inisial
  doc.setFillColor(...AKSEN).circle(m + 9, 15, 8.5, "F");
  doc.setDrawColor(255, 255, 255).setLineWidth(0.6).circle(m + 9, 15, 7.4, "S");
  doc.setFont("times", "bold").setFontSize(11).setTextColor(255, 255, 255).text(inisial(sek?.nama_sekolah), m + 9, 16.6, { align: "center" });
  // Nama & alamat
  doc.setTextColor(...AKSEN).setFont("times", "bold").setFontSize(16);
  doc.text(teksPdf(String(sek?.nama_sekolah || "Nama Sekolah").toUpperCase()), pw / 2, 13, { align: "center" });
  const alamat = [[sek?.alamat_sekolah, sek?.kota].filter(Boolean).join(", "), sek?.npsn ? `NPSN ${sek.npsn}` : ""].filter(Boolean).join("  |  ");
  doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(...ABU);
  if (alamat) doc.text(teksPdf(alamat), pw / 2, 18, { align: "center" });
  doc.setFontSize(7.8).text(NAMA_SISTEM, pw / 2, alamat ? 22 : 18, { align: "center" });
  // Garis ganda
  doc.setDrawColor(...AKSEN).setLineWidth(0.9).line(m, 26, pw - m, 26);
  doc.setLineWidth(0.25).line(m, 27.3, pw - m, 27.3);
  // Judul dokumen
  if (judul) {
    doc.setTextColor(...HITAM).setFont("times", "bold").setFontSize(12.5).text(teksPdf(String(judul).toUpperCase()), pw / 2, 34, { align: "center" });
    if (sub) doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(...ABU).text(teksPdf(sub), pw / 2, 39, { align: "center", maxWidth: pw - 2 * m });
  }
  doc.setTextColor(...HITAM).setFont("helvetica", "normal");
  return ATAS_ISI;
}

/** Tinggi blok tanda tangan (mm). */
export const TINGGI_TTD = 42;

/**
 * Blok tanda tangan mulai di y: "Mengetahui, Kepala Sekolah" (kiri) dan pihak kanan opsional.
 * Bila tempat tidak cukup, pindah ke halaman baru (kop digambar ulang oleh selesaikanPdf).
 */
export function ttdPdf(doc, sek, y, { kanan = null, tanggal = new Date() } = {}) {
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  if (y + TINGGI_TTD > ph - BAWAH_ISI) { doc.addPage(); y = ATAS_ISI; }
  const kiri = pw * 0.25, kananX = pw * 0.75;
  const tempat = teksPdf(`${sek?.kota || ""}${sek?.kota ? ", " : ""}${tanggalPanjang(tanggal)}`);
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(...HITAM);
  if (kanan) {
    doc.text(tempat, kananX, y, { align: "center" });
    doc.text(teksPdf(kanan.jabatan || ""), kananX, y + 5, { align: "center" });
    if (kanan.ttdDataUrl) { try { doc.addImage(kanan.ttdDataUrl, "PNG", kananX - 17, y + 7, 34, 17); } catch { /* gambar rusak: lewati */ } }
    const namaKanan = teksPdf(kanan.nama || "....................................");
    doc.setFont("helvetica", "bold").text(namaKanan, kananX, y + 30, { align: "center" });
    if (kanan.nama) { const l = doc.getTextWidth(namaKanan); doc.setDrawColor(...HITAM).setLineWidth(0.2).line(kananX - l / 2, y + 31, kananX + l / 2, y + 31); }
    doc.setFont("helvetica", "normal");
    if (kanan.nip) doc.text(teksPdf(`NIP. ${kanan.nip}`), kananX, y + 35, { align: "center" });
  } else {
    doc.text(tempat, kiri, y - 5, { align: "center" });
  }
  doc.text("Mengetahui,", kiri, y, { align: "center" });
  doc.text("Kepala Sekolah", kiri, y + 5, { align: "center" });
  if (sek?.ttdDataUrl) { try { doc.addImage(sek.ttdDataUrl, "PNG", kiri - 17, y + 7, 34, 17); } catch { /* gambar rusak: lewati */ } }
  doc.setFont("helvetica", "bold").text(teksPdf(sek?.nama_kepsek || "...................................."), kiri, y + 30, { align: "center" });
  const lebarNama = doc.getTextWidth(teksPdf(sek?.nama_kepsek || "...................................."));
  doc.setDrawColor(...HITAM).setLineWidth(0.2).line(kiri - lebarNama / 2, y + 31, kiri + lebarNama / 2, y + 31);
  doc.setFont("helvetica", "normal");
  if (sek?.nip_kepsek) doc.text(teksPdf(`NIP. ${sek.nip_kepsek}`), kiri, y + 35, { align: "center" });
  return y + TINGGI_TTD;
}

/**
 * Lengkapi setiap halaman: kop + judul (halaman 2 dst.; halaman 1 sudah digambar) dan kaki halaman
 * "nama sekolah · judul" serta "Halaman x dari y". Panggil tepat sebelum menyimpan.
 */
export function selesaikanPdf(doc, sek, { judul, sub, kopHalamanPertama = true } = {}) {
  const total = doc.internal.getNumberOfPages();
  const dicetak = new Date().toLocaleString("id-ID", { dateStyle: "long", timeStyle: "short" });
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();
    if (i > 1 || !kopHalamanPertama) kopPdf(doc, sek, { judul, sub });
    doc.setDrawColor(...GARIS).setLineWidth(0.3).line(14, ph - 11, pw - 14, ph - 11);
    doc.setFillColor(...AKSEN).circle(15.2, ph - 7.4, 0.9, "F");
    doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(...ABU);
    doc.text(teksPdf(`${sek?.nama_sekolah || ""} · ${judul || ""}`), 17.5, ph - 6.6, { maxWidth: pw * 0.55 });
    doc.text(teksPdf(`Dicetak ${dicetak}  ·  `), pw - 14 - doc.getTextWidth(`Halaman ${i} dari ${total}`) - 1, ph - 6.6, { align: "right" });
    doc.setTextColor(...AKSEN).setFont("helvetica", "bold").text(`Halaman ${i} dari ${total}`, pw - 14, ph - 6.6, { align: "right" });
  }
  doc.setTextColor(...HITAM).setFont("helvetica", "normal");
  return doc;
}

/** Gaya tabel autoTable yang selaras dengan kop. */
export const gayaTabelResmi = {
  theme: "grid",
  styles: { fontSize: 8, cellPadding: 1.8, lineColor: GARIS, lineWidth: 0.2, textColor: HITAM },
  headStyles: { fillColor: AKSEN, textColor: 255, halign: "center", fontStyle: "bold" },
  alternateRowStyles: { fillColor: [246, 248, 252] },
  margin: { top: ATAS_ISI, bottom: BAWAH_ISI + 2, left: 14, right: 14 },
};
