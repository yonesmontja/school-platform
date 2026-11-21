"use client";
// Kartu kesiapan offline: menunjukkan apakah HP ini sudah menyimpan salinan halaman & data kelas (app/lib/siapOffline.js),
// kapan terakhir disiapkan, dan tombol "Siapkan sekarang" sebelum berangkat ke kelas yang sinyalnya lemah.
import { useEffect, useState } from "react";
import { SIAP_EVENT, alasanTakBisaSiap, siapkanOffline, statusSiapOffline } from "@/app/lib/siapOffline";
import { useAntrean, useOnline } from "@/app/lib/antrean";
import { bacaUser } from "@/app/lib/akses";

const jam = (iso) => new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
const kapan = (iso) => {
  const d = new Date(iso);
  const hari = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
  if (hari <= 0) return `hari ini ${jam(iso)}`;
  if (hari === 1) return `kemarin ${jam(iso)}`;
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short" }) + ` ${jam(iso)}`;
};
const mb = (b) => (b / 1048576).toFixed(b < 10485760 ? 1 : 0);

/** ringkas: tampilan satu baris untuk halaman Hari Ini; tanpa ringkas: kartu lengkap untuk Akun Saya. */
export default function SiapOffline({ ringkas = false }) {
  const online = useOnline();
  const { jumlah: menunggu } = useAntrean();
  const [status, setStatus] = useState(null);
  const [alasan, setAlasan] = useState(null);
  const [progres, setProgres] = useState(null);
  const [ruang, setRuang] = useState(null);
  const [siapDimuat, setSiapDimuat] = useState(false);

  useEffect(() => {
    const segarkan = () => {
      setStatus(statusSiapOffline());
      setAlasan(alasanTakBisaSiap(bacaUser()));
      navigator.storage?.estimate?.().then((e) => setRuang(e)).catch(() => {});
      setSiapDimuat(true);
    };
    segarkan();
    window.addEventListener(SIAP_EVENT, segarkan);
    navigator.serviceWorker?.addEventListener?.("controllerchange", segarkan);
    return () => {
      window.removeEventListener(SIAP_EVENT, segarkan);
      navigator.serviceWorker?.removeEventListener?.("controllerchange", segarkan);
    };
  }, []);

  const siapkan = async () => {
    setProgres({ jumlah: 0, tahap: "Memulai" });
    try {
      const hasil = await siapkanOffline(bacaUser(), { paksa: true, onProgres: setProgres });
      if (hasil) setStatus(hasil);
    } finally { setProgres(null); }
  };

  if (!siapDimuat) return null;
  const hariIni = status && new Date(status.waktu || status.tanggal).toDateString() === new Date().toDateString();
  const tingkat = alasan ? "secondary" : hariIni ? "success" : status ? "warning" : "danger";
  const judul = alasan ? "Mode offline belum aktif" : hariIni ? "Siap dipakai offline" : status ? "Salinan offline sudah lama" : "Belum siap offline";
  const rincian = status
    ? `Disiapkan ${kapan(status.waktu || status.tanggal)}${status.kelas ? ` · ${status.kelas} kelas` : ""}${status.lembar ? ` · ${status.lembar} lembar nilai` : ""}`
    : "Data kelas belum tersimpan di HP ini.";
  const tombol = !alasan && (
    <button type="button" className={`btn btn-sm ${hariIni ? "btn-outline-secondary" : "btn-primary"} text-nowrap`} onClick={siapkan} disabled={!online || !!progres} data-siapkan-offline>
      {progres ? <><span className="spinner-border spinner-border-sm me-1"></span>{progres.jumlah} data…</> : <><i className="bi bi-cloud-download me-1"></i>{online ? "Siapkan sekarang" : "Perlu sinyal"}</>}
    </button>
  );

  if (ringkas) {
    if (alasan) return null;
    return (
      <div className={`card mb-3 border-${tingkat}`} data-siap-offline={tingkat}>
        <div className="card-body py-2 d-flex align-items-center gap-2">
          <i className={`bi ${hariIni ? "bi-cloud-check-fill" : "bi-cloud-slash"} text-${tingkat} fs-4`}></i>
          <div className="me-auto min-w-0">
            <div className="fw-semibold small">{judul}</div>
            <div className="small text-body-secondary text-truncate">{progres ? `Menyimpan: ${progres.tahap}` : rincian}{menunggu ? ` · ${menunggu} menunggu dikirim` : ""}</div>
          </div>
          {tombol}
        </div>
      </div>
    );
  }

  return (
    <div className="card border-0 shadow-sm" data-siap-offline={tingkat}>
      <div className="card-body p-4">
        <div className="d-flex align-items-start gap-3 flex-wrap">
          <div className="me-auto">
            <h5 className="fw-bold mb-1"><i className="bi bi-wifi-off me-2 text-primary"></i>Mode Offline</h5>
            <p className="small text-muted mb-0">Nilai, jurnal, presensi (harian &amp; per mapel), dan karya portofolio tetap bisa disimpan saat sinyal hilang, lalu terkirim otomatis.</p>
          </div>
          {tombol}
        </div>
        <div className={`alert alert-${tingkat} d-flex align-items-center gap-2 py-2 mt-3 mb-0`}>
          <i className={`bi ${alasan ? "bi-info-circle" : hariIni ? "bi-cloud-check-fill" : "bi-exclamation-triangle"}`}></i>
          <div className="small">
            <b>{judul}.</b> {alasan || (progres ? `Menyimpan ${progres.tahap.toLowerCase()} (${progres.jumlah} data)…` : rincian)}
            {!alasan && status?.terpotong && " Sebagian lembar nilai tidak ikut karena terlalu banyak; buka lembar yang diperlukan sekali saat ada sinyal."}
          </div>
        </div>
        <ul className="small text-body-secondary mt-3 mb-0 ps-3">
          <li>Disiapkan otomatis sekali sehari saat aplikasi dibuka dengan sinyal. Tekan <b>Siapkan sekarang</b> sebelum ke kelas yang sinyalnya lemah, terutama setelah menambah materi baru.</li>
          <li>Kiriman menunggu: <b>{menunggu}</b>{menunggu ? " (lihat ikon awan di atas)" : ""}.</li>
          {ruang?.usage > 0 && <li>Ruang terpakai di HP ini: {mb(ruang.usage)} MB{ruang.quota ? ` dari ${mb(ruang.quota)} MB` : ""}.</li>}
          <li>Nilai yang ternyata sudah diubah orang lain saat Anda offline tidak ditimpa diam-diam: Anda akan diminta memilih <b>Timpa</b> atau <b>Buang</b>.</li>
        </ul>
      </div>
    </div>
  );
}
