// app/verifikasi/siswa/[kode]/page.js — halaman publik untuk memeriksa kartu pelajar dari kode QR yang tercetak.
import Link from "next/link";
import "../../../_beranda/beranda.css";
import "../../../spmb/spmb.css";
import { muatSekolah } from "../../../_beranda/sekolah";
import HasilKartu from "./HasilKartu";

export const metadata = { title: "Verifikasi Kartu Pelajar", robots: { index: false } };

export default async function HalamanVerifikasiKartu({ params }) {
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
      <main className="b-wadah spmb-isi" style={{ maxWidth: 560 }}>
        <p className="b-alis b-alis-gelap mb-2">Verifikasi kartu</p>
        <h1 className="spmb-judul">Cek kartu pelajar</h1>
        <p className="b-sub">Cocokkan nama dan foto di bawah dengan kartu dan pemegangnya.</p>
        <HasilKartu kode={kode} />
      </main>
      <footer className="b-kaki">
        <div className="b-wadah b-kaki-isi"><span>{[s.nama_sekolah, s.kota].filter(Boolean).join(" · ")}</span></div>
      </footer>
    </div>
  );
}
