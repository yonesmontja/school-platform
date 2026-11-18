"use client";
// Laporan level kompetensi ala AKM (CBT Tahap B) dari analisis paket: sebaran level, per domain literasi/numerasi,
// per kelas (sesi lintas kelas), per level kognitif C1–C6, per stimulus, dan level tiap siswa.
import { labelJenisStimulus } from "./konstanta";

export const WARNA_LEVEL = { PERLU_INTERVENSI: "danger", DASAR: "warning", CAKAP: "info", MAHIR: "success" };

/** Lencana satu level kompetensi. */
export function LencanaLevel({ kode, batas }) {
  if (!kode) return <span className="text-muted">–</span>;
  const l = batas.find((x) => x.kode === kode);
  return <span className={`badge text-bg-${WARNA_LEVEL[kode]}`} data-level={kode}>{l?.label || kode}</span>;
}

/** Batang bertumpuk jumlah siswa per level. */
function BatangSebaran({ sebaran, batas, label }) {
  const total = Object.values(sebaran).reduce((x, y) => x + y, 0);
  if (!total) return <div className="small text-muted">Belum ada siswa.</div>;
  return (
    <div className="progress-stacked" style={{ height: 22 }} aria-label={label}>
      {batas.map((l) => sebaran[l.kode] > 0 && (
        <div key={l.kode} className="progress" role="progressbar" style={{ width: `${(sebaran[l.kode] / total) * 100}%`, height: 22 }}
          aria-label={`${l.label}: ${sebaran[l.kode]} siswa`} aria-valuenow={sebaran[l.kode]} aria-valuemin={0} aria-valuemax={total} title={`${l.label}: ${sebaran[l.kode]} siswa`}>
          <div className={`progress-bar bg-${WARNA_LEVEL[l.kode]} small`}>{sebaran[l.kode]}</div>
        </div>
      ))}
    </div>
  );
}

export default function LevelKompetensi({ k }) {
  if (!k) return null;
  const { batas } = k;
  const rentang = batas.map((l, i) => `${l.label} ${l.min}${batas[i + 1] ? `–${batas[i + 1].min - 1}` : "–100"}%`).join(" · ");
  const adaDomain = k.domain.length > 0;

  return (
    <div className="border rounded p-3" data-level-kompetensi>
      <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
        <div className="fw-semibold me-auto"><i className="bi bi-reception-4 me-1"></i>Level kompetensi</div>
        {batas.map((l) => <span key={l.kode} className="small d-inline-flex align-items-center gap-1" data-sebaran-level={l.kode}>
          <span className={`d-inline-block rounded-circle bg-${WARNA_LEVEL[l.kode]}`} style={{ width: 10, height: 10 }}></span>{l.label}: <b>{k.sebaran[l.kode]}</b>
        </span>)}
      </div>
      <BatangSebaran sebaran={k.sebaran} batas={batas} label="Sebaran level kompetensi semua siswa" />
      <div className="form-text mb-3">Level dari persentase capaian siswa pada paket ini ({rentang}). ANBK resmi memakai penskalaan sendiri, jadi ini perkiraan untuk latihan dan tindak lanjut di kelas.</div>

      <div className="row g-3">
        {adaDomain && (
          <div className="col-lg-6">
            <div className="small fw-semibold mb-2">Per domain</div>
            {k.domain.map((d) => (
              <div key={d.domain} className="mb-2" data-domain={d.domain}>
                <div className="d-flex justify-content-between small"><span>{d.label} · {d.jumlah_butir} butir</span><span>rata-rata <b>{d.rata ?? "–"}%</b></span></div>
                <BatangSebaran sebaran={d.sebaran} batas={batas} label={`Sebaran level ${d.label}`} />
              </div>
            ))}
          </div>
        )}
        <div className={adaDomain ? "col-lg-6" : "col-12"}>
          <div className="small fw-semibold mb-2">Per level kognitif</div>
          {k.level_kognitif.map((l) => (
            <div key={l.level} className="mb-1">
              <div className="d-flex justify-content-between small"><span>{l.level} · {l.jumlah_butir} butir</span><span>{l.rata ?? "–"}%</span></div>
              <div className="progress" style={{ height: 8 }} role="progressbar" aria-label={`${l.level} ${l.rata ?? 0}%`} aria-valuenow={l.rata ?? 0} aria-valuemin={0} aria-valuemax={100}>
                <div className="progress-bar" style={{ width: `${l.rata ?? 0}%` }}></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {k.per_kelas.length > 1 && (
        <div className="table-responsive mt-3">
          <table className="table table-sm align-middle small mb-0">
            <thead><tr><th>Kelas</th><th className="text-center">Siswa</th><th className="text-center">Rata-rata</th>{batas.map((l) => <th key={l.kode} className="text-center">{l.label}</th>)}</tr></thead>
            <tbody>{k.per_kelas.map((c) => (
              <tr key={c.id_kelas || "-"} data-kelas-kompetensi={c.kelas}>
                <td>{c.kelas}</td><td className="text-center">{c.jumlah_siswa}</td><td className="text-center">{c.rata}%</td>
                {batas.map((l) => <td key={l.kode} className="text-center">{c.sebaran[l.kode]}</td>)}
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {k.stimulus.length > 0 && (
        <div className="table-responsive mt-3">
          <table className="table table-sm align-middle small mb-0">
            <thead><tr><th>Stimulus</th><th>Jenis</th><th className="text-center">Butir</th><th className="text-center">Rata-rata</th></tr></thead>
            <tbody>{k.stimulus.map((s) => (
              <tr key={s.id_stimulus}><td>{s.judul}</td><td>{labelJenisStimulus(s.jenis)}</td><td className="text-center">{s.jumlah_butir}</td>
                <td className={`text-center fw-semibold ${s.rata < 60 ? "text-danger" : ""}`}>{s.rata}%</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}

      <div className="table-responsive mt-3">
        <table className="table table-sm align-middle small mb-0">
          <thead><tr><th>#</th><th>Siswa</th>{k.per_kelas.length > 1 && <th>Kelas</th>}<th className="text-center">Capaian</th><th>Level</th>
            {k.domain.map((d) => <th key={d.domain}>{d.label}</th>)}</tr></thead>
          <tbody>{k.siswa.map((s, i) => (
            <tr key={s.id_siswa} data-siswa-kompetensi={s.nama_siswa}>
              <td>{i + 1}</td><td>{s.nama_siswa}</td>{k.per_kelas.length > 1 && <td>{s.kelas}</td>}
              <td className="text-center">{s.persen}%</td><td><LencanaLevel kode={s.level} batas={batas} /></td>
              {k.domain.map((d) => <td key={d.domain}>{s.domain[d.domain] ? <>{s.domain[d.domain].persen}% <LencanaLevel kode={s.domain[d.domain].level} batas={batas} /></> : "–"}</td>)}
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}
