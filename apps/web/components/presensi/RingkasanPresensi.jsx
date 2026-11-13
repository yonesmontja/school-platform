"use client";
// Kartu ringkasan presensi kelas pada semester terpilih: presensi terakhir yang diisi (bisa dibuka),
// hari sekolah yang belum diisi, rekap kehadiran, dan siswa yang perlu perhatian. Dihitung dari data yang sudah dimuat.
import { useEffect, useMemo, useState } from "react";
import { muatHariLibur } from "@/app/lib/hariSekolah";

const STATUS = [
  { value: "HADIR", label: "Hadir", color: "success" },
  { value: "SAKIT", label: "Sakit", color: "warning" },
  { value: "IZIN", label: "Izin", color: "info" },
  { value: "ALPA", label: "Alpa", color: "danger" },
];
const KUNCI_LIPAT = "ringkasanPresensiTerlipat";
const BATAS_HADIR = 85; // % kehadiran di bawah ini ditandai perlu perhatian

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const keTanggal = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const singkat = (s) => keTanggal(s).toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short" });
const panjang = (s) => keTanggal(s).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const selisihHari = (s) => Math.round((new Date(new Date().toDateString()) - keTanggal(s)) / 86400000);
const relatif = (s) => { const h = selisihHari(s); return h === 0 ? "hari ini" : h === 1 ? "kemarin" : `${h} hari lalu`; };

/** props: students [{id_siswa, nama_siswa}], presensi [{tanggal, id_siswa, status_kehadiran}], tanggal (terpilih), onPilihTanggal(ymd), namaKelas */
export default function RingkasanPresensi({ students, presensi, tanggal, onPilihTanggal, namaKelas }) {
  const [terlipat, setTerlipat] = useState(false);
  const [libur, setLibur] = useState(new Map());
  useEffect(() => { try { setTerlipat(localStorage.getItem(KUNCI_LIPAT) === "1"); } catch { /* storage diblokir */ } }, []);
  const lipat = () => setTerlipat((v) => { try { localStorage.setItem(KUNCI_LIPAT, v ? "0" : "1"); } catch { /* abaikan */ } return !v; });

  // Hari libur tahun ini & tahun lalu (untuk 3 minggu terakhir yang melewati pergantian tahun)
  useEffect(() => {
    const th = new Date().getFullYear();
    Promise.all([muatHariLibur(th), muatHariLibur(th - 1)]).then(([a, b]) => setLibur(new Map([...b, ...a])));
  }, []);

  const r = useMemo(() => {
    const perTanggal = new Map();
    for (const p of presensi) {
      const t = String(p.tanggal).slice(0, 10);
      if (!perTanggal.has(t)) perTanggal.set(t, { HADIR: 0, SAKIT: 0, IZIN: 0, ALPA: 0, total: 0 });
      const x = perTanggal.get(t); x[p.status_kehadiran]++; x.total++;
    }
    const tanggalTercatat = [...perTanggal.keys()].sort().reverse();
    const total = { HADIR: 0, SAKIT: 0, IZIN: 0, ALPA: 0 };
    const perSiswa = new Map(students.map((s) => [s.id_siswa, { ...s, HADIR: 0, SAKIT: 0, IZIN: 0, ALPA: 0, n: 0 }]));
    for (const p of presensi) {
      total[p.status_kehadiran]++;
      const s = perSiswa.get(p.id_siswa); if (s) { s[p.status_kehadiran]++; s.n++; }
    }
    const semua = total.HADIR + total.SAKIT + total.IZIN + total.ALPA;
    const perhatian = [...perSiswa.values()].filter((s) => s.n)
      .map((s) => ({ ...s, persen: Math.round((s.HADIR / s.n) * 100) }))
      .filter((s) => s.persen < BATAS_HADIR || s.ALPA >= 3)
      .sort((a, b) => a.persen - b.persen || b.ALPA - a.ALPA);

    // Hari sekolah (Senin–Sabtu, bukan libur) dalam 3 minggu terakhir yang belum diisi, sejak presensi pertama semester ini
    const pertama = tanggalTercatat[tanggalTercatat.length - 1];
    const belum = [];
    if (pertama) {
      const d = new Date(new Date().toDateString());
      for (let i = 0; i < 21; i++, d.setDate(d.getDate() - 1)) {
        const t = ymd(d);
        if (t < pertama) break;
        if (d.getDay() !== 0 && !libur.has(t) && !perTanggal.has(t)) belum.push(t);
      }
    }
    // Hari dengan sebagian siswa saja yang tercatat
    const tidakLengkap = tanggalTercatat.filter((t) => perTanggal.get(t).total < students.length).slice(0, 3);
    return { perTanggal, tanggalTercatat, total, semua, perhatian, belum, tidakLengkap };
  }, [students, presensi, libur]);

  const terakhir = r.tanggalTercatat[0];
  const rekapTerakhir = terakhir && r.perTanggal.get(terakhir);
  const persenHadir = r.semua ? Math.round((r.total.HADIR / r.semua) * 100) : 0;

  return (
    <div className="card shadow-sm mb-3 border-0" data-testid="ringkasan-presensi">
      <div className="card-header bg-body-tertiary d-flex flex-wrap align-items-center gap-2 py-2">
        <h3 className="card-title fs-6 fw-semibold mb-0 me-auto"><i className="bi bi-calendar2-check text-primary me-2"></i>Ringkasan presensi{namaKelas ? ` · ${namaKelas}` : ""}</h3>
        <button type="button" className="btn btn-sm btn-link text-decoration-none p-0" onClick={lipat} aria-expanded={!terlipat}>
          {terlipat ? <>Tampilkan <i className="bi bi-chevron-down"></i></> : <>Sembunyikan <i className="bi bi-chevron-up"></i></>}
        </button>
      </div>
      {!terlipat && (
        <div className="card-body p-3">
          {!terakhir ? (
            <div className="text-muted small"><i className="bi bi-info-circle me-1"></i>Belum ada presensi kelas ini pada semester ini. Presensi pertama Anda akan tampil di sini.</div>
          ) : (
            <div className="row g-3">
              <div className="col-12 col-lg-5">
                <div className="small fw-semibold text-uppercase text-muted mb-2" style={{ letterSpacing: ".04em" }}>Presensi terakhir</div>
                <button type="button" className={`card w-100 text-start shadow-sm mb-2 p-0 ${terakhir === tanggal ? "border-primary bg-primary-subtle" : "border-primary border-opacity-50"}`} onClick={() => onPilihTanggal(terakhir)}>
                  <div className="card-body p-3">
                    <div className="d-flex justify-content-between gap-2">
                      <div><div className="fw-bold">{panjang(terakhir)}</div><div className="small text-muted">{relatif(terakhir)} · {rekapTerakhir.total}/{students.length} siswa tercatat</div></div>
                      <span className="badge text-bg-primary align-self-start">Buka <i className="bi bi-arrow-right"></i></span>
                    </div>
                    <div className="d-flex flex-wrap gap-2 mt-2">
                      {STATUS.map((s) => <span key={s.value} className={`badge text-bg-${s.color} ${rekapTerakhir[s.value] ? "" : "opacity-50"}`}>{s.label} {rekapTerakhir[s.value]}</span>)}
                    </div>
                  </div>
                </button>
                {r.belum.length > 0 && (
                  <div className="alert alert-warning small py-2 px-3 mb-2">
                    <div className="fw-semibold mb-1"><i className="bi bi-exclamation-triangle me-1"></i>{r.belum.length} hari sekolah dalam 3 minggu terakhir belum diisi</div>
                    <div className="d-flex flex-wrap gap-1">
                      {r.belum.slice(0, 8).map((t) => <button type="button" key={t} className="btn btn-sm btn-outline-warning py-0 px-2 text-body" onClick={() => onPilihTanggal(t)}>{singkat(t)}</button>)}
                    </div>
                  </div>
                )}
                {r.tidakLengkap.length > 0 && (
                  <div className="small text-warning-emphasis mb-2">
                    <i className="bi bi-hourglass-split me-1"></i>Belum lengkap:{" "}
                    {r.tidakLengkap.map((t) => <button type="button" key={t} className="btn btn-link btn-sm p-0 me-2 align-baseline" onClick={() => onPilihTanggal(t)}>{singkat(t)} ({r.perTanggal.get(t).total}/{students.length})</button>)}
                  </div>
                )}
                <div className="list-group list-group-flush small">
                  {r.tanggalTercatat.slice(1, 6).map((t) => {
                    const x = r.perTanggal.get(t);
                    return (
                      <button type="button" key={t} className={`list-group-item list-group-item-action px-2 py-2 d-flex gap-2 align-items-center ${t === tanggal ? "active" : ""}`} onClick={() => onPilihTanggal(t)}>
                        <span className="me-auto">{singkat(t)}</span>
                        {x.SAKIT + x.IZIN + x.ALPA === 0 ? <span className="text-success">semua hadir</span>
                          : STATUS.slice(1).filter((s) => x[s.value]).map((s) => <span key={s.value} className={`badge text-bg-${s.color}`}>{s.label[0]} {x[s.value]}</span>)}
                        <i className="bi bi-chevron-right text-muted"></i>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="col-12 col-lg-7">
                <div className="small fw-semibold text-uppercase text-muted mb-2" style={{ letterSpacing: ".04em" }}>Rekap semester ini</div>
                <div className="row g-2 text-center mb-2">
                  <div className="col-6 col-md-3"><div className="border rounded-3 p-2 h-100"><div className="fs-5 fw-bold">{r.tanggalTercatat.length}</div><div className="small text-muted">hari tercatat</div></div></div>
                  <div className="col-6 col-md-3"><div className="border rounded-3 p-2 h-100"><div className={`fs-5 fw-bold text-${persenHadir >= 90 ? "success" : persenHadir >= BATAS_HADIR ? "warning" : "danger"}`}>{persenHadir}%</div><div className="small text-muted">kehadiran kelas</div></div></div>
                  <div className="col-6 col-md-3"><div className="border rounded-3 p-2 h-100"><div className="fs-5 fw-bold text-warning">{r.total.SAKIT + r.total.IZIN}</div><div className="small text-muted">sakit + izin</div></div></div>
                  <div className="col-6 col-md-3"><div className="border rounded-3 p-2 h-100"><div className="fs-5 fw-bold text-danger">{r.total.ALPA}</div><div className="small text-muted">alpa</div></div></div>
                </div>
                <div className="progress mb-3" style={{ height: 10 }} aria-label="Komposisi kehadiran">
                  {STATUS.map((s) => r.total[s.value] > 0 && (
                    <div key={s.value} className={`progress-bar bg-${s.color}`} style={{ width: `${(r.total[s.value] / r.semua) * 100}%` }} title={`${s.label}: ${r.total[s.value]}`}></div>
                  ))}
                </div>
                <div className="small fw-semibold mb-1"><i className="bi bi-person-exclamation text-danger me-1"></i>Perlu perhatian (kehadiran &lt; {BATAS_HADIR}% atau alpa ≥ 3)</div>
                {r.perhatian.length ? (
                  <div className="d-flex flex-column gap-1">
                    {r.perhatian.slice(0, 8).map((s) => (
                      <div key={s.id_siswa} className="d-flex align-items-center gap-2 small">
                        <span className="text-truncate" style={{ minWidth: 0, flex: "0 0 40%" }} title={s.nama_siswa}>{s.nama_siswa}</span>
                        <div className="progress flex-grow-1" style={{ height: 6 }}><div className={`progress-bar bg-${s.persen >= BATAS_HADIR ? "warning" : "danger"}`} style={{ width: `${s.persen}%` }}></div></div>
                        <span className="text-nowrap">{s.persen}%</span>
                        <span className="text-nowrap text-muted">A {s.ALPA} · S {s.SAKIT} · I {s.IZIN}</span>
                      </div>
                    ))}
                  </div>
                ) : <div className="small text-success"><i className="bi bi-check-circle me-1"></i>Kehadiran semua siswa baik.</div>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
