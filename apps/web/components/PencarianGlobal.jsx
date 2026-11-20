"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { minta } from "@/components/banksoal/api";
import { srcFoto } from "@/components/siswa/fotoSiswa";

const normal = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Palet pencarian global (Ctrl+K): menu yang cocok seketika, lalu data dari server (siswa, guru, kelas, materi,
 * soal, modul ajar, dokumen, surat) setelah jeda mengetik. Panah atas/bawah memilih, Enter membuka, Esc menutup.
 */
export default function PencarianGlobal({ buka, onTutup, menu, bolehData }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [data, setData] = useState([]);
  const [memuat, setMemuat] = useState(false);
  const [galat, setGalat] = useState("");
  const [pilih, setPilih] = useState(0);
  const inputRef = useRef(null);
  const daftarRef = useRef(null);

  useEffect(() => {
    if (!buka) return;
    setQ(""); setData([]); setPilih(0); setGalat("");
    setTimeout(() => inputRef.current?.focus(), 30);
  }, [buka]);

  // Cari data di server setelah jeda 250 ms; permintaan lama diabaikan
  useEffect(() => {
    const kata = q.trim();
    if (!bolehData || kata.length < 2) { setData([]); setMemuat(false); return; }
    let batal = false;
    setMemuat(true);
    const t = setTimeout(() => {
      minta("GET", `/cari?q=${encodeURIComponent(kata)}`)
        .then((r) => { if (!batal) { setData(r.data || []); setGalat(""); } })
        .catch((e) => { if (!batal) { setData([]); setGalat(e.message); } })
        .finally(() => { if (!batal) setMemuat(false); });
    }, 250);
    return () => { batal = true; clearTimeout(t); };
  }, [q, bolehData]);

  const hasilMenu = useMemo(() => {
    const kata = normal(q.trim());
    if (!kata) return menu.slice(0, 6);
    return menu.filter((m) => normal(m.label).includes(kata) || normal(m.grup).includes(kata)).slice(0, 6);
  }, [q, menu]);

  const semua = useMemo(() => [
    ...hasilMenu.map((m) => ({ jenis: "Menu", ikon: m.icon, judul: m.label, sub: m.grup, tautan: m.href })),
    ...data,
  ], [hasilMenu, data]);
  const grup = useMemo(() => {
    const g = [];
    semua.forEach((it, i) => {
      const akhir = g[g.length - 1];
      if (akhir && akhir.jenis === it.jenis) akhir.item.push({ ...it, i });
      else g.push({ jenis: it.jenis, item: [{ ...it, i }] });
    });
    return g;
  }, [semua]);

  useEffect(() => { setPilih(0); }, [q, data.length]);
  useEffect(() => { daftarRef.current?.querySelector(`[data-i="${pilih}"]`)?.scrollIntoView({ block: "nearest" }); }, [pilih]);

  const bukaItem = (it) => {
    if (!it) return;
    onTutup();
    if (it.baru_tab) window.open(it.tautan, "_blank", "noopener");
    else router.push(it.tautan);
  };

  const onKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setPilih((i) => Math.min(i + 1, semua.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setPilih((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); bukaItem(semua[pilih]); }
    else if (e.key === "Escape") { e.preventDefault(); onTutup(); }
  };

  if (!buka) return null;
  return (
    <div className="cari-global-latar" onMouseDown={(e) => { if (e.target === e.currentTarget) onTutup(); }} role="presentation">
      <style>{CSS}</style>
      <div className="cari-global card shadow-lg" role="dialog" aria-modal="true" aria-label="Pencarian global" data-cari-global>
        <div className="d-flex align-items-center gap-2 px-3 py-2 border-bottom">
          <i className="bi bi-search text-body-secondary"></i>
          <input ref={inputRef} className="form-control border-0 shadow-none px-1" placeholder={bolehData ? "Cari menu, siswa, guru, kelas, soal, materi, surat…" : "Cari menu…"}
            value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} aria-label="Kata pencarian" role="combobox" aria-expanded="true" aria-controls="cari-global-daftar" />
          {memuat && <span className="spinner-border spinner-border-sm text-body-secondary" aria-label="Mencari"></span>}
          <kbd className="d-none d-md-inline small">Esc</kbd>
          <button type="button" className="btn-close d-md-none" onClick={onTutup} aria-label="Tutup pencarian"></button>
        </div>
        <div className="cari-global-daftar" id="cari-global-daftar" ref={daftarRef} role="listbox">
          {grup.map((g) => (
            <div key={g.jenis + g.item[0].i}>
              <div className="cari-global-grup">{g.jenis}</div>
              {g.item.map((it) => (
                <button key={it.i} type="button" data-i={it.i} role="option" aria-selected={pilih === it.i} data-hasil-cari={it.jenis}
                  className={`cari-global-item ${pilih === it.i ? "aktif" : ""}`} onMouseEnter={() => setPilih(it.i)} onClick={() => bukaItem(it)}>
                  {it.foto_url ? <img src={srcFoto(it.foto_url)} alt="" className="cari-global-foto" /> : <i className={`bi ${it.ikon || "bi-dot"} cari-global-ikon`}></i>}
                  <span className="min-w-0 flex-grow-1 text-start">
                    <span className="d-block text-truncate fw-semibold">{it.judul}</span>
                    {it.sub && <span className="d-block text-truncate small text-body-secondary">{it.sub}</span>}
                  </span>
                  {it.dashboard_pribadi && <span className="badge text-bg-light border small d-none d-sm-inline">Dashboard pribadi</span>}
                  {it.baru_tab && <i className="bi bi-box-arrow-up-right small text-body-secondary"></i>}
                </button>
              ))}
            </div>
          ))}
          {q.trim().length >= 2 && !memuat && semua.length === 0 && (
            <div className="text-center text-body-secondary py-4 small" data-cari-kosong><i className="bi bi-search d-block fs-4 mb-1"></i>Tidak ada yang cocok dengan “{q.trim()}”.</div>
          )}
          {galat && <div className="text-warning small px-3 py-2">{galat}</div>}
        </div>
        <div className="border-top px-3 py-1 small text-body-secondary d-none d-md-flex gap-3">
          <span><kbd>↑</kbd> <kbd>↓</kbd> pilih</span><span><kbd>Enter</kbd> buka</span><span><kbd>Ctrl</kbd>+<kbd>K</kbd> dari mana saja</span>
        </div>
      </div>
    </div>
  );
}

const CSS = `
.cari-global-latar { position: fixed; inset: 0; background: rgba(15, 23, 42, .45); z-index: 1080; display: flex; justify-content: center; align-items: flex-start; padding: 8vh 12px 12px; }
.cari-global { width: 100%; max-width: 640px; max-height: 76vh; display: flex; flex-direction: column; overflow: hidden; }
.cari-global-daftar { overflow-y: auto; padding: 4px 0 8px; }
.cari-global-grup { font-size: .72rem; text-transform: uppercase; letter-spacing: .04em; color: var(--bs-secondary-color); padding: 8px 16px 2px; }
.cari-global-item { display: flex; align-items: center; gap: 10px; width: 100%; border: 0; background: transparent; padding: 7px 16px; color: inherit; }
.cari-global-item.aktif { background: var(--bs-primary-bg-subtle); }
.cari-global-ikon { width: 28px; text-align: center; font-size: 1.05rem; color: var(--bs-primary); }
.cari-global-foto { width: 28px; height: 37px; object-fit: cover; border-radius: 4px; }
@media (max-width: 575.98px) { .cari-global-latar { padding: 0; } .cari-global { max-height: 100vh; height: 100%; border-radius: 0; } }
`;
