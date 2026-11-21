"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { API_URL } from "@/app/lib/config";
import { ChartCanvas } from "@/components/dashboard/ChartCard";
import PortofolioSiswa from "@/components/siswa/Portofolio";

const getToken = () => localStorage.getItem("token");

async function ambil(path) {
  const res = await fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${getToken()}`, Accept: "application/json" } });
  const teks = await res.text();
  let data = {};
  try { data = teks ? JSON.parse(teks) : {}; } catch { throw new Error("Respon server tidak valid."); }
  if (!res.ok) throw new Error(data.message || "Terjadi kesalahan pada server");
  return data;
}

const KEPUTUSAN = { NAIK: "Naik", TIDAK_NAIK: "Tidak naik", LULUS: "Lulus" };
const STATUS = { aktif: "Aktif", lulus: "Lulus (alumni)", mutasi: "Mutasi", keluar: "Keluar" };
const tgl = (v) => (v ? new Date(`${String(v).slice(0, 10)}T00:00:00`).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) : "-");

function Rincian({ idSiswa, idPeriode, jenis }) {
  const [data, setData] = useState(null);
  const [galat, setGalat] = useState("");
  useEffect(() => {
    ambil(`/siswa/${encodeURIComponent(idSiswa)}/rekam-jejak/${jenis}?id_periode=${encodeURIComponent(idPeriode)}`)
      .then((d) => setData(d.data)).catch((e) => setGalat(e.message));
  }, [idSiswa, idPeriode, jenis]);
  if (galat) return <div className="text-danger small">{galat}</div>;
  if (!data) return <div className="text-muted small"><span className="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>Memuat…</div>;
  if (!data.length) return <div className="text-muted small">Belum ada catatan.</div>;
  if (jenis === "nilai") {
    return (
      <div className="table-responsive">
        <table className="table table-sm small mb-0">
          <thead><tr><th scope="col">Tanggal</th><th scope="col">Mapel</th><th scope="col">Materi</th><th scope="col">Penilaian</th><th scope="col" className="text-end">Nilai</th></tr></thead>
          <tbody>
            {data.map((n) => (
              <tr key={n.id_nilai}>
                <td>{tgl(n.tanggal)}</td><td>{n.mapel?.nama_mapel}</td><td>{n.materi?.nama_materi}</td>
                <td>{n.jenis?.kategori_penilaian}{n.tipe_nilai === "REMEDIAL" && <span className="badge text-bg-warning ms-1">Remedial</span>}</td>
                <td className="text-end fw-semibold">{Number(n.nilai)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <ul className="list-group list-group-flush small">
      {data.map((j) => {
        const total = Number(j.val_S) + Number(j.val_T) + Number(j.val_N) + Number(j.val_K) + Number(j.val_M);
        return (
          <li key={j.id_jurnal} className="list-group-item px-0">
            <div className="d-flex gap-2">
              <span className={`badge ${total >= 0 ? "text-bg-success" : "text-bg-warning"}`}>{total >= 0 ? "Positif" : "Perlu perhatian"}</span>
              <span className="text-muted">{tgl(j.tanggal)} · {j.guru?.nama_guru || "-"}</span>
            </div>
            <div>{j.narasi_kejadian || <span className="fst-italic text-muted">Catatan bersifat rahasia.</span>}</div>
          </li>
        );
      })}
    </ul>
  );
}

function KartuSemester({ s, idSiswa }) {
  const [buka, setBuka] = useState("");
  const p = s.presensi;
  return (
    <section className="card border-0 shadow-sm mb-3 kartu-semester" aria-labelledby={`sem-${s.id_periode}`}>
      <div className="card-header bg-white d-flex flex-wrap align-items-center gap-2">
        <h2 id={`sem-${s.id_periode}`} className="h6 fw-bold mb-0 me-auto">
          {s.tahun_ajaran} · Semester {s.semester}
          {s.aktif && <span className="badge text-bg-success ms-2">Aktif</span>}
        </h2>
        <span className="small"><b>{s.nama_kelas || s.id_kelas}</b> · Wali kelas: {s.wali_kelas || "-"}</span>
      </div>
      <div className="card-body">
        <div className="row g-3 small">
          <div className="col-md-7">
            <div className="fw-semibold mb-1">
              Nilai per mata pelajaran {s.rata_rata !== null && <span className="text-muted fw-normal">(rata-rata {s.rata_rata}{s.di_bawah_kkm ? `, ${s.di_bawah_kkm} di bawah KKM` : ""})</span>}
            </div>
            {s.mapel.length ? (
              <table className="table table-sm mb-0">
                <thead><tr><th scope="col">Mapel</th><th scope="col" className="text-center">KKM</th><th scope="col" className="text-center">Rata-rata</th><th scope="col" className="text-center">Penilaian</th></tr></thead>
                <tbody>
                  {s.mapel.map((m) => (
                    <tr key={m.id_mapel} className={m.rata < m.kkm ? "table-warning" : ""}>
                      <td>{m.nama_mapel}</td><td className="text-center">{m.kkm}</td><td className="text-center fw-semibold">{m.rata}</td><td className="text-center">{m.jumlah}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <div className="text-muted">Belum ada nilai.</div>}
          </div>
          <div className="col-md-5">
            <dl className="row mb-0">
              <dt className="col-6">Kehadiran</dt><dd className="col-6">H {p.hadir} · S {p.sakit} · I {p.izin} · A {p.alpa}</dd>
              <dt className="col-6">Jurnal</dt><dd className="col-6">{s.jurnal.jumlah} ({s.jurnal.positif} positif, {s.jurnal.perlu_perhatian} perlu perhatian)</dd>
              <dt className="col-6">Pembinaan kehadiran</dt><dd className="col-6">{s.pembinaan}</dd>
              <dt className="col-6">Proyek P5</dt><dd className="col-6">{s.p5}</dd>
              {s.portofolio > 0 && (<><dt className="col-6">Karya portofolio</dt><dd className="col-6">{s.portofolio}</dd></>)}
              {s.kenaikan && (<><dt className="col-6">Keputusan</dt><dd className="col-6 fw-semibold">{KEPUTUSAN[s.kenaikan.keputusan]}{s.kenaikan.ke_tingkat && s.kenaikan.keputusan !== "LULUS" ? ` (ke tingkat ${s.kenaikan.ke_tingkat})` : ""}</dd></>)}
            </dl>
            {s.catatan_wali && <blockquote className="border-start border-3 ps-2 mt-2 mb-0 text-muted">{s.catatan_wali}</blockquote>}
          </div>
        </div>
        <div className="d-flex flex-wrap gap-2 mt-3 d-print-none">
          <button type="button" className={`btn btn-sm ${buka === "nilai" ? "btn-primary" : "btn-outline-primary"}`} aria-expanded={buka === "nilai"} onClick={() => setBuka(buka === "nilai" ? "" : "nilai")}>
            <i className="bi bi-list-ol me-1" aria-hidden="true"></i>Nilai harian
          </button>
          <button type="button" className={`btn btn-sm ${buka === "jurnal" ? "btn-primary" : "btn-outline-primary"}`} aria-expanded={buka === "jurnal"} onClick={() => setBuka(buka === "jurnal" ? "" : "jurnal")}>
            <i className="bi bi-journal-text me-1" aria-hidden="true"></i>Jurnal
          </button>
          <Link className="btn btn-sm btn-outline-secondary" href={`/dashboard/portal?siswa=${encodeURIComponent(idSiswa)}&periode=${encodeURIComponent(s.id_periode)}&tab=rapor`}>
            <i className="bi bi-file-earmark-richtext me-1" aria-hidden="true"></i>Rapor semester ini
          </Link>
        </div>
        {buka && <div className="mt-2 border-top pt-2"><Rincian idSiswa={idSiswa} idPeriode={s.id_periode} jenis={buka} /></div>}
      </div>
    </section>
  );
}

function Lintasan({ data }) {
  const d = data?.deret || [];
  if (d.filter((x) => x.rata !== null || x.kehadiran !== null).length < 2) return null;
  const config = {
    type: "line",
    data: {
      labels: d.map((x) => [x.label, x.nama_kelas || ""]),
      datasets: [
        { label: "Rata-rata nilai", data: d.map((x) => x.rata), borderColor: "#3b82f6", backgroundColor: "#3b82f6", tension: 0.25, spanGaps: true },
        { label: "Kehadiran (%)", data: d.map((x) => x.kehadiran), borderColor: "#10b981", backgroundColor: "#10b981", borderDash: [5, 3], tension: 0.25, spanGaps: true },
      ],
    },
    options: { responsive: true, maintainAspectRatio: false, scales: { y: { suggestedMin: 50, max: 100 } } },
  };
  return (
    <section className="card border-0 shadow-sm mb-3 kartu-semester" aria-labelledby="judul-lintasan">
      <div className="card-header bg-white d-flex flex-wrap align-items-center gap-2">
        <h2 id="judul-lintasan" className="h6 fw-bold mb-0 me-auto">Lintasan nilai & kehadiran</h2>
        {data.turun_berturut && <span className="badge text-bg-danger"><i className="bi bi-graph-down-arrow me-1" aria-hidden="true"></i>Turun 2 semester berturut-turut</span>}
      </div>
      <div className="card-body"><ChartCanvas config={config} height={220} /></div>
    </section>
  );
}

function RekamJejakIsi() {
  const params = useSearchParams();
  const idSiswa = params.get("siswa") || "";
  const [data, setData] = useState(null);
  const [galat, setGalat] = useState("");

  useEffect(() => {
    if (!idSiswa) { setGalat("Pilih siswa dari Data Sekolah → Siswa (⋮ → Rekam jejak) atau dari portal."); return; }
    ambil(`/siswa/${encodeURIComponent(idSiswa)}/rekam-jejak`).then(setData).catch((e) => setGalat(e.message));
  }, [idSiswa]);

  if (galat) return <div className="alert alert-warning m-3">{galat}</div>;
  if (!data) return <div className="p-4 text-muted"><span className="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Memuat rekam jejak…</div>;

  const s = data.siswa;
  const sek = data.sekolah || {};
  const ortu = s.ortu || {};

  return (
    <div className="container-fluid py-3" style={{ maxWidth: 1000 }}>
      <style>{`@media print { .app-sidebar, .app-header, .d-print-none, nav.breadcrumb { display: none !important; } .kartu-semester { break-inside: avoid; box-shadow: none !important; border: 1px solid #ccc !important; } body { background: #fff !important; } }`}</style>
      <div className="d-flex flex-wrap align-items-center gap-2 mb-3 d-print-none">
        <h1 className="h4 fw-bold mb-0 me-auto"><i className="bi bi-clock-history me-2 text-primary" aria-hidden="true"></i>Rekam Jejak Siswa</h1>
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => window.print()}><i className="bi bi-printer me-1" aria-hidden="true"></i>Cetak buku induk</button>
      </div>
      <div className="d-none d-print-block text-center mb-3">
        <div className="fw-bold fs-5">BUKU INDUK PESERTA DIDIK</div>
        <div>{sek.nama_sekolah}{sek.npsn ? ` · NPSN ${sek.npsn}` : ""}</div>
        <div className="small">{sek.alamat_sekolah}{sek.kota ? `, ${sek.kota}` : ""}</div>
      </div>

      <section className="card border-0 shadow-sm mb-3 kartu-semester" aria-label="Biodata">
        <div className="card-body d-flex flex-wrap gap-3">
          <div style={{ width: 96, height: 128 }} className="border rounded bg-light d-flex align-items-center justify-content-center overflow-hidden flex-shrink-0">
            {s.foto_url ? <img src={s.foto_url} alt={`Pas foto ${s.nama_siswa}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <i className="bi bi-person fs-1 text-muted" aria-hidden="true"></i>}
          </div>
          <dl className="row small mb-0 flex-grow-1">
            <dt className="col-sm-4">Nama</dt><dd className="col-sm-8 fw-bold">{s.nama_siswa}{s.panggilan ? ` (${s.panggilan})` : ""}</dd>
            <dt className="col-sm-4">NISN</dt><dd className="col-sm-8">{s.nisn || "-"}</dd>
            <dt className="col-sm-4">Tempat, tanggal lahir</dt><dd className="col-sm-8">{s.tempat_lahir || "-"}, {tgl(s.tgl_lahir)}</dd>
            <dt className="col-sm-4">Jenis kelamin · Agama</dt><dd className="col-sm-8">{s.jenis_kelamin === "P" ? "Perempuan" : "Laki-laki"} · {s.agama?.nama_agama || "-"}</dd>
            <dt className="col-sm-4">Orang tua</dt><dd className="col-sm-8">{[ortu.nama_ayah, ortu.nama_ibu].filter(Boolean).join(" & ") || "-"}</dd>
            {s.sekolah_asal && (<><dt className="col-sm-4">Sekolah asal</dt><dd className="col-sm-8">{s.sekolah_asal.nama_sekolah}</dd></>)}
            <dt className="col-sm-4">Kelas sekarang · Status</dt>
            <dd className="col-sm-8">{s.kelas?.nama_kelas || "-"} · {STATUS[s.status_siswa] || s.status_siswa}{s.tanggal_status && s.status_siswa !== "aktif" ? ` sejak ${tgl(s.tanggal_status)}` : ""}{s.keterangan_status ? ` (${s.keterangan_status})` : ""}</dd>
          </dl>
        </div>
      </section>

      <Lintasan data={data.lintasan} />

      <PortofolioSiswa idSiswa={idSiswa} namaSiswa={s.nama_siswa} cetak />

      {data.semester.length === 0 ? (
        <div className="alert alert-light border">Belum ada riwayat semester untuk siswa ini.</div>
      ) : data.semester.map((sem) => <KartuSemester key={sem.id_periode} s={sem} idSiswa={idSiswa} />)}

      <p className="small text-muted d-print-none">
        Rata-rata per mapel dihitung dari seluruh penilaian semester itu (remedial dibatasi KKM bila diatur sekolah). Nilai akhir resmi tetap mengikuti rapor tiap semester.
      </p>
    </div>
  );
}

export default function RekamJejakPage() {
  return <Suspense fallback={null}><RekamJejakIsi /></Suspense>;
}
