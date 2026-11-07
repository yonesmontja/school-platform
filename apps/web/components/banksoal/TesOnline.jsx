"use client";
import { useCallback, useEffect, useState } from "react";
import Swal from "sweetalert2";
import { minta } from "./api";

// <input type="datetime-local"> memakai waktu lokal tanpa zona; server menerima ISO dengan zona
const keLokal = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const keIso = (lokal) => (lokal ? new Date(lokal).toISOString() : null);
const tokenAcak = () => Array.from({ length: 5 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join("");
const menit = (detik) => (detik == null ? "–" : `${Math.floor(detik / 60)}:${String(detik % 60).padStart(2, "0")}`);

const STATUS = {
  BELUM: ["Belum mulai", "secondary"],
  MENGERJAKAN: ["Mengerjakan", "primary"],
  SELESAI: ["Selesai", "success"],
  KERTAS: ["Koreksi kertas", "light"],
};

/** Buka paket sebagai tes online di HP siswa, lalu pantau pengerjaannya. */
export default function TesOnline({ paket, onPaket }) {
  const [f, setF] = useState(() => ({
    online: !!paket.online, online_mulai: keLokal(paket.online_mulai), online_selesai: keLokal(paket.online_selesai),
    durasi_menit: paket.durasi_menit || "", acak_soal: paket.acak_soal ?? true, acak_pilihan: paket.acak_pilihan ?? true,
    token: paket.token || "", tampilkan_nilai: !!paket.tampilkan_nilai,
  }));
  const [proses, setProses] = useState(false);
  const [pantau, setPantau] = useState(null);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  const muatPantau = useCallback(async () => {
    try { setPantau((await minta("GET", `/paket-soal/${paket.id_paket}/pantau`)).data); }
    catch (err) { /* abaikan saat pemantauan berkala */ }
  }, [paket.id_paket]);
  useEffect(() => { muatPantau(); }, [muatPantau]);
  // Segarkan tiap 15 detik selama tes dibuka
  useEffect(() => {
    if (!paket.online) return;
    const t = setInterval(muatPantau, 15000);
    return () => clearInterval(t);
  }, [paket.online, muatPantau]);

  const simpan = async (bukaTutup) => {
    const online = bukaTutup ?? f.online;
    setProses(true);
    try {
      const res = await minta("PUT", `/paket-soal/${paket.id_paket}/online`, {
        ...f, online, online_mulai: keIso(f.online_mulai), online_selesai: keIso(f.online_selesai),
        durasi_menit: f.durasi_menit ? Number(f.durasi_menit) : null, token: f.token || null,
      });
      set("online", online);
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: res.message, showConfirmButton: false, timer: 2200 });
      onPaket(res.data);
    } catch (err) { Swal.fire("Belum bisa disimpan", err.message, "warning"); }
    finally { setProses(false); }
  };

  const akhiri = async (s) => {
    const ok = await Swal.fire({ title: `Akhiri sesi ${s.nama_siswa}?`, text: "Jawaban yang sudah tersimpan dikumpulkan dan dinilai.", icon: "question", showCancelButton: true, confirmButtonText: "Akhiri", cancelButtonText: "Batal" });
    if (!ok.isConfirmed) return;
    try { await minta("POST", `/paket-soal/${paket.id_paket}/jawaban/${s.id_siswa}/akhiri`); muatPantau(); }
    catch (err) { Swal.fire("Gagal", err.message, "error"); }
  };

  const ulang = async (s) => {
    const ok = await Swal.fire({ title: `Izinkan ${s.nama_siswa} mengulang?`, text: "Jawaban dan nilainya pada paket ini dihapus, lalu siswa bisa mulai lagi dari awal.", icon: "warning", showCancelButton: true, confirmButtonText: "Hapus & izinkan ulang", cancelButtonText: "Batal", confirmButtonColor: "#dc3545" });
    if (!ok.isConfirmed) return;
    try { await minta("DELETE", `/paket-soal/${paket.id_paket}/jawaban/${s.id_siswa}`); muatPantau(); }
    catch (err) { Swal.fire("Gagal", err.message, "error"); }
  };

  const hitung = (st) => (pantau || []).filter((s) => s.status === st).length;

  return (
    <div className="row g-3">
      <div className="col-lg-4">
        <div className="border rounded p-3">
          <div className="d-flex align-items-center mb-2">
            <div className="fw-semibold me-auto"><i className="bi bi-phone me-1"></i>Pengaturan tes online</div>
            <span className={`badge text-bg-${paket.online ? "success" : "secondary"}`}>{paket.online ? "Dibuka" : "Ditutup"}</span>
          </div>
          <div className="row g-2 small">
            <div className="col-6">
              <label className="form-label mb-1" htmlFor="toMulai">Dibuka</label>
              <input id="toMulai" type="datetime-local" className="form-control form-control-sm" value={f.online_mulai} onChange={(e) => set("online_mulai", e.target.value)} />
            </div>
            <div className="col-6">
              <label className="form-label mb-1" htmlFor="toSelesai">Ditutup</label>
              <input id="toSelesai" type="datetime-local" className="form-control form-control-sm" value={f.online_selesai} onChange={(e) => set("online_selesai", e.target.value)} />
            </div>
            <div className="col-6">
              <label className="form-label mb-1" htmlFor="toDurasi">Waktu mengerjakan (menit)</label>
              <input id="toDurasi" type="number" min={5} max={600} className="form-control form-control-sm" value={f.durasi_menit} onChange={(e) => set("durasi_menit", e.target.value)} />
            </div>
            <div className="col-6">
              <label className="form-label mb-1" htmlFor="toToken">Token (opsional)</label>
              <div className="input-group input-group-sm">
                <input id="toToken" className="form-control text-uppercase" maxLength={12} value={f.token} onChange={(e) => set("token", e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase())} />
                <button type="button" className="btn btn-outline-secondary" onClick={() => set("token", tokenAcak())} title="Buat token acak" aria-label="Buat token acak"><i className="bi bi-shuffle"></i></button>
              </div>
            </div>
            {[["acak_soal", "Acak urutan soal per siswa"], ["acak_pilihan", "Acak urutan pilihan jawaban"], ["tampilkan_nilai", "Siswa melihat nilainya setelah selesai"]].map(([k, label]) => (
              <div key={k} className="col-12 form-check form-switch ms-2">
                <input className="form-check-input" type="checkbox" id={`to_${k}`} checked={f[k]} onChange={(e) => set(k, e.target.checked)} />
                <label className="form-check-label" htmlFor={`to_${k}`}>{label}</label>
              </div>
            ))}
          </div>
          <div className="form-text">Kosongkan jadwal bila tes langsung dibuka sampai Anda menutupnya. Token ditulis di papan agar hanya siswa di kelas yang bisa mulai.</div>
          <div className="d-flex gap-2 mt-3">
            {paket.online ? (
              <>
                <button className="btn btn-sm btn-primary" disabled={proses} onClick={() => simpan(true)}><i className="bi bi-save me-1"></i>Simpan</button>
                <button className="btn btn-sm btn-outline-danger" disabled={proses} onClick={() => simpan(false)}><i className="bi bi-lock me-1"></i>Tutup tes</button>
              </>
            ) : (
              <button className="btn btn-sm btn-success" disabled={proses || !paket.butir?.length} onClick={() => simpan(true)}><i className="bi bi-unlock me-1"></i>Buka tes online</button>
            )}
          </div>
          {paket.online && (
            <div className="alert alert-light border small mt-3 mb-0">
              Siswa kelas <b>{paket.kelas?.nama_kelas}</b> masuk dengan akun siswa, lalu membuka menu <b>Tes Online</b>.{paket.token && <> Token: <b className="font-monospace fs-6">{paket.token}</b></>}
            </div>
          )}
        </div>
      </div>

      <div className="col-lg-8">
        <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
          <div className="fw-semibold me-auto"><i className="bi bi-broadcast me-1"></i>Pantau siswa</div>
          {pantau && <span className="small text-muted">{hitung("MENGERJAKAN")} mengerjakan · {hitung("SELESAI")} selesai · {hitung("BELUM")} belum mulai</span>}
          <button className="btn btn-sm btn-outline-secondary" onClick={muatPantau} aria-label="Segarkan"><i className="bi bi-arrow-clockwise"></i></button>
        </div>
        {!pantau ? <div className="text-muted small"><span className="spinner-border spinner-border-sm me-2"></span>Memuat…</div> : (
          <div className="table-responsive">
            <table className="table table-sm align-middle small mb-0 pantau-tes">
              <thead><tr><th>Siswa</th><th>Status</th><th className="text-center">Terjawab</th><th className="text-center">Sisa waktu</th><th className="text-center" title="Berapa kali keluar dari halaman tes">Keluar</th><th className="text-center">Nilai</th><th></th></tr></thead>
              <tbody>
                {pantau.map((s) => (
                  <tr key={s.id_siswa}>
                    <td>{s.nama_siswa}</td>
                    <td><span className={`badge text-bg-${STATUS[s.status][1]} ${s.status === "KERTAS" ? "border" : ""}`}>{STATUS[s.status][0]}</span></td>
                    <td className="text-center">{s.status === "BELUM" ? "–" : `${s.terjawab}/${s.jumlah_soal}`}</td>
                    <td className="text-center font-monospace">{s.status === "MENGERJAKAN" ? menit(s.sisa_detik) : "–"}</td>
                    <td className="text-center">{s.pelanggaran > 0 ? <span className="badge text-bg-warning">{s.pelanggaran}×</span> : "–"}</td>
                    <td className="text-center">{s.nilai != null ? <>{s.nilai}{!s.lengkap && <i className="bi bi-hourglass-split text-warning ms-1" title="Uraian menunggu skor guru di bagian Koreksi"></i>}</> : "–"}</td>
                    <td className="text-end text-nowrap">
                      {s.status === "MENGERJAKAN" && <button className="btn btn-sm btn-outline-primary" onClick={() => akhiri(s)}>Akhiri</button>}
                      {(s.status === "SELESAI" || s.status === "MENGERJAKAN") && <button className="btn btn-sm btn-link text-danger" onClick={() => ulang(s)}>Ulang</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="form-text">Nilai pilihan ganda, benar/salah, isian, menjodohkan, mengurutkan, dan melengkapi gambar langsung dihitung. Uraian dinilai di bagian Koreksi, lalu kirim nilai ke Input Nilai seperti biasa.</div>
      </div>
    </div>
  );
}
