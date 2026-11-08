"use client";
// Guru membuat video motion graphic sendiri (jalur B): pilih templat, isi adegan & narasi, lihat pratinjau langsung
// (@remotion/player, tanpa suara), lalu kirim ke antrean render di server yang membuat narasi suara dan MP4.
import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Swal from "sweetalert2";
import { minta } from "@/components/banksoal/api";
import { FPS, LEBAR, TINGGI, TEMPLAT, hitungDurasi, rapikanProps, templatById } from "./templat/index.js";

const Player = dynamic(() => import("@remotion/player").then((m) => m.Player), { ssr: false, loading: () => <div className="ratio ratio-16x9 bg-dark rounded"></div> });
const EMOJI_CEPAT = ["🐟", "🍌", "🍠", "🥥", "🥭", "🐷", "🐔", "🐦", "🌳", "🌺", "🏠", "🛶", "⛰️", "🌧️", "☀️", "💧", "🥚", "🐸", "🦋", "🐛", "🍎", "✏️", "📚", "⚽", "🖐️", "👁️", "👂", "👃", "👄", "🦷"];
const detik = (f) => `${Math.floor(f / FPS / 60)}:${String(Math.round(f / FPS) % 60).padStart(2, "0")}`;

function IsianAdegan({ kolom, adegan, terakhir, ubah }) {
  return (
    <div className="row g-2">
      {kolom.filter((c) => (!c.tampil || c.tampil(adegan)) && (!c.hanyaTerakhir || terakhir)).map((c) => (
        <div key={c.k} className={c.jenis === "panjang" ? "col-12" : c.jenis === "emoji" ? "col-md-3" : "col-md-4"}>
          <label className="form-label small mb-0">{c.label}</label>
          {c.jenis === "panjang" ? (
            <textarea className="form-control form-control-sm" rows={2} maxLength={600} aria-label={c.label} value={adegan[c.k] ?? ""} placeholder={String(c.contoh ?? "")} onChange={(e) => ubah(c.k, e.target.value)} />
          ) : c.jenis === "pilih" ? (
            <select className="form-select form-select-sm" aria-label={c.label} value={adegan[c.k] ?? ""} onChange={(e) => ubah(c.k, e.target.value)}>
              {c.opsi.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          ) : c.jenis === "angka" ? (
            <input type="number" className="form-control form-control-sm" min={c.min} max={c.max} aria-label={c.label} value={adegan[c.k] ?? ""} onChange={(e) => ubah(c.k, e.target.value)} />
          ) : c.jenis === "centang" ? (
            <div className="form-check mt-1"><input className="form-check-input" type="checkbox" checked={!!adegan[c.k]} onChange={(e) => ubah(c.k, e.target.checked)} aria-label={c.label} /></div>
          ) : c.jenis === "emoji" ? (
            <div className="dropdown">
              <input className="form-control form-control-sm text-center fs-5 py-0" aria-label={c.label} maxLength={8} value={adegan[c.k] ?? ""} onChange={(e) => ubah(c.k, e.target.value)} data-bs-toggle="dropdown" />
              <div className="dropdown-menu p-2" style={{ width: 260 }}>
                <div className="d-flex flex-wrap gap-1">{EMOJI_CEPAT.map((em) => <button key={em} type="button" className="btn btn-sm btn-light fs-5 p-1" onClick={() => ubah(c.k, em)}>{em}</button>)}</div>
                <div className="small text-muted mt-1">Atau ketik/tempel emoji lain (Windows: tombol ⊞ + titik).</div>
              </div>
            </div>
          ) : (
            <input className="form-control form-control-sm" maxLength={120} aria-label={c.label} value={adegan[c.k] ?? ""} placeholder={String(c.contoh ?? "")} onChange={(e) => ubah(c.k, e.target.value)} />
          )}
        </div>
      ))}
    </div>
  );
}

/** Jendela pembuat video dari templat. `video` diisi bila menyunting ulang video dari templat. */
export default function BuatDariTemplat({ referensi, video, onTutup, onSelesai }) {
  const [idTemplat, setIdTemplat] = useState(video?.templat || null);
  const t = templatById(idTemplat);
  const [meta, setMeta] = useState({ judul: video?.judul || "", id_mapel: video?.id_mapel || referensi.mapel[0]?.id_mapel || "", id_kelas: video?.id_kelas || "", id_materi: video?.id_materi || "" });
  const [props, setProps] = useState(video?.props || null);
  const [suara, setSuara] = useState(video?.suara || "LOKAL");
  const [pilihanSuara, setPilihanSuara] = useState([]);
  const [proses, setProses] = useState(false);

  useEffect(() => { minta("GET", "/video-belajar/suara").then((r) => setPilihanSuara(r.data)).catch(() => {}); }, []);
  const pilihTemplat = (id) => {
    const x = templatById(id);
    setIdTemplat(id);
    setProps(JSON.parse(JSON.stringify(x.contoh)));
    setMeta((m) => ({ ...m, judul: m.judul || x.contoh.judul }));
  };
  const bersih = useMemo(() => (t && props ? rapikanProps(t.id, { ...props, judul: meta.judul || props.judul }) : null), [t, props, meta.judul]);
  const durasi = bersih ? hitungDurasi(bersih) : 0;
  const ubahAdegan = (i, k, v) => setProps((p) => ({ ...p, adegan: p.adegan.map((a, j) => (j === i ? { ...a, [k]: v } : a)) }));
  const geser = (i, d) => setProps((p) => { const a = [...p.adegan]; [a[i], a[i + d]] = [a[i + d], a[i]]; return { ...p, adegan: a }; });

  const kirim = async () => {
    if (!meta.judul.trim()) return Swal.fire("Isi judul", "Tulis judul video terlebih dulu.", "info");
    const kurang = bersih.adegan.findIndex((a) => t.kolom.some((c) => c.wajib && (a[c.k] === "" || a[c.k] == null)));
    if (kurang >= 0) return Swal.fire("Adegan belum lengkap", `Lengkapi isian wajib di adegan ${kurang + 1}.`, "info");
    if (suara !== "TANPA" && bersih.adegan.some((a) => !String(a.narasi || "").trim())) {
      const ok = await Swal.fire({ title: "Ada adegan tanpa narasi", text: "Adegan itu akan tampil tanpa suara. Lanjutkan?", icon: "question", showCancelButton: true, confirmButtonText: "Lanjutkan", cancelButtonText: "Kembali" });
      if (!ok.isConfirmed) return;
    }
    setProses(true);
    try {
      const body = { templat: t.id, judul: meta.judul.trim(), id_mapel: meta.id_mapel || null, id_kelas: meta.id_kelas || null, id_materi: meta.id_materi || null, suara, props: bersih };
      const r = await minta("POST", video ? `/video-belajar/${video.id_video}/render` : "/video-belajar/templat", body);
      Swal.fire({ icon: "success", title: "Masuk antrean render", text: r.message });
      onSelesai(r.data);
    } catch (err) { Swal.fire("Belum bisa", err.message, "warning"); setProses(false); }
  };

  const materi = referensi.materi.filter((m) => m.id_mapel === meta.id_mapel && (!meta.id_kelas || !m.id_kelas || m.id_kelas === meta.id_kelas));
  return (
    <>
      <div className="modal d-block" tabIndex={-1} role="dialog" aria-modal="true" aria-label="Buat video dari templat">
        <div className="modal-dialog modal-xl modal-dialog-scrollable">
          <div className="modal-content border-0 shadow">
            <div className="modal-header">
              <h5 className="modal-title fw-bold"><i className="bi bi-magic text-primary me-2"></i>{t ? `Video ${t.nama}` : "Buat video motion graphic"}</h5>
              <button type="button" className="btn-close" onClick={onTutup} disabled={proses} aria-label="Tutup"></button>
            </div>
            <div className="modal-body">
              {!t ? (
                <>
                  <p className="small text-muted">Pilih templat. Isi contoh bisa langsung diubah; pratinjau tampil di sebelah kanan, lalu server membuat narasi suara dan videonya.</p>
                  <div className="row g-3">
                    {TEMPLAT.map((x) => (
                      <div key={x.id} className="col-md-6 col-lg-3">
                        <button type="button" className="card h-100 w-100 text-start shadow-sm pilih-templat" onClick={() => pilihTemplat(x.id)}>
                          <div className="card-body">
                            <div className="fs-2 text-primary"><i className={`bi ${x.ikon}`}></i></div>
                            <div className="fw-semibold">{x.nama}</div>
                            <div className="small text-muted">{x.deskripsi}</div>
                            <div className="small mt-2">Contoh: <i>{x.contoh.judul}</i></div>
                          </div>
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="row g-3">
                  <div className="col-lg-6 order-lg-2">
                    <div className="position-sticky" style={{ top: 0 }}>
                      <Player component={t.komponen} inputProps={bersih} durationInFrames={durasi} fps={FPS} compositionWidth={LEBAR} compositionHeight={TINGGI}
                        controls loop initialFrame={45} style={{ width: "100%", borderRadius: 8, overflow: "hidden" }} acknowledgeRemotionLicense />
                      <div className="small text-muted mt-1"><i className="bi bi-info-circle me-1"></i>Pratinjau tanpa suara · perkiraan {detik(durasi)}. Lama setiap adegan menyesuaikan panjang narasi saat dirender.</div>
                      {durasi / FPS > 150 && <div className="small text-warning-emphasis">Lebih dari 2,5 menit: pertimbangkan membagi menjadi dua video.</div>}
                    </div>
                  </div>
                  <div className="col-lg-6 order-lg-1">
                    <div className="row g-2 mb-2">
                      <div className="col-12">
                        <label className="form-label small fw-semibold mb-0" htmlFor="tpJudul">Judul video</label>
                        <input id="tpJudul" className="form-control" maxLength={120} value={meta.judul} onChange={(e) => setMeta({ ...meta, judul: e.target.value })} />
                      </div>
                      <div className="col-md-4">
                        <label className="form-label small mb-0" htmlFor="tpMapel">Mapel</label>
                        <select id="tpMapel" className="form-select form-select-sm" value={meta.id_mapel} onChange={(e) => setMeta({ ...meta, id_mapel: e.target.value, id_materi: "" })}>
                          <option value="">Umum</option>
                          {referensi.mapel.map((m) => <option key={m.id_mapel} value={m.id_mapel}>{m.nama_mapel}</option>)}
                        </select>
                      </div>
                      <div className="col-md-3">
                        <label className="form-label small mb-0" htmlFor="tpKelas">Kelas</label>
                        <select id="tpKelas" className="form-select form-select-sm" value={meta.id_kelas} onChange={(e) => setMeta({ ...meta, id_kelas: e.target.value })}>
                          <option value="">Semua</option>
                          {referensi.kelas.map((k) => <option key={k.id_kelas} value={k.id_kelas}>{k.nama_kelas}</option>)}
                        </select>
                      </div>
                      <div className="col-md-5">
                        <label className="form-label small mb-0" htmlFor="tpMateri">Materi</label>
                        <select id="tpMateri" className="form-select form-select-sm" value={meta.id_materi} disabled={!meta.id_mapel} onChange={(e) => setMeta({ ...meta, id_materi: e.target.value })}>
                          <option value="">—</option>
                          {materi.map((m) => <option key={m.id_materi} value={m.id_materi}>{m.nama_materi}</option>)}
                        </select>
                      </div>
                      <div className="col-md-8">
                        <label className="form-label small mb-0" htmlFor="tpSuara">Suara narasi</label>
                        <select id="tpSuara" className="form-select form-select-sm" value={suara} onChange={(e) => setSuara(e.target.value)}>
                          {(pilihanSuara.length ? pilihanSuara : [{ kode: "LOKAL", label: "Suara AI lokal (Piper, gratis)", aktif: true }]).map((p) => (
                            <option key={p.kode} value={p.kode} disabled={!p.aktif}>{p.label}{p.aktif ? "" : " — belum tersedia"}</option>
                          ))}
                        </select>
                        {pilihanSuara.find((p) => p.kode === suara)?.catatan && <div className="form-text">{pilihanSuara.find((p) => p.kode === suara).catatan}</div>}
                      </div>
                      <div className="col-md-4">
                        <label className="form-label small mb-0" htmlFor="tpWarna">Warna</label>
                        <input id="tpWarna" type="color" className="form-control form-control-sm form-control-color w-100" value={props.warna || "#f59e0b"} onChange={(e) => setProps({ ...props, warna: e.target.value })} />
                      </div>
                    </div>

                    {props.adegan.map((a, i) => (
                      <div key={i} className="border rounded p-2 mb-2 adegan-templat">
                        <div className="d-flex align-items-center gap-1 mb-1">
                          <b className="small me-auto">Adegan {i + 1}</b>
                          <button type="button" className="btn btn-sm btn-link p-0" disabled={i === 0} onClick={() => geser(i, -1)} aria-label={`Naikkan adegan ${i + 1}`}><i className="bi bi-chevron-up"></i></button>
                          <button type="button" className="btn btn-sm btn-link p-0" disabled={i === props.adegan.length - 1} onClick={() => geser(i, 1)} aria-label={`Turunkan adegan ${i + 1}`}><i className="bi bi-chevron-down"></i></button>
                          <button type="button" className="btn btn-sm btn-link text-danger p-0 ms-1" disabled={props.adegan.length === 1} onClick={() => setProps({ ...props, adegan: props.adegan.filter((_, j) => j !== i) })} aria-label={`Hapus adegan ${i + 1}`}><i className="bi bi-x-lg"></i></button>
                        </div>
                        <IsianAdegan kolom={t.kolom} adegan={a} terakhir={i === props.adegan.length - 1} ubah={(k, v) => ubahAdegan(i, k, v)} />
                      </div>
                    ))}
                    <button type="button" className="btn btn-sm btn-outline-primary" disabled={props.adegan.length >= 15}
                      onClick={() => setProps({ ...props, adegan: [...props.adegan, Object.fromEntries(t.kolom.map((c) => [c.k, c.jenis === "angka" ? c.contoh ?? "" : c.jenis === "centang" ? false : c.jenis === "pilih" ? c.opsi[0][0] : ""]))] })}>
                      <i className="bi bi-plus-lg me-1"></i>Tambah adegan
                    </button>
                    <div className="mt-2">
                      <label className="form-label small mb-0" htmlFor="tpPenutup">Kalimat penutup</label>
                      <input id="tpPenutup" className="form-control form-control-sm" maxLength={120} value={props.penutup?.teks || ""} onChange={(e) => setProps({ ...props, penutup: { teks: e.target.value } })} />
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              {t && !video && <button className="btn btn-outline-secondary me-auto" onClick={() => setIdTemplat(null)} disabled={proses}><i className="bi bi-arrow-left me-1"></i>Ganti templat</button>}
              <button className="btn btn-outline-secondary" onClick={onTutup} disabled={proses}>Batal</button>
              {t && <button className="btn btn-primary" onClick={kirim} disabled={proses}>{proses ? <span className="spinner-border spinner-border-sm me-1"></span> : <i className="bi bi-film me-1"></i>}{video ? "Render ulang" : "Buat video"}</button>}
            </div>
          </div>
        </div>
      </div>
      <div className="modal-backdrop show"></div>
    </>
  );
}
