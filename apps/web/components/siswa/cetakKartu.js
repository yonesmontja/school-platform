// Cetak kartu berfoto & ber-QR ukuran KTP (85,6 × 54 mm), 10 kartu per lembar A4, dengan garis potong.
// Dipakai kartu pelajar (QR → halaman publik verifikasi) dan kartu peserta ujian (QR → halaman masuk dengan NISN terisi).
import Swal from "sweetalert2";
import QRCode from "qrcode";
import { minta } from "@/components/banksoal/api";
import { esc, muatSekolah, siapkanJendela, tulisJendela } from "@/app/lib/dokumenResmi";
import { srcFoto } from "@/components/siswa/fotoSiswa";

const qrSvg = (teks) => QRCode.toString(teks, { type: "svg", margin: 0, errorCorrectionLevel: "M" });
const inisial = (nama) => String(nama || "S").split(/\s+/).filter(Boolean).slice(0, 2).map((k) => k[0]).join("").toUpperCase();

const GAYA_KARTU = `
  @page { size: A4; margin: 8mm 12mm; }
  body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .lembar-kartu { display: grid; grid-template-columns: repeat(2, 85.6mm); gap: 2.5mm 4mm; justify-content: center; }
  .kartu-id { width: 85.6mm; height: 54mm; box-sizing: border-box; border: .2mm dashed #94a3b8; border-radius: 3mm; overflow: hidden;
    position: relative; break-inside: avoid; font-family: "Segoe UI", Arial, sans-serif; background: #fff; color: #0f172a; }
  .kartu-id .pita { background: linear-gradient(90deg, #1e3a8a, #2563eb); color: #fff; display: flex; align-items: center; gap: 2mm; padding: 1.6mm 3mm; height: 11mm; box-sizing: border-box; }
  .kartu-id.ujian .pita { background: linear-gradient(90deg, #7c2d12, #ea580c); }
  .kartu-id .pita img { height: 7.5mm; width: 7.5mm; object-fit: contain; background: #fff; border-radius: 1.2mm; padding: .4mm; }
  .kartu-id .pita .lambang { height: 7.5mm; width: 7.5mm; border-radius: 1.2mm; background: #fff; color: #1e3a8a; font-weight: 800; font-size: 8pt; display: flex; align-items: center; justify-content: center; }
  .kartu-id .pita .sek { font-size: 7.4pt; font-weight: 700; line-height: 1.1; }
  .kartu-id .pita .jenis { font-size: 6pt; letter-spacing: .12em; opacity: .9; }
  .kartu-id .badan { display: flex; gap: 2.6mm; padding: 2.2mm 3mm 0; }
  .kartu-id .foto { width: 21mm; height: 28mm; flex: none; border-radius: 1.5mm; overflow: hidden; background: #e2e8f0; display: flex; align-items: center; justify-content: center; border: .2mm solid #cbd5e1; }
  .kartu-id .foto img { width: 100%; height: 100%; object-fit: cover; }
  .kartu-id .foto span { font-size: 14pt; font-weight: 700; color: #64748b; }
  .kartu-id .data { flex: 1; min-width: 0; font-size: 6.6pt; line-height: 1.35; }
  .kartu-id .nama { font-size: 9pt; font-weight: 800; line-height: 1.15; margin-bottom: 1mm; }
  .kartu-id .data table { border-collapse: collapse; width: 100%; }
  .kartu-id .data td { padding: 0 1mm 0 0; vertical-align: top; border: 0; }
  .kartu-id .data td:first-child { color: #64748b; width: 13mm; white-space: nowrap; }
  .kartu-id .mono { font-family: Consolas, monospace; font-weight: 700; font-size: 7.4pt; }
  .kartu-id .qr { position: absolute; right: 3mm; bottom: 2.6mm; width: 15mm; text-align: center; }
  .kartu-id .qr svg { width: 15mm; height: 15mm; display: block; }
  .kartu-id .qr div { font-size: 4.6pt; color: #64748b; margin-top: .4mm; }
  .kartu-id .kaki { position: absolute; left: 3mm; bottom: 2mm; font-size: 5.4pt; color: #64748b; max-width: 60mm; }
  .kartu-id .no { position: absolute; right: 3mm; top: 12.4mm; font-size: 6pt; color: #94a3b8; }
`;

function pitaHtml(sek, jenis) {
  const lambang = sek?.logoDataUrl ? `<img src="${sek.logoDataUrl}" alt="">` : `<span class="lambang">${esc(inisial(sek?.nama_sekolah))}</span>`;
  return `<div class="pita">${lambang}<div><div class="sek">${esc(sek?.nama_sekolah || "Nama Sekolah")}</div><div class="jenis">${esc(jenis)}</div></div></div>`;
}
const fotoHtml = (s) => {
  const src = srcFoto(s.foto_url);
  return `<div class="foto">${src ? `<img src="${esc(src)}" alt="">` : `<span>${esc(inisial(s.nama_siswa))}</span>`}</div>`;
};

function bukaCetak(w, judul, kartu) {
  if (!tulisJendela(w, judul, GAYA_KARTU, `<div class="lembar-kartu">${kartu.join("")}</div>`)) {
    Swal.fire("Jendela cetak diblokir", "Izinkan pop-up untuk situs ini, lalu coba lagi.", "info");
  }
}

/** Kartu pelajar untuk satu kelas ({ id_kelas }) atau siswa tertentu ({ id_siswa: [...] }). */
export async function cetakKartuPelajar(saring = {}) {
  const w = siapkanJendela();
  try {
    const q = new URLSearchParams();
    if (saring.id_kelas) q.set("id_kelas", saring.id_kelas);
    (saring.id_siswa || []).forEach((id) => q.append("id_siswa[]", id));
    const [r, sek] = await Promise.all([minta("GET", `/kartu-pelajar?${q}`), muatSekolah(null)]);
    const kartu = await Promise.all(r.data.map(async (s) => {
      const qr = await qrSvg(`${window.location.origin}/verifikasi/siswa/${s.kode}`);
      return `<div class="kartu-id" data-kartu-pelajar>${pitaHtml(sek, "KARTU PELAJAR")}
        <div class="badan">${fotoHtml(s)}<div class="data"><div class="nama">${esc(s.nama_siswa)}</div><table>
          <tr><td>NISN</td><td class="mono">${esc(s.nisn || "-")}</td></tr>
          <tr><td>Kelas</td><td>${esc(s.kelas || "-")}</td></tr>
          ${s.ttl ? `<tr><td>TTL</td><td>${esc(s.ttl)}</td></tr>` : ""}
          ${s.jenis_kelamin ? `<tr><td>L/P</td><td>${esc(s.jenis_kelamin)}</td></tr>` : ""}
        </table></div></div>
        <div class="kaki">${r.tahun_ajaran ? `Tahun ajaran ${esc(r.tahun_ajaran)} · ` : ""}${esc(sek?.kota || "")}</div>
        <div class="qr">${qr}<div>Pindai untuk cek</div></div></div>`;
    }));
    bukaCetak(w, r.data.length === 1 ? `Kartu Pelajar - ${r.data[0].nama_siswa}` : `Kartu Pelajar (${r.data.length} siswa)`, kartu);
  } catch (e) { w?.close(); Swal.fire("Belum bisa mencetak", e.message, "warning"); }
}

/** Kartu peserta satu sesi ujian (/sesi-ujian/{id}/kartu): foto, NISN untuk masuk, waktu & ruang, QR ke halaman masuk. */
export async function cetakKartuUjian(idSesi, { waktu, jam }) {
  const w = siapkanJendela();
  try {
    const [r, sek] = await Promise.all([minta("GET", `/sesi-ujian/${idSesi}/kartu`), muatSekolah(null)]);
    const s = r.sesi;
    const kartu = await Promise.all(r.peserta.map(async (p) => {
      const qr = await qrSvg(`${window.location.origin}/login?peran=siswa${p.username ? `&u=${encodeURIComponent(p.username)}` : ""}`);
      return `<div class="kartu-id ujian" data-kartu-ujian>${pitaHtml(sek, "KARTU PESERTA UJIAN")}
        <div class="no">No. ${p.no}</div>
        <div class="badan">${fotoHtml(p)}<div class="data"><div class="nama">${esc(p.nama_siswa)}</div><table>
          <tr><td>Kelas</td><td>${esc(p.kelas || "-")}</td></tr>
          <tr><td>Masuk</td><td class="mono">${esc(p.username || "(belum punya akun)")}</td></tr>
          <tr><td>Ujian</td><td>${esc(s.nama)}${s.mapel ? ` · ${esc(s.mapel)}` : ""}</td></tr>
          <tr><td>Waktu</td><td>${esc(waktu(s.mulai))} – ${esc(jam(s.selesai))}</td></tr>
          <tr><td>Ruang</td><td>${esc(s.ruang || "-")}</td></tr>
        </table></div></div>
        <div class="kaki">Kata sandi: sandi akun siswa · token dari pengawas</div>
        <div class="qr">${qr}<div>Pindai untuk masuk</div></div></div>`;
    }));
    bukaCetak(w, `Kartu Peserta - ${s.nama}`, kartu);
  } catch (e) { w?.close(); Swal.fire("Belum bisa mencetak", e.message, "warning"); }
}
