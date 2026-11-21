"use client";
import { useEffect, useMemo, useState } from "react";
import { API_URL, authHeaders } from "@/app/lib/akses";
import { API_ORIGIN } from "@/app/lib/config";
import { minta } from "@/components/banksoal/api";
import { kecilkanFoto } from "@/app/lib/foto";
import Pengisi from "@/components/dashboard/Pengisi";

export const KATEGORI = {
  KARYA: { label: "Karya", icon: "bi-palette", warna: "primary" },
  P5: { label: "Projek P5 / kokurikuler", icon: "bi-stars", warna: "success" },
  PRESTASI: { label: "Prestasi & lomba", icon: "bi-trophy", warna: "warning" },
  KEGIATAN: { label: "Kegiatan", icon: "bi-people", warna: "info" },
};
const STATUS = {
  MENUNGGU: { label: "Menunggu tinjauan", warna: "warning" },
  DISETUJUI: { label: "Disetujui", warna: "success" },
  DITOLAK: { label: "Dikembalikan", warna: "danger" },
};
const tgl = (v) => (v ? new Date(`${String(v).slice(0, 10)}T00:00:00`).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) : "");
const hariIni = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const semester = (p) => (p ? `${p.semester} ${p.tahun_ajaran}` : "");
/** url dari API berupa path relatif bertanda tangan ("/api/portofolio/X/berkas?..."); tempelkan ke asal API. */
const asalApi = (url) => (url ? `${API_ORIGIN}${url}` : "");

/** Kirim multipart dengan progres (video bisa puluhan MB di sinyal lemah). */
function kirimBerkas(form, onProgres) {
  return new Promise((ok, gagal) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_URL}/portofolio`);
    Object.entries(authHeaders(false)).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgres(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let d = {};
      try { d = JSON.parse(xhr.responseText || "{}"); } catch {}
      if (xhr.status >= 200 && xhr.status < 300) ok(d);
      else gagal(new Error((d.errors && Object.values(d.errors)[0]?.[0]) || d.message || `Gagal mengunggah (status ${xhr.status}).`));
    };
    xhr.onerror = () => gagal(new Error("Koneksi terputus saat mengunggah. Coba lagi."));
    xhr.send(form);
  });
}

/** Formulir unggah karya. pilihanSiswa → bisa memilih beberapa siswa (karya kelompok); idSiswa → satu siswa tetap. */
export function FormUnggah({ idSiswa, pilihanSiswa, proyek = [], portal = false, onSelesai, onBatal }) {
  const [berkas, setBerkas] = useState(null);
  const [pratinjau, setPratinjau] = useState("");
  const [isi, setIsi] = useState({ judul: "", deskripsi: "", kategori: "KARYA", id_proyek: "", tanggal: hariIni() });
  const [dipilih, setDipilih] = useState(idSiswa ? [idSiswa] : []);
  const [progres, setProgres] = useState(null);
  const [galat, setGalat] = useState("");

  useEffect(() => () => pratinjau && URL.revokeObjectURL(pratinjau), [pratinjau]);
  const pilihBerkas = async (f) => {
    setGalat("");
    if (!f) return;
    const kecil = await kecilkanFoto(f);
    setBerkas(kecil);
    setPratinjau(URL.createObjectURL(kecil));
    if (!isi.judul) setIsi((v) => ({ ...v, judul: f.name.replace(/\.\w+$/, "").replace(/[_-]+/g, " ").slice(0, 150) }));
  };
  const ubah = (k) => (e) => setIsi((v) => ({ ...v, [k]: e.target.value }));
  const alihSiswa = (id) => setDipilih((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));

  const kirim = async (e) => {
    e.preventDefault();
    if (!berkas) { setGalat("Pilih foto atau video karya lebih dulu."); return; }
    if (!dipilih.length) { setGalat("Pilih minimal satu siswa."); return; }
    const f = new FormData();
    f.append("berkas", berkas);
    dipilih.forEach((id) => f.append("id_siswa[]", id));
    Object.entries(isi).forEach(([k, v]) => { if (v && (k !== "id_proyek" || isi.kategori === "P5")) f.append(k, v); });
    setProgres(0); setGalat("");
    try {
      const r = await kirimBerkas(f, setProgres);
      onSelesai?.(r);
    } catch (err) { setGalat(err.message); setProgres(null); }
  };

  const video = berkas?.type?.startsWith("video/");
  return (
    <form className="card border-0 shadow-sm mb-3" onSubmit={kirim} data-form-portofolio>
      <div className="card-body">
        <div className="d-flex align-items-center mb-2">
          <h3 className="h6 fw-bold mb-0 me-auto"><i className="bi bi-cloud-upload me-1" aria-hidden="true"></i>Tambah karya</h3>
          {onBatal && <button type="button" className="btn-close" aria-label="Tutup" onClick={onBatal}></button>}
        </div>
        <div className="row g-3">
          <div className="col-md-4">
            <label className="border rounded bg-light d-flex align-items-center justify-content-center text-center w-100 overflow-hidden" style={{ height: 180, cursor: "pointer" }}>
              <input type="file" accept="image/*,video/*" className="d-none" onChange={(e) => pilihBerkas(e.target.files?.[0])} aria-label="Pilih foto atau video" />
              {pratinjau ? (video
                ? <video src={pratinjau} className="w-100 h-100" style={{ objectFit: "cover" }} muted />
                : <img src={pratinjau} alt="Pratinjau karya" className="w-100 h-100" style={{ objectFit: "cover" }} />)
                : <span className="text-muted small px-2"><i className="bi bi-camera fs-2 d-block" aria-hidden="true"></i>Ambil foto / pilih foto atau video<br />(foto ≤ 10 MB, video ≤ 45 MB)</span>}
            </label>
          </div>
          <div className="col-md-8">
            <div className="row g-2">
              <div className="col-sm-8">
                <label className="form-label small mb-1">Judul karya</label>
                <input className="form-control form-control-sm" value={isi.judul} onChange={ubah("judul")} maxLength={150} required placeholder="mis. Kincir angin dari botol bekas" />
              </div>
              <div className="col-sm-4">
                <label className="form-label small mb-1">Tanggal</label>
                <input type="date" className="form-control form-control-sm" value={isi.tanggal} max={hariIni()} onChange={ubah("tanggal")} />
              </div>
              <div className={isi.kategori === "P5" && proyek.length ? "col-sm-5" : "col-sm-12"}>
                <label className="form-label small mb-1">Kategori</label>
                <select className="form-select form-select-sm" value={isi.kategori} onChange={ubah("kategori")}>
                  {Object.entries(KATEGORI).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              {isi.kategori === "P5" && proyek.length > 0 && (
                <div className="col-sm-7">
                  <label className="form-label small mb-1">Projek</label>
                  <select className="form-select form-select-sm" value={isi.id_proyek} onChange={ubah("id_proyek")}>
                    <option value="">— tanpa projek tertentu —</option>
                    {proyek.map((p) => <option key={p.id_proyek} value={p.id_proyek}>{p.judul_proyek}</option>)}
                  </select>
                </div>
              )}
              <div className="col-12">
                <label className="form-label small mb-1">Cerita singkat (opsional)</label>
                <textarea className="form-control form-control-sm" rows={2} value={isi.deskripsi} onChange={ubah("deskripsi")} maxLength={2000}
                  placeholder="Apa yang dibuat, bagaimana caranya, apa yang dipelajari." />
              </div>
            </div>
          </div>
          {pilihanSiswa && (
            <div className="col-12">
              <div className="d-flex align-items-center gap-2 mb-1">
                <span className="small fw-semibold me-auto">Siswa ({dipilih.length} dipilih){dipilih.length > 1 ? " · karya kelompok" : ""}</span>
                <button type="button" className="btn btn-link btn-sm p-0" onClick={() => setDipilih(pilihanSiswa.map((s) => s.id_siswa))}>Pilih semua</button>
                <button type="button" className="btn btn-link btn-sm p-0" onClick={() => setDipilih([])}>Kosongkan</button>
              </div>
              <div className="d-flex flex-wrap gap-1">
                {pilihanSiswa.map((s) => (
                  <button type="button" key={s.id_siswa} onClick={() => alihSiswa(s.id_siswa)} aria-pressed={dipilih.includes(s.id_siswa)}
                    className={`btn btn-sm ${dipilih.includes(s.id_siswa) ? "btn-primary" : "btn-outline-secondary"}`}>{s.nama_siswa}</button>
                ))}
              </div>
            </div>
          )}
        </div>
        {galat && <div className="alert alert-danger py-2 small mt-3 mb-0">{galat}</div>}
        {progres !== null && (
          <div className="progress mt-3" role="progressbar" aria-label="Progres unggah" aria-valuenow={progres} aria-valuemin={0} aria-valuemax={100}>
            <div className="progress-bar" style={{ width: `${progres}%` }}>{progres}%</div>
          </div>
        )}
        <div className="d-flex align-items-center gap-2 mt-3">
          {portal && <span className="small text-muted me-auto"><i className="bi bi-info-circle me-1" aria-hidden="true"></i>Karya ditinjau wali kelas sebelum masuk portofolio.</span>}
          <button type="submit" className="btn btn-primary btn-sm fw-bold ms-auto" disabled={progres !== null}>
            {progres !== null ? <><span className="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>Mengunggah…</> : <><i className="bi bi-upload me-1" aria-hidden="true"></i>Unggah</>}
          </button>
        </div>
      </div>
    </form>
  );
}

function Media({ x, besar = false }) {
  const src = asalApi(x.url);
  if (x.jenis === "VIDEO") {
    return besar
      ? <video src={src} controls playsInline className="w-100 rounded bg-black" style={{ maxHeight: "70vh" }} />
      : (
        <div className="position-relative w-100 h-100 bg-dark">
          <video src={`${src}#t=0.5`} preload="metadata" muted playsInline className="w-100 h-100" style={{ objectFit: "cover" }} />
          <i className="bi bi-play-circle-fill text-white fs-1 position-absolute top-50 start-50 translate-middle" aria-hidden="true"></i>
        </div>
      );
  }
  return <img src={src} alt={x.judul} loading="lazy" className={besar ? "img-fluid rounded mx-auto d-block" : "w-100 h-100"} style={besar ? { maxHeight: "70vh" } : { objectFit: "cover" }} />;
}

/** Jendela rincian karya: tampilan besar, ubah keterangan, tandai unggulan, dan tinjau. */
function Rincian({ x, namaSiswa, bolehTinjau, bolehUbahSendiri, proyek, onTutup, onBerubah, onHapus }) {
  const [isi, setIsi] = useState({ judul: x.judul, deskripsi: x.deskripsi || "", kategori: x.kategori, id_proyek: x.id_proyek || "", tanggal: x.tanggal });
  const [tanggapan, setTanggapan] = useState(x.tanggapan || "");
  const [ubah, setUbah] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState("");
  const bolehUbah = bolehTinjau || bolehUbahSendiri;

  const jalankan = async (fn) => {
    setSibuk(true); setGalat("");
    try { const r = await fn(); if (r?.data) onBerubah(r.data); return r; } catch (e) { setGalat(e.message); } finally { setSibuk(false); }
  };
  const simpan = () => jalankan(() => minta("PUT", `/portofolio/${x.id}`, { ...isi, id_proyek: isi.kategori === "P5" ? isi.id_proyek || null : null })).then((r) => r && setUbah(false));
  const tinjau = (status) => jalankan(() => minta("POST", `/portofolio/${x.id}/tinjau`, { status, tanggapan: tanggapan || null }));
  const unggulan = () => jalankan(() => minta("PUT", `/portofolio/${x.id}`, { unggulan: !x.unggulan }));
  const simpanTanggapan = () => jalankan(() => minta("PUT", `/portofolio/${x.id}`, { tanggapan: tanggapan || null }));
  const hapus = async () => {
    if (!confirm(x.kelompok ? "Hapus karya ini dari portofolio siswa ini? Anggota kelompok lain tetap menyimpannya." : "Hapus karya ini dari portofolio?")) return;
    await jalankan(() => minta("DELETE", `/portofolio/${x.id}`));
    onHapus(x.id);
  };
  const st = STATUS[x.status];
  const kat = KATEGORI[x.kategori];

  return (
    <div className="modal d-block" tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="judul-karya" style={{ background: "rgba(0,0,0,.6)" }} onClick={(e) => e.target === e.currentTarget && onTutup()}>
      <div className="modal-dialog modal-xl modal-dialog-scrollable modal-dialog-centered">
        <div className="modal-content">
          <div className="modal-header py-2">
            <h2 id="judul-karya" className="modal-title h6 fw-bold me-2">{x.judul}</h2>
            {x.unggulan && <span className="badge text-bg-warning me-2"><i className="bi bi-star-fill me-1" aria-hidden="true"></i>Unggulan</span>}
            <button type="button" className="btn-close" aria-label="Tutup" onClick={onTutup}></button>
          </div>
          <div className="modal-body">
            <div className="row g-3">
              <div className="col-lg-8"><Media x={x} besar /></div>
              <div className="col-lg-4 small">
                <div className="d-flex flex-wrap gap-1 mb-2">
                  <span className={`badge text-bg-${kat?.warna || "secondary"}`}><i className={`bi ${kat?.icon} me-1`} aria-hidden="true"></i>{kat?.label || x.kategori}</span>
                  <span className={`badge text-bg-${st.warna}`}>{st.label}</span>
                  {x.kelompok && <span className="badge text-bg-light border">Karya kelompok</span>}
                </div>
                {namaSiswa && <div className="fw-semibold">{namaSiswa}</div>}
                <div className="text-muted mb-2">{tgl(x.tanggal)}{x.periode ? ` · ${semester(x.periode)}` : ""}{x.proyek ? ` · ${x.proyek.judul_proyek}` : ""}</div>

                {ubah ? (
                  <div className="d-grid gap-2 mb-2">
                    <input className="form-control form-control-sm" value={isi.judul} maxLength={150} onChange={(e) => setIsi({ ...isi, judul: e.target.value })} aria-label="Judul" />
                    <input type="date" className="form-control form-control-sm" value={isi.tanggal} max={hariIni()} onChange={(e) => setIsi({ ...isi, tanggal: e.target.value })} aria-label="Tanggal" />
                    <select className="form-select form-select-sm" value={isi.kategori} onChange={(e) => setIsi({ ...isi, kategori: e.target.value })} aria-label="Kategori">
                      {Object.entries(KATEGORI).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                    {isi.kategori === "P5" && proyek.length > 0 && (
                      <select className="form-select form-select-sm" value={isi.id_proyek} onChange={(e) => setIsi({ ...isi, id_proyek: e.target.value })} aria-label="Projek">
                        <option value="">— tanpa projek tertentu —</option>
                        {proyek.map((p) => <option key={p.id_proyek} value={p.id_proyek}>{p.judul_proyek}</option>)}
                      </select>
                    )}
                    <textarea className="form-control form-control-sm" rows={3} value={isi.deskripsi} maxLength={2000} onChange={(e) => setIsi({ ...isi, deskripsi: e.target.value })} aria-label="Cerita singkat" />
                    <div className="d-flex gap-2">
                      <button type="button" className="btn btn-primary btn-sm" disabled={sibuk} onClick={simpan}>Simpan</button>
                      <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setUbah(false)}>Batal</button>
                    </div>
                    {x.kelompok && <div className="text-muted">Perubahan berlaku untuk semua anggota kelompok.</div>}
                  </div>
                ) : (
                  <>
                    {x.deskripsi && <p className="mb-2" style={{ whiteSpace: "pre-line" }}>{x.deskripsi}</p>}
                    {bolehUbah && <button type="button" className="btn btn-link btn-sm p-0 mb-2" onClick={() => setUbah(true)}><i className="bi bi-pencil me-1" aria-hidden="true"></i>Ubah keterangan</button>}
                  </>
                )}

                <div className="border-top pt-2 mb-2">
                  <div className="text-muted">Diunggah</div>
                  <Pengisi guru={x.pembuat?.id_guru ? x.pembuat?.name : null} pengisi={x.pembuat?.name} sebaris />
                  {x.peninjau && x.status !== "MENUNGGU" && (
                    <div className="mt-1 text-muted">{x.status === "DISETUJUI" ? "Disetujui" : "Dikembalikan"} oleh <Pengisi pengisi={x.peninjau.name} sebaris /></div>
                  )}
                </div>

                {x.tanggapan && !bolehTinjau && (
                  <div className={`alert py-2 ${x.status === "DITOLAK" ? "alert-danger" : "alert-success"}`}>
                    <i className="bi bi-chat-quote me-1" aria-hidden="true"></i><strong>Tanggapan wali kelas:</strong> {x.tanggapan}
                  </div>
                )}

                {bolehTinjau && (
                  <div className="border-top pt-2">
                    <label className="form-label mb-1" htmlFor={`tanggapan-${x.id}`}>Tanggapan / apresiasi untuk siswa</label>
                    <textarea id={`tanggapan-${x.id}`} className="form-control form-control-sm mb-2" rows={2} maxLength={1000} value={tanggapan}
                      onChange={(e) => setTanggapan(e.target.value)} placeholder="mis. Rapi dan kreatif! Lain kali ceritakan bahan yang dipakai." />
                    <div className="d-flex flex-wrap gap-2">
                      {x.status !== "DISETUJUI" && <button type="button" className="btn btn-success btn-sm" disabled={sibuk} onClick={() => tinjau("DISETUJUI")}><i className="bi bi-check-lg me-1" aria-hidden="true"></i>Setujui</button>}
                      {x.status === "MENUNGGU" && <button type="button" className="btn btn-outline-danger btn-sm" disabled={sibuk} onClick={() => tinjau("DITOLAK")}><i className="bi bi-arrow-return-left me-1" aria-hidden="true"></i>Kembalikan</button>}
                      {x.status === "DISETUJUI" && <button type="button" className="btn btn-outline-secondary btn-sm" disabled={sibuk || tanggapan === (x.tanggapan || "")} onClick={simpanTanggapan}>Simpan tanggapan</button>}
                      {x.status === "DISETUJUI" && (
                        <button type="button" className={`btn btn-sm ${x.unggulan ? "btn-warning" : "btn-outline-warning"}`} disabled={sibuk} onClick={unggulan} aria-pressed={x.unggulan}>
                          <i className={`bi ${x.unggulan ? "bi-star-fill" : "bi-star"} me-1`} aria-hidden="true"></i>{x.unggulan ? "Unggulan" : "Jadikan unggulan"}
                        </button>
                      )}
                    </div>
                    <div className="text-muted mt-1">Karya unggulan dicetak sebagai lampiran buku induk di Rekam Jejak.</div>
                  </div>
                )}
                {galat && <div className="alert alert-danger py-2 mt-2 mb-0">{galat}</div>}
              </div>
            </div>
          </div>
          <div className="modal-footer py-2">
            <a href={asalApi(x.url)} target="_blank" rel="noopener noreferrer" className="btn btn-outline-secondary btn-sm me-auto"><i className="bi bi-box-arrow-up-right me-1" aria-hidden="true"></i>Buka berkas</a>
            {(bolehTinjau || bolehUbahSendiri) && <button type="button" className="btn btn-outline-danger btn-sm" disabled={sibuk} onClick={hapus}><i className="bi bi-trash me-1" aria-hidden="true"></i>Hapus</button>}
            <button type="button" className="btn btn-secondary btn-sm" onClick={onTutup}>Tutup</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Galeri karya (kartu kecil) + jendela rincian. namaSiswa: peta id_siswa → nama bila galeri berisi banyak siswa. */
export function GaleriPortofolio({ data, namaSiswa, bolehTinjau, idPengguna, proyek = [], onBerubah, onHapus, kosong }) {
  const [buka, setBuka] = useState(null);
  const aktif = buka ? data.find((x) => x.id === buka) : null;
  if (!data.length) return <div className="alert alert-light border small mb-0">{kosong || "Belum ada karya."}</div>;
  return (
    <>
      <div className="row g-2">
        {data.map((x) => {
          const st = STATUS[x.status];
          const kat = KATEGORI[x.kategori];
          return (
            <div key={x.id} className="col-6 col-md-4 col-lg-3">
              <button type="button" className="card h-100 w-100 text-start p-0 border shadow-sm overflow-hidden" onClick={() => setBuka(x.id)} data-karya={x.id}>
                <div className="position-relative w-100 bg-light" style={{ aspectRatio: "4 / 3" }}>
                  <Media x={x} />
                  <span className={`badge text-bg-${kat?.warna || "secondary"} position-absolute top-0 start-0 m-1`} title={kat?.label}><i className={`bi ${kat?.icon}`} aria-hidden="true"></i><span className="visually-hidden">{kat?.label}</span></span>
                  {x.unggulan && <span className="badge text-bg-warning position-absolute top-0 end-0 m-1"><i className="bi bi-star-fill" aria-hidden="true"></i><span className="visually-hidden">Unggulan</span></span>}
                  {x.status !== "DISETUJUI" && <span className={`badge text-bg-${st.warna} position-absolute bottom-0 start-0 m-1`}>{st.label}</span>}
                </div>
                <div className="card-body p-2 small">
                  <div className="fw-semibold text-truncate">{x.judul}</div>
                  <div className="text-muted text-truncate">{namaSiswa ? `${namaSiswa[x.id_siswa] || x.id_siswa} · ` : ""}{tgl(x.tanggal)}</div>
                </div>
              </button>
            </div>
          );
        })}
      </div>
      {aktif && (
        <Rincian key={aktif.id} x={aktif} namaSiswa={namaSiswa?.[aktif.id_siswa]} bolehTinjau={bolehTinjau} proyek={proyek}
          bolehUbahSendiri={!bolehTinjau && aktif.dibuat_oleh === idPengguna && aktif.status !== "DISETUJUI"}
          onTutup={() => setBuka(null)} onBerubah={onBerubah} onHapus={(id) => { setBuka(null); onHapus(id); }} />
      )}
    </>
  );
}

/** Lampiran buku induk (hanya tercetak): karya unggulan, atau semua karya disetujui bila belum ada yang ditandai. */
export function LampiranPortofolio({ data, namaSiswa }) {
  const setuju = data.filter((x) => x.status === "DISETUJUI");
  const pilih = setuju.some((x) => x.unggulan) ? setuju.filter((x) => x.unggulan) : setuju;
  if (!pilih.length) return null;
  return (
    <section className="d-none d-print-block mt-3" style={{ breakBefore: "page" }}>
      <div className="fw-bold text-center mb-2">LAMPIRAN: PORTOFOLIO KARYA{namaSiswa ? ` · ${namaSiswa.toUpperCase()}` : ""}</div>
      <div className="row g-2">
        {pilih.map((x) => (
          <div key={x.id} className="col-6" style={{ breakInside: "avoid" }}>
            <div className="border rounded p-2 h-100">
              {x.jenis === "FOTO"
                ? <img src={asalApi(x.url)} alt={x.judul} className="w-100" style={{ maxHeight: 260, objectFit: "contain" }} />
                : <div className="border bg-light text-center py-4 small"><i className="bi bi-camera-video me-1" aria-hidden="true"></i>Video (lihat di aplikasi)</div>}
              <div className="small mt-1"><strong>{x.judul}</strong> · {KATEGORI[x.kategori]?.label} · {tgl(x.tanggal)}</div>
              {x.deskripsi && <div className="small text-muted">{x.deskripsi}</div>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Portofolio satu siswa: dipakai di Rekam Jejak dan Portal (siswa/orang tua bisa mengirim karya). */
export default function PortofolioSiswa({ idSiswa, namaSiswa, idPengguna, portal = false, cetak = false }) {
  const [res, setRes] = useState(null);
  const [galat, setGalat] = useState("");
  const [form, setForm] = useState(false);
  const [saring, setSaring] = useState("SEMUA");
  const [pesan, setPesan] = useState("");
  const [idAkun, setIdAkun] = useState(idPengguna ?? null);
  useEffect(() => {
    if (idPengguna !== undefined) { setIdAkun(idPengguna); return; }
    try { setIdAkun(JSON.parse(localStorage.getItem("user") || "null")?.id ?? null); } catch {}
  }, [idPengguna]);

  const muat = () => minta("GET", `/siswa/${encodeURIComponent(idSiswa)}/portofolio`).then(setRes).catch((e) => setGalat(e.message));
  useEffect(() => { if (idSiswa) { setRes(null); muat(); } }, [idSiswa]); // eslint-disable-line react-hooks/exhaustive-deps

  const data = res?.data || [];
  const tampil = useMemo(() => (saring === "SEMUA" ? data : saring === "UNGGULAN" ? data.filter((x) => x.unggulan) : data.filter((x) => x.kategori === saring)), [data, saring]);
  const ganti = (baru) => setRes((r) => ({ ...r, data: r.data.map((x) => (x.id === baru.id ? baru : x)) }));
  const hapus = (id) => setRes((r) => ({ ...r, data: r.data.filter((x) => x.id !== id) }));
  if (galat) return <div className="alert alert-warning small">{galat}</div>;
  if (!res) return <div className="text-muted small p-2"><span className="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Memuat portofolio…</div>;
  const menunggu = data.filter((x) => x.status === "MENUNGGU").length;

  return (
    <>
      <section className="card border-0 shadow-sm mb-3 kartu-semester d-print-none" aria-labelledby="judul-portofolio">
        <div className="card-header bg-white d-flex flex-wrap align-items-center gap-2">
          <h2 id="judul-portofolio" className="h6 fw-bold mb-0 me-auto"><i className="bi bi-images me-1 text-primary" aria-hidden="true"></i>E-portofolio karya
            <span className="text-muted fw-normal small ms-1">({data.filter((x) => x.status === "DISETUJUI").length} karya{menunggu ? ` · ${menunggu} menunggu tinjauan` : ""})</span></h2>
          {res.boleh_unggah && !form && <button type="button" className="btn btn-primary btn-sm" onClick={() => { setForm(true); setPesan(""); }}><i className="bi bi-plus-lg me-1" aria-hidden="true"></i>Tambah karya</button>}
        </div>
        <div className="card-body">
          {pesan && <div className="alert alert-success py-2 small">{pesan}</div>}
          {form && (
            <FormUnggah idSiswa={idSiswa} proyek={res.proyek} portal={portal} onBatal={() => setForm(false)}
              onSelesai={(r) => { setForm(false); setPesan(r.message); setRes((v) => ({ ...v, data: [...r.data, ...v.data] })); }} />
          )}
          {data.length > 0 && (
            <div className="d-flex flex-wrap gap-1 mb-2" role="group" aria-label="Saring kategori">
              {[["SEMUA", "Semua"], ["UNGGULAN", "Unggulan"], ...Object.entries(KATEGORI).map(([k, v]) => [k, v.label])].map(([k, l]) => (
                <button key={k} type="button" className={`btn btn-sm ${saring === k ? "btn-dark" : "btn-outline-secondary"}`} onClick={() => setSaring(k)} aria-pressed={saring === k}>{l}</button>
              ))}
            </div>
          )}
          <GaleriPortofolio data={tampil} bolehTinjau={res.boleh_tinjau} idPengguna={idAkun} proyek={res.proyek} onBerubah={ganti} onHapus={hapus}
            kosong={portal ? "Belum ada karya. Tekan Tambah karya untuk mengirim foto atau video karya terbaik." : "Belum ada karya di portofolio siswa ini."} />
        </div>
      </section>
      {cetak && <LampiranPortofolio data={data} namaSiswa={namaSiswa} />}
    </>
  );
}
