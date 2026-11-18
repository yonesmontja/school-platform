"use client";
import { useCallback, useEffect, useState } from "react";
import Swal from "sweetalert2";
import { minta } from "@/components/banksoal/api";
import { gagal, lihatBerkas, tgl, toast } from "../administrasi/bantu";

const WARNA = { BARU: "warning", DIBACA: "info", SELESAI: "success" };
const NAMA = { BARU: "Belum dibaca", DIBACA: "Sedang dikerjakan", SELESAI: "Selesai" };

/** Disposisi surat untuk akun ini (semua staf): baca surat, buka pindaian, catat tindak lanjut. */
export default function DisposisiPage() {
  const [daftar, setDaftar] = useState(null);
  const muat = useCallback(() => minta("GET", "/disposisi").then((r) => setDaftar(r.data)).catch(gagal), []);
  useEffect(() => { muat(); }, [muat]);

  const buka = async (d) => {
    if (d.status === "BARU") { await minta("POST", `/disposisi/${d.id}/baca`).catch(() => {}); muat(); }
    if (d.surat?.berkas_nama) lihatBerkas(`/disposisi/${d.id}/berkas`);
  };
  const selesai = async (d) => {
    const r = await Swal.fire({ title: "Catat tindak lanjut", text: d.surat?.perihal, input: "textarea", inputLabel: "Apa yang sudah dilakukan?",
      inputValidator: (v) => (!v?.trim() ? "Tulis tindak lanjutnya." : null), showCancelButton: true, confirmButtonText: "Simpan", cancelButtonText: "Batal" });
    if (!r.isConfirmed) return;
    try { const x = await minta("POST", `/disposisi/${d.id}/selesai`, { tindak_lanjut: r.value }); toast(x.message); muat(); } catch (e) { gagal(e); }
  };

  return (
    <div className="container-fluid py-3" style={{ maxWidth: 900 }}>
      <h3 className="fw-bold mb-1"><i className="bi bi-envelope-paper text-primary me-2"></i>Disposisi Surat</h3>
      <div className="small text-muted mb-3">Surat yang diteruskan kepala sekolah atau petugas tata usaha kepada Anda.</div>
      <div className="list-group">
        {!daftar && <div className="list-group-item text-muted">Memuat…</div>}
        {daftar?.length === 0 && <div className="list-group-item text-muted text-center py-4"><i className="bi bi-inbox fs-3 d-block mb-1"></i>Belum ada disposisi untuk Anda.</div>}
        {daftar?.map((d) => (
          <div key={d.id} className="list-group-item" data-disposisi={d.surat?.perihal}>
            <div className="d-flex align-items-start gap-2">
              <div className="me-auto">
                <div className="fw-semibold">{d.surat?.perihal} <span className={`badge text-bg-${WARNA[d.status]} ms-1`} data-status-disposisi>{NAMA[d.status]}</span></div>
                <div className="small text-muted">Dari {d.surat?.pengirim}{d.surat?.nomor_surat ? ` · No. ${d.surat.nomor_surat}` : ""} · diterima sekolah {tgl(d.surat?.tanggal_terima)}</div>
                <div className="mt-1"><i className="bi bi-chat-square-text me-1 text-primary"></i><b>{d.instruksi}</b>{d.batas_waktu && <span className="small text-danger"> · sampai {tgl(d.batas_waktu)}</span>}
                  <span className="small text-muted"> — {d.dari?.name}</span></div>
                {d.surat?.ringkasan && <div className="small mt-1">{d.surat.ringkasan}</div>}
                {d.tindak_lanjut && <div className="small text-success mt-1"><i className="bi bi-check2-circle me-1"></i>{d.tindak_lanjut}</div>}
              </div>
              <div className="d-flex flex-column gap-1">
                <button type="button" className="btn btn-sm btn-outline-secondary text-nowrap" onClick={() => buka(d)}>
                  <i className={`bi ${d.surat?.berkas_nama ? "bi-paperclip" : "bi-eye"} me-1`}></i>{d.surat?.berkas_nama ? "Buka surat" : "Tandai dibaca"}
                </button>
                {d.status !== "SELESAI" && <button type="button" className="btn btn-sm btn-success text-nowrap" onClick={() => selesai(d)}><i className="bi bi-check2 me-1"></i>Selesai</button>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
