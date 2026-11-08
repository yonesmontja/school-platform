"use client";
// Komponen bersama Video Belajar: pemutar, kartu, pemilih dari pustaka, dan daftar video tertaut (modul/jadwal).
import { useEffect, useState } from "react";
import Swal from "sweetalert2";
import { srcGambar } from "@/components/banksoal/PratinjauSoal";
import { minta } from "@/components/banksoal/api";

export const durasi = (d) => (d ? `${Math.floor(d / 60)}:${String(d % 60).padStart(2, "0")}` : "");
export const STATUS_VIDEO = {
  DRAF: ["Draf", "secondary"], DIAJUKAN: ["Menunggu persetujuan", "warning"], DISETUJUI: ["Disetujui", "success"], REVISI: ["Perlu revisi", "danger"],
};

/** Pemutar video; preload hanya metadata agar hemat kuota sampai diputar. */
export function PutarVideo({ video, tinggi = 240, className = "" }) {
  if (!video?.file_url) return null;
  return (
    <video controls preload="none" playsInline poster={video.poster_url ? srcGambar(video.poster_url) : undefined}
      src={srcGambar(video.file_url)} className={`w-100 rounded bg-black ${className}`} style={{ maxHeight: tinggi }} aria-label={`Video: ${video.judul}`} />
  );
}

/** Kartu kecil: sampul + judul + durasi; klik untuk memutar dalam jendela. */
export function KartuVideo({ video, onHapus, kecil = false }) {
  const putar = () => Swal.fire({
    title: video.judul, width: 860, showConfirmButton: false, showCloseButton: true,
    html: `<video controls autoplay playsinline style="width:100%;max-height:70vh;background:#000;border-radius:8px" src="${srcGambar(video.file_url)}"${video.poster_url ? ` poster="${srcGambar(video.poster_url)}"` : ""}></video>`,
  });
  return (
    <div className="kartu-video border rounded overflow-hidden bg-body d-flex flex-column" style={{ width: kecil ? 150 : 200 }}>
      <button type="button" className="btn p-0 border-0 position-relative" onClick={putar} aria-label={`Putar video ${video.judul}`}>
        {video.poster_url ? <img src={srcGambar(video.poster_url)} alt="" className="w-100" style={{ aspectRatio: "16/9", objectFit: "cover" }} />
          : <div className="bg-dark w-100" style={{ aspectRatio: "16/9" }}></div>}
        <span className="position-absolute top-50 start-50 translate-middle text-white fs-1" style={{ textShadow: "0 0 8px #000" }}><i className="bi bi-play-circle-fill"></i></span>
        {video.durasi_detik > 0 && <span className="position-absolute bottom-0 end-0 m-1 badge text-bg-dark">{durasi(video.durasi_detik)}</span>}
      </button>
      <div className="p-1 small d-flex gap-1 align-items-start">
        <span className="flex-grow-1 text-truncate" title={video.judul}>{video.judul}</span>
        {video.status && video.status !== "DISETUJUI" && <span className="badge text-bg-light border fw-normal" title="Siswa baru bisa melihatnya setelah disetujui">{STATUS_VIDEO[video.status]?.[0]}</span>}
        {onHapus && <button type="button" className="btn btn-sm btn-link text-danger p-0" onClick={onHapus} aria-label={`Lepas video ${video.judul}`}><i className="bi bi-x-lg"></i></button>}
      </div>
    </div>
  );
}

/** Jendela memilih video dari pustaka (disetujui + milik sendiri). */
export function PemilihVideo({ idMapel, onPilih, onTutup }) {
  const [data, setData] = useState(null);
  const [cari, setCari] = useState("");
  useEffect(() => {
    minta("GET", `/video-belajar${idMapel ? `?id_mapel=${idMapel}` : ""}`).then((r) => setData(r.data)).catch((err) => Swal.fire("Gagal memuat", err.message, "error"));
  }, [idMapel]);
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onTutup();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onTutup]);
  const tampil = (data || []).filter((v) => !cari || v.judul.toLowerCase().includes(cari.toLowerCase()));
  return (
    <>
      <div className="modal d-block" tabIndex={-1} role="dialog" aria-modal="true" aria-label="Pilih video belajar" style={{ zIndex: 1080 }}>
        <div className="modal-dialog modal-lg modal-dialog-scrollable">
          <div className="modal-content border-0 shadow">
            <div className="modal-header"><h5 className="modal-title fw-bold"><i className="bi bi-play-btn text-primary me-2"></i>Pilih video belajar</h5>
              <button type="button" className="btn-close" onClick={onTutup} aria-label="Tutup"></button></div>
            <div className="modal-body">
              <input className="form-control form-control-sm mb-2" placeholder="Cari judul…" aria-label="Cari video" value={cari} onChange={(e) => setCari(e.target.value)} />
              {!data ? <div className="text-muted small"><span className="spinner-border spinner-border-sm me-2"></span>Memuat…</div>
                : !tampil.length ? <div className="text-muted small py-4 text-center">Belum ada video. Unggah dulu di menu Video Belajar.</div>
                : <div className="d-flex flex-wrap gap-2">
                  {tampil.map((v) => (
                    <div key={v.id_video} className="d-flex flex-column gap-1 pilih-video">
                      <KartuVideo video={v} />
                      <button type="button" className="btn btn-sm btn-primary" onClick={() => onPilih(v)}>Pilih</button>
                    </div>
                  ))}
                </div>}
            </div>
          </div>
        </div>
      </div>
      <div className="modal-backdrop show" style={{ zIndex: 1075 }}></div>
    </>
  );
}

/** Daftar video tertaut ke modul (per pertemuan) atau sesi jadwal, dengan tombol tambah & lepas. */
export function VideoTertaut({ jenis, idTarget, pertemuanKe = null, idMapel, bisa = true, data, onBerubah }) {
  const [pilih, setPilih] = useState(false);
  const milik = (data || []).filter((v) => (pertemuanKe == null ? true : v.pertemuan_ke === pertemuanKe));
  const tambah = async (v) => {
    setPilih(false);
    try { await minta("POST", "/video-belajar/tautan", { id_video: v.id_video, jenis, id_target: idTarget, pertemuan_ke: pertemuanKe }); onBerubah?.(); }
    catch (err) { Swal.fire("Gagal menautkan", err.message, "error"); }
  };
  const lepas = async (v) => {
    try { await minta("DELETE", `/video-belajar/tautan/${v.id}`); onBerubah?.(); }
    catch (err) { Swal.fire("Gagal", err.message, "error"); }
  };
  if (!bisa && !milik.length) return null;
  return (
    <div className="video-tertaut">
      <div className="d-flex flex-wrap gap-2 align-items-start">
        {milik.map((v) => <KartuVideo key={v.id} video={v} kecil onHapus={bisa ? () => lepas(v) : undefined} />)}
        {bisa && (
          <button type="button" className="btn btn-sm btn-outline-primary align-self-center" onClick={() => setPilih(true)}>
            <i className="bi bi-play-btn me-1"></i>Tautkan video
          </button>
        )}
      </div>
      {pilih && <PemilihVideo idMapel={idMapel} onPilih={tambah} onTutup={() => setPilih(false)} />}
    </div>
  );
}

/** Ambil durasi & gambar sampul (detik ke-2) dari berkas video di browser. */
export function bacaVideo(file) {
  return new Promise((ok) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata"; v.muted = true; v.playsInline = true; v.src = url;
    const selesai = (hasil) => { URL.revokeObjectURL(url); ok(hasil); };
    v.onloadedmetadata = () => { v.currentTime = Math.min(2, (v.duration || 1) / 3); };
    v.onseeked = () => {
      try {
        const c = document.createElement("canvas");
        const lebar = Math.min(640, v.videoWidth || 640);
        c.width = lebar; c.height = Math.round(lebar * ((v.videoHeight || 360) / (v.videoWidth || 640)));
        c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
        selesai({ durasi: Math.round(v.duration || 0), poster: c.toDataURL("image/jpeg", 0.8) });
      } catch (e) { selesai({ durasi: Math.round(v.duration || 0), poster: null }); }
    };
    v.onerror = () => selesai({ durasi: null, poster: null });
    setTimeout(() => selesai({ durasi: Math.round(v.duration || 0) || null, poster: null }), 8000);
  });
}
