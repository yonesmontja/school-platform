// Templat "Pecahan": benda bulat (kue/pizza/semangka) dipotong sama besar, sebagian diangkat, lalu lambang
// pecahan muncul. Setiap adegan satu pecahan (mis. 1/2, lalu 1/4, lalu 3/4).
import React from "react";
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { KerangkaVideo, TeksBesar, metadata, useBingkai } from "./umum.jsx";

const JARI = 200;
function juring(a, b, r) {
  const x1 = Math.cos(a) * r, y1 = Math.sin(a) * r, x2 = Math.cos(b) * r, y2 = Math.sin(b) * r;
  return `M 0 0 L ${x1} ${y1} A ${r} ${r} 0 ${b - a > Math.PI ? 1 : 0} 1 ${x2} ${y2} Z`;
}
const WARNA_BENDA = { kue: ["#fbbf24", "#92400e"], pizza: ["#fcd34d", "#b45309"], semangka: ["#f87171", "#166534"], roti: ["#fde68a", "#a16207"] };

const Isi = ({ adegan, warna }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const n = Math.max(2, Math.min(12, Math.round(Number(adegan.bagian) || 4)));
  const diambilN = Math.max(1, Math.min(n, Math.round(Number(adegan.diambil) || 1)));
  const { k, tegak, lebar, tinggi } = useBingkai();
  const persegi = !tegak && lebar / tinggi < 1.2;
  const [isiWarna, tepi] = WARNA_BENDA[adegan.benda] || WARNA_BENDA.kue;
  const muncul = spring({ frame, fps, config: { damping: 12 } });
  const potong = interpolate(frame, [25, 60], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });
  const renggang = spring({ frame: frame - 65, fps, config: { damping: 14 } });
  const ambil = spring({ frame: frame - 95, fps, config: { damping: 10 } });
  const lambang = spring({ frame: frame - 125, fps, config: { damping: 12 } });
  return (
    <AbsoluteFill>
      <svg width={lebar} height={tinggi} style={{ position: "absolute" }}>
        <g transform={tegak ? `translate(${lebar / 2} ${tinggi * 0.36}) scale(${muncul * k})`
          : persegi ? `translate(${lebar * 0.36 - 30 * k * lambang} ${tinggi * 0.46}) scale(${muncul * k * 0.78})`
          : `translate(${lebar * 0.41 - 60 * k * lambang} ${tinggi / 2}) scale(${muncul * k})`}>
          <circle r={JARI + 30} fill="#ffffff" opacity={0.85} />
          {Array.from({ length: n }, (_, i) => {
            const a = (i / n) * Math.PI * 2 - Math.PI / 2, b = ((i + 1) / n) * Math.PI * 2 - Math.PI / 2, t = (a + b) / 2;
            const dipilih = i < diambilN;
            const geser = 12 * renggang + (dipilih ? 60 * ambil : 0);
            return (
              <g key={i} transform={`translate(${Math.cos(t) * geser} ${Math.sin(t) * geser})`} opacity={dipilih ? 1 : 1 - 0.45 * ambil}>
                <path d={juring(a, b, JARI)} fill={dipilih && ambil > 0.05 ? warna : isiWarna} stroke={tepi} strokeWidth={dipilih ? 4 + 3 * ambil : 4} />
              </g>
            );
          })}
          {Array.from({ length: n }, (_, i) => {
            const a = (i / n) * Math.PI * 2 - Math.PI / 2;
            return <line key={`g${i}`} x1={0} y1={0} x2={Math.cos(a) * JARI * potong} y2={Math.sin(a) * JARI * potong} stroke={tepi} strokeWidth={6} strokeLinecap="round" opacity={1 - renggang} />;
          })}
        </g>
      </svg>
      <div style={{ position: "absolute", ...(tegak ? { left: lebar / 2 - 100 * k, top: tinggi * 0.6 } : persegi ? { right: lebar * 0.06, top: tinggi * 0.46 - 150 * k } : { right: lebar * 0.13, top: tinggi / 2 - 190 * k }),
        opacity: lambang, transform: `scale(${0.6 + 0.4 * lambang})`, textAlign: "center", width: 200 * k, fontWeight: 900 }}>
        <div style={{ fontSize: 130 * k, lineHeight: 1, color: warna }}>{diambilN}</div>
        <div style={{ height: 12 * k, background: "#1f2937", borderRadius: 6 * k, margin: `${10 * k}px 0` }} />
        <div style={{ fontSize: 130 * k, lineHeight: 1, color: "#1f2937" }}>{n}</div>
      </div>
      {adegan.sebutan && <div style={{ position: "absolute", bottom: (tegak ? 90 : 50) * k, width: "100%" }}><TeksBesar ukuran={70} mulai={150}>{adegan.sebutan}</TeksBesar></div>}
    </AbsoluteFill>
  );
};

export const Pecahan = (props) => <KerangkaVideo props={props} Isi={Isi} minimal={7} />;
Pecahan.metadata = (props) => metadata(props, 7);
