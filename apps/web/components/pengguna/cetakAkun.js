// Surat pemberitahuan akun (username & kata sandi awal) berkop sekolah, siap dicetak / disimpan sebagai PDF.
// Setiap halaman berformat sama: kop, judul, salam pembuka, kartu akun, tanda tangan kepala sekolah, kaki halaman.
import { NAMA_SISTEM, esc, siapkanJendela, tulisJendela, judulHtml, kakiHtml, kopHtml, muatSekolah, ttdHtml } from "@/app/lib/dokumenResmi";

const PER_HALAMAN_RINGKAS = 4;

const SAPAAN_KELOMPOK = { guru: "Bapak/Ibu Guru", kepsek: "Bapak/Ibu Kepala Sekolah", admin: "Bapak/Ibu Pengelola Aplikasi", wakakur: "Bapak/Ibu Wakil Kepala Sekolah Bidang Kurikulum", wakasis: "Bapak/Ibu Wakil Kepala Sekolah Bidang Kesiswaan", yayasan: "Bapak/Ibu Pengurus Yayasan", ortu: "Bapak/Ibu Orang Tua/Wali Murid", siswa: "Ananda Siswa" };
const LABEL_PERAN = { admin: "Admin", kepsek: "Kepala Sekolah", guru: "Guru", siswa: "Siswa", ortu: "Orang Tua/Wali", wakakur: "Wakasek Kurikulum", wakasis: "Wakasek Kesiswaan", yayasan: "Yayasan" };

const sapaanPribadi = (k) =>
  k.role === "siswa" ? `Ananda ${k.nama}`
    : k.role === "ortu" ? `Bapak/Ibu ${k.nama} (Orang Tua/Wali Murid)`
      : `Bapak/Ibu ${k.nama}`;

function sapaanUmum(daftar) {
  const urut = ["yayasan", "kepsek", "wakakur", "wakasis", "admin", "guru", "ortu", "siswa"];
  const ada = urut.filter((r) => daftar.some((k) => (k.role || "lain") === r)).map((r) => SAPAAN_KELOMPOK[r]);
  if (!ada.length) return "Bapak/Ibu Pengguna Aplikasi";
  return ada.length === 1 ? ada[0] : `${ada.slice(0, -1).join(", ")} dan ${ada[ada.length - 1]}`;
}

const GAYA = `
  @page { size: A4; margin: 0; }
  .lembar { width: 210mm; height: 297mm; padding: 14mm 16mm 10mm; display: flex; flex-direction: column; page-break-after: always; break-after: page; overflow: hidden; }
  .lembar:last-child { page-break-after: auto; break-after: auto; }
  .salam { font-size: 10.5pt; }
  .salam p { margin: 0 0 7px; text-align: justify; }
  .salam .kepada { margin-bottom: 8px; }
  .catatan-ganti { display: flex; gap: 8px; align-items: flex-start; background: var(--aksen-muda); border-left: 3px solid var(--aksen); padding: 7px 10px; border-radius: 4px; font-size: 9.8pt; margin: 4px 0 10px; }
  .kartu-wadah { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-top: 4px; }
  .kartu-wadah.tunggal { grid-template-columns: 1fr; max-width: 125mm; margin: 6px auto 0; }
  .kartu { border: 1px solid var(--garis); border-radius: 8px; overflow: hidden; break-inside: avoid; }
  .kartu-kepala { background: var(--aksen); color: #fff; padding: 6px 10px; display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .kartu-kepala b { font-size: 10.5pt; }
  .peran { font-size: 7.8pt; text-transform: uppercase; letter-spacing: .8px; background: rgba(255,255,255,.18); border-radius: 20px; padding: 1px 8px; white-space: nowrap; }
  .kartu-isi { padding: 8px 10px 7px; }
  .kartu-isi table { width: 100%; border-collapse: collapse; }
  .kartu-isi td { padding: 2px 0; font-size: 10pt; vertical-align: top; }
  .kartu-isi td.l { width: 34%; color: var(--abu); }
  .nilai { font-family: Consolas, "Courier New", monospace; font-size: 11.5pt; font-weight: 700; letter-spacing: .5px; background: #f4f6fb; border: 1px dashed var(--garis); border-radius: 4px; padding: 1px 6px; }
  .kartu-catatan { font-size: 8.2pt; color: var(--abu); margin-top: 4px; }
  .penutup { font-size: 10.5pt; margin-top: 10px; text-align: justify; }
  .isi { flex: 1; }
`;

function kartuHtml(k, alamat) {
  return `<div class="kartu"><div class="kartu-kepala"><b>${esc(k.nama)}</b><span class="peran">${esc(LABEL_PERAN[k.role] || "Pengguna")}</span></div>
    <div class="kartu-isi"><table>
      <tr><td class="l">Alamat aplikasi</td><td>${esc(alamat)}</td></tr>
      <tr><td class="l">Nama pengguna</td><td><span class="nilai">${esc(k.login)}</span></td></tr>
      <tr><td class="l">Kata sandi</td><td><span class="nilai">${esc(k.password)}</span></td></tr>
    </table>
    <div class="kartu-catatan">${k.wajib_ganti_password === false ? "Disarankan mengganti kata sandi setelah masuk." : "Wajib mengganti kata sandi saat pertama kali masuk."}</div></div></div>`;
}

function salamHtml(daftar, sek, alamat, pribadi) {
  const kepada = pribadi ? sapaanPribadi(daftar[0]) : sapaanUmum(daftar);
  const adaWajib = daftar.some((k) => k.wajib_ganti_password !== false);
  const semuaWajib = daftar.every((k) => k.wajib_ganti_password !== false);
  const jamak = daftar.length > 1;
  return `<div class="salam"><p class="kepada">Yth. <b>${esc(kepada)}</b><br>di tempat</p>
    <p>Dengan hormat,</p>
    <p>Hai, selamat datang di <b>${esc(NAMA_SISTEM)}</b> ${esc(sek?.nama_sekolah || "")}. Bersama surat ini kami sampaikan
      ${jamak ? "nama pengguna (username) dan kata sandi" : "nama pengguna (username) dan kata sandi Anda"} untuk masuk <b>pertama kali</b>
      ke aplikasi web sekolah. Silakan buka <b>${esc(alamat)}</b> melalui peramban (Chrome, Edge, Safari, dan sejenisnya) di HP atau komputer,
      lalu masuk menggunakan data pada ${jamak ? "kartu akun masing-masing" : "kartu akun"} di bawah ini.</p>
    ${adaWajib ? `<div class="catatan-ganti"><span>🔒</span><div><b>Ganti kata sandi saat pertama kali masuk.</b> ${semuaWajib ? "Aplikasi" : "Untuk akun yang ditandai, aplikasi"} akan
      meminta Anda membuat kata sandi baru segera setelah berhasil masuk. Pilih kata sandi minimal 8 karakter yang mudah Anda ingat tetapi tidak mudah ditebak orang lain.</div></div>`
      : `<div class="catatan-ganti"><span>🔒</span><div>Demi keamanan, kami sarankan Anda segera mengganti kata sandi ini melalui menu profil setelah berhasil masuk.</div></div>`}
  </div>`;
}

const PENUTUP = `<div class="penutup">Kata sandi ini bersifat <b>rahasia</b>: mohon simpan surat ini dengan baik dan jangan bagikan kepada siapa pun,
  termasuk yang mengaku sebagai petugas sekolah. Bila mengalami kendala saat masuk, silakan hubungi admin sekolah.
  Atas perhatian dan kerja samanya, kami ucapkan terima kasih.</div>`;

/**
 * Cetak surat akun. mode "pribadi" = satu akun per halaman dengan sapaan nama pemiliknya (untuk dibagikan per orang);
 * mode "ringkas" = beberapa akun per halaman. Format tiap halaman sama.
 */
export async function cetakSuratAkun(daftar, { mode = "pribadi", sekolah = null } = {}) {
  const w = siapkanJendela();
  if (!w) return false;
  const sek = await muatSekolah(sekolah);
  const alamat = window.location.origin;
  const judul = "Surat Pemberitahuan Akun Aplikasi";
  const kelompok = mode === "pribadi" ? daftar.map((k) => [k]) : Array.from({ length: Math.ceil(daftar.length / PER_HALAMAN_RINGKAS) }, (_, i) => daftar.slice(i * PER_HALAMAN_RINGKAS, (i + 1) * PER_HALAMAN_RINGKAS));
  const total = kelompok.length;
  const halaman = kelompok.map((isi, i) => `<section class="lembar">
      ${kopHtml(sek)}
      ${judulHtml(judul, `Akses pertama ke aplikasi web sekolah · ${new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}`)}
      <div class="isi">${salamHtml(isi, sek, alamat, mode === "pribadi")}
        <div class="kartu-wadah${isi.length === 1 ? " tunggal" : ""}">${isi.map((k) => kartuHtml(k, alamat)).join("")}</div>
        ${PENUTUP}</div>
      ${ttdHtml(sek)}
      <div style="margin-top:10px">${kakiHtml(sek, `${judul} · Rahasia`, i + 1, total)}</div>
    </section>`).join("");
  return tulisJendela(w, `${judul} - ${daftar.length === 1 ? daftar[0].nama : `${daftar.length} akun`}`, GAYA, halaman);
}
