"use client";
import { useEffect, useRef, useState } from "react";
import Swal from "sweetalert2";
import { hapusAntrean, kirimAntrean, mulaiAntrean, useAntrean, useOnline } from "@/app/lib/antrean";
import { siapkanOffline } from "@/app/lib/siapOffline";
import { bacaUser } from "@/app/lib/akses";

const waktu = (iso) => new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Pita di atas konten saat offline: nilai & jurnal tetap bisa diisi, terkirim nanti. */
export function PitaOffline() {
  const online = useOnline();
  const { jumlah } = useAntrean();
  if (online) return null;
  return (
    <div className="alert alert-warning d-flex align-items-center gap-2 py-2 mb-3 pita-offline" role="status">
      <i className="bi bi-wifi-off"></i>
      <div className="small">
        <b>Anda sedang offline.</b> Nilai, jurnal, dan presensi tetap bisa disimpan di HP ini dan terkirim otomatis saat tersambung lagi
        {jumlah > 0 && <> · <b>{jumlah}</b> menunggu dikirim</>}.
      </div>
    </div>
  );
}

/** Tombol di topbar: jumlah kiriman yang menunggu + panel daftar antrean. Tidak tampil bila antrean kosong. */
export default function AntreanOffline() {
  const { jumlah, gagal, mengirim, daftar } = useAntrean();
  const online = useOnline();
  const [buka, setBuka] = useState(false);
  const wadah = useRef(null);

  // Siapkan salinan offline setelah service worker mengendalikan halaman (kunjungan pertama: setelah aktif)
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const siapkan = () => setTimeout(() => siapkanOffline(bacaUser()).catch(() => {}), 4000);
    if (navigator.serviceWorker.controller) siapkan();
    else navigator.serviceWorker.addEventListener("controllerchange", siapkan, { once: true });
    window.addEventListener("online", siapkan);
    return () => window.removeEventListener("online", siapkan);
  }, []);

  useEffect(() => {
    mulaiAntrean(({ terkirim }) => Swal.fire({
      toast: true, position: "top-end", icon: "success", showConfirmButton: false, timer: 3000,
      title: `${terkirim} kiriman offline berhasil dikirim`,
    }));
  }, []);

  useEffect(() => {
    if (!buka) return;
    const tutup = (e) => { if (!wadah.current?.contains(e.target)) setBuka(false); };
    document.addEventListener("mousedown", tutup);
    return () => document.removeEventListener("mousedown", tutup);
  }, [buka]);

  if (!jumlah) return null;

  const kirimSekarang = async () => {
    const { terkirim, gagal: g } = await kirimAntrean();
    Swal.fire({
      toast: true, position: "top-end", showConfirmButton: false, timer: 3000,
      icon: g ? "warning" : terkirim ? "success" : "info",
      title: terkirim || g ? `${terkirim} terkirim${g ? `, ${g} ditolak server` : ""}` : "Belum tersambung ke server",
    });
  };

  const buang = async (item) => {
    const ok = await Swal.fire({
      title: "Buang kiriman ini?", text: `${item.label} tidak akan dikirim ke server.`, icon: "warning",
      showCancelButton: true, confirmButtonText: "Buang", cancelButtonText: "Batal", confirmButtonColor: "#d63939",
    });
    if (ok.isConfirmed) hapusAntrean(item.id);
  };

  return (
    <div className="position-relative me-2" ref={wadah}>
      <button type="button" className={`btn btn-sm rounded-pill ${gagal ? "btn-outline-danger" : "btn-outline-warning"}`}
        onClick={() => setBuka((v) => !v)} aria-expanded={buka} aria-label={`${jumlah} kiriman offline menunggu`}
        title="Kiriman yang disimpan di HP saat offline">
        <i className={`bi ${mengirim ? "bi-arrow-repeat antrean-putar" : "bi-cloud-upload"}`}></i>
        <span className="ms-1 fw-semibold">{jumlah}</span>
      </button>
      {buka && (
        <div className="dropdown-menu show end-0 p-0 antrean-panel" style={{ position: "absolute", top: "calc(100% + .4rem)" }}>
          <div className="d-flex align-items-center gap-2 px-3 py-2 border-bottom">
            <div className="me-auto">
              <div className="fw-semibold">Menunggu dikirim</div>
              <small className="text-muted">{online ? "Terkirim otomatis tiap menit" : "Offline: dikirim saat tersambung"}</small>
            </div>
            <button type="button" className="btn btn-sm btn-primary" onClick={kirimSekarang} disabled={!online || mengirim}>
              {mengirim ? <span className="spinner-border spinner-border-sm"></span> : "Kirim sekarang"}
            </button>
          </div>
          <div className="antrean-daftar">
            {daftar.map((item) => (
              <div key={item.id} className="d-flex align-items-start gap-2 px-3 py-2 border-bottom">
                <i className={`bi ${{ nilai: "bi-pencil-square", jurnal: "bi-journal-text", presensi: "bi-calendar-check" }[item.jenis] || "bi-cloud-upload"} mt-1 text-primary`}></i>
                <div className="flex-grow-1 min-w-0">
                  <div className="small fw-semibold text-truncate">{item.label}</div>
                  <small className="text-muted">Disimpan {waktu(item.dibuat)}</small>
                  {item.galat && <small className="d-block text-danger"><i className="bi bi-exclamation-triangle me-1"></i>{item.galat}</small>}
                </div>
                <button type="button" className="btn btn-sm btn-link text-danger p-0" onClick={() => buang(item)} title="Buang" aria-label={`Buang ${item.label}`}>
                  <i className="bi bi-trash"></i>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
