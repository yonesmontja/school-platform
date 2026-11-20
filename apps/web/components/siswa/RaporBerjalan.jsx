"use client";
import { useEffect, useState } from "react";
import Swal from "sweetalert2";
import { minta } from "@/components/banksoal/api";

const STATUS = { HADIR: ["H", "success"], SAKIT: ["S", "warning"], IZIN: ["I", "info"], ALPA: ["A", "danger"] };
const hari = (t) => new Date(`${t}T00:00:00`).toLocaleDateString("id-ID", { weekday: "short", day: "numeric" });

/**
 * Rapor berjalan: ringkasan satu pekan (kehadiran, nilai baru, tindak lanjut, catatan baik) untuk orang tua.
 * Staf mendapat tombol kirim lewat WhatsApp (membuka WA dengan teks siap kirim) dan salin teks.
 */
export default function RaporBerjalan({ idSiswa, staf = false }) {
  const [minggu, setMinggu] = useState(0);
  const [d, setD] = useState(null);
  const [galat, setGalat] = useState("");

  useEffect(() => {
    if (!idSiswa) return;
    setD(null);
    minta("GET", `/portal/pekan?${new URLSearchParams({ id_siswa: idSiswa, minggu })}`).then((r) => { setD(r); setGalat(""); }).catch((e) => setGalat(e.message));
  }, [idSiswa, minggu]);

  const salin = async () => {
    try { await navigator.clipboard.writeText(d.teks); Swal.fire({ toast: true, position: "top-end", icon: "success", title: "Teks ringkasan disalin", showConfirmButton: false, timer: 2200 }); }
    catch (e) { Swal.fire({ title: "Salin teks ini", input: "textarea", inputValue: d.teks, confirmButtonText: "Tutup" }); }
  };

  return (
    <div className="card shadow-sm border-0 mb-3" data-rapor-berjalan>
      <div className="card-body">
        <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
          <i className="bi bi-calendar-range text-primary fs-5"></i>
          <div className="me-auto">
            <div className="fw-bold">Rapor berjalan · pekan {d?.pekan?.judul || "…"}</div>
            <div className="small text-body-secondary">Ringkasan mingguan untuk orang tua, tanpa menunggu rapor semester.</div>
          </div>
          <div className="btn-group btn-group-sm">
            <button type="button" className="btn btn-outline-secondary" onClick={() => setMinggu((m) => Math.max(-26, m - 1))} aria-label="Pekan sebelumnya"><i className="bi bi-chevron-left"></i></button>
            <button type="button" className="btn btn-outline-secondary" onClick={() => setMinggu(0)} disabled={minggu === 0}>Pekan ini</button>
            <button type="button" className="btn btn-outline-secondary" onClick={() => setMinggu((m) => Math.min(0, m + 1))} disabled={minggu === 0} aria-label="Pekan berikutnya"><i className="bi bi-chevron-right"></i></button>
          </div>
        </div>

        {galat && <div className="alert alert-warning small mb-0">{galat}</div>}
        {!d && !galat && <div className="small text-body-secondary"><span className="spinner-border spinner-border-sm me-2"></span>Memuat…</div>}
        {d && (
          <div className="row g-3">
            <div className="col-md-4">
              <div className="small fw-semibold mb-1"><i className="bi bi-calendar-check me-1"></i>Kehadiran</div>
              {d.presensi.length === 0 ? <div className="small text-body-secondary">Belum ada catatan presensi.</div> : (
                <div className="d-flex flex-wrap gap-1" data-pekan-presensi>
                  {d.presensi.map((p) => (
                    <span key={p.tanggal} className={`badge text-bg-${STATUS[p.status]?.[1] || "secondary"}`} title={p.keterangan || p.status}>{hari(p.tanggal)} · {STATUS[p.status]?.[0] || p.status}</span>
                  ))}
                </div>
              )}
              {d.catatan_perhatian > 0 && <div className="small text-warning mt-2"><i className="bi bi-chat-square-text me-1"></i>{d.catatan_perhatian} catatan perilaku perlu dibicarakan dengan wali kelas.</div>}
            </div>
            <div className="col-md-4">
              <div className="small fw-semibold mb-1"><i className="bi bi-journal-check me-1"></i>Nilai baru</div>
              {d.nilai.length === 0 ? <div className="small text-body-secondary">Belum ada nilai baru.</div> : (
                <ul className="list-unstyled small mb-0" data-pekan-nilai>
                  {d.nilai.map((n, i) => (
                    <li key={i} className="d-flex gap-2"><span className="me-auto">{n.mapel}{n.materi ? <span className="text-body-secondary"> · {n.materi}</span> : null}</span>
                      <b className={n.tuntas ? "text-success" : "text-danger"}>{n.nilai}</b></li>
                  ))}
                </ul>
              )}
              {d.remedial.length > 0 && <div className="small mt-2"><i className="bi bi-arrow-repeat me-1 text-warning"></i>{d.remedial.map((r) => `${r.mapel} (${r.tindakan}${r.status === "SELESAI" ? ", selesai" : ""})`).join("; ")}</div>}
            </div>
            <div className="col-md-4">
              <div className="small fw-semibold mb-1"><i className="bi bi-stars me-1"></i>Catatan baik</div>
              {d.catatan_positif.length === 0 ? <div className="small text-body-secondary">Belum ada catatan pekan ini.</div>
                : d.catatan_positif.slice(0, 3).map((c, i) => <div key={i} className="small mb-1">“{c.narasi}”</div>)}
            </div>
          </div>
        )}

        {d && staf && (
          <div className="d-flex flex-wrap gap-2 mt-3 pt-2 border-top">
            {d.tautan_wa
              ? <a className="btn btn-sm btn-success" href={d.tautan_wa} target="_blank" rel="noopener" data-kirim-wa-pekan><i className="bi bi-whatsapp me-1"></i>Kirim ke orang tua lewat WhatsApp</a>
              : <span className="small text-body-secondary align-self-center"><i className="bi bi-info-circle me-1"></i>Nomor WA orang tua belum diisi di data keluarga.</span>}
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={salin}><i className="bi bi-clipboard me-1"></i>Salin teks</button>
          </div>
        )}
      </div>
    </div>
  );
}
