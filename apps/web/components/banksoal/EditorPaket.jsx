"use client";
import { useEffect, useState } from "react";
import Swal from "sweetalert2";
import { minta } from "./api";

const PETUNJUK = "Tulis nama dan nomor absen. Baca setiap soal dengan teliti. Kerjakan soal yang mudah lebih dulu.";

/** Formulir paket soal: identitas naskah dan pengaturan pengiriman nilai ke Input Nilai. */
export default function EditorPaket({ paket, referensi, onTutup, onTersimpan }) {
  const periodeAktif = referensi.periode?.find((p) => p.status_aktif === "AKTIF")?.id_periode || "";
  const [f, setF] = useState(() => paket ? {
    judul: paket.judul, id_mapel: paket.id_mapel, id_kelas: paket.id_kelas || "", id_periode: paket.id_periode || "", id_kisi: paket.id_kisi || "",
    id_jenis: paket.id_jenis || "", tanggal: paket.tanggal || "", durasi_menit: paket.durasi_menit || "", petunjuk: paket.petunjuk || "",
  } : {
    judul: "", id_mapel: referensi.mapel[0]?.id_mapel || "", id_kelas: "", id_periode: periodeAktif, id_kisi: "",
    id_jenis: "", tanggal: new Date().toLocaleDateString("en-CA"), durasi_menit: 60, petunjuk: PETUNJUK,
  });
  const [kisi, setKisi] = useState([]);
  const [proses, setProses] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    if (!f.id_mapel) return;
    minta("GET", `/kisi-kisi?id_mapel=${encodeURIComponent(f.id_mapel)}`).then((r) => setKisi(r.data)).catch(() => setKisi([]));
  }, [f.id_mapel]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !proses) onTutup(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onTutup, proses]);

  const simpan = async (e) => {
    e.preventDefault();
    setProses(true);
    try {
      const body = { ...f, id_periode: f.id_periode || null, id_kisi: f.id_kisi || null, id_jenis: f.id_jenis || null,
        tanggal: f.tanggal || null, durasi_menit: f.durasi_menit ? Number(f.durasi_menit) : null, petunjuk: f.petunjuk || null };
      const res = paket ? await minta("PUT", `/paket-soal/${paket.id_paket}`, body) : await minta("POST", "/paket-soal", body);
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: res.message, showConfirmButton: false, timer: 2000 });
      onTersimpan(res.data);
    } catch (err) { Swal.fire("Belum bisa disimpan", err.message, "warning"); }
    finally { setProses(false); }
  };

  return (
    <>
      <div className="modal d-block" tabIndex={-1} role="dialog" aria-modal="true" aria-label={paket ? "Ubah paket soal" : "Paket soal baru"}>
        <div className="modal-dialog modal-dialog-scrollable modal-lg">
          <form className="modal-content border-0 shadow" onSubmit={simpan}>
            <div className="modal-header">
              <h5 className="modal-title fw-bold"><i className="bi bi-journal-text text-primary me-2"></i>{paket ? "Ubah Paket Soal" : "Paket Soal Baru"}</h5>
              <button type="button" className="btn-close" onClick={onTutup} disabled={proses} aria-label="Tutup"></button>
            </div>
            <div className="modal-body">
              <div className="row g-2">
                <div className="col-12">
                  <label className="form-label small fw-semibold" htmlFor="pkJudul">Judul paket</label>
                  <input id="pkJudul" className="form-control" required maxLength={200} value={f.judul} onChange={(e) => set("judul", e.target.value)} placeholder="mis. Penilaian Harian Pecahan" />
                </div>
                <div className="col-md-6">
                  <label className="form-label small fw-semibold" htmlFor="pkMapel">Mata pelajaran</label>
                  <select id="pkMapel" className="form-select" value={f.id_mapel} disabled={!!paket?.butir?.length} onChange={(e) => setF((x) => ({ ...x, id_mapel: e.target.value, id_kisi: "" }))}>
                    {referensi.mapel.map((m) => <option key={m.id_mapel} value={m.id_mapel}>{m.nama_mapel}</option>)}
                  </select>
                </div>
                <div className="col-md-6">
                  <label className="form-label small fw-semibold" htmlFor="pkKelas">Kelas yang mengerjakan</label>
                  <select id="pkKelas" className="form-select" required value={f.id_kelas} onChange={(e) => set("id_kelas", e.target.value)}>
                    <option value="">Pilih kelas</option>
                    {referensi.kelas.map((k) => <option key={k.id_kelas} value={k.id_kelas}>{k.nama_kelas}</option>)}
                  </select>
                </div>
                <div className="col-md-6">
                  <label className="form-label small fw-semibold" htmlFor="pkKisi">Kisi-kisi (opsional)</label>
                  <select id="pkKisi" className="form-select" value={f.id_kisi} onChange={(e) => set("id_kisi", e.target.value)}>
                    <option value="">Tanpa kisi-kisi</option>
                    {kisi.map((k) => <option key={k.id_kisi} value={k.id_kisi}>{k.judul}</option>)}
                  </select>
                  {!paket && f.id_kisi && <div className="form-text">Soal yang sudah disetujui langsung dimasukkan sesuai baris kisi-kisi.</div>}
                </div>
                <div className="col-md-6">
                  <label className="form-label small fw-semibold" htmlFor="pkPeriode">Semester</label>
                  <select id="pkPeriode" className="form-select" value={f.id_periode} onChange={(e) => set("id_periode", e.target.value)}>
                    <option value="">Semester aktif</option>
                    {(referensi.periode || []).map((p) => <option key={p.id_periode} value={p.id_periode}>{p.tahun_ajaran} {p.semester}{p.status_aktif === "AKTIF" ? " (aktif)" : ""}</option>)}
                  </select>
                </div>
                <div className="col-md-6">
                  <label className="form-label small fw-semibold" htmlFor="pkJenis">Jenis penilaian di Input Nilai</label>
                  <select id="pkJenis" className="form-select" value={f.id_jenis} onChange={(e) => set("id_jenis", e.target.value)}>
                    <option value="">Pilih saat mengirim nilai</option>
                    {(referensi.jenis || []).map((j) => <option key={j.id_jenis} value={j.id_jenis}>{j.kategori_penilaian}{j.keterangan ? ` – ${j.keterangan}` : ""}</option>)}
                  </select>
                </div>
                <div className="col-6 col-md-3">
                  <label className="form-label small fw-semibold" htmlFor="pkTanggal">Tanggal</label>
                  <input id="pkTanggal" type="date" className="form-control" value={f.tanggal} onChange={(e) => set("tanggal", e.target.value)} />
                </div>
                <div className="col-6 col-md-3">
                  <label className="form-label small fw-semibold" htmlFor="pkDurasi">Waktu (menit)</label>
                  <input id="pkDurasi" type="number" min={5} max={600} className="form-control" value={f.durasi_menit} onChange={(e) => set("durasi_menit", e.target.value)} />
                </div>
                <div className="col-12">
                  <label className="form-label small fw-semibold" htmlFor="pkPetunjuk">Petunjuk di naskah</label>
                  <textarea id="pkPetunjuk" className="form-control" rows={2} maxLength={3000} value={f.petunjuk} onChange={(e) => set("petunjuk", e.target.value)} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline-secondary" onClick={onTutup} disabled={proses}>Batal</button>
              <button type="submit" className="btn btn-primary" disabled={proses}>{proses ? <span className="spinner-border spinner-border-sm me-1"></span> : <i className="bi bi-check-lg me-1"></i>}Simpan paket</button>
            </div>
          </form>
        </div>
      </div>
      <div className="modal-backdrop show"></div>
    </>
  );
}
