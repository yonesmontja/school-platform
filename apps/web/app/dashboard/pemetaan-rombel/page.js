"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
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

/**
 * Bagi rata: siswa diurutkan per jenis kelamin lalu nama, dan tiap siswa masuk ke rombel yang saat itu paling sedikit
 * (anggota lama + yang sudah dibagi) untuk jenis kelaminnya, sehingga jumlah dan komposisi L/P seimbang.
 */
function bagiRata(siswa, rombel) {
  const hitung = Object.fromEntries(rombel.map((r) => [r.id_kelas, {
    total: r.anggota.length,
    L: r.anggota.filter((a) => a.jenis_kelamin === "L").length,
    P: r.anggota.filter((a) => a.jenis_kelamin === "P").length,
  }]));
  const urut = [...siswa].sort((a, b) => (a.jenis_kelamin || "").localeCompare(b.jenis_kelamin || "") || a.nama_siswa.localeCompare(b.nama_siswa));
  const hasil = {};
  urut.forEach((s) => {
    const jk = s.jenis_kelamin === "P" ? "P" : "L";
    const pilih = [...rombel].sort((a, b) => hitung[a.id_kelas][jk] - hitung[b.id_kelas][jk] || hitung[a.id_kelas].total - hitung[b.id_kelas].total)[0];
    hasil[s.id_siswa] = pilih.id_kelas;
    hitung[pilih.id_kelas][jk]++;
    hitung[pilih.id_kelas].total++;
  });
  return hasil;
}

export default function PemetaanRombelPage() {
  const [data, setData] = useState(null);
  const [penempatan, setPenempatan] = useState({});
  const [proses, setProses] = useState(false);

  const muat = useCallback(async (tingkat) => {
    try {
      const d = await panggil(`${API_URL}/pemetaan-rombel${tingkat ? `?tingkat=${tingkat}` : ""}`);
      setData(d);
      setPenempatan({});
    } catch (e) {
      Swal.fire("Gagal memuat", e.message, "error");
    }
  }, []);

  useEffect(() => { muat(); }, [muat]);

  const siswaPilihan = useMemo(() => (data ? [...data.menunggu, ...data.tanpa_tingkat] : []), [data]);

  if (!data) return <div className="p-4 text-muted"><span className="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Memuat pemetaan rombel…</div>;

  const rombel = data.rombel;
  const jumlahDitempatkan = Object.values(penempatan).filter(Boolean).length;
  const ringkas = (r) => {
    const tambahan = siswaPilihan.filter((s) => penempatan[s.id_siswa] === r.id_kelas);
    const semua = [...r.anggota, ...tambahan];
    return { total: semua.length, L: semua.filter((a) => a.jenis_kelamin === "L").length, P: semua.filter((a) => a.jenis_kelamin === "P").length, baru: tambahan.length };
  };

  const simpan = async () => {
    setProses(true);
    try {
      const baris = Object.entries(penempatan).filter(([, k]) => k).map(([id_siswa, id_kelas]) => ({ id_siswa, id_kelas }));
      const res = await panggil(`${API_URL}/pemetaan-rombel`, { method: "PUT", body: JSON.stringify({ baris }) });
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: res.message, showConfirmButton: false, timer: 2500 });
      muat(data.tingkat);
    } catch (e) {
      Swal.fire("Gagal menyimpan", e.message, "error");
    } finally {
      setProses(false);
    }
  };

  return (
    <div className="container-fluid py-3">
      <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
        <h1 className="h4 fw-bold mb-0 me-auto"><i className="bi bi-diagram-3 me-2 text-primary" aria-hidden="true"></i>Pemetaan Rombel</h1>
      </div>
      <p className="small text-muted mb-3">
        Siswa yang naik kelas otomatis berpindah ke tingkat berikutnya saat semester ditutup. Bila tingkat itu punya lebih dari satu rombel (mis. 2A, 2B, 2C),
        tempatkan siswa di sini. Siswa baru tanpa rombel juga muncul di sini.
      </p>

      <ul className="nav nav-pills mb-3 gap-1" aria-label="Tingkat">
        {data.daftar_tingkat.map((t) => (
          <li className="nav-item" key={t.tingkat}>
            <button type="button" className={`nav-link py-1 ${t.tingkat === data.tingkat ? "active" : ""}`} aria-current={t.tingkat === data.tingkat ? "page" : undefined}
              onClick={() => { if (jumlahDitempatkan && !confirm("Penempatan belum disimpan. Lanjut?")) return; muat(t.tingkat); }}>
              Tingkat {t.tingkat}{t.menunggu > 0 && <span className="badge text-bg-warning ms-1">{t.menunggu}</span>}
            </button>
          </li>
        ))}
      </ul>

      {rombel.length === 0 ? (
        <div className="alert alert-warning">Belum ada rombel aktif untuk tingkat {data.tingkat}. Tambahkan di Data Sekolah → Kelas (isi Tingkat).</div>
      ) : (
        <div className="row g-3">
          <div className="col-lg-7">
            <div className="card border-0 shadow-sm h-100">
              <div className="card-header bg-white d-flex flex-wrap align-items-center gap-2">
                <h2 className="h6 fw-bold mb-0 me-auto">Menunggu penempatan ({siswaPilihan.length})</h2>
                {siswaPilihan.length > 0 && rombel.length > 0 && (
                  <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => setPenempatan(bagiRata(siswaPilihan.filter((s) => s.tingkat_tunggu === data.tingkat), rombel))}>
                    <i className="bi bi-shuffle me-1" aria-hidden="true"></i>Bagi rata
                  </button>
                )}
              </div>
              <div className="table-responsive">
                <table className="table table-sm align-middle mb-0 small">
                  <thead className="table-light"><tr><th scope="col">Siswa</th><th scope="col">L/P</th><th scope="col" style={{ minWidth: 160 }}>Rombel</th></tr></thead>
                  <tbody>
                    {siswaPilihan.map((s) => (
                      <tr key={s.id_siswa}>
                        <td>
                          <div className="fw-semibold">{s.nama_siswa}</div>
                          <div className="text-muted">{s.tingkat_tunggu ? `Naik ke tingkat ${s.tingkat_tunggu}` : "Belum punya tingkat (siswa baru)"}</div>
                        </td>
                        <td>{s.jenis_kelamin || "-"}</td>
                        <td>
                          <select className="form-select form-select-sm" aria-label={`Rombel ${s.nama_siswa}`} value={penempatan[s.id_siswa] || ""}
                            onChange={(e) => setPenempatan((p) => ({ ...p, [s.id_siswa]: e.target.value }))}>
                            <option value="">— pilih —</option>
                            {rombel.map((r) => <option key={r.id_kelas} value={r.id_kelas}>{r.nama_kelas}</option>)}
                          </select>
                        </td>
                      </tr>
                    ))}
                    {siswaPilihan.length === 0 && <tr><td colSpan="3" className="text-center text-muted py-3">Tidak ada siswa yang menunggu di tingkat ini.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div className="col-lg-5">
            <div className="card border-0 shadow-sm">
              <div className="card-header bg-white"><h2 className="h6 fw-bold mb-0">Rombel tingkat {data.tingkat}</h2></div>
              <ul className="list-group list-group-flush">
                {rombel.map((r) => {
                  const h = ringkas(r);
                  return (
                    <li key={r.id_kelas} className="list-group-item">
                      <div className="d-flex align-items-center">
                        <strong className="me-auto">{r.nama_kelas}</strong>
                        <span className="small">{h.total} siswa · L {h.L} / P {h.P}</span>
                        {h.baru > 0 && <span className="badge text-bg-warning ms-2">+{h.baru}</span>}
                      </div>
                      {r.anggota.length > 0 && <div className="small text-muted text-truncate">{r.anggota.map((a) => a.nama_siswa).join(", ")}</div>}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      )}

      {jumlahDitempatkan > 0 && (
        <div className="d-flex justify-content-end gap-2 mt-3 position-sticky bottom-0 bg-body py-2">
          <button type="button" className="btn btn-outline-secondary" onClick={() => setPenempatan({})}>Batalkan</button>
          <button type="button" className="btn btn-success fw-bold" onClick={simpan} disabled={proses}>{proses ? "Menyimpan…" : `Simpan penempatan (${jumlahDitempatkan})`}</button>
        </div>
      )}
    </div>
  );
}
