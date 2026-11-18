// app/spmb/page.js — halaman publik Penerimaan Murid Baru (tanpa login). Formulir & cek status ada di SpmbPublik.
import Link from "next/link";
import "../_beranda/beranda.css";
import "./spmb.css";
import { muatSekolah } from "../_beranda/sekolah";
import SpmbPublik from "./SpmbPublik";

export const revalidate = 300;

export async function generateMetadata() {
  const s = await muatSekolah();
  return {
    title: `SPMB · ${s.nama_sekolah}`,
    description: `Pendaftaran murid baru ${s.nama_sekolah}, ${s.kota}: isi formulir daring, unggah berkas, dan pantau hasil seleksi.`,
  };
}

export default async function HalamanSpmb() {
  const s = await muatSekolah();
  const logo = s.ada_logo ? "/api/logo-sekolah" : "/api/ikon-aplikasi/icon-192.png";
  return (
    // Formulir memakai komponen Bootstrap dengan tema terang, apa pun tema dasbor yang tersimpan di perangkat
    <div className="beranda spmb" data-bs-theme="light">
      <header className="spmb-atas">
        <div className="b-wadah b-atas-isi">
          <Link href="/" className="b-merek" aria-label={`${s.nama_sekolah}, beranda`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logo} alt="" width="40" height="40" />
            <span>{s.nama_sekolah}</span>
          </Link>
          <Link href="/login" className="b-tombol b-tombol-garis b-tombol-kecil">Masuk</Link>
        </div>
      </header>
      <main className="b-wadah spmb-isi">
        <p className="b-alis b-alis-gelap mb-2">Sistem Penerimaan Murid Baru</p>
        <h1 className="spmb-judul">Daftar menjadi murid {s.nama_sekolah}</h1>
        <p className="b-sub">Isi formulir dari HP, unggah berkas, lalu pantau hasil seleksi dengan nomor pendaftaran dan kode akses.</p>
        <SpmbPublik />
      </main>
      <footer className="b-kaki">
        <div className="b-wadah b-kaki-isi">
          <span>{[s.nama_sekolah, s.kota].filter(Boolean).join(" · ")}</span>
          <div className="b-kaki-tautan">
            <Link href="/">Beranda</Link>
            <Link href="/login">Masuk</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
