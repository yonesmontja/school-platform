"use client";
// Kartu ringkasan sebelum menilai/mengimpor nilai: penilaian terakhir (bisa dibuka), progres capaian per materi
// dan per indikator, serta siswa yang perlu perhatian, untuk satu kelas + mapel + semester.
import { useEffect, useState } from "react";
import { API_URL } from "@/app/lib/config";

const angka = (v) => (v == null ? "–" : Number(v).toLocaleString("id-ID", { maximumFractionDigits: 1 }));
const persen = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const warnaPersen = (p) => (p >= 80 ? "success" : p >= 60 ? "warning" : "danger");

function tanggalRelatif(tgl) {
  if (!tgl) return "";
  const t = new Date(`${tgl}T00:00:00`);
  const hari = Math.round((new Date(new Date().toDateString()) - t) / 86400000);
  const lengkap = t.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const rel = hari === 0 ? "hari ini" : hari === 1 ? "kemarin" : hari > 1 ? `${hari} hari lalu` : `${-hari} hari lagi`;
  return { lengkap, rel, singkat: t.toLocaleDateString("id-ID", { day: "numeric", month: "short" }) };
}

const KUNCI_LIPAT = "ringkasanNilaiTerlipat";

/**
 * props: idKelas, idMapel, idPeriode, idMateri (opsional, untuk menyorot materi), namaKelas, namaMapel,
 * onBukaSesi(sesi) — buka lembar penilaian itu, onPilihMateri(idMateri), muatUlang (ubah nilainya untuk memuat ulang)
 */
export default function RingkasanNilai({ idKelas, idMapel, idPeriode, idMateri, namaKelas, namaMapel, onBukaSesi, onPilihMateri, muatUlang, labelBuka = "Buka lembar" }) {
  const [data, setData] = useState(null);
  const [galat, setGalat] = useState("");
  const [memuat, setMemuat] = useState(false);
  const [terlipat, setTerlipat] = useState(false);
  const [semuaMateri, setSemuaMateri] = useState(false);

  useEffect(() => { try { setTerlipat(localStorage.getItem(KUNCI_LIPAT) === "1"); } catch { /* storage diblokir */ } }, []);
  const lipat = () => setTerlipat((v) => { try { localStorage.setItem(KUNCI_LIPAT, v ? "0" : "1"); } catch { /* abaikan */ } return !v; });

  useEffect(() => {
    if (!idKelas || !idMapel || !idPeriode) { setData(null); return; }
    let batal = false;
    setMemuat(true); setGalat("");
    const q = new URLSearchParams({ id_kelas: idKelas, id_mapel: idMapel, id_periode: idPeriode });
    fetch(`${API_URL}/nilai/ringkasan?${q}`, { headers: { Accept: "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` } })
      .then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.message || `Gagal memuat ringkasan (${r.status}).`); return d; })
      .then((d) => { if (!batal) setData(d); })
      .catch((e) => { if (!batal) { setData(null); setGalat(e.message); } })
      .finally(() => { if (!batal) setMemuat(false); });
    return () => { batal = true; };
  }, [idKelas, idMapel, idPeriode, muatUlang]);

  if (!idKelas || !idMapel || !idPeriode) return null;

  const r = data?.ringkas;
  const terakhir = data?.sesi_terakhir?.[0];
  const rel = tanggalRelatif(terakhir?.tanggal);
  const materiTerpilih = data?.materi?.find((m) => m.id_materi === idMateri);
  const daftarMateri = data?.materi ? (semuaMateri ? data.materi : data.materi.slice(0, 6)) : [];
  const persenTuntas = r ? persen(r.siswa_tuntas, r.siswa_dinilai) : 0;

  return (
    <div className="card shadow-sm mb-3 border-0" data-testid="ringkasan-nilai">
      <div className="card-header bg-body-tertiary d-flex flex-wrap align-items-center gap-2 py-2">
        <h3 className="card-title fs-6 fw-semibold mb-0 me-auto">
          <i className="bi bi-graph-up-arrow text-primary me-2"></i>Ringkasan & progres {namaMapel ? <>· {namaMapel}</> : null}{namaKelas ? <> · {namaKelas}</> : null}
        </h3>
        {memuat && <span className="spinner-border spinner-border-sm text-secondary" role="status" aria-label="Memuat ringkasan"></span>}
        <button type="button" className="btn btn-sm btn-link text-decoration-none p-0" onClick={lipat} aria-expanded={!terlipat}>
          {terlipat ? <>Tampilkan <i className="bi bi-chevron-down"></i></> : <>Sembunyikan <i className="bi bi-chevron-up"></i></>}
        </button>
      </div>

      {!terlipat && (
        <div className="card-body p-3">
          {galat && <div className="alert alert-warning small py-2 mb-0">{galat}</div>}
          {!galat && data && !r.jumlah_sesi && (
            <div className="text-muted small"><i className="bi bi-info-circle me-1"></i>Belum ada nilai untuk mapel ini di kelas ini pada semester ini. Penilaian pertama Anda akan tampil di sini.</div>
          )}

          {!galat && data && r.jumlah_sesi > 0 && (
            <>
              {/* Angka ringkas */}
              <div className="row g-2 mb-3 text-center">
                {[
                  { label: "Penilaian tercatat", nilai: r.jumlah_sesi, ikon: "bi-clipboard-check" },
                  { label: "Materi dinilai", nilai: `${r.materi_dinilai}/${r.materi_total}`, ikon: "bi-journal-check" },
                  { label: `Rata-rata kelas (KKM ${angka(data.kkm)})`, nilai: angka(r.rata), ikon: "bi-bar-chart", warna: r.rata >= data.kkm ? "success" : "danger" },
                  { label: "Siswa tuntas (rata-rata mapel)", nilai: `${r.siswa_tuntas}/${r.siswa_dinilai}`, ikon: "bi-people", warna: warnaPersen(persenTuntas), bar: persenTuntas },
                  { label: "Remedial belum selesai", nilai: r.remedial_terbuka, ikon: "bi-life-preserver", warna: r.remedial_terbuka ? "warning" : "secondary" },
                ].map((k) => (
                  <div className="col-6 col-md" key={k.label}>
                    <div className="border rounded-3 p-2 h-100">
                      <div className={`fs-5 fw-bold text-${k.warna || "body"}`}><i className={`bi ${k.ikon} me-1 small opacity-75`}></i>{k.nilai}</div>
                      <div className="small text-muted lh-sm">{k.label}</div>
                      {k.bar != null && <div className="progress mt-1" style={{ height: 4 }} role="progressbar" aria-valuenow={k.bar} aria-valuemin={0} aria-valuemax={100}><div className={`progress-bar bg-${k.warna}`} style={{ width: `${k.bar}%` }}></div></div>}
                    </div>
                  </div>
                ))}
              </div>

              <div className="row g-3">
                {/* Penilaian terakhir */}
                <div className="col-12 col-lg-5">
                  <div className="small fw-semibold text-uppercase text-muted mb-2" style={{ letterSpacing: ".04em" }}>Penilaian terakhir</div>
                  {terakhir && (
                    <button type="button" className="card w-100 text-start border-primary border-opacity-50 shadow-sm mb-2 p-0 bg-primary-subtle bg-opacity-25" onClick={() => onBukaSesi?.(terakhir)}
                      title={`${labelBuka}: ${terakhir.materi}`}>
                      <div className="card-body p-3">
                        <div className="d-flex justify-content-between align-items-start gap-2">
                          <div>
                            <div className="fw-bold">{rel.lengkap}</div>
                            <div className="small text-muted">{rel.rel} · {terakhir.jenis}{terakhir.diagnostik ? " (diagnostik)" : ""}</div>
                          </div>
                          <span className="badge text-bg-primary">{labelBuka} <i className="bi bi-arrow-right"></i></span>
                        </div>
                        <div className="mt-2"><i className="bi bi-journal-text me-1 text-primary"></i><b>{terakhir.materi}</b></div>
                        {terakhir.indikator?.length > 0 && (
                          <div className="d-flex flex-wrap gap-1 mt-2">
                            {terakhir.indikator.map((i) => <span key={i} className="badge rounded-pill text-bg-light border fw-normal text-wrap text-start">{i}</span>)}
                          </div>
                        )}
                        <div className="d-flex flex-wrap gap-3 small mt-2">
                          <span><i className="bi bi-people me-1"></i>{terakhir.dinilai}/{terakhir.jumlah_siswa} siswa dinilai</span>
                          <span><i className="bi bi-bar-chart me-1"></i>rata-rata {angka(terakhir.rata)}</span>
                          {terakhir.di_bawah_kkm > 0 && <span className="text-danger"><i className="bi bi-exclamation-triangle me-1"></i>{terakhir.di_bawah_kkm} di bawah KKM</span>}
                        </div>
                        {terakhir.dinilai < terakhir.jumlah_siswa && (
                          <div className="small text-warning-emphasis mt-1"><i className="bi bi-hourglass-split me-1"></i>{terakhir.jumlah_siswa - terakhir.dinilai} siswa belum dinilai pada penilaian ini</div>
                        )}
                        {terakhir.belum_ditindak > 0 && (
                          <div className="small text-danger-emphasis mt-1"><i className="bi bi-life-preserver me-1"></i>{terakhir.belum_ditindak} siswa di bawah KKM belum punya rencana tindak lanjut</div>
                        )}
                      </div>
                    </button>
                  )}
                  <div className="list-group list-group-flush small">
                    {data.sesi_terakhir.slice(1).map((s) => (
                      <button type="button" key={`${s.tanggal}|${s.id_jenis}|${s.id_materi}`} className="list-group-item list-group-item-action px-2 py-2 d-flex gap-2 align-items-center" onClick={() => onBukaSesi?.(s)}>
                        <span className="badge text-bg-light border text-nowrap">{tanggalRelatif(s.tanggal).singkat}</span>
                        <span className="text-truncate me-auto" title={s.materi}>{s.materi}<span className="text-muted"> · {s.jenis}</span></span>
                        <span className="text-nowrap text-muted">{s.dinilai}/{s.jumlah_siswa}</span>
                        <span className={`text-nowrap fw-semibold text-${s.rata >= data.kkm ? "success" : "danger"}`}>{angka(s.rata)}</span>
                        <i className="bi bi-chevron-right text-muted"></i>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Progres per materi */}
                <div className="col-12 col-lg-7">
                  <div className="d-flex align-items-center mb-2">
                    <div className="small fw-semibold text-uppercase text-muted me-auto" style={{ letterSpacing: ".04em" }}>Progres capaian per materi</div>
                    <span className="small text-muted">% siswa tuntas (nilai ≥ KKM, remedial dihitung)</span>
                  </div>
                  <div className="d-flex flex-column gap-2">
                    {daftarMateri.map((m) => {
                      const p = persen(m.tuntas, m.dinilai);
                      const aktif = m.id_materi === idMateri;
                      return (
                        <button type="button" key={m.id_materi} onClick={() => onPilihMateri?.(m.id_materi)}
                          className={`btn text-start border rounded-3 px-3 py-2 ${aktif ? "border-primary bg-primary-subtle" : "btn-light bg-body"}`} aria-pressed={aktif}>
                          <div className="d-flex align-items-center gap-2">
                            <span className="fw-semibold text-truncate me-auto" title={m.materi}>{m.materi}</span>
                            {m.dinilai ? <span className={`badge text-bg-${warnaPersen(p)}`}>{p}% tuntas</span> : <span className="badge text-bg-secondary">Belum dinilai</span>}
                          </div>
                          {m.dinilai > 0 && (
                            <>
                              <div className="progress my-1" style={{ height: 6 }} role="progressbar" aria-label={`${m.materi}: ${p}% tuntas`} aria-valuenow={p} aria-valuemin={0} aria-valuemax={100}>
                                <div className={`progress-bar bg-${warnaPersen(p)}`} style={{ width: `${p}%` }}></div>
                              </div>
                              <div className="small text-muted">
                                {m.tuntas}/{m.dinilai} siswa tuntas · rata-rata {angka(m.rata)} · {m.jumlah_sesi} penilaian · terakhir {tanggalRelatif(m.terakhir).singkat}
                                {m.dinilai < m.jumlah_siswa && <span className="text-warning-emphasis"> · {m.jumlah_siswa - m.dinilai} belum dinilai</span>}
                              </div>
                            </>
                          )}
                          {m.kategori && <div className="small text-muted"><i className="bi bi-tag me-1"></i>{m.kategori}</div>}
                        </button>
                      );
                    })}
                    {data.materi.length > 6 && (
                      <button type="button" className="btn btn-sm btn-link" onClick={() => setSemuaMateri((v) => !v)}>
                        {semuaMateri ? "Tampilkan lebih sedikit" : `Tampilkan semua ${data.materi.length} materi`}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Rincian materi terpilih: indikator & siswa belum tuntas */}
              {materiTerpilih && materiTerpilih.dinilai > 0 && (
                <div className="border rounded-3 p-3 mt-3 bg-body-tertiary" data-testid="ringkasan-materi">
                  <div className="fw-semibold mb-2"><i className="bi bi-bullseye text-primary me-1"></i>Capaian materi “{materiTerpilih.materi}”</div>
                  <div className="row g-3">
                    <div className="col-12 col-md-7">
                      {materiTerpilih.indikator.length ? materiTerpilih.indikator.map((i) => {
                        const p = persen(i.tuntas, i.dinilai);
                        return (
                          <div key={i.id_indikator} className="mb-2">
                            <div className="d-flex small gap-2"><span className="me-auto">{i.deskripsi}{!i.aktif && <span className="text-muted"> (nonaktif)</span>}</span>
                              <span className="text-nowrap text-muted">{i.dinilai ? `${i.tuntas}/${i.dinilai} tuntas · ${angka(i.rata)}` : "belum dinilai"}</span></div>
                            <div className="progress" style={{ height: 5 }}><div className={`progress-bar bg-${i.dinilai ? warnaPersen(p) : "secondary"}`} style={{ width: `${i.dinilai ? p : 0}%` }}></div></div>
                          </div>
                        );
                      }) : <div className="small text-muted">Materi ini dinilai tanpa indikator.</div>}
                    </div>
                    <div className="col-12 col-md-5">
                      <div className="small fw-semibold mb-1">Belum tuntas ({materiTerpilih.belum_tuntas.length})</div>
                      {materiTerpilih.belum_tuntas.length ? (
                        <div className="d-flex flex-wrap gap-1">
                          {materiTerpilih.belum_tuntas.map((s) => <span key={s.id_siswa} className="badge rounded-pill text-bg-danger bg-opacity-75 fw-normal">{s.nama_siswa} · {angka(s.nilai)}</span>)}
                        </div>
                      ) : <div className="small text-success"><i className="bi bi-check-circle me-1"></i>Semua siswa yang dinilai sudah tuntas.</div>}
                    </div>
                  </div>
                </div>
              )}

              {data.perhatian.length > 0 && (
                <div className="mt-3 small">
                  <span className="fw-semibold me-2"><i className="bi bi-person-exclamation text-danger me-1"></i>Perlu perhatian (rata-rata mapel di bawah KKM):</span>
                  {data.perhatian.map((s) => (
                    <span key={s.id_siswa} className="badge rounded-pill text-bg-light border text-danger-emphasis fw-normal me-1 mb-1" title={`${s.materi_belum_tuntas} materi belum tuntas`}>
                      {s.nama_siswa} · {angka(s.rata)}
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
