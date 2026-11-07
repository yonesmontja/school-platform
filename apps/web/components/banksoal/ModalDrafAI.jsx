"use client";
import { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import { AI_MODES, BENTUK, DIMENSI, KESULITAN, LEVEL, bacaAiMode, simpanAiMode } from "./konstanta";
import { minta } from "./api";

/**
 * Minta AI membuat draf soal untuk satu TP (atau satu baris kisi-kisi bila `baris` diisi).
 * Hasil tersimpan sebagai draf milik guru; tidak ada yang dipakai sebelum disetujui kepala sekolah.
 */
export default function ModalDrafAI({ referensi, baris, kisi, onTutup, onSelesai }) {
  const [f, setF] = useState(() => ({
    id_mapel: kisi?.id_mapel || referensi.mapel[0]?.id_mapel || "", id_kelas: kisi?.id_kelas || "",
    id_materi: baris?.id_materi || "", id_indikator: baris?.id_indikator || "",
    bentuk: baris?.bentuk || "PG", level_kognitif: baris?.level_kognitif || "C2", tingkat_kesulitan: baris?.tingkat_kesulitan || "SEDANG",
    dimensi: baris?.dimensi || "", jumlah: Math.min(baris ? Math.max(baris.jumlah - (baris.soal?.length || 0), 1) : 3, 10),
    gambar: false, catatan: "", ai_mode: bacaAiMode(),
  }));
  const [proses, setProses] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !proses) onTutup(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onTutup, proses]);

  const materiMapel = useMemo(() => (referensi.materi || []).filter((m) => m.id_mapel === f.id_mapel && (!f.id_kelas || !m.id_kelas || m.id_kelas === f.id_kelas)), [referensi, f.id_mapel, f.id_kelas]);
  const tpMateri = materiMapel.find((m) => m.id_materi === f.id_materi)?.indikator || [];

  const kirim = async (e) => {
    e.preventDefault();
    if (!f.id_indikator && !f.id_materi) return Swal.fire("Pilih materi atau TP", "AI perlu tahu materi atau tujuan pembelajaran yang diukur.", "info");
    simpanAiMode(f.ai_mode);
    setProses(true);
    try {
      const body = baris
        ? { id_kisi_baris: baris.id, jumlah: f.jumlah, gambar: f.gambar, catatan: f.catatan || null, ai_mode: f.ai_mode }
        : { ...f, id_kelas: f.id_kelas || null, id_materi: f.id_materi || null, id_indikator: f.id_indikator || null, dimensi: f.dimensi || null, catatan: f.catatan || null };
      const data = await minta("POST", "/bank-soal/ai/draf", body);
      await Swal.fire({ icon: "success", title: "Draf soal siap", text: data.message, confirmButtonText: "Lihat draf" });
      onSelesai(data.data);
    } catch (err) { Swal.fire("AI belum berhasil", err.message, "warning"); }
    finally { setProses(false); }
  };

  return (
    <>
      <div className="modal d-block" tabIndex={-1} role="dialog" aria-modal="true" aria-label="Buat soal dengan AI">
        <div className="modal-dialog modal-dialog-scrollable modal-lg">
          <form className="modal-content border-0 shadow" onSubmit={kirim}>
            <div className="modal-header">
              <h5 className="modal-title fw-bold"><i className="bi bi-magic text-primary me-2"></i>Buat Soal dengan AI</h5>
              <button type="button" className="btn-close" onClick={onTutup} disabled={proses} aria-label="Tutup"></button>
            </div>
            <div className="modal-body">
              {baris ? (
                <div className="alert alert-light border small mb-3">
                  <b>Baris kisi-kisi:</b> {baris.indikator?.deskripsi || baris.materi?.nama_materi || "-"} · {BENTUK.find((b) => b.value === baris.bentuk)?.label} · {baris.level_kognitif}
                  {baris.dimensi && ` · dimensi ${baris.dimensi}`} · rencana {baris.jumlah} soal, sudah {baris.soal?.length || 0}
                </div>
              ) : (
                <div className="row g-2 mb-2">
                  <div className="col-sm-6">
                    <label className="form-label small fw-semibold mb-1">Mata pelajaran</label>
                    <select className="form-select form-select-sm" value={f.id_mapel} onChange={(e) => setF((x) => ({ ...x, id_mapel: e.target.value, id_materi: "", id_indikator: "" }))}>
                      {referensi.mapel.map((m) => <option key={m.id_mapel} value={m.id_mapel}>{m.nama_mapel}</option>)}
                    </select>
                  </div>
                  <div className="col-sm-6">
                    <label className="form-label small fw-semibold mb-1">Kelas</label>
                    <select className="form-select form-select-sm" value={f.id_kelas} onChange={(e) => set("id_kelas", e.target.value)}>
                      <option value="">Semua kelas</option>
                      {referensi.kelas.map((k) => <option key={k.id_kelas} value={k.id_kelas}>{k.nama_kelas}</option>)}
                    </select>
                  </div>
                  <div className="col-sm-6">
                    <label className="form-label small fw-semibold mb-1">Materi</label>
                    <select className="form-select form-select-sm" value={f.id_materi} onChange={(e) => setF((x) => ({ ...x, id_materi: e.target.value, id_indikator: "" }))} aria-label="Materi">
                      <option value="">— Pilih materi —</option>
                      {materiMapel.map((m) => <option key={m.id_materi} value={m.id_materi}>{m.nama_materi}</option>)}
                    </select>
                  </div>
                  <div className="col-sm-6">
                    <label className="form-label small fw-semibold mb-1">Tujuan pembelajaran (TP)</label>
                    <select className="form-select form-select-sm" value={f.id_indikator} onChange={(e) => set("id_indikator", e.target.value)} disabled={!tpMateri.length} aria-label="TP">
                      <option value="">{tpMateri.length ? "— Pilih TP —" : "Materi belum punya TP"}</option>
                      {tpMateri.map((t) => <option key={t.id_indikator} value={t.id_indikator}>{t.deskripsi}</option>)}
                    </select>
                  </div>
                  <div className="col-sm-4">
                    <label className="form-label small fw-semibold mb-1">Bentuk soal</label>
                    <select className="form-select form-select-sm" value={f.bentuk} onChange={(e) => set("bentuk", e.target.value)} aria-label="Bentuk soal AI">
                      {BENTUK.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
                    </select>
                  </div>
                  <div className="col-sm-4">
                    <label className="form-label small fw-semibold mb-1">Level kognitif</label>
                    <select className="form-select form-select-sm" value={f.level_kognitif} onChange={(e) => set("level_kognitif", e.target.value)}>
                      {LEVEL.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                    </select>
                  </div>
                  <div className="col-sm-4">
                    <label className="form-label small fw-semibold mb-1">Tingkat kesulitan</label>
                    <select className="form-select form-select-sm" value={f.tingkat_kesulitan} onChange={(e) => set("tingkat_kesulitan", e.target.value)}>
                      {KESULITAN.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                    </select>
                  </div>
                  <div className="col-sm-8">
                    <label className="form-label small fw-semibold mb-1">Dimensi STNKM yang ditonjolkan</label>
                    <select className="form-select form-select-sm" value={f.dimensi} onChange={(e) => set("dimensi", e.target.value)}>
                      <option value="">Biarkan AI menyesuaikan</option>
                      {DIMENSI.map((d) => <option key={d.key} value={d.key}>{d.key} · {d.label}</option>)}
                    </select>
                  </div>
                </div>
              )}

              <div className="row g-2">
                <div className="col-sm-4">
                  <label className="form-label small fw-semibold mb-1">Jumlah soal</label>
                  <input type="number" className="form-control form-control-sm" min={1} max={10} value={f.jumlah} onChange={(e) => set("jumlah", Math.min(Math.max(Number(e.target.value) || 1, 1), 10))} aria-label="Jumlah soal" />
                </div>
                <div className="col-sm-8">
                  <label className="form-label small fw-semibold mb-1">Penyedia AI</label>
                  <select className="form-select form-select-sm" value={f.ai_mode} onChange={(e) => set("ai_mode", e.target.value)} aria-label="Penyedia AI">
                    {AI_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
                <div className="col-12">
                  <label className="form-label small fw-semibold mb-1">Permintaan tambahan <span className="text-muted fw-normal">(opsional)</span></label>
                  <textarea className="form-control form-control-sm" rows={2} maxLength={1000} value={f.catatan} onChange={(e) => set("catatan", e.target.value)}
                    placeholder="mis. pakai konteks kebun dan pasar di Nabire; hindari angka lebih dari 100" />
                </div>
                <div className="col-12">
                  <div className="form-check form-switch">
                    <input className="form-check-input" type="checkbox" id="aiGambar" checked={f.gambar} onChange={(e) => set("gambar", e.target.checked)} />
                    <label className="form-check-label small" htmlFor="aiGambar">Sertakan diagram bila membantu (bangun datar, pecahan, grafik, tabel)</label>
                  </div>
                </div>
              </div>
              <div className="small text-muted mt-3">
                <i className="bi bi-shield-check me-1"></i>Hasil AI disimpan sebagai <b>draf</b>. Periksa dan edit dulu, lalu ajukan ke kepala sekolah.
                AI juga meniru gaya soal sekolah yang sudah disetujui untuk TP yang sama.
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline-secondary" onClick={onTutup} disabled={proses}>Batal</button>
              <button type="submit" className="btn btn-primary fw-semibold" disabled={proses}>
                {proses ? <><span className="spinner-border spinner-border-sm me-2"></span>AI sedang menyusun…</> : <><i className="bi bi-magic me-1"></i>Buat draf soal</>}
              </button>
            </div>
          </form>
        </div>
      </div>
      <div className="modal-backdrop show"></div>
    </>
  );
}
