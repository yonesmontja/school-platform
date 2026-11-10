"use client";
// Timeline adegan (Studio Rakit Video D2): satu baris per elemen — batang dari saat muncul sampai hilang.
// Geser batang untuk mengubah waktu muncul, tarik ujung kanan untuk menentukan kapan elemen hilang,
// klik penggaris untuk melihat kanvas pada detik itu.
import { useRef } from "react";

const label = (e) => ({ teks: `T  ${String(e.isi || "").slice(0, 18)}`, emoji: `${e.isi}  Emoji`, gambar: "🖼  Gambar", bentuk: `◆  ${e.isi}`, ikon: `✦  ${String(e.isi || "").split("/")[1] || "Ikon"}` }[e.tipe]);
const bulat = (v) => Math.round(v * 10) / 10;

export default function Timeline({ adegan, durasi, waktu, onWaktu, pilih, onPilih, onUbah, onCatat }) {
  const jalur = useRef(null);
  const tarik = useRef(null);
  const detikDari = (clientX) => {
    const r = jalur.current.getBoundingClientRect();
    return Math.min(durasi, Math.max(0, ((clientX - r.left) / r.width) * durasi));
  };
  const mulai = (ev, e, mode) => {
    ev.stopPropagation(); ev.preventDefault();
    onPilih(e.id);
    tarik.current = { id: e.id, mode, sx: ev.clientX, mulai: e.masuk?.mulai || 0, pada: e.keluar?.pada ?? null, w: jalur.current.getBoundingClientRect().width, catat: false };
    ev.currentTarget.setPointerCapture?.(ev.pointerId);
  };
  const gerak = (ev) => {
    const t = tarik.current;
    if (!t) return;
    const dt = ((ev.clientX - t.sx) / t.w) * durasi;
    if (!t.catat && Math.abs(dt) > 0.05) { onCatat(); t.catat = true; }
    if (!t.catat) return;
    const e = adegan.elemen.find((x) => x.id === t.id);
    if (!e) return;
    if (t.mode === "geser") {
      const m = bulat(Math.min(durasi - 0.2, Math.max(0, t.mulai + dt)));
      const geser = m - t.mulai;
      onUbah(t.id, { masuk: { ...e.masuk, mulai: m }, ...(t.pada != null ? { keluar: { ...e.keluar, pada: bulat(Math.min(durasi, t.pada + geser)) } } : {}) }, false);
    } else {
      const akhir = t.pada ?? durasi;
      const p = bulat(Math.max((e.masuk?.mulai || 0) + 0.3, Math.min(durasi, akhir + dt)));
      onUbah(t.id, { keluar: { preset: e.keluar?.preset && e.keluar.preset !== "tidak" ? e.keluar.preset : "pudar", pada: p >= durasi - 0.05 ? null : p } }, false);
    }
  };
  const selesai = () => { tarik.current = null; };
  const tanda = Array.from({ length: Math.floor(durasi) + 1 }, (_, i) => i);

  return (
    <div className="studio-timeline card shadow-sm mt-2" onPointerMove={gerak} onPointerUp={selesai} onPointerLeave={selesai}>
      <div className="card-body p-2">
        <div className="d-flex flex-wrap align-items-center column-gap-2 small mb-1">
          <span className="fw-semibold text-nowrap">Timeline adegan</span>
          <span className="text-body-secondary">Geser batang untuk waktu muncul · tarik ujung kanan untuk waktu hilang · klik penggaris untuk melihat detik itu</span>
          {waktu != null && <button type="button" className="btn btn-link btn-sm py-0 ms-auto" onClick={() => onWaktu(null)}>Tampilan akhir</button>}
        </div>
        <div className="studio-tl-baris">
          <div className="studio-tl-label small text-body-secondary">{bulat(waktu ?? durasi)} dtk</div>
          <div className="studio-tl-jalur studio-tl-penggaris" ref={jalur} role="slider" aria-label="Waktu dalam adegan" aria-valuemin={0} aria-valuemax={durasi} aria-valuenow={waktu ?? durasi} tabIndex={0}
            onPointerDown={(ev) => onWaktu(bulat(detikDari(ev.clientX)))}>
            {tanda.map((i) => <span key={i} className="studio-tl-tanda" style={{ left: `${(i / durasi) * 100}%` }}>{i}</span>)}
            {waktu != null && <span className="studio-tl-kepala" style={{ left: `${(waktu / durasi) * 100}%` }}></span>}
          </div>
        </div>
        {!adegan.elemen.length && <div className="small text-body-secondary py-2 text-center">Belum ada elemen di adegan ini.</div>}
        {[...adegan.elemen].reverse().map((e) => {
          const m = Math.min(durasi, e.masuk?.mulai || 0);
          const akhir = e.keluar?.pada ?? durasi;
          const masukLama = Math.min(akhir - m, e.masuk?.durasi || 0.6);
          return (
            <div key={e.id} className={`studio-tl-baris ${e.id === pilih ? "dipilih" : ""}`}>
              <button type="button" className="studio-tl-label btn btn-sm text-start text-truncate" onClick={() => onPilih(e.id)} title={label(e)}>{label(e)}</button>
              <div className="studio-tl-jalur" onPointerDown={(ev) => { if (ev.target === ev.currentTarget) onWaktu(bulat(((ev.clientX - ev.currentTarget.getBoundingClientRect().left) / ev.currentTarget.getBoundingClientRect().width) * durasi)); }}>
                <div className="studio-tl-batang" role="button" tabIndex={-1} aria-label={`Waktu elemen ${e.tipe}`}
                  style={{ left: `${(m / durasi) * 100}%`, width: `${Math.max(1, ((akhir - m) / durasi) * 100)}%` }}
                  onPointerDown={(ev) => mulai(ev, e, "geser")}>
                  <span className="studio-tl-masuk" style={{ width: `${Math.min(100, (masukLama / Math.max(0.01, akhir - m)) * 100)}%` }}></span>
                  <span className="studio-tl-ujung" onPointerDown={(ev) => mulai(ev, e, "ujung")} aria-label="Waktu hilang"></span>
                </div>
                {waktu != null && <span className="studio-tl-kepala" style={{ left: `${(waktu / durasi) * 100}%` }}></span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
