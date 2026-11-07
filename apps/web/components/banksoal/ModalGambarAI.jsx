"use client";
import { useEffect, useState } from "react";
import { AI_MODES, MODEL_GAMBAR, bacaAiMode, simpanAiMode } from "./konstanta";
import { srcGambar, srcSvg } from "./PratinjauSoal";
import { minta } from "./api";

// Model gambar terakhir per penyedia diingat per perangkat (untuk mencoba model lain dari langganan sekolah)
const KUNCI_MODEL = "banksoal_model_gambar";
const bacaModel = () => { try { return JSON.parse(localStorage.getItem(KUNCI_MODEL) || "{}"); } catch (e) { return {}; } };
const simpanModel = (mode, model) => { try { localStorage.setItem(KUNCI_MODEL, JSON.stringify({ ...bacaModel(), [mode]: model })); } catch (e) { /* abaikan */ } };

/**
 * Buat gambar soal dengan AI: ilustrasi (Gemini, OpenKey, OpenRouter) atau diagram SVG (semua penyedia).
 * Hasil dipratinjau dulu; "Pakai gambar ini" memasangnya ke soal.
 */
export default function ModalGambarAI({ soal, onPakai, onTutup }) {
  const [mode, setMode] = useState(bacaAiMode);
  const bisaIlustrasi = AI_MODES.find((m) => m.value === mode)?.gambar;
  const [jenis, setJenis] = useState(bisaIlustrasi ? "ILUSTRASI" : "DIAGRAM");
  const [deskripsi, setDeskripsi] = useState(() => [
    soal.pertanyaan,
    soal.bentuk === "LENGKAPI_GAMBAR" ? "Beri angka 1, 2, 3, ... dengan garis penunjuk pada bagian yang harus dilengkapi siswa, tanpa menulis nama bagiannya." : "",
  ].filter(Boolean).join("\n"));
  const [model, setModel] = useState(() => bacaModel()[mode] || MODEL_GAMBAR[mode] || "");
  const [proses, setProses] = useState(false);
  const [hasil, setHasil] = useState(null); // {url} | {gambar_svg}
  const [galat, setGalat] = useState(null);

  useEffect(() => {
    setModel(bacaModel()[mode] || MODEL_GAMBAR[mode] || "");
    if (!AI_MODES.find((m) => m.value === mode)?.gambar) setJenis("DIAGRAM");
  }, [mode]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !proses) onTutup(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onTutup, proses]);

  const buat = async () => {
    simpanAiMode(mode);
    setProses(true); setGalat(null); setHasil(null);
    try {
      const body = { ai_mode: mode, jenis, deskripsi };
      if (jenis === "ILUSTRASI" && model.trim()) { body.model = model.trim(); simpanModel(mode, model.trim()); }
      const res = await minta("POST", "/bank-soal/ai/gambar", body);
      setHasil(res);
    } catch (err) { setGalat(err.message); }
    finally { setProses(false); }
  };

  return (
    <>
      <div className="modal d-block" tabIndex={-1} role="dialog" aria-modal="true" aria-label="Buat gambar dengan AI" style={{ zIndex: 1070 }}>
        <div className="modal-dialog modal-lg modal-dialog-scrollable">
          <div className="modal-content border-0 shadow">
            <div className="modal-header">
              <h5 className="modal-title fw-bold"><i className="bi bi-stars text-primary me-2"></i>Buat gambar dengan AI</h5>
              <button type="button" className="btn-close" onClick={onTutup} disabled={proses} aria-label="Tutup"></button>
            </div>
            <div className="modal-body">
              <div className="row g-2 mb-2">
                <div className="col-sm-6">
                  <label className="form-label small fw-semibold mb-1" htmlFor="gbMode">Penyedia AI</label>
                  <select id="gbMode" className="form-select form-select-sm" value={mode} onChange={(e) => setMode(e.target.value)} disabled={proses}>
                    {AI_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}{m.gambar ? "" : " (diagram saja)"}</option>)}
                  </select>
                </div>
                <div className="col-sm-6">
                  <div className="form-label small fw-semibold mb-1">Jenis gambar</div>
                  <div className="btn-group btn-group-sm w-100" role="group">
                    <input type="radio" className="btn-check" id="gbIlustrasi" checked={jenis === "ILUSTRASI"} onChange={() => setJenis("ILUSTRASI")} disabled={!bisaIlustrasi || proses} />
                    <label className="btn btn-outline-primary" htmlFor="gbIlustrasi"><i className="bi bi-palette me-1"></i>Ilustrasi</label>
                    <input type="radio" className="btn-check" id="gbDiagram" checked={jenis === "DIAGRAM"} onChange={() => setJenis("DIAGRAM")} disabled={proses} />
                    <label className="btn btn-outline-primary" htmlFor="gbDiagram"><i className="bi bi-bounding-box me-1"></i>Diagram (SVG)</label>
                  </div>
                </div>
              </div>
              <div className="form-text mt-0 mb-2">
                {jenis === "ILUSTRASI"
                  ? "Ilustrasi berwarna seperti gambar buku. Cocok untuk benda, hewan, dan suasana. Angka dan tulisan di dalam gambar kadang kurang tepat; periksa sebelum dipakai."
                  : "Diagram garis yang rapi: bangun datar, pecahan, garis bilangan, bagian tubuh bernomor. Bisa dibuat semua penyedia AI."}
              </div>

              <label className="form-label small fw-semibold mb-1" htmlFor="gbDeskripsi">Gambarkan apa yang diinginkan</label>
              <textarea id="gbDeskripsi" className="form-control mb-2" rows={4} maxLength={1500} value={deskripsi} onChange={(e) => setDeskripsi(e.target.value)} disabled={proses} />

              {jenis === "ILUSTRASI" && (
                <details className="small mb-2">
                  <summary className="text-muted">Model gambar (lanjutan)</summary>
                  <div className="d-flex gap-2 mt-1">
                    <input className="form-control form-control-sm" aria-label="Model gambar" value={model} onChange={(e) => setModel(e.target.value)} disabled={proses} placeholder={MODEL_GAMBAR[mode]} />
                    <button type="button" className="btn btn-sm btn-outline-secondary text-nowrap" onClick={() => setModel(MODEL_GAMBAR[mode] || "")} disabled={proses}>Bawaan</button>
                  </div>
                  <div className="form-text">Isi nama model gambar dari langganan sekolah, mis. gemini-2.5-flash-image, gpt-image-1, dall-e-3. Model terakhir diingat di perangkat ini.</div>
                </details>
              )}

              {galat && <div className="alert alert-warning small py-2 mb-2" role="alert"><i className="bi bi-exclamation-triangle me-1"></i>{galat}</div>}
              {proses && <div className="text-muted small py-3 text-center"><span className="spinner-border spinner-border-sm me-2"></span>AI sedang menggambar… biasanya 10–60 detik.</div>}
              {hasil && (
                <div className="text-center border rounded p-2 bg-white">
                  <img src={hasil.gambar_svg ? srcSvg(hasil.gambar_svg) : srcGambar(hasil.url)} alt="Hasil gambar AI" style={{ maxWidth: "100%", maxHeight: 360 }} />
                  {hasil.model && <div className="small text-muted mt-1">Model: {hasil.model}</div>}
                  {hasil.catatan && <div className="small text-warning-emphasis mt-1"><i className="bi bi-info-circle me-1"></i>{hasil.catatan}</div>}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline-secondary" onClick={onTutup} disabled={proses}>Batal</button>
              <button type="button" className="btn btn-outline-primary" onClick={buat} disabled={proses || deskripsi.trim().length < 5}>
                <i className="bi bi-stars me-1"></i>{hasil || galat ? "Buat ulang" : "Buat gambar"}
              </button>
              <button type="button" className="btn btn-primary" disabled={!hasil || proses} onClick={() => onPakai(hasil.gambar_svg ? { gambar_svg: hasil.gambar_svg, gambar_url: null } : { gambar_url: hasil.url, gambar_svg: null })}>
                <i className="bi bi-check2 me-1"></i>Pakai gambar ini
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="modal-backdrop show" style={{ zIndex: 1065 }}></div>
    </>
  );
}
