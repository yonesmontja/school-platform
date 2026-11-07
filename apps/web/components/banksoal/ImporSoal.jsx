"use client";
import { useState } from "react";
import Swal from "sweetalert2";
import { AI_MODES, bacaAiMode, simpanAiMode } from "./konstanta";
import { bacaBerkas, minta } from "./api";

const MAKS_MB = 10;

/** Tab Impor: paket soal lama (tempel teks, Word, PDF, atau foto) dipecah AI menjadi draf soal per TP. */
export default function ImporSoal({ referensi, onSelesai }) {
  const [f, setF] = useState(() => ({ id_mapel: referensi.mapel[0]?.id_mapel || "", id_kelas: "", teks: "", ai_mode: bacaAiMode() }));
  const [berkas, setBerkas] = useState(null);
  const [proses, setProses] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const perluBacaBerkas = berkas && !/\.docx$/i.test(berkas.name);
  const bisaBerkas = AI_MODES.find((m) => m.value === f.ai_mode)?.berkas;

  const pilih = (e) => {
    const file = e.target.files?.[0];
    if (file && file.size > MAKS_MB * 1024 * 1024) { e.target.value = ""; return Swal.fire("Berkas terlalu besar", `Maksimal ${MAKS_MB}MB.`, "warning"); }
    setBerkas(file || null);
  };

  const kirim = async (e) => {
    e.preventDefault();
    if (!f.teks.trim() && !berkas) return Swal.fire("Belum ada soal", "Tempel teks soal atau pilih berkas.", "info");
    simpanAiMode(f.ai_mode);
    setProses(true);
    try {
      const body = { ...f, id_kelas: f.id_kelas || null, teks: f.teks || null, ...(berkas ? { berkas_base64: await bacaBerkas(berkas), berkas_nama: berkas.name } : {}) };
      const data = await minta("POST", "/bank-soal/impor", body);
      await Swal.fire({ icon: "success", title: "Impor selesai", text: data.message, confirmButtonText: "Lihat draf" });
      setF((x) => ({ ...x, teks: "" }));
      setBerkas(null);
      onSelesai();
    } catch (err) { Swal.fire("Impor belum berhasil", err.message, "warning"); }
    finally { setProses(false); }
  };

  return (
    <form className="card shadow-sm" onSubmit={kirim}>
      <div className="card-header"><h3 className="card-title fw-semibold mb-0"><i className="bi bi-box-arrow-in-down me-2"></i>Impor Paket Soal Lama</h3></div>
      <div className="card-body">
        <p className="small text-muted">AI memecah paket soal menjadi butir-butir, menentukan kunci, level kognitif, dan bobot STNKM, lalu memasangkannya ke TP yang ada. Semua hasil masuk sebagai <b>draf</b> untuk diperiksa sebelum diajukan.</p>
        <div className="row g-2 mb-2">
          <div className="col-md-4"><label className="form-label small fw-semibold mb-1">Mata pelajaran</label>
            <select className="form-select form-select-sm" value={f.id_mapel} onChange={(e) => set("id_mapel", e.target.value)} aria-label="Mapel impor">
              {referensi.mapel.map((m) => <option key={m.id_mapel} value={m.id_mapel}>{m.nama_mapel}</option>)}
            </select></div>
          <div className="col-md-4"><label className="form-label small fw-semibold mb-1">Kelas</label>
            <select className="form-select form-select-sm" value={f.id_kelas} onChange={(e) => set("id_kelas", e.target.value)}>
              <option value="">Semua kelas</option>
              {referensi.kelas.map((k) => <option key={k.id_kelas} value={k.id_kelas}>{k.nama_kelas}</option>)}
            </select></div>
          <div className="col-md-4"><label className="form-label small fw-semibold mb-1">Penyedia AI</label>
            <select className="form-select form-select-sm" value={f.ai_mode} onChange={(e) => set("ai_mode", e.target.value)}>
              {AI_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}{m.berkas ? " (bisa baca PDF & foto)" : ""}</option>)}
            </select></div>
        </div>
        <label className="form-label small fw-semibold mb-1">Tempel teks soal</label>
        <textarea className="form-control form-control-sm mb-2" rows={8} maxLength={60000} value={f.teks} onChange={(e) => set("teks", e.target.value)} aria-label="Teks soal"
          placeholder={"1. 1/2 + 1/4 = ...\n   a. 3/4   b. 2/6   c. 1/6   d. 2/4\n2. ..."} />
        <div className="d-flex flex-wrap align-items-center gap-2">
          <label className="btn btn-sm btn-outline-primary mb-0"><i className="bi bi-paperclip me-1"></i>Pilih berkas
            <input type="file" hidden accept=".docx,application/pdf,image/png,image/jpeg,image/webp" onChange={pilih} /></label>
          {berkas ? <span className="small">{berkas.name} <button type="button" className="btn btn-sm btn-link text-danger p-0 ms-1" onClick={() => setBerkas(null)} aria-label="Hapus berkas"><i className="bi bi-x-lg"></i></button></span>
            : <span className="small text-muted">Word (.docx), PDF, atau foto lembar soal · maks. {MAKS_MB}MB</span>}
        </div>
        {perluBacaBerkas && !bisaBerkas && <div className="small text-warning-emphasis mt-2"><i className="bi bi-exclamation-triangle me-1"></i>PDF dan foto hanya bisa dibaca dengan Gemini atau Claude.</div>}
      </div>
      <div className="card-footer text-end">
        <button type="submit" className="btn btn-primary fw-semibold" disabled={proses || !referensi.mapel.length}>
          {proses ? <><span className="spinner-border spinner-border-sm me-2"></span>AI sedang membaca…</> : <><i className="bi bi-magic me-1"></i>Impor sebagai draf</>}
        </button>
      </div>
    </form>
  );
}
