"use client";

// Dialog ekspor jadwal resmi: Roster mingguan atau Daftar sesi, untuk satu kelas / satu guru / semua, sebagai PDF atau PNG.
import { useState } from "react";
import Swal from "sweetalert2";
import { useAkses } from "@/app/lib/akses";
import { kirimAPI, pesanGalat } from "./FormJadwal";
import { seninDari, unduhPdfJadwal, unduhPngJadwal, ymd } from "./eksporJadwal";

const tglLokal = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };

/**
 * @param {{refData: object, tanggalAwal: Date, rentangTampil?: {start: Date, end: Date}, kelasAwal?: string, onClose: Function}} p
 */
export default function EksporJadwal({ refData, tanggalAwal, rentangTampil, kelasAwal = "", onClose }) {
  const { isGuru, idGuru } = useAkses();
  const senin = seninDari(tanggalAwal || new Date());
  const [f, setF] = useState({
    bentuk: "roster", format: "pdf",
    minggu: ymd(senin), jumlahMinggu: 1,
    dari: ymd(rentangTampil?.start || senin),
    sampai: ymd(rentangTampil?.end ? new Date(rentangTampil.end.getTime() - 86400000) : new Date(senin.getFullYear(), senin.getMonth(), senin.getDate() + 5)),
    id_kelas: kelasAwal, id_guru: isGuru ? idGuru || "" : "", batal: false,
  });
  const [sibuk, setSibuk] = useState(false);
  const ubah = (patch) => setF((x) => ({ ...x, ...patch }));

  const rentang = () => {
    if (f.bentuk === "roster") {
      const a = seninDari(tglLokal(f.minggu));
      return [a, new Date(a.getFullYear(), a.getMonth(), a.getDate() + 7 * Math.max(1, Number(f.jumlahMinggu) || 1))];
    }
    const a = tglLokal(f.dari), b = tglLokal(f.sampai);
    return [a, new Date(b.getFullYear(), b.getMonth(), b.getDate() + 1)];
  };

  const ekspor = async (e) => {
    e.preventDefault();
    const [dari, sampai] = rentang();
    if (sampai <= dari) return Swal.fire("Perhatian", "Tanggal akhir harus setelah tanggal awal.", "warning");
    if ((sampai - dari) / 86400000 > 190) return Swal.fire("Perhatian", "Rentang ekspor maksimal sekitar satu semester (190 hari).", "warning");
    setSibuk(true);
    try {
      const r = await kirimAPI("GET", `/jadwal?${new URLSearchParams({ start: ymd(dari), end: ymd(sampai) })}`);
      if (!r.ok) return Swal.fire("Gagal memuat jadwal", pesanGalat(r.json), "error");
      const rows = (r.json.data || []).filter((s) => (!f.id_kelas || s.id_kelas === f.id_kelas) && (!f.id_guru || s.id_guru === f.id_guru) && (f.batal || s.status_sesi !== "Batal"));
      const kelas = refData?.classes?.find((k) => k.id_kelas === f.id_kelas)?.nama_kelas;
      const guru = refData?.teachers?.find((t) => t.id_guru === f.id_guru)?.nama_guru;
      const o = { bentuk: f.bentuk, dari, sampai, kelas: f.id_kelas, guru: f.id_guru, keterangan: [kelas && `Kelas ${kelas}`, guru && `Guru ${guru}`].filter(Boolean).join(" · ") || "Semua kelas" };
      if (f.format === "pdf") await unduhPdfJadwal(rows, o, refData?.settings);
      else await unduhPngJadwal(rows, o, refData?.settings);
      onClose();
    } catch (err) {
      Swal.fire("Gagal mengekspor", err.message, "error");
    } finally { setSibuk(false); }
  };

  return (
    <>
      <div className="modal fade show d-block" tabIndex="-1" role="dialog" aria-modal="true" aria-labelledby="judulEkspor" onClick={(e) => e.target === e.currentTarget && !sibuk && onClose()}>
        <div className="modal-dialog modal-dialog-centered">
          <form className="modal-content border-0 shadow rounded-4" onSubmit={ekspor}>
            <div className="modal-header border-0 pb-0">
              <h5 className="modal-title fw-bold" id="judulEkspor"><i className="bi bi-file-earmark-arrow-down me-2 text-primary"></i>Ekspor jadwal resmi</h5>
              <button type="button" className="btn-close" onClick={onClose} disabled={sibuk} aria-label="Tutup"></button>
            </div>
            <div className="modal-body">
              <div className="small fw-semibold mb-1">Bentuk</div>
              <div className="jadwal-segment mb-3">
                <button type="button" className={f.bentuk === "roster" ? "active" : ""} onClick={() => ubah({ bentuk: "roster" })}><i className="bi bi-grid-3x3 me-1"></i>Roster mingguan</button>
                <button type="button" className={f.bentuk === "daftar" ? "active" : ""} onClick={() => ubah({ bentuk: "daftar" })}><i className="bi bi-list-ul me-1"></i>Daftar sesi</button>
              </div>

              {f.bentuk === "roster" ? (
                <div className="row g-2 mb-3">
                  <div className="col-7">
                    <label className="form-label small fw-semibold mb-1" htmlFor="ekMinggu">Minggu (pilih tanggal mana pun)</label>
                    <input id="ekMinggu" type="date" className="form-control" value={f.minggu} onChange={(e) => ubah({ minggu: e.target.value })} required />
                  </div>
                  <div className="col-5">
                    <label className="form-label small fw-semibold mb-1" htmlFor="ekJumlah">Jumlah minggu</label>
                    <input id="ekJumlah" type="number" min="1" max="26" className="form-control" value={f.jumlahMinggu} onChange={(e) => ubah({ jumlahMinggu: e.target.value })} />
                  </div>
                </div>
              ) : (
                <div className="row g-2 mb-3">
                  <div className="col-6">
                    <label className="form-label small fw-semibold mb-1" htmlFor="ekDari">Dari tanggal</label>
                    <input id="ekDari" type="date" className="form-control" value={f.dari} onChange={(e) => ubah({ dari: e.target.value })} required />
                  </div>
                  <div className="col-6">
                    <label className="form-label small fw-semibold mb-1" htmlFor="ekSampai">Sampai tanggal</label>
                    <input id="ekSampai" type="date" className="form-control" value={f.sampai} onChange={(e) => ubah({ sampai: e.target.value })} required />
                  </div>
                </div>
              )}

              <div className="row g-2 mb-3">
                <div className="col-6">
                  <label className="form-label small fw-semibold mb-1" htmlFor="ekKelas">Kelas</label>
                  <select id="ekKelas" className="form-select" value={f.id_kelas} onChange={(e) => ubah({ id_kelas: e.target.value })}>
                    <option value="">Semua kelas</option>
                    {(refData?.classes || []).map((k) => <option key={k.id_kelas} value={k.id_kelas}>{k.nama_kelas}</option>)}
                  </select>
                </div>
                <div className="col-6">
                  <label className="form-label small fw-semibold mb-1" htmlFor="ekGuru">Guru</label>
                  <select id="ekGuru" className="form-select" value={f.id_guru} onChange={(e) => ubah({ id_guru: e.target.value })}>
                    <option value="">Semua guru</option>
                    {(refData?.teachers || []).map((t) => <option key={t.id_guru} value={t.id_guru}>{t.nama_guru}</option>)}
                  </select>
                </div>
              </div>

              <div className="small fw-semibold mb-1">Format</div>
              <div className="d-flex gap-3 mb-2">
                <div className="form-check">
                  <input className="form-check-input" type="radio" name="ekFormat" id="ekPdf" checked={f.format === "pdf"} onChange={() => ubah({ format: "pdf" })} />
                  <label className="form-check-label" htmlFor="ekPdf"><i className="bi bi-file-earmark-pdf text-danger me-1"></i>PDF (A4 lanskap)</label>
                </div>
                <div className="form-check">
                  <input className="form-check-input" type="radio" name="ekFormat" id="ekPng" checked={f.format === "png"} onChange={() => ubah({ format: "png" })} />
                  <label className="form-check-label" htmlFor="ekPng"><i className="bi bi-file-earmark-image text-success me-1"></i>Gambar PNG</label>
                </div>
              </div>
              <div className="form-check form-switch">
                <input className="form-check-input" type="checkbox" id="ekBatal" checked={f.batal} onChange={(e) => ubah({ batal: e.target.checked })} />
                <label className="form-check-label small" htmlFor="ekBatal">Sertakan sesi yang dibatalkan</label>
              </div>
              <div className="form-text">Berkop logo sekolah dan bertanda tangan kepala sekolah, sesuai Pengaturan Sekolah.</div>
            </div>
            <div className="modal-footer border-0">
              <button type="button" className="btn btn-light" onClick={onClose} disabled={sibuk}>Batal</button>
              <button type="submit" className="btn btn-primary px-4 fw-semibold" disabled={sibuk}>
                {sibuk ? <span className="spinner-border spinner-border-sm me-2"></span> : <i className="bi bi-download me-1"></i>}Unduh {f.format.toUpperCase()}
              </button>
            </div>
          </form>
        </div>
      </div>
      <div className="modal-backdrop fade show"></div>
    </>
  );
}
