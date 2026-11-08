// Contoh media belajar untuk anak yang belum lancar membaca: makna pecahan ditunjukkan lewat gambar dan gerak,
// tulisan dibuat sesedikit mungkin dan besar. Urutan: kue utuh → dipotong sama besar → satu potong diambil →
// lambang pecahan muncul dan dihubungkan dengan potongannya.
import { AbsoluteFill, Easing, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

export type PecahanKueProps = {
  bagian: number; // penyebut: kue dipotong menjadi berapa bagian sama besar
  diambil: number; // pembilang: berapa potong yang diambil
  warna: string;
};

const PUSAT = { x: 640, y: 380 };
const JARI = 210;

/** Satu potongan lingkaran (juring) dari sudut a ke b, dalam radian. */
function juring(a: number, b: number, r: number): string {
  const x1 = Math.cos(a) * r, y1 = Math.sin(a) * r;
  const x2 = Math.cos(b) * r, y2 = Math.sin(b) * r;
  return `M 0 0 L ${x1} ${y1} A ${r} ${r} 0 ${b - a > Math.PI ? 1 : 0} 1 ${x2} ${y2} Z`;
}

const Tulisan: React.FC<{ teks: string; muncul: number; y: number; ukuran?: number }> = ({ teks, muncul, y, ukuran = 64 }) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame - muncul, [0, 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ position: "absolute", top: y, width: "100%", textAlign: "center", fontSize: ukuran, fontWeight: 800,
      color: "#1f2937", opacity: t, transform: `translateY(${(1 - t) * 20}px)`, fontFamily: "Arial, sans-serif" }}>
      {teks}
    </div>
  );
};

export const PecahanKue: React.FC<PecahanKueProps> = ({ bagian, diambil, warna }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const n = Math.max(2, Math.min(8, Math.round(bagian)));
  const k = Math.max(1, Math.min(n, Math.round(diambil)));

  // 0–60: kue muncul; 60–120: garis potong; 120–180: potongan merenggang; 180–240: potongan diambil; 240+: lambang pecahan
  const muncul = spring({ frame, fps, config: { damping: 12 } });
  const potong = interpolate(frame, [60, 110], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });
  const renggang = spring({ frame: frame - 120, fps, config: { damping: 14 } });
  const ambil = spring({ frame: frame - 180, fps, config: { damping: 10, mass: 0.8 } });
  const lambang = spring({ frame: frame - 240, fps, config: { damping: 12 } });

  const potongan = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const b = ((i + 1) / n) * Math.PI * 2 - Math.PI / 2;
    const tengah = (a + b) / 2;
    const terpilih = i < k;
    // Potongan yang diambil terangkat keluar; potongan lain tetap di piring
    const geser = 14 * renggang + (terpilih ? 70 * ambil : 0);
    return { a, b, tengah, terpilih, dx: Math.cos(tengah) * geser, dy: Math.sin(tengah) * geser };
  });

  return (
    <AbsoluteFill style={{ background: "linear-gradient(180deg, #fff7e6 0%, #fde68a 100%)" }}>
      <svg width={1280} height={720} style={{ position: "absolute" }}>
        <g transform={`translate(${PUSAT.x - 120 * lambang} ${PUSAT.y}) scale(${muncul})`}>
          {/* piring */}
          <ellipse cx={0} cy={18} rx={JARI + 40} ry={JARI + 40} fill="#ffffff" opacity={0.85} />
          {potongan.map((p, i) => (
            <g key={i} transform={`translate(${p.dx} ${p.dy}) scale(${p.terpilih ? 1 + 0.08 * ambil : 1})`} opacity={p.terpilih ? 1 : 1 - 0.45 * ambil}>
              <path d={juring(p.a, p.b, JARI)} fill={p.terpilih && ambil > 0.05 ? warna : "#fbbf24"} stroke="#92400e" strokeWidth={p.terpilih ? 4 + 3 * ambil : 4} />
              {/* krim di tepi kue */}
              <path d={juring(p.a, p.b, JARI * 0.9)} fill="none" stroke="#fff" strokeWidth={6} strokeDasharray="4 14" opacity={0.8} />
            </g>
          ))}
          {/* garis potong yang digambar */}
          {potongan.map((p, i) => (
            <line key={`g${i}`} x1={0} y1={0} x2={Math.cos(p.a) * JARI * potong} y2={Math.sin(p.a) * JARI * potong}
              stroke="#7c2d12" strokeWidth={6} strokeLinecap="round" opacity={1 - renggang} />
          ))}
        </g>
      </svg>

      {/* Hitungan potongan dengan titik (tanpa harus membaca angka) */}
      <Sequence from={130} durationInFrames={110}>
        <div style={{ position: "absolute", bottom: 20, width: "100%", display: "flex", justifyContent: "center", gap: 18 }}>
          {Array.from({ length: n }, (_, i) => {
            const t = interpolate(frame - 130 - i * 8, [0, 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            return <div key={i} style={{ width: 46, height: 46, borderRadius: 23, background: "#fbbf24", border: "4px solid #92400e", transform: `scale(${t})` }} />;
          })}
        </div>
      </Sequence>

      {/* Lambang pecahan: pembilang = potong yang diambil, penyebut = semua potong */}
      <div style={{ position: "absolute", right: 150, top: 200, opacity: lambang, transform: `scale(${0.6 + 0.4 * lambang})`,
        fontFamily: "Arial, sans-serif", fontWeight: 900, color: "#1f2937", textAlign: "center", width: 200 }}>
        <div style={{ fontSize: 120, lineHeight: 1, color: warna }}>{k}</div>
        <div style={{ height: 10, background: "#1f2937", borderRadius: 5, margin: "10px 0" }} />
        <div style={{ fontSize: 120, lineHeight: 1 }}>{n}</div>
      </div>

      <Tulisan teks={k === 1 && n === 4 ? "seperempat" : `${k} per ${n}`} muncul={270} y={590} ukuran={72} />
    </AbsoluteFill>
  );
};
