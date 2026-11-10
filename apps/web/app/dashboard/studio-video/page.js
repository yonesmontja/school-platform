"use client";
// Studio Rakit Video (D1): pembuat video yang ditunjuk admin merakit video motion graphic per adegan — latar, teks,
// emoji, gambar, bentuk, animasi masuk & gerak, transisi, narasi (suara AI + subtitle), merek sekolah, 4 rasio —
// lalu mengirim naskahnya ke antrean render di server. Naskah JSON tidak terikat mesin render (Remotion/Revideo).
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import Swal from "sweetalert2";
import { API_URL, authHeaders } from "@/app/lib/akses";
import { API_ORIGIN } from "@/app/lib/config";
import { minta } from "@/components/banksoal/api";
import { AI_MODES, bacaAiMode, simpanAiMode } from "@/components/banksoal/konstanta";
import { FPS, RASIO, ukuranRasio } from "@/components/video/templat/index.js";
import { NASKAH_CONTOH, Rakitan, adeganBaru, awalAdegan, detikAdeganRakitan, elemenBaru, hitungDurasiRakitan, idBaru } from "@/components/video/templat/rakitan.jsx";
import { PanelAdegan, PanelElemen, PanelMerek, PanelMusik } from "@/components/video/studio/PanelStudio";
import Timeline from "@/components/video/studio/Timeline";

const Player = dynamic(() => import("@remotion/player").then((m) => m.Player), { ssr: false, loading: () => <div className="w-100 h-100 bg-dark"></div> });
const KUNCI_DRAF = "studio-video-draf";
const salin = (x) => JSON.parse(JSON.stringify(x));
const toast = (title, icon = "success") => Swal.fire({ toast: true, position: "top-end", icon, title, showConfirmButton: false, timer: 2500 });
const KATEGORI_TEMPLAT = [["PEMBELAJARAN", "Pembelajaran"], ["PROMOSI", "PPDB & promosi"], ["PENGUMUMAN", "Pengumuman"], ["HARI_BESAR", "Hari besar"], ["PRESTASI", "Prestasi"], ["LAINNYA", "Lainnya"]];
const TUJUAN = [
  ["PEMBELAJARAN", "Pembelajaran", "Tampil di Portal Siswa dan bisa ditautkan ke modul ajar setelah disetujui."],
  ["PROMOSI", "Promosi / PPDB", "Untuk dibagikan ke media sosial; tidak tampil di Portal Siswa. Foto siswa wajib berizin orang tua."],
  ["PENGUMUMAN", "Pengumuman", "Untuk grup orang tua & media sosial; tidak tampil di Portal Siswa."],
  ["ACARA", "Acara / kegiatan", "Liputan kegiatan sekolah; tidak tampil di Portal Siswa. Foto siswa wajib berizin orang tua."],
];
const bacaDraf = () => { try { return JSON.parse(localStorage.getItem(KUNCI_DRAF) || "null"); } catch { return null; } };

/** Perkiraan tinggi kotak teks (% bingkai) untuk kotak pilih di kanvas. */
function tinggiTeks(e, lebar, tinggi) {
  const k = Math.min(lebar, tinggi) / 720;
  const px = (e.gaya?.ukuran || 60) * k;
  const lebarKotak = (e.w / 100) * lebar;
  const baris = String(e.isi || " ").split("\n").reduce((n, b) => n + Math.max(1, Math.ceil((b.length * px * 0.56) / Math.max(1, lebarKotak))), 0);
  const pad = e.gaya?.latar ? px * 0.5 : 0;
  return ((baris * px * 1.18 + pad) / tinggi) * 100;
}

function Studio() {
  const params = useSearchParams();
  const idVideo = params.get("video");
  const [atur, setAtur] = useState(null);
  const [referensi, setReferensi] = useState(null);
  const [suaraList, setSuaraList] = useState([]);
  const [riwayat, setRiwayat] = useState({ lalu: [], nanti: [] });
  const [naskah, setNaskahMentah] = useState(null);
  const [meta, setMeta] = useState({ judul: "", deskripsi: "", id_mapel: "", id_kelas: "", suara: "LOKAL", tujuan: "PEMBELAJARAN" });
  const [waktu, setWaktu] = useState(null); // detik dalam adegan yang ditampilkan kanvas (null = saat semua elemen sudah muncul)
  const [templat, setTemplat] = useState(false);
  const [papan, setPapan] = useState(false);
  const [adeganAktif, setAdeganAktif] = useState(0);
  const [pilih, setPilih] = useState(null); // id elemen
  const [tab, setTab] = useState("properti");
  const [pratinjau, setPratinjau] = useState(false);
  const [garisAman, setGarisAman] = useState(true);
  const [kirim, setKirim] = useState(false);
  const player = useRef(null);
  const [playerKe, setPlayerKe] = useState(0); // naik setiap Player (dimuat dinamis) siap, agar kanvas melompat ke adegan aktif
  const pasangPlayer = useCallback((r) => { if (r && r !== player.current) { player.current = r; setPlayerKe((x) => x + 1); } }, []);
  const kanvas = useRef(null);
  const tarik = useRef(null);

  // ===== Muat =====
  const muatAtur = useCallback(() => minta("GET", "/video-belajar/studio").then((r) => setAtur(r.data)).catch((e) => Swal.fire("Gagal memuat", e.message, "error")), []);
  useEffect(() => {
    muatAtur();
    minta("GET", "/perangkat-ajar/referensi").then(setReferensi).catch(() => {});
    minta("GET", "/video-belajar/suara").then((r) => setSuaraList(r.data)).catch(() => {});
  }, [muatAtur]);
  useEffect(() => {
    if (!atur || naskah) return;
    if (idVideo) {
      minta("GET", `/video-belajar/${idVideo}`).then((r) => {
        const v = r.data;
        setNaskahMentah(v.props?.adegan ? salin(v.props) : salin(NASKAH_CONTOH));
        setMeta({ judul: v.judul, deskripsi: v.deskripsi || "", id_mapel: v.id_mapel || "", id_kelas: v.id_kelas || "", suara: v.suara || "LOKAL", tujuan: v.tujuan || "PEMBELAJARAN" });
      }).catch((e) => Swal.fire("Gagal memuat video", e.message, "error"));
      return;
    }
    const draf = bacaDraf();
    const awal = draf?.naskah || { ...salin(NASKAH_CONTOH), merek: { ...NASKAH_CONTOH.merek, ...atur.merek, warna: atur.merek?.warna?.length ? atur.merek.warna : NASKAH_CONTOH.merek.warna } };
    setNaskahMentah(awal);
    if (draf?.meta) setMeta(draf.meta);
  }, [atur, idVideo, naskah]);
  // Simpan draf otomatis (per perangkat) untuk naskah baru
  useEffect(() => {
    if (!naskah || idVideo) return;
    const t = setTimeout(() => { try { localStorage.setItem(KUNCI_DRAF, JSON.stringify({ naskah, meta })); } catch { /* penyimpanan diblokir */ } }, 600);
    return () => clearTimeout(t);
  }, [naskah, meta, idVideo]);

  // ===== Riwayat (undo/redo) =====
  // Naskah terbaru juga disimpan di ref agar perubahan beruntun (mis. saat menggeser) tidak saling menimpa
  const acuan = useRef(null);
  const setNaskah = (n) => { acuan.current = n; setNaskahMentah(n); };
  useEffect(() => { acuan.current = naskah; }, [naskah]);
  const ubahNaskah = (fn, catat = true) => {
    const lama = acuan.current;
    const baru = fn(salin(lama));
    if (catat) setRiwayat((r) => ({ lalu: [...r.lalu.slice(-49), lama], nanti: [] }));
    setNaskah(baru);
  };
  const catatSekarang = () => { const lama = acuan.current; setRiwayat((r) => ({ lalu: [...r.lalu.slice(-49), lama], nanti: [] })); };
  const undo = () => {
    if (!riwayat.lalu.length) return;
    setRiwayat({ lalu: riwayat.lalu.slice(0, -1), nanti: [acuan.current, ...riwayat.nanti] });
    setNaskah(riwayat.lalu[riwayat.lalu.length - 1]);
  };
  const redo = () => {
    if (!riwayat.nanti.length) return;
    setRiwayat({ lalu: [...riwayat.lalu, acuan.current], nanti: riwayat.nanti.slice(1) });
    setNaskah(riwayat.nanti[0]);
  };

  const adegan = naskah?.adegan?.[adeganAktif];
  const elemen = adegan?.elemen?.find((e) => e.id === pilih) || null;
  const bingkai = ukuranRasio(naskah?.rasio);
  const palet = naskah?.merek?.warna || [];
  const inputProps = useMemo(() => (naskah ? { ...naskah, asetDasar: API_ORIGIN } : null), [naskah]);
  const durasi = naskah ? hitungDurasiRakitan(naskah) : 1;
  const awal = useMemo(() => (naskah ? awalAdegan(naskah) : []), [naskah]);

  const ubahAdegan = (x, catat = true) => ubahNaskah((n) => { Object.assign(n.adegan[adeganAktif], x); return n; }, catat);
  const ubahElemen = (id, x, catat = true) => ubahNaskah((n) => {
    const e = n.adegan[adeganAktif].elemen.find((el) => el.id === id);
    if (e) Object.assign(e, x);
    return n;
  }, catat);

  // Kanvas menampilkan adegan aktif pada saat semua elemennya sudah muncul
  useEffect(() => {
    if (!naskah || pratinjau || !player.current) return;
    const a = naskah.adegan[adeganAktif];
    if (!a) return;
    const panjang = Math.round(detikAdeganRakitan(a) * FPS);
    // Bawaan: saat semua elemen sudah muncul (sebelum ada yang hilang); atau detik pilihan di timeline
    const muncul = Math.max(0, ...(a.elemen || []).filter((e) => e.keluar?.pada == null).map((e) => (e.masuk?.mulai || 0) + (e.masuk?.durasi || 0.6)));
    const f = waktu != null ? Math.round(waktu * FPS) : Math.round(muncul * FPS) + 3;
    player.current.pause();
    player.current.seekTo(awal[adeganAktif] + Math.min(panjang - 1, f));
  }, [naskah, adeganAktif, pratinjau, awal, playerKe, waktu]);
  useEffect(() => { setWaktu(null); }, [adeganAktif]);

  // ===== Aset =====
  const unggah = async (file, jenis = "gambar") => {
    const fd = new FormData();
    fd.append(jenis, file);
    if (jenis === "gambar") {
      // Foto siswa di video publik (promosi, pengumuman, acara) wajib berizin orang tua (UU Pelindungan Data Pribadi)
      const { value, isConfirmed } = await Swal.fire({
        title: "Apakah gambar ini memuat foto siswa?", input: "radio", inputValue: "tidak",
        inputOptions: { tidak: "Tidak", izin: "Ya, orang tua sudah memberi izin", belum: "Ya, belum ada izin orang tua" },
        confirmButtonText: "Unggah", showCancelButton: true, cancelButtonText: "Batal",
      });
      if (!isConfirmed) return null;
      fd.append("foto_siswa", value !== "tidak" ? "1" : "0");
      fd.append("izin_ortu", value === "izin" ? "1" : "0");
    }
    try {
      const res = await fetch(`${API_URL}/video-belajar/aset`, { method: "POST", headers: authHeaders(false), body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((d.errors && Object.values(d.errors)[0]?.[0]) || d.message || "Berkas gagal diunggah.");
      return d.url;
    } catch (e) { Swal.fire("Gagal", e.message, "error"); return null; }
  };

  // ===== Aksi elemen & adegan =====
  const tambahElemen = async (tipe) => {
    const e = elemenBaru(tipe, palet[0]);
    if (tipe === "gambar") {
      const f = await new Promise((ok) => { const i = Object.assign(document.createElement("input"), { type: "file", accept: "image/png,image/jpeg,image/webp" }); i.onchange = () => ok(i.files?.[0]); i.click(); });
      if (!f) return;
      e.isi = await unggah(f);
      if (!e.isi) return;
    }
    ubahNaskah((n) => { n.adegan[adeganAktif].elemen.push(e); return n; });
    setPilih(e.id); setTab("properti");
  };
  const aksiElemen = (jenis) => {
    if (!elemen) return;
    ubahNaskah((n) => {
      const daftar = n.adegan[adeganAktif].elemen;
      const i = daftar.findIndex((e) => e.id === pilih);
      if (jenis === "hapus") daftar.splice(i, 1);
      if (jenis === "salin") { const c = { ...salin(daftar[i]), id: idBaru(), x: Math.min(95, daftar[i].x + 4), y: Math.min(95, daftar[i].y + 4) }; daftar.splice(i + 1, 0, c); setTimeout(() => setPilih(c.id), 0); }
      if (jenis === "depan" && i < daftar.length - 1) [daftar[i], daftar[i + 1]] = [daftar[i + 1], daftar[i]];
      if (jenis === "belakang" && i > 0) [daftar[i], daftar[i - 1]] = [daftar[i - 1], daftar[i]];
      return n;
    });
    if (jenis === "hapus") setPilih(null);
  };
  const aksiAdegan = (jenis, i = adeganAktif) => {
    ubahNaskah((n) => {
      if (jenis === "tambah") n.adegan.splice(i + 1, 0, adeganBaru(palet[0] ? `${palet[0]}33` : undefined));
      if (jenis === "salin") n.adegan.splice(i + 1, 0, { ...salin(n.adegan[i]), elemen: n.adegan[i].elemen.map((e) => ({ ...salin(e), id: idBaru() })) });
      if (jenis === "hapus" && n.adegan.length > 1) n.adegan.splice(i, 1);
      if (jenis === "naik" && i > 0) [n.adegan[i], n.adegan[i - 1]] = [n.adegan[i - 1], n.adegan[i]];
      if (jenis === "turun" && i < n.adegan.length - 1) [n.adegan[i], n.adegan[i + 1]] = [n.adegan[i + 1], n.adegan[i]];
      return n;
    });
    setPilih(null);
    if (jenis === "tambah" || jenis === "salin") setAdeganAktif(i + 1);
    if (jenis === "hapus") setAdeganAktif(Math.max(0, i - 1));
    if (jenis === "naik") setAdeganAktif(Math.max(0, i - 1));
    if (jenis === "turun") setAdeganAktif(Math.min(naskah.adegan.length - 1, i + 1));
  };

  // ===== Geser & ubah ukuran di kanvas =====
  const mulaiTarik = (ev, e, mode) => {
    ev.stopPropagation(); ev.preventDefault();
    setPilih(e.id); setTab("properti");
    const r = kanvas.current.getBoundingClientRect();
    tarik.current = { id: e.id, mode, sx: ev.clientX, sy: ev.clientY, x: e.x, y: e.y, w: e.w, h: e.h, r, catat: false };
    ev.currentTarget.setPointerCapture?.(ev.pointerId);
  };
  const gerakTarik = (ev) => {
    const t = tarik.current;
    if (!t) return;
    const dx = ((ev.clientX - t.sx) / t.r.width) * 100, dy = ((ev.clientY - t.sy) / t.r.height) * 100;
    if (!t.catat && Math.abs(dx) + Math.abs(dy) > 0.3) { catatSekarang(); t.catat = true; }
    if (!t.catat) return;
    const bulat = (v) => Math.round(v * 10) / 10;
    if (t.mode === "geser") {
      let x = t.x + dx, y = t.y + dy;
      if (Math.abs(x - 50) < 1.5) x = 50; // menempel ke garis tengah
      if (Math.abs(y - 50) < 1.5) y = 50;
      ubahElemen(t.id, { x: bulat(x), y: bulat(y) }, false);
    } else {
      ubahElemen(t.id, { w: bulat(Math.max(3, t.w + dx * 2)), h: bulat(Math.max(3, t.h + dy * 2)) }, false);
    }
  };
  const selesaiTarik = () => { tarik.current = null; };

  // Pintasan papan ketik
  useEffect(() => {
    const tekan = (ev) => {
      if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) || !naskah) return;
      const ctrl = ev.ctrlKey || ev.metaKey;
      if (ctrl && ev.key.toLowerCase() === "z") { ev.preventDefault(); ev.shiftKey ? redo() : undo(); return; }
      if (ctrl && ev.key.toLowerCase() === "y") { ev.preventDefault(); redo(); return; }
      if (!elemen) return;
      if (ev.key === "Delete" || ev.key === "Backspace") { ev.preventDefault(); aksiElemen("hapus"); }
      else if (ctrl && ev.key.toLowerCase() === "d") { ev.preventDefault(); aksiElemen("salin"); }
      else if (ev.key.startsWith("Arrow")) {
        ev.preventDefault();
        const s = ev.shiftKey ? 2 : 0.5;
        const d = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, -s], ArrowDown: [0, s] }[ev.key];
        ubahElemen(elemen.id, { x: Math.round((elemen.x + d[0]) * 10) / 10, y: Math.round((elemen.y + d[1]) * 10) / 10 });
      } else if (ev.key === "Escape") setPilih(null);
    };
    window.addEventListener("keydown", tekan);
    return () => window.removeEventListener("keydown", tekan);
  });

  // ===== Pratinjau & render =====
  const putar = (dariAdegan) => {
    setPratinjau(true); setPilih(null);
    setTimeout(() => { player.current?.seekTo(dariAdegan ? awal[adeganAktif] : 0); player.current?.play(); }, 50);
  };
  const simpanMerekSekolah = async () => {
    try { await minta("PUT", "/video-belajar/studio", { merek: naskah.merek }); toast("Merek sekolah disimpan"); muatAtur(); } catch (e) { Swal.fire("Gagal", e.message, "error"); }
  };
  const aturStudio = async (x) => {
    try { const r = await minta("PUT", "/video-belajar/studio", x); toast(r.message); muatAtur(); } catch (e) { Swal.fire("Gagal", e.message, "error"); }
  };
  const naskahBaru = async () => {
    const ok = await Swal.fire({ title: "Mulai naskah baru?", text: "Draf yang sedang dirakit diganti contoh awal.", icon: "question", showCancelButton: true, confirmButtonText: "Mulai baru", cancelButtonText: "Batal" });
    if (!ok.isConfirmed) return;
    catatSekarang();
    setNaskah({ ...salin(NASKAH_CONTOH), merek: { ...NASKAH_CONTOH.merek, ...atur.merek } });
    setAdeganAktif(0); setPilih(null);
  };

  if (!atur) return <div className="container-fluid text-muted small py-4"><span className="spinner-border spinner-border-sm me-2"></span>Memuat Studio…</div>;

  const kartuAtur = atur.atur && (
    <div className="card shadow-sm mb-3"><div className="card-body py-2">
      <div className="row g-2 align-items-end">
        <div className="col-md-5">
          <label className="form-label small mb-1 fw-semibold" htmlFor="stPembuat">Pembuat video motion graphic (1 pengguna)</label>
          <select id="stPembuat" className="form-select form-select-sm" value={atur.id_pembuat || ""} onChange={(e) => aturStudio({ id_pembuat: e.target.value ? Number(e.target.value) : null })}>
            <option value="">— Belum ditunjuk —</option>
            {atur.kandidat.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
          </select>
        </div>
        <div className="col-md-4">
          <label className="form-label small mb-1 fw-semibold" htmlFor="stMesin">Mesin render</label>
          <select id="stMesin" className="form-select form-select-sm" value={atur.mesin} onChange={(e) => aturStudio({ mesin: e.target.value })}>
            {atur.mesin_tersedia.map((m) => <option key={m.kode} value={m.kode} disabled={!m.aktif && atur.mesin !== m.kode}>{m.nama}{m.aktif ? "" : " — belum tersedia"}</option>)}
          </select>
        </div>
        <div className="col-md-3 small text-body-secondary">Naskah video sama untuk semua mesin, jadi bisa pindah mesin kapan saja.</div>
      </div>
    </div></div>
  );

  if (!atur.boleh) {
    return (
      <div className="container-fluid mb-5">
        <h3 className="fw-bold text-primary mb-3"><i className="bi bi-easel3 me-2"></i>Studio Rakit Video</h3>
        {kartuAtur}
        <div className="alert alert-light border"><i className="bi bi-lock me-1"></i>Studio Rakit Video hanya dipakai oleh pembuat video yang ditunjuk admin
          {atur.pembuat ? <> (saat ini: <b>{atur.pembuat.name}</b>)</> : " (belum ditunjuk)"}.{atur.atur && " Untuk merakit sendiri, tunjuk akun Anda di atas."}</div>
      </div>
    );
  }
  if (!naskah) return <div className="container-fluid text-muted small py-4"><span className="spinner-border spinner-border-sm me-2"></span>Menyiapkan naskah…</div>;

  const tegak = bingkai.tinggi > bingkai.lebar;
  const lebarKanvas = tegak ? 340 : bingkai.lebar === bingkai.tinggi ? 480 : 640;

  return (
    <div className="container-fluid mb-5 studio">
      <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
        <h3 className="fw-bold text-primary mb-0 me-2"><i className="bi bi-easel3 me-2"></i>Studio Rakit Video</h3>
        <input className="form-control form-control-sm fw-semibold" style={{ maxWidth: 320 }} aria-label="Judul video" maxLength={120} value={naskah.judul}
          onChange={(e) => ubahNaskah((n) => ({ ...n, judul: e.target.value }), false)} placeholder="Judul video" />
        <div className="btn-group btn-group-sm" role="group" aria-label="Rasio aspek">
          {Object.keys(RASIO).map((r) => <button key={r} type="button" className={`btn ${naskah.rasio === r ? "btn-primary" : "btn-outline-primary"}`} onClick={() => ubahNaskah((n) => ({ ...n, rasio: r }))}>{r}</button>)}
        </div>
        <div className="btn-group btn-group-sm">
          <button type="button" className="btn btn-outline-secondary" onClick={undo} disabled={!riwayat.lalu.length} title="Batalkan (Ctrl+Z)" aria-label="Batalkan"><i className="bi bi-arrow-counterclockwise"></i></button>
          <button type="button" className="btn btn-outline-secondary" onClick={redo} disabled={!riwayat.nanti.length} title="Ulangi (Ctrl+Y)" aria-label="Ulangi"><i className="bi bi-arrow-clockwise"></i></button>
        </div>
        <div className="form-check form-switch m-0">
          <input className="form-check-input" type="checkbox" role="switch" id="stSub" checked={!!naskah.subtitle} onChange={(e) => ubahNaskah((n) => ({ ...n, subtitle: e.target.checked }))} />
          <label className="form-check-label small" htmlFor="stSub">Subtitle</label>
        </div>
        <span className="small text-body-secondary">{naskah.adegan.length} adegan · {Math.round(durasi / FPS)} detik</span>
        <div className="ms-auto d-flex gap-2">
          {!idVideo && <button type="button" className="btn btn-sm btn-outline-secondary" onClick={naskahBaru}><i className="bi bi-file-earmark-plus me-1"></i>Baru</button>}
          <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => setPapan(true)}><i className="bi bi-stars me-1"></i>Papan cerita AI</button>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setTemplat(true)}><i className="bi bi-collection me-1"></i>Templat</button>
          <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => putar(false)}><i className="bi bi-play-fill me-1"></i>Putar semua</button>
          <button type="button" className="btn btn-sm btn-primary" onClick={() => { setMeta((m) => ({ ...m, judul: m.judul || naskah.judul })); setKirim(true); }}><i className="bi bi-film me-1"></i>{idVideo ? "Render ulang" : "Render video"}</button>
        </div>
      </div>
      {kartuAtur}

      <div className="studio-tata">
        {/* Daftar adegan */}
        <div className="studio-adegan card shadow-sm">
          <div className="card-header py-2 d-flex align-items-center"><span className="fw-semibold small">Adegan</span>
            <button type="button" className="btn btn-sm btn-primary ms-auto py-0" onClick={() => aksiAdegan("tambah", naskah.adegan.length - 1)} aria-label="Tambah adegan"><i className="bi bi-plus-lg"></i></button></div>
          <div className="list-group list-group-flush studio-gulir">
            {naskah.adegan.map((a, i) => (
              <div key={i} role="button" tabIndex={0} className={`list-group-item list-group-item-action small py-2 ${i === adeganAktif ? "active" : ""}`}
                onClick={() => { setAdeganAktif(i); setPilih(null); setPratinjau(false); }} onKeyDown={(e) => e.key === "Enter" && setAdeganAktif(i)} aria-label={`Adegan ${i + 1}`}>
                <div className="d-flex align-items-center gap-2">
                  <span className="studio-mini" style={{ background: a.latar?.tipe === "gradien" ? `linear-gradient(135deg, ${a.latar.warna}, ${a.latar.warna2})` : a.latar?.warna || "#ccc" }}>{i + 1}</span>
                  <div className="min-w-0 flex-grow-1">
                    <div className="text-truncate">{a.narasi || a.elemen.find((e) => e.tipe === "teks")?.isi || "Adegan kosong"}</div>
                    <div className="opacity-75">{Math.round(detikAdeganRakitan(a) * 10) / 10} dtk · {a.elemen.length} elemen</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="card-footer py-1 d-flex gap-1 justify-content-center">
            <button type="button" className="btn btn-sm btn-light" onClick={() => aksiAdegan("naik")} disabled={adeganAktif === 0} title="Naikkan" aria-label="Naikkan adegan"><i className="bi bi-arrow-up"></i></button>
            <button type="button" className="btn btn-sm btn-light" onClick={() => aksiAdegan("turun")} disabled={adeganAktif === naskah.adegan.length - 1} title="Turunkan" aria-label="Turunkan adegan"><i className="bi bi-arrow-down"></i></button>
            <button type="button" className="btn btn-sm btn-light" onClick={() => aksiAdegan("salin")} title="Gandakan adegan" aria-label="Gandakan adegan"><i className="bi bi-copy"></i></button>
            <button type="button" className="btn btn-sm btn-light text-danger" onClick={() => aksiAdegan("hapus")} disabled={naskah.adegan.length < 2} title="Hapus adegan" aria-label="Hapus adegan"><i className="bi bi-trash"></i></button>
          </div>
        </div>

        {/* Kanvas */}
        <div className="studio-tengah">
          <div className="d-flex flex-wrap gap-1 mb-2 justify-content-center" role="toolbar" aria-label="Tambah elemen">
            <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => tambahElemen("teks")}><i className="bi bi-fonts me-1"></i>Teks</button>
            <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => tambahElemen("emoji")}><i className="bi bi-emoji-smile me-1"></i>Emoji</button>
            <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => tambahElemen("gambar")}><i className="bi bi-image me-1"></i>Gambar</button>
            <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => tambahElemen("bentuk")}><i className="bi bi-square me-1"></i>Bentuk</button>
            <span className="vr mx-1"></span>
            <button type="button" className="btn btn-sm btn-light" disabled={!elemen} onClick={() => aksiElemen("depan")} title="Ke depan" aria-label="Bawa ke depan"><i className="bi bi-layer-forward"></i></button>
            <button type="button" className="btn btn-sm btn-light" disabled={!elemen} onClick={() => aksiElemen("belakang")} title="Ke belakang" aria-label="Kirim ke belakang"><i className="bi bi-layer-backward"></i></button>
            <button type="button" className="btn btn-sm btn-light" disabled={!elemen} onClick={() => aksiElemen("salin")} title="Gandakan (Ctrl+D)" aria-label="Gandakan elemen"><i className="bi bi-copy"></i></button>
            <button type="button" className="btn btn-sm btn-light text-danger" disabled={!elemen} onClick={() => aksiElemen("hapus")} title="Hapus (Delete)" aria-label="Hapus elemen"><i className="bi bi-trash"></i></button>
          </div>
          <div className="studio-bingkai mx-auto" style={{ width: `min(${lebarKanvas}px, 100%, calc((100vh - 240px) * ${bingkai.lebar / bingkai.tinggi}))`, aspectRatio: `${bingkai.lebar} / ${bingkai.tinggi}` }}>
            <Player ref={pasangPlayer} key={naskah.rasio} component={Rakitan} inputProps={inputProps} durationInFrames={durasi} fps={FPS}
              compositionWidth={bingkai.lebar} compositionHeight={bingkai.tinggi} controls={pratinjau} clickToPlay={pratinjau}
              style={{ width: "100%", height: "100%" }} acknowledgeRemotionLicense />
            {!pratinjau && (
              <div ref={kanvas} className="studio-lapis" onPointerMove={gerakTarik} onPointerUp={selesaiTarik} onPointerLeave={selesaiTarik} onPointerDown={() => setPilih(null)} aria-label="Kanvas adegan">
                {tegak && garisAman && <div className="studio-aman" title="Area aman: hindari bagian atas & bawah yang tertutup tombol aplikasi"></div>}
                {(adegan?.elemen || []).map((e) => {
                  const h = e.tipe === "teks" ? tinggiTeks(e, bingkai.lebar, bingkai.tinggi) : e.h;
                  return (
                    <div key={e.id} className={`studio-kotak ${e.id === pilih ? "dipilih" : ""}`} role="button" tabIndex={-1} aria-label={`Elemen ${e.tipe}`}
                      style={{ left: `${e.x}%`, top: `${e.y}%`, width: `${e.w}%`, height: `${h}%`, transform: `translate(-50%, -50%) rotate(${e.rot || 0}deg)` }}
                      onPointerDown={(ev) => mulaiTarik(ev, e, "geser")}>
                      {e.id === pilih && <span className="studio-pegangan" onPointerDown={(ev) => mulaiTarik(ev, e, "ukuran")} aria-label="Ubah ukuran"></span>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="d-flex flex-wrap gap-2 justify-content-center align-items-center mt-2 small">
            {pratinjau
              ? <button type="button" className="btn btn-sm btn-secondary" onClick={() => { player.current?.pause(); setPratinjau(false); }}><i className="bi bi-pencil me-1"></i>Kembali menyunting</button>
              : <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => putar(true)}><i className="bi bi-play me-1"></i>Putar adegan ini</button>}
            {tegak && <div className="form-check form-check-inline m-0"><input className="form-check-input" type="checkbox" id="stAman" checked={garisAman} onChange={(e) => setGarisAman(e.target.checked)} /><label className="form-check-label" htmlFor="stAman">Garis area aman</label></div>}
            <span className="text-body-secondary">Geser elemen di kanvas; panah untuk menggeser halus, Delete untuk menghapus. Pratinjau tanpa narasi.</span>
          </div>
          {adegan && !pratinjau && (
            <Timeline adegan={adegan} durasi={Math.round(detikAdeganRakitan(adegan) * 10) / 10} waktu={waktu} onWaktu={setWaktu} pilih={pilih}
              onPilih={(id) => { setPilih(id); setTab("properti"); }} onUbah={ubahElemen} onCatat={catatSekarang} />
          )}
        </div>

        {/* Panel properti */}
        <div className="studio-panel card shadow-sm">
          <div className="card-header py-1">
            <ul className="nav nav-tabs card-header-tabs small" role="tablist">
              {[["properti", elemen ? "Elemen" : "Adegan"], ["musik", naskah.musik ? "Musik ♪" : "Musik"], ["merek", "Merek"]].map(([k, l]) => (
                <li key={k} className="nav-item"><button type="button" role="tab" aria-selected={tab === k} className={`nav-link py-1 ${tab === k ? "active" : ""}`} onClick={() => setTab(k)}>{l}</button></li>
              ))}
            </ul>
          </div>
          <div className="card-body studio-gulir">
            {tab === "musik"
              ? <PanelMusik musik={naskah.musik} onUbah={(m) => ubahNaskah((n) => ({ ...n, musik: m }))} onUnggahAudio={(f) => unggah(f, "audio")} />
              : tab === "merek"
              ? <PanelMerek merek={naskah.merek} onUbah={(x) => ubahNaskah((n) => ({ ...n, merek: { ...n.merek, ...x } }))} onUnggah={unggah} onSimpanSekolah={simpanMerekSekolah} bolehSimpan />
              : elemen
                ? <PanelElemen key={elemen.id} e={elemen} palet={palet} durasiAdegan={detikAdeganRakitan(adegan)} onUbah={(x) => ubahElemen(elemen.id, x)} onUnggah={unggah} />
                : adegan && <PanelAdegan a={adegan} nomor={adeganAktif + 1} palet={palet} onUbah={(x) => ubahAdegan(x)} onUnggah={unggah} />}
          </div>
        </div>
      </div>

      {papan && <ModalPapanCerita rasio={naskah.rasio} referensi={referensi} tujuanAwal={meta.tujuan} onTutup={() => setPapan(false)}
        onHasil={(n, tujuan) => { catatSekarang(); setNaskah({ ...n, merek: { ...n.merek, logo: n.merek?.logo || naskah.merek?.logo || null } }); setMeta((m) => ({ ...m, tujuan, judul: m.judul || n.judul })); setAdeganAktif(0); setPilih(null); setPapan(false); }} />}
      {templat && <ModalTemplat naskah={naskah} onTutup={() => setTemplat(false)}
        onPakai={(t) => { catatSekarang(); setNaskah({ ...salin(t.naskah), merek: t.naskah.merek?.logo ? t.naskah.merek : { ...t.naskah.merek, logo: naskah.merek?.logo || null } }); setAdeganAktif(0); setPilih(null); setTemplat(false); toast(`Templat "${t.judul}" dipakai`); }} />}
      {kirim && <ModalRender naskah={naskah} meta={meta} setMeta={setMeta} referensi={referensi} suaraList={suaraList} idVideo={idVideo}
        onTutup={() => setKirim(false)} onSelesai={(v) => { setKirim(false); if (!idVideo) { try { localStorage.removeItem(KUNCI_DRAF); } catch { /* */ } } window.location.href = `/dashboard/video-belajar`; }} />}
    </div>
  );
}

function ModalRender({ naskah, meta, setMeta, referensi, suaraList, idVideo, onTutup, onSelesai }) {
  const [proses, setProses] = useState(false);
  const [rasioLain, setRasioLain] = useState([]);
  const ubah = (x) => setMeta((m) => ({ ...m, ...x }));
  const kirim = async (e) => {
    e.preventDefault();
    setProses(true);
    try {
      const body = { templat: "Rakitan", rasio_tambahan: idVideo ? undefined : rasioLain, tujuan: meta.tujuan, judul: meta.judul, deskripsi: meta.deskripsi || null, id_mapel: meta.id_mapel || null, id_kelas: meta.id_kelas || null, suara: meta.suara, props: { ...naskah, judul: naskah.judul || meta.judul } };
      const r = await minta("POST", idVideo ? `/video-belajar/${idVideo}/render` : "/video-belajar/templat", body);
      await Swal.fire({ icon: "success", title: "Masuk antrean render", text: r.message });
      onSelesai(r.data);
    } catch (err) { Swal.fire("Gagal", err.message, "error"); setProses(false); }
  };
  const tanpaNarasi = naskah.adegan.every((a) => !a.narasi?.trim());
  return (
    <>
      <div className="modal d-block" tabIndex={-1} role="dialog" aria-modal="true" aria-label="Render video">
        <div className="modal-dialog">
          <form className="modal-content border-0 shadow" onSubmit={kirim}>
            <div className="modal-header"><h5 className="modal-title fw-bold"><i className="bi bi-film text-primary me-2"></i>{idVideo ? "Render ulang video" : "Render video"}</h5>
              <button type="button" className="btn-close" onClick={onTutup} disabled={proses} aria-label="Tutup"></button></div>
            <div className="modal-body">
              <label className="form-label small mb-1" htmlFor="rdJudul">Judul di pustaka video</label>
              <input id="rdJudul" className="form-control mb-2" required maxLength={200} value={meta.judul} onChange={(e) => ubah({ judul: e.target.value })} />
              <label className="form-label small mb-1" htmlFor="rdTujuan">Tujuan video</label>
              <select id="rdTujuan" className="form-select" value={meta.tujuan} onChange={(e) => ubah({ tujuan: e.target.value })}>
                {TUJUAN.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <div className="form-text mb-2">{TUJUAN.find((t) => t[0] === meta.tujuan)?.[2]}</div>
              <label className="form-label small mb-1" htmlFor="rdDesk">Deskripsi (opsional)</label>
              <textarea id="rdDesk" className="form-control mb-2" rows={2} maxLength={3000} value={meta.deskripsi} onChange={(e) => ubah({ deskripsi: e.target.value })} />
              <div className="row g-2 mb-2">
                <div className="col-6"><label className="form-label small mb-1" htmlFor="rdMapel">Mapel (opsional)</label>
                  <select id="rdMapel" className="form-select" value={meta.id_mapel} onChange={(e) => ubah({ id_mapel: e.target.value })}>
                    <option value="">Umum / promosi sekolah</option>{(referensi?.mapel || []).map((m) => <option key={m.id_mapel} value={m.id_mapel}>{m.nama_mapel}</option>)}
                  </select></div>
                <div className="col-6"><label className="form-label small mb-1" htmlFor="rdKelas">Kelas (opsional)</label>
                  <select id="rdKelas" className="form-select" value={meta.id_kelas} onChange={(e) => ubah({ id_kelas: e.target.value })}>
                    <option value="">Semua kelas</option>{(referensi?.kelas || []).map((k) => <option key={k.id_kelas} value={k.id_kelas}>{k.nama_kelas}</option>)}
                  </select></div>
              </div>
              <label className="form-label small mb-1" htmlFor="rdSuara">Suara narasi</label>
              <select id="rdSuara" className="form-select" value={meta.suara} onChange={(e) => ubah({ suara: e.target.value })}>
                {!suaraList.some((p) => p.kode === "TANPA") && <option value="TANPA">Tanpa suara</option>}
                {(suaraList.length ? suaraList : [{ kode: "LOKAL", label: "Suara AI lokal (Piper, gratis)", aktif: true }]).map((p) => <option key={p.kode} value={p.kode} disabled={!p.aktif}>{p.label}{p.aktif ? "" : " — belum diatur"}</option>)}
              </select>
              {!idVideo && (
                <div className="mt-2">
                  <div className="form-label small mb-1">Render juga dalam rasio lain (opsional)</div>
                  <div className="d-flex flex-wrap gap-3">
                    {Object.keys(RASIO).filter((r) => r !== naskah.rasio).map((r) => (
                      <div key={r} className="form-check m-0">
                        <input className="form-check-input" type="checkbox" id={`rdR${r}`} checked={rasioLain.includes(r)} onChange={(e) => setRasioLain((x) => (e.target.checked ? [...x, r] : x.filter((y) => y !== r)))} />
                        <label className="form-check-label small" htmlFor={`rdR${r}`}>{r}</label>
                      </div>
                    ))}
                  </div>
                  {rasioLain.length > 0 && <div className="form-text">Tiap rasio menjadi video tersendiri dengan posisi elemen yang sama. Periksa dulu tampilannya dengan tombol rasio di atas kanvas.</div>}
                </div>
              )}
              {tanpaNarasi && meta.suara !== "TANPA" && <div className="form-text text-warning">Belum ada narasi di adegan mana pun; video akan tanpa suara.</div>}
              <div className="form-text">Video masuk pustaka sebagai draf; ajukan ke kepala sekolah setelah selesai dirender.</div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline-secondary" onClick={onTutup} disabled={proses}>Batal</button>
              <button className="btn btn-primary" disabled={proses}>{proses ? <span className="spinner-border spinner-border-sm me-1"></span> : <i className="bi bi-send me-1"></i>}Kirim ke antrean</button>
            </div>
          </form>
        </div>
      </div>
      <div className="modal-backdrop show"></div>
    </>
  );
}

/** Papan cerita AI: satu kalimat permintaan → naskah berisi adegan, teks, emoji, dan narasi untuk disunting. */
function ModalPapanCerita({ rasio, referensi, tujuanAwal, onTutup, onHasil }) {
  const [f, setF] = useState({ permintaan: "", tujuan: tujuanAwal || "PROMOSI", jumlah_adegan: 5, id_mapel: "" });
  const [mode, setMode] = useState(bacaAiMode);
  const [proses, setProses] = useState(false);
  const contoh = {
    PEMBELAJARAN: "Video belajar daur hidup kupu-kupu untuk kelas 3, dengan contoh di kebun sekolah",
    PROMOSI: "Video promosi PPDB: sekolah ramah anak, guru sabar, kegiatan literasi dan olahraga, pendaftaran dibuka Januari",
    PENGUMUMAN: "Pengumuman libur semester mulai 20 Desember dan masuk kembali 5 Januari",
    ACARA: "Liputan lomba 17 Agustus di sekolah: balap karung, tarik tambang, dan lomba mewarnai",
  };
  const susun = async (e) => {
    e.preventDefault();
    simpanAiMode(mode); setProses(true);
    try {
      const r = await minta("POST", "/video-belajar/papan-cerita", { ...f, id_mapel: f.id_mapel || null, rasio, ai_mode: mode });
      onHasil(r.naskah, f.tujuan);
      Swal.fire({ icon: "success", title: "Papan cerita siap", text: r.message });
    } catch (err) { Swal.fire("AI belum berhasil", err.message, "warning"); setProses(false); }
  };
  return (
    <>
      <div className="modal d-block" tabIndex={-1} role="dialog" aria-modal="true" aria-label="Papan cerita AI">
        <div className="modal-dialog">
          <form className="modal-content border-0 shadow" onSubmit={susun}>
            <div className="modal-header"><h5 className="modal-title fw-bold"><i className="bi bi-stars text-primary me-2"></i>Papan cerita AI</h5>
              <button type="button" className="btn-close" onClick={onTutup} disabled={proses} aria-label="Tutup"></button></div>
            <div className="modal-body">
              <label className="form-label small mb-1" htmlFor="pcTujuan">Tujuan video</label>
              <select id="pcTujuan" className="form-select mb-2" value={f.tujuan} onChange={(e) => setF({ ...f, tujuan: e.target.value })}>{TUJUAN.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              <label className="form-label small mb-1" htmlFor="pcMinta">Video seperti apa yang Anda inginkan?</label>
              <textarea id="pcMinta" className="form-control mb-2" rows={4} required minLength={10} maxLength={1000} value={f.permintaan} onChange={(e) => setF({ ...f, permintaan: e.target.value })} placeholder={contoh[f.tujuan]} />
              <div className="row g-2">
                <div className="col-6"><label className="form-label small mb-1" htmlFor="pcJumlah">Jumlah adegan</label>
                  <input id="pcJumlah" type="number" className="form-control" min={3} max={8} value={f.jumlah_adegan} onChange={(e) => setF({ ...f, jumlah_adegan: Number(e.target.value) })} /></div>
                <div className="col-6"><label className="form-label small mb-1" htmlFor="pcAi">Penyedia AI</label>
                  <select id="pcAi" className="form-select" value={mode} onChange={(e) => setMode(e.target.value)}>{AI_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select></div>
                {f.tujuan === "PEMBELAJARAN" && (
                  <div className="col-12"><label className="form-label small mb-1" htmlFor="pcMapel">Mapel (agar AI membaca Pustaka Dokumen mapel itu)</label>
                    <select id="pcMapel" className="form-select" value={f.id_mapel} onChange={(e) => setF({ ...f, id_mapel: e.target.value })}>
                      <option value="">Semua mapel</option>{(referensi?.mapel || []).map((m) => <option key={m.id_mapel} value={m.id_mapel}>{m.nama_mapel}</option>)}
                    </select></div>
                )}
              </div>
              <div className="form-text">Rasio mengikuti kanvas saat ini ({rasio}). Naskah yang sedang dirakit diganti, dan bisa dikembalikan dengan Ctrl+Z.</div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline-secondary" onClick={onTutup} disabled={proses}>Batal</button>
              <button className="btn btn-primary" disabled={proses}>{proses ? <><span className="spinner-border spinner-border-sm me-1"></span>AI menyusun…</> : <><i className="bi bi-stars me-1"></i>Susun papan cerita</>}</button>
            </div>
          </form>
        </div>
      </div>
      <div className="modal-backdrop show"></div>
    </>
  );
}

/** Templat naskah sekolah: pakai untuk video baru, atau simpan naskah yang sedang dirakit sebagai templat. */
function ModalTemplat({ naskah, onTutup, onPakai }) {
  const [daftar, setDaftar] = useState(null);
  const [f, setF] = useState({ judul: naskah.judul || "", kategori: "PROMOSI", deskripsi: "" });
  const [proses, setProses] = useState(false);
  const muat = () => minta("GET", "/video-belajar/templat-studio").then((r) => setDaftar(r.data)).catch((e) => Swal.fire("Gagal", e.message, "error"));
  useEffect(() => { muat(); }, []);
  const simpan = async (e) => {
    e.preventDefault(); setProses(true);
    try { await minta("POST", "/video-belajar/templat-studio", { ...f, naskah }); toast("Naskah disimpan sebagai templat"); muat(); }
    catch (err) { Swal.fire("Gagal", err.message, "error"); }
    finally { setProses(false); }
  };
  const pakai = async (t) => {
    const ok = await Swal.fire({ title: `Pakai templat "${t.judul}"?`, text: "Naskah yang sedang dirakit diganti (bisa dibatalkan dengan Ctrl+Z).", icon: "question", showCancelButton: true, confirmButtonText: "Pakai", cancelButtonText: "Batal" });
    if (ok.isConfirmed) onPakai(t);
  };
  const hapus = async (t) => {
    const ok = await Swal.fire({ title: `Hapus templat "${t.judul}"?`, icon: "warning", showCancelButton: true, confirmButtonText: "Hapus", cancelButtonText: "Batal", confirmButtonColor: "#dc3545" });
    if (!ok.isConfirmed) return;
    try { await minta("DELETE", `/video-belajar/templat-studio/${t.id_templat}`); muat(); } catch (err) { Swal.fire("Gagal", err.message, "error"); }
  };
  const namaKategori = (k) => KATEGORI_TEMPLAT.find((x) => x[0] === k)?.[1] || k;
  return (
    <>
      <div className="modal d-block" tabIndex={-1} role="dialog" aria-modal="true" aria-label="Templat video">
        <div className="modal-dialog modal-lg modal-dialog-scrollable">
          <div className="modal-content border-0 shadow">
            <div className="modal-header"><h5 className="modal-title fw-bold"><i className="bi bi-collection text-primary me-2"></i>Templat video sekolah</h5>
              <button type="button" className="btn-close" onClick={onTutup} aria-label="Tutup"></button></div>
            <div className="modal-body">
              {!daftar ? <div className="text-muted small"><span className="spinner-border spinner-border-sm me-2"></span>Memuat…</div>
                : !daftar.length ? <div className="text-muted small mb-3">Belum ada templat. Simpan naskah ini sebagai templat pertama di bawah.</div>
                : (
                  <div className="row g-2 mb-3">
                    {daftar.map((t) => (
                      <div key={t.id_templat} className="col-md-6">
                        <div className="border rounded p-2 h-100 d-flex flex-column">
                          <div className="d-flex align-items-start gap-2">
                            <div className="flex-grow-1 min-w-0"><div className="fw-semibold text-truncate">{t.judul}</div>
                              <div className="small text-body-secondary">{namaKategori(t.kategori)} · {t.rasio} · {t.naskah?.adegan?.length || 0} adegan</div></div>
                          </div>
                          {t.deskripsi && <div className="small mt-1">{t.deskripsi}</div>}
                          <div className="mt-auto pt-2 d-flex gap-2">
                            <button type="button" className="btn btn-sm btn-primary" onClick={() => pakai(t)}><i className="bi bi-box-arrow-in-down me-1"></i>Pakai</button>
                            <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => hapus(t)} aria-label={`Hapus templat ${t.judul}`}><i className="bi bi-trash"></i></button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              <form className="border-top pt-3" onSubmit={simpan}>
                <div className="fw-semibold small mb-2">Simpan naskah yang sedang dirakit sebagai templat</div>
                <div className="row g-2">
                  <div className="col-md-6"><input className="form-control form-control-sm" required maxLength={120} aria-label="Judul templat" placeholder="Judul templat" value={f.judul} onChange={(e) => setF({ ...f, judul: e.target.value })} /></div>
                  <div className="col-md-6"><select className="form-select form-select-sm" aria-label="Kategori templat" value={f.kategori} onChange={(e) => setF({ ...f, kategori: e.target.value })}>{KATEGORI_TEMPLAT.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
                  <div className="col-12"><input className="form-control form-control-sm" maxLength={1000} aria-label="Deskripsi templat" placeholder="Keterangan singkat (opsional)" value={f.deskripsi} onChange={(e) => setF({ ...f, deskripsi: e.target.value })} /></div>
                </div>
                <button className="btn btn-sm btn-outline-primary mt-2" disabled={proses}><i className="bi bi-bookmark-plus me-1"></i>Simpan sebagai templat</button>
              </form>
            </div>
          </div>
        </div>
      </div>
      <div className="modal-backdrop show"></div>
    </>
  );
}

export default function Halaman() {
  return <Suspense fallback={null}><Studio /></Suspense>;
}
