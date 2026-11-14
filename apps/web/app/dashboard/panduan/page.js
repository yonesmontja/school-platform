"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useAkses, bolehBuka } from "@/app/lib/akses";
import { KELOMPOK, bagianUntuk } from "./isiPanduan";

const normalisasi = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export default function PanduanPage() {
  const { role, isGuru, kelasBinaan } = useAkses();
  const [pilihan, setPilihan] = useState(null);
  const [cari, setCari] = useState("");
  const [terbuka, setTerbuka] = useState(() => new Set());

  const bagian = useMemo(() => (role ? bagianUntuk(role) : []), [role]);
  const kelompok = useMemo(() => KELOMPOK.filter((k) => bagian.some((b) => b.kelompok === k.id)), [bagian]);
  // Tab awal: guru langsung ke tugasnya, wali kelas ke tugas wali, lainnya ke Mulai di sini
  const awal = isGuru ? (kelasBinaan.length ? "wali" : "guru") : role === "admin" || role === "kepsek" ? "pengelola" : "mulai";
  const aktif = pilihan || (kelompok.some((k) => k.id === awal) ? awal : kelompok[0]?.id);

  const kata = normalisasi(cari.trim());
  const tampil = kata
    ? bagian.filter((b) => normalisasi([b.judul, ...b.langkah, ...(b.tips || [])].join(" ")).includes(kata))
    : bagian.filter((b) => b.kelompok === aktif);

  const alih = (id) => setTerbuka((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const semuaTerbuka = tampil.length > 0 && tampil.every((b) => terbuka.has(b.id));

  if (!role) return null;

  return (
    <div className="container-fluid py-3 panduan" style={{ maxWidth: 1000 }}>
      <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
        <div className="me-auto">
          <h3 className="fw-bold mb-0"><i className="bi bi-question-circle text-primary me-2"></i>Panduan</h3>
          <div className="small text-body-secondary">Langkah singkat untuk pekerjaan sehari-hari di SAPrapor, sesuai peran Anda.</div>
        </div>
        <button type="button" className="btn btn-sm btn-outline-secondary d-print-none" onClick={() => setTerbuka(semuaTerbuka ? new Set() : new Set(tampil.map((b) => b.id)))}>
          <i className={`bi ${semuaTerbuka ? "bi-arrows-collapse" : "bi-arrows-expand"} me-1`}></i>{semuaTerbuka ? "Tutup semua" : "Buka semua"}
        </button>
        <button type="button" className="btn btn-sm btn-outline-primary d-print-none" onClick={() => { setTerbuka(new Set(tampil.map((b) => b.id))); setTimeout(() => window.print(), 50); }}>
          <i className="bi bi-printer me-1"></i>Cetak
        </button>
      </div>

      <div className="input-group mb-3 d-print-none">
        <span className="input-group-text"><i className="bi bi-search"></i></span>
        <input type="search" className="form-control" placeholder="Cari panduan, mis. remedial, presensi, kata sandi" value={cari} onChange={(e) => setCari(e.target.value)} />
      </div>

      {!kata && kelompok.length > 1 && (
        <ul className="nav nav-pills flex-nowrap overflow-auto gap-1 mb-3 pb-1 d-print-none">
          {kelompok.map((k) => (
            <li key={k.id} className="nav-item">
              <button type="button" className={`nav-link text-nowrap${aktif === k.id ? " active" : ""}`} onClick={() => setPilihan(k.id)}>
                <i className={`bi ${k.icon} me-1`}></i>{k.label}
              </button>
            </li>
          ))}
        </ul>
      )}

      {kata && <div className="small text-body-secondary mb-2">{tampil.length} panduan cocok dengan “{cari.trim()}”</div>}

      {tampil.map((b, i) => {
        const buka = terbuka.has(b.id) || tampil.length === 1;
        return (
          <div key={b.id} className="card mb-2 shadow-sm">
            <button type="button" className="card-header bg-transparent border-0 d-flex align-items-center gap-2 text-start w-100" onClick={() => alih(b.id)} aria-expanded={buka}>
              <span className="badge rounded-pill text-bg-primary">{i + 1}</span>
              <i className={`bi ${b.icon} text-primary`}></i>
              <span className="fw-semibold me-auto">{b.judul}</span>
              <i className={`bi ${buka ? "bi-chevron-up" : "bi-chevron-down"} text-body-secondary d-print-none`}></i>
            </button>
            {buka && (
              <div className="card-body pt-0">
                <ol className="mb-2 ps-4">
                  {b.langkah.map((l, j) => <li key={j} className="mb-1">{l}</li>)}
                </ol>
                {b.gambar && (
                  <a href={b.gambar} target="_blank" rel="noreferrer" className="d-block mb-2 panduan-gambar" title="Buka gambar ukuran penuh">
                    <img src={b.gambar} alt={`Contoh tampilan: ${b.judul}`} loading="lazy" className="img-fluid rounded border shadow-sm" style={{ maxWidth: "min(100%, 820px)" }} />
                  </a>
                )}
                {b.tips?.length > 0 && (
                  <div className="alert alert-light border small mb-2 py-2">
                    {b.tips.map((t, j) => <div key={j}><i className="bi bi-lightbulb text-warning me-1"></i>{t}</div>)}
                  </div>
                )}
                {b.href && bolehBuka(role, b.href) && (
                  <Link href={b.href} className="btn btn-sm btn-outline-primary d-print-none">
                    <i className="bi bi-box-arrow-up-right me-1"></i>Buka halamannya
                  </Link>
                )}
              </div>
            )}
          </div>
        );
      })}

      {tampil.length === 0 && (
        <div className="text-center text-body-secondary py-5">
          <i className="bi bi-search fs-2 d-block mb-2"></i>Tidak ada panduan yang cocok. Coba kata lain.
        </div>
      )}

      <div className="small text-body-secondary mt-4">
        <i className="bi bi-image me-1"></i>Tangkapan layar memakai data contoh dengan nama fiktif.<br />
        <i className="bi bi-chat-dots me-1"></i>Masih bingung atau menemukan yang tidak sesuai? Sampaikan ke admin sekolah agar panduan diperbaiki.
      </div>
    </div>
  );
}
