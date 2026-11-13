"use client";
// Peringatan dini untuk tanggal yang ditolak server (aturan BukanHariMinggu): hari Minggu dan hari libur di menu Hari Libur.
import { useEffect, useState } from "react";
import { API_URL } from "@/app/lib/config";

// Hari libur per tahun, dimuat sekali per halaman: { "2026": Map(tanggal → nama) }
const cache = {};

function muatTahun(tahun) {
  if (!cache[tahun]) {
    cache[tahun] = fetch(`${API_URL}/hari-libur?tahun=${tahun}`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
    })
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((d) => new Map((d.data || []).map((h) => [String(h.tanggal).slice(0, 10), h.nama])))
      // Offline / gagal: tanpa peringatan libur (server tetap memeriksa), dan dicoba lagi lain kali
      .catch(() => { delete cache[tahun]; return new Map(); });
  }
  return cache[tahun];
}

/** Hari libur satu tahun: Map(tanggal YYYY-MM-DD → nama libur). Kosong bila gagal dimuat. */
export const muatHariLibur = (tahun) => muatTahun(Number(tahun));

const formatPanjang = (y, m, d) => new Date(y, m - 1, d).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });

/** Pesan bila tanggal (YYYY-MM-DD) adalah hari Minggu atau hari libur; null bila hari sekolah atau belum diketahui. */
export function useAlasanBukanHariSekolah(tanggal) {
  const [alasan, setAlasan] = useState(null);
  useEffect(() => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(tanggal || "");
    if (!m) { setAlasan(null); return; }
    const [y, bln, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (new Date(y, bln - 1, d).getDay() === 0) {
      setAlasan(`${formatPanjang(y, bln, d)} adalah hari Minggu. Pilih hari Senin–Sabtu.`);
      return;
    }
    setAlasan(null);
    let batal = false;
    muatTahun(y).then((peta) => {
      if (!batal && peta.has(tanggal)) setAlasan(`${formatPanjang(y, bln, d)} adalah hari libur (${peta.get(tanggal)}). Pilih hari sekolah lain.`);
    });
    return () => { batal = true; };
  }, [tanggal]);
  return alasan;
}
