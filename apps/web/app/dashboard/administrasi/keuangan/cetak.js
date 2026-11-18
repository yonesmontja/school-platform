// Dokumen cetak Keuangan: kuitansi pembayaran dan laporan kas, memakai kop & tanda tangan resmi sekolah.
import Swal from "sweetalert2";
import { minta } from "@/components/banksoal/api";
import { esc, judulHtml, kopHtml, muatSekolah, siapkanJendela, tulisJendela, ttdHtml, tanggalPanjang } from "@/app/lib/dokumenResmi";

export const rp = (n) => `Rp${Number(n || 0).toLocaleString("id-ID")}`;
export const METODE = { TUNAI: "Tunai", TRANSFER: "Transfer bank", LAINNYA: "Lainnya" };

const SATUAN = ["", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan", "sepuluh", "sebelas"];
/** Terbilang rupiah: 150000 → "seratus lima puluh ribu". */
export function terbilang(n) {
  n = Math.floor(Math.abs(n));
  if (n < 12) return SATUAN[n];
  if (n < 20) return `${terbilang(n - 10)} belas`;
  if (n < 100) return `${terbilang(Math.floor(n / 10))} puluh ${terbilang(n % 10)}`.trim();
  if (n < 200) return `seratus ${terbilang(n - 100)}`.trim();
  if (n < 1000) return `${terbilang(Math.floor(n / 100))} ratus ${terbilang(n % 100)}`.trim();
  if (n < 2000) return `seribu ${terbilang(n - 1000)}`.trim();
  if (n < 1e6) return `${terbilang(Math.floor(n / 1000))} ribu ${terbilang(n % 1000)}`.trim();
  if (n < 1e9) return `${terbilang(Math.floor(n / 1e6))} juta ${terbilang(n % 1e6)}`.trim();
  return `${terbilang(Math.floor(n / 1e9))} miliar ${terbilang(n % 1e9)}`.trim();
}

const blokir = () => Swal.fire("Jendela cetak diblokir", "Izinkan pop-up untuk situs ini, lalu coba lagi.", "info");

const GAYA_KUITANSI = `
  @page { size: A5 landscape; margin: 10mm 12mm; }
  .kw { font-size: 10.5pt; }
  .kw table.data { width: 100%; border-collapse: collapse; margin: 8px 0; }
  .kw table.data th, .kw table.data td { border: 1px solid #cfd6e4; padding: 4px 6px; text-align: left; }
  .kw table.data td.angka, .kw table.data th.angka { text-align: right; white-space: nowrap; }
  .kw .info { display: grid; grid-template-columns: 120px 1fr; gap: 2px 8px; margin-top: 6px; }
  .kw .terbilang { font-style: italic; border: 1px dashed #94a3b8; padding: 4px 8px; margin: 6px 0; }
  .kw .batal { color: #b91c1c; font-weight: bold; border: 2px solid #b91c1c; padding: 4px 8px; display: inline-block; margin-bottom: 6px; }
`;

/** Buka jendela cetak kuitansi (dipanggil langsung dari klik agar tidak diblokir). */
export async function cetakKuitansi(id) {
  const w = siapkanJendela();
  try {
    const [r, sek] = await Promise.all([minta("GET", `/administrasi/keuangan/pembayaran/${id}`), muatSekolah(null)]);
    const p = r.data;
    const baris = p.rincian.map((x) => `<tr><td>${esc(x.tagihan?.judul)}</td><td class="angka">${rp(x.jumlah)}</td></tr>`).join("");
    const isi = `<div class="kw">${kopHtml(sek)}${judulHtml("KUITANSI PEMBAYARAN", `Nomor ${p.nomor_kuitansi}`)}
      ${p.dibatalkan_at ? `<div class="batal">DIBATALKAN: ${esc(p.alasan_batal)}</div>` : ""}
      <div class="info"><span>Telah terima dari</span><b>${esc(p.penyetor || "Orang tua/wali")}</b>
        <span>Untuk siswa</span><span>${esc(p.siswa?.nama_siswa)}${p.siswa?.kelas ? ` · Kelas ${esc(p.siswa.kelas.nama_kelas)}` : ""}${p.siswa?.nisn ? ` · NISN ${esc(p.siswa.nisn)}` : ""}</span>
        <span>Tanggal</span><span>${esc(tanggalPanjang(p.tanggal))} · ${esc(METODE[p.metode] || p.metode)}</span>
        ${p.keterangan ? `<span>Keterangan</span><span>${esc(p.keterangan)}</span>` : ""}</div>
      <table class="data"><thead><tr><th>Pembayaran</th><th class="angka">Jumlah</th></tr></thead>
        <tbody>${baris}</tbody><tfoot><tr><th>Total</th><th class="angka">${rp(p.jumlah)}</th></tr></tfoot></table>
      <div class="terbilang">Terbilang: ${esc(terbilang(p.jumlah))} rupiah</div>
      ${ttdHtml(sek, { tanggal: p.tanggal, kanan: { jabatan: "Penerima", nama: p.pencatat?.name } })}</div>`;
    if (!tulisJendela(w, `Kuitansi ${p.nomor_kuitansi}`, GAYA_KUITANSI, isi)) blokir();
  } catch (e) {
    w?.close();
    Swal.fire("Gagal", e.message, "error");
  }
}

const GAYA_KAS = `
  @page { size: A4; margin: 14mm 14mm 16mm; }
  table.data { width: 100%; border-collapse: collapse; font-size: 9.5pt; margin: 6px 0 12px; }
  table.data th, table.data td { border: 1px solid #cfd6e4; padding: 3px 5px; text-align: left; vertical-align: top; }
  table.data .angka { text-align: right; white-space: nowrap; }
  .ringkas { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin: 8px 0; font-size: 10pt; }
  .ringkas div { border: 1px solid #cfd6e4; padding: 4px 6px; } .ringkas b { display: block; font-size: 11pt; }
  h3 { font-size: 11pt; margin: 10px 0 2px; }
`;

/** Laporan kas untuk rentang tanggal yang sedang ditampilkan. */
export async function cetakKas(data) {
  const w = siapkanJendela();
  const sek = await muatSekolah(null);
  const sub = `${tanggalPanjang(data.dari)} s.d. ${tanggalPanjang(data.sampai)}`;
  const baris = data.baris.map((b) => `<tr><td>${esc(tanggalPanjang(b.tanggal))}</td><td>${esc(b.kategori)}</td><td>${esc(b.uraian || "")}</td>
    <td class="angka">${b.arah === "MASUK" ? rp(b.jumlah) : ""}</td><td class="angka">${b.arah === "KELUAR" ? rp(b.jumlah) : ""}</td><td class="angka">${rp(b.saldo)}</td></tr>`).join("");
  const jenis = data.per_jenis.map((j) => `<tr><td>${esc(j.nama)}</td><td class="angka">${rp(j.jumlah)}</td></tr>`).join("");
  const isi = `${kopHtml(sek)}${judulHtml("LAPORAN KAS", sub)}
    <div class="ringkas"><div>Saldo awal<b>${rp(data.saldo_awal)}</b></div><div>Pemasukan<b>${rp(data.masuk)}</b></div>
      <div>Pengeluaran<b>${rp(data.keluar)}</b></div><div>Saldo akhir<b>${rp(data.saldo_akhir)}</b></div></div>
    <table class="data"><thead><tr><th>Tanggal</th><th>Kategori</th><th>Uraian</th><th class="angka">Masuk</th><th class="angka">Keluar</th><th class="angka">Saldo</th></tr></thead>
      <tbody>${baris || `<tr><td colspan="6">Tidak ada transaksi.</td></tr>`}</tbody></table>
    ${jenis ? `<h3>Penerimaan per jenis biaya</h3><table class="data" style="width:60%"><tbody>${jenis}</tbody></table>` : ""}
    ${ttdHtml(sek, { kanan: { jabatan: "Bendahara" } })}`;
  if (!tulisJendela(w, `Laporan Kas ${data.dari} - ${data.sampai}`, GAYA_KAS, isi)) blokir();
}
