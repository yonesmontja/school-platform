"use client";
// Panel penerbitan rapor resmi satu kelas: terbitkan (cuplikan nilai seperti tercetak + kode QR), pengesahan kepala
// sekolah, status per siswa (berubah setelah terbit, disahkan, diterima orang tua beserta tanggapannya).
import { useCallback, useEffect, useState } from "react";
import Swal from "sweetalert2";
import { minta } from "@/components/banksoal/api";
import { MODE_KALKULASI } from "./raporDokumen";

const waktu = (v) => (v ? new Date(v).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-");
const PERAN = { ortu: "orang tua", siswa: "siswa" };

export default function PenerbitanRapor({ idKelas, idPeriode, pengaturan, susunKiriman, onStatus }) {
  const [st, setSt] = useState(null);
  const [buka, setBuka] = useState(false);
  const [sibuk, setSibuk] = useState(false);

  const muat = useCallback(async () => {
    if (!idKelas || !idPeriode) { setSt(null); onStatus?.({}); return; }
    try {
      const d = await minta("GET", `/rapor/terbit?id_kelas=${encodeURIComponent(idKelas)}&id_periode=${encodeURIComponent(idPeriode)}`);
      setSt(d);
      onStatus?.(Object.fromEntries(d.data.filter((s) => s.terbit).map((s) => [s.id_siswa, s.terbit])));
    } catch (e) {
      setSt({ galat: e.message });
    }
  }, [idKelas, idPeriode, onStatus]);
  useEffect(() => { muat(); }, [muat]);

  const terbitkan = async () => {
    const kiriman = susunKiriman();
    if (!kiriman.length) return Swal.fire("Belum ada siswa", "Rombel ini belum punya siswa untuk diterbitkan rapornya.", "info");
    const mode = MODE_KALKULASI.find((m) => m.value === pengaturan.mode_kalkulasi)?.label || pengaturan.mode_kalkulasi;
    const ok = await Swal.fire({
      title: "Terbitkan rapor resmi?", icon: "question", showCancelButton: true, confirmButtonText: "Ya, terbitkan", cancelButtonText: "Batal",
      html: `<div class="text-start small">Rapor <b>${kiriman.length} siswa</b> diterbitkan dengan mode <b>${mode}</b> dan tanggal rapor yang dipilih.
        Setiap rapor mendapat kode QR keaslian dan tanda tangan elektronik Anda sebagai wali kelas.
        <br><br>Rapor yang sudah pernah terbit dan tidak berubah tidak dibuat ulang. Bila ada yang berubah, terbit versi baru,
        kode lama berstatus <i>diganti</i>, dan pengesahan kepala sekolah perlu diulang.</div>`,
    });
    if (!ok.isConfirmed) return;
    setSibuk(true);
    try {
      const r = await minta("POST", "/rapor/terbit", { id_kelas: idKelas, id_periode: idPeriode, ...pengaturan, siswa: kiriman });
      const h = r.hasil;
      Swal.fire({ icon: "success", title: "Rapor resmi diterbitkan", text: `${h.baru} baru, ${h.ulang} terbit ulang, ${h.tetap} tidak berubah.` });
      await muat();
    } catch (e) {
      Swal.fire("Gagal menerbitkan", e.message, "error");
    } finally {
      setSibuk(false);
    }
  };

  const sahkan = async (batal) => {
    const ok = await Swal.fire({
      title: batal ? "Batalkan pengesahan?" : "Sahkan rapor kelas ini?", icon: batal ? "warning" : "question", showCancelButton: true,
      confirmButtonText: batal ? "Ya, batalkan" : "Ya, sahkan", cancelButtonText: "Kembali",
      text: batal ? "Tanda tangan elektronik kepala sekolah dihapus dari rapor kelas ini." : "Tanda tangan elektronik kepala sekolah ditambahkan ke semua rapor resmi kelas ini.",
    });
    if (!ok.isConfirmed) return;
    setSibuk(true);
    try {
      const r = await minta("POST", "/rapor/terbit/sahkan", { id_kelas: idKelas, id_periode: idPeriode, batal });
      Swal.fire({ icon: "success", title: r.message, timer: 1800, showConfirmButton: false });
      await muat();
    } catch (e) {
      Swal.fire("Gagal", e.message, "error");
    } finally {
      setSibuk(false);
    }
  };

  if (!idKelas || !idPeriode) return null;
  if (!st) return <div className="small text-muted mb-3"><span className="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>Memuat status rapor resmi…</div>;
  if (st.galat) return <div className="alert alert-warning small mb-3">{st.galat}</div>;
  const r = st.ringkas;
  const semuaSah = r.terbit > 0 && r.disahkan === r.terbit;

  return (
    <section className="card border-0 shadow-sm mb-3" aria-labelledby="judul-terbit">
      <div className="card-body py-2">
        <div className="d-flex flex-wrap align-items-center gap-2">
          <h2 id="judul-terbit" className="h6 fw-bold mb-0 me-2"><i className="bi bi-patch-check me-1 text-primary" aria-hidden="true"></i>Rapor resmi</h2>
          <span className="badge text-bg-light border">{r.terbit}/{r.siswa} terbit</span>
          <span className={`badge ${semuaSah ? "text-bg-success" : "text-bg-light border"}`}>{r.disahkan} disahkan</span>
          <span className="badge text-bg-light border">{r.diterima} diterima orang tua</span>
          {r.berubah > 0 && <span className="badge text-bg-warning">{r.berubah} berubah setelah terbit</span>}
          <div className="ms-auto d-flex flex-wrap gap-2">
            <button type="button" className="btn btn-sm btn-outline-secondary" aria-expanded={buka} onClick={() => setBuka(!buka)}>
              <i className={`bi ${buka ? "bi-chevron-up" : "bi-list-check"} me-1`} aria-hidden="true"></i>Rincian
            </button>
            <button type="button" className="btn btn-sm btn-primary" disabled={sibuk} onClick={terbitkan}>
              <i className="bi bi-send-check me-1" aria-hidden="true"></i>{r.terbit ? "Terbitkan ulang yang berubah" : "Terbitkan rapor kelas"}
            </button>
            {st.boleh_sahkan && r.terbit > 0 && (semuaSah
              ? <button type="button" className="btn btn-sm btn-outline-danger" disabled={sibuk} onClick={() => sahkan(true)}>Batalkan pengesahan</button>
              : <button type="button" className="btn btn-sm btn-success" disabled={sibuk} onClick={() => sahkan(false)}><i className="bi bi-pen me-1" aria-hidden="true"></i>Sahkan ({r.terbit - r.disahkan})</button>)}
          </div>
        </div>
        {r.berubah > 0 && (
          <div className="small text-warning-emphasis mt-2">
            <i className="bi bi-exclamation-triangle me-1" aria-hidden="true"></i>Nilai, kehadiran, atau catatan {r.berubah} siswa berubah setelah rapornya terbit. Tekan Terbitkan ulang agar rapor resmi sesuai data terbaru.
          </div>
        )}
        {buka && (
          <div className="table-responsive mt-2">
            <table className="table table-sm small align-middle mb-0">
              <thead><tr><th scope="col">Siswa</th><th scope="col">Terbit</th><th scope="col">Kode</th><th scope="col">Disahkan</th><th scope="col">Diterima orang tua</th></tr></thead>
              <tbody>
                {st.data.map((s) => {
                  const t = s.terbit;
                  return (
                    <tr key={s.id_siswa} className={t?.berubah ? "table-warning" : ""}>
                      <td className="fw-semibold">{s.nama_siswa}</td>
                      <td>{t ? <>{waktu(t.diterbitkan_pada)}{t.versi > 1 && <span className="text-muted"> · v{t.versi}</span>}{t.berubah && <div className="text-warning-emphasis">Data berubah</div>}</> : <span className="text-muted">Belum</span>}</td>
                      <td>{t ? <a href={`/verifikasi/rapor/${t.kode_verifikasi}`} target="_blank" rel="noreferrer"><code>{t.kode_verifikasi}</code></a> : "-"}</td>
                      <td>{t?.disahkan_pada ? waktu(t.disahkan_pada) : <span className="text-muted">-</span>}</td>
                      <td>
                        {t?.diterima_pada ? (
                          <>
                            <i className="bi bi-check-circle-fill text-success me-1" aria-hidden="true"></i>{waktu(t.diterima_pada)}
                            {t.penerima && <span className="text-muted"> · {PERAN[t.penerima.role] || t.penerima.role}</span>}
                            {t.tanggapan_ortu && <div className="fst-italic">“{t.tanggapan_ortu}”</div>}
                          </>
                        ) : t ? <span className="text-muted">Belum</span> : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
