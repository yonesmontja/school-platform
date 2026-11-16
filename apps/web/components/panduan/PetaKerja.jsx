"use client";
// Peta kerja guru: alur kerja satu semester (Persiapan → Rutin mingguan → Akhir semester) dengan progres dari data nyata.
// - ringkas: kartu di Dashboard (persen, langkah berikutnya, status tiap langkah);
// - lengkap: bagian atas halaman Panduan (semua langkah, rincian per mapel–kelas; admin/kepsek bisa memilih guru).
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { minta } from "@/components/banksoal/api";

export const STATUS_LANGKAH = {
  selesai: { ikon: "bi-check-circle-fill", warna: "success", label: "Selesai" },
  proses: { ikon: "bi-hourglass-split", warna: "warning", label: "Sedang berjalan" },
  menunggu: { ikon: "bi-clock-history", warna: "info", label: "Menunggu persetujuan" },
  belum: { ikon: "bi-circle", warna: "danger", label: "Belum dimulai" },
  opsional: { ikon: "bi-dash-circle", warna: "secondary", label: "Opsional" },
};

const angka = (l) => (l.total > 0 ? `${l.selesai}/${l.total}` : null);
const persenLangkah = (l) => (l.status === "selesai" ? 100 : l.total > 0 ? Math.round((Math.min(l.selesai, l.total) / l.total) * 100) : l.status === "proses" || l.status === "menunggu" ? 50 : 0);

function Berikutnya({ l }) {
  if (!l) {
    return (
      <div className="alert alert-success d-flex align-items-center gap-2 mb-0 py-2">
        <i className="bi bi-trophy fs-4"></i>
        <div><div className="fw-semibold">Semua langkah wajib sudah berjalan baik.</div><div className="small">Teruskan rutinitas mingguan: presensi, tutup sesi, nilai, dan tindak lanjut.</div></div>
      </div>
    );
  }
  return (
    <div className="border border-primary-subtle bg-primary-subtle rounded-3 p-3 d-flex flex-wrap align-items-center gap-3">
      <i className="bi bi-signpost-2 fs-2 text-primary"></i>
      <div className="flex-grow-1" style={{ minWidth: 220 }}>
        <div className="small text-primary-emphasis fw-semibold text-uppercase">Langkah berikutnya</div>
        <div className="fw-bold">{l.judul}</div>
        <div className="small">{l.info}</div>
        <div className="small text-body-secondary">{l.tujuan}</div>
      </div>
      <Link href={l.tautan} className="btn btn-primary"><i className="bi bi-arrow-right-circle me-1"></i>{l.tombol}</Link>
    </div>
  );
}

/** Peringatan langkah: masalah yang membuat data tidak terhitung (mis. ATP tanpa kelas). */
function Peringatan({ l }) {
  if (!l.peringatan?.length) return null;
  return (
    <ul className="list-unstyled small text-warning-emphasis bg-warning-subtle border border-warning-subtle rounded px-2 py-1 my-1">
      {l.peringatan.map((p, i) => <li key={i}><i className="bi bi-exclamation-triangle me-1"></i>{p}</li>)}
    </ul>
  );
}

/** Apa saja yang membuat satu langkah belum lengkap: peringatan + mapel–kelas yang belum beres beserta alasannya. */
function KenapaBelum({ l }) {
  const kurang = (l.rincian || []).filter((r) => !r.ok);
  return (
    <li className="border rounded p-2 mb-2" data-kenapa={l.id}>
      <div className="d-flex flex-wrap align-items-center gap-2">
        <span className="fw-semibold">{l.judul}</span>
        {angka(l) && <span className="small text-body-secondary">{angka(l)}</span>}
        <Link href={l.tautan} className="btn btn-sm btn-outline-primary ms-auto py-0">{l.tombol}</Link>
      </div>
      <div className="small">{l.info}</div>
      <Peringatan l={l} />
      {kurang.length > 0 && (
        <ul className="list-unstyled small mb-0 mt-1">
          {kurang.map((r) => <li key={r.label}><i className="bi bi-x-lg text-danger me-1"></i><b>{r.label}</b>{r.catatan && <span className="text-body-secondary">: {r.catatan}</span>}</li>)}
        </ul>
      )}
    </li>
  );
}

function Langkah({ l, no }) {
  const [buka, setBuka] = useState(false);
  const s = STATUS_LANGKAH[l.status] || STATUS_LANGKAH.belum;
  const p = persenLangkah(l);
  return (
    <li className="list-group-item px-0 py-2 bg-transparent" data-langkah={l.id}>
      <div className="d-flex gap-2 align-items-start">
        <i className={`bi ${s.ikon} text-${s.warna} fs-5 mt-n1`} title={s.label} aria-label={s.label}></i>
        <div className="flex-grow-1 min-w-0">
          <div className="d-flex flex-wrap align-items-center gap-2">
            <span className="fw-semibold">{no}. {l.judul}</span>
            {!l.wajib && <span className="badge text-bg-light border fw-normal">opsional</span>}
            {angka(l) && <span className="small text-body-secondary ms-auto">{angka(l)}</span>}
          </div>
          <div className="small text-body-secondary">{l.tujuan}</div>
          {l.total > 0 && (
            <div className="progress my-1" style={{ height: 6 }} role="progressbar" aria-valuenow={p} aria-valuemin={0} aria-valuemax={100} aria-label={`Progres ${l.judul}`}>
              <div className={`progress-bar bg-${s.warna}`} style={{ width: `${p}%` }}></div>
            </div>
          )}
          <div className="small">{l.info}</div>
          <Peringatan l={l} />
          <div className="d-flex flex-wrap gap-2 mt-1">
            <Link href={l.tautan} className={`btn btn-sm ${l.status === "belum" || l.status === "proses" ? "btn-outline-primary" : "btn-outline-secondary"}`}>
              <i className="bi bi-box-arrow-up-right me-1"></i>{l.tombol}
            </Link>
            {l.rincian?.length > 0 && (
              <button type="button" className="btn btn-sm btn-link text-decoration-none" onClick={() => setBuka((b) => !b)} aria-expanded={buka}>
                <i className={`bi ${buka ? "bi-chevron-up" : "bi-chevron-down"} me-1`}></i>Rincian per mapel–kelas
              </button>
            )}
          </div>
          {buka && (
            <ul className="list-unstyled small mt-1 mb-0 ps-1">
              {l.rincian.map((r) => (
                <li key={r.label}><i className={`bi ${r.ok ? "bi-check-lg text-success" : "bi-x-lg text-danger"} me-1`}></i>{r.label}{r.catatan && <span className="text-body-secondary"> · {r.catatan}</span>}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </li>
  );
}

export default function PetaKerja({ ringkas = false, bolehPilihGuru = false }) {
  const [hasil, setHasil] = useState(null);
  const [lengkap, setLengkap] = useState(false); // kartu dashboard: tampilkan apa yang membuat langkah belum lengkap
  const [galat, setGalat] = useState(null);
  const [idGuru, setIdGuru] = useState("");
  const [memuat, setMemuat] = useState(true);

  const muat = useCallback(async () => {
    setMemuat(true);
    try {
      setHasil(await minta("GET", `/panduan/kerja${idGuru ? `?id_guru=${encodeURIComponent(idGuru)}` : ""}`));
      setGalat(null);
    } catch (err) { setGalat(err.message); }
    finally { setMemuat(false); }
  }, [idGuru]);
  useEffect(() => { muat(); }, [muat]);

  const d = hasil?.data;
  if (ringkas && !d) return null; // kartu dashboard hanya untuk akun guru

  const pilihGuru = bolehPilihGuru && hasil?.daftar_guru && (
    <select className="form-select form-select-sm" style={{ maxWidth: 280 }} aria-label="Pilih guru" value={idGuru} onChange={(e) => setIdGuru(e.target.value)}>
      <option value="">— Pilih guru untuk dipantau —</option>
      {hasil.daftar_guru.map((g) => <option key={g.id_guru} value={g.id_guru}>{g.nama_guru}</option>)}
    </select>
  );

  const semua = d ? d.tahap.flatMap((t) => t.langkah) : [];
  const nomor = Object.fromEntries(semua.map((l, i) => [l.id, i + 1]));
  const periode = d?.periode ? `${d.periode.nama}${d.periode.minggu_ke && d.periode.jumlah_minggu ? ` · minggu ke-${Math.min(d.periode.minggu_ke, d.periode.jumlah_minggu)} dari ${d.periode.jumlah_minggu}` : ""}` : "Belum ada semester aktif";

  const kepala = d && (
    <div className="d-flex flex-wrap align-items-center gap-3 mb-3">
      <div className="position-relative" style={{ width: 64, height: 64 }} aria-label={`Progres keseluruhan ${d.persen}%`}>
        <svg viewBox="0 0 36 36" width="64" height="64" aria-hidden="true">
          <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--bs-secondary-bg)" strokeWidth="3.5" />
          <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--bs-primary)" strokeWidth="3.5" strokeLinecap="round"
            strokeDasharray={`${d.persen} ${100 - d.persen}`} strokeDashoffset="25" />
        </svg>
        <span className="position-absolute top-50 start-50 translate-middle fw-bold small">{d.persen}%</span>
      </div>
      <div className="flex-grow-1" style={{ minWidth: 200 }}>
        <div className="fw-bold">{d.guru.nama}</div>
        <div className="small text-body-secondary">{periode}</div>
        <div className="small text-body-secondary">
          {d.unit.length ? `Mengajar: ${d.unit.join(", ")}` : d.mapel.length ? `Mapel: ${d.mapel.join(", ")}` : "Belum ada mapel yang diampu"}
          {d.kelas_binaan.length > 0 && ` · Wali kelas ${d.kelas_binaan.join(", ")}`}
        </div>
      </div>
    </div>
  );

  if (ringkas) {
    const wajib = semua.filter((l) => l.wajib);
    const belumBeres = wajib.filter((l) => l.status !== "selesai" || l.peringatan?.length);
    return (
      <div className="card shadow-sm mb-3 peta-kerja" id="peta-kerja-ringkas">
        <div className="card-header fw-semibold d-flex flex-wrap align-items-center gap-2">
          <span><i className="bi bi-signpost-split me-1 text-primary"></i>Langkah kerja saya</span>
          <Link href="/dashboard/panduan" className="btn btn-sm btn-link ms-auto text-decoration-none">Peta kerja lengkap<i className="bi bi-chevron-right ms-1"></i></Link>
        </div>
        <div className="card-body">
          {kepala}
          <Berikutnya l={d.berikutnya} />
          <div className="d-flex flex-wrap gap-2 mt-3">
            {wajib.map((l) => {
              const s = STATUS_LANGKAH[l.status] || STATUS_LANGKAH.belum;
              return (
                <Link key={l.id} href={l.tautan} className={`badge rounded-pill border border-${s.warna}-subtle bg-${s.warna}-subtle text-${s.warna}-emphasis fw-normal text-decoration-none py-2 px-3`} title={`${s.label}: ${l.info}`}>
                  <i className={`bi ${s.ikon} me-1`}></i>{l.judul}{angka(l) && <span className="ms-1 opacity-75">{angka(l)}</span>}
                </Link>
              );
            })}
          </div>
          {belumBeres.length > 0 && (
            <>
              <button type="button" className="btn btn-sm btn-link text-decoration-none px-0 mt-2" onClick={() => setLengkap((b) => !b)} aria-expanded={lengkap}>
                <i className={`bi ${lengkap ? "bi-chevron-up" : "bi-chevron-down"} me-1`}></i>{lengkap ? "Sembunyikan keterangan" : "Lebih lengkap: apa yang belum lengkap?"}
              </button>
              {lengkap && <ul className="list-unstyled mt-2 mb-0">{belumBeres.map((l) => <KenapaBelum key={l.id} l={l} />)}</ul>}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <section className="card shadow-sm mb-4 peta-kerja" id="peta-kerja">
      <div className="card-header fw-semibold d-flex flex-wrap align-items-center gap-2">
        <span><i className="bi bi-signpost-split me-1 text-primary"></i>Peta kerja {bolehPilihGuru ? "guru" : "saya"}</span>
        <span className="small text-body-secondary fw-normal">Mulai dari mana, sudah sampai mana, dan apa berikutnya</span>
        <div className="ms-auto d-flex gap-2 align-items-center">
          {pilihGuru}
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={muat} disabled={memuat} title="Hitung ulang"><i className={`bi bi-arrow-clockwise`}></i></button>
        </div>
      </div>
      <div className="card-body">
        {galat && <div className="alert alert-warning py-2 small">{galat}</div>}
        {!d && !galat && (memuat ? <div className="text-body-secondary small">Menghitung progres…</div> : <div className="text-body-secondary small">{hasil?.message}</div>)}
        {d && (
          <>
            {kepala}
            <Berikutnya l={d.berikutnya} />
            <div className="row g-3 mt-1">
              {d.tahap.map((t, i) => {
                const l = t.langkah;
                const beres = l.filter((x) => x.status === "selesai").length;
                return (
                  <div key={t.id} className="col-lg-4">
                    <div className="h-100 border rounded-3 p-3">
                      <div className="d-flex align-items-center gap-2">
                        <span className="badge rounded-pill text-bg-primary">{i + 1}</span>
                        <i className={`bi ${t.ikon} text-primary`}></i>
                        <span className="fw-bold me-auto">{t.label}</span>
                        <span className="small text-body-secondary">{beres}/{l.length}</span>
                      </div>
                      <div className="small text-body-secondary mb-1">{t.keterangan}</div>
                      {l.length ? (
                        <ul className="list-group list-group-flush">{l.map((x) => <Langkah key={x.id} l={x} no={nomor[x.id]} />)}</ul>
                      ) : <div className="small text-body-secondary fst-italic">Tidak ada langkah untuk peran Anda.</div>}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="small text-body-secondary mt-2 d-flex flex-wrap gap-3">
              {Object.entries(STATUS_LANGKAH).map(([k, s]) => <span key={k}><i className={`bi ${s.ikon} text-${s.warna} me-1`}></i>{s.label}</span>)}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

