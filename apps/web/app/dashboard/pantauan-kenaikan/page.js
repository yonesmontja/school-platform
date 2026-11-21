"use client";
import { Fragment, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { minta } from "@/components/banksoal/api";
import { FotoKecil } from "@/components/siswa/EditorFoto";
import Pengisi from "@/components/dashboard/Pengisi";
import { gagal, toast } from "../administrasi/bantu";

const TINGKAT_PK = {
  TINGGI: { label: "Berisiko tinggi", warna: "danger", ikon: "bi-exclamation-octagon" },
  WASPADA: { label: "Waspada", warna: "warning", ikon: "bi-exclamation-triangle" },
  PANTAU: { label: "Pantau", warna: "info", ikon: "bi-eye" },
  AMAN: { label: "Aman", warna: "success", ikon: "bi-check-circle" },
};
const JENIS_TINDAK = {
  CATATAN: "Catatan",
  REMEDIAL: "Remedial dijadwalkan",
  PEMBINAAN: "Pembinaan / bimbingan",
  PANGGIL_ORTU: "Orang tua dipanggil / bertemu",
  KABARI_ORTU: "Kabari orang tua (tampil di portal)",
};
const waktu = (t) => (t ? new Date(t).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "");
const angka = (v) => (v === null || v === undefined ? "-" : Number(v).toLocaleString("id-ID", { maximumFractionDigits: 1 }));

/**
 * Pantauan kenaikan kelas sepanjang tahun: aturan usulan kenaikan (N mapel di bawah KKM, rata-rata setahun) dihitung
 * terus dari nilai yang sudah masuk. Wali kelas mencatat tindak lanjut dan bisa membagikan ringkasan ke portal orang tua.
 */
function Isi() {
  const params = useSearchParams();
  const [d, setD] = useState(null);
  const [idKelas, setIdKelas] = useState(params.get("id_kelas") || "");
  const [saring, setSaring] = useState(params.get("tingkat") || "");
  const [buka, setBuka] = useState(params.get("siswa") || null);

  const muat = useCallback((kelas) => {
    minta("GET", `/pantauan-kenaikan${kelas ? `?id_kelas=${encodeURIComponent(kelas)}` : ""}`)
      .then((r) => { setD(r); setIdKelas(r.kelas?.id_kelas || ""); })
      .catch((e) => setD({ galat: e.message }));
  }, []);
  useEffect(() => { muat(params.get("id_kelas") || ""); }, [muat, params]);

  const hitung = useMemo(() => (d?.data || []).reduce((a, s) => ({ ...a, [s.tingkat]: (a[s.tingkat] || 0) + 1 }), {}), [d]);
  const baris = useMemo(() => (d?.data || []).filter((s) => !saring || s.tingkat === saring), [d, saring]);

  if (!d) return <div className="p-4 text-muted"><span className="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Memuat pantauan kenaikan…</div>;
  if (d.galat) return <div className="alert alert-warning m-3">{d.galat}</div>;

  const p = d.periode;
  const tambahTindak = (idSiswa, x) => setD((v) => ({ ...v, data: v.data.map((s) => s.id_siswa === idSiswa
    ? { ...s, tindak_lanjut: [x, ...s.tindak_lanjut], perlu_tindak: false, dikabarkan_ortu: s.dikabarkan_ortu || x.jenis === "KABARI_ORTU" } : s) }));
  const perlu = (d.data || []).filter((s) => s.perlu_tindak).length;

  return (
    <div className="container-fluid py-3">
      <div className="d-flex flex-wrap align-items-center gap-2 mb-1">
        <h1 className="h4 fw-bold mb-0 me-auto"><i className="bi bi-signpost-split me-2 text-primary" aria-hidden="true"></i>Pantauan Kenaikan</h1>
        <label className="visually-hidden" htmlFor="pk-kelas">Rombel</label>
        <select id="pk-kelas" className="form-select form-select-sm w-auto" value={idKelas} onChange={(e) => { setBuka(null); muat(e.target.value); }}>
          {d.pilihan_kelas.map((k) => <option key={k.id_kelas} value={k.id_kelas}>{k.nama_kelas}</option>)}
        </select>
        <Link href={`/dashboard/kenaikan?id_kelas=${encodeURIComponent(idKelas)}`} className="btn btn-sm btn-outline-secondary"><i className="bi bi-mortarboard me-1" aria-hidden="true"></i>Keputusan kenaikan</Link>
      </div>
      <p className="small text-body-secondary mb-3">
        Rata-rata setahun dari nilai tahun ajaran {p.tahun_ajaran} yang sudah masuk (sekarang semester {p.semester}).
        Aturan usulan: <strong>{d.batas_mapel_bawah} mapel atau lebih di bawah KKM → tidak naik</strong>. "Di tepi" = tuntas tetapi kurang dari {d.tepi} poin di atas KKM.
        {p.semester === "Ganjil" && " Semester Genap belum berjalan, jadi angka ini masih bisa banyak berubah."}
      </p>

      {d.ringkasan && d.ringkasan.length > 1 && (
        <div className="d-flex flex-wrap gap-2 mb-3" aria-label="Ringkasan per rombel">
          {d.ringkasan.map((r) => (
            <button key={r.id_kelas} type="button" onClick={() => { setBuka(null); muat(r.id_kelas); }}
              className={`btn btn-sm text-start ${r.id_kelas === idKelas ? "btn-primary" : "btn-outline-secondary"}`}>
              <div className="fw-semibold">{r.nama_kelas}</div>
              <div className="small">
                {r.tinggi > 0 && <span className="badge text-bg-danger me-1">{r.tinggi} tinggi</span>}
                {r.waspada > 0 && <span className="badge text-bg-warning me-1">{r.waspada} waspada</span>}
                {!r.tinggi && !r.waspada && <span className="opacity-75">aman</span>}
              </div>
            </button>
          ))}
        </div>
      )}

      <div className="d-flex flex-wrap gap-2 mb-3" role="group" aria-label="Saring tingkat risiko">
        <button type="button" className={`btn btn-sm ${!saring ? "btn-dark" : "btn-outline-dark"}`} onClick={() => setSaring("")}>Semua ({d.data.length})</button>
        {Object.entries(TINGKAT_PK).map(([k, t]) => (
          <button key={k} type="button" className={`btn btn-sm ${saring === k ? `btn-${t.warna}` : `btn-outline-${t.warna}`}`} onClick={() => setSaring(saring === k ? "" : k)}>
            <i className={`bi ${t.ikon} me-1`} aria-hidden="true"></i>{t.label} ({hitung[k] || 0})
          </button>
        ))}
      </div>

      {perlu > 0 && (
        <div className="alert alert-warning py-2 small" role="status">
          <i className="bi bi-bell me-1" aria-hidden="true"></i>{perlu} siswa berisiko belum punya tindak lanjut dalam {d.hari_tindak} hari terakhir.
        </div>
      )}

      <div className="card border-0 shadow-sm">
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0 small" data-pantauan-kenaikan>
            <thead className="table-light">
              <tr>
                <th scope="col">Siswa</th>
                <th scope="col">Status</th>
                <th scope="col">Mapel di bawah KKM</th>
                <th scope="col" className="text-center">Di tepi</th>
                <th scope="col" className="text-center">Kehadiran</th>
                <th scope="col">Tindak lanjut terakhir</th>
                <th scope="col"><span className="visually-hidden">Rincian</span></th>
              </tr>
            </thead>
            <tbody>
              {baris.length === 0 && <tr><td colSpan={7} className="text-center text-muted py-4">Tidak ada siswa pada saringan ini.</td></tr>}
              {baris.map((s) => {
                const t = TINGKAT_PK[s.tingkat];
                const akhir = s.tindak_lanjut[0];
                const terbuka = buka === s.id_siswa;
                return (
                  <Fragment key={s.id_siswa}>
                    <tr data-siswa={s.id_siswa} data-tingkat={s.tingkat}>
                      <td>
                        <div className="d-flex align-items-center gap-2">
                          <FotoKecil siswa={s} ukuran={28} />
                          <span className="fw-semibold">{s.nama_siswa}</span>
                        </div>
                      </td>
                      <td>
                        <span className={`badge text-bg-${t.warna}`}><i className={`bi ${t.ikon} me-1`} aria-hidden="true"></i>{t.label}</span>
                        {s.perlu_tindak && <div className="text-danger small mt-1">Perlu tindak lanjut</div>}
                      </td>
                      <td>
                        {s.mapel.filter((m) => m.status === "BAWAH").map((m) => (
                          <span key={m.id_mapel} className="badge bg-danger-subtle text-danger-emphasis border border-danger-subtle fw-normal me-1 mb-1">{m.nama} {angka(m.rata)}/{angka(m.kkm)}</span>
                        ))}
                        {s.mapel_bawah === 0 && <span className="text-muted">{s.mapel.length ? "-" : "Belum ada nilai"}</span>}
                      </td>
                      <td className="text-center">{s.mapel_tepi || "-"}</td>
                      <td className="text-center">{s.persen_hadir === null ? "-" : `${s.persen_hadir}%`}{s.alpa > 0 && <div className="text-danger">alpa {s.alpa}</div>}</td>
                      <td>
                        {akhir ? (
                          <div>
                            <div>{JENIS_TINDAK[akhir.jenis]} <span className="text-muted">· {waktu(akhir.pada)}</span></div>
                            <Pengisi pengisi={akhir.pembuat?.name} sebaris />
                          </div>
                        ) : <span className="text-muted">Belum ada</span>}
                        {s.dikabarkan_ortu && <div><span className="badge bg-primary-subtle text-primary-emphasis fw-normal mt-1"><i className="bi bi-phone me-1" aria-hidden="true"></i>Tampil di portal ortu</span></div>}
                      </td>
                      <td className="text-end">
                        <button type="button" className="btn btn-sm btn-outline-primary" aria-expanded={terbuka} onClick={() => setBuka(terbuka ? null : s.id_siswa)}>
                          {terbuka ? "Tutup" : "Rincian"}
                        </button>
                      </td>
                    </tr>
                    {terbuka && (
                      <tr className="table-light">
                        <td colSpan={7}><Rincian s={s} idKelas={idKelas} semester={p.semester} onTindak={(x) => tambahTindak(s.id_siswa, x)} /></td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Rincian({ s, idKelas, semester, onTindak }) {
  const [jenis, setJenis] = useState("CATATAN");
  const [catatan, setCatatan] = useState("");
  const [proses, setProses] = useState(false);

  const isiContohPesan = (j) => {
    setJenis(j);
    if (j === "KABARI_ORTU" && !catatan.trim()) {
      const bawah = s.mapel.filter((m) => m.status === "BAWAH").map((m) => m.nama);
      setCatatan(bawah.length
        ? `Bapak/Ibu, saat ini ${s.nama_siswa} belum tuntas di ${bawah.join(", ")}. Mari kita dampingi belajar di rumah; sekolah menyiapkan remedial dan bimbingan.`
        : `Bapak/Ibu, perkembangan ${s.nama_siswa} sejauh ini baik. Terima kasih atas dukungannya di rumah.`);
    }
  };

  const simpan = async (e) => {
    e.preventDefault();
    if (!catatan.trim()) return;
    setProses(true);
    try {
      const r = await minta("POST", "/pantauan-kenaikan/tindak", { id_siswa: s.id_siswa, jenis, catatan: catatan.trim() });
      onTindak(r.data);
      setCatatan("");
      setJenis("CATATAN");
      toast(r.message);
    } catch (er) { gagal(er); } finally { setProses(false); }
  };

  return (
    <div className="row g-3 py-2">
      <div className="col-lg-7">
        <div className="fw-semibold mb-1">Nilai per mapel (rata-rata setahun)</div>
        {s.mapel.length === 0 ? <div className="text-muted">Belum ada nilai tahun ini.</div> : (
          <table className="table table-sm table-bordered bg-body mb-2">
            <thead><tr><th scope="col">Mapel</th><th scope="col" className="text-center">KKM</th><th scope="col" className="text-center">Ganjil</th><th scope="col" className="text-center">Genap</th><th scope="col" className="text-center">Setahun</th><th scope="col">Perkiraan target</th></tr></thead>
            <tbody>
              {s.mapel.map((m) => (
                <tr key={m.id_mapel} className={m.status === "BAWAH" ? "table-danger" : m.status === "TEPI" ? "table-warning" : ""}>
                  <td>{m.nama}</td>
                  <td className="text-center">{angka(m.kkm)}</td>
                  <td className="text-center">{angka(m.rata_ganjil)}</td>
                  <td className="text-center">{angka(m.rata_genap)}</td>
                  <td className="text-center fw-semibold">{angka(m.rata)}</td>
                  <td>
                    {m.status === "BAWAH" && (m.sulit
                      ? <span className="text-danger">Tidak terkejar dari nilai baru saja; perlu remedial</span>
                      : <span>Rata-rata ≥ {m.target} pada penilaian {semester === "Genap" ? "yang tersisa" : "berikutnya"}</span>)}
                    {m.status === "TEPI" && <span className="text-body-secondary">Tuntas, selisih {angka(m.selisih)} poin</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="small text-body-secondary mb-2">Target adalah perkiraan: sisa penilaian dianggap sebanyak penilaian semester Ganjil. Nilai remedial menggantikan nilai asal (paling tinggi KKM).</div>
        <div className="d-flex flex-wrap gap-2">
          <Link className="btn btn-sm btn-outline-secondary" href="/dashboard/nilai"><i className="bi bi-arrow-repeat me-1" aria-hidden="true"></i>Nilai &amp; remedial</Link>
          <Link className="btn btn-sm btn-outline-secondary" href={`/dashboard/presensi?kelas=${encodeURIComponent(idKelas)}&pembinaan=1`}><i className="bi bi-person-check me-1" aria-hidden="true"></i>Pembinaan</Link>
          <Link className="btn btn-sm btn-outline-secondary" href={`/dashboard/portal?siswa=${encodeURIComponent(s.id_siswa)}`}><i className="bi bi-person-badge me-1" aria-hidden="true"></i>Dashboard pribadi</Link>
          <Link className="btn btn-sm btn-outline-secondary" href={`/dashboard/rekam-jejak?siswa=${encodeURIComponent(s.id_siswa)}`}><i className="bi bi-journal-text me-1" aria-hidden="true"></i>Rekam jejak</Link>
        </div>
      </div>
      <div className="col-lg-5">
        <div className="fw-semibold mb-1">Tindak lanjut</div>
        <form onSubmit={simpan} className="mb-2">
          <label className="form-label small mb-1" htmlFor={`pk-jenis-${s.id_siswa}`}>Jenis</label>
          <select id={`pk-jenis-${s.id_siswa}`} className="form-select form-select-sm mb-2" value={jenis} onChange={(e) => isiContohPesan(e.target.value)}>
            {Object.entries(JENIS_TINDAK).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <label className="form-label small mb-1" htmlFor={`pk-catatan-${s.id_siswa}`}>{jenis === "KABARI_ORTU" ? "Pesan untuk orang tua" : "Catatan"}</label>
          <textarea id={`pk-catatan-${s.id_siswa}`} className="form-control form-control-sm mb-2" rows={3} maxLength={2000} value={catatan} onChange={(e) => setCatatan(e.target.value)} required />
          {jenis === "KABARI_ORTU" && <div className="small text-body-secondary mb-2">Orang tua akan melihat mapel yang perlu perhatian, target perkiraannya, dan pesan ini di portal.</div>}
          <button type="submit" className="btn btn-sm btn-primary" disabled={proses || !catatan.trim()}>
            {proses ? <span className="spinner-border spinner-border-sm me-1" aria-hidden="true"></span> : <i className="bi bi-check2 me-1" aria-hidden="true"></i>}Simpan
          </button>
        </form>
        {s.tindak_lanjut.length === 0 ? <div className="text-muted small">Belum ada tindak lanjut tahun ajaran ini.</div> : (
          <ul className="list-unstyled small mb-0">
            {s.tindak_lanjut.map((x) => (
              <li key={x.id} className="border-start border-3 ps-2 mb-2">
                <div><strong>{JENIS_TINDAK[x.jenis]}</strong> <span className="text-muted">· {waktu(x.pada)}</span></div>
                <div className="text-wrap" style={{ whiteSpace: "pre-line" }}>{x.catatan}</div>
                <Pengisi pengisi={x.pembuat?.name} sebaris />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function Halaman() {
  return <Suspense fallback={null}><Isi /></Suspense>;
}
