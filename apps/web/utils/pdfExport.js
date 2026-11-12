import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { ATAS_ISI, BAWAH_ISI, TINGGI_TTD, gayaTabelResmi, kopPdf, muatSekolah, selesaikanPdf, teksPdf, ttdPdf } from "./pdfResmi";

/**
 * Laporan tabel resmi (A4): kop sekolah dan judul di setiap halaman, tabel data,
 * tanda tangan kepala sekolah (dan pihak kanan opsional, mis. wali kelas) di bawah setiap halaman,
 * serta kaki halaman bernomor. Dibuka sebagai PDF di tab baru.
 *
 * Parameter ke-4 (pengambil gambar tanda tangan) dipertahankan agar pemanggil lama tetap jalan;
 * tanda tangan kepala sekolah kini dimuat bersama pengaturan sekolah.
 */
export const generateProfessionalPDF = async (data, title, schoolSettings, _getBase64ImageFromUrl, opsi = {}) => {
  if (!data?.length) return false;
  const { orientasi = "landscape", sub = null, columnStyles = {}, kanan = null } = opsi;

  const sek = await muatSekolah(schoolSettings);
  const headers = Object.keys(data[0]);
  const rows = data.map((obj) => Object.values(obj).map((v) => teksPdf(v ?? "")));
  const doc = new jsPDF(orientasi, "mm", "a4");
  const keterangan = sub || `Jumlah data: ${data.length}`;
  kopPdf(doc, sek, { judul: title, sub: keterangan });

  const ph = doc.internal.pageSize.getHeight();
  const yTtd = ph - BAWAH_ISI - TINGGI_TTD;
  autoTable(doc, {
    ...gayaTabelResmi,
    head: [headers.map(teksPdf)],
    body: rows,
    startY: ATAS_ISI,
    columnStyles,
    margin: { ...gayaTabelResmi.margin, bottom: BAWAH_ISI + TINGGI_TTD + 8 },
  });

  // Format tiap halaman sama: kop, tabel, tanda tangan, kaki halaman
  const total = doc.internal.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    ttdPdf(doc, sek, yTtd, { kanan });
  }
  selesaikanPdf(doc, sek, { judul: title, sub: keterangan });

  window.open(doc.output("bloburl"), "_blank");
  return true;
};
