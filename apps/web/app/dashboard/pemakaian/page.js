"use client";

import { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import { minta } from "@/components/banksoal/api";

const PERAN = { guru: ["Guru", "#2563eb"], siswa: ["Siswa", "#16a34a"], ortu: ["Orang tua", "#f59e0b"], kepsek: ["Kepala sekolah", "#9333ea"], admin: ["Admin", "#64748b"] };
const relatif = (iso) => {
  if (!iso) return "belum pernah";
  const hari = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return hari <= 0 ? "hari ini" : hari === 1 ? "kemarin" : `${hari} hari lalu`;
};

/** Grafik garis sederhana pengguna aktif per hari, per peran. */
function GrafikHarian({ data, sejak, hari }) {
  const tanggal = Array.from({ length: hari }, (_, i) => { const d = new Date(`${sejak}T00:00:00`); d.setDate(d.getDate() + i); return d.toLocaleDateString("sv-SE"); });
  const peran = [...new Set(data.map((d) => d.peran))].filter((p) => PERAN[p]);
  const nilai = (p, t) => Number(data.find((d) => d.peran === p && d.tanggal === t)?.pengguna || 0);
  const maks = Math.max(1, ...data.map((d) => Number(d.pengguna)));
  const L = 640, T = 160, x = (i) => 30 + (i / Math.max(1, hari - 1)) * (L - 40), y = (v) => T - 20 - (v / maks) * (T - 40);
  return (
    <div>
      <svg viewBox={`0 0 ${L} ${T}`} className="w-100" role="img" aria-label="Pengguna aktif per hari">
        {[...new Set([0, Math.ceil(maks / 2), maks])].map((v) => <g key={v}><line x1={30} x2={L - 10} y1={y(v)} y2={y(v)} stroke="currentColor" opacity=".1" /><text x={4} y={y(v) + 4} fontSize="10" fill="currentColor" opacity=".6">{v}</text></g>)}
        {peran.map((p) => (
          <polyline key={p} fill="none" stroke={PERAN[p][1]} strokeWidth="2.5" points={tanggal.map((t, i) => `${x(i)},${y(nilai(p, t))}`).join(" ")} />
        ))}
        {[...new Set([0, Math.floor(hari / 2), hari - 1])].map((i) => <text key={i} x={x(i)} y={T - 4} fontSize="10" textAnchor="middle" fill="currentColor" opacity=".6">{new Date(`${tanggal[i]}T00:00:00`).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}</text>)}
      </svg>
      <div className="d-flex flex-wrap gap-3 small">{peran.map((p) => <span key={p}><span className="d-inline-block rounded-circle me-1" style={{ width: 10, height: 10, background: PERAN[p][1] }}></span>{PERAN[p][0]}</span>)}</div>
    </div>
  );
}

/** Dasbor pemakaian untuk masa pakai nyata: adopsi fitur, pemakaian per guru, jejak kerja, hambatan, portal. */
export default function DasborPemakaian() {
  const [hari, setHari] = useState(30);
  const [d, setD] = useState(null);

  useEffect(() => {
    setD(null);
    minta("GET", `/pemakaian?hari=${hari}`).then(setD).catch((err) => Swal.fire("Gagal memuat", err.message, "error"));
  }, [hari]);

  const tidakAktif = useMemo(() => (d?.per_guru || []).filter((g) => g.hari_aktif === 0), [d]);

  return (
    <div className="container-fluid mt-3 mb-5 dasbor-pemakaian">
      <div className="d-flex flex-wrap align-items-start gap-2 mb-3">
        <div className="me-auto">
          <h3 className="fw-bold text-primary mb-1"><i className="bi bi-activity me-2"></i>Pemakaian Aplikasi</h3>
          <p className="text-muted small mb-0">Siapa memakai fitur apa, fitur yang belum disentuh, jejak kerja nyata, dan hambatan selama masa pakai.</p>
        </div>
        <div className="btn-group btn-group-sm" role="group" aria-label="Rentang waktu">
          {[7, 30, 90].map((h) => <button key={h} className={`btn ${hari === h ? "btn-primary" : "btn-outline-primary"}`} onClick={() => setHari(h)}>{h} hari</button>)}
        </div>
      </div>

      {!d ? <div className="text-muted small"><span className="spinner-border spinner-border-sm me-2"></span>Memuat…</div> : (
        <>
          <div className="row g-3 mb-3">
            {[
              ["Guru aktif", `${d.ringkasan.guru_aktif} / ${d.ringkasan.guru}`, `dalam ${d.hari} hari`, "bi-people"],
              ["Aktif 7 hari terakhir", d.ringkasan.guru_aktif_7_hari, "guru", "bi-lightning-charge"],
              ["Rata-rata hari aktif", d.ringkasan.rata_hari_aktif, `hari per guru dari ${d.hari}`, "bi-calendar-week"],
              ["Portal siswa & orang tua", `${d.portal.siswa.aktif + d.portal.ortu.aktif}`, `aktif dari ${d.portal.siswa.akun + d.portal.ortu.akun} akun`, "bi-phone"],
            ].map(([judul, angka, ket, ikon]) => (
              <div key={judul} className="col-6 col-lg-3">
                <div className="card shadow-sm h-100"><div className="card-body py-2">
                  <div className="small text-muted"><i className={`bi ${ikon} me-1`}></i>{judul}</div>
                  <div className="fs-3 fw-bold">{angka}</div>
                  <div className="small text-muted">{ket}</div>
                </div></div>
              </div>
            ))}
          </div>

          <div className="row g-3 mb-3">
            <div className="col-lg-5">
              <div className="card shadow-sm h-100">
                <div className="card-header fw-semibold">Adopsi fitur oleh guru</div>
                <div className="card-body">
                  {d.adopsi.map((a) => (
                    <div key={a.kunci} className="mb-2 adopsi-fitur">
                      <div className="d-flex small"><span className="me-auto"><i className={`bi ${a.ikon} me-1`}></i>{a.label}</span>
                        <span className="text-muted">{a.guru_memakai} guru · {a.persen}%</span></div>
                      <div className="progress" style={{ height: 8 }} title={`${a.guru_bekerja} guru menyimpan pekerjaan di fitur ini`}>
                        <div className={`progress-bar ${a.persen >= 70 ? "bg-success" : a.persen >= 30 ? "bg-warning" : "bg-danger"}`} style={{ width: `${Math.max(a.persen, 2)}%` }}></div>
                      </div>
                    </div>
                  ))}
                  <div className="form-text">Dihitung dari guru yang membuka atau menyimpan sesuatu di fitur itu selama rentang waktu.</div>
                </div>
              </div>
            </div>
            <div className="col-lg-7">
              <div className="card shadow-sm h-100">
                <div className="card-header fw-semibold">Pengguna aktif per hari</div>
                <div className="card-body">{d.harian.length ? <GrafikHarian data={d.harian} sejak={d.sejak} hari={d.hari} /> : <div className="text-muted small">Belum ada aktivitas.</div>}</div>
              </div>
            </div>
          </div>

          <div className="card shadow-sm mb-3">
            <div className="card-header fw-semibold">Jejak kerja nyata ({d.hari} hari)</div>
            <div className="card-body">
              <div className="row g-2">
                {d.jejak.map((j) => (
                  <div key={j.label} className="col-6 col-md-3">
                    <div className={`border rounded p-2 h-100 ${j.jumlah === 0 ? "bg-body-tertiary" : ""}`}>
                      <div className="small text-muted"><i className={`bi ${j.ikon} me-1`}></i>{j.label}</div>
                      <div className={`fs-4 fw-bold ${j.jumlah === 0 ? "text-muted" : ""}`}>{j.jumlah.toLocaleString("id-ID")}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card shadow-sm mb-3">
            <div className="card-header fw-semibold d-flex flex-wrap gap-2">
              <span className="me-auto">Pemakaian per guru</span>
              <span className="small fw-normal text-muted"><span className="badge text-bg-success">angka</span> = pekerjaan disimpan · <span className="badge text-bg-light border">angka</span> = hanya dibuka · – = belum dipakai</span>
            </div>
            <div className="table-responsive">
              <table className="table table-sm align-middle mb-0 tabel-pemakaian" style={{ fontSize: ".85rem" }}>
                <thead className="table-light">
                  <tr>
                    <th>Guru</th><th className="text-center">Hari aktif</th><th>Terakhir</th>
                    {d.fitur.map((f) => <th key={f.kunci} className="text-center" title={f.label}><i className={`bi ${f.ikon}`}></i><div className="small fw-normal">{f.label}</div></th>)}
                  </tr>
                </thead>
                <tbody>
                  {d.per_guru.map((g) => (
                    <tr key={g.id} className={g.hari_aktif === 0 ? "table-warning" : ""}>
                      <td className="text-nowrap">{g.nama}</td>
                      <td className="text-center">{g.hari_aktif}</td>
                      <td className="text-nowrap small text-muted">{relatif(g.terakhir_aktif)}</td>
                      {d.fitur.map((f) => {
                        const x = g.fitur[f.kunci];
                        return (
                          <td key={f.kunci} className="text-center" title={`${f.label}: ${x.buka} kali dibuka, ${x.kerja} pekerjaan disimpan/dicetak`}>
                            {x.kerja > 0 ? <span className="badge text-bg-success">{x.kerja}</span> : x.buka > 0 ? <span className="badge text-bg-light border">{x.buka}</span> : <span className="text-muted">–</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {tidakAktif.length > 0 && (
              <div className="card-footer small text-warning-emphasis"><i className="bi bi-exclamation-triangle me-1"></i>
                {tidakAktif.length} guru belum aktif dalam {d.hari} hari: {tidakAktif.map((g) => g.nama).join(", ")}. Pertimbangkan pendampingan singkat.</div>
            )}
          </div>

          <div className="row g-3">
            <div className="col-lg-6">
              <div className="card shadow-sm h-100">
                <div className="card-header fw-semibold"><i className="bi bi-bug me-1"></i>Permintaan gagal</div>
                <div className="card-body small">
                  {!d.hambatan.gagal.length ? <div className="text-success"><i className="bi bi-check-circle me-1"></i>Tidak ada kegagalan yang tercatat.</div> : (
                    <table className="table table-sm mb-0"><thead><tr><th>Modul</th><th>Rute</th><th className="text-end">Kali</th><th className="text-end">Pengguna</th></tr></thead>
                      <tbody>{d.hambatan.gagal.map((x, i) => <tr key={i}><td>{x.modul || "–"}</td><td><code>{x.rute || "–"}</code></td><td className="text-end">{x.jumlah}</td><td className="text-end">{x.pengguna}</td></tr>)}</tbody></table>
                  )}
                </div>
              </div>
            </div>
            <div className="col-lg-6">
              <div className="card shadow-sm h-100">
                <div className="card-header fw-semibold"><i className="bi bi-hourglass-split me-1"></i>Permintaan paling lambat</div>
                <div className="card-body small">
                  {!d.hambatan.lambat.length ? <div className="text-muted">Belum cukup data.</div> : (
                    <table className="table table-sm mb-0"><thead><tr><th>Rute</th><th className="text-end">Kali</th><th className="text-end">Rata-rata</th><th className="text-end">9 dari 10 di bawah</th></tr></thead>
                      <tbody>{d.hambatan.lambat.map((x) => <tr key={x.rute} className={x.p90_ms > 3000 ? "table-danger" : x.p90_ms > 1500 ? "table-warning" : ""}><td><code>{x.rute}</code></td><td className="text-end">{x.jumlah}</td><td className="text-end">{(x.rata_ms / 1000).toFixed(1)} dtk</td><td className="text-end">{(x.p90_ms / 1000).toFixed(1)} dtk</td></tr>)}</tbody></table>
                  )}
                  <div className="form-text">Waktu di server, belum termasuk sinyal. Pembuatan dengan AI tidak dihitung karena memang menunggu penyedia AI.</div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
