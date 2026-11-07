// Cetak paket soal di jendela baru (Simpan sebagai PDF lewat dialog cetak browser):
// naskah siswa, lembar jawaban, serta kunci & rubrik untuk guru.
import { HURUF, labelBentuk } from "./konstanta";
import { srcGambar, srcSvg } from "./PratinjauSoal";

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const teks = (v) => esc(v).replace(/\n/g, "<br>");

// Acak tetap (sama setiap cetak) berdasarkan id butir, agar naskah dan kunci selalu cocok
function acakTetap(arr, benih) {
  let s = Number(benih) * 9301 + 49297;
  const acak = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const hasil = arr.map((v, i) => ({ v, i }));
  for (let i = hasil.length - 1; i > 0; i--) {
    const j = Math.floor(acak() * (i + 1));
    [hasil[i], hasil[j]] = [hasil[j], hasil[i]];
  }
  return hasil;
}

const gambar = (soal) => {
  const src = soal.gambar_svg ? srcSvg(soal.gambar_svg) : soal.gambar_url ? srcGambar(soal.gambar_url) : null;
  return src ? `<div class="gb"><img src="${esc(src)}" alt=""></div>` : "";
};

function isiNaskah(b, kunci) {
  const s = b.soal, isi = s.isi || {}, k = s.kunci || {};
  const ok = (cond) => (kunci && cond ? ' class="ok"' : "");
  switch (s.bentuk) {
    case "PG":
      return `<ol class="pil">${(isi.pilihan || []).map((p, i) => `<li${ok(k.jawaban === i)}>${HURUF[i]}. ${esc(p)}</li>`).join("")}</ol>`;
    case "PG_KOMPLEKS":
      return `<div class="ket">Pilih semua jawaban yang benar.</div><ol class="pil">${(isi.pilihan || []).map((p, i) => `<li${ok((k.jawaban || []).includes(i))}>☐ ${HURUF[i]}. ${esc(p)}</li>`).join("")}</ol>`;
    case "BENAR_SALAH":
      return `<table class="t"><tr><th>Pernyataan</th><th>B</th><th>S</th></tr>${(isi.pernyataan || []).map((p, i) =>
        `<tr><td>${esc(p)}</td><td class="c">${kunci && k.jawaban?.[i] ? "✔" : "☐"}</td><td class="c">${kunci && k.jawaban?.[i] === false ? "✔" : "☐"}</td></tr>`).join("")}</table>`;
    case "ISIAN":
      return kunci ? `<div class="ok">Kunci: ${esc((k.jawaban || []).join(" / "))}</div>` : `<div class="garis">Jawab: ..................................................</div>`;
    case "URAIAN":
      return kunci
        ? `${k.jawaban ? `<div><b>Contoh jawaban:</b> ${teks(k.jawaban)}</div>` : ""}${s.rubrik ? `<div><b>Rubrik:</b> ${teks(s.rubrik)}</div>` : ""}`
        : `<div class="kotak-uraian"></div>`;
    case "MENJODOHKAN": {
      const kanan = acakTetap(isi.pasangan || [], b.id);
      if (kunci) return `<div class="ok">Kunci: ${(isi.pasangan || []).map((_, i) => `${i + 1}–${HURUF[kanan.findIndex((x) => x.i === i)]}`).join(", ")}</div>`;
      return `<div class="ket">Pasangkan nomor di kiri dengan huruf di kanan.</div><table class="jodoh">${(isi.pasangan || []).map((p, i) =>
        `<tr><td>${i + 1}. ${esc(p.kiri)}</td><td class="isi">( ..... )</td><td>${HURUF[i]}. ${esc(kanan[i].v.kanan)}</td></tr>`).join("")}</table>`;
    }
    case "MENGURUTKAN": {
      const acak = acakTetap(isi.urutan || [], b.id);
      if (kunci) return `<div class="ok">Urutan benar: ${(isi.urutan || []).map((_, i) => HURUF[acak.findIndex((x) => x.i === i)]).join(" → ")}</div>`;
      return `<div class="ket">Tulis urutan yang benar dengan huruf.</div><ol class="pil">${acak.map((x, i) => `<li>${HURUF[i]}. ${esc(x.v)}</li>`).join("")}</ol><div class="garis">Urutan: ........ → ........ → ........ → ........</div>`;
    }
    case "LENGKAPI_GAMBAR": {
      const bagian = k.jawaban || [];
      const bank = (isi.bank_kata || []).filter(Boolean);
      if (kunci) return `<div class="ok">Kunci: ${bagian.map((j, i) => `${i + 1}. ${esc(Array.isArray(j) ? j.join(" / ") : j)}`).join("; ")}</div>`;
      return `${bank.length ? `<div class="bank">Pilih dari: ${acakTetap(bank, b.id).map((x) => esc(x.v)).join(" · ")}</div>` : ""}
        <div class="ket">Lengkapi bagian bernomor pada gambar.</div>${bagian.map((_, i) => `<div class="garis">${i + 1}. ........................................</div>`).join("")}`;
    }
    default: return "";
  }
}

function lembarJawaban(butir) {
  const baris = butir.map((b, n) => {
    const s = b.soal, isi = s.isi || {};
    let isian;
    switch (s.bentuk) {
      case "PG": isian = (isi.pilihan || []).map((_, i) => `<span class="bulat">${HURUF[i]}</span>`).join(""); break;
      case "PG_KOMPLEKS": isian = (isi.pilihan || []).map((_, i) => `<span class="kotak">${HURUF[i]}</span>`).join(""); break;
      case "BENAR_SALAH": isian = (isi.pernyataan || []).map((_, i) => `<span class="bs">${i + 1}. <span class="bulat">B</span><span class="bulat">S</span></span>`).join(""); break;
      case "MENJODOHKAN": isian = (isi.pasangan || []).map((_, i) => `<span class="bs">${i + 1}–<span class="titik"></span></span>`).join(""); break;
      case "MENGURUTKAN": isian = (isi.urutan || []).map(() => `<span class="kotak">&nbsp;</span>`).join(" → "); break;
      case "URAIAN": isian = `<div class="kotak-uraian kecil"></div>`; break;
      case "LENGKAPI_GAMBAR": isian = (s.kunci?.jawaban || []).map((_, i) => `<span class="bs">${i + 1}. <span class="titik panjang-kecil"></span></span>`).join(""); break;
      default: isian = `<span class="panjang"></span>`;
    }
    return `<tr><td class="no">${n + 1}</td><td>${isian}</td></tr>`;
  }).join("");
  return `<table class="lj">${baris}</table>`;
}

const GAYA = `
  @page { size: A4; margin: 15mm 14mm; }
  body { font-family: "Times New Roman", serif; font-size: 12pt; color: #000; margin: 0; }
  .kop { text-align: center; border-bottom: 2px solid #000; padding-bottom: 6px; margin-bottom: 8px; }
  .kop h1 { font-size: 14pt; margin: 0; } .kop h2 { font-size: 13pt; margin: 2px 0 0; }
  .meta { width: 100%; font-size: 11pt; margin-bottom: 8px; } .meta td { padding: 1px 4px; }
  .petunjuk { border: 1px solid #000; padding: 6px 8px; font-size: 11pt; margin-bottom: 10px; }
  .butir { break-inside: avoid; margin-bottom: 12px; display: flex; gap: 6px; }
  .butir .n { min-width: 22px; font-weight: bold; } .butir .q { flex: 1; }
  .pil { list-style: none; padding-left: 4px; margin: 4px 0; } .pil li { margin: 2px 0; }
  .t, .jodoh { border-collapse: collapse; margin: 4px 0; } .t td, .t th { border: 1px solid #000; padding: 2px 6px; } .c { text-align: center; }
  .jodoh td { padding: 2px 8px; } .jodoh .isi { white-space: nowrap; }
  .gb img { max-width: 70mm; max-height: 55mm; margin: 4px 0; }
  .ket { font-style: italic; font-size: 10.5pt; } .garis { margin-top: 6px; }
  .kotak-uraian { border: 1px solid #000; height: 38mm; margin-top: 4px; } .kotak-uraian.kecil { height: 26mm; }
  .ok { color: #0a6b2c; font-weight: bold; } li.ok { text-decoration: underline; }
  .info { font-size: 9.5pt; color: #444; margin-top: 2px; }
  .lj { width: 100%; border-collapse: collapse; } .lj td { border: 1px solid #000; padding: 5px 6px; vertical-align: middle; }
  .lj .no { width: 28px; text-align: center; font-weight: bold; }
  .bulat, .kotak { display: inline-block; width: 20px; height: 20px; line-height: 20px; text-align: center; border: 1.2px solid #000; margin-right: 8px; font-size: 10pt; }
  .bulat { border-radius: 50%; } .bs { display: inline-block; margin-right: 14px; } .titik { display: inline-block; width: 26px; border-bottom: 1px dotted #000; }
  .panjang { display: inline-block; width: 90%; border-bottom: 1px dotted #000; height: 16px; }
  .catatan { font-size: 9.5pt; margin-top: 6px; }
  .bank { border: 1px dashed #000; padding: 3px 6px; margin: 4px 0; font-size: 11pt; }
  .titik.panjang-kecil { width: 110px; }
  .halaman-baru { break-before: page; }
`;

function kop(paket, sub) {
  const sekolah = paket.sekolah?.nama_sekolah || "";
  return `<div class="kop"><h1>${esc(sekolah)}</h1><h2>${esc(paket.judul)}${sub ? ` — ${esc(sub)}` : ""}</h2></div>
    <table class="meta"><tr><td>Mata pelajaran: <b>${esc(paket.mapel?.nama_mapel)}</b></td><td>Kelas: <b>${esc(paket.kelas?.nama_kelas || "")}</b></td>
    <td>${paket.tanggal ? `Tanggal: ${esc(new Date(paket.tanggal + "T00:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }))}` : ""}</td>
    <td>${paket.durasi_menit ? `Waktu: ${paket.durasi_menit} menit` : ""}</td></tr>
    <tr><td colspan="2">Nama: ........................................................</td><td colspan="2">No. absen: ..........</td></tr></table>`;
}

/** Buka jendela cetak. jenis: "naskah" | "lembar" | "kunci" | "lengkap" (naskah + lembar jawaban). */
export function cetakPaket(paket, jenis) {
  const butir = paket.butir || [];
  const naskah = () => `${kop(paket)}${paket.petunjuk ? `<div class="petunjuk"><b>Petunjuk:</b> ${teks(paket.petunjuk)}</div>` : ""}
    ${butir.map((b, n) => `<div class="butir"><div class="n">${n + 1}.</div><div class="q">${teks(b.soal.pertanyaan)}${gambar(b.soal)}${isiNaskah(b, false)}</div></div>`).join("")}`;
  const lembar = () => `${kop(paket, "Lembar Jawaban")}${lembarJawaban(butir)}
    <div class="catatan">Hitamkan atau silang pilihanmu dengan jelas. Lembar ini bisa difoto guru untuk dikoreksi.</div>`;
  const kunci = () => `<div class="kop"><h1>${esc(paket.sekolah?.nama_sekolah || "")}</h1><h2>${esc(paket.judul)} — Kunci &amp; Rubrik (untuk guru)</h2></div>
    ${butir.map((b, n) => `<div class="butir"><div class="n">${n + 1}.</div><div class="q">${teks(b.soal.pertanyaan)}${gambar(b.soal)}${isiNaskah(b, true)}
      ${b.soal.pembahasan ? `<div><i>Pembahasan:</i> ${teks(b.soal.pembahasan)}</div>` : ""}
      <div class="info">${esc(labelBentuk(b.soal.bentuk))} · ${esc(b.soal.level_kognitif || "")} · skor maks. ${b.skor_maks}${b.soal.indikator?.deskripsi ? ` · TP: ${esc(b.soal.indikator.deskripsi)}` : ""}
      · STNKM ${["S", "T", "N", "K", "M"].filter((d) => Number(b.soal[`dim_${d}`]) > 0).map((d) => `${d} ${Number(b.soal[`dim_${d}`]).toFixed(1)}`).join(" ")}</div></div></div>`).join("")}`;

  const isi = { naskah: naskah(), lembar: lembar(), kunci: kunci(), lengkap: `${naskah()}<div class="halaman-baru"></div>${lembar()}` }[jenis];
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(`<!doctype html><html lang="id"><head><meta charset="utf-8"><title>${esc(paket.judul)}</title><style>${GAYA}</style></head><body>${isi}
    <script>window.onload=()=>{const t=[...document.images].map(i=>i.complete?Promise.resolve():new Promise(r=>{i.onload=i.onerror=r}));Promise.all(t).then(()=>window.print())}</script></body></html>`);
  w.document.close();
  return true;
}
