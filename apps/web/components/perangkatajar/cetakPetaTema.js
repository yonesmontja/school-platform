// Peta Tema (spider web PBPM): cetak / simpan PDF berkop resmi, unduh Word (diagram tertanam), dan PNG diagram.
import { bingkaiMengalir, esc, gayaHalamanMengalir, judulHtml, kopWordHtml, muatSekolah, siapkanJendela, ttdHtml, tulisJendela, unduhWordResmi, BERKAS_WORD } from "@/app/lib/dokumenResmi";
import { diagramPeta, svgKePng } from "./jaring";

const HARI = [["senin", "Senin"], ["selasa", "Selasa"], ["rabu", "Rabu"], ["kamis", "Kamis"], ["jumat", "Jumat"], ["sabtu", "Sabtu"]];
const teks = (v) => esc(v).replace(/\n/g, "<br>");
const JUDUL_DOK = "Peta Tema Pembelajaran";

const GAYA = `
  body { font-size: 10.5pt; }
  table.data { width: 100%; border-collapse: collapse; margin: 6px 0 12px; }
  table.data td, table.data th { border: 1px solid #9aa5bb; padding: 4px 6px; vertical-align: top; text-align: left; }
  table.data th { background: #2f5d50; color: #fff; text-align: center; }
  table.data td.l { background: #f6f8fc; font-weight: bold; width: 22%; }
  h3 { font-size: 12pt; margin: 12px 0 4px; }
  .diagram { text-align: center; margin: 4px 0 10px; break-inside: avoid; page-break-inside: avoid; }
  .diagram svg, .diagram img { max-width: 100%; height: auto; max-height: 165mm; }
  .baru { break-before: page; page-break-before: always; }
  .tp { font-size: 9pt; color: #374151; margin: 2px 0 0 14px; }
`;

const identitas = (p, sek) => `<table class="data">
  <tr><td class="l">Nama Sekolah</td><td>${esc(sek?.nama_sekolah || "")}</td></tr>
  <tr><td class="l">Kelas/Semester</td><td>${esc(p.kelas?.nama_kelas || "-")}${p.fase ? ` (Fase ${esc(p.fase)})` : ""}${p.periode ? ` / ${esc(p.periode.semester)} ${esc(p.periode.tahun_ajaran)}` : ""}</td></tr>
  <tr><td class="l">Tema</td><td>${p.jaring?.kategori ? `${esc(p.jaring.kategori)}: ` : ""}${esc(p.judul)}</td></tr>
  ${p.tanggal_mulai ? `<tr><td class="l">Mulai / Lama</td><td>${esc(new Date(`${p.tanggal_mulai}T00:00`).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }))} · ${p.jumlah_minggu} minggu</td></tr>` : ""}
  <tr><td class="l">Pendekatan</td><td>${teks(p.pendekatan)}</td></tr>
  ${p.konteks_lokal ? `<tr><td class="l">Konteks lokal</td><td>${teks(p.konteks_lokal)}</td></tr>` : ""}
</table>`;

const kalibrasi = (p) => (p.jaring?.mapel || []).length ? `<h3>Kalibrasi mata pelajaran</h3><table class="data"><tr><th style="width:22%">Mata pelajaran</th><th>Kalibrasi (isi konkret untuk tema ini)</th></tr>
  ${p.jaring.mapel.map((c) => `<tr><td class="l">${esc(c.nama)}</td><td>${teks(c.kalibrasi)}${(c.tp || []).length ? `<div class="tp">TP: ${c.tp.map((t) => esc(p.tp_detail?.[t] || t)).join("; ")}</div>` : ""}</td></tr>`).join("")}</table>` : "";

const mingguan = (p) => `<h3>Peta mingguan</h3><table class="data"><tr><th style="width:14%">Minggu</th><th>Realita (yang dialami anak)</th><th>Imajinasi (yang dibuat anak)</th><th>Makna</th><th>Produk anak (tanpa peringkat)</th></tr>
  ${(p.minggu || []).map((m) => `<tr><td class="l">Minggu ${m.ke}${m.judul ? `: ${esc(m.judul)}` : ""}</td><td>${teks(m.realita)}</td><td>${teks(m.imajinasi)}</td><td>${teks(m.makna)}</td><td>${teks(m.produk)}</td></tr>`).join("")}</table>`;

const pola = (p) => {
  const hari = HARI.filter(([k]) => k !== "sabtu" || p.pola?.sabtu);
  if (!hari.some(([k]) => p.pola?.[k])) return "";
  return `<h3>Pola mingguan</h3><table class="data"><tr>${hari.map(([, l]) => `<th>${l}</th>`).join("")}</tr><tr>${hari.map(([k]) => `<td>${teks(p.pola?.[k])}</td>`).join("")}</tr></table>`;
};

function isi(p, sek, gambar, word = false) {
  const diagram = (k) => `<div class="diagram">${gambar[k]}</div>`;
  const ttd = ttdHtml(sek, { tanggal: p.disetujui_pada || new Date(), kanan: { jabatan: "Guru Penyusun", nama: p.pembuat?.name }, tabel: word });
  const halaman1 = `${judulHtml(JUDUL_DOK, `${p.judul}${p.kelas ? ` · ${p.kelas.nama_kelas}` : ""}`)}${identitas(p, sek)}${diagram("mapel")}`;
  const sisa = `${diagram("konsep")}${kalibrasi(p)}${mingguan(p)}${pola(p)}${ttd}`;
  return word ? `${kopWordHtml(sek)}${halaman1}<br style="page-break-before:always" clear="all">${sisa}` : `${halaman1}<div class="baru"></div>${sisa}`;
}

/** Cetak / simpan PDF: A4 lanskap, kop resmi diulang tiap halaman. */
export async function cetakPetaTema(p, sekolah) {
  const w = siapkanJendela();
  if (!w) return false;
  const sek = await muatSekolah(sekolah);
  const d = diagramPeta(p);
  return tulisJendela(w, `${JUDUL_DOK} - ${p.judul}`, `${gayaHalamanMengalir(sek, JUDUL_DOK, { ukuran: "A4 landscape", margin: "12mm 14mm 16mm" })}${GAYA}`,
    bingkaiMengalir(sek, isi(p, sek, { mapel: d.mapel.svg, konsep: d.konsep.svg })));
}

const namaBerkas = (p, ext) => `Peta Tema - ${p.judul}`.replace(/[^\w\- ]+/g, "").trim() + `.${ext}`;

/** Word: diagram sebagai gambar PNG tertanam (Word tidak menampilkan SVG dengan andal). */
export async function unduhWordPetaTema(p, sekolah) {
  const [sek, d] = await Promise.all([muatSekolah(sekolah), Promise.resolve(diagramPeta(p))]);
  const [pngMapel, pngKonsep] = await Promise.all([svgKePng(d.mapel, 1.5), svgKePng(d.konsep, 1.5)]);
  const img = (nama, dg) => `<img src="${BERKAS_WORD}${nama}" width="640" height="${Math.round((640 * dg.tinggi) / dg.lebar)}" alt="${nama}">`;
  unduhWordResmi(namaBerkas(p, "doc"), p.judul, `${GAYA}@page { size: 29.7cm 21cm; margin: 1.5cm; }`,
    isi(p, sek, { mapel: img("jaring-mapel", d.mapel), konsep: img("jaring-konsep", d.konsep) }, true), sek,
    [{ nama: "jaring-mapel", dataUrl: pngMapel }, { nama: "jaring-konsep", dataUrl: pngKonsep }]);
}

/** PNG satu diagram ("mapel" atau "konsep"). */
export async function unduhPngPetaTema(p, jenis = "mapel") {
  const url = await svgKePng(diagramPeta(p)[jenis], 2);
  const a = document.createElement("a");
  a.href = url;
  a.download = namaBerkas({ judul: `${p.judul} ${jenis === "mapel" ? "mata pelajaran" : "konsep"}` }, "png");
  document.body.appendChild(a);
  a.click();
  a.remove();
}
