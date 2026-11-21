"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { minta } from "@/components/banksoal/api";
import { FormUnggah, GaleriPortofolio, KATEGORI } from "@/components/siswa/Portofolio";

const SARING = [["SEMUA", "Semua"], ["MENUNGGU", "Menunggu tinjauan"], ["UNGGULAN", "Unggulan"], ["DITOLAK", "Dikembalikan"]];

function PortofolioKelasIsi() {
  const router = useRouter();
  const params = useSearchParams();
  const idKelas = params.get("id_kelas") || "";
  const [res, setRes] = useState(null);
  const [galat, setGalat] = useState("");
  const [form, setForm] = useState(false);
  const [pesan, setPesan] = useState("");
  const [status, setStatus] = useState(params.get("status") || "SEMUA");
  const [kategori, setKategori] = useState("");
  const [siswa, setSiswa] = useState("");
  const [idPengguna, setIdPengguna] = useState(null);

  useEffect(() => {
    try { setIdPengguna(JSON.parse(localStorage.getItem("user") || "null")?.id ?? null); } catch {}
  }, []);
  useEffect(() => {
    setRes(null); setGalat("");
    minta("GET", `/portofolio/kelas${idKelas ? `?id_kelas=${encodeURIComponent(idKelas)}` : ""}`).then(setRes).catch((e) => setGalat(e.message));
  }, [idKelas]);

  const data = res?.data || [];
  const nama = useMemo(() => Object.fromEntries((res?.siswa || []).map((s) => [s.id_siswa, s.nama_siswa])), [res]);
  const tampil = data.filter((x) =>
    (status === "SEMUA" || (status === "UNGGULAN" ? x.unggulan : x.status === status))
    && (!kategori || x.kategori === kategori) && (!siswa || x.id_siswa === siswa));
  const ganti = (baru) => setRes((r) => ({ ...r, data: r.data.map((x) => (x.id === baru.id ? baru : x)) }));
  const hapus = (id) => setRes((r) => ({ ...r, data: r.data.filter((x) => x.id !== id) }));
  const jumlah = (st) => (st === "SEMUA" ? data.length : st === "UNGGULAN" ? data.filter((x) => x.unggulan).length : data.filter((x) => x.status === st).length);

  if (galat) return <div className="alert alert-warning m-3">{galat}</div>;
  if (!res) return <div className="p-4 text-muted"><span className="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Memuat portofolio…</div>;
  const tanpaKarya = res.siswa.filter((s) => s.karya === 0);

  return (
    <div className="container-fluid py-3" style={{ maxWidth: 1200 }}>
      <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
        <h1 className="h4 fw-bold mb-0 me-auto"><i className="bi bi-images me-2 text-primary" aria-hidden="true"></i>Portofolio Siswa</h1>
        <select className="form-select form-select-sm w-auto" value={res.kelas.id_kelas} aria-label="Rombel"
          onChange={(e) => router.replace(`/dashboard/portofolio?id_kelas=${encodeURIComponent(e.target.value)}`)}>
          {res.pilihan_kelas.map((k) => <option key={k.id_kelas} value={k.id_kelas}>{k.nama_kelas}</option>)}
        </select>
        {res.boleh_unggah && !form && <button type="button" className="btn btn-primary btn-sm fw-bold" onClick={() => { setForm(true); setPesan(""); }}><i className="bi bi-plus-lg me-1" aria-hidden="true"></i>Tambah karya</button>}
      </div>
      <p className="small text-muted">
        Foto dan video karya, projek P5/kokurikuler, prestasi, dan kegiatan. Satu unggahan bisa untuk beberapa siswa sekaligus (karya kelompok).
        Kiriman siswa/orang tua dari portal menunggu tinjauan Anda. Karya unggulan dicetak sebagai lampiran buku induk di Rekam Jejak.
      </p>

      {pesan && <div className="alert alert-success py-2 small">{pesan}</div>}
      {form && (
        <FormUnggah pilihanSiswa={res.siswa} proyek={res.proyek} onBatal={() => setForm(false)}
          onSelesai={(r) => { setForm(false); setPesan(r.message); setRes((v) => ({ ...v, data: [...r.data, ...v.data],
            siswa: v.siswa.map((s) => (r.data.some((x) => x.id_siswa === s.id_siswa) ? { ...s, karya: s.karya + 1 } : s)) })); }} />
      )}

      {jumlah("MENUNGGU") > 0 && status !== "MENUNGGU" && (
        <div className="alert alert-warning py-2 small d-flex align-items-center gap-2">
          <i className="bi bi-hourglass-split" aria-hidden="true"></i>
          <span className="me-auto">{jumlah("MENUNGGU")} karya kiriman siswa/orang tua menunggu tinjauan.</span>
          <button type="button" className="btn btn-sm btn-warning" onClick={() => setStatus("MENUNGGU")}>Tinjau</button>
        </div>
      )}

      <div className="d-flex flex-wrap gap-2 align-items-center mb-3">
        <div className="d-flex flex-wrap gap-1" role="group" aria-label="Saring status">
          {SARING.map(([k, l]) => (
            <button key={k} type="button" className={`btn btn-sm ${status === k ? "btn-dark" : "btn-outline-secondary"}`} onClick={() => setStatus(k)} aria-pressed={status === k}>
              {l} <span className="badge text-bg-light ms-1">{jumlah(k)}</span>
            </button>
          ))}
        </div>
        <select className="form-select form-select-sm w-auto ms-md-auto" value={kategori} onChange={(e) => setKategori(e.target.value)} aria-label="Kategori">
          <option value="">Semua kategori</option>
          {Object.entries(KATEGORI).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select className="form-select form-select-sm w-auto" value={siswa} onChange={(e) => setSiswa(e.target.value)} aria-label="Siswa">
          <option value="">Semua siswa</option>
          {res.siswa.map((s) => <option key={s.id_siswa} value={s.id_siswa}>{s.nama_siswa} ({s.karya})</option>)}
        </select>
      </div>

      {siswa && (
        <div className="small mb-2">
          <Link href={`/dashboard/rekam-jejak?siswa=${encodeURIComponent(siswa)}`}><i className="bi bi-clock-history me-1" aria-hidden="true"></i>Rekam jejak & cetak lampiran buku induk {nama[siswa]}</Link>
        </div>
      )}

      <GaleriPortofolio data={tampil} namaSiswa={nama} bolehTinjau={res.boleh_unggah} idPengguna={idPengguna} proyek={res.proyek} onBerubah={ganti} onHapus={hapus}
        kosong={data.length ? "Tidak ada karya yang cocok dengan saringan." : "Belum ada karya. Tekan Tambah karya untuk mengunggah foto atau video karya siswa."} />

      {tanpaKarya.length > 0 && data.length > 0 && (
        <p className="small text-muted mt-3 mb-0"><i className="bi bi-info-circle me-1" aria-hidden="true"></i>Belum punya karya disetujui: {tanpaKarya.map((s) => s.nama_siswa).join(", ")}.</p>
      )}
    </div>
  );
}

export default function PortofolioKelasPage() {
  return <Suspense fallback={null}><PortofolioKelasIsi /></Suspense>;
}
