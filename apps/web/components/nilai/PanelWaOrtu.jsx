"use client";
import { useEffect, useState } from "react";
import Swal from "sweetalert2";
import { API_URL, authHeaders } from "@/app/lib/akses";

const JUDUL = {
  RENCANA: { judul: "Kabari Orang Tua: Rencana Tindak Lanjut", ikon: "bi-signpost-split" },
  HASIL: { judul: "Kabari Orang Tua: Hasil Remedial", ikon: "bi-clipboard-check" },
};

const bukaChat = (nomor, teks) => window.open(nomor ? `https://wa.me/${nomor}?text=${encodeURIComponent(teks)}` : `https://api.whatsapp.com/send?text=${encodeURIComponent(teks)}`, "_blank", "noopener");

/**
 * Pesan WhatsApp untuk orang tua/wali siswa remedial. Pesan disusun server (/remedial/notifikasi);
 * bila Fonnte aktif semuanya langsung dikirim otomatis, selain itu guru mengirimnya satu per satu lewat WA.
 * - jenis: "RENCANA" | "HASIL"
 * - idRencana: daftar id_rencana
 * - catatan: teks tambahan di atas daftar (opsional)
 */
export default function PanelWaOrtu({ jenis, idRencana, catatan, onTutup }) {
  const [pesan, setPesan] = useState(null);
  const [api, setApi] = useState(null); // hasil kirim otomatis
  const [galat, setGalat] = useState("");
  const [terkirim, setTerkirim] = useState({}); // id_rencana yang sudah dibuka chat manualnya

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onTutup(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onTutup]);

  useEffect(() => {
    let batal = false;
    const post = async (url, body) => {
      const res = await fetch(url, { method: "POST", headers: authHeaders(), body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok, data };
    };
    (async () => {
      const res = await post(`${API_URL}/remedial/notifikasi`, { jenis, id_rencana: idRencana });
      if (batal) return;
      if (!res.ok) return setGalat(res.data.message || "Pesan WhatsApp gagal disusun.");
      setPesan(res.data.data);
      const antrean = res.data.data.filter((p) => p.nomor).map((p) => ({ target: p.nomor, message: p.message }));
      if (res.data.wa_otomatis && antrean.length) {
        const kirim = await post(`${API_URL}/whatsapp`, { daftar_pesan: antrean });
        if (!batal) setApi(kirim.data.sent !== undefined ? kirim.data : { sent: false, reason: kirim.data.message });
      }
    })().catch(() => !batal && setGalat("Tidak dapat terhubung ke server."));
    return () => { batal = true; };
  }, [jenis, idRencana]);

  const salin = async (teks) => {
    try {
      await navigator.clipboard.writeText(teks);
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: "Pesan disalin, siap ditempel ke WA", showConfirmButton: false, timer: 2000 });
    } catch (e) { Swal.fire("Gagal menyalin", "Browser menolak akses clipboard.", "error"); }
  };

  const info = JUDUL[jenis];
  const tanpaNomor = pesan?.filter((p) => !p.nomor).length || 0;

  return (
    <>
      <div className="modal d-block" tabIndex={-1} role="dialog" aria-modal="true">
        <div className="modal-dialog modal-dialog-centered modal-dialog-scrollable">
          <div className="modal-content border-0 shadow">
            <div className="modal-header bg-success text-white">
              <h5 className="modal-title fw-bold fs-6"><i className={`bi ${info.ikon} me-2`}></i>{info.judul}</h5>
              <button type="button" className="btn-close btn-close-white" onClick={onTutup} aria-label="Tutup"></button>
            </div>
            <div className="modal-body">
              {catatan && <div className="small text-body-secondary mb-2">{catatan}</div>}
              {galat ? (
                <div className="alert alert-danger py-2 small mb-0">{galat}</div>
              ) : !pesan ? (
                <div className="text-center py-4"><span className="spinner-border spinner-border-sm me-2"></span>Menyusun pesan…</div>
              ) : pesan.length === 0 ? (
                <div className="alert alert-secondary py-2 small mb-0">Tidak ada pesan untuk dikirim.</div>
              ) : (
                <>
                  {api?.sent ? (
                    <div className="alert alert-success py-2 small"><i className="bi bi-robot me-1"></i><strong>Terkirim otomatis:</strong> {api.count} pesan WA lewat Fonnte.{tanpaNomor > 0 && ` ${tanpaNomor} siswa belum punya nomor; kirim manual di bawah.`}</div>
                  ) : api ? (
                    <div className="alert alert-warning py-2 small"><i className="bi bi-exclamation-triangle me-1"></i>Kirim otomatis gagal: {api.reason} Gunakan tombol di bawah.</div>
                  ) : (
                    <div className="alert alert-secondary py-2 small"><i className="bi bi-hand-index me-1"></i><strong>Mode manual:</strong> klik <b>Chat</b> untuk membuka WhatsApp dengan pesan yang sudah terisi.</div>
                  )}
                  <div className="list-group">
                    {pesan.map((p) => (
                      <div key={p.id_rencana} className="list-group-item py-2">
                        <div className="d-flex justify-content-between align-items-center gap-2">
                          <div className="text-truncate">
                            <strong className="small">{p.nama_siswa}</strong>{" "}
                            <small className="text-muted">{p.nomor ? `(${p.nomor})` : "(nomor WA ortu belum diisi)"}</small>
                          </div>
                          <div className="btn-group btn-group-sm flex-shrink-0">
                            <button type="button" className="btn btn-outline-secondary" title="Salin pesan" onClick={() => salin(p.message)}><i className="bi bi-clipboard"></i></button>
                            <button type="button" className={`btn ${terkirim[p.id_rencana] ? "btn-outline-success" : "btn-success"} text-nowrap`}
                              onClick={() => { bukaChat(p.nomor, p.message); setTerkirim((t) => ({ ...t, [p.id_rencana]: true })); }}>
                              <i className={`bi ${terkirim[p.id_rencana] ? "bi-check2" : "bi-whatsapp"} me-1`}></i>Chat
                            </button>
                          </div>
                        </div>
                        <details className="mt-1">
                          <summary className="small text-primary" role="button">Lihat pesan</summary>
                          <div className="small bg-body-tertiary border rounded p-2 mt-1" style={{ whiteSpace: "pre-wrap" }}>{p.message}</div>
                        </details>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div className="modal-footer py-2">
              <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onTutup}>Selesai</button>
            </div>
          </div>
        </div>
      </div>
      <div className="modal-backdrop show"></div>
    </>
  );
}
