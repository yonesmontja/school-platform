"use client";
import { useEffect, useRef, useState } from "react";
import Swal from "sweetalert2";
import { BENTUK, LEVEL, labelBentuk } from "./konstanta";
import PratinjauSoal, { LencanaStnkm } from "./PratinjauSoal";
import { minta } from "./api";

/** Pilih soal yang sudah disetujui (mapel paket) untuk dimasukkan ke paket. */
export default function PilihSoal({ paket, referensi, onTutup, onTersimpan }) {
  const [filter, setFilter] = useState({ id_materi: "", id_indikator: "", bentuk: "", level_kognitif: "", cari: "" });
  const [data, setData] = useState([]);
  const [memuat, setMemuat] = useState(true);
  const [dipilih, setDipilih] = useState([]);
  const [lihat, setLihat] = useState({});
  const [proses, setProses] = useState(false);
  const permintaan = useRef(0);
  const sudah = new Set((paket.butir || []).map((b) => b.id_soal));
  const materi = (referensi.materi || []).filter((m) => m.id_mapel === paket.id_mapel);
  const tp = materi.find((m) => m.id_materi === filter.id_materi)?.indikator || [];

  useEffect(() => {
    const ke = ++permintaan.current;
    setMemuat(true);
    const q = new URLSearchParams({ status: "DISETUJUI", id_mapel: paket.id_mapel, per_halaman: 100 });
    Object.entries(filter).forEach(([k, v]) => { if (v) q.set(k, v); });
    minta("GET", `/bank-soal?${q}`)
      .then((r) => { if (ke === permintaan.current) setData(r.data); })
      .catch((err) => Swal.fire("Gagal memuat", err.message, "error"))
      .finally(() => { if (ke === permintaan.current) setMemuat(false); });
  }, [filter, paket.id_mapel]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !proses) onTutup(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onTutup, proses]);

  const tambah = async () => {
    setProses(true);
    try {
      const res = await minta("POST", `/paket-soal/${paket.id_paket}/butir`, { id_soal: dipilih });
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: res.message, showConfirmButton: false, timer: 2500 });
      onTersimpan(res.data);
    } catch (err) { Swal.fire("Gagal", err.message, "error"); }
    finally { setProses(false); }
  };

  const tersedia = data.filter((s) => !sudah.has(s.id_soal));
  const ubahFilter = (patch) => setFilter((f) => ({ ...f, ...patch }));

  return (
    <>
      <div className="modal d-block" tabIndex={-1} role="dialog" aria-modal="true" aria-label="Tambah soal ke paket">
        <div className="modal-dialog modal-dialog-scrollable modal-xl">
          <div className="modal-content border-0 shadow">
            <div className="modal-header">
              <h5 className="modal-title fw-bold"><i className="bi bi-plus-square text-primary me-2"></i>Tambah Soal ke Paket</h5>
              <button type="button" className="btn-close" onClick={onTutup} disabled={proses} aria-label="Tutup"></button>
            </div>
            <div className="modal-body">
              <div className="row g-2 mb-2">
                <div className="col-6 col-md-3"><select className="form-select form-select-sm" aria-label="Materi" value={filter.id_materi} onChange={(e) => ubahFilter({ id_materi: e.target.value, id_indikator: "" })}>
                  <option value="">Semua materi</option>{materi.map((m) => <option key={m.id_materi} value={m.id_materi}>{m.nama_materi}</option>)}</select></div>
                <div className="col-6 col-md-3"><select className="form-select form-select-sm" aria-label="TP" value={filter.id_indikator} disabled={!filter.id_materi} onChange={(e) => ubahFilter({ id_indikator: e.target.value })}>
                  <option value="">Semua TP</option>{tp.map((t) => <option key={t.id_indikator} value={t.id_indikator}>{t.deskripsi}</option>)}</select></div>
                <div className="col-6 col-md-2"><select className="form-select form-select-sm" aria-label="Bentuk" value={filter.bentuk} onChange={(e) => ubahFilter({ bentuk: e.target.value })}>
                  <option value="">Semua bentuk</option>{BENTUK.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}</select></div>
                <div className="col-6 col-md-2"><select className="form-select form-select-sm" aria-label="Level" value={filter.level_kognitif} onChange={(e) => ubahFilter({ level_kognitif: e.target.value })}>
                  <option value="">Semua level</option>{LEVEL.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}</select></div>
                <div className="col-12 col-md-2"><input type="search" className="form-control form-control-sm" placeholder="Cari" aria-label="Cari soal" value={filter.cari} onChange={(e) => ubahFilter({ cari: e.target.value })} /></div>
              </div>
              <div className="small text-muted mb-2">Hanya soal yang sudah disetujui kepala sekolah. {sudah.size > 0 && `${sudah.size} soal sudah ada di paket dan tidak ditampilkan.`}</div>

              {memuat ? <div className="text-muted small py-3"><span className="spinner-border spinner-border-sm me-2"></span>Memuat…</div>
                : !tersedia.length ? <div className="text-center text-muted py-4"><i className="bi bi-inbox fs-2 d-block mb-1"></i>Tidak ada soal disetujui yang cocok. Ajukan soal ke kepala sekolah di tab Bank Soal.</div>
                : (
                  <div className="d-flex flex-column gap-2">
                    <div className="form-check small">
                      <input className="form-check-input" type="checkbox" id="pilihSemuaPaket" checked={dipilih.length === tersedia.length}
                        onChange={(e) => setDipilih(e.target.checked ? tersedia.map((s) => s.id_soal) : [])} />
                      <label className="form-check-label" htmlFor="pilihSemuaPaket">Pilih semua ({tersedia.length})</label>
                    </div>
                    {tersedia.map((s) => (
                      <label key={s.id_soal} className="border rounded p-2 d-flex gap-2 align-items-start pilih-soal" style={{ cursor: "pointer" }}>
                        <input type="checkbox" className="form-check-input mt-1" aria-label="Pilih soal" checked={dipilih.includes(s.id_soal)}
                          onChange={(e) => setDipilih((d) => (e.target.checked ? [...d, s.id_soal] : d.filter((x) => x !== s.id_soal)))} />
                        <div className="flex-grow-1 min-w-0">
                          <div className="d-flex flex-wrap gap-1 small mb-1">
                            <span className="badge text-bg-light border">{labelBentuk(s.bentuk)}</span>
                            <span className="badge text-bg-light border">{s.level_kognitif}</span>
                            <span className="badge text-bg-light border">skor {s.skor_maks}</span>
                            <LencanaStnkm soal={s} />
                          </div>
                          {lihat[s.id_soal] ? <PratinjauSoal soal={s} /> : <div className="text-truncate">{s.pertanyaan}</div>}
                          <div className="small text-muted">{s.indikator?.deskripsi || s.materi?.nama_materi || "TP belum dipilih"}</div>
                        </div>
                        <button type="button" className="btn btn-sm btn-outline-secondary" aria-label="Lihat soal" onClick={(e) => { e.preventDefault(); setLihat((l) => ({ ...l, [s.id_soal]: !l[s.id_soal] })); }}>
                          <i className={`bi ${lihat[s.id_soal] ? "bi-eye-slash" : "bi-eye"}`}></i></button>
                      </label>
                    ))}
                  </div>
                )}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline-secondary" onClick={onTutup} disabled={proses}>Batal</button>
              <button type="button" className="btn btn-primary" disabled={!dipilih.length || proses} onClick={tambah}>
                {proses ? <span className="spinner-border spinner-border-sm me-1"></span> : <i className="bi bi-plus-lg me-1"></i>}Tambahkan {dipilih.length || ""} soal
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="modal-backdrop show"></div>
    </>
  );
}
