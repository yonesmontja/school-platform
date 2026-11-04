"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Swal from "sweetalert2";
import { API_URL, authHeaders, useAkses } from "@/app/lib/akses";
import {
  DIMENSI, RAPOR_CSS, PREVIEW_CSS, hitungRapor, tanggalPanjang, todayYmd, deskripsiIndikator,
  Sampul, Biodata, Akademik, RaporP5,
} from "@/components/rapor/raporDokumen";
import { ChartCanvas } from "@/components/dashboard/ChartCard";
import { OPSI_TINDAK_LANJUT } from "@/components/nilai/ModalTindakLanjut";
import { tingkatKktp, tingkatNilai } from "@/app/lib/kktp";

// Mode Hibrida (STNKM) dengan bobot rata, sama dengan bawaan halaman Cetak Rapor
const MODE_PORTAL = "2";
const BOBOT_RATA = { S: 1, T: 1, N: 1, K: 1, M: 1 };

const TAB = [
  { id: "ringkasan", label: "Ringkasan", icon: "bi-grid-1x2" },
  { id: "capaian", label: "Capaian TP", icon: "bi-bullseye" },
  { id: "nilai", label: "Nilai", icon: "bi-journal-check" },
  { id: "tindak", label: "Tindak Lanjut", icon: "bi-life-preserver" },
  { id: "jadwal", label: "Jadwal", icon: "bi-calendar-week" },
  { id: "presensi", label: "Kehadiran", icon: "bi-calendar-check" },
  { id: "jurnal", label: "Catatan Positif", icon: "bi-stars" },
  { id: "rapor", label: "Rapor", icon: "bi-file-earmark-richtext" },
];
const STATUS_WARNA = { HADIR: "success", SAKIT: "warning", IZIN: "info", ALPA: "danger" };
const PALET = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16", "#64748b"];
const HARI = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
// Cara orang tua mendampingi di rumah, per bentuk tindak lanjut (nama sama dengan OPSI_TINDAK_LANJUT)
const TIPS_RUMAH = {
  "Pengulangan Materi": "Ajak ananda menceritakan kembali apa yang dipelajari hari itu dengan kata-katanya sendiri.",
  "Tugas Tambahan": "Sediakan waktu dan tempat belajar yang tenang, lalu periksa bersama sebelum tugas dikumpulkan.",
  "Tes Ulang": "Bantu ananda mengulang latihan soal sedikit demi sedikit, dan pastikan istirahat cukup sebelum hari tes.",
  "Bimbingan Individual": "Tanyakan bagian mana yang masih sulit; sampaikan kepada guru bila ada kendala belajar di rumah.",
  "Tutor Sebaya": "Beri semangat agar ananda berani bertanya kepada teman, dan hargai setiap usahanya.",
  "Kelompok Kecil": "Tanyakan apa yang dikerjakan bersama kelompoknya dan apa yang sudah ia pahami.",
  "Media / Alat Peraga": "Gunakan benda sehari-hari untuk berlatih, misalnya potongan buah untuk belajar pecahan.",
};
const num = (v) => Number(v) || 0;
const rata = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const bulat = (v) => (v == null ? "-" : Number.isInteger(v) ? v : Number(v).toFixed(1));

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

  const tingkat = useMemo(() => tingkatKktp(data?.settings), [data]);
  const kkmMapel = useMemo(() => Object.fromEntries((data?.subjects || []).map((m) => [m.id_mapel, Number(m.kkm) || 75])), [data]);

  // Capaian per indikator (TP): nilai efektif = remedial terbaru, atau rata-rata nilai reguler; dikelompokkan mapel → materi
  const capaian = useMemo(() => {
    if (!data) return [];
    const namaMapel = Object.fromEntries((data.subjects || []).map((m) => [m.id_mapel, m.nama_mapel]));
    const baris = (data.nilai_indikator || []).filter((b) => b.id_siswa === idSiswa);
    const perMapel = new Map();
    baris.forEach((b) => {
      const m = perMapel.get(b.id_mapel) || { id_mapel: b.id_mapel, nama: namaMapel[b.id_mapel] || "-", kkm: kkmMapel[b.id_mapel] ?? 75, baris: [], ind: new Map() };
      m.baris.push(b);
      const i = m.ind.get(b.id_indikator) || { deskripsi: b.deskripsi, urutan: b.urutan, materi: b.nama_materi || "-", reguler: [], remedial: null };
      if (b.tipe_nilai === "REMEDIAL") i.remedial = num(b.nilai); else i.reguler.push(num(b.nilai));
      m.ind.set(b.id_indikator, i);
      perMapel.set(b.id_mapel, m);
    });
    return [...perMapel.values()].map((m) => {
      const indikator = [...m.ind.values()].map((i) => ({ ...i, nilai: i.remedial ?? rata(i.reguler), dariRemedial: i.remedial != null }))
        .sort((a, b) => a.materi.localeCompare(b.materi) || (a.urutan ?? 0) - (b.urutan ?? 0));
      return { ...m, indikator, dikuasai: indikator.filter((i) => i.nilai >= m.kkm).length, deskripsi: deskripsiIndikator(m.baris, m.kkm, tingkat) };
    }).sort((a, b) => a.nama.localeCompare(b.nama));
  }, [data, idSiswa, kkmMapel, tingkat]);
  const totalInd = capaian.reduce((a, m) => a + m.indikator.length, 0);
  const totalDikuasai = capaian.reduce((a, m) => a + m.dikuasai, 0);

  const remedial = data?.remedial || [];
  const remedialAktif = remedial.filter((r) => r.status === "DIRENCANAKAN");
  const jadwal = data?.jadwal_pekan || [];

  // Tren nilai per mapel (urut tanggal)
  const grafikTren = useMemo(() => {
    if (rincianNilai.length < 2) return null;
    const tanggal = [...new Set(rincianNilai.map((n) => String(n.tanggal).slice(0, 10)))].sort();
    const mapel = [...new Set(rincianNilai.map((n) => n.mapel))];
    return {
      type: "line",
      data: {
        labels: tanggal.map((t) => new Date(`${t}T00:00:00`).toLocaleDateString("id-ID", { day: "numeric", month: "short" })),
        datasets: mapel.map((m, i) => ({
          label: m, borderColor: PALET[i % PALET.length], backgroundColor: PALET[i % PALET.length], tension: 0.3, spanGaps: true, pointRadius: 4,
          data: tanggal.map((t) => { const v = rincianNilai.filter((n) => n.mapel === m && String(n.tanggal).slice(0, 10) === t).map((n) => num(n.nilai)); return v.length ? Math.round(rata(v)) : null; }),
        })),
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom", labels: { usePointStyle: true, boxWidth: 8 } } },
        scales: { y: { min: 0, max: 100, ticks: { stepSize: 20 } } } },
    };
  }, [rincianNilai]);

  // Kalender kehadiran per bulan (Senin di kolom pertama)
  const kalender = useMemo(() => {
    const peta = Object.fromEntries(presensiList.map((p) => [String(p.tanggal).slice(0, 10), p.status_kehadiran]));
    const bulan = [...new Set(Object.keys(peta).map((t) => t.slice(0, 7)))].sort().reverse();
    return bulan.map((b) => {
      const [y, m] = b.split("-").map(Number);
      const awal = (new Date(y, m - 1, 1).getDay() + 6) % 7;
      const jumlahHari = new Date(y, m, 0).getDate();
      const sel = [...Array(awal).fill(null), ...Array.from({ length: jumlahHari }, (_, i) => {
        const t = `${b}-${String(i + 1).padStart(2, "0")}`;
        return { hari: i + 1, tanggal: t, status: peta[t] };
      })];
      return { kunci: b, judul: new Date(y, m - 1, 1).toLocaleDateString("id-ID", { month: "long", year: "numeric" }), sel };
    });
  }, [presensiList]);

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
          <div className="small opacity-75">Pantau perkembangan belajar {role === "ortu" ? "ananda" : "Anda"}: capaian tujuan pembelajaran, nilai, tindak lanjut, jadwal, kehadiran, catatan positif, dan rapor.</div>
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
              <div className="col-6 col-lg-3"><Stat label="TP dikuasai" nilai={totalInd ? `${totalDikuasai}/${totalInd}` : "-"} icon="bi-bullseye" warna="info" sub="indikator capaian" /></div>

              <div className="col-12">
                <PerluPerhatian rapor={rapor} capaian={capaian} remedialAktif={remedialAktif} keTab={setTab} sebutan={role === "ortu" ? "Ananda" : "Anda"} />
              </div>
              {grafikTren && (
                <div className="col-12">
                  <div className="card border-0 shadow-sm p-3">
                    <h6 className="fw-bold mb-2"><i className="bi bi-graph-up-arrow text-primary me-1"></i>Perkembangan nilai</h6>
                    <ChartCanvas config={grafikTren} height={240} />
                  </div>
                </div>
              )}

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

          {tab === "capaian" && (
            capaian.length === 0 ? (
              <Kosong ikon="bi-bullseye" teks="Belum ada penilaian per indikator (tujuan pembelajaran) pada periode ini." />
            ) : (
              <>
                <div className="d-flex flex-wrap gap-2 mb-3 small">
                  {tingkat.map((t) => <span key={t.key} className={`badge bg-${t.color}-subtle text-${t.color}-emphasis border border-${t.color}-subtle fw-normal`}>{t.label} {t.range}</span>)}
                </div>
                <div className="row g-3">
                  {capaian.map((m) => (
                    <div key={m.id_mapel} className="col-lg-6">
                      <div className="card border-0 shadow-sm h-100">
                        <div className="card-body">
                          <div className="d-flex align-items-start gap-2 mb-2">
                            <h6 className="fw-bold mb-0 me-auto">{m.nama}</h6>
                            <span className={`badge ${m.dikuasai === m.indikator.length ? "text-bg-success" : "text-bg-light border"}`}>{m.dikuasai}/{m.indikator.length} dikuasai</span>
                          </div>
                          <div className="progress mb-2" style={{ height: 6 }}><div className="progress-bar bg-success" style={{ width: `${(m.dikuasai / m.indikator.length) * 100}%` }}></div></div>
                          {m.deskripsi && (
                            <p className="small text-body-secondary mb-3">{m.deskripsi.map((s, i) => (s.b ? <b key={i}>{s.t}</b> : <span key={i}>{s.t}</span>))}</p>
                          )}
                          {[...new Set(m.indikator.map((i) => i.materi))].map((materi) => (
                            <div key={materi} className="mb-2">
                              <div className="small fw-semibold text-body-secondary mb-1"><i className="bi bi-journal-bookmark me-1"></i>{materi}</div>
                              {m.indikator.filter((i) => i.materi === materi).map((i) => {
                                const lv = tingkatNilai(i.nilai, tingkat);
                                const ok = i.nilai >= m.kkm;
                                return (
                                  <div key={i.deskripsi} className="d-flex align-items-center gap-2 py-1 border-bottom small">
                                    <i className={`bi ${ok ? "bi-check-circle-fill text-success" : "bi-circle text-danger"}`}></i>
                                    <span className="me-auto">{i.deskripsi}{i.dariRemedial && <span className="badge text-bg-light border ms-1 fw-normal">setelah remedial</span>}</span>
                                    <span className={`badge bg-${lv.color}-subtle text-${lv.color}-emphasis border border-${lv.color}-subtle fw-normal text-nowrap`}>{lv.label}</span>
                                    <b className="text-nowrap" style={{ minWidth: 28, textAlign: "right" }}>{bulat(Math.round(i.nilai))}</b>
                                  </div>
                                );
                              })}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="small text-muted mt-2"><i className="bi bi-info-circle me-1"></i>Tanda <i className="bi bi-check-circle-fill text-success"></i> berarti sudah mencapai KKM mapel. Nilai setelah remedial menggantikan nilai sebelumnya.</div>
              </>
            )
          )}

          {tab === "tindak" && (
            remedial.length === 0 ? (
              <Kosong ikon="bi-emoji-smile" teks="Tidak ada tindak lanjut (remedial) pada periode ini." />
            ) : (
              <div className="row g-3">
                {remedial.map((r) => {
                  const selesai = r.nilai_remedial != null;
                  const tuntas = selesai && r.nilai_remedial >= r.kkm;
                  const st = !selesai ? { t: "Dijadwalkan", w: "warning", i: "bi-hourglass-split" } : tuntas ? { t: "Tuntas", w: "success", i: "bi-patch-check" } : { t: "Belum tuntas", w: "danger", i: "bi-arrow-repeat" };
                  const opsi = OPSI_TINDAK_LANJUT.find((o) => o.nama === r.opsi_tindakan);
                  return (
                    <div key={r.id_rencana} className="col-lg-6">
                      <div className="card border-0 shadow-sm h-100 portal-tindak" style={{ borderLeft: `4px solid var(--bs-${st.w})` }}>
                        <div className="card-body">
                          <div className="d-flex align-items-start gap-2 mb-2">
                            <div className="me-auto">
                              <div className="fw-bold">{r.mapel}</div>
                              <div className="small text-muted">{r.materi || "-"}</div>
                            </div>
                            <span className={`badge text-bg-${st.w}`}><i className={`bi ${st.i} me-1`}></i>{st.t}</span>
                          </div>
                          <div className="d-flex flex-wrap gap-3 small mb-2">
                            <span><i className={`bi ${opsi?.ikon || "bi-signpost-split"} text-primary me-1`}></i><b>{r.opsi_tindakan}</b></span>
                            <span><i className="bi bi-calendar-event me-1"></i>{tanggalPanjang(r.tanggal_rencana)}{r.jam && `, ${r.jam}`}</span>
                            {r.ruangan && <span><i className="bi bi-geo-alt me-1"></i>{r.ruangan}</span>}
                          </div>
                          <div className="d-flex align-items-center gap-2 small mb-2">
                            <span>Nilai awal <b className="text-danger">{bulat(r.nilai_asal)}</b></span>
                            <i className="bi bi-arrow-right text-muted"></i>
                            <span>Remedial <b className={selesai ? (tuntas ? "text-success" : "text-danger") : "text-muted"}>{selesai ? bulat(r.nilai_remedial) : "belum"}</b></span>
                            <span className="text-muted">· KKM {bulat(r.kkm)}</span>
                          </div>
                          {r.catatan && <div className="small bg-body-tertiary rounded p-2 mb-2"><i className="bi bi-chat-left-quote me-1"></i>{r.catatan}</div>}
                          {!selesai && TIPS_RUMAH[r.opsi_tindakan] && (
                            <div className="small p-2 rounded bg-primary-subtle text-primary-emphasis"><i className="bi bi-house-heart me-1"></i><b>Di rumah:</b> {TIPS_RUMAH[r.opsi_tindakan]}</div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}

          {tab === "jadwal" && (
            jadwal.length === 0 ? (
              <Kosong ikon="bi-calendar-week" teks="Belum ada jadwal kelas untuk 7 hari ke depan." />
            ) : (
              <div className="card border-0 shadow-sm p-3">
                <h6 className="fw-bold mb-3">Jadwal 7 hari ke depan · {siswa?.kelas?.nama_kelas}</h6>
                {[...new Set(jadwal.map((j) => j.tanggal))].map((t) => (
                  <div key={t} className="mb-3">
                    <div className="small fw-bold text-primary mb-1">{tanggalPanjang(t)}{t === todayYmd() && <span className="badge text-bg-primary ms-2">Hari ini</span>}</div>
                    <div className="list-group">
                      {jadwal.filter((j) => j.tanggal === t).map((j, i) => (
                        <div key={i} className={`list-group-item d-flex align-items-center gap-3 ${j.remedial ? "list-group-item-warning" : ""}`}>
                          <span className="small fw-semibold text-nowrap" style={{ minWidth: 92 }}>{j.jam}</span>
                          <div className="min-w-0">
                            <div className="fw-semibold small">{j.remedial && <i className="bi bi-life-preserver me-1"></i>}{j.judul}</div>
                            <div className="small text-muted">{[j.guru, j.ruangan].filter(Boolean).join(" · ") || "-"}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )
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
                  <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
                    <h6 className="fw-bold mb-0 me-auto">Kalender kehadiran</h6>
                    {Object.entries(STATUS_WARNA).map(([s, w]) => <span key={s} className="small"><span className={`portal-kal-titik bg-${w}`}></span>{s[0] + s.slice(1).toLowerCase()}</span>)}
                  </div>
                  {kalender.length === 0 ? <div className="text-muted small">Belum ada data kehadiran pada periode ini.</div> : (
                    <div className="row g-3">
                      {kalender.map((b) => (
                        <div key={b.kunci} className="col-md-6 col-xl-4">
                          <div className="fw-semibold small mb-1 text-capitalize">{b.judul}</div>
                          <div className="portal-kal">
                            {HARI.map((h) => <div key={h} className="portal-kal-hari">{h}</div>)}
                            {b.sel.map((c, i) => (
                              <div key={i} className={`portal-kal-sel${c?.status ? ` text-bg-${STATUS_WARNA[c.status]}` : ""}`} title={c?.status ? `${tanggalPanjang(c.tanggal)}: ${c.status}` : undefined}>
                                {c?.hari}
                              </div>
                            ))}
                          </div>
                        </div>
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

function Kosong({ ikon, teks }) {
  return (
    <div className="card border-0 shadow-sm p-5 text-center text-muted">
      <i className={`bi ${ikon} fs-1 d-block mb-2`}></i>{teks}
    </div>
  );
}

// Hal yang perlu didampingi: mapel di bawah KKM, tindak lanjut yang dijadwalkan, TP belum dikuasai, tidak hadir tanpa keterangan
function PerluPerhatian({ rapor, capaian, remedialAktif, keTab, sebutan }) {
  const bawahKkm = rapor.mapelRows.filter((m) => m.nilai != null && m.nilai < m.kkm);
  const belumTp = capaian.flatMap((m) => m.indikator.filter((i) => i.nilai < m.kkm).map((i) => `${i.deskripsi} (${m.nama})`));
  const item = [
    remedialAktif.length && { ikon: "bi-life-preserver", warna: "warning", teks: `${remedialAktif.length} tindak lanjut dijadwalkan: ${remedialAktif.map((r) => `${r.mapel} (${r.opsi_tindakan})`).join(", ")}.`, tab: "tindak" },
    bawahKkm.length && { ikon: "bi-graph-down-arrow", warna: "danger", teks: `Nilai sementara di bawah KKM: ${bawahKkm.map((m) => `${m.nama} ${m.nilai}`).join(", ")}.`, tab: "nilai" },
    belumTp.length && { ikon: "bi-bullseye", warna: "info", teks: `Belum dikuasai: ${belumTp.slice(0, 3).join("; ")}${belumTp.length > 3 ? `; dan ${belumTp.length - 3} lainnya` : ""}.`, tab: "capaian" },
    rapor.presensi.alpa > 0 && { ikon: "bi-person-x", warna: "danger", teks: `${rapor.presensi.alpa} hari tidak hadir tanpa keterangan.`, tab: "presensi" },
  ].filter(Boolean);

  return (
    <div className="card border-0 shadow-sm p-3">
      <h6 className="fw-bold mb-2"><i className="bi bi-flag text-primary me-1"></i>Perlu didampingi</h6>
      {item.length === 0 ? (
        <div className="small text-success"><i className="bi bi-emoji-smile me-1"></i>Semua baik! {sebutan} sudah mencapai KKM dan tidak ada tindak lanjut yang menunggu.</div>
      ) : (
        <div className="d-flex flex-column gap-2">
          {item.map((x, i) => (
            <button key={i} type="button" className="btn btn-light border text-start d-flex align-items-start gap-2 small" onClick={() => keTab(x.tab)}>
              <i className={`bi ${x.ikon} text-${x.warna} mt-1`}></i><span className="me-auto">{x.teks}</span><i className="bi bi-chevron-right text-muted mt-1"></i>
            </button>
          ))}
        </div>
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
