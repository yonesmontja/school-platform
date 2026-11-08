"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import { AI_MODES, bacaAiMode, simpanAiMode } from "@/components/banksoal/konstanta";
import { minta } from "@/components/banksoal/api";

export const FASE = [
  { value: "A", label: "Fase A (kelas 1–2)" },
  { value: "B", label: "Fase B (kelas 3–4)" },
  { value: "C", label: "Fase C (kelas 5–6)" },
];

/** Capaian Pembelajaran per mapel, fase, dan elemen: ketik sendiri atau tempel dokumen CP lalu dipecah AI. */
export default function TabCp({ referensi }) {
  const [mapel, setMapel] = useState(referensi.mapel[0]?.id_mapel || "");
  const [fase, setFase] = useState("");
  const [data, setData] = useState(null);
  const [ubah, setUbah] = useState(null); // {id_cp?, fase, elemen, teks}
  const [tempel, setTempel] = useState(false);

  const muat = useCallback(() => {
    if (!mapel) return setData([]);
    minta("GET", `/perangkat-ajar/cp?id_mapel=${mapel}${fase ? `&fase=${fase}` : ""}`).then((r) => setData(r.data)).catch((err) => Swal.fire("Gagal memuat", err.message, "error"));
  }, [mapel, fase]);
  useEffect(() => { muat(); }, [muat]);

  const perFase = useMemo(() => FASE.map((f) => ({ ...f, cp: (data || []).filter((c) => c.fase === f.value) })).filter((f) => f.cp.length), [data]);

  const simpan = async (e) => {
    e.preventDefault();
    try {
      await minta(ubah.id_cp ? "PUT" : "POST", ubah.id_cp ? `/perangkat-ajar/cp/${ubah.id_cp}` : "/perangkat-ajar/cp", { id_mapel: mapel, fase: ubah.fase, elemen: ubah.elemen, teks: ubah.teks });
      setUbah(null); muat();
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: "CP disimpan", showConfirmButton: false, timer: 1500 });
    } catch (err) { Swal.fire("Gagal menyimpan", err.message, "error"); }
  };
  const hapus = async (c) => {
    const ok = await Swal.fire({ title: `Hapus elemen ${c.elemen}?`, text: "Baris ATP yang memakai elemen ini tidak terhapus, hanya kehilangan tautan elemennya.", icon: "warning", showCancelButton: true, confirmButtonText: "Hapus", cancelButtonText: "Batal", confirmButtonColor: "#dc3545" });
    if (!ok.isConfirmed) return;
    try { await minta("DELETE", `/perangkat-ajar/cp/${c.id_cp}`); muat(); } catch (err) { Swal.fire("Gagal", err.message, "error"); }
  };

  if (!referensi.mapel.length) return <div className="alert alert-info">Belum ada mata pelajaran yang Anda ampu.</div>;

  return (
    <div>
      <div className="d-flex flex-wrap gap-2 align-items-end mb-3">
        <div>
          <label className="form-label small mb-1" htmlFor="cpMapel">Mata pelajaran</label>
          <select id="cpMapel" className="form-select form-select-sm" value={mapel} onChange={(e) => setMapel(e.target.value)}>
            {referensi.mapel.map((m) => <option key={m.id_mapel} value={m.id_mapel}>{m.nama_mapel}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label small mb-1" htmlFor="cpFase">Fase</label>
          <select id="cpFase" className="form-select form-select-sm" value={fase} onChange={(e) => setFase(e.target.value)}>
            <option value="">Semua fase</option>
            {FASE.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </div>
        <div className="ms-auto d-flex gap-2">
          <button className="btn btn-sm btn-outline-primary" onClick={() => setTempel(true)}><i className="bi bi-clipboard-plus me-1"></i>Tempel dokumen CP</button>
          <button className="btn btn-sm btn-primary" onClick={() => setUbah({ fase: fase || "A", elemen: "", teks: "" })}><i className="bi bi-plus-lg me-1"></i>Tambah elemen</button>
        </div>
      </div>

      {!data ? <div className="text-muted small"><span className="spinner-border spinner-border-sm me-2"></span>Memuat…</div>
        : !perFase.length ? (
          <div className="text-center text-muted py-5">
            <i className="bi bi-journal-bookmark fs-1 d-block mb-2"></i>
            Belum ada CP untuk mapel ini. Tekan <b>Tempel dokumen CP</b> untuk menempel teks CP resmi (AI memecahnya per elemen), atau <b>Tambah elemen</b>.
          </div>
        ) : perFase.map((f) => (
          <div key={f.value} className="mb-3">
            <h6 className="fw-bold text-primary">{f.label}</h6>
            <div className="d-flex flex-column gap-2">
              {f.cp.map((c) => (
                <div key={c.id_cp} className="card shadow-sm kartu-cp">
                  <div className="card-body py-2 d-flex gap-2">
                    <div className="flex-grow-1 min-w-0">
                      <div className="fw-semibold">{c.elemen}</div>
                      <div className="small text-body-secondary" style={{ whiteSpace: "pre-wrap" }}>{c.teks}</div>
                    </div>
                    <div className="d-flex flex-column gap-1">
                      <button className="btn btn-sm btn-outline-secondary" onClick={() => setUbah(c)} aria-label={`Ubah elemen ${c.elemen}`}><i className="bi bi-pencil"></i></button>
                      <button className="btn btn-sm btn-outline-danger" onClick={() => hapus(c)} aria-label={`Hapus elemen ${c.elemen}`}><i className="bi bi-trash"></i></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

      {ubah && (
        <>
          <div className="modal d-block" tabIndex={-1} role="dialog" aria-modal="true" aria-label={ubah.id_cp ? "Ubah elemen CP" : "Elemen CP baru"}>
            <div className="modal-dialog modal-lg">
              <form className="modal-content border-0 shadow" onSubmit={simpan}>
                <div className="modal-header"><h5 className="modal-title fw-bold">{ubah.id_cp ? "Ubah elemen CP" : "Elemen CP baru"}</h5>
                  <button type="button" className="btn-close" onClick={() => setUbah(null)} aria-label="Tutup"></button></div>
                <div className="modal-body">
                  <div className="row g-2 mb-2">
                    <div className="col-sm-4">
                      <label className="form-label small mb-1" htmlFor="cpFaseUbah">Fase</label>
                      <select id="cpFaseUbah" className="form-select" value={ubah.fase} onChange={(e) => setUbah({ ...ubah, fase: e.target.value })}>
                        {FASE.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                      </select>
                    </div>
                    <div className="col-sm-8">
                      <label className="form-label small mb-1" htmlFor="cpElemen">Elemen</label>
                      <input id="cpElemen" className="form-control" required maxLength={200} value={ubah.elemen} onChange={(e) => setUbah({ ...ubah, elemen: e.target.value })} placeholder="mis. Bilangan" />
                    </div>
                  </div>
                  <label className="form-label small mb-1" htmlFor="cpTeks">Capaian pembelajaran</label>
                  <textarea id="cpTeks" className="form-control" rows={6} required maxLength={10000} value={ubah.teks} onChange={(e) => setUbah({ ...ubah, teks: e.target.value })} />
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-outline-secondary" onClick={() => setUbah(null)}>Batal</button>
                  <button className="btn btn-primary"><i className="bi bi-save me-1"></i>Simpan</button>
                </div>
              </form>
            </div>
          </div>
          <div className="modal-backdrop show"></div>
        </>
      )}
      {tempel && <TempelCp mapel={referensi.mapel.find((m) => m.id_mapel === mapel)} faseAwal={fase} onTutup={() => setTempel(false)} onSelesai={() => { setTempel(false); muat(); }} />}
    </div>
  );
}

/** Tempel teks CP resmi → AI memecah per elemen → pratinjau yang bisa disunting → simpan semua. */
function TempelCp({ mapel, faseAwal, onTutup, onSelesai }) {
  const [teks, setTeks] = useState("");
  const [fase, setFase] = useState(faseAwal);
  const [mode, setMode] = useState(bacaAiMode);
  const [hasil, setHasil] = useState(null);
  const [proses, setProses] = useState(false);

  const pecah = async () => {
    simpanAiMode(mode);
    setProses(true);
    try {
      const r = await minta("POST", "/perangkat-ajar/cp/pecah", { id_mapel: mapel.id_mapel, fase: fase || null, teks, ai_mode: mode });
      setHasil(r.data);
    } catch (err) { Swal.fire("AI belum berhasil", err.message, "warning"); }
    finally { setProses(false); }
  };
  const simpan = async () => {
    setProses(true);
    try {
      const r = await minta("POST", "/perangkat-ajar/cp/banyak", { id_mapel: mapel.id_mapel, cp: hasil });
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: r.message, showConfirmButton: false, timer: 2000 });
      onSelesai();
    } catch (err) { Swal.fire("Gagal menyimpan", err.message, "error"); setProses(false); }
  };
  const ubahBaris = (i, k, v) => setHasil((h) => h.map((c, j) => (j === i ? { ...c, [k]: v } : c)));

  return (
    <>
      <div className="modal d-block" tabIndex={-1} role="dialog" aria-modal="true" aria-label="Tempel dokumen CP">
        <div className="modal-dialog modal-xl modal-dialog-scrollable">
          <div className="modal-content border-0 shadow">
            <div className="modal-header"><h5 className="modal-title fw-bold"><i className="bi bi-clipboard-plus text-primary me-2"></i>Tempel dokumen CP · {mapel?.nama_mapel}</h5>
              <button type="button" className="btn-close" onClick={onTutup} disabled={proses} aria-label="Tutup"></button></div>
            <div className="modal-body">
              {!hasil ? (
                <>
                  <p className="small text-muted mb-2">Salin teks CP resmi (dari dokumen BSKAP atau Kemendikdasmen) lalu tempel di bawah. AI hanya memecahnya per elemen tanpa mengubah isinya; periksa hasilnya sebelum menyimpan.</p>
                  <div className="row g-2 mb-2">
                    <div className="col-sm-4">
                      <label className="form-label small mb-1" htmlFor="tpFase">Fase yang ditempel</label>
                      <select id="tpFase" className="form-select form-select-sm" value={fase} onChange={(e) => setFase(e.target.value)}>
                        <option value="">Biarkan AI menentukan</option>
                        {FASE.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                      </select>
                    </div>
                    <div className="col-sm-4">
                      <label className="form-label small mb-1" htmlFor="tpAi">Penyedia AI</label>
                      <select id="tpAi" className="form-select form-select-sm" value={mode} onChange={(e) => setMode(e.target.value)}>
                        {AI_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                      </select>
                    </div>
                  </div>
                  <textarea className="form-control" rows={12} aria-label="Teks dokumen CP" value={teks} onChange={(e) => setTeks(e.target.value)} placeholder="Tempel teks CP di sini…" />
                </>
              ) : (
                <div className="d-flex flex-column gap-2">
                  {hasil.map((c, i) => (
                    <div key={i} className="border rounded p-2">
                      <div className="d-flex gap-2 mb-1">
                        <select className="form-select form-select-sm" style={{ width: 110 }} aria-label={`Fase elemen ${i + 1}`} value={c.fase} onChange={(e) => ubahBaris(i, "fase", e.target.value)}>
                          {FASE.map((f) => <option key={f.value} value={f.value}>Fase {f.value}</option>)}
                        </select>
                        <input className="form-control form-control-sm fw-semibold" aria-label={`Nama elemen ${i + 1}`} value={c.elemen} onChange={(e) => ubahBaris(i, "elemen", e.target.value)} />
                        <button className="btn btn-sm btn-outline-danger" onClick={() => setHasil((h) => h.filter((_, j) => j !== i))} aria-label={`Buang elemen ${i + 1}`}><i className="bi bi-x-lg"></i></button>
                      </div>
                      <textarea className="form-control form-control-sm" rows={3} aria-label={`Teks elemen ${i + 1}`} value={c.teks} onChange={(e) => ubahBaris(i, "teks", e.target.value)} />
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="modal-footer">
              {hasil && <button className="btn btn-outline-secondary me-auto" onClick={() => setHasil(null)} disabled={proses}><i className="bi bi-arrow-left me-1"></i>Tempel ulang</button>}
              <button className="btn btn-outline-secondary" onClick={onTutup} disabled={proses}>Batal</button>
              {!hasil ? (
                <button className="btn btn-primary" onClick={pecah} disabled={proses || teks.trim().length < 30}>
                  {proses ? <span className="spinner-border spinner-border-sm me-1"></span> : <i className="bi bi-stars me-1"></i>}Pecah per elemen
                </button>
              ) : (
                <button className="btn btn-primary" onClick={simpan} disabled={proses || !hasil.length}><i className="bi bi-save me-1"></i>Simpan {hasil.length} elemen</button>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="modal-backdrop show"></div>
    </>
  );
}
