"use client";
// Editor pas foto siswa: pilih/ambil foto, potong 3 × 4 (geser & perbesar), putar, filter, ganti latar di peramban,
// edit dengan AI penyedia sekolah (dengan persetujuan), simpan, unduh, dan hapus.
import { useCallback, useEffect, useRef, useState } from "react";
import Swal from "sweetalert2";
import { AI_MODES, bacaAiMode, simpanAiMode } from "@/components/banksoal/konstanta";
import {
  MAKS_ASLI, UKURAN, ambilAsli, editFotoAI, gambarPasFoto, gantiLatar, hapusFoto, keBlob, keKanvas, simpanFoto, srcFoto, unduhBlob, unduhFoto,
} from "./fotoSiswa";

const AWAL = { zoom: 1, x: 0, y: 0, putar: 0, terang: 0, kontras: 0, saturasi: 0, hitamPutih: false };
const LATAR = [
  { warna: "#c8102e", label: "Merah" },
  { warna: "#1f5fae", label: "Biru" },
  { warna: "#ffffff", label: "Putih" },
  { warna: "#d9dde3", label: "Abu-abu" },
];
const PERINTAH_AI = [
  "Ganti latar belakang menjadi merah polos (pas foto resmi).",
  "Ganti latar belakang menjadi biru polos (pas foto resmi).",
  "Rapikan pencahayaan dan warna agar wajah terang merata, tanpa mengubah wajah.",
  "Rapikan kerah dan seragam agar terlihat rapi, tanpa mengubah wajah.",
];
const PRATINJAU = { w: 240, h: 320 };

export default function EditorFoto({ siswa, onTutup, onBerubah }) {
  const [sumber, setSumber] = useState(null); // kanvas kerja
  const [asliBaru, setAsliBaru] = useState(null); // File asli yang baru dipilih (ikut disimpan)
  const [atur, setAtur] = useState(AWAL);
  const [proses, setProses] = useState(""); // teks proses yang sedang berjalan
  const [galat, setGalat] = useState("");
  const [tab, setTab] = useState("potong");
  const [aiMode, setAiMode] = useState(() => {
    const m = bacaAiMode();
    return AI_MODES.find((x) => x.value === m)?.gambar ? m : "GEMINI";
  });
  const [perintah, setPerintah] = useState(PERINTAH_AI[0]);
  const [setuju, setSetuju] = useState(false);
  const [riwayat, setRiwayat] = useState([]); // sumber sebelumnya, untuk Urungkan
  const kanvasRef = useRef(null);
  const berkasRef = useRef(null);
  const kameraRef = useRef(null);
  const seret = useRef(null);
  const sibuk = Boolean(proses);

  // Foto yang sudah ada: muat foto aslinya agar bisa dipotong ulang tanpa menurunkan mutu
  useEffect(() => {
    if (!siswa.foto_url) return;
    setProses("Memuat foto…");
    ambilAsli(siswa.id_siswa)
      .then((b) => keKanvas(b))
      .then(setSumber)
      .catch((e) => setGalat(e.message))
      .finally(() => setProses(""));
  }, [siswa.id_siswa, siswa.foto_url]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !sibuk) onTutup(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onTutup, sibuk]);

  // Pratinjau
  useEffect(() => {
    const c = kanvasRef.current;
    if (!c) return;
    c.width = PRATINJAU.w * 2;
    c.height = PRATINJAU.h * 2;
    if (sumber) gambarPasFoto(c, sumber, atur);
    else {
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#f1f3f6";
      ctx.fillRect(0, 0, c.width, c.height);
    }
  }, [sumber, atur]);

  const hasilKanvas = useCallback(() => {
    const c = document.createElement("canvas");
    c.width = UKURAN.w;
    c.height = UKURAN.h;
    gambarPasFoto(c, sumber, atur);
    return c;
  }, [sumber, atur]);

  const gantiSumber = (baru, simpanRiwayat = true) => {
    if (simpanRiwayat && sumber) setRiwayat((r) => [...r.slice(-4), { sumber, atur }]);
    setSumber(baru);
    setAtur(AWAL);
  };

  const pilihBerkas = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { setGalat("Pilih berkas gambar (JPG, PNG, atau WEBP)."); return; }
    setGalat("");
    setProses("Membuka foto…");
    try {
      const kanvas = await keKanvas(file);
      // Asli disimpan juga (diperkecil bila sangat besar) sebagai acuan edit berikutnya
      const asli = file.size > 4 * 1024 * 1024 || !/^image\/(jpeg|png|webp)$/.test(file.type)
        ? new File([await keBlob(await keKanvas(file, MAKS_ASLI), "image/jpeg", 0.9)], "asli.jpg", { type: "image/jpeg" })
        : file;
      setAsliBaru(asli);
      setRiwayat([]);
      gantiSumber(kanvas, false);
    } catch (err) { setGalat(err.message); }
    finally { setProses(""); }
  };

  const ubah = (kunci, nilai) => setAtur((a) => ({ ...a, [kunci]: nilai }));

  // Geser foto dengan jari/tetikus; roda tetikus memperbesar
  const mulaiSeret = (e) => {
    if (!sumber) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    seret.current = { x: e.clientX, y: e.clientY, ax: atur.x, ay: atur.y };
  };
  const geser = (e) => {
    if (!seret.current) return;
    const k = UKURAN.w / e.currentTarget.getBoundingClientRect().width;
    const { x, y, ax, ay } = seret.current;
    setAtur((a) => ({ ...a, x: ax + (e.clientX - x) * k, y: ay + (e.clientY - y) * k }));
  };
  const selesaiSeret = () => { seret.current = null; };
  const roda = (e) => {
    if (!sumber) return;
    setAtur((a) => ({ ...a, zoom: Math.min(4, Math.max(1, a.zoom * (e.deltaY < 0 ? 1.06 : 1 / 1.06))) }));
  };

  const latarPeramban = async (warna) => {
    setGalat("");
    setProses("Memisahkan latar di perangkat ini… (pertama kali butuh mengunduh model ±16 MB)");
    try {
      const baru = await gantiLatar(sumber, warna);
      setRiwayat((r) => [...r.slice(-4), { sumber, atur }]);
      setSumber(baru); // pengaturan potong tetap
    } catch (err) {
      setGalat(`Latar tidak bisa diganti di perangkat ini: ${err.message || err}. Coba lewat AI penyedia sekolah.`);
    } finally { setProses(""); }
  };

  const pakaiAI = async () => {
    if (!setuju) { setGalat("Centang persetujuan pengiriman foto ke penyedia AI terlebih dahulu."); return; }
    setGalat("");
    setProses("AI sedang mengedit foto… (bisa sampai 1 menit)");
    simpanAiMode(aiMode);
    try {
      const blob = await keBlob(hasilKanvas());
      const res = await editFotoAI(siswa.id_siswa, blob, perintah, aiMode);
      gantiSumber(await keKanvas(res.gambar));
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: `Foto diedit AI (${res.model}). Periksa hasilnya sebelum menyimpan.`, showConfirmButton: false, timer: 3500 });
    } catch (err) { setGalat(err.message); }
    finally { setProses(""); }
  };

  const urungkan = () => {
    const akhir = riwayat[riwayat.length - 1];
    if (!akhir) return;
    setRiwayat((r) => r.slice(0, -1));
    setSumber(akhir.sumber);
    setAtur(akhir.atur);
  };

  const simpan = async () => {
    setGalat("");
    setProses("Menyimpan…");
    try {
      const res = await simpanFoto(siswa.id_siswa, await keBlob(hasilKanvas()), asliBaru);
      onBerubah?.(res.foto_url);
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: "Pas foto tersimpan", showConfirmButton: false, timer: 2000 });
      onTutup();
    } catch (err) { setGalat(err.message); setProses(""); }
  };

  const hapus = async () => {
    const ok = await Swal.fire({ title: "Hapus pas foto?", text: `Foto ${siswa.nama_siswa} hilang dari rapor dan portal.`, icon: "warning", showCancelButton: true, confirmButtonText: "Hapus", cancelButtonText: "Batal", confirmButtonColor: "#dc3545" });
    if (!ok.isConfirmed) return;
    setProses("Menghapus…");
    try {
      await hapusFoto(siswa.id_siswa);
      onBerubah?.(null);
      onTutup();
    } catch (err) { setGalat(err.message); setProses(""); }
  };

  const unduhHasil = async () => unduhBlob(await keBlob(hasilKanvas()), `Pas foto ${siswa.nama_siswa}.jpg`);

  const geserTombol = (label, kunci, min, max, langkah = 1) => (
    <div className="mb-2">
      <label className="form-label small d-flex justify-content-between mb-0">
        <span>{label}</span><span className="text-muted">{kunci === "zoom" ? `${atur.zoom.toFixed(2)}×` : atur[kunci]}</span>
      </label>
      <input type="range" className="form-range" min={min} max={max} step={langkah} value={atur[kunci]} disabled={!sumber || sibuk}
        aria-label={label} onChange={(e) => ubah(kunci, Number(e.target.value))} />
    </div>
  );

  return (
    <>
      <div className="modal d-block" tabIndex={-1} role="dialog" aria-modal="true" aria-label="Pas foto siswa" style={{ zIndex: 1065 }} data-editor-foto>
        <div className="modal-dialog modal-lg modal-dialog-scrollable modal-fullscreen-sm-down">
          <div className="modal-content border-0 shadow">
            <div className="modal-header">
              <h5 className="modal-title fw-bold"><i className="bi bi-person-bounding-box text-primary me-2"></i>Pas foto · {siswa.nama_siswa}</h5>
              <button type="button" className="btn-close" onClick={onTutup} disabled={sibuk} aria-label="Tutup"></button>
            </div>
            <div className="modal-body">
              <div className="row g-3">
                <div className="col-md-5 text-center">
                  <canvas ref={kanvasRef} className="border rounded shadow-sm" data-pratinjau-foto
                    style={{ width: PRATINJAU.w, height: PRATINJAU.h, maxWidth: "100%", aspectRatio: "3 / 4", touchAction: "none", cursor: sumber ? "grab" : "default", background: "#f1f3f6" }}
                    onPointerDown={mulaiSeret} onPointerMove={geser} onPointerUp={selesaiSeret} onPointerCancel={selesaiSeret} onWheel={roda}
                    aria-label="Pratinjau pas foto. Seret untuk menggeser." />
                  <div className="small text-muted mt-1">{sumber ? "Seret foto untuk menggeser; roda tetikus atau penggeser untuk memperbesar." : "Belum ada foto."}</div>
                  <div className="d-flex flex-wrap justify-content-center gap-2 mt-2">
                    <button type="button" className="btn btn-sm btn-primary" onClick={() => berkasRef.current?.click()} disabled={sibuk}>
                      <i className="bi bi-upload me-1"></i>{sumber ? "Ganti foto" : "Pilih foto"}
                    </button>
                    <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => kameraRef.current?.click()} disabled={sibuk}>
                      <i className="bi bi-camera me-1"></i>Kamera
                    </button>
                    <input ref={berkasRef} type="file" accept="image/jpeg,image/png,image/webp,image/*" className="d-none" onChange={pilihBerkas} data-pilih-foto />
                    <input ref={kameraRef} type="file" accept="image/*" capture="user" className="d-none" onChange={pilihBerkas} />
                  </div>
                </div>
                <div className="col-md-7">
                  <ul className="nav nav-tabs nav-fill small mb-2">
                    {[["potong", "bi-crop", "Potong"], ["warna", "bi-sliders", "Filter"], ["latar", "bi-palette", "Latar"], ["ai", "bi-stars", "AI"]].map(([id, ikon, label]) => (
                      <li className="nav-item" key={id}>
                        <button type="button" className={`nav-link ${tab === id ? "active" : ""}`} onClick={() => setTab(id)}><i className={`bi ${ikon} me-1`}></i>{label}</button>
                      </li>
                    ))}
                  </ul>
                  {tab === "potong" && (
                    <div>
                      {geserTombol("Perbesar", "zoom", 1, 4, 0.01)}
                      {geserTombol("Putar halus (derajat)", "putar", -45, 45)}
                      <div className="d-flex flex-wrap gap-2">
                        <button type="button" className="btn btn-sm btn-outline-secondary" disabled={!sumber || sibuk} onClick={() => ubah("putar", ((atur.putar - 90 + 180) % 360) - 180)}><i className="bi bi-arrow-counterclockwise me-1"></i>Putar kiri</button>
                        <button type="button" className="btn btn-sm btn-outline-secondary" disabled={!sumber || sibuk} onClick={() => ubah("putar", ((atur.putar + 90 + 180) % 360) - 180)}><i className="bi bi-arrow-clockwise me-1"></i>Putar kanan</button>
                        <button type="button" className="btn btn-sm btn-outline-secondary" disabled={!sumber || sibuk} onClick={() => setAtur((a) => ({ ...a, zoom: 1, x: 0, y: 0, putar: 0 }))}>Atur ulang</button>
                      </div>
                      <div className="small text-muted mt-2">Hasil disimpan ukuran 3 × 4 ({UKURAN.w} × {UKURAN.h} piksel), cukup tajam untuk dicetak di rapor.</div>
                    </div>
                  )}
                  {tab === "warna" && (
                    <div>
                      {geserTombol("Kecerahan", "terang", -60, 60)}
                      {geserTombol("Kontras", "kontras", -60, 60)}
                      {geserTombol("Saturasi", "saturasi", -100, 60)}
                      <div className="form-check form-switch mb-2">
                        <input className="form-check-input" type="checkbox" id="foto-hitam-putih" checked={atur.hitamPutih} disabled={!sumber || sibuk} onChange={(e) => ubah("hitamPutih", e.target.checked)} />
                        <label className="form-check-label small" htmlFor="foto-hitam-putih">Hitam putih</label>
                      </div>
                      <button type="button" className="btn btn-sm btn-outline-secondary" disabled={!sumber || sibuk} onClick={() => setAtur((a) => ({ ...a, terang: 0, kontras: 0, saturasi: 0, hitamPutih: false }))}>Hapus filter</button>
                    </div>
                  )}
                  {tab === "latar" && (
                    <div>
                      <p className="small mb-2">Latar diganti warna polos <b>di perangkat ini</b>; foto tidak dikirim ke layanan mana pun. Paling rapi untuk foto dengan latar yang kontras dengan rambut dan baju.</p>
                      <div className="d-flex flex-wrap gap-2">
                        {LATAR.map((l) => (
                          <button key={l.warna} type="button" className="btn btn-sm btn-light border d-flex align-items-center gap-2" disabled={!sumber || sibuk} onClick={() => latarPeramban(l.warna)}>
                            <span className="rounded-circle border d-inline-block" style={{ width: 16, height: 16, background: l.warna }}></span>{l.label}
                          </button>
                        ))}
                      </div>
                      <div className="small text-muted mt-2">Hasil kurang rapi (misalnya rambut terpotong)? Pakai <b>Urungkan</b>, lalu coba tab AI.</div>
                    </div>
                  )}
                  {tab === "ai" && (
                    <div>
                      <div className="alert alert-warning small py-2 mb-2">
                        <i className="bi bi-shield-exclamation me-1"></i>Foto dikirim ke penyedia AI pihak ketiga yang dipakai sekolah (mis. Google Gemini). Foto ini wajah anak: gunakan hanya bila perlu, dan periksa hasilnya sebelum disimpan.
                      </div>
                      <div className="row g-2 mb-2">
                        <div className="col-sm-5">
                          <label className="form-label small mb-1">Penyedia</label>
                          <select className="form-select form-select-sm" value={aiMode} onChange={(e) => setAiMode(e.target.value)} disabled={sibuk}>
                            {AI_MODES.filter((m) => m.gambar).map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                          </select>
                        </div>
                        <div className="col-sm-7">
                          <label className="form-label small mb-1">Perintah cepat</label>
                          <select className="form-select form-select-sm" value={PERINTAH_AI.includes(perintah) ? perintah : ""} onChange={(e) => e.target.value && setPerintah(e.target.value)} disabled={sibuk}>
                            <option value="">(perintah sendiri)</option>
                            {PERINTAH_AI.map((p) => <option key={p} value={p}>{p}</option>)}
                          </select>
                        </div>
                      </div>
                      <textarea className="form-control form-control-sm mb-2" rows={2} maxLength={500} value={perintah} onChange={(e) => setPerintah(e.target.value)} disabled={sibuk} aria-label="Perintah edit foto untuk AI" />
                      <div className="form-check mb-2">
                        <input className="form-check-input" type="checkbox" id="foto-setuju-ai" checked={setuju} onChange={(e) => setSetuju(e.target.checked)} disabled={sibuk} />
                        <label className="form-check-label small" htmlFor="foto-setuju-ai">Saya setuju foto ini dikirim ke penyedia AI untuk diedit.</label>
                      </div>
                      <button type="button" className="btn btn-sm btn-primary" disabled={!sumber || sibuk || perintah.trim().length < 5} onClick={pakaiAI}><i className="bi bi-stars me-1"></i>Edit dengan AI</button>
                    </div>
                  )}
                  {proses && <div className="alert alert-info small py-2 mt-3 mb-0"><span className="spinner-border spinner-border-sm me-2"></span>{proses}</div>}
                  {galat && <div className="alert alert-danger small py-2 mt-3 mb-0" role="alert">{galat}</div>}
                </div>
              </div>
            </div>
            <div className="modal-footer flex-wrap">
              {siswa.foto_url && <button type="button" className="btn btn-outline-danger btn-sm me-auto" onClick={hapus} disabled={sibuk}><i className="bi bi-trash me-1"></i>Hapus foto</button>}
              <button type="button" className="btn btn-light btn-sm" onClick={urungkan} disabled={!riwayat.length || sibuk}><i className="bi bi-arrow-90deg-left me-1"></i>Urungkan</button>
              {siswa.foto_url && !sumber && <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => unduhFoto(siswa).catch((e) => setGalat(e.message))} disabled={sibuk}><i className="bi bi-download me-1"></i>Unduh</button>}
              {sumber && <button type="button" className="btn btn-outline-secondary btn-sm" onClick={unduhHasil} disabled={sibuk}><i className="bi bi-download me-1"></i>Unduh hasil</button>}
              <button type="button" className="btn btn-success btn-sm" onClick={simpan} disabled={!sumber || sibuk}><i className="bi bi-check2-circle me-1"></i>Simpan foto</button>
            </div>
          </div>
        </div>
      </div>
      <div className="modal-backdrop show" style={{ zIndex: 1060 }}></div>
    </>
  );
}

/** Kotak pas foto kecil (menu Siswa, portal, dashboard pribadi). */
export function FotoKecil({ siswa, ukuran = 40, className = "" }) {
  const src = srcFoto(siswa?.foto_url);
  const h = Math.round((ukuran * 4) / 3);
  return src
    ? <img src={src} alt={`Foto ${siswa.nama_siswa}`} width={ukuran} height={h} className={`rounded border object-fit-cover ${className}`} style={{ width: ukuran, height: h }} />
    : <span className={`rounded border bg-body-tertiary d-inline-flex align-items-center justify-content-center text-secondary ${className}`} style={{ width: ukuran, height: h }}><i className="bi bi-person"></i></span>;
}
