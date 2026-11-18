// app/verifikasi/[kode]/page.js — halaman publik untuk memeriksa keaslian surat sekolah dari kode verifikasi yang tercetak.
import Link from "next/link";
import "../../_beranda/beranda.css";
import "../../spmb/spmb.css";
import { muatSekolah } from "../../_beranda/sekolah";
import HasilVerifikasi from "./HasilVerifikasi";

export const metadata = { title: "Verifikasi Surat", robots: { index: false } };

export default async function HalamanVerifikasi({ params }) {
  const { kode } = await params;
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
        </div>
      </header>
      <main className="b-wadah spmb-isi" style={{ maxWidth: 720 }}>
        <p className="b-alis b-alis-gelap mb-2">Verifikasi dokumen</p>
        <h1 className="spmb-judul">Cek keaslian surat</h1>
        <p className="b-sub">Bandingkan data di bawah dengan surat yang Anda pegang. Surat asli tercatat di sistem {s.nama_sekolah}.</p>
        <HasilVerifikasi kode={kode} />
      </main>
      <footer className="b-kaki">
        <div className="b-wadah b-kaki-isi"><span>{[s.nama_sekolah, s.kota].filter(Boolean).join(" · ")}</span></div>
      </footer>
    </div>
  );
}
