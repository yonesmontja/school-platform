"use client";
import { useEffect, useState } from "react";
import { API_URL } from "@/app/lib/config";

const tgl = (v) => (v ? new Date(v).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) : "-");
const KEPUTUSAN = { NAIK: "Naik kelas", TIDAK_NAIK: "Tinggal kelas", LULUS: "Lulus" };

/** Hasil cek kode rapor (dibaca di peramban dari API publik). */
export default function HasilRapor({ kode }) {
  const [hasil, setHasil] = useState(null);
  useEffect(() => {
    fetch(`${API_URL}/verifikasi-rapor/${encodeURIComponent(kode)}`, { headers: { Accept: "application/json" } })
      .then(async (r) => setHasil({ ok: r.ok, ...(await r.json().catch(() => ({}))) }))
      .catch(() => setHasil({ ok: false, message: "Tidak dapat menghubungi server. Periksa sambungan internet lalu muat ulang." }));
  }, [kode]);

  if (!hasil) return <div className="card"><div className="card-body text-muted">Memeriksa rapor…</div></div>;
  if (!hasil.ok) {
    return (
      <div className="card border-danger" data-verifikasi-rapor="tidak-ditemukan">
        <div className="card-body">
          <h2 className="h5 text-danger"><i className="bi bi-x-octagon me-2"></i>Rapor tidak terverifikasi</h2>
          <p className="mb-0">{hasil.message || "Kode tidak ditemukan."}</p>
        </div>
      </div>
    );
  }
  const d = hasil.data;
  const asli = d.status === "BERLAKU" && !d.berubah;
  const kelasKartu = d.status !== "BERLAKU" ? "border-warning" : d.berubah ? "border-warning" : "border-success";
  return (
    <div className={`card ${kelasKartu}`} data-verifikasi-rapor={d.status === "BERLAKU" ? (d.berubah ? "berubah" : "berlaku") : "diganti"}>
      <div className="card-body">
        {asli && <h2 className="h5 text-success"><i className="bi bi-patch-check-fill me-2"></i>Rapor resmi dan berlaku</h2>}
        {d.status === "DIGANTI" && <h2 className="h5 text-warning"><i className="bi bi-exclamation-triangle me-2"></i>Rapor ini sudah diganti versi yang lebih baru</h2>}
        {d.status === "BERLAKU" && d.berubah && <h2 className="h5 text-warning"><i className="bi bi-exclamation-triangle me-2"></i>Rapor resmi, tetapi data nilai di sekolah sudah berubah sejak diterbitkan</h2>}
        <div className="fs-5 fw-bold">{d.nama_siswa}</div>
        <div className="text-muted">{d.nama_kelas} · {d.tahun_ajaran} semester {d.semester}{d.nisn ? ` · NISN ${d.nisn}` : ""}</div>
        <div className="small text-muted mb-3">{d.sekolah}</div>

        <dl className="row small mb-3">
          <dt className="col-5">Tanggal rapor</dt><dd className="col-7">{tgl(d.tanggal_rapor)}</dd>
          <dt className="col-5">Wali kelas</dt><dd className="col-7">{d.nama_wali || "-"} <span className="text-muted">(tanda tangan elektronik {tgl(d.diterbitkan_pada)})</span></dd>
          <dt className="col-5">Kepala sekolah</dt>
          <dd className="col-7">{d.disahkan_pada ? <>{d.nama_kepsek} <span className="text-muted">(disahkan {tgl(d.disahkan_pada)})</span></> : <span className="text-muted">Belum disahkan</span>}</dd>
          {d.kenaikan && (<><dt className="col-5">Keputusan</dt><dd className="col-7 fw-semibold">{KEPUTUSAN[d.kenaikan.keputusan] || d.kenaikan.keputusan}</dd></>)}
          {d.versi > 1 && (<><dt className="col-5">Versi</dt><dd className="col-7">{d.versi}</dd></>)}
        </dl>

        <p className="small mb-1">Cocokkan nilai di bawah dengan rapor yang Anda pegang:</p>
        <table className="table table-sm small mb-0">
          <thead><tr><th scope="col">Mata pelajaran</th><th scope="col" className="text-center">KKM</th><th scope="col" className="text-center">Nilai</th></tr></thead>
          <tbody>
            {d.mapel.map((m) => <tr key={m.nama}><td>{m.nama}</td><td className="text-center">{m.kkm ?? "-"}</td><td className="text-center fw-semibold">{m.nilai ?? "-"}</td></tr>)}
          </tbody>
          {d.rata_umum !== null && <tfoot><tr><th scope="row" colSpan={2}>Rata-rata</th><th className="text-center">{d.rata_umum}</th></tr></tfoot>}
        </table>
      </div>
    </div>
  );
}
