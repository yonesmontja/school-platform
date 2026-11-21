"use client";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Swal from "sweetalert2";
import { API_URL } from "@/app/lib/config";

const getToken = () => localStorage.getItem("token");

async function panggil(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${getToken()}`, Accept: "application/json", "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const teks = await res.text();
  let data = {};
  try { data = teks ? JSON.parse(teks) : {}; } catch { throw new Error("Respon server tidak valid."); }
  if (!res.ok) throw new Error(data.message || "Terjadi kesalahan pada server");
  return data;
}

const LABEL = { NAIK: "Naik", TIDAK_NAIK: "Tidak naik", LULUS: "Lulus" };
const WARNA = { NAIK: "success", TIDAK_NAIK: "danger", LULUS: "primary" };

function KenaikanIsi() {
  const params = useSearchParams();
  const [data, setData] = useState(null);
  const [idKelas, setIdKelas] = useState(params.get("id_kelas") || "");
  const [isian, setIsian] = useState({});
  const [proses, setProses] = useState(false);

  const muat = useCallback(async (kelas) => {
    try {
      const d = await panggil(`${API_URL}/kenaikan${kelas ? `?id_kelas=${encodeURIComponent(kelas)}` : ""}`);
      setData(d);
      setIdKelas(d.kelas?.id_kelas || "");
      setIsian({});
    } catch (e) {
      setData({ galat: e.message });
    }
  }, []);

  useEffect(() => { muat(params.get("id_kelas") || ""); }, [muat, params]);

  const baris = useMemo(() => (data?.data || []).map((s) => {
    const ubah = isian[s.id_siswa] || {};
    return {
      ...s,
      pilihan: ubah.keputusan ?? s.keputusan?.keputusan ?? s.usulan.keputusan,
      alasan: ubah.alasan ?? s.keputusan?.alasan ?? "",
      tersimpan: !!s.keputusan,
      berbeda: (ubah.keputusan ?? s.keputusan?.keputusan ?? s.usulan.keputusan) !== s.usulan.keputusan,
    };
  }), [data, isian]);

  if (!data) return <div className="p-4 text-muted"><span className="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Memuat kenaikan kelas…</div>;
  if (data.galat) return <div className="alert alert-warning m-3">{data.galat}</div>;

  const disahkan = baris.length > 0 && baris.every((b) => b.keputusan?.disahkan);
  const lengkap = baris.length > 0 && baris.every((b) => b.tersimpan);
  const adaUbahan = Object.keys(isian).length > 0 || baris.some((b) => !b.tersimpan);
  const ubah = (id, k, v) => setIsian((x) => ({ ...x, [id]: { ...(x[id] || {}), [k]: v } }));

  const simpan = async () => {
    setProses(true);
    try {
      const res = await panggil(`${API_URL}/kenaikan`, { method: "PUT", body: JSON.stringify({
        id_kelas: idKelas, id_periode: data.periode.id_periode,
        baris: baris.map((b) => ({ id_siswa: b.id_siswa, keputusan: b.pilihan, alasan: b.alasan || null })),
      }) });
      setData((d) => ({ ...d, data: res.data }));
      setIsian({});
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: res.message, showConfirmButton: false, timer: 2000 });
    } catch (e) {
      Swal.fire("Gagal menyimpan", e.message, "error");
    } finally {
      setProses(false);
    }
  };

  const sahkan = async (nilai) => {
    const ok = await Swal.fire({
      title: nilai ? `Sahkan kenaikan ${data.kelas.nama_kelas}?` : "Batalkan pengesahan?",
      text: nilai ? "Keputusan tampil di rapor Genap dan diterapkan saat tahun ajaran berganti." : "Wali kelas bisa mengubah keputusan lagi.",
      icon: "question", showCancelButton: true, confirmButtonText: nilai ? "Sahkan" : "Batalkan pengesahan", cancelButtonText: "Kembali",
    });
    if (!ok.isConfirmed) return;
    setProses(true);
    try {
      const res = await panggil(`${API_URL}/kenaikan/sahkan`, { method: "POST", body: JSON.stringify({ id_kelas: idKelas, id_periode: data.periode.id_periode, sahkan: nilai }) });
      setData((d) => ({ ...d, data: res.data }));
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: res.message, showConfirmButton: false, timer: 2500 });
    } catch (e) {
      Swal.fire("Gagal", e.message, "error");
    } finally {
      setProses(false);
    }
  };

  const hitung = (k) => baris.filter((b) => b.pilihan === k).length;

  return (
    <div className="container-fluid py-3">
      <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
        <h1 className="h4 fw-bold mb-0 me-auto"><i className="bi bi-mortarboard me-2 text-primary" aria-hidden="true"></i>Kenaikan Kelas</h1>
        <label className="visually-hidden" htmlFor="kelas">Rombel</label>
        <select id="kelas" className="form-select form-select-sm w-auto" value={idKelas}
          onChange={(e) => { if (adaUbahan && Object.keys(isian).length && !confirm("Perubahan belum disimpan. Lanjut?")) return; muat(e.target.value); }}>
          {data.pilihan_kelas.map((k) => <option key={k.id_kelas} value={k.id_kelas}>{k.nama_kelas}</option>)}
        </select>
        <Link href={`/dashboard/pantauan-kenaikan?id_kelas=${encodeURIComponent(idKelas)}`} className="btn btn-sm btn-outline-secondary"><i className="bi bi-signpost-split me-1" aria-hidden="true"></i>Pantauan sepanjang tahun</Link>
      </div>
      <p className="small text-muted mb-3">
        Semester {data.periode.tahun_ajaran} {data.periode.semester}. Usulan dihitung dari rata-rata nilai setahun per mapel dan kehadiran:
        Tidak naik bila {data.batas_mapel_bawah} mapel atau lebih di bawah KKM; kelas {data.tingkat_akhir} diusulkan Lulus. Wali kelas menetapkan keputusan, lalu kepala sekolah mengesahkan.
      </p>

      {!data.kelas ? (
        <div className="alert alert-info">Tidak ada rombel yang bisa Anda kelola.</div>
      ) : (
        <>
          <div className="d-flex flex-wrap gap-2 mb-2 small">
            <span className="badge text-bg-success">Naik {hitung("NAIK")}</span>
            <span className="badge text-bg-danger">Tidak naik {hitung("TIDAK_NAIK")}</span>
            <span className="badge text-bg-primary">Lulus {hitung("LULUS")}</span>
            {disahkan ? <span className="badge text-bg-dark"><i className="bi bi-patch-check-fill me-1" aria-hidden="true"></i>Disahkan</span>
              : lengkap ? <span className="badge text-bg-warning">Menunggu pengesahan</span>
              : <span className="badge text-bg-secondary">Belum lengkap</span>}
          </div>
          <div className="card border-0 shadow-sm">
            <div className="table-responsive">
              <table className="table table-sm align-middle mb-0 small">
                <thead className="table-light">
                  <tr><th scope="col">Siswa</th><th scope="col">Usulan dari data</th><th scope="col" style={{ minWidth: 150 }}>Keputusan</th><th scope="col" style={{ minWidth: 220 }}>Catatan</th></tr>
                </thead>
                <tbody>
                  {baris.map((b) => (
                    <tr key={b.id_siswa} className={b.pilihan === "TIDAK_NAIK" ? "table-danger" : ""}>
                      <td>
                        <div className="fw-semibold">{b.nama_siswa}</div>
                        <div className="text-muted">{b.nisn || "-"} · {b.jenis_kelamin}</div>
                      </td>
                      <td>
                        <span className={`badge text-bg-${WARNA[b.usulan.keputusan]}`}>{LABEL[b.usulan.keputusan]}</span>
                        {b.usulan.rata_rata !== null && <span className="ms-1">rata-rata {b.usulan.rata_rata}</span>}
                        <ul className="mb-0 ps-3 text-muted">{b.usulan.alasan.map((a, i) => <li key={i}>{a}</li>)}</ul>
                      </td>
                      <td>
                        <select className="form-select form-select-sm" aria-label={`Keputusan ${b.nama_siswa}`} value={b.pilihan} disabled={disahkan}
                          onChange={(e) => ubah(b.id_siswa, "keputusan", e.target.value)}>
                          {Object.entries(LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                        {b.berbeda && <div className="text-warning mt-1"><i className="bi bi-exclamation-circle me-1" aria-hidden="true"></i>Berbeda dari usulan</div>}
                        {b.keputusan?.pengisi && <div className="text-muted mt-1">diisi {b.keputusan.pengisi}</div>}
                      </td>
                      <td>
                        <input className="form-control form-control-sm" aria-label={`Catatan ${b.nama_siswa}`} maxLength={1000} value={b.alasan} disabled={disahkan}
                          placeholder={b.berbeda ? "Tuliskan pertimbangan wali kelas" : "Opsional"} onChange={(e) => ubah(b.id_siswa, "alasan", e.target.value)} />
                      </td>
                    </tr>
                  ))}
                  {baris.length === 0 && <tr><td colSpan="4" className="text-center text-muted py-3">Rombel ini belum punya siswa.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
          <div className="d-flex flex-wrap justify-content-end gap-2 mt-3 position-sticky bottom-0 bg-body py-2">
            {!disahkan && <button type="button" className="btn btn-success fw-bold" onClick={simpan} disabled={proses || !baris.length}>{proses ? "Menyimpan…" : "Simpan keputusan"}</button>}
            {data.boleh_sahkan && !disahkan && <button type="button" className="btn btn-primary" onClick={() => sahkan(true)} disabled={proses || !lengkap || Object.keys(isian).length > 0}
              title={!lengkap ? "Simpan keputusan semua siswa dulu" : ""}><i className="bi bi-patch-check me-1" aria-hidden="true"></i>Sahkan</button>}
            {data.boleh_sahkan && disahkan && <button type="button" className="btn btn-outline-danger" onClick={() => sahkan(false)} disabled={proses}>Batalkan pengesahan</button>}
            <Link href="/dashboard/rapor" className="btn btn-outline-secondary">Buka Rapor</Link>
          </div>
        </>
      )}
    </div>
  );
}

export default function KenaikanPage() {
  return <Suspense fallback={null}><KenaikanIsi /></Suspense>;
}
