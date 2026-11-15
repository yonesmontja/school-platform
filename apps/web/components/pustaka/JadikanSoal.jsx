"use client";
// Notebook AI → Bank Soal (Fase 23 Tahap B): satu hasil riset/tanya dokumen dijadikan draf soal oleh AI.
// Draf tersimpan di Bank Soal sebagai DRAF milik guru; tetap diperiksa, diajukan, dan disetujui seperti draf AI lain.
import { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import { minta } from "@/components/banksoal/api";
import { AI_MODES, BENTUK, KESULITAN, LEVEL, bacaAiMode, simpanAiMode } from "@/components/banksoal/konstanta";

const LABEL = { RINGKAS: "Ringkasan", RINCI: "Per bagian", POIN: "Poin penting", ISTILAH: "Istilah", EKSTRAK: "Data & tabel", FAQ: "Tanya-jawab umum", TANYA: "Tanya dokumen" };
// Bentuk yang cocok untuk tiap jenis bahan (pilihan awal)
const BENTUK_AWAL = { ISTILAH: "MENJODOHKAN", EKSTRAK: "ISIAN", FAQ: "PG", TANYA: "PG" };

export default function JadikanSoal({ riset, dokumen, onTutup }) {
  const [ref, setRef] = useState(null);
  const [f, setF] = useState(() => ({ id_mapel: dokumen.id_mapel || "", id_kelas: "", id_materi: "", id_indikator: "", bentuk: BENTUK_AWAL[riset.jenis] || "PG",
    level_kognitif: "C2", tingkat_kesulitan: "SEDANG", jumlah: 5, catatan: "", ai_mode: bacaAiMode() }));
  const [proses, setProses] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    minta("GET", "/bank-soal/referensi").then((r) => {
      setRef(r);
      setF((x) => ({ ...x, id_mapel: r.mapel.some((m) => m.id_mapel === x.id_mapel) ? x.id_mapel : r.mapel[0]?.id_mapel || "",
        bentuk: BENTUK.some((b) => b.value === x.bentuk) ? x.bentuk : "PG" }));
    }).catch((e) => Swal.fire("Gagal memuat", e.message, "error"));
  }, []);
  useEffect(() => {
    const esc = (e) => { if (e.key === "Escape" && !proses) { e.stopPropagation(); onTutup(); } };
    window.addEventListener("keydown", esc, true);
    return () => window.removeEventListener("keydown", esc, true);
  }, [onTutup, proses]);

  const materi = useMemo(() => (ref?.materi || []).filter((m) => m.id_mapel === f.id_mapel && (!f.id_kelas || !m.id_kelas || m.id_kelas === f.id_kelas)), [ref, f.id_mapel, f.id_kelas]);
  const tp = materi.find((m) => m.id_materi === f.id_materi)?.indikator || [];

  const kirim = async (e) => {
    e.preventDefault();
    simpanAiMode(f.ai_mode);
    setProses(true);
    try {
      const r = await minta("POST", "/bank-soal/ai/dari-riset", { ...f, id_riset: riset.id, id_kelas: f.id_kelas || null, id_materi: f.id_materi || null,
        id_indikator: f.id_indikator || null, catatan: f.catatan || null, jumlah: Number(f.jumlah) });
      const ok = await Swal.fire({ icon: "success", title: "Draf soal siap", text: r.message, showCancelButton: true, confirmButtonText: "Buka Bank Soal", cancelButtonText: "Tetap di Notebook" });
      if (ok.isConfirmed) window.open("/dashboard/bank-soal", "_blank", "noopener");
      onTutup();
    } catch (err) { Swal.fire("AI belum berhasil", err.message, "warning"); }
    finally { setProses(false); }
  };

  const ringkas = riset.jenis === "TANYA" ? riset.pertanyaan : LABEL[riset.jenis];
  return (
    <>
      <div className="modal d-block" tabIndex={-1} role="dialog" aria-modal="true" aria-label="Jadikan soal" style={{ zIndex: 1056 }}>
        <div className="modal-dialog modal-dialog-scrollable modal-lg">
          <form className="modal-content border-0 shadow" onSubmit={kirim}>
            <div className="modal-header">
              <div className="min-w-0"><h5 className="modal-title fw-bold"><i className="bi bi-patch-question text-success me-2"></i>Jadikan soal</h5>
                <div className="small text-body-secondary text-truncate">Bahan: {LABEL[riset.jenis]}{riset.jenis === "TANYA" ? ` · "${ringkas}"` : ""} · {dokumen.judul}</div></div>
              <button type="button" className="btn-close" onClick={onTutup} disabled={proses} aria-label="Tutup"></button>
            </div>
            <div className="modal-body">
              {!ref ? <div className="text-center py-4"><span className="spinner-border spinner-border-sm"></span></div> : !ref.mapel.length ? (
                <div className="alert alert-info mb-0">Anda belum mengampu mata pelajaran, jadi belum bisa menyusun soal.</div>
              ) : (
                <div className="row g-2">
                  <p className="small text-body-secondary mb-1">AI menyusun soal yang isinya hanya dari bahan Notebook ini. Hasilnya masuk ke Bank Soal sebagai <b>draf</b> untuk Anda periksa sebelum diajukan.</p>
                  <div className="col-sm-6">
                    <label className="form-label small mb-1" htmlFor="jsMapel">Mata pelajaran</label>
                    <select id="jsMapel" className="form-select form-select-sm" value={f.id_mapel} onChange={(e) => setF((x) => ({ ...x, id_mapel: e.target.value, id_materi: "", id_indikator: "" }))}>
                      {ref.mapel.map((m) => <option key={m.id_mapel} value={m.id_mapel}>{m.nama_mapel}</option>)}
                    </select>
                  </div>
                  <div className="col-sm-6">
                    <label className="form-label small mb-1" htmlFor="jsKelas">Kelas (opsional)</label>
                    <select id="jsKelas" className="form-select form-select-sm" value={f.id_kelas} onChange={(e) => setF((x) => ({ ...x, id_kelas: e.target.value, id_materi: "", id_indikator: "" }))}>
                      <option value="">Semua kelas</option>
                      {ref.kelas.map((k) => <option key={k.id_kelas} value={k.id_kelas}>{k.nama_kelas}</option>)}
                    </select>
                  </div>
                  <div className="col-sm-6">
                    <label className="form-label small mb-1" htmlFor="jsMateri">Materi (opsional)</label>
                    <select id="jsMateri" className="form-select form-select-sm" value={f.id_materi} onChange={(e) => setF((x) => ({ ...x, id_materi: e.target.value, id_indikator: "" }))}>
                      <option value="">Tanpa materi</option>
                      {materi.map((m) => <option key={m.id_materi} value={m.id_materi}>{m.nama_materi}</option>)}
                    </select>
                  </div>
                  <div className="col-sm-6">
                    <label className="form-label small mb-1" htmlFor="jsTp">Tujuan pembelajaran (opsional)</label>
                    <select id="jsTp" className="form-select form-select-sm" value={f.id_indikator} onChange={(e) => set("id_indikator", e.target.value)} disabled={!tp.length}>
                      <option value="">Tanpa TP</option>
                      {tp.map((t) => <option key={t.id_indikator} value={t.id_indikator}>{t.deskripsi}</option>)}
                    </select>
                  </div>
                  <div className="col-sm-6">
                    <label className="form-label small mb-1" htmlFor="jsBentuk">Bentuk soal</label>
                    <select id="jsBentuk" className="form-select form-select-sm" value={f.bentuk} onChange={(e) => set("bentuk", e.target.value)}>
                      {BENTUK.filter((b) => !["LENGKAPI_GAMBAR", "MEMBACA_NYARING"].includes(b.value)).map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
                    </select>
                  </div>
                  <div className="col-6 col-sm-3">
                    <label className="form-label small mb-1" htmlFor="jsLevel">Level</label>
                    <select id="jsLevel" className="form-select form-select-sm" value={f.level_kognitif} onChange={(e) => set("level_kognitif", e.target.value)}>
                      {LEVEL.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                    </select>
                  </div>
                  <div className="col-6 col-sm-3">
                    <label className="form-label small mb-1" htmlFor="jsSulit">Kesulitan</label>
                    <select id="jsSulit" className="form-select form-select-sm" value={f.tingkat_kesulitan} onChange={(e) => set("tingkat_kesulitan", e.target.value)}>
                      {KESULITAN.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                    </select>
                  </div>
                  <div className="col-6 col-sm-3">
                    <label className="form-label small mb-1" htmlFor="jsJumlah">Jumlah soal</label>
                    <input id="jsJumlah" type="number" min={1} max={10} className="form-control form-control-sm" value={f.jumlah} onChange={(e) => set("jumlah", e.target.value)} />
                  </div>
                  <div className="col-6 col-sm-3">
                    <label className="form-label small mb-1" htmlFor="jsAi">Penyedia AI</label>
                    <select id="jsAi" className="form-select form-select-sm" value={f.ai_mode} onChange={(e) => set("ai_mode", e.target.value)}>
                      {AI_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </div>
                  <div className="col-12">
                    <label className="form-label small mb-1" htmlFor="jsCatatan">Catatan untuk AI (opsional)</label>
                    <input id="jsCatatan" className="form-control form-control-sm" maxLength={1000} value={f.catatan} onChange={(e) => set("catatan", e.target.value)} placeholder="mis. untuk kelas 4, pakai contoh kehidupan sehari-hari di Papua" />
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline-secondary" onClick={onTutup} disabled={proses}>Batal</button>
              <button className="btn btn-success" disabled={proses || !ref?.mapel.length || !f.id_mapel}>
                {proses ? <span className="spinner-border spinner-border-sm me-1"></span> : <i className="bi bi-stars me-1"></i>}Buat draf soal</button>
            </div>
          </form>
        </div>
      </div>
      <div className="modal-backdrop show" style={{ zIndex: 1055 }}></div>
    </>
  );
}
