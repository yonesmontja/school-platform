// Templat "Berhitung": benda muncul satu per satu sambil dihitung; bisa penjumlahan (kelompok kedua bergabung)
// atau pengurangan (sebagian benda pergi), lalu kalimat matematikanya muncul.
import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Emoji, KerangkaVideo, TeksBesar, metadata, useBingkai } from "./umum.jsx";

const Benda = ({ isi, mulai, pergi, ukuran }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - mulai, fps, config: { damping: 11 } });
  const p = pergi == null ? 0 : interpolate(frame - pergi, [0, 18], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return <div style={{ transform: `scale(${s}) translateY(${-p * 260}px)`, opacity: 1 - p }}><Emoji isi={isi} ukuran={ukuran} /></div>;
};

const Isi = ({ adegan, warna }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const { k, lebar } = useBingkai();
  const a = Math.max(0, Math.min(10, Math.round(Number(adegan.jumlah) || 0)));
  const op = adegan.operasi === "+" || adegan.operasi === "-" ? adegan.operasi : "";
  const b = op ? Math.max(0, Math.min(10, Math.round(Number(adegan.jumlah2) || 0))) : 0;
  const total = op === "+" ? a + b : op === "-" ? Math.max(0, a - b) : a;
  const banyak = op === "+" ? a + b : a;
  const ukuran = banyak > 8 ? 90 : banyak > 5 ? 110 : 140;
  const jeda = Math.max(6, Math.min(16, Math.floor((durationInFrames * 0.45) / Math.max(1, banyak + (op ? 1 : 0)))));
  const mulaiB = 10 + a * jeda + 15;
  const mulaiPergi = 10 + a * jeda + 20;
  const mulaiHasil = op === "+" ? mulaiB + b * jeda + 15 : op === "-" ? mulaiPergi + b * 8 + 25 : 10 + a * jeda + 10;
  const hitungan = op === "" ? Math.min(a, Math.floor(Math.max(0, frame - 10) / jeda) + (frame >= 10 ? 1 : 0)) : null;
  const tHasil = interpolate(frame - mulaiHasil, [0, 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 24 * k, padding: 40 * k }}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 14 * k, maxWidth: lebar - 80 * k, alignItems: "center" }}>
        {Array.from({ length: a }, (_, i) => (
          <Benda key={`a${i}`} isi={adegan.benda || "🍌"} mulai={10 + i * jeda} ukuran={ukuran} pergi={op === "-" && i >= a - b ? mulaiPergi + (i - (a - b)) * 8 : null} />
        ))}
        {op === "+" && <div style={{ fontSize: 90 * k, fontWeight: 900, color: warna, opacity: frame >= mulaiB - 8 ? 1 : 0 }}>+</div>}
        {op === "+" && Array.from({ length: b }, (_, i) => <Benda key={`b${i}`} isi={adegan.benda2 || adegan.benda || "🍌"} mulai={mulaiB + i * jeda} ukuran={ukuran} />)}
      </div>
      {op === "" && hitungan > 0 && <TeksBesar ukuran={150} warna={warna}>{hitungan}</TeksBesar>}
      {op !== "" && (
        <div style={{ opacity: tHasil, transform: `scale(${0.7 + 0.3 * tHasil})`, fontSize: 120 * k, fontWeight: 900, color: "#1f2937", whiteSpace: "nowrap" }}>
          {a} {op === "-" ? "−" : "+"} {b} = <span style={{ color: warna }}>{total}</span>
        </div>
      )}
      {adegan.keterangan && <TeksBesar ukuran={40} warna="#4b5563" mulai={mulaiHasil + 10}>{adegan.keterangan}</TeksBesar>}
    </AbsoluteFill>
  );
};

export const Berhitung = (props) => <KerangkaVideo props={props} Isi={Isi} minimal={6} />;
Berhitung.metadata = (props) => metadata(props, 6);
