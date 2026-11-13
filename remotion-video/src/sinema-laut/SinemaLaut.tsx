// Template seri "Sinema Laut Nusantara": drama nelayan vertikal 9:16.
// Satu episode = daftar klip + daftar dialog. Gaya caption meniru template CapCut yang dipakai selama ini
// (Bangers, gradasi hijau→kuning, garis tepi hitam, kata muncul satu per satu).
import { loadFont } from "@remotion/google-fonts/Bangers";
import { Video } from "@remotion/media";
import { AbsoluteFill, Easing, Sequence, Series, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

const { fontFamily: BANGERS } = loadFont("normal", { weights: ["400"], subsets: ["latin"] });

export const FPS = 30;

export type Klip = {
  file: string; // nama file di public/sinema-laut/klip/
  mulai: number; // detik di dalam klip sumber tempat potongan dimulai
  durasi: number; // detik yang dipakai
  isi?: { y: number; tinggi: number }; // area gambar tanpa bar hitam bawaan (px pada bingkai 1080×1920); diisi dari ffmpeg cropdetect
};

export type Dialog = {
  teks: string;
  mulai: number; // detik dari awal episode
  durasi: number;
  kata?: { kata: string; mulai: number }[]; // detik dari awal baris; tanpa ini kata muncul merata
};

export type Episode = {
  judul: string;
  subjudul: string;
  penutup: string;
  klip: Klip[];
  dialog: Dialog[];
};

const f = (detik: number) => Math.round(detik * FPS);

/** Perbesar klip yang punya bar hitam bawaan supaya area gambarnya memenuhi tinggi 1920 dan berada di tengah. */
const gayaIsi = (k: Klip): React.CSSProperties => {
  if (!k.isi || k.isi.tinggi >= 1920) return {};
  const pusat = k.isi.y + k.isi.tinggi / 2;
  return {
    transformOrigin: `50% ${(pusat / 1920) * 100}%`,
    transform: `translateY(${960 - pusat}px) scale(${1920 / k.isi.tinggi})`,
  };
};
export const hitungDurasi = (ep: Episode) => ep.klip.reduce((n, k) => n + f(k.durasi), 0);

const DURASI_JUDUL = 3.2;
const DURASI_PENUTUP = 3;

const Gradasi = "linear-gradient(180deg, #4aff00 0%, #faff00 100%)";

/** Satu baris dialog: kata-kata meletup masuk sesuai waktu ucapnya. */
const BarisDialog: React.FC<{ d: Dialog }> = ({ d }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const kata = d.kata?.length
    ? d.kata
    : d.teks.split(" ").map((k, i, all) => ({ kata: k, mulai: (i / all.length) * d.durasi * 0.6 }));
  const keluar = interpolate(frame, [f(d.durasi) - 5, f(d.durasi)], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 520, opacity: keluar }}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "0 28px", maxWidth: 900 }}>
        {kata.map((k, i) => {
          const s = spring({ frame: frame - f(k.mulai), fps, config: { damping: 11, stiffness: 220, mass: 0.6 } });
          return (
            <span
              key={i}
              style={{
                fontFamily: BANGERS,
                fontSize: 128,
                lineHeight: 1.05,
                letterSpacing: 2,
                backgroundImage: Gradasi,
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
                WebkitTextStroke: "10px #000",
                paintOrder: "stroke fill",
                filter: "drop-shadow(0 8px 0 rgba(0,0,0,0.85))",
                transform: `scale(${interpolate(s, [0, 1], [0.3, 1])}) rotate(${interpolate(s, [0, 1], [-8, 0])}deg)`,
                opacity: s > 0.01 ? 1 : 0,
                display: "inline-block",
              }}
            >
              {k.kata}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/** Kartu pembuka di sepertiga atas, di atas klip pertama. */
const KartuJudul: React.FC<{ judul: string; subjudul: string }> = ({ judul, subjudul }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const masuk = spring({ frame, fps, config: { damping: 200 } });
  const keluar = interpolate(frame, [f(DURASI_JUDUL) - 12, f(DURASI_JUDUL)], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const garis = interpolate(frame, [6, 30], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });

  return (
    <AbsoluteFill style={{ opacity: keluar }}>
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(0,12,24,0.85) 0%, rgba(0,12,24,0) 45%)" }} />
      <AbsoluteFill style={{ alignItems: "center", paddingTop: 230, transform: `translateY(${interpolate(masuk, [0, 1], [-40, 0])}px)`, opacity: masuk }}>
        <div style={{ fontFamily: "Georgia, serif", fontSize: 38, letterSpacing: 18, color: "#cfe9ff", textTransform: "uppercase" }}>
          Sinema Laut Nusantara
        </div>
        <div style={{ width: 520 * garis, height: 4, background: "#faff00", margin: "26px 0 22px" }} />
        <div style={{ fontFamily: BANGERS, fontSize: 150, color: "white", letterSpacing: 4, textAlign: "center", lineHeight: 1, filter: "drop-shadow(0 6px 0 rgba(0,0,0,0.8))" }}>
          {judul}
        </div>
        <div style={{ fontFamily: "Georgia, serif", fontStyle: "italic", fontSize: 44, color: "#cfe9ff", marginTop: 18 }}>{subjudul}</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const KartuPenutup: React.FC<{ teks: string }> = ({ teks }) => {
  const frame = useCurrentFrame();
  const gelap = interpolate(frame, [0, 20], [0, 0.7], { extrapolateRight: "clamp" });
  const muncul = interpolate(frame, [10, 30], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ backgroundColor: `rgba(0,8,18,${gelap})`, justifyContent: "center", alignItems: "center" }}>
      <div style={{ fontFamily: BANGERS, fontSize: 140, color: "white", letterSpacing: 6, opacity: muncul, transform: `scale(${interpolate(muncul, [0, 1], [1.15, 1])})` }}>
        {teks}
      </div>
      <div style={{ fontFamily: "Georgia, serif", fontSize: 34, letterSpacing: 14, color: "#cfe9ff", marginTop: 24, opacity: muncul, textTransform: "uppercase" }}>
        Sinema Laut Nusantara
      </div>
    </AbsoluteFill>
  );
};

export const SinemaLaut: React.FC<Episode> = (ep) => {
  const total = hitungDurasi(ep);
  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      <Series>
        {ep.klip.map((k, i) => (
          <Series.Sequence key={i} name={`${i + 1}. ${k.file}`} durationInFrames={f(k.durasi)}>
            <Video src={staticFile(`sinema-laut/klip/${k.file}`)} trimBefore={f(k.mulai)} objectFit="cover" style={{ width: "100%", height: "100%", ...gayaIsi(k) }} />
          </Series.Sequence>
        ))}
      </Series>

      {/* Vinyet tipis agar terasa sinematik dan caption tetap terbaca. */}
      <AbsoluteFill
        style={{ background: "radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,0.55) 100%)" }}
      />

      {ep.dialog.map((d, i) => (
        <Sequence key={i} name={`“${d.teks}”`} from={f(d.mulai)} durationInFrames={Math.max(1, f(d.durasi))} layout="none">
          <BarisDialog d={d} />
        </Sequence>
      ))}

      <Sequence name="Judul" durationInFrames={f(DURASI_JUDUL)}>
        <KartuJudul judul={ep.judul} subjudul={ep.subjudul} />
      </Sequence>
      <Sequence name="Penutup" from={total - f(DURASI_PENUTUP)}>
        <KartuPenutup teks={ep.penutup} />
      </Sequence>
    </AbsoluteFill>
  );
};
