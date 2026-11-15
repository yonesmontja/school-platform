"use client";

import { useEffect, useState } from "react";
import { dengarKunciAi, pasangKunciAi } from "@/app/lib/kunciAi";

/**
 * Lapisan penuh layar selama AI bekerja: menutup semua tombol, menu, dan modal (di bawah dialog SweetAlert),
 * menahan tombol keyboard, dan memperingatkan bila halaman hendak ditutup. Hilang sendiri setelah AI selesai.
 */
export default function KunciAi() {
  const [st, setSt] = useState({ aktif: 0, mulai: null });
  const [detik, setDetik] = useState(0);

  useEffect(() => { pasangKunciAi(); return dengarKunciAi(setSt); }, []);

  const terkunci = st.aktif > 0;
  useEffect(() => {
    if (!terkunci) { setDetik(0); return; }
    const hitung = () => setDetik(Math.floor((Date.now() - (st.mulai || Date.now())) / 1000));
    hitung();
    const t = setInterval(hitung, 1000);
    const tahanTombol = (e) => {
      if (e.target.closest?.(".swal2-container")) return;
      e.preventDefault(); e.stopPropagation();
    };
    const peringatan = (e) => { e.preventDefault(); e.returnValue = ""; };
    document.addEventListener("keydown", tahanTombol, true);
    window.addEventListener("beforeunload", peringatan);
    document.activeElement?.blur?.();
    return () => { clearInterval(t); document.removeEventListener("keydown", tahanTombol, true); window.removeEventListener("beforeunload", peringatan); };
  }, [terkunci, st.mulai]);

  if (!terkunci) return null;
  return (
    <div className="kunci-ai" role="alertdialog" aria-modal="true" aria-label="AI sedang bekerja" data-kunci-ai>
      <div className="kunci-ai-kartu shadow">
        <span className="spinner-border text-primary mb-3" aria-hidden="true"></span>
        <div className="fw-semibold"><i className="bi bi-stars me-1"></i>AI sedang bekerja…</div>
        <div className="small text-muted mt-1">Mohon tunggu dan jangan menutup halaman. Tampilan terkunci sampai AI selesai.</div>
        <div className="small text-muted mt-2" aria-live="polite">{detik} detik</div>
      </div>
    </div>
  );
}
