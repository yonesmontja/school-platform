// Cetak ATP (jendela cetak / simpan PDF): kop sekolah, tabel alur TP, dan tanda tangan guru & kepala sekolah.
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const GAYA = `
  @page { size: A4 landscape; margin: 14mm; }
  body { font-family: "Times New Roman", serif; font-size: 11pt; color: #000; margin: 0; }
  .kop { text-align: center; border-bottom: 2px solid #000; padding-bottom: 6px; margin-bottom: 8px; }
  .kop h1 { font-size: 14pt; margin: 0; } .kop h2 { font-size: 13pt; margin: 2px 0 0; }
  .meta td { padding: 1px 10px 1px 0; }
  table.atp { width: 100%; border-collapse: collapse; margin-top: 8px; }
  .atp th, .atp td { border: 1px solid #000; padding: 4px 5px; vertical-align: top; } .atp th { background: #eee; }
  .c { text-align: center; } .kecil { font-size: 9.5pt; color: #333; }
  .ttd { width: 100%; margin-top: 18px; } .ttd td { width: 50%; text-align: center; vertical-align: top; } .ttd .ruang { height: 60px; }
`;

export function cetakAtp(atp, sekolah) {
  const baris = atp.baris || [];
  const tabel = baris.map((b, i) => `<tr>
    <td class="c">${i + 1}</td>
    <td>${esc(b.cp?.elemen || "")}</td>
    <td>${esc(b.materi?.nama_materi || b.materi_usulan || "")}</td>
    <td>${esc(b.indikator?.deskripsi || b.tp_usulan || "")}${b.catatan ? `<div class="kecil">${esc(b.catatan)}</div>` : ""}</td>
    <td class="c">${b.alokasi_jp ?? ""}</td><td class="c">${esc(b.minggu || "")}</td>
    <td class="c">${esc(b.dimensi || "")}</td><td>${esc((b.profil_lulusan || []).join(", "))}</td></tr>`).join("");
  const tanggal = new Date(atp.disetujui_pada || Date.now()).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
  const html = `<div class="kop"><h1>${esc(sekolah?.nama_sekolah || "")}</h1><h2>ALUR TUJUAN PEMBELAJARAN (ATP)</h2></div>
    <table class="meta"><tr><td>Mata pelajaran: <b>${esc(atp.mapel?.nama_mapel)}</b></td><td>Kelas/Fase: <b>${esc(atp.kelas?.nama_kelas || "-")}${atp.fase ? ` / ${atp.fase}` : ""}</b></td>
      <td>Periode: <b>${esc(atp.periode ? `${atp.periode.tahun_ajaran} ${atp.periode.semester}` : "-")}</b></td>
      <td>Alokasi: <b>${atp.total_jp || 0} JP</b>${atp.jp_per_minggu && atp.minggu_efektif ? ` dari ${atp.jp_per_minggu * atp.minggu_efektif} JP (${atp.jp_per_minggu} JP × ${atp.minggu_efektif} minggu)` : ""}</td></tr></table>
    <table class="atp"><thead><tr><th>No</th><th>Elemen CP</th><th>Materi</th><th>Tujuan Pembelajaran</th><th>JP</th><th>Minggu</th><th>STNKM</th><th>Profil Lulusan</th></tr></thead><tbody>${tabel}</tbody></table>
    <table class="ttd"><tr><td>Mengetahui,<br>Kepala Sekolah<div class="ruang"></div><b>${esc(sekolah?.nama_kepsek || "....................")}</b>${sekolah?.nip_kepsek ? `<br>NIP ${esc(sekolah.nip_kepsek)}` : ""}</td>
      <td>${esc(sekolah?.kota || "")}${sekolah?.kota ? ", " : ""}${tanggal}<br>Guru Mata Pelajaran<div class="ruang"></div><b>${esc(atp.pembuat?.name || "....................")}</b></td></tr></table>
    ${atp.status !== "DISETUJUI" ? `<p class="kecil">Status: ${esc(atp.status)} (belum disetujui kepala sekolah)</p>` : ""}`;
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(`<!doctype html><html lang="id"><head><meta charset="utf-8"><title>${esc(atp.judul)}</title><style>${GAYA}</style></head><body>${html}<script>window.onload=()=>window.print()</script></body></html>`);
  w.document.close();
  return true;
}
