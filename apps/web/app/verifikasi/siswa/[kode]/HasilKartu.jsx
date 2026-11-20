"use client";
import { useEffect, useState } from "react";
import { API_URL } from "@/app/lib/config";
import { srcFoto } from "@/components/siswa/fotoSiswa";

/** Hasil cek kode kartu pelajar (dibaca di peramban dari API publik). */
export default function HasilKartu({ kode }) {
  const [hasil, setHasil] = useState(null);
  useEffect(() => {
    fetch(`${API_URL}/verifikasi-siswa/${encodeURIComponent(kode)}`, { headers: { Accept: "application/json" } })
      .then(async (r) => setHasil({ ok: r.ok, ...(await r.json().catch(() => ({}))) }))
      .catch(() => setHasil({ ok: false, message: "Tidak dapat menghubungi server. Periksa sambungan internet lalu muat ulang." }));
  }, [kode]);

  if (!hasil) return <div className="card"><div className="card-body text-muted">Memeriksa kartu…</div></div>;
  if (!hasil.ok) {
    return (
      <div className="card border-danger" data-verifikasi-kartu="tidak-ditemukan">
        <div className="card-body">
          <h2 className="h5 text-danger"><i className="bi bi-x-octagon me-2"></i>Kartu tidak terverifikasi</h2>
          <p className="mb-0">{hasil.message || "Kode tidak ditemukan."}</p>
        </div>
      </div>
    );
  }
  const d = hasil.data;
  const foto = srcFoto(d.foto_url);
  return (
    <div className={`card ${d.aktif ? "border-success" : "border-warning"}`} data-verifikasi-kartu={d.aktif ? "aktif" : "nonaktif"}>
      <div className="card-body d-flex gap-3 align-items-start">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {foto ? <img src={foto} alt={`Foto ${d.nama_siswa}`} width="90" height="120" className="rounded border object-fit-cover flex-shrink-0" />
          : <div className="rounded border bg-light d-flex align-items-center justify-content-center flex-shrink-0" style={{ width: 90, height: 120 }}><i className="bi bi-person fs-1 text-secondary"></i></div>}
        <div>
          {d.aktif
            ? <h2 className="h5 text-success"><i className="bi bi-patch-check-fill me-2"></i>Siswa terdaftar</h2>
            : <h2 className="h5 text-warning"><i className="bi bi-exclamation-triangle me-2"></i>Kelas siswa tidak aktif semester ini</h2>}
          <div className="fs-5 fw-bold">{d.nama_siswa}</div>
          <div className="text-muted">{d.kelas || "-"} · {d.sekolah}</div>
          {d.tahun_ajaran && <div className="small text-muted">Tahun ajaran {d.tahun_ajaran}</div>}
        </div>
      </div>
    </div>
  );
}
