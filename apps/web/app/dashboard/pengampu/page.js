"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import { API_URL } from "@/app/lib/config";
import { bacaUser } from "@/app/lib/akses";

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

const kunciSel = (k, m) => `${k}|${m}`;

/** Pembagian mengajar per semester: tiap sel rombel × mapel berisi guru pengampu; kosong = guru bawaan mapel. */
export default function PengampuPage() {
  const [data, setData] = useState(null);
  const [idPeriode, setIdPeriode] = useState("");
  const [ubahan, setUbahan] = useState({});
  const [menyimpan, setMenyimpan] = useState(false);
  const [semuaKelas, setSemuaKelas] = useState(false);
  const [bisaUbah, setBisaUbah] = useState(false);

  useEffect(() => { setBisaUbah(bacaUser()?.role === "admin"); }, []);

  const muat = useCallback(async (periode) => {
    try {
      const d = await panggil(`${API_URL}/pengampu${periode ? `?id_periode=${encodeURIComponent(periode)}` : ""}`);
      setData(d);
      setIdPeriode(d.periode.id_periode);
      setUbahan({});
    } catch (e) {
      Swal.fire("Gagal memuat", e.message, "error");
    }
  }, []);

  useEffect(() => { muat(); }, [muat]);

  const tersimpan = useMemo(() => {
    const m = {};
    (data?.baris || []).forEach((b) => { m[kunciSel(b.id_kelas, b.id_mapel)] = b.id_guru; });
    return m;
  }, [data]);

  if (!data) return <div className="p-4 text-muted"><span className="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Memuat pembagian mengajar…</div>;

  const terkunci = !!data.periode.terkunci;
  const bolehUbah = bisaUbah && !terkunci;
  const kelas = data.kelas.filter((k) => semuaKelas || k.aktif_semester);
  const namaGuru = Object.fromEntries(data.guru.map((g) => [g.id_guru, g.nama_guru]));
  const nilaiSel = (k, m) => (kunciSel(k, m) in ubahan ? ubahan[kunciSel(k, m)] : tersimpan[kunciSel(k, m)] || "");
  const jumlahUbahan = Object.keys(ubahan).length;

  const simpan = async () => {
    setMenyimpan(true);
    try {
      const baris = Object.entries(ubahan).map(([k, g]) => {
        const [id_kelas, id_mapel] = k.split("|");
        return { id_kelas, id_mapel, id_guru: g || null };
      });
      const res = await panggil(`${API_URL}/pengampu`, { method: "PUT", body: JSON.stringify({ id_periode: idPeriode, baris }) });
      setData((d) => ({ ...d, baris: res.baris }));
      setUbahan({});
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: res.message, showConfirmButton: false, timer: 2000 });
    } catch (e) {
      Swal.fire("Gagal menyimpan", e.message, "error");
    } finally {
      setMenyimpan(false);
    }
  };

  // Isi satu baris mapel dengan guru yang sama untuk semua rombel yang tampil
  const isiBaris = (m, g) => {
    const baru = { ...ubahan };
    kelas.forEach((k) => { baru[kunciSel(k.id_kelas, m.id_mapel)] = g; });
    setUbahan(baru);
  };

  return (
    <div className="container-fluid py-3">
      <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
        <h1 className="h4 fw-bold mb-0 me-auto"><i className="bi bi-person-workspace me-2 text-primary" aria-hidden="true"></i>Pembagian Mengajar</h1>
        <label className="visually-hidden" htmlFor="periode">Semester</label>
        <select id="periode" className="form-select form-select-sm w-auto" value={idPeriode}
          onChange={(e) => { if (jumlahUbahan && !confirm("Perubahan yang belum disimpan akan hilang. Lanjut?")) return; muat(e.target.value); }}>
          {data.periodes.map((p) => (
            <option key={p.id_periode} value={p.id_periode}>{p.tahun_ajaran} {p.semester}{p.status_aktif === "AKTIF" ? " (aktif)" : ""}{p.terkunci ? " 🔒" : ""}</option>
          ))}
        </select>
        <div className="form-check form-switch mb-0">
          <input id="semuaKelas" className="form-check-input" type="checkbox" checked={semuaKelas} onChange={(e) => setSemuaKelas(e.target.checked)} />
          <label className="form-check-label small" htmlFor="semuaKelas">Tampilkan rombel nonaktif</label>
        </div>
      </div>
      <p className="small text-muted mb-3">
        Atur guru yang mengampu tiap mapel di tiap rombel pada semester ini. Sel kosong berarti guru bawaan di Data Sekolah → Mata Pelajaran.
        Guru hanya bisa mengisi nilai mapel di rombel yang diampunya.
        {terkunci && <b className="text-danger"> Semester ini terkunci; buka kuncinya di menu Semester untuk mengubah.</b>}
      </p>

      <div className="card border-0 shadow-sm">
        <div className="table-responsive">
          <table className="table table-sm table-bordered align-middle mb-0 small">
            <thead className="table-light">
              <tr>
                <th scope="col" style={{ minWidth: 180 }}>Mata pelajaran</th>
                {kelas.map((k) => (
                  <th scope="col" key={k.id_kelas} className="text-center" style={{ minWidth: 150 }}>
                    {k.nama_kelas}{!k.aktif_semester && <span className="badge text-bg-secondary ms-1">nonaktif</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.mapel.map((m) => (
                <tr key={m.id_mapel}>
                  <th scope="row" className="fw-normal">
                    <div className="fw-semibold">{m.nama_mapel}</div>
                    <div className="text-muted">Bawaan: {m.guru?.nama_guru || "belum diatur"}</div>
                    {bolehUbah && kelas.length > 1 && (
                      <select className="form-select form-select-sm mt-1" aria-label={`Isi semua rombel untuk ${m.nama_mapel}`} value=""
                        onChange={(e) => e.target.value && isiBaris(m, e.target.value === "-" ? "" : e.target.value)}>
                        <option value="">Isi semua rombel…</option>
                        <option value="-">Kembali ke guru bawaan</option>
                        {data.guru.map((g) => <option key={g.id_guru} value={g.id_guru}>{g.nama_guru}</option>)}
                      </select>
                    )}
                  </th>
                  {kelas.map((k) => {
                    const v = nilaiSel(k.id_kelas, m.id_mapel);
                    const diubah = kunciSel(k.id_kelas, m.id_mapel) in ubahan;
                    return (
                      <td key={k.id_kelas} className={diubah ? "table-warning" : v ? "table-info" : ""}>
                        {bolehUbah ? (
                          <select className="form-select form-select-sm" aria-label={`Guru ${m.nama_mapel} di ${k.nama_kelas}`} value={v}
                            onChange={(e) => setUbahan((u) => ({ ...u, [kunciSel(k.id_kelas, m.id_mapel)]: e.target.value }))}>
                            <option value="">{m.guru?.nama_guru ? `${m.guru.nama_guru} (bawaan)` : "— bawaan —"}</option>
                            {data.guru.map((g) => <option key={g.id_guru} value={g.id_guru}>{g.nama_guru}</option>)}
                          </select>
                        ) : (
                          <span>{v ? namaGuru[v] : <span className="text-muted">{m.guru?.nama_guru || "–"}</span>}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {bolehUbah && (
        <div className="d-flex justify-content-end gap-2 mt-3 position-sticky bottom-0 bg-body py-2">
          {jumlahUbahan > 0 && <button type="button" className="btn btn-outline-secondary" onClick={() => setUbahan({})}>Batalkan</button>}
          <button type="button" className="btn btn-success fw-bold" onClick={simpan} disabled={!jumlahUbahan || menyimpan}>
            {menyimpan ? "Menyimpan…" : `Simpan${jumlahUbahan ? ` (${jumlahUbahan} sel)` : ""}`}
          </button>
        </div>
      )}
    </div>
  );
}
