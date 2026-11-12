// Tampilan resmi bersama untuk dokumen cetak / simpan PDF dari jendela cetak browser:
// kop sekolah, blok tanda tangan kepala sekolah, dan kaki halaman dengan nomor halaman.
import { API_URL } from "@/app/lib/config";

export const NAMA_SISTEM = "Sistem Informasi Akademik & Analitik STNKM";

export const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const tokenAuth = () => {
  try { return localStorage.getItem("token"); } catch { return null; }
};

/** Gambar dari server sebagai data URL agar pasti ikut tercetak di jendela cetak. */
async function keDataUrl(url) {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((ok) => { const r = new FileReader(); r.onloadend = () => ok(r.result); r.readAsDataURL(blob); });
  } catch { return null; }
}

/** Pengaturan sekolah (nama, alamat, kepala sekolah) beserta gambar tanda tangan kepala sekolah. */
export async function muatSekolah(sekolah) {
  let s = sekolah;
  // Data sekolah ringkas (mis. hanya nama) dilengkapi dari pengaturan agar kop memuat alamat & kepala sekolah
  if (!s || !("alamat_sekolah" in s) || !("nama_kepsek" in s)) {
    try {
      const res = await fetch(`${API_URL}/settings`, { headers: { Accept: "application/json", Authorization: `Bearer ${tokenAuth()}` } });
      const d = res.ok ? await res.json().catch(() => ({})) : {};
      s = { ...(d?.data ?? d ?? {}), ...(s || {}) };
    } catch { s = s || {}; }
  }
  const berkas = s?.ttd_kepsek_url ? String(s.ttd_kepsek_url).split("/").pop() : null;
  return { ...s, ttdDataUrl: s?.ttdDataUrl ?? (berkas ? await keDataUrl(`${API_URL}/signature/${berkas}`) : null) };
}

export const tanggalPanjang = (d = new Date()) => new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });

// Inisial sekolah untuk lambang kop, mis. "SD Sekolah Anak Papua" → "SAP"
const inisial = (nama) => {
  const kata = String(nama || "").split(/\s+/).filter((k) => k && !/^(SD|SMP|SMA|SMK|MI|MTS|MA|TK|PAUD)$/i.test(k));
  return (kata.length ? kata : ["S"]).slice(0, 3).map((k) => k[0].toUpperCase()).join("");
};

export const GAYA_RESMI = `
  :root { --aksen: #1e3a8a; --aksen-muda: #e8edf8; --abu: #5b6475; --garis: #cfd6e4; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #111827; font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif; font-size: 11pt; line-height: 1.45;
    -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .kop-resmi { display: flex; align-items: center; gap: 14px; padding-bottom: 8px; border-bottom: 3px solid var(--aksen); position: relative; margin-bottom: 14px; }
  .kop-resmi::after { content: ""; position: absolute; left: 0; right: 0; bottom: -6px; border-bottom: 1px solid var(--aksen); }
  .kop-lambang { width: 58px; height: 58px; border-radius: 50%; flex: none; display: flex; align-items: center; justify-content: center;
    background: var(--aksen); color: #fff; font: 700 17pt Georgia, "Times New Roman", serif; letter-spacing: 1px; box-shadow: inset 0 0 0 3px #fff, 0 0 0 2px var(--aksen); }
  .kop-isi { flex: 1; text-align: center; }
  .kop-nama { font: 700 17pt Georgia, "Times New Roman", serif; letter-spacing: 1.5px; text-transform: uppercase; color: var(--aksen); margin: 0; }
  .kop-alamat { font-size: 9.5pt; color: var(--abu); margin-top: 2px; }
  .kop-sistem { font-size: 8.5pt; color: var(--abu); letter-spacing: .4px; margin-top: 1px; }
  .kop-pengimbang { width: 58px; flex: none; }
  .judul-dok { text-align: center; margin: 14px 0 12px; }
  .judul-dok h1 { font: 700 13pt Georgia, "Times New Roman", serif; letter-spacing: 1px; text-transform: uppercase; margin: 0; }
  .judul-dok div { font-size: 9.5pt; color: var(--abu); margin-top: 2px; }
  .ttd-resmi { display: flex; justify-content: space-between; gap: 24px; margin-top: 18px; break-inside: avoid; page-break-inside: avoid; }
  .ttd-resmi > div { width: 46%; text-align: center; font-size: 10.5pt; }
  .ttd-resmi .ruang { height: 62px; display: flex; align-items: center; justify-content: center; }
  .ttd-resmi .ruang img { max-height: 60px; max-width: 160px; }
  .ttd-resmi .nama { font-weight: 700; text-decoration: underline; text-underline-offset: 3px; }
  .kaki-resmi { display: flex; justify-content: space-between; align-items: center; gap: 12px; font-size: 8pt; color: var(--abu);
    border-top: 1px solid var(--garis); padding-top: 5px; }
  .kaki-resmi .titik { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--aksen); margin-right: 6px; vertical-align: middle; }
  .kaki-resmi b { color: var(--aksen); }
  /* Dokumen mengalir: kop diulang di tiap halaman (thead), kaki halaman di margin halaman */
  table.bingkai { width: 100%; border-collapse: collapse; }
  table.bingkai > thead > tr > td, table.bingkai > tbody > tr > td, table.bingkai > tfoot > tr > td { border: none; padding: 0; }
`;

/** Kop sekolah: lambang inisial, nama, alamat/NPSN, garis ganda. */
export function kopHtml(sek) {
  const alamat = [sek?.alamat_sekolah, sek?.kota].filter(Boolean).join(", ");
  const baris2 = [alamat, sek?.npsn ? `NPSN ${sek.npsn}` : ""].filter(Boolean).join("  ·  ");
  return `<div class="kop-resmi"><div class="kop-lambang">${esc(inisial(sek?.nama_sekolah))}</div>
    <div class="kop-isi"><p class="kop-nama">${esc(sek?.nama_sekolah || "Nama Sekolah")}</p>
      ${baris2 ? `<div class="kop-alamat">${esc(baris2)}</div>` : ""}<div class="kop-sistem">${esc(NAMA_SISTEM)}</div></div>
    <div class="kop-pengimbang"></div></div>`;
}

export const judulHtml = (judul, sub) => `<div class="judul-dok"><h1>${esc(judul)}</h1>${sub ? `<div>${esc(sub)}</div>` : ""}</div>`;

/**
 * Blok tanda tangan: "Mengetahui, Kepala Sekolah" (kiri) dan pihak kedua opsional (kanan),
 * dengan kota & tanggal di atas pihak kanan (atau di atas kepala sekolah bila tidak ada pihak kanan).
 */
export function ttdHtml(sek, { tanggal = new Date(), kanan = null } = {}) {
  const tempat = `${esc(sek?.kota || "")}${sek?.kota ? ", " : ""}${esc(tanggalPanjang(tanggal))}`;
  const kepsek = `<div>${kanan ? "" : `${tempat}<br>`}Mengetahui,<br>Kepala Sekolah
      <div class="ruang">${sek?.ttdDataUrl ? `<img src="${sek.ttdDataUrl}" alt="">` : ""}</div>
      <div class="nama">${esc(sek?.nama_kepsek || "..............................")}</div>${sek?.nip_kepsek ? `<div>NIP. ${esc(sek.nip_kepsek)}</div>` : ""}</div>`;
  if (!kanan) return `<div class="ttd-resmi"><div></div>${kepsek}</div>`; // tanpa pihak kedua: kepala sekolah di kanan, seperti surat resmi
  const pihak = `<div>${tempat}<br>${esc(kanan.jabatan || "")}<div class="ruang"></div>
      <div class="nama">${esc(kanan.nama || "..............................")}</div>${kanan.nip ? `<div>NIP. ${esc(kanan.nip)}</div>` : ""}</div>`;
  return `<div class="ttd-resmi">${kepsek}${pihak}</div>`;
}

/** Kaki halaman untuk halaman berukuran tetap (nomor halaman dihitung sendiri). */
export const kakiHtml = (sek, judul, halaman, total) =>
  `<div class="kaki-resmi"><span><span class="titik"></span>${esc(sek?.nama_sekolah || "")} · ${esc(judul)}</span>
    <span>Dicetak ${esc(new Date().toLocaleString("id-ID", { dateStyle: "long", timeStyle: "short" }))}${total ? ` · Halaman <b>${halaman}</b> dari ${total}` : ""}</span></div>`;

/**
 * CSS @page untuk dokumen mengalir: kaki halaman (nama sekolah · judul, nomor halaman) di margin bawah
 * setiap halaman. Browser tanpa dukungan kotak margin cukup mengabaikannya.
 */
export const gayaHalamanMengalir = (sek, judul, { ukuran = "A4", margin = "16mm 15mm 18mm" } = {}) => {
  const kutip = (t) => `"${String(t).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  return `@page { size: ${ukuran}; margin: ${margin};
    @bottom-left { content: ${kutip(`${sek?.nama_sekolah || ""} · ${judul}`)}; font: 8pt "Segoe UI", Arial, sans-serif; color: #5b6475; border-top: 1px solid #cfd6e4; vertical-align: top; padding-top: 4px; }
    @bottom-right { content: "Halaman " counter(page) " dari " counter(pages); font: 8pt "Segoe UI", Arial, sans-serif; color: #1e3a8a; border-top: 1px solid #cfd6e4; vertical-align: top; padding-top: 4px; } }`;
};

/** Bungkus isi mengalir agar kop sekolah diulang di atas setiap halaman. */
export const bingkaiMengalir = (sek, isi) =>
  `<table class="bingkai"><thead><tr><td>${kopHtml(sek)}</td></tr></thead><tbody><tr><td>${isi}</td></tr></tbody></table>`;

/**
 * Buka jendela cetak lebih dulu (harus langsung dari klik agar tidak diblokir sebagai popup),
 * lalu isi setelah data siap lewat tulisJendela().
 */
export function siapkanJendela() {
  const w = window.open("", "_blank");
  if (w) w.document.write(`<p style="font-family:sans-serif;color:#5b6475;padding:24px">Menyiapkan dokumen…</p>`);
  return w;
}

/** Isi jendela cetak dan tampilkan dialog cetak (simpan sebagai PDF). */
export function tulisJendela(w, judul, gaya, badan) {
  if (!w || w.closed) return false;
  w.document.open();
  w.document.write(`<!doctype html><html lang="id"><head><meta charset="utf-8"><title>${esc(judul)}</title><style>${GAYA_RESMI}${gaya}</style></head>
    <body>${badan}<script>window.onload=()=>setTimeout(()=>window.print(),150)</script></body></html>`);
  w.document.close();
  return true;
}

/** Buka dan isi jendela cetak sekaligus (bila data sudah tersedia tanpa menunggu). */
export const bukaJendelaCetak = (judul, gaya, badan) => tulisJendela(siapkanJendela(), judul, gaya, badan);
