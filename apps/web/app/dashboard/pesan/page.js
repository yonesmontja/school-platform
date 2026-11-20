"use client";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { minta } from "@/components/banksoal/api";
import { FotoKecil } from "@/components/siswa/EditorFoto";
import UtasPesan from "@/components/siswa/UtasPesan";

const waktuSingkat = (t) => {
  if (!t) return "";
  const d = new Date(t);
  return new Date().toDateString() === d.toDateString()
    ? d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
};

/** Pesan orang tua untuk wali kelas, kepala sekolah, dan admin: daftar utas per siswa + percakapan. */
function Isi() {
  const router = useRouter();
  const params = useSearchParams();
  const [utas, setUtas] = useState(null);
  const [galat, setGalat] = useState("");
  const [cari, setCari] = useState("");
  const [hanyaBaru, setHanyaBaru] = useState(false);
  const pilih = params.get("siswa") || "";

  const muat = useCallback(() => {
    minta("GET", "/pesan").then((r) => { setUtas(r.data); setGalat(""); }).catch((e) => { setUtas([]); setGalat(e.message); });
  }, []);
  useEffect(() => { muat(); const t = setInterval(muat, 30000); return () => clearInterval(t); }, [muat]);

  const tampil = useMemo(() => (utas || []).filter((u) =>
    (!cari || `${u.nama_siswa} ${u.nama_kelas}`.toLowerCase().includes(cari.toLowerCase())) && (!hanyaBaru || u.belum_dibaca > 0)), [utas, cari, hanyaBaru]);
  const aktif = (utas || []).find((u) => u.id_siswa === pilih);
  const buka = (id) => router.replace(`/dashboard/pesan?siswa=${encodeURIComponent(id)}`, { scroll: false });

  return (
    <div className="container-fluid py-3">
      <div className="mb-3">
        <h3 className="fw-bold mb-0"><i className="bi bi-chat-dots text-primary me-2"></i>Pesan Orang Tua</h3>
        <div className="small text-body-secondary">Percakapan dengan orang tua/wali per siswa, tersimpan sebagai arsip sekolah. Pesan baru muncul di Perlu Tindakan.</div>
      </div>
      {galat && <div className="alert alert-warning">{galat}</div>}
      <div className="row g-3">
        <div className={`col-lg-4 ${pilih ? "d-none d-lg-block" : ""}`}>
          <div className="card shadow-sm border-0">
            <div className="card-body p-2">
              <input type="search" className="form-control form-control-sm mb-2" placeholder="Cari siswa atau kelas…" value={cari} onChange={(e) => setCari(e.target.value)} aria-label="Cari utas" />
              <div className="form-check form-switch small mb-2 ms-1">
                <input className="form-check-input" type="checkbox" id="hanyaBaru" checked={hanyaBaru} onChange={(e) => setHanyaBaru(e.target.checked)} />
                <label className="form-check-label" htmlFor="hanyaBaru">Hanya yang belum dibaca</label>
              </div>
              {!utas && <div className="small text-body-secondary p-2">Memuat…</div>}
              {utas && tampil.length === 0 && <div className="small text-body-secondary p-2">Tidak ada utas.</div>}
              <div className="list-group list-group-flush" style={{ maxHeight: 560, overflowY: "auto" }}>
                {tampil.map((u) => (
                  <button key={u.id_siswa} type="button" data-utas={u.nama_siswa}
                    className={`list-group-item list-group-item-action d-flex gap-2 align-items-center ${u.id_siswa === pilih ? "active" : ""}`} onClick={() => buka(u.id_siswa)}>
                    <FotoKecil siswa={u} ukuran={32} />
                    <span className="min-w-0 flex-grow-1 text-start">
                      <span className="d-flex"><span className="fw-semibold text-truncate me-auto">{u.nama_siswa}</span><small className="ms-2 opacity-75">{waktuSingkat(u.terakhir?.pada)}</small></span>
                      <span className="d-block small text-truncate opacity-75">{u.terakhir ? `${u.terakhir.saya ? "Anda: " : `${u.terakhir.peran}: `}${u.terakhir.isi}` : `${u.nama_kelas || ""} · belum ada pesan`}</span>
                    </span>
                    {u.belum_dibaca > 0 && <span className="badge rounded-pill text-bg-danger" data-belum-dibaca>{u.belum_dibaca}</span>}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className={`col-lg-8 ${pilih ? "" : "d-none d-lg-block"}`}>
          <div className="card shadow-sm border-0">
            <div className="card-body">
              {pilih ? (
                <>
                  <div className="d-flex align-items-center gap-2 mb-2">
                    <button type="button" className="btn btn-sm btn-light d-lg-none" onClick={() => router.replace("/dashboard/pesan")} aria-label="Kembali ke daftar"><i className="bi bi-arrow-left"></i></button>
                    <div className="fw-bold me-auto">{aktif?.nama_siswa || "Utas"}</div>
                    <a className="btn btn-sm btn-outline-secondary" href={`/dashboard/portal?siswa=${encodeURIComponent(pilih)}`} target="_blank" rel="noopener"><i className="bi bi-person-badge me-1"></i>Dashboard pribadi</a>
                  </div>
                  <UtasPesan key={pilih} idSiswa={pilih} onBerubah={muat} />
                </>
              ) : <div className="text-center text-body-secondary py-5"><i className="bi bi-chat-left-text fs-2 d-block mb-1"></i>Pilih siswa untuk membuka percakapan.</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PesanPage() {
  return <Suspense fallback={<div className="container-fluid py-3 text-body-secondary">Memuat…</div>}><Isi /></Suspense>;
}
