// Komposisi "Rakitan" (Studio Rakit Video, D1): merender naskah JSON buatan guru — adegan berisi latar dan elemen
// (teks, emoji, gambar, bentuk) dengan animasi masuk, gerak berulang, transisi, narasi, subtitle, dan merek sekolah.
// Posisi & ukuran elemen dalam persen bingkai sehingga satu naskah cocok untuk semua rasio. Naskah tidak terikat
// Remotion: komponen ini hanya salah satu "penulis render"; bentuk naskahnya sama dengan App\Services\NaskahVideo.
import React from "react";
import { AbsoluteFill, Audio, Easing, Img, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { FPS, estimasiDetik, ukuranRasio } from "./umum.jsx";

export const MASUK = [
  ["pudar", "Pudar"], ["geser-kiri", "Geser dari kiri"], ["geser-kanan", "Geser dari kanan"], ["geser-atas", "Turun dari atas"],
  ["geser-bawah", "Naik dari bawah"], ["pop", "Pop (memantul)"], ["zoom", "Membesar"], ["putar", "Berputar masuk"],
  ["mantul", "Jatuh memantul"], ["ketik", "Mengetik (teks)"], ["sapu", "Disapu"], ["tidak", "Langsung muncul"],
];
export const GERAK = [["tidak", "Diam"], ["melambung", "Melayang"], ["denyut", "Berdenyut"], ["goyang", "Bergoyang"], ["putar", "Berputar terus"]];
export const KELUAR = [["tidak", "Langsung hilang"], ["pudar", "Memudar"], ["geser-kiri", "Geser ke kiri"], ["geser-kanan", "Geser ke kanan"],
  ["geser-atas", "Naik ke atas"], ["geser-bawah", "Turun ke bawah"], ["zoom", "Mengecil"]];
export const TRANSISI = [["pudar", "Pudar"], ["geser", "Geser"], ["zoom", "Zoom"], ["tidak", "Langsung"]];
export const BENTUK = [["kotak", "Kotak"], ["bulat", "Bulat/elips"], ["lingkaran", "Lingkaran garis"], ["panah", "Panah"], ["bintang", "Bintang"], ["garis", "Garis"]];
export const HURUF = {
  "Nunito": "'Nunito', 'Noto Sans', 'DejaVu Sans', Arial, sans-serif",
  "Noto Sans": "'Noto Sans', 'DejaVu Sans', Arial, sans-serif",
  "Noto Serif": "'Noto Serif', 'DejaVu Serif', Georgia, serif",
  "DejaVu Sans": "'DejaVu Sans', Verdana, sans-serif",
};
const EMOJI = "'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif";
const jepit = { extrapolateLeft: "clamp", extrapolateRight: "clamp" };

/** Lama adegan (detik): durasi manual (tidak lebih pendek dari narasinya) atau perkiraan dari narasi. */
export function detikAdeganRakitan(a) {
  const audio = a?.detik ? a.detik + 0.8 : 0;
  const dasar = a?.durasi ? a.durasi : (String(a?.narasi || "").trim() ? estimasiDetik(a.narasi) : 4);
  return Math.min(40, Math.max(2, dasar, audio));
}
export const hitungDurasiRakitan = (p) => Math.max(1, (p?.adegan || []).reduce((n, a) => n + Math.round(detikAdeganRakitan(a) * FPS), 0));
export function metadataRakitan(p) {
  const { lebar, tinggi } = ukuranRasio(p?.rasio);
  return { durationInFrames: hitungDurasiRakitan(p), width: lebar, height: tinggi };
}
/** Frame awal tiap adegan. */
export function awalAdegan(p) {
  let n = 0;
  return (p?.adegan || []).map((a) => { const d = n; n += Math.round(detikAdeganRakitan(a) * FPS); return d; });
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
  const mulai = Math.round((e.masuk?.mulai || 0) * fps);
  const dur = Math.max(1, Math.round((e.masuk?.durasi || 0.6) * fps));
  const f = frame - mulai;
  const t = interpolate(f, [0, dur], [0, 1], { ...jepit, easing: Easing.out(Easing.cubic) });
  const pegas = spring({ frame: f, fps, config: { damping: 9 }, durationInFrames: Math.round(dur * 1.6) });
  const ada = f >= 0 ? 1 : 0;
  let op = t, tx = 0, ty = 0, sc = 1, rot = 0, clip, nKetik = null;
  switch (e.masuk?.preset) {
    case "tidak": op = ada; break;
    case "geser-kiri": tx = (t - 1) * lebar * 0.35; break;
    case "geser-kanan": tx = (1 - t) * lebar * 0.35; break;
    case "geser-atas": ty = (t - 1) * tinggi * 0.35; break;
    case "geser-bawah": ty = (1 - t) * tinggi * 0.35; break;
    case "pop": sc = pegas; op = Math.min(1, t * 3); break;
    case "zoom": sc = 0.3 + 0.7 * t; break;
    case "putar": rot = (1 - t) * -200; sc = 0.2 + 0.8 * t; break;
    case "mantul": ty = (pegas - 1) * tinggi * 0.45; op = ada; break;
    case "sapu": clip = `inset(0 ${(1 - t) * 100}% 0 0)`; op = ada; break;
    case "ketik": if (e.tipe === "teks") { nKetik = Math.floor(interpolate(f, [0, dur], [0, String(e.isi).length], jepit)); op = ada; } break;
    default: break;
  }
  // Animasi keluar (opsional): elemen hilang pada detik tertentu dalam adegan
  if (e.keluar?.pada != null) {
    const pada = Math.round(e.keluar.pada * fps);
    const tk = interpolate(frame - pada, [0, 12], [0, 1], { ...jepit, easing: Easing.in(Easing.cubic) });
    switch (e.keluar.preset) {
      case "pudar": op *= 1 - tk; break;
      case "geser-kiri": tx -= tk * lebar * 0.4; op *= 1 - tk; break;
      case "geser-kanan": tx += tk * lebar * 0.4; op *= 1 - tk; break;
      case "geser-atas": ty -= tk * tinggi * 0.4; op *= 1 - tk; break;
      case "geser-bawah": ty += tk * tinggi * 0.4; op *= 1 - tk; break;
      case "zoom": sc *= 1 - 0.8 * tk; op *= 1 - tk; break;
      default: if (frame >= pada) op = 0;
    }
  }
  const detik = Math.max(0, f) / fps;
  switch (e.gerak) {
    case "melambung": ty += Math.sin(detik * Math.PI * 1.1) * 10 * k; break;
    case "denyut": sc *= 1 + 0.06 * Math.sin(detik * Math.PI * 2.2); break;
    case "goyang": rot += Math.sin(detik * Math.PI * 1.8) * 6; break;
    case "putar": rot += detik * 45; break;
    default: break;
  }
  const g = e.gaya || {};
  const kotak = {
    position: "absolute", left: `${e.x}%`, top: `${e.y}%`, width: `${e.w}%`,
    ...(e.tipe === "teks" ? {} : { height: `${e.h}%` }),
    transform: `translate(-50%, -50%) translate(${tx}px, ${ty}px) rotate(${(e.rot || 0) + rot}deg) scale(${sc})`,
    opacity: op * (g.buram ?? 1), clipPath: clip, WebkitClipPath: clip,
    filter: g.bayangan && e.tipe !== "teks" ? `drop-shadow(0 ${6 * k}px ${10 * k}px rgba(0,0,0,.35))` : undefined,
  };
  if (e.tipe === "teks") {
    const isi = nKetik === null ? e.isi : String(e.isi).slice(0, nKetik);
    return (
      <div style={{
        ...kotak, fontFamily: huruf, fontSize: (g.ukuran || 60) * k, lineHeight: 1.18, color: g.warna, fontWeight: g.tebal ? 800 : 400,
        fontStyle: g.miring ? "italic" : "normal", textAlign: { kiri: "left", kanan: "right" }[g.rata] || "center", whiteSpace: "pre-wrap", overflowWrap: "anywhere",
        background: g.latar || undefined, padding: g.latar ? `${0.25 * (g.ukuran || 60) * k}px ${0.45 * (g.ukuran || 60) * k}px` : 0, borderRadius: (g.sudut || 0) * k,
        WebkitTextStroke: g.garis ? `${Math.max(1, (g.ukuran || 60) * k * 0.05)}px ${g.garis}` : undefined, paintOrder: "stroke fill",
        textShadow: g.bayangan ? `0 ${4 * k}px ${10 * k}px rgba(0,0,0,.45)` : undefined,
      }}>{isi}</div>
    );
  }
  if (e.tipe === "emoji") {
    return <div style={{ ...kotak, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: EMOJI, fontSize: (g.ukuran || 120) * k, lineHeight: 1 }}>{e.isi}</div>;
  }
  if (e.tipe === "gambar") {
    const src = srcAset(e.isi, asetDasar);
    return <div style={{ ...kotak, borderRadius: (g.sudut || 0) * k, overflow: "hidden" }}>{src && <Img src={src} style={{ width: "100%", height: "100%", objectFit: "contain" }} />}</div>;
  }
  return <div style={kotak}><Bentuk isi={e.isi} g={g} /></div>;
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

/** Potong narasi menjadi baris subtitle (± 8 kata) dengan waktu sebanding jumlah kata. */
export function barisSubtitle(narasi, detikBicara) {
  const kata = String(narasi || "").trim().split(/\s+/).filter(Boolean);
  if (!kata.length) return [];
  const potong = [];
  let buf = [];
  kata.forEach((w, i) => {
    buf.push(w);
    if (buf.length >= 8 || /[.!?]$/.test(w) || (buf.length >= 5 && /[,;:]$/.test(w)) || i === kata.length - 1) { potong.push(buf.join(" ")); buf = []; }
  });
  const total = kata.length;
  let jalan = 0;
  return potong.map((b) => { const n = b.split(" ").length; const r = { teks: b, dari: (jalan / total) * detikBicara, sampai: ((jalan + n) / total) * detikBicara }; jalan += n; return r; });
}

function Subtitle({ a, huruf, k, tegak }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const bicara = a.detik || Math.max(1, detikAdeganRakitan(a) - 0.6);
  const baris = barisSubtitle(a.narasi, bicara).find((b) => frame / fps >= b.dari && frame / fps < b.sampai);
  if (!baris) return null;
  return (
    <div style={{ position: "absolute", left: "6%", right: "6%", bottom: tegak ? "17%" : "6%", display: "flex", justifyContent: "center" }}>
      <span style={{ fontFamily: huruf, fontSize: 34 * k, fontWeight: 700, color: "#fff", background: "rgba(0,0,0,.62)", padding: `${6 * k}px ${16 * k}px`, borderRadius: 10 * k, textAlign: "center", lineHeight: 1.3 }}>{baris.teks}</span>
    </div>
  );
}

function Adegan({ a, p, huruf, k, lebar, tinggi, tegak }) {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [0, 12], [0, 1], { ...jepit, easing: Easing.out(Easing.cubic) });
  const tr = a.transisi === "tidak" ? {} : a.transisi === "geser" ? { transform: `translateX(${(1 - t) * 100}%)` }
    : a.transisi === "zoom" ? { transform: `scale(${1.15 - 0.15 * t})`, opacity: t } : { opacity: t };
  return (
    <AbsoluteFill style={tr}>
      <Latar l={a.latar} asetDasar={p.asetDasar} />
      {(a.elemen || []).map((e) => <ElemenRakitan key={e.id} e={e} huruf={huruf} asetDasar={p.asetDasar} k={k} lebar={lebar} tinggi={tinggi} />)}
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
function Musik({ p, awal }) {
  const { durationInFrames, fps } = useVideoConfig();
  const m = p?.musik;
  if (!m?.src) return null;
  const jendela = (p.adegan || []).map((a, i) => (a.audio && a.detik ? [awal[i], awal[i] + Math.round(a.detik * fps)] : null)).filter(Boolean);
  const volume = (f) => {
    const redam = m.redam !== false && jendela.some(([d, s]) => f >= d - 6 && f <= s + 6) ? 0.3 : 1;
    const pudar = Math.min(1, f / 15, (durationInFrames - f) / 30);
    return Math.max(0, (m.volume ?? 0.35) * redam * pudar);
  };
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
        <Sequence key={i} from={awal[i]} durationInFrames={Math.round(detikAdeganRakitan(a) * FPS)}>
          <Adegan a={a} p={p} huruf={huruf} k={k} lebar={lebar} tinggi={tinggi} tegak={tegak} />
        </Sequence>
      ))}
      <Logo merek={p?.merek} asetDasar={p?.asetDasar} k={k} />
      <Musik p={p} awal={awal} />
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
  if (tipe === "emoji") return { ...dasar, isi: "⭐", w: 25, h: 25, gaya: { ...gaya, ukuran: 160 } };
  if (tipe === "gambar") return { ...dasar, isi: null, w: 40, h: 40, gaya: { ...gaya, sudut: 4 }, masuk: { preset: "zoom", mulai: 0.2, durasi: 0.6 } };
  return { ...dasar, isi: "kotak", w: 30, h: 20, gaya: { ...gaya, warna, sudut: 8 }, masuk: { preset: "zoom", mulai: 0, durasi: 0.5 } };
}

export const adeganBaru = (warna = "#dbeafe") => ({ narasi: "", durasi: 4, transisi: "pudar", latar: { tipe: "gradien", warna: "#ffffff", warna2: warna, gambar: null, redup: 0 }, elemen: [] });

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
