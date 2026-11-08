// Bagian bersama templat video belajar (Remotion). Dipakai pratinjau di aplikasi (@remotion/player),
// layanan render di server (services/video-render), dan Studio di remotion-video. Tanpa TypeScript agar bisa
// diimpor langsung oleh Next.js maupun bundler Remotion. Semua ukuran mengikuti bingkai (rasio aspek apa pun).
import React from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

export const FPS = 30;
// Rasio aspek → ukuran bingkai (sekitar 720p agar render cepat dan berkas kecil)
export const RASIO = {
  "16:9": { lebar: 1280, tinggi: 720, label: "16:9 mendatar (proyektor, YouTube)" },
  "9:16": { lebar: 720, tinggi: 1280, label: "9:16 tegak (Reels, TikTok, Status WA)" },
  "1:1": { lebar: 1080, tinggi: 1080, label: "1:1 persegi (feed Instagram/Facebook)" },
  "4:3": { lebar: 1024, tinggi: 768, label: "4:3 (layar kelas lama)" },
};
export const ukuranRasio = (r) => RASIO[r] || RASIO["16:9"];
export const LEBAR = 1280;
export const TINGGI = 720;
export const DETIK_PEMBUKA = 4;
export const DETIK_PENUTUP = 4;
export const HURUF = "'Nunito', 'Noto Sans', 'DejaVu Sans', Arial, sans-serif";

/** Skala ukuran terhadap bingkai acuan 720 px (sisi terpendek) dan apakah bingkai tegak. */
export function useBingkai() {
  const { width, height } = useVideoConfig();
  return { k: Math.min(width, height) / 720, tegak: height > width * 1.05, lebar: width, tinggi: height };
}

/** Perkiraan lama adegan dari teks narasi (sekitar 2,3 kata per detik untuk anak), 4–20 detik. */
export function estimasiDetik(narasi) {
  const kata = String(narasi || "").trim().split(/\s+/).filter(Boolean).length;
  return Math.min(20, Math.max(4, kata / 2.3 + 1.5));
}

/** Lama satu adegan (detik): panjang rekaman narasi bila ada, ditambah jeda; selain itu perkiraan. */
export const detikAdegan = (a, minimal = 4) => Math.max(minimal, a?.detik ? a.detik + 1.2 : estimasiDetik(a?.narasi));

/** Total frame video: pembuka + semua adegan + penutup. */
export function hitungDurasi(props, minimal = 4) {
  const pembuka = props?.pembuka?.detik ? Math.max(DETIK_PEMBUKA, props.pembuka.detik + 1) : DETIK_PEMBUKA;
  const penutup = props?.penutup?.detik ? Math.max(DETIK_PENUTUP, props.penutup.detik + 1) : DETIK_PENUTUP;
  const isi = (props?.adegan || []).reduce((t, a) => t + detikAdegan(a, minimal), 0);
  return Math.max(1, Math.round((pembuka + isi + penutup) * FPS));
}

/** Metadata komposisi dari props: durasi & ukuran bingkai sesuai rasio. */
export function metadata(props, minimal) {
  const { lebar, tinggi } = ukuranRasio(props?.rasio);
  return { durationInFrames: hitungDurasi(props, minimal), width: lebar, height: tinggi };
}

export const Latar = ({ warna = "#f59e0b", children }) => (
  <AbsoluteFill style={{ background: `radial-gradient(circle at 30% 20%, #ffffff 0%, ${warna}33 55%, ${warna}66 100%)`, fontFamily: HURUF }}>
    {children}
  </AbsoluteFill>
);

/** Muncul dengan pegas (skala) mulai frame tertentu. */
export function useMuncul(mulai = 0, redam = 12) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - mulai, fps, config: { damping: redam } });
}

export const Emoji = ({ isi, ukuran = 200, style }) => {
  const { k } = useBingkai();
  return (
    <span role="img" aria-label="gambar" style={{ fontSize: ukuran * k, lineHeight: 1, display: "inline-block", fontFamily: "'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif", ...style }}>{isi}</span>
  );
};

export const TeksBesar = ({ children, ukuran = 72, warna = "#1f2937", mulai = 0, style }) => {
  const frame = useCurrentFrame();
  const { k } = useBingkai();
  const t = interpolate(frame - mulai, [0, 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return <div style={{ fontSize: ukuran * k, fontWeight: 900, color: warna, textAlign: "center", opacity: t, transform: `translateY(${(1 - t) * 24 * k}px)`, padding: `0 ${30 * k}px`, ...style }}>{children}</div>;
};

/** Suara narasi adegan (bila sudah dibuat oleh layanan render). */
export const Narasi = ({ src, volume = 1 }) => (src ? <Audio src={src} volume={volume} /> : null);

const Pembuka = ({ judul, emoji, warna, audio }) => {
  const s = useMuncul(0, 10);
  const { k } = useBingkai();
  return (
    <Latar warna={warna}>
      <Narasi src={audio} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 20 * k }}>
        <div style={{ transform: `scale(${s}) rotate(${(1 - s) * -20}deg)` }}><Emoji isi={emoji || "📚"} ukuran={220} /></div>
        <TeksBesar ukuran={78} mulai={10}>{judul}</TeksBesar>
        <TeksBesar ukuran={40} warna="#4b5563" mulai={22}>Ayo belajar bersama!</TeksBesar>
      </AbsoluteFill>
    </Latar>
  );
};

const Penutup = ({ teks, warna, audio }) => {
  const s = useMuncul(0, 8);
  const { k } = useBingkai();
  return (
    <Latar warna={warna}>
      <Narasi src={audio} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 16 * k }}>
        <div style={{ transform: `scale(${s})` }}><Emoji isi="🌟" ukuran={200} /></div>
        <TeksBesar ukuran={70} mulai={8}>{teks || "Hebat! Kamu sudah belajar."}</TeksBesar>
      </AbsoluteFill>
    </Latar>
  );
};

/**
 * Kerangka video: pembuka, adegan berurutan (masing-masing dengan narasinya), penutup.
 * Adegan dirender oleh komponen `Isi` milik templat ({ adegan, indeks, jumlah, warna }).
 */
export function KerangkaVideo({ props, Isi, minimal = 4 }) {
  const { judul = "Video Belajar", emoji, warna = "#f59e0b", adegan = [], pembuka, penutup } = props || {};
  const { k } = useBingkai();
  const fPembuka = Math.round((pembuka?.detik ? Math.max(DETIK_PEMBUKA, pembuka.detik + 1) : DETIK_PEMBUKA) * FPS);
  let posisi = fPembuka;
  const urutan = adegan.map((a, i) => {
    const durasi = Math.round(detikAdegan(a, minimal) * FPS);
    const dari = posisi;
    posisi += durasi;
    return { a, i, dari, durasi };
  });
  const fPenutup = Math.round((penutup?.detik ? Math.max(DETIK_PENUTUP, penutup.detik + 1) : DETIK_PENUTUP) * FPS);
  return (
    <AbsoluteFill style={{ background: "#fff" }}>
      <Sequence durationInFrames={fPembuka}><Pembuka judul={judul} emoji={emoji} warna={warna} audio={pembuka?.audio} /></Sequence>
      {urutan.map(({ a, i, dari, durasi }) => (
        <Sequence key={i} from={dari} durationInFrames={durasi}>
          <Latar warna={warna}>
            <Narasi src={a.audio} />
            <Isi adegan={a} indeks={i} jumlah={adegan.length} warna={warna} semua={adegan} />
            <div style={{ position: "absolute", bottom: 18 * k, right: 28 * k, fontSize: 26 * k, color: "#6b7280", fontWeight: 700 }}>{i + 1}/{adegan.length}</div>
          </Latar>
        </Sequence>
      ))}
      <Sequence from={posisi} durationInFrames={fPenutup}><Penutup teks={penutup?.teks} warna={warna} audio={penutup?.audio} /></Sequence>
    </AbsoluteFill>
  );
}

/** Teks narasi pembuka & penutup bawaan (ikut dibacakan bila narasi suara aktif). */
export { narasiPembuka, narasiPenutup } from "./narasi.js";
