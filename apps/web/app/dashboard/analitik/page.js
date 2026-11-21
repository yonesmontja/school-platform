"use client";
// Analitik lintas semester: tren nilai per semester & mapel, TP yang lemah lintas angkatan (tanda cara mengajarnya perlu
// ditinjau), perbandingan rombel setingkat, siswa yang menurun dua semester berturut-turut, dan saran pengajaran ulang AI.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Swal from "sweetalert2";
import { minta } from "@/components/banksoal/api";
import { bacaAiMode } from "@/components/banksoal/konstanta";
import { PilihAI } from "@/components/referensi/AsistenMateri";
import { ChartCanvas } from "@/components/dashboard/ChartCard";

const PALET = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#64748b"];
const labelSem = (s) => `${s.tahun_ajaran} ${s.semester}`;

function Kpi({ ikon, warna, angka, label, ket }) {
  return (
    <div className="col-6 col-lg">
      <div className="card border-0 shadow-sm h-100">
        <div className="card-body py-2">
          <div className="d-flex align-items-center gap-2">
            <i className={`bi ${ikon} fs-4 text-${warna}`} aria-hidden="true"></i>
            <div className="fs-4 fw-bold">{angka}</div>
          </div>
          <div className="small fw-semibold">{label}</div>
          {ket && <div className="small text-muted">{ket}</div>}
        </div>
      </div>
    </div>
  );
}

function grafikTren(data) {
  const sem = data.semester;
  if (!sem.length) return null;
  if (sem.length === 1) {
    // Baru satu semester: bandingkan mapel (rata-rata & % tuntas)
    const s = sem[0].id_periode;
    const m = data.tren_mapel.filter((x) => x.per_semester[s]);
    return {
      judul: `Rata-rata dan ketuntasan per mapel · ${labelSem(sem[0])}`,
      config: {
        type: "bar",
        data: {
          labels: m.map((x) => x.nama_mapel),
          datasets: [
            { label: "Rata-rata", data: m.map((x) => x.per_semester[s].rata), backgroundColor: "#3b82f6" },
            { label: "% siswa tuntas", data: m.map((x) => x.per_semester[s].tuntas), backgroundColor: "#10b981" },
          ],
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { min: 0, max: 100 } } },
      },
    };
  }
  return {
    judul: "Tren rata-rata per mapel antarsemester",
    config: {
      type: "line",
      data: {
        labels: sem.map(labelSem),
        datasets: [
          { label: "Semua mapel", data: sem.map((s) => s.rata), borderColor: "#111827", backgroundColor: "#111827", borderWidth: 3, tension: 0.25 },
          ...data.tren_mapel.map((m, i) => ({
            label: m.nama_mapel, data: sem.map((s) => m.per_semester[s.id_periode]?.rata ?? null),
            borderColor: PALET[i % PALET.length], backgroundColor: PALET[i % PALET.length], borderDash: [5, 3], tension: 0.25, spanGaps: true,
          })),
        ],
      },
      options: { responsive: true, maintainAspectRatio: false, scales: { y: { suggestedMin: 50, suggestedMax: 100 } } },
    },
  };
}

function SaranAI({ tp }) {
  const [aiMode, setAiMode] = useState(bacaAiMode);
  const [sibuk, setSibuk] = useState(false);
  const [hasil, setHasil] = useState(null);
  const jalan = async (mode) => {
    setSibuk(true);
    try {
      const r = await minta("POST", "/analitik/saran-tp", { kunci: tp.kunci, ai_mode: mode });
      setHasil(r.data);
    } catch (e) {
      Swal.fire("Saran belum tersedia", e.message, "warning");
    } finally {
      setSibuk(false);
    }
  };
  const Daftar = ({ judul, isi }) => (isi?.length ? (
    <div className="mb-2"><div className="fw-semibold">{judul}</div><ul className="mb-0 ps-3">{isi.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
  ) : null);
  return (
    <div className="border rounded p-2 bg-body-tertiary">
      <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
        <span className="fw-semibold small me-auto"><i className="bi bi-stars me-1 text-primary" aria-hidden="true"></i>Saran pengajaran ulang</span>
        <PilihAI aiMode={aiMode} setAiMode={setAiMode} />
        <button type="button" className="btn btn-sm btn-primary" disabled={sibuk} onClick={() => jalan(aiMode)}>
          {sibuk ? <span className="spinner-border spinner-border-sm me-1" aria-hidden="true"></span> : <i className="bi bi-stars me-1" aria-hidden="true"></i>}Minta saran AI
        </button>
        <button type="button" className="btn btn-sm btn-outline-secondary" disabled={sibuk} onClick={() => jalan("LOKAL")} title="Saran umum dari aturan sederhana, tanpa AI">Tanpa AI</button>
      </div>
      {hasil ? (
        <div className="small">
          <p className="mb-2">{hasil.diagnosis}</p>
          <Daftar judul="Strategi" isi={hasil.strategi} />
          <Daftar judul="Ide kegiatan kelas" isi={hasil.aktivitas} />
          <Daftar judul="Asesmen formatif" isi={hasil.asesmen} />
          {hasil.untuk_rombel_rendah && <p className="mb-2"><b>Rombel yang tertinggal:</b> {hasil.untuk_rombel_rendah}</p>}
          <div className="text-muted">{hasil.mode === "LOKAL" ? "Disusun tanpa AI." : "Usulan AI; sesuaikan dengan kondisi kelas."} Data yang dikirim hanya angka agregat, tanpa nama siswa.</div>
        </div>
      ) : <div className="small text-muted">AI membaca pola nilai TP ini lintas angkatan dan rombel, lalu menyarankan strategi, kegiatan, dan asesmen formatif.</div>}
    </div>
  );
}

function BarisTp({ tp, ambang }) {
  const [buka, setBuka] = useState(false);
  const akhir = tp.per_semester[tp.per_semester.length - 1];
  return (
    <>
      <tr className={tp.selalu_rendah ? "table-danger" : tp.rendah_terakhir ? "table-warning" : ""}>
        <td>
          <button type="button" className="btn btn-link btn-sm p-0 text-start text-decoration-none" aria-expanded={buka} onClick={() => setBuka(!buka)}>
            <i className={`bi ${buka ? "bi-chevron-down" : "bi-chevron-right"} me-1`} aria-hidden="true"></i>{tp.nama_tp}
          </button>
          <div className="small text-muted">{tp.nama_mapel} · Tingkat {tp.tingkat ?? "-"} · {tp.semester}</div>
          <div className="d-flex flex-wrap gap-1 mt-1">
            {tp.selalu_rendah && <span className="badge text-bg-danger">Lemah di {tp.angkatan_lemah} angkatan</span>}
            {!tp.selalu_rendah && tp.rendah_terakhir && <span className="badge text-bg-warning">Lemah semester terakhir</span>}
            {tp.kesenjangan && <span className="badge text-bg-info">Selisih rombel {tp.selisih_rombel}</span>}
          </div>
        </td>
        <td className="small text-nowrap">
          {tp.per_semester.map((p) => (
            <div key={p.id_periode}><span className="text-muted">{p.tahun_ajaran}:</span> <b>{p.rata}</b> · {p.tuntas}% tuntas</div>
          ))}
        </td>
        <td className="text-center small">{tp.kkm}</td>
        <td className="text-center small">{akhir.siswa}</td>
      </tr>
      {buka && (
        <tr>
          <td colSpan={4}>
            <div className="row g-3">
              <div className="col-lg-5 small">
                <div className="fw-semibold mb-1">Per rombel · {akhir.tahun_ajaran} {akhir.semester}</div>
                {akhir.rombel.map((r) => (
                  <div key={r.id_kelas} className="mb-1">
                    <div className="d-flex justify-content-between"><span>{r.nama_kelas} ({r.siswa} siswa)</span><span><b>{r.rata}</b> · {r.tuntas}% tuntas</span></div>
                    <div className="progress" style={{ height: 6 }} role="progressbar" aria-label={`Ketuntasan ${r.nama_kelas}`} aria-valuenow={r.tuntas} aria-valuemin={0} aria-valuemax={100}>
                      <div className={`progress-bar ${r.tuntas < ambang.tuntas ? "bg-warning" : "bg-success"}`} style={{ width: `${r.tuntas}%` }}></div>
                    </div>
                  </div>
                ))}
                {tp.deskripsi && <div className="text-muted mt-2">Deskripsi: {tp.deskripsi}</div>}
                <div className="d-flex flex-wrap gap-2 mt-2">
                  <Link className="btn btn-sm btn-outline-primary" href={`/dashboard/bank-soal?id_mapel=${encodeURIComponent(tp.id_mapel)}&cari=${encodeURIComponent(tp.nama_tp.slice(0, 60))}`}>
                    <i className="bi bi-collection me-1" aria-hidden="true"></i>Soal di Bank Soal
                  </Link>
                  <Link className="btn btn-sm btn-outline-secondary" href="/dashboard/master-materi">
                    <i className="bi bi-journal-bookmark me-1" aria-hidden="true"></i>Materi & IKTP
                  </Link>
                </div>
              </div>
              <div className="col-lg-7"><SaranAI tp={tp} /></div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function AnalitikPage() {
  const [filter, setFilter] = useState({ id_mapel: "", tingkat: "" });
  const [data, setData] = useState(null);
  const [galat, setGalat] = useState("");
  const [tampil, setTampil] = useState("perhatian");
  const [cari, setCari] = useState("");

  useEffect(() => {
    setData(null); setGalat("");
    const q = new URLSearchParams(Object.entries(filter).filter(([, v]) => v)).toString();
    minta("GET", `/analitik/lintas-semester${q ? `?${q}` : ""}`).then(setData).catch((e) => setGalat(e.message));
  }, [filter]);

  const tren = useMemo(() => (data ? grafikTren(data) : null), [data]);
  const daftarTp = useMemo(() => {
    if (!data) return [];
    const c = cari.trim().toLowerCase();
    return data.tp.filter((t) => (tampil === "semua" || t.selalu_rendah || t.rendah_terakhir || t.kesenjangan)
      && (!c || `${t.nama_tp} ${t.nama_mapel}`.toLowerCase().includes(c)));
  }, [data, tampil, cari]);

  const r = data?.ringkasan;
  return (
    <div className="container-fluid py-3">
      <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
        <h1 className="h4 fw-bold mb-0 me-auto"><i className="bi bi-graph-up me-2 text-primary" aria-hidden="true"></i>Analitik Lintas Semester</h1>
        <select className="form-select form-select-sm w-auto" aria-label="Mata pelajaran" value={filter.id_mapel} onChange={(e) => setFilter({ ...filter, id_mapel: e.target.value })}>
          <option value="">Semua mapel</option>
          {(data?.pilihan.mapel || []).map((m) => <option key={m.id_mapel} value={m.id_mapel}>{m.nama_mapel}</option>)}
        </select>
        <select className="form-select form-select-sm w-auto" aria-label="Tingkat" value={filter.tingkat} onChange={(e) => setFilter({ ...filter, tingkat: e.target.value })}>
          <option value="">Semua tingkat</option>
          {(data?.pilihan.tingkat || []).map((t) => <option key={t} value={t}>Tingkat {t}</option>)}
        </select>
      </div>

      {galat && <div className="alert alert-warning">{galat}</div>}
      {!data && !galat && <div className="text-muted"><span className="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Menghitung analitik…</div>}

      {data && (
        <>
          <div className="row g-2 mb-3">
            <Kpi ikon="bi-calendar3" warna="secondary" angka={r.jumlah_semester} label="Semester bernilai" />
            <Kpi ikon="bi-exclamation-octagon" warna="danger" angka={r.tp_selalu_rendah} label="TP lemah lintas angkatan" ket="Tinjau cara mengajarnya" />
            <Kpi ikon="bi-exclamation-triangle" warna="warning" angka={r.tp_rendah_terakhir} label="TP lemah semester terakhir" ket={`Rata-rata < KKM atau tuntas < ${data.ambang.tuntas}%`} />
            <Kpi ikon="bi-distribute-vertical" warna="info" angka={r.tp_kesenjangan} label="Kesenjangan rombel" ket={`Selisih ≥ ${data.ambang.selisih_rombel} poin`} />
            <Kpi ikon="bi-graph-down-arrow" warna="danger" angka={r.siswa_turun} label="Siswa menurun" ket="2 semester berturut-turut" />
          </div>

          {r.jumlah_semester < 2 && (
            <div className="alert alert-info small">
              <i className="bi bi-info-circle me-1" aria-hidden="true"></i>
              Baru ada nilai dari {r.jumlah_semester} semester. TP lemah dan perbandingan rombel sudah bisa dipakai. Tren antarsemester akan muncul setelah semester berikutnya.
              TP yang selalu lemah di setiap angkatan akan terlihat mulai tahun ajaran depan, karena TP yang sama dibandingkan per tingkat dan per Ganjil/Genap. Siswa menurun perlu minimal 3 semester.
            </div>
          )}

          {tren && (
            <section className="card border-0 shadow-sm mb-3" aria-label={tren.judul}>
              <div className="card-header bg-white fw-semibold small">{tren.judul}</div>
              <div className="card-body"><ChartCanvas config={tren.config} height={300} /></div>
            </section>
          )}

          <section className="card border-0 shadow-sm mb-3" aria-labelledby="judul-tp">
            <div className="card-header bg-white d-flex flex-wrap align-items-center gap-2">
              <h2 id="judul-tp" className="h6 fw-bold mb-0 me-auto">Ketercapaian TP</h2>
              <input type="search" className="form-control form-control-sm" style={{ maxWidth: 220 }} placeholder="Cari TP…" aria-label="Cari TP" value={cari} onChange={(e) => setCari(e.target.value)} />
              <div className="btn-group btn-group-sm" role="group" aria-label="Tampilkan TP">
                <button type="button" className={`btn ${tampil === "perhatian" ? "btn-primary" : "btn-outline-primary"}`} aria-pressed={tampil === "perhatian"} onClick={() => setTampil("perhatian")}>Perlu perhatian</button>
                <button type="button" className={`btn ${tampil === "semua" ? "btn-primary" : "btn-outline-primary"}`} aria-pressed={tampil === "semua"} onClick={() => setTampil("semua")}>Semua ({data.tp.length})</button>
              </div>
            </div>
            <div className="table-responsive">
              <table className="table table-sm align-middle mb-0">
                <thead className="table-light small">
                  <tr><th scope="col">TP</th><th scope="col">Per angkatan</th><th scope="col" className="text-center">KKM</th><th scope="col" className="text-center">Siswa</th></tr>
                </thead>
                <tbody>
                  {daftarTp.map((tp) => <BarisTp key={tp.kunci} tp={tp} ambang={data.ambang} />)}
                  {!daftarTp.length && <tr><td colSpan={4} className="text-center text-muted small py-3">Tidak ada TP yang cocok.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="card-footer bg-white small text-muted">
              Nilai efektif: remedial menggantikan nilai asal, asesmen diagnostik tidak dihitung. Tiap siswa dihitung sekali per TP (rata-rata penilaiannya).
              TP yang sama lintas angkatan dicocokkan dari mapel, tingkat, semester, dan nama TP.
            </div>
          </section>

          <section className="card border-0 shadow-sm mb-3" aria-labelledby="judul-turun">
            <div className="card-header bg-white"><h2 id="judul-turun" className="h6 fw-bold mb-0">Siswa yang menurun dua semester berturut-turut</h2></div>
            <div className="card-body">
              {data.siswa_turun.length ? (
                <div className="table-responsive">
                  <table className="table table-sm small mb-0">
                    <thead><tr><th scope="col">Siswa</th><th scope="col">Kelas</th><th scope="col">Rata-rata per semester</th><th scope="col" className="text-center">Turun</th><th scope="col" className="text-center">Kehadiran</th><th scope="col"></th></tr></thead>
                    <tbody>
                      {data.siswa_turun.map((s) => (
                        <tr key={s.id_siswa}>
                          <td className="fw-semibold">{s.nama_siswa}</td><td>{s.nama_kelas || "-"}</td>
                          <td>{s.deret.slice(-3).map((d) => d.rata).join(" → ")}</td>
                          <td className="text-center text-danger fw-semibold">−{s.turun}</td>
                          <td className="text-center">{s.kehadiran === null ? "-" : `${s.kehadiran}%`}</td>
                          <td className="text-end"><Link href={`/dashboard/rekam-jejak?siswa=${encodeURIComponent(s.id_siswa)}`} className="btn btn-sm btn-outline-primary">Rekam jejak</Link></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="small text-muted">
                  {r.jumlah_semester < 3 ? "Perlu nilai minimal 3 semester untuk melihat penurunan berturut-turut." : `Tidak ada siswa yang rata-ratanya turun dua semester berturut-turut (≥ ${data.ambang.turun_min} poin).`}
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
