// Ekspor dokumen sederhana ke .docx (Word/WPS/Google Docs, juga di HP) dan .pdf, dari daftar blok yang sama.
// Blok: { t: "judul", teks, sub } | { t: "h", teks } | { t: "p", teks, tebal?, miring? } | { t: "li", teks, label? }
//       | { t: "tabel", kolom: [...], baris: [[...]] }
// .docx disusun sendiri (paket ZIP tanpa kompresi berisi XML WordprocessingML), tanpa pustaka tambahan,
// sehingga berkasnya valid dan bisa dibuka Microsoft Word, WPS Office, Google Docs, maupun penampil dokumen Android.
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { NAMA_SISTEM } from "@/app/lib/dokumenResmi";
import { ATAS_ISI, BAWAH_ISI, gayaTabelResmi, kopPdf, selesaikanPdf, teksPdf } from "@/utils/pdfResmi";

const unduhBlob = (blob, nama) => {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: nama });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
};
export const namaBerkasAman = (s) => String(s || "dokumen").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 120);

// ===================== ZIP (metode simpan, tanpa kompresi) =====================
const TABEL_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = TABEL_CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

/** @param {{nama: string, isi: Uint8Array}[]} berkas */
export function buatZip(berkas) {
  const enc = new TextEncoder();
  const bagian = [];
  const pusat = [];
  let offset = 0;
  const d = new Date();
  const waktu = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff;
  const tanggal = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;
  for (const f of berkas) {
    const nama = enc.encode(f.nama);
    const crc = crc32(f.isi);
    const lokal = new DataView(new ArrayBuffer(30));
    lokal.setUint32(0, 0x04034b50, true); lokal.setUint16(4, 20, true); lokal.setUint16(6, 0x0800, true); lokal.setUint16(8, 0, true);
    lokal.setUint16(10, waktu, true); lokal.setUint16(12, tanggal, true); lokal.setUint32(14, crc, true);
    lokal.setUint32(18, f.isi.length, true); lokal.setUint32(22, f.isi.length, true); lokal.setUint16(26, nama.length, true); lokal.setUint16(28, 0, true);
    bagian.push(new Uint8Array(lokal.buffer), nama, f.isi);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
    c.setUint16(12, waktu, true); c.setUint16(14, tanggal, true); c.setUint32(16, crc, true); c.setUint32(20, f.isi.length, true); c.setUint32(24, f.isi.length, true);
    c.setUint16(28, nama.length, true); c.setUint32(42, offset, true);
    pusat.push(new Uint8Array(c.buffer), nama);
    offset += 30 + nama.length + f.isi.length;
  }
  const ukuranPusat = pusat.reduce((n, b) => n + b.length, 0);
  const akhir = new DataView(new ArrayBuffer(22));
  akhir.setUint32(0, 0x06054b50, true); akhir.setUint16(8, berkas.length, true); akhir.setUint16(10, berkas.length, true);
  akhir.setUint32(12, ukuranPusat, true); akhir.setUint32(16, offset, true);
  return new Blob([...bagian, ...pusat, new Uint8Array(akhir.buffer)], { type: "application/zip" });
}

// ===================== DOCX =====================
const x = (s) => String(s ?? "").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const AKSEN = "1E3A8A", ABU = "5B6475";

/** Run teks; baris baru di dalam teks menjadi <w:br/>. */
function run(teks, { tebal, miring, ukuran, warna, huruf } = {}) {
  const rpr = [huruf ? `<w:rFonts w:ascii="${huruf}" w:hAnsi="${huruf}" w:cs="${huruf}"/>` : "", tebal ? "<w:b/>" : "", miring ? "<w:i/>" : "",
    warna ? `<w:color w:val="${warna}"/>` : "", ukuran ? `<w:sz w:val="${ukuran * 2}"/><w:szCs w:val="${ukuran * 2}"/>` : ""].join("");
  const isi = String(teks ?? "").split("\n").map((b, i) => `${i ? "<w:br/>" : ""}<w:t xml:space="preserve">${x(b)}</w:t>`).join("");
  return `<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ""}${isi}</w:r>`;
}
const para = (runs, { rata, spasiSetelah = 120, spasiSebelum = 0, inden, gantung, batasBawah } = {}) =>
  `<w:p><w:pPr>${batasBawah ? `<w:pBdr><w:bottom w:val="double" w:sz="6" w:space="1" w:color="${AKSEN}"/></w:pBdr>` : ""}`
  + `<w:spacing w:before="${spasiSebelum}" w:after="${spasiSetelah}"/>${inden ? `<w:ind w:left="${inden}"${gantung ? ` w:hanging="${gantung}"` : ""}/>` : ""}`
  + `${rata ? `<w:jc w:val="${rata}"/>` : ""}</w:pPr>${runs}</w:p>`;

function tabelDocx(kolom, baris) {
  const lebar = Math.floor(9000 / Math.max(1, kolom.length));
  const sel = (isi, kepala) => `<w:tc><w:tcPr><w:tcW w:w="${lebar}" w:type="dxa"/>${kepala ? `<w:shd w:val="clear" w:color="auto" w:fill="${AKSEN}"/>` : ""}</w:tcPr>`
    + para(run(isi, kepala ? { tebal: true, warna: "FFFFFF", ukuran: 10 } : { ukuran: 10 }), { spasiSetelah: 0 }) + "</w:tc>";
  const garis = `<w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map((g) => `<w:${g} w:val="single" w:sz="4" w:space="0" w:color="9AA5BB"/>`).join("")}</w:tblBorders>`;
  return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/>${garis}<w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr>`
    + `<w:tblGrid>${kolom.map(() => `<w:gridCol w:w="${lebar}"/>`).join("")}</w:tblGrid>`
    + `<w:tr><w:trPr><w:tblHeader/></w:trPr>${kolom.map((k) => sel(k, true)).join("")}</w:tr>`
    + baris.map((r) => `<w:tr>${kolom.map((_, i) => sel(r[i] ?? "", false)).join("")}</w:tr>`).join("") + "</w:tbl>" + para("", { spasiSetelah: 60 });
}

function gambarDocx(rId, lebarCm, tinggiCm) {
  const cx = Math.round(lebarCm * 360000), cy = Math.round(tinggiCm * 360000);
  return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="1" name="Logo"/>`
    + `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">`
    + `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="1" name="logo"/><pic:cNvPicPr/></pic:nvPicPr>`
    + `<pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`
    + `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>`
    + `</a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
}

const dataUrlKeBytes = (u) => {
  const m = /^data:image\/(png|jpe?g);base64,(.+)$/i.exec(u || "");
  if (!m) return null;
  const bin = atob(m[2]);
  const b = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  return { ext: m[1].toLowerCase().startsWith("jp") ? "jpeg" : "png", isi: b };
};

/** Susun berkas .docx (Blob) dari blok, dengan kop sekolah. */
export function docxDariBlok(blok, sek) {
  const logo = dataUrlKeBytes(sek?.logoDataUrl);
  const alamat = [[sek?.alamat_sekolah, sek?.kota].filter(Boolean).join(", "), sek?.npsn ? `NPSN ${sek.npsn}` : ""].filter(Boolean).join("  ·  ");
  const r = sek?.logoRasio || 1;
  const kop = (logo ? para(gambarDocx("rIdLogo", r >= 1 ? 2.2 : 2.2 * r, r >= 1 ? 2.2 / r : 2.2), { rata: "center", spasiSetelah: 40 }) : "")
    + para(run(String(sek?.nama_sekolah || "Nama Sekolah").toUpperCase(), { tebal: true, ukuran: 16, warna: AKSEN, huruf: "Georgia" }), { rata: "center", spasiSetelah: 0 })
    + (alamat ? para(run(alamat, { ukuran: 9, warna: ABU }), { rata: "center", spasiSetelah: 0 }) : "")
    + para(run(NAMA_SISTEM, { ukuran: 8, warna: ABU }), { rata: "center", spasiSetelah: 200, batasBawah: true });

  const isi = blok.map((b) => {
    if (b.t === "judul") return para(run(String(b.teks).toUpperCase(), { tebal: true, ukuran: 13, huruf: "Georgia" }), { rata: "center", spasiSebelum: 120, spasiSetelah: b.sub ? 0 : 200 })
      + (b.sub ? para(run(b.sub, { ukuran: 9, warna: ABU }), { rata: "center", spasiSetelah: 200 }) : "");
    if (b.t === "h") return para(run(b.teks, { tebal: true, ukuran: 12.5, warna: AKSEN }), { spasiSebelum: 200, spasiSetelah: 80 });
    if (b.t === "li") return para(run(b.label || "•") + "<w:r><w:tab/></w:r>" + run(b.teks, { tebal: b.tebal }), { inden: 360, gantung: 360, spasiSetelah: 60 });
    if (b.t === "tabel") return b.kolom?.length ? tabelDocx(b.kolom, b.baris || []) : "";
    return para(run(b.teks, { tebal: b.tebal, miring: b.miring, ukuran: b.kecil ? 9 : undefined, warna: b.kecil ? ABU : undefined }));
  }).join("");

  const dokumen = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"`
    + ` xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>${kop}${isi}`
    + `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const gaya = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">`
    + `<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="id-ID"/></w:rPr></w:rPrDefault>`
    + `<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>`
    + `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`;
  const tipe = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
    + `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>`
    + (logo ? `<Default Extension="${logo.ext}" ContentType="image/${logo.ext}"/>` : "")
    + `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>`
    + `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>`
    + `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`;
  const relAkar = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>`
    + `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`;
  const relDok = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + `<Relationship Id="rIdGaya" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`
    + (logo ? `<Relationship Id="rIdLogo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/logo.${logo.ext}"/>` : "")
    + `</Relationships>`;
  const judul = blok.find((b) => b.t === "judul")?.teks || "Dokumen";
  const inti = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"`
    + ` xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">`
    + `<dc:title>${x(judul)}</dc:title><dc:creator>${x(sek?.nama_sekolah || "SAPrapor")}</dc:creator>`
    + `<dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().replace(/\.\d+Z$/, "Z")}</dcterms:created></cp:coreProperties>`;

  const enc = new TextEncoder();
  const berkas = [
    { nama: "[Content_Types].xml", isi: enc.encode(tipe) },
    { nama: "_rels/.rels", isi: enc.encode(relAkar) },
    { nama: "docProps/core.xml", isi: enc.encode(inti) },
    { nama: "word/document.xml", isi: enc.encode(dokumen) },
    { nama: "word/styles.xml", isi: enc.encode(gaya) },
    { nama: "word/_rels/document.xml.rels", isi: enc.encode(relDok) },
    ...(logo ? [{ nama: `word/media/logo.${logo.ext}`, isi: logo.isi }] : []),
  ];
  return new Blob([buatZip(berkas)], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}

export function unduhDocx(namaBerkas, blok, sek) {
  unduhBlob(docxDariBlok(blok, sek), `${namaBerkasAman(namaBerkas)}.docx`);
}

// ===================== PDF =====================
/** Susun PDF (jsPDF) dari blok: kop & judul di tiap halaman, kaki halaman bernomor. */
export function pdfDariBlok(blok, sek) {
  const doc = new jsPDF("portrait", "mm", "a4");
  const judulBlok = blok.find((b) => b.t === "judul");
  const judul = judulBlok?.teks || "Dokumen";
  const sub = judulBlok?.sub;
  kopPdf(doc, sek, { judul, sub });
  const pw = doc.internal.pageSize.getWidth(), ph = doc.internal.pageSize.getHeight();
  const m = 14, lebar = pw - 2 * m, batas = ph - BAWAH_ISI - 4;
  let y = ATAS_ISI;
  const ruang = (h) => { if (y + h > batas) { doc.addPage(); y = ATAS_ISI; } };
  const tulis = (teks, { ukuran = 10, tebal = false, miring = false, warna = [17, 24, 39], inden = 0, label = null, setelah = 1.6 } = {}) => {
    doc.setFont("helvetica", tebal && miring ? "bolditalic" : tebal ? "bold" : miring ? "italic" : "normal").setFontSize(ukuran).setTextColor(...warna);
    const tinggi = ukuran * 0.42;
    const baris = doc.splitTextToSize(teksPdf(teks), lebar - inden);
    baris.forEach((b, i) => {
      ruang(tinggi);
      if (label && i === 0) doc.text(teksPdf(label), m + inden - 4.5, y + tinggi * 0.8);
      doc.text(b, m + inden, y + tinggi * 0.8);
      y += tinggi;
    });
    y += setelah;
  };
  for (const b of blok) {
    if (b.t === "judul") continue; // sudah di kop tiap halaman
    if (b.t === "h") { ruang(12); y += 2; tulis(b.teks, { ukuran: 12, tebal: true, warna: [30, 58, 138], setelah: 1.2 }); continue; }
    if (b.t === "li") { tulis(b.teks, { inden: 5, label: b.label && b.label !== "•" ? b.label : "-", tebal: b.tebal, setelah: 0.8 }); continue; }
    if (b.t === "tabel") {
      if (!b.kolom?.length) continue;
      autoTable(doc, { ...gayaTabelResmi, startY: y, head: [b.kolom.map(teksPdf)], body: (b.baris || []).map((r) => b.kolom.map((_, i) => teksPdf(r[i] ?? ""))),
        styles: { ...gayaTabelResmi.styles, fontSize: 8.5, valign: "top" }, headStyles: { ...gayaTabelResmi.headStyles, halign: "left" } });
      y = doc.lastAutoTable.finalY + 4;
      continue;
    }
    tulis(b.teks, { tebal: b.tebal, miring: b.miring, ukuran: b.kecil ? 8.5 : 10, warna: b.kecil ? [91, 100, 117] : undefined });
  }
  selesaikanPdf(doc, sek, { judul, sub });
  return doc;
}

export function unduhPdf(namaBerkas, blok, sek) {
  pdfDariBlok(blok, sek).save(`${namaBerkasAman(namaBerkas)}.pdf`);
}
