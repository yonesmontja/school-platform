"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Swal from "sweetalert2";
import { API_URL, authHeaders, useAkses } from "@/app/lib/akses";
import { minta } from "@/components/banksoal/api";
import { KartuVideo, PutarVideo, STATUS_VIDEO, bacaVideo, durasi } from "@/components/video/video";
import { srcGambar } from "@/components/banksoal/PratinjauSoal";
import BuatDariTemplat from "@/components/video/BuatDariTemplat";

const SUMBER = { REMOTION: "Motion graphic (dibuat Claude/Remotion)", RENDER: "Dari templat aplikasi", UNGGAH: "Unggahan guru" };
const MAKS_MB = 20;

/** Kirim formulir multipart (berkas video) dengan token; galat dikembalikan sebagai pesan ramah. */
async function kirimForm(path, form) {
  const res = await fetch(`${API_URL}${path}`, { method: "POST", headers: authHeaders(false), body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data.errors && Object.values(data.errors)[0]?.[0]) || data.message || `Gagal (status ${res.status}).`);
  return data;
}

function ModalUnggah({ referensi, video, onTutup, onSelesai }) {
  const ubah = !!video;
  const [f, setF] = useState({ judul: video?.judul || "", deskripsi: video?.deskripsi || "", id_mapel: video?.id_mapel || referensi.mapel[0]?.id_mapel || "",
    id_kelas: video?.id_kelas || "", id_materi: video?.id_materi || "", sumber: video?.sumber || "UNGGAH", komposisi: video?.komposisi || "" });
  const [berkas, setBerkas] = useState(null); // {file, durasi, poster}
  const [proses, setProses] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  const pilihBerkas = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAKS_MB * 1024 * 1024) { e.target.value = ""; return Swal.fire("Terlalu besar", `Ukuran video maksimal ${MAKS_MB}MB. Perkecil resolusi (mis. 720p) atau durasinya.`, "warning"); }
    const info = await bacaVideo(file);
    setBerkas({ file, ...info });
    if (!f.judul) set("judul", file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "));
  };

  const simpan = async (e) => {
    e.preventDefault();
    if (!ubah && !berkas) return Swal.fire("Pilih video", "Pilih berkas video MP4 terlebih dulu.", "info");
    const form = new FormData();
    Object.entries(f).forEach(([k, v]) => v !== "" && v != null && form.append(k, v));
    if (berkas) {
      form.append("video", berkas.file);
      if (berkas.durasi) form.append("durasi_detik", String(berkas.durasi));
      if (berkas.poster) form.append("poster", berkas.poster);
      if (berkas.rasio) form.append("rasio", berkas.rasio);
    }
    setProses(true);
    try {
      const r = await kirimForm(ubah ? `/video-belajar/${video.id_video}` : "/video-belajar", form);
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: r.message, showConfirmButton: false, timer: 2500 });
      onSelesai(r.data);
    } catch (err) { Swal.fire("Gagal menyimpan", err.message, "error"); setProses(false); }
  };

  const materi = referensi.materi.filter((m) => m.id_mapel === f.id_mapel && (!f.id_kelas || !m.id_kelas || m.id_kelas === f.id_kelas));
  return (
    <>
      <div className="modal d-block" tabIndex={-1} role="dialog" aria-modal="true" aria-label={ubah ? "Ubah video" : "Unggah video belajar"}>
        <div className="modal-dialog modal-lg modal-dialog-scrollable">
          <form className="modal-content border-0 shadow" onSubmit={simpan}>
            <div className="modal-header"><h5 className="modal-title fw-bold"><i className="bi bi-cloud-arrow-up text-primary me-2"></i>{ubah ? "Ubah video" : "Unggah video belajar"}</h5>
              <button type="button" className="btn-close" onClick={onTutup} disabled={proses} aria-label="Tutup"></button></div>
            <div className="modal-body">
              <label className="form-label small fw-semibold mb-1" htmlFor="vidBerkas">{ubah ? "Ganti berkas video (opsional)" : "Berkas video (MP4/WebM, maks. 20MB)"}</label>
              <input id="vidBerkas" type="file" accept="video/mp4,video/webm" className="form-control mb-2" onChange={pilihBerkas} disabled={proses} />
              {berkas && (
                <div className="d-flex gap-2 align-items-center small text-muted mb-2">
                  {berkas.poster && <img src={berkas.poster} alt="Sampul" style={{ width: 120, borderRadius: 6 }} />}
                  <div>{(berkas.file.size / 1024 / 1024).toFixed(1)} MB{berkas.durasi ? ` · ${durasi(berkas.durasi)}` : ""}{berkas.rasio ? ` · ${berkas.rasio}` : ""}{berkas.durasi > 150 && <div className="text-warning-emphasis">Lebih dari 2,5 menit: anak mudah kehilangan perhatian.</div>}</div>
                </div>
              )}
              <label className="form-label small fw-semibold mb-1" htmlFor="vidJudul">Judul</label>
              <input id="vidJudul" className="form-control mb-2" required maxLength={200} value={f.judul} onChange={(e) => set("judul", e.target.value)} />
              <div className="row g-2 mb-2">
                <div className="col-md-4">
                  <label className="form-label small mb-1" htmlFor="vidMapel">Mata pelajaran</label>
                  <select id="vidMapel" className="form-select" value={f.id_mapel} onChange={(e) => { set("id_mapel", e.target.value); set("id_materi", ""); }}>
                    <option value="">Umum (semua mapel)</option>
                    {referensi.mapel.map((m) => <option key={m.id_mapel} value={m.id_mapel}>{m.nama_mapel}</option>)}
                  </select>
                </div>
                <div className="col-md-3">
                  <label className="form-label small mb-1" htmlFor="vidKelas">Kelas</label>
                  <select id="vidKelas" className="form-select" value={f.id_kelas} onChange={(e) => set("id_kelas", e.target.value)}>
                    <option value="">Semua kelas</option>
                    {referensi.kelas.map((k) => <option key={k.id_kelas} value={k.id_kelas}>{k.nama_kelas}</option>)}
                  </select>
                </div>
                <div className="col-md-5">
                  <label className="form-label small mb-1" htmlFor="vidMateri">Materi</label>
                  <select id="vidMateri" className="form-select" value={f.id_materi} onChange={(e) => set("id_materi", e.target.value)} disabled={!f.id_mapel}>
                    <option value="">—</option>
                    {materi.map((m) => <option key={m.id_materi} value={m.id_materi}>{m.nama_materi}</option>)}
                  </select>
                </div>
              </div>
              <label className="form-label small mb-1" htmlFor="vidDesk">Keterangan untuk guru/siswa (opsional)</label>
              <textarea id="vidDesk" className="form-control mb-2" rows={2} maxLength={3000} value={f.deskripsi} onChange={(e) => set("deskripsi", e.target.value)} />
              <div className="row g-2">
                <div className="col-md-6">
                  <label className="form-label small mb-1" htmlFor="vidSumber">Asal video</label>
                  <select id="vidSumber" className="form-select form-select-sm" value={f.sumber} onChange={(e) => set("sumber", e.target.value)}>
                    {Object.entries(SUMBER).filter(([k]) => k !== "RENDER").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                {f.sumber === "REMOTION" && (
                  <div className="col-md-6">
                    <label className="form-label small mb-1" htmlFor="vidKomposisi">Nama komposisi Remotion</label>
                    <input id="vidKomposisi" className="form-control form-control-sm" maxLength={100} placeholder="mis. PecahanKue" value={f.komposisi} onChange={(e) => set("komposisi", e.target.value)} />
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline-secondary" onClick={onTutup} disabled={proses}>Batal</button>
              <button className="btn btn-primary" disabled={proses}>{proses ? <span className="spinner-border spinner-border-sm me-1"></span> : <i className="bi bi-save me-1"></i>}{proses ? "Mengunggah…" : "Simpan"}</button>
            </div>
          </form>
        </div>
      </div>
      <div className="modal-backdrop show"></div>
    </>
  );
}

function DetailVideo({ id, akses, referensi, onTutup, onBerubah }) {
  const [v, setV] = useState(null);
  const [ubah, setUbah] = useState(false);
  const [templat, setTemplat] = useState(false);
  const muat = useCallback(() => minta("GET", `/video-belajar/${id}`).then((r) => setV(r.data)).catch((err) => Swal.fire("Gagal", err.message, "error")), [id]);
  useEffect(() => { muat(); }, [muat]);
  // Segarkan selama video masih dirender
  useEffect(() => {
    if (!v || !["ANTRE", "PROSES"].includes(v.render_status)) return;
    const t = setInterval(() => { muat(); onBerubah(); }, 8000);
    return () => clearInterval(t);
  }, [v, muat, onBerubah]);
  if (!v) return null;
  const bisa = akses.isAdmin || v.dibuat_oleh === akses.user?.id;
  const aksi = async (jalur, body, konfirmasi) => {
    if (konfirmasi && !(await Swal.fire({ title: konfirmasi, icon: "question", showCancelButton: true, confirmButtonText: "Ya", cancelButtonText: "Batal" })).isConfirmed) return;
    try { const r = await minta("POST", `/video-belajar/${id}/${jalur}`, body); Swal.fire({ toast: true, position: "top-end", icon: "success", title: r.message, showConfirmButton: false, timer: 2500 }); muat(); onBerubah(); }
    catch (err) { Swal.fire("Belum bisa", err.message, "warning"); }
  };
  const kembalikan = async () => {
    const r = await Swal.fire({ title: "Kembalikan ke guru", input: "textarea", inputLabel: "Catatan perbaikan", inputValidator: (x) => (!x?.trim() ? "Tulis catatan perbaikannya." : undefined), showCancelButton: true, confirmButtonText: "Kembalikan", cancelButtonText: "Batal" });
    if (r.isConfirmed) aksi("revisi", { catatan: r.value });
  };
  const hapus = async () => {
    if (!(await Swal.fire({ title: "Hapus video ini?", text: v.tempat?.length ? `Video ini dipakai di ${v.tempat.length} tempat; semua tautannya ikut dilepas.` : undefined, icon: "warning", showCancelButton: true, confirmButtonText: "Hapus", cancelButtonText: "Batal", confirmButtonColor: "#dc3545" })).isConfirmed) return;
    try { await minta("DELETE", `/video-belajar/${id}`); onBerubah(); onTutup(); } catch (err) { Swal.fire("Gagal", err.message, "error"); }
  };
  const [label, warna] = STATUS_VIDEO[v.status];
  return (
    <>
      <div className="modal d-block" tabIndex={-1} role="dialog" aria-modal="true" aria-label={`Video ${v.judul}`}>
        <div className="modal-dialog modal-lg modal-dialog-scrollable">
          <div className="modal-content border-0 shadow">
            <div className="modal-header">
              <div className="min-w-0"><h5 className="modal-title fw-bold text-truncate">{v.judul}</h5>
                <div className="small text-muted">{v.mapel?.nama_mapel || "Umum"}{v.kelas && ` · ${v.kelas.nama_kelas}`}{v.materi && ` · ${v.materi.nama_materi}`} · {durasi(v.durasi_detik)} · {v.ukuran_kb ? `${(v.ukuran_kb / 1024).toFixed(1)} MB` : ""} · {v.pembuat?.name}
                  <span className={`badge text-bg-${warna} ms-1`}>{label}</span></div></div>
              <button type="button" className="btn-close" onClick={onTutup} aria-label="Tutup"></button>
            </div>
            <div className="modal-body">
              {["ANTRE", "PROSES"].includes(v.render_status) ? (
                <div className="alert alert-info d-flex align-items-center gap-2 mb-0"><span className="spinner-border spinner-border-sm"></span>
                  {v.render_status === "PROSES" ? "Server sedang membuat narasi suara dan merender video…" : "Menunggu giliran render."} Halaman ini menyegarkan diri; Anda juga boleh menutupnya.</div>
              ) : v.render_status === "GAGAL" ? (
                <div className="alert alert-danger small mb-0"><b>Render gagal:</b> {v.render_pesan} <div>Periksa isian lalu tekan <b>Ubah & render ulang</b>.</div></div>
              ) : <PutarVideo video={v} tinggi={420} />}
              {v.status === "REVISI" && v.catatan_revisi && <div className="alert alert-danger py-1 px-2 small mt-2"><b>Catatan kepala sekolah:</b> {v.catatan_revisi}</div>}
              {v.deskripsi && <p className="small mt-2 mb-1" style={{ whiteSpace: "pre-wrap" }}>{v.deskripsi}</p>}
              <div className="small text-muted mt-2">{SUMBER[v.sumber]}{v.komposisi && ` · komposisi ${v.komposisi}`}</div>
              <div className="mt-2 small"><b>Dipakai di:</b> {v.tempat?.length ? <ul className="mb-0">{v.tempat.map((t, i) => <li key={i}>{t.jenis}: {t.judul}</li>)}</ul> : <span className="text-muted">belum ditautkan. Tautkan dari modul ajar, sesi jadwal, atau editor soal.</span>}</div>
            </div>
            <div className="modal-footer">
              {bisa && ["DRAF", "REVISI"].includes(v.status) && <button className="btn btn-success" onClick={() => aksi("ajukan", undefined, "Ajukan video ke kepala sekolah?")}><i className="bi bi-send me-1"></i>Ajukan</button>}
              {akses.isKepsek && v.status === "DIAJUKAN" && <>
                <button className="btn btn-success" onClick={() => aksi("setujui", undefined, "Setujui video ini? Siswa akan bisa melihatnya.")}><i className="bi bi-patch-check me-1"></i>Setujui</button>
                <button className="btn btn-outline-danger" onClick={kembalikan}><i className="bi bi-arrow-counterclockwise me-1"></i>Kembalikan</button>
              </>}
              {bisa && v.sumber === "RENDER" && v.render_status !== "PROSES" && <button className="btn btn-outline-primary" onClick={() => setTemplat(true)}><i className="bi bi-magic me-1"></i>Ubah & render ulang</button>}
              {bisa && v.sumber !== "RENDER" && <button className="btn btn-outline-secondary" onClick={() => setUbah(true)}><i className="bi bi-pencil me-1"></i>Ubah</button>}
              {bisa && <button className="btn btn-outline-danger me-auto" onClick={hapus} aria-label="Hapus video"><i className="bi bi-trash"></i></button>}
              {v.file_url && <a className="btn btn-outline-secondary" href={srcGambar(v.file_url)} download><i className="bi bi-download me-1"></i>Unduh</a>}
            </div>
          </div>
        </div>
      </div>
      <div className="modal-backdrop show"></div>
      {ubah && <ModalUnggah referensi={referensi} video={v} onTutup={() => setUbah(false)} onSelesai={() => { setUbah(false); muat(); onBerubah(); }} />}
      {templat && <BuatDariTemplat referensi={referensi} video={v} onTutup={() => setTemplat(false)} onSelesai={() => { setTemplat(false); muat(); onBerubah(); }} />}
    </>
  );
}

function PustakaVideo() {
  const akses = useAkses();
  const cari = useSearchParams();
  const [status, setStatus] = useState(cari.get("status") || "");
  const [data, setData] = useState(null);
  const [referensi, setReferensi] = useState(null);
  const [unggah, setUnggah] = useState(false);
  const [buat, setBuat] = useState(false);
  const [buka, setBuka] = useState(null);

  const muat = useCallback(() => {
    minta("GET", `/video-belajar${status ? `?status=${status}` : ""}`).then((r) => setData(r.data)).catch((err) => Swal.fire("Gagal memuat", err.message, "error"));
  }, [status]);
  useEffect(() => { muat(); }, [muat]);
  useEffect(() => { minta("GET", "/perangkat-ajar/referensi").then(setReferensi).catch(() => {}); }, []);
  useEffect(() => {
    if (!data?.some((v) => ["ANTRE", "PROSES"].includes(v.render_status))) return;
    const t = setInterval(muat, 10000);
    return () => clearInterval(t);
  }, [data, muat]);

  return (
    <div className="container-fluid mt-3 mb-5">
      <div className="d-flex flex-wrap align-items-start gap-2 mb-3">
        <div className="me-auto">
          <h3 className="fw-bold text-primary mb-1"><i className="bi bi-play-btn me-2"></i>Video Belajar</h3>
          <p className="text-muted small mb-0">Video motion graphic untuk anak yang belajar lewat gambar. Satu video bisa ditautkan ke modul ajar, sesi jadwal, soal, dan tampil di Portal Siswa setelah disetujui kepala sekolah.</p>
        </div>
        {!akses.isKepsek && <button className="btn btn-primary" onClick={() => setBuat(true)} disabled={!referensi}><i className="bi bi-magic me-1"></i>Buat video motion graphic</button>}
        {!akses.isKepsek && <button className="btn btn-outline-primary" onClick={() => setUnggah(true)} disabled={!referensi}><i className="bi bi-cloud-arrow-up me-1"></i>Unggah video</button>}
      </div>
      <div className="btn-group btn-group-sm mb-3" role="group" aria-label="Saring status video">
        {[["", "Semua"], ...Object.entries(STATUS_VIDEO).map(([k, [l]]) => [k, l])].map(([k, l]) => (
          <button key={k} className={`btn ${status === k ? "btn-primary" : "btn-outline-primary"}`} onClick={() => setStatus(k)}>{l}</button>
        ))}
      </div>
      {!data ? <div className="text-muted small"><span className="spinner-border spinner-border-sm me-2"></span>Memuat…</div>
        : !data.length ? <div className="text-center text-muted py-5"><i className="bi bi-film fs-1 d-block mb-2"></i>{status ? "Tidak ada video dengan status ini." : <>Belum ada video. Tekan <b>Buat video motion graphic</b> untuk membuat dari templat, atau <b>Unggah video</b>.</>}</div>
        : (
          <div className="d-flex flex-wrap gap-3">
            {data.map((v) => (
              <div key={v.id_video} className="kartu-pustaka" role="button" tabIndex={0} onClick={() => setBuka(v.id_video)} onKeyDown={(e) => e.key === "Enter" && setBuka(v.id_video)} style={{ width: 220 }}>
                <div className="pe-none"><KartuVideo video={v} /></div>
                <div className="small text-muted mt-1">{v.mapel?.nama_mapel || "Umum"}{v.kelas && ` · ${v.kelas.nama_kelas}`}</div>
                <div className="d-flex gap-1 flex-wrap mt-1">
                  <span className={`badge text-bg-${STATUS_VIDEO[v.status][1]}`}>{STATUS_VIDEO[v.status][0]}</span>
                  {v.dipakai > 0 && <span className="badge text-bg-light border fw-normal">dipakai {v.dipakai}×</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      {buat && referensi && <BuatDariTemplat referensi={referensi} onTutup={() => setBuat(false)} onSelesai={(v) => { setBuat(false); muat(); setBuka(v.id_video); }} />}
      {unggah && referensi && <ModalUnggah referensi={referensi} onTutup={() => setUnggah(false)} onSelesai={(v) => { setUnggah(false); muat(); setBuka(v.id_video); }} />}
      {buka && referensi && <DetailVideo id={buka} akses={akses} referensi={referensi} onTutup={() => setBuka(null)} onBerubah={muat} />}
    </div>
  );
}

export default function Halaman() {
  return <Suspense fallback={null}><PustakaVideo /></Suspense>;
}
