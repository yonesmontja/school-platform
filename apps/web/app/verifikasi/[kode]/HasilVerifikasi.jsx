"use client";
import { useEffect, useState } from "react";
import { API_URL } from "@/app/lib/config";

const tanggal = (t) => (t ? new Date(t.length <= 10 ? `${t}T00:00:00` : t).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) : "-");

/** Hasil cek kode verifikasi surat (dibaca di peramban dari API publik). */
export default function HasilVerifikasi({ kode }) {
  const [hasil, setHasil] = useState(null);
  useEffect(() => {
    fetch(`${API_URL}/verifikasi-surat/${encodeURIComponent(kode)}`, { headers: { Accept: "application/json" } })
      .then(async (r) => setHasil({ ok: r.ok, ...(await r.json().catch(() => ({}))) }))
      .catch(() => setHasil({ ok: false, message: "Tidak dapat menghubungi server. Periksa sambungan internet lalu muat ulang." }));
  }, [kode]);

  if (!hasil) return <div className="card"><div className="card-body text-muted">Memeriksa kode {kode}…</div></div>;
  if (!hasil.ok) {
    return (
      <div className="card border-danger" data-verifikasi="tidak-ditemukan">
        <div className="card-body">
          <h2 className="h5 text-danger"><i className="bi bi-x-octagon me-2"></i>Surat tidak terverifikasi</h2>
          <p className="mb-0">{hasil.message || "Kode tidak ditemukan."} Kode yang diperiksa: <b>{kode}</b>.</p>
        </div>
      </div>
    );
  }
  const d = hasil.data;
  const batal = d.status === "BATAL";
  const baris = (label, isi) => <><dt className="col-sm-4 fw-normal text-muted">{label}</dt><dd className="col-sm-8 mb-2">{isi || "-"}</dd></>;
  return (
    <div className={`card ${batal ? "border-danger" : "border-success"}`} data-verifikasi={batal ? "batal" : "asli"}>
      <div className="card-body">
        {batal
          ? <h2 className="h5 text-danger"><i className="bi bi-exclamation-octagon me-2"></i>Surat ini sudah dibatalkan</h2>
          : <h2 className="h5 text-success"><i className="bi bi-patch-check-fill me-2"></i>Surat asli dan tercatat</h2>}
        {batal && d.alasan_batal && <p className="text-danger">Alasan: {d.alasan_batal}</p>}
        <dl className="row mb-0">
          {baris("Diterbitkan oleh", d.sekolah)}
          {baris("Nomor", <b>{d.nomor}</b>)}
          {baris("Tanggal", tanggal(d.tanggal))}
          {baris("Perihal", d.perihal)}
          {d.tujuan && baris("Kepada", d.tujuan)}
          {baris("Tanda tangan", d.ditandatangani ? `Ditandatangani elektronik oleh ${d.penandatangan} pada ${tanggal(d.ditandatangani_at)}` : "Tanda tangan basah (di kertas)")}
        </dl>
      </div>
    </div>
  );
}
