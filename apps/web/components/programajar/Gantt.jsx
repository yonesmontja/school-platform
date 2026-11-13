"use client";
import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { STATUS_TP } from "./program";

const tglJam = (s) => new Date(s).toLocaleString("id-ID", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * Gantt rencana vs realisasi pembelajaran.
 * kolom: [{ key, label, grup, efektif, judul }] (minggu untuk Promes, bulan untuk Prota)
 * baris: [{ id, no, judul, sub, jp, status, persen, jpSelesai, rencana: {awal, akhir}, realisasi: {awal, akhir}|null,
 *          sesi: [{ kolom, status, mulai, jp, id_jadwal }], seksi? }]
 * posisiKini: indeks kolom (pecahan) untuk garis "hari ini", atau null.
 */
export default function Gantt({ kolom, baris, posisiKini = null, lebar = 34, labelKiri = "Tujuan Pembelajaran" }) {
  const [buka, setBuka] = useState(null);
  const grup = useMemo(() => {
    const g = [];
    kolom.forEach((k) => { const akhir = g[g.length - 1]; if (akhir && akhir.label === k.grup) akhir.n++; else g.push({ label: k.grup, n: 1 }); });
    return g;
  }, [kolom]);
  const lebarTimeline = kolom.length * lebar;
  const x = (i) => i * lebar;

  return (
    <div className="gantt" style={{ "--gw": `${lebar}px`, "--gn": kolom.length }}>
      <div className="gantt-scroll">
        <div className="gantt-grid" style={{ width: `calc(var(--gantt-kiri) + ${lebarTimeline}px)` }}>
          {/* Kepala: grup (bulan/semester) dan kolom (minggu/bulan) */}
          <div className="gantt-head">
            <div className="gantt-kiri gantt-kiri-head">{labelKiri}</div>
            <div className="gantt-timeline" style={{ width: lebarTimeline }}>
              <div className="gantt-grup">{grup.map((g, i) => <div key={i} style={{ width: g.n * lebar }} title={g.label}>{g.label}</div>)}</div>
              <div className="gantt-kolom">
                {kolom.map((k, i) => (
                  <div key={k.key} className={`${k.efektif === false ? "is-off" : ""}${posisiKini !== null && Math.floor(posisiKini) === i ? " is-kini" : ""}`} title={k.judul}>{k.label}</div>
                ))}
              </div>
            </div>
          </div>

          {baris.map((b) => {
            if (b.seksi) {
              return <div key={b.id} className="gantt-seksi"><div className="gantt-kiri">{b.seksi}</div><div className="gantt-timeline" style={{ width: lebarTimeline }}></div></div>;
            }
            const st = STATUS_TP[b.status] || STATUS_TP.BELUM;
            const r = b.rencana;
            return (
              <Fragment key={b.id}>
                <div className={`gantt-row${buka === b.id ? " is-open" : ""}`} onClick={() => setBuka(buka === b.id ? null : b.id)} role="button" tabIndex={0}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setBuka(buka === b.id ? null : b.id))} aria-expanded={buka === b.id}>
                  <div className="gantt-kiri">
                    <span className="gantt-no">{b.no}</span>
                    <div className="min-w-0 flex-grow-1">
                      <div className="gantt-judul" title={b.judul}>{b.judul}</div>
                      <div className="gantt-sub">{b.sub}</div>
                    </div>
                    <span className="gantt-status" style={{ "--st": st.warna }} title={st.ket}>{st.label}</span>
                  </div>
                  <div className="gantt-timeline" style={{ width: lebarTimeline }}>
                    {kolom.map((k, i) => k.efektif === false && <span key={k.key} className="gantt-off" style={{ left: x(i), width: lebar }}></span>)}
                    {r && (
                      <span className="gantt-bar" style={{ left: x(r.awal) + 2, width: (r.akhir - r.awal + 1) * lebar - 4, "--st": st.warna }}
                        title={`Rencana: ${kolom[r.awal]?.judul || ""} – ${kolom[r.akhir]?.judul || ""} · ${b.jp || 0} JP · terlaksana ${b.jpSelesai || 0} JP (${b.persen}%)`}>
                        <span className="gantt-fill" style={{ width: `${b.persen}%` }}></span>
                        <span className="gantt-bar-teks">{b.persen > 0 ? `${b.persen}%` : b.jp ? `${b.jp} JP` : ""}</span>
                      </span>
                    )}
                    {b.realisasi && (
                      <span className="gantt-real" style={{ left: x(b.realisasi.awal) + 2, width: (b.realisasi.akhir - b.realisasi.awal + 1) * lebar - 4 }} title="Rentang realisasi (sesi selesai)"></span>
                    )}
                    {b.sesi.map((s, i) => s.kolom >= 0 && s.kolom < kolom.length && (
                      <span key={`${s.id_jadwal}-${i}`} className={`gantt-dot st-${s.status.toLowerCase()}`} style={{ left: x(s.kolom) + lebar / 2 }} title={`${tglJam(s.mulai)} · ${s.jp} JP · ${s.status}`}></span>
                    ))}
                    {posisiKini !== null && <span className="gantt-kini" style={{ left: posisiKini * lebar }}></span>}
                  </div>
                </div>
                {buka === b.id && (
                  <div className="gantt-detail">
                    <div className="gantt-kiri gantt-detail-isi">
                      {b.tp && <div className="small mb-2">{b.tp}</div>}
                      <div className="d-flex flex-wrap gap-3 small mb-2">
                        <span><b>{b.jp || 0}</b> JP rencana</span><span><b>{b.jpSelesai || 0}</b> JP terlaksana</span>
                        {b.jpTerjadwal > 0 && <span><b>{b.jpTerjadwal}</b> JP terjadwal</span>}
                        {b.mingguTeks && <span>Minggu efektif {b.mingguTeks}</span>}
                      </div>
                      {b.sesi.length ? (
                        <ul className="gantt-sesi">
                          {b.sesi.map((s, i) => (
                            <li key={`${s.id_jadwal}-${i}`}><span className={`gantt-dot st-${s.status.toLowerCase()} position-static`}></span>{tglJam(s.mulai)}–{s.selesai} · {s.jp} JP · {s.status}{s.pertemuan_ke ? ` · pertemuan ${s.pertemuan_ke}` : ""}</li>
                          ))}
                        </ul>
                      ) : <div className="small text-body-secondary">Belum ada sesi jadwal yang menautkan TP ini. Tautkan lewat editor jadwal (tombol <b>ATP / TP</b>).</div>}
                      <Link href="/dashboard/jadwal" className="small"><i className="bi bi-calendar3-week me-1"></i>Buka Jadwal</Link>
                    </div>
                  </div>
                )}
              </Fragment>
            );
          })}
        </div>
      </div>
      <div className="gantt-legenda">
        <span><i className="lg-bar"></i>Rencana (ATP)</span>
        <span><i className="lg-fill"></i>JP terlaksana</span>
        <span><i className="lg-real"></i>Rentang realisasi</span>
        <span><i className="gantt-dot st-selesai position-static"></i>Sesi selesai</span>
        <span><i className="gantt-dot st-berlangsung position-static"></i>Berlangsung</span>
        <span><i className="gantt-dot st-menunggu position-static"></i>Terjadwal</span>
        <span><i className="gantt-dot st-batal position-static"></i>Batal</span>
        <span><i className="lg-off"></i>Minggu tidak efektif</span>
        {posisiKini !== null && <span><i className="lg-kini"></i>Hari ini</span>}
      </div>
    </div>
  );
}
