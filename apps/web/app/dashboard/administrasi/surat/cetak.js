// Cetak surat keluar resmi: kop sekolah, nomor/sifat/lampiran/perihal, isi, tanda tangan kepala sekolah,
// dan kode verifikasi keaslian (dicek di halaman publik /verifikasi/<kode>).
import Swal from "sweetalert2";
import { minta } from "@/components/banksoal/api";
import { esc, kopHtml, muatSekolah, siapkanJendela, tulisJendela, tanggalPanjang } from "@/app/lib/dokumenResmi";

const GAYA = `
  @page { size: A4; margin: 15mm 18mm 18mm; }
  .surat { font-size: 11.5pt; line-height: 1.5; position: relative; }
  .surat .kepala { display: flex; justify-content: space-between; gap: 16px; margin: 6px 0 12px; }
  .surat .kepala table td { padding: 0 6px 0 0; vertical-align: top; }
  .surat .tujuan { margin-bottom: 12px; white-space: pre-line; }
  .surat .isi table { border-collapse: collapse; margin: 4px 0; }
  .surat .isi td { padding: 1px 10px 1px 0; vertical-align: top; }
  .surat .isi p { margin: 0 0 8px; text-align: justify; }
  .surat .ttd { width: 280px; margin-left: auto; margin-top: 18px; text-align: left; }
  .surat .ttd .ruang { height: 70px; display: flex; align-items: center; }
  .surat .ttd .ruang img { max-height: 66px; max-width: 200px; }
  .surat .ttd .nama { font-weight: bold; text-decoration: underline; }
  .surat .verifikasi { margin-top: 22px; border-top: 1px solid #cfd6e4; padding-top: 6px; font-size: 8.5pt; color: #475569; }
  .surat .digital { font-size: 8.5pt; color: #166534; }
  .surat .cap { position: absolute; top: 40%; left: 10%; transform: rotate(-25deg); font-size: 64pt; color: rgba(185, 28, 28, .15); font-weight: bold; pointer-events: none; }
`;

/** Ganti {{nomor}} dan {{tanggal}} di isi surat saat dicetak. */
export const isiCetak = (s) => String(s.isi || "")
  .replace(/\{\{\s*nomor\s*\}\}/g, esc(s.nomor || "(nomor terisi setelah terbit)"))
  .replace(/\{\{\s*tanggal\s*\}\}/g, esc(tanggalPanjang(s.tanggal)));

export async function cetakSurat(id) {
  const w = siapkanJendela();
  try {
    const [r, sek] = await Promise.all([minta("GET", `/administrasi/surat/keluar/${id}`), muatSekolah(null)]);
    const s = r.data;
    const digital = Boolean(s.ditandatangani_at);
    const tautan = s.kode_verifikasi ? `${window.location.origin}/verifikasi/${s.kode_verifikasi}` : null;
    const cap = s.status === "BATAL" ? "DIBATALKAN" : s.status !== "TERBIT" ? "DRAF" : null;
    const badan = `<div class="surat">${cap ? `<div class="cap">${cap}</div>` : ""}${kopHtml(sek)}
      <div class="kepala">
        <table><tbody>
          <tr><td>Nomor</td><td>: ${esc(s.nomor || "-")}</td></tr>
          <tr><td>Sifat</td><td>: ${esc(s.sifat)}</td></tr>
          <tr><td>Lampiran</td><td>: ${esc(s.lampiran || "-")}</td></tr>
          <tr><td>Perihal</td><td>: <b>${esc(s.perihal)}</b></td></tr>
        </tbody></table>
        <div>${esc(sek?.kota || "")}${sek?.kota ? ", " : ""}${esc(tanggalPanjang(s.tanggal))}</div>
      </div>
      <div class="tujuan">Kepada Yth.<br>${esc(s.tujuan)}</div>
      <div class="isi">${isiCetak(s)}</div>
      <div class="ttd">Kepala Sekolah,
        <div class="ruang">${digital && sek?.ttdDataUrl ? `<img src="${sek.ttdDataUrl}" alt="Tanda tangan">` : ""}</div>
        <div class="nama">${esc(sek?.nama_kepsek || "..............................")}</div>${sek?.nip_kepsek ? `<div>NIP. ${esc(sek.nip_kepsek)}</div>` : ""}
        ${digital ? `<div class="digital">Ditandatangani secara elektronik ${esc(tanggalPanjang(s.ditandatangani_at))}</div>` : ""}
      </div>
      ${tautan ? `<div class="verifikasi">Keaslian surat ini dapat diperiksa di <b>${esc(tautan)}</b> · Kode verifikasi: <b>${esc(s.kode_verifikasi)}</b></div>` : ""}
    </div>`;
    if (!tulisJendela(w, `Surat ${s.nomor || "draf"} - ${s.perihal}`, GAYA, badan)) Swal.fire("Jendela cetak diblokir", "Izinkan pop-up untuk situs ini.", "info");
  } catch (e) {
    w?.close();
    Swal.fire("Gagal", e.message, "error");
  }
}
