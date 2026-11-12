// Cetak ATP (jendela cetak / simpan PDF): kop sekolah resmi, tabel alur TP, tanda tangan kepala sekolah & guru, kaki halaman bernomor.
import { esc, gayaHalamanMengalir, judulHtml, kopHtml, muatSekolah, siapkanJendela, ttdHtml, tulisJendela } from "@/app/lib/dokumenResmi";

const GAYA = `
  body { font-size: 10.5pt; }
  .meta td { padding: 1px 10px 1px 0; }
  table.atp { width: 100%; border-collapse: collapse; margin-top: 8px; }
  .atp th, .atp td { border: 1px solid #000; padding: 4px 5px; vertical-align: top; } .atp th { background: var(--aksen); color: #fff; } .atp tbody tr:nth-child(even) td { background: #f6f8fc; }
  .c { text-align: center; } .kecil { font-size: 9.5pt; color: #333; }
`;

export async function cetakAtp(atp, sekolah) {
  const w = siapkanJendela();
  if (!w) return false;
  const sek = await muatSekolah(sekolah);
  const baris = atp.baris || [];
  const tabel = baris.map((b, i) => `<tr>
    <td class="c">${i + 1}</td>
    <td>${esc(b.cp?.elemen || "")}</td>
    <td>${esc(b.materi?.nama_materi || b.materi_usulan || "")}</td>
    <td>${esc(b.indikator?.deskripsi || b.tp_usulan || "")}${b.catatan ? `<div class="kecil">${esc(b.catatan)}</div>` : ""}</td>
    <td class="c">${b.alokasi_jp ?? ""}</td><td class="c">${esc(b.minggu || "")}</td>
    <td class="c">${esc(b.dimensi || "")}</td><td>${esc((b.profil_lulusan || []).join(", "))}</td></tr>`).join("");
  const html = `${kopHtml(sek)}${judulHtml("Alur Tujuan Pembelajaran (ATP)", atp.judul)}
    <table class="meta"><tr><td>Mata pelajaran: <b>${esc(atp.mapel?.nama_mapel)}</b></td><td>Kelas/Fase: <b>${esc(atp.kelas?.nama_kelas || "-")}${atp.fase ? ` / ${atp.fase}` : ""}</b></td>
      <td>Periode: <b>${esc(atp.periode ? `${atp.periode.tahun_ajaran} ${atp.periode.semester}` : "-")}</b></td>
      <td>Alokasi: <b>${atp.total_jp || 0} JP</b>${atp.jp_per_minggu && atp.minggu_efektif ? ` dari ${atp.jp_per_minggu * atp.minggu_efektif} JP (${atp.jp_per_minggu} JP × ${atp.minggu_efektif} minggu)` : ""}</td></tr></table>
    <table class="atp"><thead><tr><th>No</th><th>Elemen CP</th><th>Materi</th><th>Tujuan Pembelajaran</th><th>JP</th><th>Minggu</th><th>STNKM</th><th>Profil Lulusan</th></tr></thead><tbody>${tabel}</tbody></table>
    ${ttdHtml(sek, { tanggal: atp.disetujui_pada || new Date(), kanan: { jabatan: "Guru Mata Pelajaran", nama: atp.pembuat?.name } })}
    ${atp.status !== "DISETUJUI" ? `<p class="kecil">Status: ${esc(atp.status)} (belum disetujui kepala sekolah)</p>` : ""}`;
  return tulisJendela(w, atp.judul, `${gayaHalamanMengalir(sek, "Alur Tujuan Pembelajaran", { ukuran: "A4 landscape", margin: "14mm 14mm 16mm" })}${GAYA}`, html);
}
