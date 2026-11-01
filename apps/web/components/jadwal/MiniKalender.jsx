"use client";
import { useEffect, useMemo, useState } from "react";
import { ymd } from "@/app/dashboard/jadwal/_lib/jadwal";

const NAMA_HARI = ["S", "S", "R", "K", "J", "S", "M"]; // Senin → Minggu

/**
 * Kalender bulan kecil di panel kiri. Klik tanggal untuk melompat; tanggal yang punya sesi diberi titik.
 */
export default function MiniKalender({ tanggalAktif, rentangAktif, tanggalBerisi, onPilih }) {
  const [bulan, setBulan] = useState(() => new Date(tanggalAktif.getFullYear(), tanggalAktif.getMonth(), 1));

  // Ikuti navigasi kalender utama
  useEffect(() => {
    setBulan(new Date(tanggalAktif.getFullYear(), tanggalAktif.getMonth(), 1));
  }, [tanggalAktif.getFullYear(), tanggalAktif.getMonth()]);

  const sel = useMemo(() => {
    const awal = new Date(bulan);
    awal.setDate(1 - ((bulan.getDay() + 6) % 7)); // mundur ke Senin
    return Array.from({ length: 42 }, (_, i) => new Date(awal.getFullYear(), awal.getMonth(), awal.getDate() + i));
  }, [bulan]);

  const hariIni = ymd(new Date());
  const dalamRentang = (d) => rentangAktif && d >= rentangAktif.start && d < rentangAktif.end;

  return (
    <div className="mini-cal">
      <div className="d-flex align-items-center mb-1">
        <span className="mini-cal-title me-auto">{bulan.toLocaleDateString("id-ID", { month: "long", year: "numeric" })}</span>
        <button type="button" className="btn btn-sm btn-icon-cal" onClick={() => setBulan(new Date(bulan.getFullYear(), bulan.getMonth() - 1, 1))} aria-label="Bulan sebelumnya"><i className="bi bi-chevron-left"></i></button>
        <button type="button" className="btn btn-sm btn-icon-cal" onClick={() => setBulan(new Date(bulan.getFullYear(), bulan.getMonth() + 1, 1))} aria-label="Bulan berikutnya"><i className="bi bi-chevron-right"></i></button>
      </div>
      <div className="mini-cal-grid">
        {NAMA_HARI.map((h, i) => <span key={i} className="mini-cal-dow">{h}</span>)}
        {sel.map((d) => {
          const k = ymd(d);
          const kelas = [
            "mini-cal-day",
            d.getMonth() !== bulan.getMonth() ? "is-other" : "",
            k === hariIni ? "is-today" : "",
            k === ymd(tanggalAktif) ? "is-selected" : "",
            dalamRentang(d) ? "is-range" : "",
          ].filter(Boolean).join(" ");
          return (
            <button key={k} type="button" className={kelas} onClick={() => onPilih(d)} title={d.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" })}>
              {d.getDate()}
              {tanggalBerisi.has(k) && <span className="mini-cal-dot"></span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
