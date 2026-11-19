// app/android/page.js — halaman publik unduhan aplikasi Android SAPrapor (TWA: membuka web.saprapor.com dalam layar penuh).
// APK & info versinya dibuat apps/android/buat-apk.sh ke public/unduh/, lalu ikut terbit bersama web.
import Link from "next/link";
import "../_beranda/beranda.css";
import "../spmb/spmb.css";
import { muatSekolah } from "../_beranda/sekolah";
import info from "../../public/unduh/saprapor-android.json";

export const metadata = { title: "Aplikasi Android", description: "Unduh aplikasi Android SAPrapor untuk guru, siswa, dan orang tua." };

const LANGKAH = [
  ["Unduh", "Tekan tombol Unduh APK di bawah dari HP Android Anda. Bila peramban bertanya, pilih Tetap unduh."],
  ["Izinkan pemasangan", "Buka berkas saprapor-android.apk. Bila muncul peringatan, tekan Setelan lalu aktifkan Izinkan dari sumber ini untuk peramban Anda, kemudian kembali."],
  ["Pasang", "Tekan Pasang. Bila Google Play Protect bertanya, pilih Tetap pasang: aplikasi ini dibagikan langsung oleh sekolah, bukan lewat Play Store."],
  ["Masuk", "Buka ikon SAPrapor di layar HP, lalu masuk dengan akun yang sama seperti di web."],
];

export default async function HalamanAndroid() {
  const s = await muatSekolah();
  const logo = s.ada_logo ? "/api/logo-sekolah" : "/api/ikon-aplikasi/icon-192.png";
  return (
    <div className="beranda spmb" data-bs-theme="light">
      <header className="spmb-atas">
        <div className="b-wadah b-atas-isi">
          <Link href="/" className="b-merek" aria-label={`${s.nama_sekolah}, beranda`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logo} alt="" width="40" height="40" />
            <span>{s.nama_sekolah}</span>
          </Link>
          <nav className="b-atas-nav" aria-label="Utama">
            <Link href="/login" className="b-tombol b-tombol-garis b-tombol-kecil">Masuk</Link>
          </nav>
        </div>
      </header>
      <main className="b-wadah spmb-isi" style={{ maxWidth: 720 }}>
        <p className="b-alis b-alis-gelap mb-2">Aplikasi Android</p>
        <h1 className="spmb-judul">SAPrapor di HP Android</h1>
        <p className="b-sub">Buka nilai, jurnal, presensi, tes online, dan rapor langsung dari ikon di layar HP, tanpa bilah alamat peramban. Isinya selalu sama dengan versi web dan ikut diperbarui otomatis.</p>

        <div className="border rounded-4 p-3 p-md-4 bg-white shadow-sm mb-4" data-unduh-android>
          <div className="d-flex flex-wrap align-items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/api/ikon-aplikasi/icon-192.png" alt="" width="64" height="64" className="rounded-3" />
            <div className="me-auto">
              <div className="fw-bold fs-5">SAPrapor</div>
              <div className="small text-muted" data-versi-android>Versi {info.versi} · {(info.ukuran_kb / 1024).toFixed(1)} MB · Android {info.min_android} atau lebih baru</div>
            </div>
            <a href="/unduh/saprapor-android.apk" download className="b-tombol b-tombol-emas">
              <i className="bi bi-android2" aria-hidden="true"></i> Unduh APK
            </a>
          </div>
        </div>

        <h2 className="h5 fw-bold mb-3">Cara memasang</h2>
        <ol className="list-unstyled d-flex flex-column gap-3 mb-4">
          {LANGKAH.map(([judul, isi], i) => (
            <li key={judul} className="d-flex gap-3">
              <span className="flex-shrink-0 rounded-circle d-inline-flex align-items-center justify-content-center fw-bold text-white bg-primary" style={{ width: 32, height: 32 }}>{i + 1}</span>
              <div><div className="fw-semibold">{judul}</div><div className="small text-muted">{isi}</div></div>
            </li>
          ))}
        </ol>

        <div className="small text-muted border-top pt-3">
          <p className="mb-2"><b>Pembaruan:</b> fitur baru langsung muncul di aplikasi tanpa memasang ulang. APK baru hanya diumumkan sekolah bila ikon atau pengaturan aplikasi berubah; pasang saja di atas versi lama, data dan akun tetap.</p>
          <p className="mb-0"><b>iPhone dan laptop:</b> buka <Link href="/login">situs ini</Link> di peramban, lalu pilih Tambahkan ke Layar Utama (Safari) atau Pasang aplikasi (Chrome/Edge).</p>
        </div>
      </main>
      <footer className="b-kaki">
        <div className="b-wadah b-kaki-isi"><span>{[s.nama_sekolah, s.kota].filter(Boolean).join(" · ")}</span></div>
      </footer>
    </div>
  );
}
