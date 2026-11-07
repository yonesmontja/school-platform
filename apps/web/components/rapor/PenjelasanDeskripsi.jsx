"use client";
import { useState } from "react";
import { tingkatKktp } from "@/app/lib/kktp";

/**
 * Cara membaca deskripsi capaian di rapor (aturan yang sama dengan deskripsiIndikator di raporDokumen).
 * Tampil di luar kertas rapor, jadi tidak ikut tercetak.
 */
export default function PenjelasanDeskripsi({ settings, untukOrtu = false, terbuka = false }) {
  const [buka, setBuka] = useState(terbuka);
  const tingkat = tingkatKktp(settings);
  const anak = untukOrtu ? "ananda" : "siswa";

  return (
    <div className="card border-0 shadow-sm mb-3">
      <button type="button" className="btn btn-link text-start text-decoration-none fw-semibold d-flex align-items-center gap-2 p-3"
        aria-expanded={buka} onClick={() => setBuka((b) => !b)}>
        <i className="bi bi-question-circle text-primary"></i>
        <span className="me-auto">Cara membaca deskripsi capaian di rapor</span>
        <i className={`bi bi-chevron-${buka ? "up" : "down"} text-muted`}></i>
      </button>
      {buka && (
        <div className="card-body pt-0 small">
          <p className="mb-2">
            Deskripsi tiap mata pelajaran disusun otomatis dari nilai {anak} pada setiap <b>tujuan pembelajaran (TP)</b> atau indikator
            yang dinilai guru. Kata yang <b>dicetak tebal</b> adalah TP-nya.
          </p>
          <ul className="mb-2 ps-3">
            <li className="mb-1">
              <b>&quot;Menunjukkan penguasaan yang sangat baik/baik/cukup dalam …&quot;</b> menyebut paling banyak dua TP dengan nilai tertinggi
              yang sudah mencapai KKM mapel. Kata sangat baik, baik, atau cukup mengikuti rata-rata nilai TP tersebut.
            </li>
            <li className="mb-1">
              <b>&quot;Perlu bimbingan dalam …&quot;</b> menyebut paling banyak dua TP dengan nilai terendah yang <u>belum</u> mencapai KKM.
              Inilah bagian yang paling perlu didampingi.
            </li>
            <li className="mb-1">
              <b>&quot;Perlu peningkatan dalam …&quot;</b> muncul bila semua TP sudah mencapai KKM, untuk TP terendah yang belum sampai tingkat Sangat Baik.
            </li>
            <li className="mb-1">
              Nilai satu TP adalah rata-rata penilaiannya. Bila sudah ada nilai remedial, nilai remedial terbaru yang dipakai.
            </li>
            <li>
              Mapel yang tidak dinilai per TP memakai nilai aspek STNKM: aspek tertinggi disebut sebagai kekuatan, aspek terendah sebagai
              bagian yang perlu bimbingan.
            </li>
          </ul>
          <div className="d-flex flex-wrap align-items-center gap-2">
            <span className="text-muted">Tingkat capaian (KKTP sekolah):</span>
            {tingkat.map((t) => (
              <span key={t.key} className={`badge bg-${t.color}-subtle text-${t.color}-emphasis border border-${t.color}-subtle fw-normal`}>{t.label} {t.range}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
