"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TINGKAT, tandaiDibaca, useNotifikasi, waktuRelatif } from "@/app/lib/notifikasi";

// Lonceng notifikasi di topbar: angka belum dibaca (merah bila ada yang mendesak) dan daftar singkat
export default function NotifikasiMenu() {
  const { data, belum_dibaca, mendesak, memuat } = useNotifikasi();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const tutup = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", tutup);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", tutup); document.removeEventListener("keydown", esc); };
  }, [open]);

  // Belum dibaca lebih dulu, lalu urutan tingkat dari server
  const daftar = [...data].sort((a, b) => Number(a.dibaca) - Number(b.dibaca)).slice(0, 6);
  const buka = (n) => {
    setOpen(false);
    if (!n.dibaca) tandaiDibaca([n.kunci]);
    if (n.tautan) router.push(n.tautan);
  };

  return (
    <div className="position-relative" ref={ref}>
      <button type="button" className="btn btn-link nav-link px-2 position-relative" onClick={() => setOpen((o) => !o)}
        aria-expanded={open} aria-label={`Notifikasi, ${belum_dibaca} belum dibaca`} title="Perlu tindakan">
        <i className={`bi ${belum_dibaca ? "bi-bell-fill" : "bi-bell"} fs-5${mendesak ? " notif-goyang" : ""}`}></i>
        {belum_dibaca > 0 && (
          <span className={`position-absolute badge rounded-pill text-bg-${mendesak ? "danger" : "primary"} notif-badge`}>{belum_dibaca > 9 ? "9+" : belum_dibaca}</span>
        )}
      </button>
      {open && (
        <div className="notif-popover shadow" role="dialog" aria-label="Notifikasi">
          <div className="d-flex align-items-center px-3 py-2 border-bottom">
            <div className="fw-semibold me-auto">Perlu Tindakan</div>
            {belum_dibaca > 0 && (
              <button type="button" className="btn btn-link btn-sm p-0 text-decoration-none" onClick={() => tandaiDibaca()}>
                <i className="bi bi-check2-all me-1"></i>Tandai semua dibaca
              </button>
            )}
          </div>
          <div className="notif-list">
            {memuat && !data.length && <div className="text-center text-body-secondary small py-4"><span className="spinner-border spinner-border-sm me-2"></span>Memuat…</div>}
            {!memuat && !data.length && (
              <div className="text-center text-body-secondary py-4 px-3">
                <i className="bi bi-emoji-smile fs-2 d-block mb-1 text-success"></i>
                <div className="small">Tidak ada yang perlu ditindaklanjuti. Semua beres!</div>
              </div>
            )}
            {daftar.map((n) => {
              const t = TINGKAT[n.tingkat] || TINGKAT.info;
              return (
                <button key={n.kunci} type="button" className={`notif-item${n.dibaca ? " is-dibaca" : ""}`} onClick={() => buka(n)}>
                  <span className={`notif-ikon text-bg-${t.warna}`}><i className={`bi ${n.ikon}`}></i></span>
                  <span className="min-w-0 flex-grow-1 text-start">
                    <span className="d-flex align-items-center gap-1">
                      <span className="fw-semibold small text-truncate">{n.judul}</span>
                      {!n.dibaca && <span className="notif-titik" aria-label="belum dibaca"></span>}
                    </span>
                    <span className="d-block small text-body-secondary notif-pesan">{n.pesan}</span>
                    <span className="d-block text-body-tertiary" style={{ fontSize: 11 }}>{n.kategori} · {waktuRelatif(n.waktu)}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <Link href="/dashboard/notifikasi" className="d-block text-center small py-2 border-top text-decoration-none" onClick={() => setOpen(false)}>
            Lihat semua{data.length > daftar.length ? ` (${data.length})` : ""} <i className="bi bi-arrow-right"></i>
          </Link>
        </div>
      )}
    </div>
  );
}
