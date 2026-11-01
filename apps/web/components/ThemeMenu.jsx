"use client";
import { useEffect, useRef, useState } from "react";
import { ACCENTS, THEME_MODES, setAccent, setThemeMode, useAppTheme } from "@/app/lib/themePrefs";

// Tombol navbar untuk memilih mode terang/gelap/otomatis dan warna aksen
export default function ThemeMenu() {
  const { mode, accent, resolved } = useAppTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const tutup = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", tutup);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", tutup); document.removeEventListener("keydown", esc); };
  }, [open]);

  return (
    <div className="position-relative" ref={ref}>
      <button type="button" className="btn btn-link nav-link px-2" onClick={() => setOpen((o) => !o)} title="Tampilan: tema & warna" aria-expanded={open}>
        <i className={`bi ${resolved === "dark" ? "bi-moon-stars-fill" : "bi-sun-fill"} fs-5`}></i>
      </button>
      {open && (
        <div className="theme-popover" role="dialog" aria-label="Pengaturan tampilan">
          <div className="small fw-semibold text-body-secondary mb-2">Mode Tampilan</div>
          <div className="btn-group w-100 mb-3" role="group">
            {THEME_MODES.map((m) => (
              <button key={m.id} type="button" className={`btn btn-sm ${mode === m.id ? "btn-primary" : "btn-outline-secondary"}`} onClick={() => setThemeMode(m.id)}>
                <i className={`bi ${m.icon} d-block`}></i><span style={{ fontSize: 11 }}>{m.label}</span>
              </button>
            ))}
          </div>
          <div className="small fw-semibold text-body-secondary mb-2">Warna Aksen</div>
          <div className="d-flex flex-wrap gap-2">
            {ACCENTS.map((a) => (
              <button key={a.id} type="button" className={`theme-swatch${accent === a.id ? " is-active" : ""}`} title={a.label} aria-label={`Aksen ${a.label}`}
                style={{ background: `linear-gradient(135deg, ${a.c1}, ${a.c2})` }} onClick={() => setAccent(a.id)}></button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
