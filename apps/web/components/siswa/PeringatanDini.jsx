"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { minta } from "@/components/banksoal/api";

// Tingkat & ikon peringatan dini siswa (dipakai halaman Peringatan Dini dan dashboard pribadi siswa)
export const TINGKAT_PD = {
  TINGGI: { label: "Risiko tinggi", warna: "danger", ikon: "bi-exclamation-octagon" },
  SEDANG: { label: "Risiko sedang", warna: "warning", ikon: "bi-exclamation-triangle" },
  PERHATIAN: { label: "Perlu perhatian", warna: "info", ikon: "bi-eye" },
  AMAN: { label: "Aman", warna: "success", ikon: "bi-check-circle" },
};
export const IKON_KATEGORI = { Presensi: "bi-calendar-x", Nilai: "bi-graph-down-arrow", Tes: "bi-pc-display", Pembinaan: "bi-person-heart", Karakter: "bi-emoji-frown" };

/** Kartu ringkas peringatan dini satu siswa untuk dashboard pribadi (staf). Diam bila tidak berhak atau gagal. */
export function KartuPeringatanSiswa({ idSiswa }) {
  const [s, setS] = useState(undefined);
  useEffect(() => {
    if (!idSiswa) return;
    minta("GET", `/peringatan-dini?id_siswa=${encodeURIComponent(idSiswa)}`).then((r) => setS(r.data?.[0] || null)).catch(() => setS(null));
  }, [idSiswa]);
  if (!s) return null;
  const info = TINGKAT_PD[s.tingkat];
  return (
    <div className="card mb-3" data-kartu-pd={s.tingkat} style={{ borderLeft: `4px solid var(--bs-${info.warna})` }}>
      <div className="card-body py-2">
        <div className="d-flex align-items-center gap-2 mb-1">
          <i className={`bi ${info.ikon} text-${info.warna}`}></i>
          <b className="me-auto">Peringatan dini: {info.label}</b>
          <span className="small text-body-secondary">skor {s.skor}</span>
          <Link href={`/dashboard/peringatan-dini?kelas=${encodeURIComponent(s.id_kelas || "")}`} className="small">Buka</Link>
        </div>
        {s.alasan.length === 0
          ? <div className="small text-body-secondary">Tidak ada tanda risiko dari presensi, nilai, dan tes saat ini.</div>
          : <ul className="small mb-0 ps-3">{s.alasan.map((a) => <li key={a.kode}><b>{a.label}</b> <span className="text-body-secondary">{a.detail}</span></li>)}</ul>}
        {s.tindak_lanjut?.masih_berlaku && <div className="small text-success mt-1"><i className="bi bi-check2-circle me-1"></i>Sudah ditangani: {s.tindak_lanjut.catatan}</div>}
      </div>
    </div>
  );
}
