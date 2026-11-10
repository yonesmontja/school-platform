// Komposisi "Rakitan" (Studio Rakit Video, D1): merender naskah JSON buatan guru — adegan berisi latar dan elemen
// (teks, emoji, gambar, bentuk) dengan animasi masuk, gerak berulang, transisi, narasi, subtitle, dan merek sekolah.
// Posisi & ukuran elemen dalam persen bingkai sehingga satu naskah cocok untuk semua rasio. Naskah tidak terikat
// Remotion: komponen ini hanya salah satu "penulis render"; bentuk naskahnya sama dengan App\Services\NaskahVideo.
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import lottie from "lottie-web/build/player/lottie_light_canvas";
import { AbsoluteFill, Audio, Img, Sequence, continueRender, delayRender, useCurrentFrame, useVideoConfig } from "remotion";
import { ukuranRasio } from "./umum.jsx";
import { srcEmoji3d } from "./emoji3d.js";
import { HURUF, awalAdegan, barisSubtitle, detikAdeganRakitan, frameAdegan, frameLottie, gayaKaca, hitungDurasiRakitan, hurufElemen, jendelaNarasi, kataTeks, keadaanElemen, keadaanKamera, keadaanKata, keadaanTransisi, primitifHias, sisiEmoji3d, srcIkon, subtitlePada, svgIkon, teksHitung, volumeMusik, POLA_LOTTIE } from "./gerakRakitan.js";

// Waktu & animasi dihitung di gerakRakitan.js (dipakai juga oleh penulis render Revideo)
export { HURUF, awalAdegan, barisSubtitle, detikAdeganRakitan, hitungDurasiRakitan };

export const MASUK = [
  ["pudar", "Pudar"], ["geser-kiri", "Geser dari kiri"], ["geser-kanan", "Geser dari kanan"], ["geser-atas", "Turun dari atas"],
  ["geser-bawah", "Naik dari bawah"], ["pop", "Pop (memantul)"], ["zoom", "Membesar"], ["putar", "Berputar masuk"],
  ["mantul", "Jatuh memantul"], ["ketik", "Mengetik (teks)"], ["kata", "Kata demi kata (teks)"], ["hitung", "Angka menghitung naik (teks)"],
  ["sapu", "Disapu"], ["tidak", "Langsung muncul"],
];
export const KAMERA = [["tidak", "Diam"], ["zoom-masuk", "Zoom masuk pelan"], ["zoom-keluar", "Zoom keluar pelan"], ["geser-kiri", "Geser ke kiri"], ["geser-kanan", "Geser ke kanan"]];
export const HIAS = [["tidak", "Tanpa hiasan"], ["gumpalan", "Gumpalan warna lembut"], ["bokeh", "Bokeh melayang"], ["garis", "Garis diagonal"], ["titik", "Pola titik"], ["gelombang", "Gelombang"]];
export const GERAK = [["tidak", "Diam"], ["melambung", "Melayang"], ["denyut", "Berdenyut"], ["goyang", "Bergoyang"], ["putar", "Berputar terus"]];
export const KELUAR = [["tidak", "Langsung hilang"], ["pudar", "Memudar"], ["geser-kiri", "Geser ke kiri"], ["geser-kanan", "Geser ke kanan"],
  ["geser-atas", "Naik ke atas"], ["geser-bawah", "Turun ke bawah"], ["zoom", "Mengecil"]];
export const TRANSISI = [["pudar", "Pudar"], ["geser", "Geser"], ["zoom", "Zoom"], ["tidak", "Langsung"]];
export const BENTUK = [["kotak", "Kotak"], ["bulat", "Bulat/elips"], ["lingkaran", "Lingkaran garis"], ["panah", "Panah"], ["bintang", "Bintang"], ["garis", "Garis"]];
const EMOJI = "'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif";
export function metadataRakitan(p) {
  const { lebar, tinggi } = ukuranRasio(p?.rasio);
  return { durationInFrames: hitungDurasiRakitan(p), width: lebar, height: tinggi };
}
const srcAset = (url, dasar) => (!url ? null : /^https?:|^data:|^blob:/.test(url) ? url : `${dasar || ""}${url}`);

function Bentuk({ isi, g }) {
  const isian = g.warna, garis = g.garis || "none", tebal = g.garis ? 3 : 0;
  const svg = (anak, rasioTetap) => (
    <svg viewBox="0 0 100 100" width="100%" height="100%" preserveAspectRatio={rasioTetap ? "xMidYMid meet" : "none"} style={{ overflow: "visible" }}>{anak}</svg>
  );
  switch (isi) {
    case "bulat": return svg(<ellipse cx="50" cy="50" rx="49" ry="49" fill={isian} stroke={garis} strokeWidth={tebal} vectorEffect="non-scaling-stroke" />);
    case "lingkaran": return svg(<ellipse cx="50" cy="50" rx="46" ry="46" fill="none" stroke={isian} strokeWidth="6" vectorEffect="non-scaling-stroke" />);
    case "panah": return svg(<polygon points="0,35 62,35 62,10 100,50 62,90 62,65 0,65" fill={isian} stroke={garis} strokeWidth={tebal} vectorEffect="non-scaling-stroke" />);
    case "bintang": return svg(<polygon points="50,3 61,37 97,37 68,58 79,93 50,72 21,93 32,58 3,37 39,37" fill={isian} stroke={garis} strokeWidth={tebal} />, true);
    case "garis": return svg(<rect x="0" y="44" width="100" height="12" rx="6" fill={isian} />);
    default: return svg(<rect x="0" y="0" width="100" height="100" rx={g.sudut || 0} fill={isian} stroke={garis} strokeWidth={tebal} vectorEffect="non-scaling-stroke" />);
  }
}

/** Satu elemen beserta animasi masuk & gerak berulangnya. */
export function ElemenRakitan({ e, huruf, asetDasar, k, lebar, tinggi }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { op, tx, ty, sc, rot, sapu, nKetik } = keadaanElemen(e, frame, fps, lebar, tinggi, k);
  const clip = sapu > 0 ? `inset(0 ${sapu * 100}% 0 0)` : undefined;
  const g = e.gaya || {};
  const kotak = {
    position: "absolute", left: `${e.x}%`, top: `${e.y}%`, width: `${e.w}%`,
    ...(e.tipe === "teks" ? {} : { height: `${e.h}%` }),
    transform: `translate(-50%, -50%) translate(${tx}px, ${ty}px) rotate(${rot}deg) scale(${sc})`,
    opacity: op, clipPath: clip, WebkitClipPath: clip,
    filter: g.bayangan && e.tipe !== "teks" ? `drop-shadow(0 ${6 * k}px ${10 * k}px rgba(0,0,0,.35))` : undefined,
  };
  if (e.tipe === "teks") {
    const u = (g.ukuran || 60) * k, rata = { kiri: "left", kanan: "right" }[g.rata] || "center";
    const kaca = g.kaca ? gayaKaca(g.warna) : null;
    const berkotak = g.latar || kaca;
    const gayaHuruf = {
      fontFamily: huruf, fontSize: u, lineHeight: 1.18, color: g.warna, fontWeight: g.tebal ? 800 : 400, fontStyle: g.miring ? "italic" : "normal",
      WebkitTextStroke: g.garis ? `${Math.max(1, u * 0.05)}px ${g.garis}` : undefined, paintOrder: "stroke fill",
      textShadow: g.bayangan ? `0 ${4 * k}px ${10 * k}px rgba(0,0,0,.45)` : undefined,
    };
    const kulit = {
      ...kotak, ...gayaHuruf, textAlign: rata, whiteSpace: "pre-wrap", overflowWrap: "anywhere",
      background: kaca ? kaca.isi : g.latar || undefined, padding: berkotak ? `${0.25 * u}px ${0.45 * u}px` : 0,
      borderRadius: (kaca ? Math.max(g.sudut || 0, 14) : g.sudut || 0) * k,
      boxShadow: kaca ? `inset 0 0 0 ${1.5 * k}px ${kaca.garis}` : undefined,
    };
    if (e.masuk?.preset === "kata") {
      const kata = kataTeks(e.isi), n = kata.filter(Boolean).length;
      let i = 0;
      return (
        <div style={{ ...kulit, display: "flex", flexWrap: "wrap", justifyContent: { left: "start", right: "end" }[rata] || "center", columnGap: 0.28 * u }}>
          {kata.map((w, j) => {
            if (w === null) return <div key={j} style={{ flexBasis: "100%", height: 0 }} />;
            const s = keadaanKata(e, frame, fps, i++, n);
            return <span key={j} style={{ display: "inline-block", opacity: s.op, transform: `scale(${s.sc})` }}>{w}</span>;
          })}
        </div>
      );
    }
    const isi = e.masuk?.preset === "hitung" ? teksHitung(e.isi, frame, fps, e) : nKetik === null ? e.isi : String(e.isi).slice(0, nKetik);
    return <div style={kulit}>{isi}</div>;
  }
  if (e.tipe === "emoji") {
    const tiga = g.emoji !== "datar" ? srcEmoji3d(e.isi) : null;
    if (tiga) {
      const s = sisiEmoji3d(g, k);
      return <div style={{ ...kotak, display: "flex", alignItems: "center", justifyContent: "center" }}><Img src={srcAset(tiga, asetDasar)} style={{ width: s, height: s, objectFit: "contain", flexShrink: 0 }} /></div>;
    }
    return <div style={{ ...kotak, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: EMOJI, fontSize: (g.ukuran || 120) * k, lineHeight: 1 }}>{e.isi}</div>;
  }
  if (e.tipe === "lottie") {
    return <div style={kotak}>{POLA_LOTTIE.test(String(e.isi || "")) && <LottieRakitan e={e} src={srcAset(e.isi, asetDasar)} frame={frame} fps={fps} />}</div>;
  }
  if (e.tipe === "ikon") {
    const src = srcIkon(e.isi);
    return <div style={kotak}>{src && <IkonSvg src={srcAset(src, asetDasar)} warna={g.warna} tipis={g.tebal === false} />}</div>;
  }
  if (e.tipe === "gambar") {
    const src = srcAset(e.isi, asetDasar);
    return <div style={{ ...kotak, borderRadius: (g.sudut || 0) * k, overflow: "hidden" }}>{src && <Img src={src} style={{ width: "100%", height: "100%", objectFit: "contain" }} />}</div>;
  }
  return <div style={kotak}><Bentuk isi={e.isi} g={g} /></div>;
}

/** Ikon SVG dari pustaka: teksnya dimuat sekali (render ditahan sampai siap), lalu diwarnai dan digambar tajam. */
const cacheSvg = new Map();
function IkonSvg({ src, warna, tipis }) {
  const [teks, setTeks] = useState(() => cacheSvg.get(src) ?? null);
  const tahan = useRef(null);
  if (tahan.current === null && !cacheSvg.has(src)) tahan.current = delayRender(`Memuat ikon ${src}`);
  useEffect(() => {
    let batal = false;
    const lepas = () => { if (tahan.current !== null && tahan.current !== false) { continueRender(tahan.current); tahan.current = false; } };
    if (cacheSvg.has(src)) { setTeks(cacheSvg.get(src)); lepas(); return undefined; }
    fetch(src).then((r) => (r.ok ? r.text() : "")).catch(() => "").then((t) => { cacheSvg.set(src, t); if (!batal) setTeks(t); lepas(); });
    return () => { batal = true; };
  }, [src]);
  const svg = svgIkon(teks, warna, tipis);
  return svg ? <div style={{ width: "100%", height: "100%" }} dangerouslySetInnerHTML={{ __html: svg }} /> : null;
}

/**
 * Animasi Lottie unggahan sekolah, digambar lottie-web versi "light canvas" (tanpa mesin expression) dan disetel ke
 * frame yang dihitung frameLottie — sama dengan penulis render Revideo. Render ditahan sampai data & gambarnya siap.
 */
const cacheLottie = new Map();
function LottieRakitan({ e, src, frame, fps }) {
  const wadah = useRef(null);
  const anim = useRef(null);
  const [data, setData] = useState(null);
  const tahan = useRef(null);
  if (tahan.current === null) tahan.current = delayRender(`Memuat animasi Lottie ${src}`);
  const lepas = () => { if (tahan.current !== null && tahan.current !== false) { continueRender(tahan.current); tahan.current = false; } };
  useEffect(() => {
    let batal = false;
    if (!cacheLottie.has(src)) cacheLottie.set(src, fetch(src).then((r) => (r.ok ? r.json() : null)).catch(() => null));
    cacheLottie.get(src).then((d) => { if (batal) return; if (d) setData(d); else lepas(); });
    return () => { batal = true; };
  }, [src]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!data || !wadah.current) return undefined;
    const a = lottie.loadAnimation({ container: wadah.current, renderer: "canvas", loop: false, autoplay: false,
      animationData: JSON.parse(JSON.stringify(data)), rendererSettings: { preserveAspectRatio: "xMidYMid meet", clearCanvas: true } });
    anim.current = a;
    const bergambar = (data.assets || []).some((x) => x && x.p);
    a.addEventListener(bergambar ? "loaded_images" : "DOMLoaded", () => { a.goToAndStop(frameLottie(e, frame, fps, data), true); lepas(); });
    return () => { a.destroy(); anim.current = null; };
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => { if (anim.current && data) anim.current.goToAndStop(frameLottie(e, frame, fps, data), true); });
  return <div ref={wadah} style={{ width: "100%", height: "100%" }} />;
}

function Latar({ l, asetDasar }) {
  if (l?.tipe === "gambar" && l.gambar) {
    return (
      <AbsoluteFill>
        <Img src={srcAset(l.gambar, asetDasar)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        {l.redup > 0 && <AbsoluteFill style={{ background: `rgba(0,0,0,${l.redup})` }} />}
      </AbsoluteFill>
    );
  }
  return <AbsoluteFill style={{ background: l?.tipe === "gradien" ? `linear-gradient(135deg, ${l.warna}, ${l.warna2})` : l?.warna || "#fff" }} />;
}

/** Latar hias bergerak (bentuk dari primitifHias, sama dengan penulis render Revideo). */
function Hias({ l, lebar, tinggi }) {
  const frame = useCurrentFrame();
  if (!l?.hias || l.hias === "tidak") return null;
  const bentuk = primitifHias(l.hias, frame, lebar, tinggi, l.warna_hias || "#ffffff");
  return (
    <svg viewBox={`0 0 ${lebar} ${tinggi}`} width="100%" height="100%" style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      {bentuk.map((b, i) => (b.jenis === "lingkaran"
        ? <circle key={i} cx={b.x} cy={b.y} r={b.r} fill={b.warna} opacity={b.op} style={b.blur ? { filter: `blur(${b.blur}px)` } : undefined} />
        : b.jenis === "kotak"
          ? <rect key={i} x={b.x - b.w / 2} y={b.y - b.h / 2} width={b.w} height={b.h} fill={b.warna} opacity={b.op} transform={`rotate(${b.rot} ${b.x} ${b.y})`} />
          : <polygon key={i} points={b.titik.map((t) => t.join(",")).join(" ")} fill={b.warna} opacity={b.op} />))}
    </svg>
  );
}

function Subtitle({ a, huruf, k, tegak }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const baris = subtitlePada(a, frame / fps);
  if (!baris) return null;
  return (
    <div style={{ position: "absolute", left: "6%", right: "6%", bottom: tegak ? "17%" : "6%", display: "flex", justifyContent: "center" }}>
      <span style={{ fontFamily: huruf, fontSize: 34 * k, fontWeight: 700, color: "#fff", background: "rgba(0,0,0,.62)", padding: `${6 * k}px ${16 * k}px`, borderRadius: 10 * k, textAlign: "center", lineHeight: 1.3 }}>{baris.teks}</span>
    </div>
  );
}

function Adegan({ a, p, huruf, k, lebar, tinggi, tegak }) {
  const frame = useCurrentFrame();
  const { op, geser, sc } = keadaanTransisi(a.transisi, frame);
  const tr = { opacity: op, transform: geser ? `translateX(${geser * 100}%)` : sc !== 1 ? `scale(${sc})` : undefined };
  const kam = keadaanKamera(a.kamera, frame, frameAdegan(a), lebar);
  return (
    <AbsoluteFill style={tr}>
      <AbsoluteFill style={{ transform: kam.sc !== 1 || kam.tx ? `translateX(${kam.tx}px) scale(${kam.sc})` : undefined }}>
        <Latar l={a.latar} asetDasar={p.asetDasar} />
        <Hias l={a.latar} lebar={lebar} tinggi={tinggi} />
        {(a.elemen || []).map((e) => <ElemenRakitan key={e.id} e={e} huruf={e.tipe === "teks" ? hurufElemen(e, p.merek) : huruf} asetDasar={p.asetDasar} k={k} lebar={lebar} tinggi={tinggi} />)}
      </AbsoluteFill>
      {p.subtitle && a.narasi && <Subtitle a={a} huruf={huruf} k={k} tegak={tegak} />}
      {a.audio && <Audio src={a.audio} />}
    </AbsoluteFill>
  );
}

function Logo({ merek, asetDasar, k }) {
  if (!merek?.logo || merek.posisi_logo === "tidak") return null;
  const [v, h] = (merek.posisi_logo || "kanan-atas").split("-").reverse();
  const s = 110 * k;
  return <Img src={srcAset(merek.logo, asetDasar)} style={{ position: "absolute", [v === "atas" ? "top" : "bottom"]: 24 * k, [h === "kiri" ? "left" : "right"]: 24 * k, width: s, height: s, objectFit: "contain" }} />;
}

/** Musik latar berulang; volume mengecil saat narasi berbicara dan memudar di awal & akhir video. */
function Musik({ p }) {
  const { durationInFrames, fps } = useVideoConfig();
  const m = p?.musik;
  if (!m?.src) return null;
  const jendela = jendelaNarasi(p);
  const volume = (f) => volumeMusik(m, jendela, f, durationInFrames);
  return <Audio src={srcAset(m.src, p.asetDasar)} loop volume={volume} />;
}

export const Rakitan = (p) => {
  const { width: lebar, height: tinggi } = useVideoConfig();
  const k = Math.min(lebar, tinggi) / 720;
  const tegak = tinggi > lebar * 1.05;
  const huruf = HURUF[p?.merek?.huruf] || HURUF.Nunito;
  const awal = awalAdegan(p);
  return (
    <AbsoluteFill style={{ background: "#000", fontFamily: huruf }}>
      {(p?.adegan || []).map((a, i) => (
        <Sequence key={i} from={awal[i]} durationInFrames={frameAdegan(a)}>
          <Adegan a={a} p={p} huruf={huruf} k={k} lebar={lebar} tinggi={tinggi} tegak={tegak} />
        </Sequence>
      ))}
      <Logo merek={p?.merek} asetDasar={p?.asetDasar} k={k} />
      <Musik p={p} />
    </AbsoluteFill>
  );
};
Rakitan.metadata = metadataRakitan;

// ===== Pembantu editor =====

let nomor = 0;
export const idBaru = () => `e${Date.now().toString(36)}${(nomor++).toString(36)}`;

export function elemenBaru(tipe, warna = "#2563eb") {
  const dasar = { id: idBaru(), tipe, x: 50, y: 50, rot: 0, gerak: "tidak", masuk: { preset: "pop", mulai: 0.2, durasi: 0.6 }, keluar: { preset: "tidak", pada: null } };
  const gaya = { ukuran: 60, warna: "#1f2937", latar: null, garis: null, tebal: true, miring: false, rata: "tengah", sudut: 0, bayangan: false, buram: 1 };
  if (tipe === "teks") return { ...dasar, isi: "Teks baru", w: 70, h: 15, gaya: { ...gaya, ukuran: 64 }, masuk: { preset: "geser-bawah", mulai: 0.2, durasi: 0.6 } };
  if (tipe === "emoji") return { ...dasar, isi: "⭐", w: 25, h: 25, gaya: { ...gaya, ukuran: 160, emoji: "3d" } };
  if (tipe === "ikon") return { ...dasar, isi: "outline/star", w: 18, h: 18, gaya: { ...gaya, warna } };
  if (tipe === "lottie") return { ...dasar, isi: null, w: 40, h: 40, gaya: { ...gaya, ulang: true, kecepatan: 1 }, masuk: { preset: "pudar", mulai: 0, durasi: 0.4 } };
  if (tipe === "gambar") return { ...dasar, isi: null, w: 40, h: 40, gaya: { ...gaya, sudut: 4 }, masuk: { preset: "zoom", mulai: 0.2, durasi: 0.6 } };
  return { ...dasar, isi: "kotak", w: 30, h: 20, gaya: { ...gaya, warna, sudut: 8 }, masuk: { preset: "zoom", mulai: 0, durasi: 0.5 } };
}

export const adeganBaru = (warna = "#dbeafe") => ({ narasi: "", durasi: 4, transisi: "pudar", kamera: "tidak", latar: { tipe: "gradien", warna: "#ffffff", warna2: warna, gambar: null, redup: 0, hias: "tidak", warna_hias: "#ffffff" }, elemen: [] });

export const NASKAH_CONTOH = {
  rasio: "9:16", judul: "Ayo Bersekolah di Sekolah Kami", subtitle: true,
  merek: { logo: null, posisi_logo: "kanan-atas", huruf: "Nunito", warna: ["#2563eb", "#f59e0b"] },
  adegan: [
    {
      narasi: "Halo! Selamat datang di sekolah kami.", durasi: 4, transisi: "pudar",
      latar: { tipe: "gradien", warna: "#1d4ed8", warna2: "#60a5fa", gambar: null, redup: 0 },
      elemen: [
        { id: "a1", tipe: "emoji", isi: "🏫", x: 50, y: 34, w: 40, h: 22, rot: 0, gerak: "melambung", gaya: { ukuran: 220, warna: "#fff", tebal: true, rata: "tengah", sudut: 0, buram: 1 }, masuk: { preset: "pop", mulai: 0.1, durasi: 0.7 } },
        { id: "a2", tipe: "teks", isi: "Selamat Datang!", x: 50, y: 58, w: 86, h: 12, rot: 0, gerak: "tidak", gaya: { ukuran: 78, warna: "#ffffff", tebal: true, rata: "tengah", sudut: 0, bayangan: true, buram: 1 }, masuk: { preset: "geser-bawah", mulai: 0.5, durasi: 0.6 } },
      ],
    },
    {
      narasi: "Belajar dengan gembira, bermain, dan berkarya bersama teman.", durasi: 5, transisi: "geser",
      latar: { tipe: "warna", warna: "#fef3c7", warna2: "#fde68a", gambar: null, redup: 0 },
      elemen: [
        { id: "b1", tipe: "bentuk", isi: "bulat", x: 50, y: 36, w: 70, h: 39, rot: 0, gerak: "denyut", gaya: { ukuran: 60, warna: "#f59e0b", sudut: 0, buram: 0.9 }, masuk: { preset: "zoom", mulai: 0, durasi: 0.5 } },
        { id: "b2", tipe: "emoji", isi: "📚", x: 36, y: 36, w: 20, h: 12, rot: -10, gerak: "goyang", gaya: { ukuran: 130 }, masuk: { preset: "mantul", mulai: 0.3, durasi: 0.8 } },
        { id: "b3", tipe: "emoji", isi: "🎨", x: 64, y: 36, w: 20, h: 12, rot: 10, gerak: "goyang", gaya: { ukuran: 130 }, masuk: { preset: "mantul", mulai: 0.6, durasi: 0.8 } },
        { id: "b4", tipe: "teks", isi: "Belajar • Bermain • Berkarya", x: 50, y: 64, w: 90, h: 10, rot: 0, gerak: "tidak", gaya: { ukuran: 52, warna: "#92400e", tebal: true, rata: "tengah", sudut: 0, buram: 1 }, masuk: { preset: "ketik", mulai: 0.8, durasi: 1.4 } },
      ],
    },
    {
      narasi: "Pendaftaran murid baru sudah dibuka. Ayo bergabung!", durasi: 5, transisi: "zoom",
      latar: { tipe: "gradien", warna: "#16a34a", warna2: "#4ade80", gambar: null, redup: 0 },
      elemen: [
        { id: "c1", tipe: "teks", isi: "PENDAFTARAN DIBUKA", x: 50, y: 40, w: 88, h: 12, rot: -3, gerak: "denyut", gaya: { ukuran: 70, warna: "#16a34a", latar: "#ffffff", tebal: true, rata: "tengah", sudut: 18, buram: 1 }, masuk: { preset: "pop", mulai: 0.2, durasi: 0.7 } },
        { id: "c2", tipe: "bentuk", isi: "panah", x: 50, y: 58, w: 22, h: 8, rot: 90, gerak: "melambung", gaya: { ukuran: 60, warna: "#fde047", sudut: 0, buram: 1 }, masuk: { preset: "geser-atas", mulai: 0.8, durasi: 0.5 } },
        { id: "c3", tipe: "teks", isi: "Ayo bergabung!", x: 50, y: 72, w: 80, h: 10, rot: 0, gerak: "tidak", gaya: { ukuran: 60, warna: "#ffffff", tebal: true, rata: "tengah", sudut: 0, bayangan: true, buram: 1 }, masuk: { preset: "pudar", mulai: 1.1, durasi: 0.6 } },
      ],
    },
  ],
};
