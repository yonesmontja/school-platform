"use client";
// Cakupan bank soal (Fase 24): soal disetujui per TP aktif dan level kognitif dibanding target (cukup untuk 2 paket berbeda),
// tombol melengkapi TP yang kurang dengan AI, dan pemeriksaan soal kembar per mapel.
import { useCallback, useEffect, useState } from "react";
import Swal from "sweetalert2";
import { STATUS, labelBentuk } from "./konstanta";
import { minta } from "./api";
import ModalDrafAI from "./ModalDrafAI";

const KUNCI_TARGET = "bank-soal-target-tp";
const LEVEL = ["C1", "C2", "C3", "C4", "C5", "C6"];
const bacaTarget = () => { try { return Number(localStorage.getItem(KUNCI_TARGET)) || 4; } catch { return 4; } };

export default function CakupanSoal({ referensi, onSoalBerubah }) {
  const [mapel, setMapel] = useState(referensi.mapel[0]?.id_mapel || "");
  const [kelas, setKelas] = useState("");
  const [target, setTarget] = useState(bacaTarget);
  const [data, setData] = useState(null);
  const [lengkapi, setLengkapi] = useState(null); // baris TP yang akan dilengkapi AI
  const [kembar, setKembar] = useState(null);
  const [memeriksa, setMemeriksa] = useState(false);

  const muat = useCallback(() => {
    if (!mapel) return;
    setData(null);
    minta("GET", `/bank-soal/cakupan?id_mapel=${mapel}${kelas ? `&id_kelas=${kelas}` : ""}&target=${target}`).then(setData)
      .catch((e) => { setData({ data: [], ringkasan: { tp: 0, cukup: 0, target } }); Swal.fire("Gagal memuat", e.message, "error"); });
  }, [mapel, kelas, target]);
  useEffect(() => { muat(); }, [muat]);
  useEffect(() => { setKembar(null); }, [mapel]);

  const ubahTarget = (v) => {
    const n = Math.min(Math.max(Number(v) || 1, 1), 50);
    setTarget(n);
    try { localStorage.setItem(KUNCI_TARGET, String(n)); } catch { /* abaikan */ }
  };
  const periksaKembar = async () => {
    setMemeriksa(true);
    try { setKembar(await minta("GET", `/bank-soal/kembar?id_mapel=${mapel}`)); }
    catch (e) { Swal.fire("Gagal", e.message, "error"); }
    finally { setMemeriksa(false); }
  };
  const hapus = async (s) => {
    const ok = await Swal.fire({ title: "Hapus soal ini?", text: s.pertanyaan.slice(0, 160), icon: "warning", showCancelButton: true, confirmButtonText: "Hapus", cancelButtonText: "Batal", confirmButtonColor: "#dc3545" });
    if (!ok.isConfirmed) return;
    try { await minta("DELETE", `/bank-soal/${s.id_soal}`); periksaKembar(); muat(); onSoalBerubah?.(); }
    catch (e) { Swal.fire("Gagal", e.message, "error"); }
  };

  const r = data?.ringkasan;
  const persen = r?.tp ? Math.round((r.cukup / r.tp) * 100) : 0;
  return (
    <div className="d-flex flex-column gap-3">
      <div className="card shadow-sm">
        <div className="card-body">
          <div className="d-flex flex-wrap gap-2 align-items-end mb-3">
            <div>
              <label className="form-label small mb-1" htmlFor="ckMapel">Mata pelajaran</label>
              <select id="ckMapel" className="form-select form-select-sm" value={mapel} onChange={(e) => setMapel(e.target.value)}>
                {referensi.mapel.map((m) => <option key={m.id_mapel} value={m.id_mapel}>{m.nama_mapel}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label small mb-1" htmlFor="ckKelas">Kelas</label>
              <select id="ckKelas" className="form-select form-select-sm" value={kelas} onChange={(e) => setKelas(e.target.value)}>
                <option value="">Semua kelas</option>
                {referensi.kelas.map((k) => <option key={k.id_kelas} value={k.id_kelas}>{k.nama_kelas}</option>)}
              </select>
            </div>
            <div style={{ width: 150 }}>
              <label className="form-label small mb-1" htmlFor="ckTarget">Target soal per TP</label>
              <input id="ckTarget" type="number" min={1} max={50} className="form-control form-control-sm" value={target} onChange={(e) => ubahTarget(e.target.value)} />
            </div>
            <div className="small text-body-secondary ms-sm-2 flex-grow-1">Target 4 cukup untuk 2 paket berbeda dengan 2 soal per TP. Yang dihitung hanya soal yang sudah disetujui.</div>
          </div>

          {!data ? <div className="text-muted small"><span className="spinner-border spinner-border-sm me-2"></span>Menghitung cakupan…</div>
            : !data.data.length ? <div className="text-center text-muted py-4"><i className="bi bi-bullseye fs-1 d-block mb-2"></i>Belum ada TP aktif untuk mapel ini. Susun materi & TP di menu Materi atau lewat ATP.</div>
            : (
              <>
                <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
                  <div className="fw-semibold">{r.cukup} dari {r.tp} TP sudah cukup soal</div>
                  <div className="progress flex-grow-1" style={{ height: 8, minWidth: 120 }} role="progressbar" aria-label="TP yang cukup soal" aria-valuenow={persen} aria-valuemin={0} aria-valuemax={100}>
                    <div className={`progress-bar ${persen === 100 ? "bg-success" : "bg-warning"}`} style={{ width: `${persen}%` }}></div>
                  </div>
                  <span className="small text-body-secondary">{persen}%</span>
                </div>
                <div className="table-responsive">
                  <table className="table table-sm align-middle mb-0 tabel-cakupan">
                    <thead><tr><th>Tujuan pembelajaran</th>{LEVEL.map((l) => <th key={l} className="text-center">{l}</th>)}<th className="text-center">Disetujui</th><th className="text-center">Diproses</th><th></th></tr></thead>
                    <tbody>
                      {data.data.map((b) => (
                        <tr key={b.id_indikator} data-tp={b.id_indikator}>
                          <td style={{ minWidth: 220 }}><div className="small">{b.deskripsi}</div><div className="small text-body-secondary">{b.nama_materi}{b.varian > 0 && ` · ${b.varian} varian`}</div></td>
                          {LEVEL.map((l) => <td key={l} className={`text-center small ${b.per_level[l] ? "fw-semibold" : "text-body-tertiary"}`}>{b.per_level[l] || "·"}</td>)}
                          <td className="text-center"><span className={`badge ${b.kurang ? "text-bg-warning" : "text-bg-success"}`}>{b.disetujui}/{data.ringkasan.target}</span></td>
                          <td className="text-center small text-body-secondary">{b.diproses || "·"}</td>
                          <td className="text-end">{b.kurang > 0 && <button className="btn btn-sm btn-outline-primary text-nowrap" onClick={() => setLengkapi(b)}><i className="bi bi-magic me-1"></i>Lengkapi {b.kurang}</button>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="form-text">Soal yang <b>diproses</b> (draf, diajukan, atau perlu revisi) belum dihitung. Untuk soal yang sudah disetujui, buat variasinya lewat menu ⋮ → <b>Buat varian dengan AI</b> di daftar soal.</div>
              </>
            )}
        </div>
      </div>

      <div className="card shadow-sm">
        <div className="card-header d-flex flex-wrap align-items-center gap-2">
          <h3 className="card-title fw-semibold mb-0 me-auto fs-6"><i className="bi bi-files me-2"></i>Soal kembar</h3>
          <button className="btn btn-sm btn-outline-secondary" onClick={periksaKembar} disabled={memeriksa || !mapel}>
            {memeriksa ? <span className="spinner-border spinner-border-sm me-1"></span> : <i className="bi bi-search me-1"></i>}Periksa soal kembar</button>
        </div>
        <div className="card-body">
          {!kembar ? <div className="small text-body-secondary">Cari soal yang isinya hampir sama di mapel ini (mis. hasil impor ganda atau draf AI yang mengulang), lalu hapus salah satunya.</div>
            : !kembar.data.length ? <div className="small text-success"><i className="bi bi-check-circle me-1"></i>Tidak ada soal kembar di antara {kembar.diperiksa} soal yang diperiksa.</div>
            : (
              <div className="d-flex flex-column gap-2">
                <div className="small text-body-secondary">{kembar.data.length} pasangan soal kembar dari {kembar.diperiksa} soal.</div>
                {kembar.data.map((p, i) => (
                  <div key={i} className="border rounded p-2" data-kembar>
                    <div className="small mb-1"><span className="badge text-bg-danger-subtle text-danger-emphasis border border-danger-subtle">{Math.round(p.skor * 100)}% mirip</span></div>
                    <div className="row g-2">
                      {[p.a, p.b].map((s) => (
                        <div key={s.id_soal} className="col-md-6">
                          <div className="border rounded p-2 h-100 d-flex flex-column">
                            <div className="d-flex flex-wrap gap-1 small mb-1">
                              <span className={`badge text-bg-${STATUS[s.status]?.warna}`}>{STATUS[s.status]?.label}</span>
                              <span className="badge text-bg-light border">{labelBentuk(s.bentuk)}</span><span className="badge text-bg-light border">{s.level_kognitif}</span>
                              {s.id_induk && <span className="badge text-bg-info-subtle text-info-emphasis border">Varian</span>}
                            </div>
                            <div className="small flex-grow-1">{s.pertanyaan}</div>
                            <div className="small text-body-secondary mt-1">{s.indikator?.deskripsi || "TP belum dipilih"}</div>
                            <div className="text-end mt-1"><button className="btn btn-sm btn-link text-danger p-0" onClick={() => hapus(s)}><i className="bi bi-trash me-1"></i>Hapus yang ini</button></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
        </div>
      </div>

      {lengkapi && (
        <ModalDrafAI referensi={referensi} awal={{ id_mapel: mapel, id_kelas: kelas, id_materi: lengkapi.id_materi, id_indikator: lengkapi.id_indikator, jumlah: Math.min(lengkapi.kurang, 10) }}
          onTutup={() => setLengkapi(null)} onSelesai={() => { setLengkapi(null); muat(); onSoalBerubah?.(); }} />
      )}
    </div>
  );
}
