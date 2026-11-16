"use client";
// Varian AI dari soal yang sudah disetujui (Fase 24): angka, konteks, tingkat kesulitan, atau level kognitif diubah.
// Varian masuk sebagai draf yang menunjuk soal induknya; varian yang kembar dengan soal lain dilewati otomatis.
import { useEffect, useState } from "react";
import Swal from "sweetalert2";
import { AI_MODES, KESULITAN, LEVEL, bacaAiMode, labelBentuk, simpanAiMode } from "./konstanta";
import { minta } from "./api";

export const JENIS_VARIAN = [
  { value: "ANGKA", label: "Ganti angka", ikon: "bi-123", keterangan: "Angka/data diganti, kunci dihitung ulang; cerita boleh sama." },
  { value: "KONTEKS", label: "Ganti konteks", ikon: "bi-signpost-split", keterangan: "Cerita, benda, atau tokoh diganti; keterampilan dan kesulitan sama." },
  { value: "KESULITAN", label: "Ubah kesulitan", ikon: "bi-sliders", keterangan: "Dibuat lebih mudah atau lebih sulit untuk TP yang sama." },
  { value: "LEVEL", label: "Ubah level kognitif", ikon: "bi-bar-chart-steps", keterangan: "Mis. dari C2 memahami menjadi C3 menerapkan atau C4 menganalisis." },
];

export default function ModalVarianAI({ soal, onTutup, onSelesai }) {
  const levelBerikut = LEVEL[Math.min(LEVEL.findIndex((l) => l.value === soal.level_kognitif) + 1, LEVEL.length - 1)]?.value || "C3";
  const [f, setF] = useState({ jenis: "ANGKA", target_level: levelBerikut, target_kesulitan: soal.tingkat_kesulitan === "SULIT" ? "SEDANG" : "SULIT", jumlah: 3, catatan: "", ai_mode: bacaAiMode() });
  const [proses, setProses] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    const esc = (e) => { if (e.key === "Escape" && !proses) onTutup(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onTutup, proses]);

  const kirim = async (e) => {
    e.preventDefault();
    simpanAiMode(f.ai_mode);
    setProses(true);
    try {
      const r = await minta("POST", `/bank-soal/${soal.id_soal}/varian`, { jenis: f.jenis, jumlah: Number(f.jumlah), catatan: f.catatan || null, ai_mode: f.ai_mode,
        target_level: f.jenis === "LEVEL" ? f.target_level : null, target_kesulitan: f.jenis === "KESULITAN" ? f.target_kesulitan : null });
      await Swal.fire({ icon: r.data.length ? "success" : "info", title: r.data.length ? "Varian siap" : "Belum ada varian baru", text: r.message, confirmButtonText: r.data.length ? "Lihat draf" : "Tutup" });
      onSelesai(r.data);
    } catch (err) { Swal.fire("AI belum berhasil", err.message, "warning"); }
    finally { setProses(false); }
  };

  return (
    <>
      <div className="modal d-block" tabIndex={-1} role="dialog" aria-modal="true" aria-label="Buat varian soal">
        <div className="modal-dialog modal-dialog-scrollable modal-lg">
          <form className="modal-content border-0 shadow" onSubmit={kirim}>
            <div className="modal-header">
              <h5 className="modal-title fw-bold"><i className="bi bi-shuffle text-primary me-2"></i>Buat varian soal dengan AI</h5>
              <button type="button" className="btn-close" onClick={onTutup} disabled={proses} aria-label="Tutup"></button>
            </div>
            <div className="modal-body">
              <div className="alert alert-light border small">
                <div className="fw-semibold mb-1">{labelBentuk(soal.bentuk)} · {soal.level_kognitif} · {soal.indikator?.deskripsi || soal.materi?.nama_materi || "TP belum dipilih"}</div>
                <div className="text-body-secondary">{soal.pertanyaan.length > 220 ? `${soal.pertanyaan.slice(0, 220)}…` : soal.pertanyaan}</div>
              </div>
              <div className="row g-2 mb-2" role="radiogroup" aria-label="Jenis varian">
                {JENIS_VARIAN.map((j) => (
                  <div key={j.value} className="col-sm-6">
                    <label className={`border rounded p-2 d-flex gap-2 h-100 ${f.jenis === j.value ? "border-primary bg-primary-subtle" : ""}`} style={{ cursor: "pointer" }}>
                      <input type="radio" className="form-check-input mt-1" name="jenisVarian" value={j.value} checked={f.jenis === j.value} onChange={() => set("jenis", j.value)} />
                      <span><span className="fw-semibold"><i className={`bi ${j.ikon} me-1`}></i>{j.label}</span><span className="d-block small text-body-secondary">{j.keterangan}</span></span>
                    </label>
                  </div>
                ))}
              </div>
              <div className="row g-2">
                {f.jenis === "LEVEL" && <div className="col-sm-4">
                  <label className="form-label small mb-1" htmlFor="vrLevel">Level tujuan</label>
                  <select id="vrLevel" className="form-select form-select-sm" value={f.target_level} onChange={(e) => set("target_level", e.target.value)}>
                    {LEVEL.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}</select></div>}
                {f.jenis === "KESULITAN" && <div className="col-sm-4">
                  <label className="form-label small mb-1" htmlFor="vrSulit">Kesulitan tujuan</label>
                  <select id="vrSulit" className="form-select form-select-sm" value={f.target_kesulitan} onChange={(e) => set("target_kesulitan", e.target.value)}>
                    {KESULITAN.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</select></div>}
                <div className="col-6 col-sm-4">
                  <label className="form-label small mb-1" htmlFor="vrJumlah">Jumlah varian</label>
                  <input id="vrJumlah" type="number" min={1} max={5} className="form-control form-control-sm" value={f.jumlah} onChange={(e) => set("jumlah", e.target.value)} />
                </div>
                <div className="col-6 col-sm-4">
                  <label className="form-label small mb-1" htmlFor="vrAi">Penyedia AI</label>
                  <select id="vrAi" className="form-select form-select-sm" value={f.ai_mode} onChange={(e) => set("ai_mode", e.target.value)}>
                    {AI_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select>
                </div>
                <div className="col-12">
                  <label className="form-label small mb-1" htmlFor="vrCatatan">Catatan untuk AI (opsional)</label>
                  <input id="vrCatatan" className="form-control form-control-sm" maxLength={1000} value={f.catatan} onChange={(e) => set("catatan", e.target.value)}
                    placeholder="mis. pakai konteks pasar dan kebun di kampung" />
                </div>
              </div>
              <div className="form-text mt-2">Varian masuk sebagai draf dan tetap perlu disetujui kepala sekolah. Varian yang terlalu mirip dengan soal yang sudah ada dilewati otomatis.</div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline-secondary" onClick={onTutup} disabled={proses}>Batal</button>
              <button className="btn btn-primary" disabled={proses}>{proses ? <span className="spinner-border spinner-border-sm me-1"></span> : <i className="bi bi-stars me-1"></i>}Buat varian</button>
            </div>
          </form>
        </div>
      </div>
      <div className="modal-backdrop show"></div>
    </>
  );
}
