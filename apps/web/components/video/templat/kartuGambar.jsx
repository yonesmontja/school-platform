// Templat "Kartu Gambar & Suku Kata": gambar besar, lalu kata dipecah per suku kata (pi-sang) yang menyala satu per
// satu, lalu kata utuh. Untuk kosakata dan belajar membaca permulaan.
import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Emoji, KerangkaVideo, TeksBesar, metadata, useBingkai, useMuncul } from "./umum.jsx";

const Isi = ({ adegan, warna }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const s = useMuncul(0, 9);
  const { k, tegak } = useBingkai();
  const suku = String(adegan.kata || "").split(/[-·]/).map((x) => x.trim()).filter(Boolean);
  const kataUtuh = suku.join("");
  const mulaiSuku = 25;
  const jedaSuku = Math.max(10, Math.min(30, Math.floor((durationInFrames * 0.55 - mulaiSuku) / Math.max(1, suku.length))));
  const mulaiUtuh = mulaiSuku + jedaSuku * suku.length + 10;
  const tUtuh = interpolate(frame - mulaiUtuh, [0, 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: (tegak ? 36 : 18) * k }}>
      <div style={{ transform: `scale(${s})` }}><Emoji isi={adegan.gambar || "🖼️"} ukuran={tegak ? 300 : 250} /></div>
      {suku.length > 1 && (
        <div style={{ display: "flex", gap: 18 * k, flexWrap: "wrap", justifyContent: "center" }}>
          {suku.map((x, i) => {
            const aktif = frame >= mulaiSuku + i * jedaSuku;
            const t = interpolate(frame - (mulaiSuku + i * jedaSuku), [0, 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            return (
              <div key={i} style={{ fontSize: 84 * k, fontWeight: 900, padding: `${4 * k}px ${26 * k}px`, borderRadius: 22 * k, background: aktif ? warna : "#ffffffaa",
                color: aktif ? "#fff" : "#9ca3af", transform: `scale(${0.85 + 0.15 * t})`, boxShadow: aktif ? `0 ${8 * k}px 0 #0002` : "none" }}>{x}</div>
            );
          })}
        </div>
      )}
      <div style={{ opacity: suku.length > 1 ? tUtuh : 1, transform: `scale(${suku.length > 1 ? 0.8 + 0.2 * tUtuh : 1})` }}>
        <TeksBesar ukuran={110} mulai={suku.length > 1 ? 0 : 15}>{kataUtuh}</TeksBesar>
      </div>
      {adegan.keterangan && <TeksBesar ukuran={38} warna="#4b5563" mulai={mulaiUtuh + 10}>{adegan.keterangan}</TeksBesar>}
    </AbsoluteFill>
  );
};

export const KartuGambar = (props) => <KerangkaVideo props={props} Isi={Isi} minimal={5} />;
KartuGambar.metadata = (props) => metadata(props, 5);
