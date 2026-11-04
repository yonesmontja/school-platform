"use client";
import { useEffect } from "react";
import Swal from "sweetalert2";
import { daftarkanPwa, pasangAplikasi, useBisaDipasang } from "@/app/lib/pwa";

// Tombol "Pasang aplikasi" di topbar; tampil hanya bila peramban mendukung dan aplikasi belum terpasang
export default function PasangAplikasi() {
  const bisa = useBisaDipasang();
  useEffect(() => { daftarkanPwa(); }, []);
  if (!bisa) return null;

  const klik = async () => {
    if (bisa === "prompt") {
      if (await pasangAplikasi()) Swal.fire({ toast: true, position: "top-end", icon: "success", title: "EduRapor terpasang di perangkat Anda", showConfirmButton: false, timer: 2500 });
      return;
    }
    Swal.fire({
      title: "Pasang EduRapor di iPhone/iPad",
      icon: "info",
      html: `<ol class="text-start small mb-0">
        <li>Buka halaman ini di <b>Safari</b>.</li>
        <li>Ketuk tombol <b>Bagikan</b> <i class="bi bi-box-arrow-up"></i> di bawah layar.</li>
        <li>Pilih <b>Tambah ke Layar Utama</b>, lalu ketuk <b>Tambah</b>.</li></ol>`,
      confirmButtonText: "Mengerti",
    });
  };

  return (
    <button type="button" className="btn btn-sm btn-outline-primary rounded-pill me-2 btn-pasang" onClick={klik} title="Pasang EduRapor sebagai aplikasi">
      <i className="bi bi-download"></i><span className="d-none d-lg-inline ms-1">Pasang aplikasi</span>
    </button>
  );
}
