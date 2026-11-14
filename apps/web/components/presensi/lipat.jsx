"use client";
// Kartu presensi yang bisa dilipat; keadaannya diingat per peramban (localStorage).
import { useEffect, useState } from "react";

export function useLipat(kunci) {
  const [terlipat, setTerlipat] = useState(false);
  useEffect(() => { try { setTerlipat(localStorage.getItem(kunci) === "1"); } catch { /* storage diblokir */ } }, [kunci]);
  const ubah = () => setTerlipat((v) => { try { localStorage.setItem(kunci, v ? "0" : "1"); } catch { /* abaikan */ } return !v; });
  return [terlipat, ubah];
}

/** Tombol Sembunyikan/Tampilkan di kepala kartu. */
export function TombolLipat({ terlipat, onClick, label }) {
  return (
    <button type="button" className="btn btn-sm btn-link text-decoration-none p-0 text-nowrap" onClick={onClick} aria-expanded={!terlipat} aria-label={`${terlipat ? "Tampilkan" : "Sembunyikan"} ${label}`}>
      {terlipat ? <>Tampilkan <i className="bi bi-chevron-down"></i></> : <>Sembunyikan <i className="bi bi-chevron-up"></i></>}
    </button>
  );
}
