import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export const generateProfessionalPDF = async (
  data,
  title,
  schoolSettings,
  getBase64ImageFromUrl,
) => {
  if (data.length === 0) return false;

  const headers = Object.keys(data[0]);
  const rows = data.map((obj) => Object.values(obj));
  const doc = new jsPDF("landscape", "mm", "a4");

  const namaKepsek =
    schoolSettings?.nama_kepsek || "..............................";
  const nipKepsek =
    schoolSettings?.nip_kepsek || "..............................";

  // Ambil Gambar TTD (Jika ada)
  const ttdKepsekBase64 = await getBase64ImageFromUrl(
    schoolSettings?.ttd_kepsek_url,
  );

  // --- KOP SURAT ---
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(title.toUpperCase(), 148, 15, { align: "center" });
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Sistem Informasi Akademik & Analitik STNKM", 148, 21, {
    align: "center",
  });
  doc.text(`Dicetak pada: ${new Date().toLocaleString("id-ID")}`, 148, 26, {
    align: "center",
  });
  doc.setLineWidth(0.5);
  doc.line(14, 29, 283, 29);

  // --- TABEL DATA ---
  autoTable(doc, {
    head: [headers],
    body: rows,
    startY: 33,
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: {
      fillColor: [63, 81, 181],
      textColor: 255,
      halign: "center",
      fontStyle: "bold",
    },
    margin: { bottom: 60 },

    // --- HEADER, FOOTER, & TANDA TANGAN ---
    didDrawPage: function () {
      const pageHeight = doc.internal.pageSize.height;
      const pageWidth = doc.internal.pageSize.width;

      // Footer
      let str = "Halaman " + doc.internal.getNumberOfPages();
      doc.setFontSize(8);
      doc.text(str, pageWidth - 20, pageHeight - 8);
      doc.text(
        "Dokumen ini dihasilkan secara otomatis oleh sistem.",
        14,
        pageHeight - 8,
      );

      // Tanda Tangan Kepsek (Kiri)
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text("Mengetahui,", 20, pageHeight - 50);
      doc.text("Kepala Sekolah", 20, pageHeight - 45);

      if (ttdKepsekBase64) {
        doc.addImage(ttdKepsekBase64, "PNG", 20, pageHeight - 42, 30, 15);
      }

      doc.text("........................................", 20, pageHeight - 25);
      doc.text(`( ${namaKepsek} )`, 20, pageHeight - 20);
      doc.text(`NIP. ${nipKepsek}`, 20, pageHeight - 15);
    },
  });

  const pdfBlobUrl = doc.output("bloburl");
  window.open(pdfBlobUrl, "_blank");
  return true;
};
