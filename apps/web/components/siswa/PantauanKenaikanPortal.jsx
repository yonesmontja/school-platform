"use client";
import { useEffect, useState } from "react";
import { minta } from "@/components/banksoal/api";

const angka = (v) => (v === null || v === undefined ? "-" : Number(v).toLocaleString("id-ID", { maximumFractionDigits: 1 }));
const waktu = (t) => (t ? new Date(t).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) : "");

/**
 * Portal: ringkasan pantauan kenaikan kelas yang dibagikan wali kelas ("Kabari orang tua").
 * Orang tua/siswa hanya melihatnya setelah dibagikan; staf melihat pratinjau beserta keterangan sudah/belum dibagikan.
 */
export default function PantauanKenaikanPortal({ idSiswa, sebutan = "Ananda" }) {
  const [d, setD] = useState(null);
  useEffect(() => {
    if (!idSiswa) return;
    setD(null);
    minta("GET", `/portal/pantauan-kenaikan?id_siswa=${encodeURIComponent(idSiswa)}`).then((r) => setD(r.data)).catch(() => setD(null));
  }, [idSiswa]);
  if (!d) return null;

  const bawah = d.mapel.filter((m) => m.status === "BAWAH");
  const tepi = d.mapel.filter((m) => m.status === "TEPI");
  const perhatian = d.tingkat === "TINGGI" || d.tingkat === "WASPADA";
  return (
    <div className={`card shadow-sm mb-3 border-0 border-start border-4 ${perhatian ? "border-warning" : "border-success"}`} data-pantauan-portal={d.tingkat}>
      <div className="card-body">
        <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
          <i className={`bi ${perhatian ? "bi-signpost-split text-warning" : "bi-check-circle text-success"} fs-5`} aria-hidden="true"></i>
          <div className="me-auto">
            <div className="fw-bold">Pantauan ketuntasan belajar · {d.tahun_ajaran}</div>
            <div className="small text-body-secondary">Rata-rata nilai setahun sejauh ini (semester {d.semester}).</div>
          </div>
          {!d.dibagikan && <span className="badge text-bg-secondary">Pratinjau staf · belum dibagikan ke orang tua</span>}
        </div>

        {bawah.length > 0 ? (
          <>
            <p className="mb-2">{sebutan} belum tuntas di <strong>{bawah.length} mapel</strong>:</p>
            <ul className="mb-2">
              {bawah.map((m) => (
                <li key={m.nama}>
                  <strong>{m.nama}</strong>: rata-rata {angka(m.rata)} (KKM {angka(m.kkm)}).{" "}
                  {m.sulit ? "Perlu ikut remedial agar tuntas." : <>Perlu rata-rata sekitar {m.target} pada penilaian berikutnya.</>}
                </li>
              ))}
            </ul>
            {d.tingkat === "TINGGI" && (
              <div className="alert alert-warning small py-2 mb-2">
                Sesuai aturan sekolah, siswa yang pada akhir tahun masih belum tuntas di {d.batas_mapel_bawah} mapel atau lebih dapat tidak naik kelas.
                Masih ada waktu untuk memperbaikinya bersama wali kelas.
              </div>
            )}
          </>
        ) : <p className="mb-2">Semua mapel sudah tuntas sejauh ini.</p>}
        {tepi.length > 0 && <p className="small text-body-secondary mb-2">Tuntas tetapi masih dekat KKM: {tepi.map((m) => `${m.nama} (${angka(m.rata)})`).join(", ")}.</p>}
        {d.persen_hadir !== null && <p className="small text-body-secondary mb-2">Kehadiran tahun ini: {d.persen_hadir}%.</p>}

        {d.pesan && (
          <blockquote className="border-start border-3 ps-3 mb-0">
            <div style={{ whiteSpace: "pre-line" }}>{d.pesan.catatan}</div>
            <footer className="small text-body-secondary mt-1">{d.pesan.pembuat?.name || "Wali kelas"}, {waktu(d.pesan.pada)}</footer>
          </blockquote>
        )}
      </div>
    </div>
  );
}
