"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Swal from "sweetalert2";
import { API_URL, authHeaders, useAkses } from "@/app/lib/akses";
import {
  DIMENSI, RAPOR_CSS, PREVIEW_CSS, hitungRapor, tanggalPanjang, todayYmd,
  Sampul, Biodata, Akademik, RaporP5,
} from "@/components/rapor/raporDokumen";

// Mode Hibrida (STNKM) dengan bobot rata, sama dengan bawaan halaman Cetak Rapor
const MODE_PORTAL = "2";
const BOBOT_RATA = { S: 1, T: 1, N: 1, K: 1, M: 1 };

const TAB = [
  { id: "ringkasan", label: "Ringkasan", icon: "bi-grid-1x2" },
  { id: "nilai", label: "Nilai", icon: "bi-journal-check" },
  { id: "presensi", label: "Kehadiran", icon: "bi-calendar-check" },
  { id: "jurnal", label: "Catatan Positif", icon: "bi-stars" },
  { id: "rapor", label: "Rapor", icon: "bi-file-earmark-richtext" },
];
const STATUS_WARNA = { HADIR: "success", SAKIT: "warning", IZIN: "info", ALPA: "danger" };

async function ambil(path) {
  const res = await fetch(`${API_URL}${path}`, { headers: authHeaders(false) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Gagal memuat (status ${res.status}).`);
  return data;
}

const warnaNilai = (nilai, kkm) => (nilai == null ? "secondary" : nilai >= 90 ? "success" : nilai >= kkm ? "primary" : "danger");

export default function PortalPage() {
  const { role, user } = useAkses();
  const [anak, setAnak] = useState([]);
  const [periodes, setPeriodes] = useState([]);
  const [idSiswa, setIdSiswa] = useState("");
  const [idPeriode, setIdPeriode] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [galat, setGalat] = useState("");
  const [tab, setTab] = useState("ringkasan");
  const previewRef = useRef(null);

  useEffect(() => {
    ambil("/portal/anak").then((d) => {
      setAnak(d.siswa || []);
      setPeriodes(d.periodes || []);
      if (d.siswa?.[0]) setIdSiswa(d.siswa[0].id_siswa);
      const aktif = (d.periodes || []).find((p) => p.status_aktif === "AKTIF") || d.periodes?.[0];
      if (aktif) setIdPeriode(aktif.id_periode);
      if (!d.siswa?.length) setLoading(false);
    }).catch((e) => { setGalat(e.message); setLoading(false); });
  }, []);

  useEffect(() => {
    if (!idSiswa || !idPeriode) return;
    setLoading(true);
    setGalat("");
    ambil(`/portal/rapor?${new URLSearchParams({ id_siswa: idSiswa, id_periode: idPeriode })}`)
      .then(setData)
      .catch((e) => { setData(null); setGalat(e.message); })
      .finally(() => setLoading(false));
  }, [idSiswa, idPeriode]);

  const rapor = useMemo(() => (data ? hitungRapor(data, idSiswa, MODE_PORTAL, BOBOT_RATA) : null), [data, idSiswa]);
  const siswa = anak.find((s) => s.id_siswa === idSiswa);

  // Rincian per penilaian (terbaru dulu) untuk tab Nilai
  const rincianNilai = useMemo(() => {
    if (!data) return [];
    const namaMapel = Object.fromEntries((data.subjects || []).map((m) => [m.id_mapel, m.nama_mapel]));
    return (data.nilai || []).filter((n) => n.id_siswa === idSiswa)
      .map((n) => ({ ...n, mapel: namaMapel[n.id_mapel] || "-" }))
      .sort((a, b) => String(b.tanggal).localeCompare(String(a.tanggal)));
  }, [data, idSiswa]);
  const presensiList = useMemo(() => (data?.presensi || []).filter((p) => p.id_siswa === idSiswa).sort((a, b) => String(b.tanggal).localeCompare(String(a.tanggal))), [data, idSiswa]);
  const jurnalPositif = useMemo(() => (data?.jurnal || []).filter((j) => j.id_siswa === idSiswa && j.positif && j.narasi_kejadian).sort((a, b) => String(b.tanggal).localeCompare(String(a.tanggal))), [data, idSiswa]);

  const totalHari = rapor ? Object.values(rapor.presensi).reduce((a, b) => a + b, 0) : 0;
  const persenHadir = totalHari ? Math.round((rapor.presensi.hadir / totalHari) * 100) : null;

  const cetak = () => {
    if (!previewRef.current || !rapor) return;
    const win = window.open("", "_blank", "width=1024,height=768");
    if (!win) return Swal.fire("Pop-up Diblokir", "Izinkan pop-up untuk situs ini agar jendela cetak bisa dibuka.", "warning");
    const judul = `Rapor_${rapor.siswa.nama_siswa}`.replace(/[^\w\-]+/g, "_");
    win.document.write(`<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><title>${judul}</title><style>
      @page { size: A4 portrait; margin: 15mm; }
      * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      body { margin: 0; }
      ${RAPOR_CSS}
    </style></head><body>${previewRef.current.innerHTML}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 800);
  };

  if (!loading && !galat && anak.length === 0) {
    return (
      <div className="container-fluid mt-4">
        <div className="card border-0 shadow-sm p-5 text-center">
          <i className="bi bi-person-x fs-1 text-muted mb-2"></i>
          <h5 className="fw-bold">Akun belum terhubung dengan data siswa</h5>
          <p className="text-muted mb-0">Hubungi admin sekolah agar akun Anda dikaitkan dengan data {role === "ortu" ? "anak Anda" : "siswa Anda"}.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container-fluid mt-4 mb-5">
      <style>{RAPOR_CSS + PREVIEW_CSS}</style>

      {/* SAMBUTAN & PILIHAN */}
      <div className="card border-0 shadow-sm mb-4 overflow-hidden">
        <div className="p-4 text-white" style={{ background: "linear-gradient(135deg, var(--app-accent), var(--app-accent-2))" }}>
          <div className="small opacity-75">{role === "ortu" ? "Portal Orang Tua" : "Portal Siswa"}</div>
          <h4 className="fw-bold mb-1">Halo, {user?.name}</h4>
          <div className="small opacity-75">Pantau perkembangan belajar {role === "ortu" ? "ananda" : "Anda"}: nilai, kehadiran, catatan positif, dan rapor.</div>
        </div>
        <div className="p-3 d-flex flex-wrap gap-3 align-items-end">
          {anak.length > 1 && (
            <div>
              <label className="form-label small fw-semibold mb-1">Anak</label>
              <select className="form-select form-select-sm" value={idSiswa} onChange={(e) => setIdSiswa(e.target.value)}>
                {anak.map((s) => <option key={s.id_siswa} value={s.id_siswa}>{s.nama_siswa}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="form-label small fw-semibold mb-1">Periode</label>
            <select className="form-select form-select-sm" value={idPeriode} onChange={(e) => setIdPeriode(e.target.value)}>
              {periodes.map((p) => <option key={p.id_periode} value={p.id_periode}>{p.tahun_ajaran} ({p.semester}){p.status_aktif === "AKTIF" ? " • Aktif" : ""}</option>)}
            </select>
          </div>
          {siswa && (
            <div className="ms-auto text-end small">
              <div className="fw-bold">{siswa.nama_siswa}</div>
              <div className="text-muted">{siswa.kelas?.nama_kelas || "Belum ada kelas"} · NISN {siswa.nisn || "-"}</div>
            </div>
          )}
        </div>
      </div>

      <ul className="nav nav-pills mb-3 gap-1 flex-nowrap overflow-auto">
        {TAB.map((t) => (
          <li className="nav-item" key={t.id}>
            <button type="button" className={`nav-link text-nowrap ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
              <i className={`bi ${t.icon} me-1`}></i>{t.label}
            </button>
          </li>
        ))}
      </ul>

      {galat && <div className="alert alert-warning"><i className="bi bi-exclamation-triangle me-2"></i>{galat}</div>}
      {loading ? (
        <div className="text-center text-muted py-5"><span className="spinner-border spinner-border-sm me-2"></span>Memuat data...</div>
      ) : rapor && (
        <>
          {tab === "ringkasan" && (
            <div className="row g-3">
              <div className="col-6 col-lg-3"><Stat label="Rata-rata nilai" nilai={rapor.rataUmum} icon="bi-graph-up" warna="primary" /></div>
              <div className="col-6 col-lg-3"><Stat label="Kehadiran" nilai={persenHadir == null ? "-" : `${persenHadir}%`} icon="bi-calendar-check" warna="success" sub={`${rapor.presensi.hadir} dari ${totalHari} hari`} /></div>
              <div className="col-6 col-lg-3"><Stat label="Catatan positif" nilai={jurnalPositif.length} icon="bi-stars" warna="warning" /></div>
              <div className="col-6 col-lg-3"><Stat label="Mapel dinilai" nilai={`${rapor.mapelRows.filter((m) => m.nilai != null).length}/${rapor.mapelRows.length}`} icon="bi-book" warna="info" /></div>

              <div className="col-lg-6">
                <div className="card border-0 shadow-sm h-100 p-4">
                  <h6 className="fw-bold mb-3">Profil STNKM</h6>
                  {DIMENSI.map((d) => (
                    <div key={d.key} className="mb-3">
                      <div className="d-flex justify-content-between small mb-1"><span className="fw-semibold">{d.label} <span className="text-muted">({d.key})</span></span><span className="fw-bold">{rapor.poinSTNKM[d.key]}</span></div>
                      <div className="progress" style={{ height: 8 }}><div className={`progress-bar bg-${d.color}`} style={{ width: `${Math.min(rapor.poinSTNKM[d.key], 100)}%` }}></div></div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="col-lg-6">
                <div className="card border-0 shadow-sm h-100 p-4">
                  <h6 className="fw-bold mb-3">Catatan Wali Kelas</h6>
                  <blockquote className="fst-italic text-body-secondary border-start border-4 ps-3 mb-3">{rapor.catatanTersimpan ? rapor.catatan : "Catatan wali kelas belum diisi untuk periode ini."}</blockquote>
                  <div className="small text-muted">Wali kelas: <b>{rapor.waliKelas?.nama_guru || "-"}</b></div>
                  {jurnalPositif[0] && (
                    <div className="mt-3 p-3 rounded bg-success-subtle small">
                      <div className="fw-semibold mb-1"><i className="bi bi-stars me-1"></i>Catatan positif terbaru · {tanggalPanjang(jurnalPositif[0].tanggal)}</div>
                      {jurnalPositif[0].narasi_kejadian}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {tab === "nilai" && (
            <div className="row g-3">
              <div className="col-lg-6">
                <div className="card border-0 shadow-sm p-3 h-100">
                  <h6 className="fw-bold mb-3">Nilai akhir per mata pelajaran</h6>
                  <table className="table table-sm align-middle mb-0">
                    <thead className="table-light"><tr><th>Mata pelajaran</th><th className="text-center">KKM</th><th className="text-center">Nilai</th></tr></thead>
                    <tbody>
                      {rapor.mapelRows.map((m) => (
                        <tr key={m.no}><td>{m.nama}</td><td className="text-center text-muted">{m.kkm}</td>
                          <td className="text-center"><span className={`badge text-bg-${warnaNilai(m.nilai, m.kkm)}`}>{m.nilai ?? "-"}</span></td></tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="small text-muted mt-2">Nilai akhir sementara; nilai resmi tercantum pada rapor yang dibagikan sekolah.</div>
                </div>
              </div>
              <div className="col-lg-6">
                <div className="card border-0 shadow-sm p-3 h-100">
                  <h6 className="fw-bold mb-3">Riwayat penilaian</h6>
                  {rincianNilai.length === 0 ? <div className="text-muted small">Belum ada penilaian.</div> : (
                    <div className="list-group list-group-flush" style={{ maxHeight: 460, overflowY: "auto" }}>
                      {rincianNilai.map((n) => (
                        <div key={n.id_nilai} className="list-group-item px-0 d-flex justify-content-between align-items-center">
                          <div className="small">
                            <div className="fw-semibold">{n.mapel}</div>
                            <div className="text-muted">{n.materi?.nama_materi || "-"} · {tanggalPanjang(n.tanggal)}</div>
                          </div>
                          <span className="badge text-bg-light border fs-6">{Math.round(n.nilai)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {tab === "presensi" && (
            <div className="row g-3">
              {["hadir", "sakit", "izin", "alpa"].map((k) => (
                <div className="col-6 col-lg-3" key={k}>
                  <Stat label={k[0].toUpperCase() + k.slice(1)} nilai={rapor.presensi[k]} icon="bi-calendar-event" warna={STATUS_WARNA[k.toUpperCase()]} sub="hari" />
                </div>
              ))}
              <div className="col-12">
                <div className="card border-0 shadow-sm p-3">
                  <h6 className="fw-bold mb-3">Riwayat kehadiran</h6>
                  {presensiList.length === 0 ? <div className="text-muted small">Belum ada data kehadiran pada periode ini.</div> : (
                    <div className="d-flex flex-wrap gap-2">
                      {presensiList.map((p) => (
                        <span key={p.tanggal} className={`badge rounded-pill text-bg-${STATUS_WARNA[p.status_kehadiran] || "secondary"} fw-normal`} title={p.status_kehadiran}>
                          {tanggalPanjang(p.tanggal)} · {p.status_kehadiran}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {tab === "jurnal" && (
            <div className="card border-0 shadow-sm p-3">
              <h6 className="fw-bold mb-1">Catatan positif dari guru</h6>
              <p className="small text-muted">Catatan perilaku dan prestasi baik yang dicatat guru di sekolah.</p>
              {jurnalPositif.length === 0 ? <div className="text-muted small">Belum ada catatan positif.</div> : (
                <div className="d-flex flex-column gap-2">
                  {jurnalPositif.map((j) => (
                    <div key={j.id_jurnal} className="p-3 rounded border-start border-4 border-success bg-body-tertiary">
                      <div className="small text-muted mb-1"><i className="bi bi-calendar3 me-1"></i>{tanggalPanjang(j.tanggal)}</div>
                      <div>{j.narasi_kejadian}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "rapor" && (
            <>
              <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
                <div className="small text-muted"><i className="bi bi-info-circle me-1"></i>Pratinjau rapor berdasarkan data terkini. Rapor resmi bertanda tangan dibagikan oleh sekolah.</div>
                <button className="btn btn-primary btn-sm fw-bold" onClick={cetak}><i className="bi bi-printer me-1"></i>Cetak / Simpan PDF</button>
              </div>
              <div className="rapor-preview" ref={previewRef}>
                <Sampul r={rapor} pecah />
                <Biodata r={rapor} tanggal={todayYmd()} pecah />
                <Akademik r={rapor} tanggal={todayYmd()} pecah={rapor.proyek.length > 0} />
                {rapor.proyek.map((p, i) => <RaporP5 key={p.id_proyek} r={rapor} proyek={p} urutan={i + 1} tanggal={todayYmd()} pecah={i < rapor.proyek.length - 1} />)}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, nilai, icon, warna, sub }) {
  return (
    <div className="card border-0 shadow-sm p-3 h-100">
      <div className="d-flex justify-content-between align-items-start">
        <div>
          <div className="small text-muted fw-semibold">{label}</div>
          <div className={`fs-3 fw-bold text-${warna}`}>{nilai}</div>
          {sub && <div className="small text-muted">{sub}</div>}
        </div>
        <span className={`rounded-3 p-2 bg-${warna}-subtle text-${warna}`}><i className={`bi ${icon} fs-5`}></i></span>
      </div>
    </div>
  );
}
