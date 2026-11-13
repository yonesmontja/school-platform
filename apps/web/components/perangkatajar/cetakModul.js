// Cetak modul ajar RPM (jendela cetak / simpan PDF) dan unduh sebagai dokumen Word (.doc dari HTML).
import { BAGIAN_RPM, LANGKAH_RPM } from "./rpm";
import { esc, gayaHalamanMengalir, judulHtml, kopHtml, kopWordHtml, muatSekolah, siapkanJendela, ttdHtml, tulisJendela, unduhWordResmi } from "@/app/lib/dokumenResmi";
const teks = (v) => esc(v).replace(/\n/g, "<br>");

const GAYA = `
  body { font-size: 11pt; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  td, th { border: 1px solid #9aa5bb; padding: 4px 6px; vertical-align: top; text-align: left; }
  th { background: var(--aksen); color: #fff; } td.l { background: #f6f8fc; } td.l { width: 30%; font-weight: bold; }
  h3 { font-size: 12.5pt; margin: 12px 0 4px; } .meta td { border: none; padding: 1px 8px 1px 0; }
  .baru { page-break-before: always; }
`;

function isiHtml(m, sekolah, word = false) {
  const kop = word ? kopWordHtml : kopHtml;
  const isi = m.isi || {};
  const meta = `<table class="meta"><tr><td>Mata pelajaran: <b>${esc(m.mapel?.nama_mapel)}</b></td><td>Kelas/Fase: <b>${esc(m.kelas?.nama_kelas || "-")}${m.fase ? ` / ${m.fase}` : ""}</b></td></tr>
    <tr><td>Materi: <b>${esc(m.materi?.nama_materi || "")}</b></td><td>Alokasi waktu: <b>${m.jumlah_pertemuan} pertemuan${m.jp_per_pertemuan ? ` × ${m.jp_per_pertemuan} JP` : ""}</b></td></tr>
    <tr><td colspan="2">Penyusun: <b>${esc(m.pembuat?.name || "")}</b> · ${esc(m.periode ? `${m.periode.tahun_ajaran} ${m.periode.semester}` : "")}</td></tr></table>`;
  const bagian = (b) => `<h3>${esc(b.judul)}</h3><table>${b.isian.map((x) => `<tr><td class="l">${esc(x.label)}</td><td>${teks(isi[b.kunci]?.[x.k])}</td></tr>`).join("")}
    ${b.kunci === "identifikasi" ? `<tr><td class="l">Dimensi profil lulusan</td><td>${esc((isi.identifikasi?.profil_lulusan || []).join(", "))}</td></tr>` : ""}</table>`;
  const tp = (m.tp_detail || []).map((t) => `<li>${esc(t.deskripsi)}</li>`).join("");
  const pengalaman = (isi.pertemuan || []).map((p) => `<table><tr><th colspan="2">Pertemuan ${p.ke}${p.jp ? ` (${p.jp} JP)` : ""}</th></tr>
    ${LANGKAH_RPM.map((l) => `<tr><td class="l">${esc(l.label)}</td><td>${teks(p[l.k])}</td></tr>`).join("")}</table>`).join("");
  return `${kop(sekolah)}${judulHtml("Perencanaan Pembelajaran Mendalam", m.judul)}${meta}
    ${tp ? `<h3>Tujuan pembelajaran yang dicakup</h3><ol>${tp}</ol>` : ""}
    ${bagian(BAGIAN_RPM[0])}${bagian(BAGIAN_RPM[1])}
    <h3>C. Pengalaman Belajar</h3>${pengalaman}
    ${bagian(BAGIAN_RPM[2])}${m.paket ? `<p>Paket soal asesmen akhir: <b>${esc(m.paket.judul)}</b></p>` : ""}
    ${isi.diferensiasi ? `<h3>Diferensiasi</h3><p>${teks(isi.diferensiasi)}</p>` : ""}
    ${ttdHtml(sekolah, { tanggal: m.disetujui_pada || new Date(), kanan: { jabatan: "Guru", nama: m.pembuat?.name }, tabel: word })}
    ${isi.lkpd ? `<div class="baru"></div>${kop(sekolah)}${judulHtml("Lembar Kerja Peserta Didik", m.judul)}<p>Nama: ..................................... Kelas: ........</p><p>${teks(isi.lkpd)}</p>` : ""}`;
}

export async function cetakModul(m, sekolah) {
  const w = siapkanJendela();
  if (!w) return false;
  const sek = await muatSekolah(sekolah);
  return tulisJendela(w, m.judul, `${gayaHalamanMengalir(sek, "Perencanaan Pembelajaran Mendalam", { margin: "16mm 16mm 18mm" })}${GAYA}`, isiHtml(m, sek));
}

/** Unduh sebagai .doc (Word) dengan logo sekolah & tanda tangan tertanam, agar guru bisa menyunting di Word. */
export async function unduhWord(m, sekolah) {
  const sek = await muatSekolah(sekolah);
  const nama = `${m.judul.replace(/[^\w\- ]+/g, "").trim() || "modul-ajar"}.doc`;
  unduhWordResmi(nama, m.judul, GAYA, isiHtml(m, sek, true), sek);
}
