"use client";
// Pindahkan lembar: membetulkan salah pilih materi, jenis penilaian, atau tanggal setelah nilai tersimpan
// (lewat Input Nilai maupun Import Excel). Seluruh nilai siswa di lembar itu pindah sekaligus; rencana tindak lanjut
// dan nilai remedialnya ikut. Server: POST /nilai/pindah-lembar (pratinjau dulu, lalu simpan; timpa bila perlu).
import { useEffect, useState } from "react";
import Swal from "sweetalert2";
import { API_URL, authHeaders } from "@/app/lib/akses";

const angka = (v) => Number(v).toLocaleString("id-ID", { maximumFractionDigits: 2 });
const tanggalPanjang = (t) => new Date(`${t}T00:00:00`).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

async function kirim(body) {
  const res = await fetch(`${API_URL}/nilai/pindah-lembar`, { method: "POST", headers: authHeaders(), body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok && res.status !== 409) {
    const galat = data.errors ? Object.values(data.errors).flat()[0] : null;
    throw new Error(galat || data.message || `Gagal (HTTP ${res.status})`);
  }
  return { status: res.status, data };
}

/**
 * asal: { id_kelas, id_mapel, id_periode, id_jenis, id_materi, tanggal } lembar yang salah.
 * jenisList: daftar jenis penilaian (options.mbks). namaKelas/namaMapel untuk judul.
 * onSelesai(tujuan): dipanggil setelah berhasil dengan parameter lembar tujuan.
 */
export default function ModalPindahLembar({ asal, jenisList = [], namaKelas, namaMapel, onTutup, onSelesai }) {
  const [materis, setMateris] = useState([]);
  const [tujuan, setTujuan] = useState({ id_jenis: asal.id_jenis, id_materi: asal.id_materi, tanggal: asal.tanggal });
  const [pratinjau, setPratinjau] = useState(null);
  const [memuat, setMemuat] = useState(false);
  const [proses, setProses] = useState(false);
  const [timpa, setTimpa] = useState(false);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !proses) onTutup(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    const p = new URLSearchParams({ id_kelas: asal.id_kelas, id_mapel: asal.id_mapel, id_periode: asal.id_periode });
    fetch(`${API_URL}/nilai/materi?${p}`, { headers: authHeaders(false) })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setMateris(d?.data || []))
      .catch(() => setMateris([]));
  }, [asal.id_kelas, asal.id_mapel, asal.id_periode]);

  const sama = tujuan.id_jenis === asal.id_jenis && tujuan.id_materi === asal.id_materi && tujuan.tanggal === asal.tanggal;
  const minggu = tujuan.tanggal && new Date(`${tujuan.tanggal}T00:00:00`).getDay() === 0;

  // Pratinjau setiap kali tujuan berubah: jumlah nilai, remedial ikut, indikator yang terhapus, siswa yang bertabrakan
  useEffect(() => {
    setPratinjau(null);
    setTimpa(false);
    if (sama || minggu || !tujuan.id_materi || !tujuan.id_jenis || !tujuan.tanggal) return;
    let batal = false;
    setMemuat(true);
    kirim({ ...asal, tujuan, pratinjau: true })
      .then(({ data }) => { if (!batal) setPratinjau(data); })
      .catch((e) => { if (!batal) setPratinjau({ galat: e.message }); })
      .finally(() => { if (!batal) setMemuat(false); });
    return () => { batal = true; };
  }, [tujuan.id_jenis, tujuan.id_materi, tujuan.tanggal]); // eslint-disable-line react-hooks/exhaustive-deps

  const bentrok = pratinjau?.bentrok || [];
  const bisaSimpan = pratinjau && !pratinjau.galat && (bentrok.length === 0 || timpa) && !proses;

  const simpan = async (e) => {
    e.preventDefault();
    if (!bisaSimpan) return;
    setProses(true);
    try {
      const { status, data } = await kirim({ ...asal, tujuan, timpa });
      if (status === 409) { setPratinjau(data); setTimpa(false); return; }
      await Swal.fire({ icon: "success", title: "Lembar dipindahkan", text: data.message, confirmButtonText: "Buka lembar tujuan" });
      onSelesai({ ...asal, ...tujuan });
    } catch (err) {
      Swal.fire("Gagal memindahkan", err.message, "error");
    } finally { setProses(false); }
  };

  const namaMateri = (id) => materis.find((m) => m.id_materi === id)?.nama_materi || "…";
  const namaJenis = (id) => jenisList.find((j) => j.id_jenis === id)?.kategori_penilaian || id;

  return (
    <>
      <div className="modal d-block" tabIndex={-1} role="dialog" aria-modal="true" data-modal-pindah-lembar>
        <div className="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-lg">
          <form className="modal-content border-0 shadow" onSubmit={simpan}>
            <div className="modal-header">
              <h5 className="modal-title fw-bold"><i className="bi bi-arrow-left-right me-2 text-primary"></i>Pindahkan Lembar Nilai</h5>
              <button type="button" className="btn-close" onClick={onTutup} disabled={proses} aria-label="Tutup"></button>
            </div>
            <div className="modal-body">
              <p className="small text-muted">
                Untuk membetulkan salah pilih materi, jenis penilaian, atau tanggal setelah nilai tersimpan, termasuk hasil Import Excel.
                Semua nilai siswa di lembar ini pindah sekaligus, tanpa mengetik ulang.
              </p>
              <div className="border rounded p-2 mb-3 bg-body-tertiary small">
                <div className="text-muted fw-semibold mb-1">Lembar asal (salah)</div>
                {namaKelas} · {namaMapel} · {namaJenis(asal.id_jenis)} · <b>{namaMateri(asal.id_materi)}</b> · {tanggalPanjang(asal.tanggal)}
              </div>

              <div className="row g-3">
                <div className="col-12">
                  <label className="form-label fw-semibold small" htmlFor="pindahMateri">Materi yang benar</label>
                  <select id="pindahMateri" className="form-select" value={tujuan.id_materi} onChange={(e) => setTujuan((t) => ({ ...t, id_materi: e.target.value }))}>
                    {materis.map((m) => (
                      <option key={m.id_materi} value={m.id_materi}>{m.nama_materi}{m.kategori?.nama_kategori ? ` [${m.kategori.nama_kategori}]` : ""}{m.id_materi === asal.id_materi ? " (sekarang)" : ""}</option>
                    ))}
                  </select>
                </div>
                <div className="col-sm-6">
                  <label className="form-label fw-semibold small" htmlFor="pindahJenis">Jenis penilaian</label>
                  <select id="pindahJenis" className="form-select" value={tujuan.id_jenis} onChange={(e) => setTujuan((t) => ({ ...t, id_jenis: e.target.value }))}>
                    {jenisList.map((j) => <option key={j.id_jenis} value={j.id_jenis}>{j.kategori_penilaian}{j.id_jenis === asal.id_jenis ? " (sekarang)" : ""}</option>)}
                  </select>
                </div>
                <div className="col-sm-6">
                  <label className="form-label fw-semibold small" htmlFor="pindahTanggal">Tanggal penilaian</label>
                  <input id="pindahTanggal" type="date" className={`form-control ${minggu ? "is-invalid" : ""}`} value={tujuan.tanggal}
                    onChange={(e) => setTujuan((t) => ({ ...t, tanggal: e.target.value }))} />
                  {minggu && <div className="invalid-feedback">Hari Minggu bukan hari sekolah.</div>}
                </div>
              </div>

              <div className="mt-3" aria-live="polite">
                {sama ? (
                  <div className="alert alert-secondary small py-2 mb-0">Ubah materi, jenis penilaian, atau tanggal tujuan.</div>
                ) : memuat ? (
                  <div className="small text-muted"><span className="spinner-border spinner-border-sm me-2"></span>Memeriksa lembar tujuan…</div>
                ) : pratinjau?.galat ? (
                  <div className="alert alert-danger small py-2 mb-0">{pratinjau.galat}</div>
                ) : pratinjau && (
                  <>
                    <ul className="small mb-2 ps-3" data-pratinjau-pindah>
                      <li><b>{pratinjau.jumlah}</b> nilai siswa akan dipindahkan.</li>
                      {pratinjau.remedial > 0 && <li>{pratinjau.remedial} nilai remedial dan {pratinjau.rencana} rencana tindak lanjut ikut pindah.</li>}
                      {pratinjau.remedial === 0 && pratinjau.rencana > 0 && <li>{pratinjau.rencana} rencana tindak lanjut ikut pindah.</li>}
                      {pratinjau.indikator_dibuang > 0 && (
                        <li className="text-warning-emphasis">
                          <i className="bi bi-exclamation-triangle me-1"></i>Nilai akhir tetap, tetapi <b>{pratinjau.indikator_dibuang} nilai per indikator dihapus</b> karena
                          indikatornya milik materi lama. Nilai ulang indikator materi baru bila perlu.
                        </li>
                      )}
                    </ul>
                    {bentrok.length > 0 && (
                      <div className="alert alert-warning small mb-0" data-bentrok-pindah>
                        <div className="fw-semibold mb-2"><i className="bi bi-exclamation-octagon me-1"></i>{bentrok.length} siswa sudah punya nilai di lembar tujuan:</div>
                        <div className="table-responsive">
                          <table className="table table-sm table-borderless mb-2 bg-transparent">
                            <thead><tr><th>Siswa</th><th className="text-center">Di lembar tujuan</th><th className="text-center">Dari lembar asal</th></tr></thead>
                            <tbody>
                              {bentrok.map((b) => (
                                <tr key={b.id_siswa}>
                                  <td>{b.nama_siswa}{b.tujuan_punya_rencana && <span className="badge text-bg-danger fw-normal ms-1">ada rencana remedial</span>}</td>
                                  <td className="text-center">{angka(b.nilai_tujuan)}</td>
                                  <td className="text-center fw-semibold">{angka(b.nilai_asal)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="form-check mb-0">
                          <input className="form-check-input" type="checkbox" id="pindahTimpa" checked={timpa} onChange={(e) => setTimpa(e.target.checked)} />
                          <label className="form-check-label" htmlFor="pindahTimpa">
                            Timpa dengan nilai dari lembar asal
                            {bentrok.some((b) => b.tujuan_punya_rencana) && " (rencana remedial nilai lama ikut terhapus)"}
                          </label>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline-secondary" onClick={onTutup} disabled={proses}>Batal</button>
              <button type="submit" className={`btn fw-semibold ${timpa ? "btn-warning" : "btn-primary"}`} disabled={!bisaSimpan}>
                {proses ? <span className="spinner-border spinner-border-sm me-2"></span> : <i className="bi bi-arrow-left-right me-1"></i>}
                {timpa ? "Pindahkan & timpa" : `Pindahkan${pratinjau?.jumlah ? ` ${pratinjau.jumlah} nilai` : ""}`}
              </button>
            </div>
          </form>
        </div>
      </div>
      <div className="modal-backdrop show"></div>
    </>
  );
}
