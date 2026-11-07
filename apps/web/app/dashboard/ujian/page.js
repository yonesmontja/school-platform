"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { minta } from "@/components/banksoal/api";

const STATUS = {
  TERSEDIA: ["Bisa dikerjakan", "success", "bi-play-circle"],
  MENGERJAKAN: ["Sedang dikerjakan", "primary", "bi-hourglass-split"],
  BELUM_DIBUKA: ["Belum dibuka", "secondary", "bi-clock"],
  SELESAI: ["Selesai", "light", "bi-check-circle"],
  DITUTUP: ["Ditutup", "light", "bi-lock"],
};
const waktu = (iso) => (iso ? new Date(iso).toLocaleString("id-ID", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : null);

/** Daftar tes online untuk kelas siswa. */
export default function DaftarUjian() {
  const [data, setData] = useState(null);
  const [galat, setGalat] = useState(null);

  useEffect(() => {
    const muat = () => minta("GET", "/ujian").then((r) => setData(r.data)).catch((err) => setGalat(err.message));
    muat();
    // Tes yang belum dibuka berubah status sendiri; segarkan tiap menit
    const t = setInterval(muat, 60000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="container mt-4 mb-5" style={{ maxWidth: 760 }}>
      <h3 className="fw-bold text-primary mb-1"><i className="bi bi-pencil-square me-2"></i>Tes Online</h3>
      <p className="text-muted small mb-3">Tes dari gurumu. Kerjakan dengan jujur dan jangan keluar dari halaman tes saat mengerjakan.</p>
      {galat ? <div className="alert alert-warning">{galat}</div>
        : !data ? <div className="text-muted"><span className="spinner-border spinner-border-sm me-2"></span>Memuat…</div>
        : !data.length ? (
          <div className="text-center text-muted py-5"><i className="bi bi-emoji-smile fs-1 d-block mb-2"></i>Belum ada tes online untuk kelasmu.</div>
        ) : (
          <div className="d-flex flex-column gap-2">
            {data.map((u) => {
              const [label, warna, ikon] = STATUS[u.status];
              const bisa = u.status === "TERSEDIA" || u.status === "MENGERJAKAN";
              return (
                <div key={u.id_paket} className={`card shadow-sm kartu-ujian ${bisa ? "border-primary" : ""}`}>
                  <div className="card-body d-flex flex-wrap align-items-center gap-2">
                    <div className="me-auto min-w-0">
                      <div className="fw-semibold fs-5">{u.judul}</div>
                      <div className="small text-muted">
                        {u.mapel} · {u.jumlah_soal} soal{u.durasi_menit && ` · ${u.durasi_menit} menit`}
                        {u.status === "BELUM_DIBUKA" && u.online_mulai && ` · dibuka ${waktu(u.online_mulai)}`}
                        {bisa && u.online_selesai && ` · ditutup ${waktu(u.online_selesai)}`}
                      </div>
                      <span className={`badge text-bg-${warna} ${warna === "light" ? "border" : ""} mt-1`}><i className={`bi ${ikon} me-1`}></i>{label}</span>
                      {u.status === "SELESAI" && u.nilai != null && <span className="badge text-bg-success ms-1">Nilai {u.nilai}</span>}
                      {u.status === "SELESAI" && u.menunggu_guru && <span className="badge text-bg-warning ms-1">Menunggu guru menilai uraian</span>}
                    </div>
                    {bisa && (
                      <Link href={`/dashboard/ujian/${u.id_paket}`} className="btn btn-primary btn-lg">
                        {u.status === "MENGERJAKAN" ? "Lanjutkan" : "Mulai"} <i className="bi bi-arrow-right ms-1"></i>
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
    </div>
  );
}
