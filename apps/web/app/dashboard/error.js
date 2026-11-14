"use client";

// Error boundary dashboard: pengganti layar "This page couldn't load" bawaan Next.js.
// - Berkas versi lama yang hilang setelah situs diterbitkan ulang (ChunkLoadError) → muat ulang otomatis sekali.
// - Error lain dicatat ke server (log aplikasi) lalu pengguna bisa mencoba lagi tanpa kehilangan sesi.
import { useEffect, useState } from "react";
import { API_URL, authHeaders } from "@/app/lib/akses";

const KUNCI = "muat-ulang-versi-baru";
const versiLama = (e) => /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed/i.test(`${e?.name} ${e?.message}`);

function laporkan(error) {
  try {
    if (!localStorage.getItem("token")) return;
    fetch(`${API_URL}/log-aktivitas/error-klien`, {
      method: "POST", headers: authHeaders(), keepalive: true,
      body: JSON.stringify({
        pesan: String(error?.message || error || "Tanpa pesan").slice(0, 1000),
        nama: String(error?.name || "").slice(0, 100),
        stack: String(error?.stack || "").slice(0, 4000),
        rute: window.location.pathname + window.location.search,
        digest: error?.digest || null,
      }),
    }).catch(() => {});
  } catch (e) { /* pelaporan tidak boleh menimbulkan error baru */ }
}

export default function ErrorDashboard({ error, reset }) {
  const [rincian, setRincian] = useState(false);
  const lama = versiLama(error);

  useEffect(() => {
    if (lama) {
      // Sekali per menit saja, agar tidak berputar bila berkas memang tidak bisa dimuat
      let sudah = false;
      try { sudah = Date.now() - Number(sessionStorage.getItem(KUNCI) || 0) < 60_000; sessionStorage.setItem(KUNCI, String(Date.now())); } catch (e) { /* abaikan */ }
      if (!sudah) { window.location.reload(); return; }
    }
    laporkan(error);
  }, [error, lama]);

  return (
    <div className="container py-5" style={{ maxWidth: 560 }}>
      <div className="card shadow-sm">
        <div className="card-body p-4 text-center">
          <i className="bi bi-exclamation-triangle text-warning" style={{ fontSize: 40 }}></i>
          <h3 className="h5 mt-2">{lama ? "Aplikasi baru saja diperbarui" : "Halaman ini mengalami gangguan"}</h3>
          <p className="text-body-secondary mb-3">
            {lama ? "Muat ulang halaman untuk memakai versi terbaru." : "Kesalahan sudah dicatat untuk diperbaiki. Coba lagi, atau muat ulang halaman."}
          </p>
          <div className="d-flex gap-2 justify-content-center flex-wrap">
            {!lama && <button type="button" className="btn btn-primary" onClick={() => reset()}><i className="bi bi-arrow-repeat me-1"></i>Coba lagi</button>}
            <button type="button" className={`btn ${lama ? "btn-primary" : "btn-outline-secondary"}`} onClick={() => { try { sessionStorage.removeItem(KUNCI); } catch (e) { /* abaikan */ } window.location.reload(); }}>
              <i className="bi bi-arrow-clockwise me-1"></i>Muat ulang halaman
            </button>
          </div>
          {!lama && error?.message && (
            <div className="mt-3 text-start">
              <button type="button" className="btn btn-link btn-sm p-0" onClick={() => setRincian((v) => !v)}>{rincian ? "Sembunyikan" : "Tampilkan"} rincian teknis</button>
              {rincian && <pre className="small bg-body-tertiary p-2 rounded mt-2 mb-0" style={{ whiteSpace: "pre-wrap" }}>{error.message}</pre>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
