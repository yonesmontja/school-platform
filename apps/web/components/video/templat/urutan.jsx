// Templat "Urutan & Siklus": setiap adegan menambah satu langkah (gambar + kata singkat) pada rangkaian bertanda
// panah; langkah yang sedang dibahas diperbesar. Untuk daur hidup, siklus air, langkah kerja.
import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Emoji, KerangkaVideo, TeksBesar, useMuncul } from "./umum.jsx";

const Isi = ({ adegan, indeks, semua, warna }) => {
  const frame = useCurrentFrame();
  const s = useMuncul(0, 10);
  const langkah = semua.slice(0, indeks + 1);
  const n = semua.length;
  const kecil = n > 5 ? 70 : 90;
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 28 }}>
      <div style={{ transform: `scale(${0.6 + 0.4 * s})`, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        <Emoji isi={adegan.gambar || "➡️"} ukuran={220} />
        <TeksBesar ukuran={68} mulai={8}>{adegan.teks}</TeksBesar>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "nowrap" }}>
        {langkah.map((l, i) => {
          const sekarang = i === indeks;
          const t = sekarang ? interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" }) : 1;
          return (
            <React.Fragment key={i}>
              {i > 0 && <span style={{ fontSize: 50, color: warna, fontWeight: 900, opacity: t }}>➜</span>}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "8px 12px", borderRadius: 18,
                background: sekarang ? "#fff" : "#ffffff99", border: `5px solid ${sekarang ? warna : "transparent"}`, opacity: t, minWidth: 120 }}>
                <Emoji isi={l.gambar || "•"} ukuran={kecil * 0.8} />
                <div style={{ fontSize: 24, fontWeight: 800, color: "#374151", maxWidth: 170, textAlign: "center" }}>{l.teks}</div>
              </div>
            </React.Fragment>
          );
        })}
        {adegan.siklus && indeks === n - 1 && <span style={{ fontSize: 50, color: warna, fontWeight: 900, opacity: interpolate(frame, [20, 35], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>↺</span>}
      </div>
    </AbsoluteFill>
  );
};

export const Urutan = (props) => <KerangkaVideo props={props} Isi={Isi} minimal={5} />;
