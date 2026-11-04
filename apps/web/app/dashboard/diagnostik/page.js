"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Swal from "sweetalert2";
import * as XLSX from "xlsx";
import { API_URL, authHeaders } from "@/app/lib/akses";
import { tingkatKktp } from "@/app/lib/kktp";

// Asesmen diagnostik awal semester (Kurikulum Merdeka): pemetaan kemampuan awal untuk pembelajaran berdiferensiasi
const TAB = [
  { id: "kognitif", label: "Kognitif", icon: "bi-lightbulb" },
  { id: "nonkognitif", label: "Non-kognitif", icon: "bi-heart-pulse" },
];
const GAYA = {
  VISUAL: { label: "Visual", ikon: "bi-eye", warna: "primary", tips: "Gunakan gambar, diagram, peta konsep, warna, dan video." },
  AUDITORI: { label: "Auditori", ikon: "bi-ear", warna: "success", tips: "Gunakan penjelasan lisan, diskusi, tanya jawab, lagu, dan membaca nyaring." },
  KINESTETIK: { label: "Kinestetik", ikon: "bi-hand-index-thumb", warna: "warning", tips: "Gunakan praktik langsung, alat peraga, permainan, dan gerak." },
};
const KESEJAHTERAAN = { BAIK: "Baik", CUKUP: "Cukup", PERLU_PERHATIAN: "Perlu perhatian" };
const DUKUNGAN = { BAIK: "Baik", CUKUP: "Cukup", KURANG: "Kurang" };

async function ambil(path, params) {
  const qs = params ? `?${new URLSearchParams(Object.entries(params).filter(([, v]) => v))}` : "";
  const res = await fetch(`${API_URL}${path}${qs}`, { headers: authHeaders(false) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Gagal memuat data");
  return data;
}
const angka = (v) => (v == null ? "-" : Number.isInteger(Number(v)) ? Number(v) : Number(v).toFixed(1));
const rata = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const tanggal = (t) => new Date(`${String(t).slice(0, 10)}T00:00:00`).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });

export default function DiagnostikPage() {
  const [opsi, setOpsi] = useState({ periodes: [], classes: [] });
  const [settings, setSettings] = useState(null);
  const [filter, setFilter] = useState({ id_periode: "", id_kelas: "" });
  const [tab, setTab] = useState("kognitif");

  useEffect(() => {
    Promise.all([ambil("/nilai/filters"), ambil("/settings")]).then(([f, s]) => {
      setOpsi(f); setSettings(s.data || s);
      const aktif = f.periodes.find((p) => p.status_aktif === "AKTIF") || f.periodes[0];
      setFilter({ id_periode: aktif?.id_periode || "", id_kelas: f.classes[0]?.id_kelas || "" });
    }).catch((e) => Swal.fire("Gagal memuat", e.message, "error"));
  }, []);

  return (
    <div className="container-fluid py-3">
      <div className="mb-3">
        <h3 className="fw-bold mb-0"><i className="bi bi-clipboard2-pulse text-primary me-2"></i>Asesmen Diagnostik</h3>
        <div className="small text-body-secondary">Pemetaan kemampuan awal dan kondisi siswa di awal semester sebagai dasar pembelajaran berdiferensiasi. Hasilnya tidak masuk rapor.</div>
      </div>

      <div className="card card-outline card-primary mb-3">
        <div className="card-body d-flex flex-wrap gap-3 align-items-end">
          <div>
            <label className="form-label small fw-semibold mb-1">Semester</label>
            <select className="form-select form-select-sm" value={filter.id_periode} onChange={(e) => setFilter((f) => ({ ...f, id_periode: e.target.value }))}>
              {opsi.periodes.map((p) => <option key={p.id_periode} value={p.id_periode}>{p.tahun_ajaran} ({p.semester}){p.status_aktif === "AKTIF" ? " • Aktif" : ""}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label small fw-semibold mb-1">Kelas</label>
            <select className="form-select form-select-sm" value={filter.id_kelas} onChange={(e) => setFilter((f) => ({ ...f, id_kelas: e.target.value }))}>
              {opsi.classes.map((k) => <option key={k.id_kelas} value={k.id_kelas}>{k.nama_kelas}</option>)}
            </select>
          </div>
          <ul className="nav nav-pills ms-md-auto">
            {TAB.map((t) => (
              <li key={t.id} className="nav-item">
                <button type="button" className={`nav-link py-1 ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}><i className={`bi ${t.icon} me-1`}></i>{t.label}</button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {filter.id_kelas && filter.id_periode && (tab === "kognitif"
        ? <Kognitif filter={filter} settings={settings} namaKelas={opsi.classes.find((k) => k.id_kelas === filter.id_kelas)?.nama_kelas} />
        : <NonKognitif filter={filter} />)}
    </div>
  );
}

// ================= KOGNITIF =================
function Kognitif({ filter, settings, namaKelas }) {
  const [data, setData] = useState(null);
  const [sesi, setSesi] = useState("");
  const tingkat = useMemo(() => tingkatKktp(settings), [settings]);
  const batasCukup = tingkat.find((t) => t.key === "c").min;
  const batasBaik = tingkat.find((t) => t.key === "b").min;

  useEffect(() => {
    setData(null);
    ambil("/diagnostik/kognitif", filter).then(setData).catch((e) => Swal.fire("Gagal memuat", e.message, "error"));
  }, [filter]);

  // Satu sesi diagnostik = mapel + materi + tanggal + aktivitas
  const daftarSesi = useMemo(() => {
    const peta = new Map();
    (data?.nilai || []).forEach((n) => {
      const kunci = [n.id_mapel, n.id_materi, String(n.tanggal).slice(0, 10), n.id_jenis].join("|");
      if (!peta.has(kunci)) peta.set(kunci, { kunci, mapel: n.mapel?.nama_mapel, materi: n.materi?.nama_materi, tanggal: n.tanggal, aktivitas: n.jenis?.kategori_penilaian, nilai: [] });
      peta.get(kunci).nilai.push(n);
    });
    return [...peta.values()].sort((a, b) => String(b.tanggal).localeCompare(String(a.tanggal)));
  }, [data]);
  useEffect(() => { setSesi(daftarSesi[0]?.kunci || ""); }, [daftarSesi]);
  const aktif = daftarSesi.find((s) => s.kunci === sesi);

  const hasil = useMemo(() => {
    if (!aktif || !data) return null;
    const indPerNilai = new Map();
    (data.nilai_indikator || []).forEach((i) => {
      if (!indPerNilai.has(i.id_nilai)) indPerNilai.set(i.id_nilai, []);
      indPerNilai.get(i.id_nilai).push(i);
    });
    const siswa = data.students.map((s) => {
      const n = aktif.nilai.find((x) => x.id_siswa === s.id_siswa);
      const ind = n ? (indPerNilai.get(n.id_nilai) || []) : [];
      const terlemah = [...ind].sort((a, b) => Number(a.nilai) - Number(b.nilai))[0];
      return { ...s, nilai: n ? Number(n.nilai) : null, terlemah: terlemah && Number(terlemah.nilai) < batasBaik ? terlemah.indikator?.deskripsi : null };
    });
    const ikut = siswa.filter((s) => s.nilai != null);
    const kelompok = [
      { id: "intensif", judul: "Perlu pendampingan intensif", warna: "danger", ikon: "bi-life-preserver", syarat: `< ${batasCukup}`,
        rekomendasi: "Ajarkan ulang konsep prasyarat dengan media konkret dalam kelompok kecil bersama guru, sebelum masuk materi inti.",
        siswa: ikut.filter((s) => s.nilai < batasCukup) },
      { id: "penguatan", judul: "Siap dengan penguatan", warna: "warning", ikon: "bi-signpost-2", syarat: `${batasCukup} – ${batasBaik - 1}`,
        rekomendasi: "Mulai materi inti dengan contoh terbimbing dan latihan bertahap; pantau bagian yang masih lemah.",
        siswa: ikut.filter((s) => s.nilai >= batasCukup && s.nilai < batasBaik) },
      { id: "mahir", judul: "Siap / mahir", warna: "success", ikon: "bi-rocket-takeoff", syarat: `≥ ${batasBaik}`,
        rekomendasi: "Langsung ke materi inti dengan tugas pengayaan dan tantangan; dapat berperan sebagai tutor sebaya.",
        siswa: ikut.filter((s) => s.nilai >= batasBaik) },
    ].map((k) => ({ ...k, siswa: k.siswa.sort((a, b) => a.nilai - b.nilai) }));

    // Rata-rata kelas per indikator, terlemah dulu: kemampuan prasyarat yang perlu diperkuat
    const perInd = new Map();
    aktif.nilai.forEach((n) => (indPerNilai.get(n.id_nilai) || []).forEach((i) => {
      const p = perInd.get(i.id_indikator) || { deskripsi: i.indikator?.deskripsi, nilai: [] };
      p.nilai.push(Number(i.nilai)); perInd.set(i.id_indikator, p);
    }));
    const indikator = [...perInd.values()].map((p) => ({ ...p, rata: rata(p.nilai) })).sort((a, b) => a.rata - b.rata);

    return { kelompok, belum: siswa.filter((s) => s.nilai == null), rataKelas: rata(ikut.map((s) => s.nilai)), ikut: ikut.length, indikator };
  }, [aktif, data, batasCukup, batasBaik]);

  const ekspor = () => {
    const baris = [["Kelompok", "No", "NISN", "Nama Siswa", "Nilai Diagnostik", "Kemampuan terlemah", "Rekomendasi"]];
    hasil.kelompok.forEach((k) => k.siswa.forEach((s, i) => baris.push([k.judul, i + 1, s.nisn || "", s.nama_siswa, s.nilai, s.terlemah || "", k.rekomendasi])));
    hasil.belum.forEach((s, i) => baris.push(["Belum mengikuti", i + 1, s.nisn || "", s.nama_siswa, "", "", ""]));
    const ws = XLSX.utils.aoa_to_sheet(baris);
    ws["!cols"] = [{ wch: 28 }, { wch: 5 }, { wch: 14 }, { wch: 28 }, { wch: 10 }, { wch: 40 }, { wch: 70 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pengelompokan");
    XLSX.writeFile(wb, `Diagnostik_${namaKelas}_${aktif.mapel}_${String(aktif.tanggal).slice(0, 10)}.xlsx`.replace(/[^\w.\-]+/g, "_"));
  };

  if (!data) return <div className="text-center text-body-secondary py-5"><span className="spinner-border spinner-border-sm me-2"></span>Memuat…</div>;
  if (!daftarSesi.length) {
    return (
      <div className="card border-0 shadow-sm p-4">
        <h6 className="fw-bold"><i className="bi bi-info-circle text-primary me-1"></i>Belum ada asesmen diagnostik kognitif untuk kelas ini</h6>
        <ol className="small mb-0 text-body-secondary">
          <li>Pastikan ada aktivitas berjenis <b>Diagnostik</b> di menu <Link href="/dashboard/master-mbk">Aktivitas</Link>{data.ada_aktivitas_diagnostik ? " (sudah ada)" : " (belum ada — minta admin menambahkan, mis. “Tes Pemetaan Awal”)"}.</li>
          <li>Berikan tes singkat tentang kemampuan prasyarat materi yang akan dipelajari, sebaiknya per indikator.</li>
          <li>Isi hasilnya di <Link href="/dashboard/nilai">Input Nilai</Link> dengan memilih aktivitas diagnostik tersebut.</li>
          <li>Kembali ke halaman ini untuk melihat pengelompokan siswa dan rekomendasi pembelajarannya.</li>
        </ol>
      </div>
    );
  }

  return (
    <>
      <div className="d-flex flex-wrap align-items-end gap-2 mb-3">
        <div className="flex-grow-1" style={{ maxWidth: 520 }}>
          <label className="form-label small fw-semibold mb-1">Sesi diagnostik</label>
          <select className="form-select form-select-sm" value={sesi} onChange={(e) => setSesi(e.target.value)}>
            {daftarSesi.map((s) => <option key={s.kunci} value={s.kunci}>{s.mapel} · {s.materi || "-"} · {tanggal(s.tanggal)} ({s.aktivitas})</option>)}
          </select>
        </div>
        {hasil && <button type="button" className="btn btn-sm btn-success" onClick={ekspor}><i className="bi bi-file-earmark-excel me-1"></i>Unduh pengelompokan</button>}
      </div>

      {hasil && (
        <>
          <div className="card border-0 shadow-sm p-3 mb-3">
            <div className="d-flex flex-wrap gap-3 align-items-center small mb-2">
              <span><b>{hasil.ikut}</b> dari {hasil.ikut + hasil.belum.length} siswa mengikuti</span>
              <span>Rata-rata kelas <b>{angka(hasil.rataKelas?.toFixed?.(1))}</b></span>
              <span className="text-body-secondary">Batas kelompok mengikuti KKTP sekolah (Cukup {batasCukup}, Baik {batasBaik}).</span>
            </div>
            <div className="progress diag-sebaran" style={{ height: 14 }}>
              {hasil.kelompok.map((k) => k.siswa.length > 0 && (
                <div key={k.id} className={`progress-bar bg-${k.warna}`} style={{ width: `${(k.siswa.length / hasil.ikut) * 100}%` }} title={`${k.judul}: ${k.siswa.length}`}>{k.siswa.length}</div>
              ))}
            </div>
          </div>

          <div className="row g-3 mb-3">
            {hasil.kelompok.map((k) => (
              <div key={k.id} className="col-lg-4">
                <div className="card border-0 shadow-sm h-100" style={{ borderTop: `4px solid var(--bs-${k.warna})` }}>
                  <div className="card-body">
                    <div className="d-flex align-items-center gap-2 mb-1">
                      <span className={`notif-ikon text-bg-${k.warna}`}><i className={`bi ${k.ikon}`}></i></span>
                      <div className="me-auto">
                        <div className="fw-bold">{k.judul}</div>
                        <div className="small text-body-secondary">Nilai {k.syarat}</div>
                      </div>
                      <span className="fs-4 fw-bold">{k.siswa.length}</span>
                    </div>
                    <div className={`small p-2 rounded bg-${k.warna}-subtle text-${k.warna}-emphasis my-2`}><i className="bi bi-lightbulb me-1"></i>{k.rekomendasi}</div>
                    {k.siswa.length === 0 ? <div className="small text-body-secondary">Tidak ada siswa.</div> : (
                      <div className="d-flex flex-column gap-1">
                        {k.siswa.map((s) => (
                          <div key={s.id_siswa} className="d-flex align-items-start gap-2 small border-bottom py-1">
                            <span className="me-auto">
                              <span className="fw-semibold">{s.nama_siswa}</span>
                              {s.terlemah && <span className="d-block text-body-secondary">Lemah: {s.terlemah}</span>}
                            </span>
                            <b>{angka(s.nilai)}</b>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="row g-3">
            {hasil.indikator.length > 0 && (
              <div className="col-lg-7">
                <div className="card border-0 shadow-sm p-3 h-100">
                  <h6 className="fw-bold mb-2"><i className="bi bi-bar-chart-steps text-primary me-1"></i>Kemampuan prasyarat per indikator</h6>
                  <div className="small text-body-secondary mb-2">Rata-rata kelas, terlemah di atas: perkuat bagian ini sebelum materi inti.</div>
                  {hasil.indikator.map((i) => {
                    const w = i.rata < batasCukup ? "danger" : i.rata < batasBaik ? "warning" : "success";
                    return (
                      <div key={i.deskripsi} className="mb-2 small">
                        <div className="d-flex justify-content-between"><span>{i.deskripsi}</span><b>{angka(Math.round(i.rata))}</b></div>
                        <div className="progress" style={{ height: 6 }}><div className={`progress-bar bg-${w}`} style={{ width: `${Math.min(100, i.rata)}%` }}></div></div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {hasil.belum.length > 0 && (
              <div className="col-lg-5">
                <div className="card border-0 shadow-sm p-3 h-100">
                  <h6 className="fw-bold mb-2"><i className="bi bi-person-dash text-secondary me-1"></i>Belum mengikuti ({hasil.belum.length})</h6>
                  <div className="d-flex flex-wrap gap-1">{hasil.belum.map((s) => <span key={s.id_siswa} className="badge text-bg-light border fw-normal">{s.nama_siswa}</span>)}</div>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}

// ================= NON-KOGNITIF =================
function NonKognitif({ filter }) {
  const [data, setData] = useState(null);
  const [isian, setIsian] = useState({});
  const [awal, setAwal] = useState({});
  const [simpan, setSimpan] = useState(false);

  const muat = () => ambil("/diagnostik/nonkognitif", filter).then((d) => {
    const peta = Object.fromEntries(d.students.map((s) => {
      const r = d.data.find((x) => x.id_siswa === s.id_siswa) || {};
      return [s.id_siswa, { gaya_belajar: r.gaya_belajar || "", minat: r.minat || "", kesejahteraan: r.kesejahteraan || "", dukungan_rumah: r.dukungan_rumah || "", catatan: r.catatan || "" }];
    }));
    setData(d); setIsian(peta); setAwal(peta);
  }).catch((e) => Swal.fire("Gagal memuat", e.message, "error"));
  useEffect(() => { setData(null); muat(); }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  const ubah = (id, k, v) => setIsian((p) => ({ ...p, [id]: { ...p[id], [k]: v } }));
  const berubah = Object.keys(isian).filter((id) => JSON.stringify(isian[id]) !== JSON.stringify(awal[id]));
  const boleh = data?.boleh_ubah;

  const kirim = async () => {
    setSimpan(true);
    try {
      const res = await fetch(`${API_URL}/diagnostik/nonkognitif`, {
        method: "PUT", headers: authHeaders(),
        body: JSON.stringify({ ...filter, records: berubah.map((id) => ({ id_siswa: id, ...isian[id] })) }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((d.errors && Object.values(d.errors)[0]?.[0]) || d.message || "Gagal menyimpan");
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: d.message, showConfirmButton: false, timer: 2500 });
      await muat();
    } catch (e) { Swal.fire("Gagal menyimpan", e.message, "error"); }
    finally { setSimpan(false); }
  };

  if (!data) return <div className="text-center text-body-secondary py-5"><span className="spinner-border spinner-border-sm me-2"></span>Memuat…</div>;
  const nilai = Object.values(awal);
  const terisi = nilai.filter((v) => v.gaya_belajar || v.kesejahteraan || v.dukungan_rumah || v.minat).length;
  const perhatian = data.students.filter((s) => awal[s.id_siswa]?.kesejahteraan === "PERLU_PERHATIAN" || awal[s.id_siswa]?.dukungan_rumah === "KURANG");

  return (
    <>
      <div className="row g-3 mb-3">
        <div className="col-lg-8">
          <div className="card border-0 shadow-sm p-3 h-100">
            <div className="d-flex align-items-center mb-2">
              <h6 className="fw-bold mb-0 me-auto"><i className="bi bi-person-badge text-primary me-1"></i>Profil gaya belajar kelas</h6>
              <span className="small text-body-secondary">{terisi}/{data.students.length} siswa terisi</span>
            </div>
            <div className="row g-2">
              {Object.entries(GAYA).map(([k, g]) => {
                const jml = nilai.filter((v) => v.gaya_belajar === k).length;
                return (
                  <div key={k} className="col-md-4">
                    <div className={`p-2 rounded h-100 bg-${g.warna}-subtle`}>
                      <div className="d-flex align-items-center gap-2"><i className={`bi ${g.ikon} fs-5 text-${g.warna}`}></i><b className="me-auto">{g.label}</b><span className="fs-5 fw-bold">{jml}</span></div>
                      <div className="small text-body-secondary mt-1">{g.tips}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div className="col-lg-4">
          <div className="card border-0 shadow-sm p-3 h-100">
            <h6 className="fw-bold mb-2"><i className="bi bi-heart-pulse text-danger me-1"></i>Perlu perhatian</h6>
            {perhatian.length === 0 ? <div className="small text-body-secondary">Belum ada siswa yang ditandai perlu perhatian.</div> : (
              <div className="d-flex flex-column gap-1">
                {perhatian.map((s) => (
                  <div key={s.id_siswa} className="small border-bottom pb-1">
                    <b>{s.nama_siswa}</b>
                    <span className="text-body-secondary"> · {[awal[s.id_siswa].kesejahteraan === "PERLU_PERHATIAN" && "kesejahteraan", awal[s.id_siswa].dukungan_rumah === "KURANG" && "dukungan rumah kurang"].filter(Boolean).join(", ")}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card card-outline card-primary">
        <div className="card-header d-flex flex-wrap align-items-center gap-2">
          <h3 className="card-title fw-semibold mb-0 me-auto">Lembar diagnostik non-kognitif</h3>
          {!boleh && <span className="badge text-bg-light border fw-normal"><i className="bi bi-eye me-1"></i>Hanya lihat · diisi wali kelas</span>}
          {boleh && (
            <button type="button" className="btn btn-sm btn-primary" onClick={kirim} disabled={!berubah.length || simpan}>
              {simpan ? <span className="spinner-border spinner-border-sm me-1"></span> : <i className="bi bi-floppy me-1"></i>}Simpan{berubah.length ? ` (${berubah.length})` : ""}
            </button>
          )}
        </div>
        <div className="card-body p-0">
          <div className="table-responsive">
            <table className="table table-sm align-middle mb-0 small">
              <thead className="table-light">
                <tr><th style={{ minWidth: 160 }}>Siswa</th><th style={{ minWidth: 130 }}>Gaya belajar</th><th style={{ minWidth: 160 }}>Minat / bakat</th><th style={{ minWidth: 140 }}>Kesejahteraan sosial-emosional</th><th style={{ minWidth: 120 }}>Dukungan belajar di rumah</th><th style={{ minWidth: 200 }}>Catatan</th></tr>
              </thead>
              <tbody>
                {data.students.map((s) => {
                  const v = isian[s.id_siswa] || {};
                  const pilih = (k, daftar) => (
                    <select className="form-select form-select-sm" value={v[k]} disabled={!boleh} onChange={(e) => ubah(s.id_siswa, k, e.target.value)}>
                      <option value="">—</option>
                      {Object.entries(daftar).map(([kk, l]) => <option key={kk} value={kk}>{typeof l === "string" ? l : l.label}</option>)}
                    </select>
                  );
                  return (
                    <tr key={s.id_siswa} className={berubah.includes(s.id_siswa) ? "table-warning" : ""}>
                      <td><div className="fw-semibold">{s.nama_siswa}</div><div className="text-body-secondary">{s.nisn || "-"}</div></td>
                      <td>{pilih("gaya_belajar", GAYA)}</td>
                      <td><input className="form-control form-control-sm" value={v.minat} disabled={!boleh} maxLength={255} placeholder="mis. menggambar, sepak bola" onChange={(e) => ubah(s.id_siswa, "minat", e.target.value)} /></td>
                      <td>{pilih("kesejahteraan", KESEJAHTERAAN)}</td>
                      <td>{pilih("dukungan_rumah", DUKUNGAN)}</td>
                      <td><input className="form-control form-control-sm" value={v.catatan} disabled={!boleh} maxLength={1000} placeholder="kondisi khusus, kebutuhan belajar" onChange={(e) => ubah(s.id_siswa, "catatan", e.target.value)} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card-footer small text-body-secondary">
          <i className="bi bi-shield-lock me-1"></i>Data ini bersifat pribadi: hanya untuk guru sebagai bahan menyiapkan pembelajaran, tidak tampil di rapor maupun portal orang tua.
        </div>
      </div>
    </>
  );
}
