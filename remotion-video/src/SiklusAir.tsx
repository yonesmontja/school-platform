// Video belajar "Siklus Air" (jalur A, dibuat Claude). Satu pemandangan utuh (gunung, hutan, laut, matahari, langit)
// yang berubah per adegan, mengikuti narasi Piper di public/narasi/siklus-air. Tulisan sedikit dan besar.
import { AbsoluteFill, Audio, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import durasi from "../public/narasi/siklus-air/durasi.json";

const FPS = 30;
const JEDA = 1.8; // detik setelah narasi tiap adegan
export const ADEGAN = Object.values(durasi as Record<string, number>).map((d) => Math.round((d + JEDA) * FPS));
export const TOTAL = ADEGAN.reduce((a, b) => a + b, 0);
const MULAI = ADEGAN.map((_, i) => ADEGAN.slice(0, i).reduce((a, b) => a + b, 0));
const LABEL = ["Siklus Air", "Matahari memanaskan air", "Penguapan", "Pengembunan", "Hujan", "Air mengalir", "Terus berputar", "Ayo hemat air!"];
const HURUF = "'Nunito', 'Noto Sans', 'DejaVu Sans', Arial, sans-serif";
const klem = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Adegan aktif & frame lokal di dalamnya. */
function posisi(frame: number) {
  let i = MULAI.findIndex((m, k) => frame >= m && frame < m + ADEGAN[k]);
  if (i < 0) i = ADEGAN.length - 1;
  return { i, lokal: frame - MULAI[i] };
}

const Awan = ({ x, y, s, gelap }: { x: number; y: number; s: number; gelap: number }) => {
  const warna = `rgb(${255 - 110 * gelap}, ${255 - 105 * gelap}, ${255 - 90 * gelap})`;
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {[[-70, 10, 55], [-20, -20, 70], [45, -5, 60], [90, 18, 45], [10, 25, 60]].map(([cx, cy, r], k) => <circle key={k} cx={cx} cy={cy} r={r} fill={warna} />)}
    </g>
  );
};

export const SiklusAir: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { i, lokal } = posisi(frame);
  const t = (dari: number, ke: number) => interpolate(lokal, [dari, ke], [0, 1], klem);
  const sudah = (k: number) => i > k || (i === k);

  // Keadaan elemen per adegan (tetap setelah tercapai, kecuali yang hanya sesaat)
  const panas = i === 1 ? t(0, 40) : i >= 2 && i <= 2 ? 1 : i === 6 ? t(0, 30) : 0.25;
  const uap = i === 2 ? t(0, 20) : i === 6 ? interpolate(lokal, [60, 90, 150, 180], [0, 1, 1, 0], klem) : 0;
  const awanBesar = i < 3 ? 0.35 : i === 3 ? 0.35 + 0.65 * t(0, 90) : 1;
  const awanGelap = i < 3 ? 0 : i === 3 ? t(60, 140) : i === 4 ? 1 : i === 5 ? 1 - t(0, 60) : i === 6 ? interpolate(lokal, [120, 170, 230, 280], [0, 1, 1, 0.2], klem) : 0.2;
  const hujan = i === 4 ? t(10, 30) : i === 6 ? interpolate(lokal, [170, 190, 240, 260], [0, 1, 1, 0], klem) : 0;
  const sungai = i === 5 ? t(0, 50) : i === 6 ? 1 : i === 7 ? 1 : i >= 5 ? 1 : 0;
  const putar = i === 6 ? t(20, 60) : i === 7 ? 1 : 0;

  const rotasiMatahari = frame * 0.6;
  const ombak = Math.sin(frame / 12) * 8;
  const munculLabel = spring({ frame: lokal - 6, fps, config: { damping: 12 } });

  return (
    <AbsoluteFill style={{ fontFamily: HURUF }}>
      {/* Narasi per adegan */}
      {ADEGAN.map((d, k) => <Sequence key={k} from={MULAI[k]} durationInFrames={d}><Audio src={staticFile(`narasi/siklus-air/s${k + 1}.wav`)} /></Sequence>)}

      <svg width={1280} height={720} viewBox="0 0 1280 720" style={{ position: "absolute" }}>
        <defs>
          <linearGradient id="langit" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={awanGelap > 0.6 ? "#94a3b8" : "#7dd3fc"} />
            <stop offset="1" stopColor="#e0f2fe" />
          </linearGradient>
          <linearGradient id="laut" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#38bdf8" /><stop offset="1" stopColor="#0369a1" /></linearGradient>
          <marker id="panah" markerWidth="10" markerHeight="10" refX="6" refY="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#f97316" /></marker>
        </defs>
        <rect width="1280" height="720" fill="url(#langit)" />

        {/* Matahari */}
        <g transform={`translate(1090 120) rotate(${rotasiMatahari})`}>
          {Array.from({ length: 12 }, (_, k) => (
            <line key={k} x1={0} y1={-70 - 18 * panas} x2={0} y2={-100 - 40 * panas} stroke="#f59e0b" strokeWidth={8} strokeLinecap="round" transform={`rotate(${k * 30})`} />
          ))}
          <circle r={60 + 8 * panas} fill="#fbbf24" />
          <circle r={60 + 8 * panas} fill="#fde047" opacity={0.4 + 0.5 * panas} />
        </g>

        {/* Gunung & hutan (kiri) */}
        <path d="M -40 600 L 180 250 L 300 380 L 420 230 L 640 600 Z" fill="#65a30d" />
        <path d="M 160 282 L 180 250 L 202 285 Z M 400 262 L 420 230 L 444 266 Z" fill="#f8fafc" />
        <path d="M -40 600 L 640 600 L 640 720 L -40 720 Z" fill="#4d7c0f" />
        {[[90, 560], [150, 585], [230, 560], [320, 590], [420, 565], [500, 590]].map(([x, y], k) => (
          <text key={k} x={x} y={y} fontSize={56} textAnchor="middle">🌳</text>
        ))}

        {/* Laut (kanan) dengan ombak */}
        <path d={`M 640 560 Q 760 ${545 + ombak} 880 560 T 1120 560 T 1360 560 L 1360 720 L 640 720 Z`} fill="url(#laut)" />
        <path d={`M 640 590 Q 760 ${578 - ombak} 880 590 T 1120 590 T 1360 590`} fill="none" stroke="#e0f2fe" strokeWidth={4} opacity={0.6} />
        {panas > 0.5 && <text x={1000} y={660} fontSize={34} textAnchor="middle" fill="#fef3c7" fontWeight={800} opacity={panas}>~ hangat ~</text>}

        {/* Sungai dari gunung ke laut */}
        <path d="M 420 300 C 470 420, 520 460, 560 520 S 620 590, 660 600" fill="none" stroke="#38bdf8" strokeWidth={18} strokeLinecap="round"
          strokeDasharray="600" strokeDashoffset={600 * (1 - sungai)} />
        {sungai > 0.9 && (
          <path d="M 420 300 C 470 420, 520 460, 560 520 S 620 590, 660 600" fill="none" stroke="#e0f2fe" strokeWidth={5} strokeDasharray="14 22" strokeDashoffset={-frame * 2} />
        )}

        {/* Uap air naik dari laut */}
        {Array.from({ length: 10 }, (_, k) => {
          const siklus = ((frame + k * 17) % 90) / 90;
          const x = 720 + k * 52 + Math.sin(frame / 10 + k) * 12;
          const y = 540 - siklus * 330;
          return <circle key={k} cx={x} cy={y} r={7 + 6 * siklus} fill="#ffffff" opacity={uap * (1 - siklus) * 0.9} />;
        })}
        {uap > 0.3 && <path d="M 980 520 L 980 260" stroke="#f97316" strokeWidth={6} markerEnd="url(#panah)" opacity={uap} strokeDasharray="12 10" />}

        {/* Awan */}
        <Awan x={760} y={150} s={awanBesar} gelap={awanGelap} />
        <Awan x={430} y={130} s={awanBesar * 0.9} gelap={awanGelap} />
        {i >= 3 && i !== 7 && <Awan x={600} y={95} s={awanBesar * 0.75} gelap={awanGelap} />}

        {/* Hujan di atas gunung */}
        {Array.from({ length: 36 }, (_, k) => {
          const x = 300 + (k % 12) * 45 + (k > 11 ? 20 : 0);
          const jatuh = ((frame * 9 + k * 37) % 330);
          return <line key={k} x1={x} y1={190 + jatuh} x2={x - 6} y2={215 + jatuh} stroke="#1d4ed8" strokeWidth={4} strokeLinecap="round" opacity={hujan * 0.85} />;
        })}

        {/* Lingkaran siklus */}
        {putar > 0 && (
          <g opacity={putar} transform={`translate(640 330)`}>
            <circle r={250} fill="none" stroke="#f97316" strokeWidth={7} strokeDasharray="30 18" strokeDashoffset={-frame * 1.5} />
            {[["☀️ Penguapan", 230, -60], ["☁️ Pengembunan", 0, -265], ["🌧️ Hujan", -250, -40], ["🏞️ Mengalir", -20, 245]].map(([teks, x, y], k) => (
              <text key={k} x={x as number} y={y as number} fontSize={34} fontWeight={900} textAnchor="middle" fill="#1f2937" stroke="#ffffff" strokeWidth={7} paintOrder="stroke"
                opacity={interpolate(lokal - 40 - k * 25, [0, 12], [0, 1], klem)}>{teks as string}</text>
            ))}
          </g>
        )}
      </svg>

      {/* Judul adegan */}
      <div style={{ position: "absolute", top: i === 0 || i === 7 ? 250 : 28, left: 0, right: 0, textAlign: "center", transform: `scale(${0.7 + 0.3 * munculLabel})`, opacity: munculLabel }}>
        <span style={{ fontSize: i === 0 || i === 7 ? 96 : 58, fontWeight: 900, color: "#0f172a", background: "#ffffffd9", padding: "6px 30px", borderRadius: 24, boxShadow: "0 6px 0 #0001" }}>
          {i === 0 ? "💧 " : ""}{LABEL[i]}
        </span>
      </div>
      {i === 0 && <div style={{ position: "absolute", top: 400, width: "100%", textAlign: "center", fontSize: 40, fontWeight: 800, color: "#334155", opacity: interpolate(lokal, [25, 40], [0, 1], klem) }}>Ayo belajar bersama!</div>}
      <div style={{ position: "absolute", bottom: 14, right: 24, fontSize: 24, fontWeight: 800, color: "#ffffffcc" }}>{i + 1}/{ADEGAN.length}</div>
    </AbsoluteFill>
  );
};

