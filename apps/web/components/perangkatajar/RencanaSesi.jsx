"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { minta } from "@/components/banksoal/api";

const LABEL = { awal: "Awal", memahami: "Memahami", mengaplikasi: "Mengaplikasi", merefleksi: "Merefleksi", penutup: "Penutup" };

/** Isi rencana satu sesi: tujuan & langkah pertemuan modul ajar. */
export function IsiRencana({ r, ringkas = false }) {
  return (
    <div className="small rencana-sesi">
      <div className="fw-semibold"><i className="bi bi-journal-richtext text-primary me-1"></i>{r.modul.judul}
        {r.pertemuan_ke ? <span className="text-muted fw-normal"> · pertemuan {r.pertemuan_ke} dari {r.modul.jumlah_pertemuan}</span> : null}
        {r.modul.status !== "DISETUJUI" && <span className="badge text-bg-light border ms-1 fw-normal">belum disetujui</span>}</div>
      {r.tujuan && <div className="text-body-secondary mt-1" style={{ whiteSpace: "pre-wrap" }}><b>Tujuan:</b> {r.tujuan}</div>}
      {r.langkah ? (
        <dl className="mb-0 mt-1">
          {Object.entries(r.langkah).map(([k, v]) => (
            <div key={k} className="mb-1"><dt className="d-inline">{LABEL[k]}: </dt><dd className="d-inline" style={{ whiteSpace: "pre-wrap" }}>{ringkas && v.length > 220 ? `${v.slice(0, 220)}…` : v}</dd></div>
          ))}
        </dl>
      ) : !r.pertemuan_ke && <div className="text-muted mt-1">Pilih pertemuan ke-berapa pada sesi ini untuk melihat langkahnya.</div>}
      <Link href={`/dashboard/perangkat-ajar?tab=modul&modul=${r.modul.id_modul}`} className="d-inline-block mt-1">Buka modul ajar</Link>
    </div>
  );
}

/** Rencana sesi jadwal yang menautkan modul ajar (panel detail sesi). */
export default function RencanaSesi({ idJadwal }) {
  const [r, setR] = useState(null);
  useEffect(() => {
    setR(null);
    minta("GET", `/jadwal/${idJadwal}/rencana`).then((x) => setR(x.data)).catch(() => setR(false));
  }, [idJadwal]);
  if (r === null) return <div className="small text-muted"><span className="spinner-border spinner-border-sm me-1"></span>Memuat rencana…</div>;
  if (!r) return null;
  return <IsiRencana r={r} />;
}

/** Rencana pembelajaran hari itu untuk kelas terpilih (formulir jurnal); rujukan, tidak mengubah AI jurnal. */
export function RencanaHari({ tanggal, idKelas, onPakaiMateri }) {
  const [data, setData] = useState([]);
  const [buka, setBuka] = useState(false);
  useEffect(() => {
    if (!tanggal || !idKelas) return setData([]);
    minta("GET", `/jadwal/rencana-hari?tanggal=${tanggal}&id_kelas=${encodeURIComponent(idKelas)}`).then((x) => setData(x.data)).catch(() => setData([]));
  }, [tanggal, idKelas]);
  if (!data.length) return null;
  return (
    <div className="border rounded p-2 bg-body-tertiary rencana-hari">
      <button type="button" className="btn btn-link btn-sm p-0 text-decoration-none fw-semibold" onClick={() => setBuka((b) => !b)} aria-expanded={buka}>
        <i className={`bi ${buka ? "bi-chevron-down" : "bi-chevron-right"} me-1`}></i>Rencana pembelajaran hari ini ({data.length})
      </button>
      {buka && data.map((r) => (
        <div key={r.id_jadwal} className="mt-2 border-top pt-2">
          <div className="small text-muted">{r.mulai?.slice(11, 16)} · {r.mapel}</div>
          <IsiRencana r={r} ringkas />
          {r.id_materi && onPakaiMateri && <button type="button" className="btn btn-sm btn-outline-primary mt-1" onClick={() => onPakaiMateri(r.id_materi)}>Pakai materi sesi ini</button>}
        </div>
      ))}
    </div>
  );
}
