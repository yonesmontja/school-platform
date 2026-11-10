// Perhitungan waktu & animasi naskah rakitan (Studio Rakit Video) tanpa React/Remotion. Dipakai bersama oleh penulis
// render Remotion (rakitan.jsx, juga pratinjau di browser) dan Revideo (services/video-render/revideo) agar kedua
// mesin menghasilkan gerak yang sama persis dari naskah yang sama.

export const FPS = 30;
// Rasio aspek → ukuran bingkai (sekitar 720p agar render cepat dan berkas kecil)
export const RASIO = {
  "16:9": { lebar: 1280, tinggi: 720, label: "16:9 mendatar (proyektor, YouTube)" },
  "9:16": { lebar: 720, tinggi: 1280, label: "9:16 tegak (Reels, TikTok, Status WA)" },
  "1:1": { lebar: 1080, tinggi: 1080, label: "1:1 persegi (feed Instagram/Facebook)" },
  "4:3": { lebar: 1024, tinggi: 768, label: "4:3 (layar kelas lama)" },
};
export const ukuranRasio = (r) => RASIO[r] || RASIO["16:9"];

/** Perkiraan lama narasi (detik) dari jumlah kata, bila rekaman suara belum ada. */
export function estimasiDetik(narasi) {
  const kata = String(narasi || "").trim().split(/\s+/).filter(Boolean).length;
  return Math.min(20, Math.max(4, kata / 2.3 + 1.5));
}

/** Lama adegan (detik): durasi manual (tidak lebih pendek dari narasinya) atau perkiraan dari narasi. */
export function detikAdeganRakitan(a) {
  const audio = a?.detik ? a.detik + 0.8 : 0;
  const dasar = a?.durasi ? a.durasi : (String(a?.narasi || "").trim() ? estimasiDetik(a.narasi) : 4);
  return Math.min(40, Math.max(2, dasar, audio));
}
export const frameAdegan = (a) => Math.round(detikAdeganRakitan(a) * FPS);
export const hitungDurasiRakitan = (p) => Math.max(1, (p?.adegan || []).reduce((n, a) => n + frameAdegan(a), 0));

/** Frame awal tiap adegan. */
export function awalAdegan(p) {
  let n = 0;
  return (p?.adegan || []).map((a) => { const d = n; n += frameAdegan(a); return d; });
}

// ===== Fungsi dasar (setara interpolate/Easing/spring Remotion) =====

export const pelanAkhir = (t) => 1 - (1 - t) ** 3; // Easing.out(Easing.cubic)
export const pelanAwal = (t) => t ** 3; // Easing.in(Easing.cubic)

/** Interpolasi linear satu rentang, dijepit di kedua ujung, dengan pelonggaran opsional. */
export function antara(x, [a, b], [y0, y1], pelan) {
  let t = b === a ? (x >= b ? 1 : 0) : (x - a) / (b - a);
  t = Math.min(1, Math.max(0, t));
  if (pelan) t = pelan(t);
  return y0 + (y1 - y0) * t;
}

// Pegas teredam (massa 1, kekakuan 100) dalam bentuk tertutup: hasilnya sama dengan simulasi per frame spring() Remotion
function posisiPegas(detik, redaman) {
  if (detik <= 0) return 0;
  const w0 = 10, zeta = redaman / 20;
  if (zeta >= 1) return 1 - Math.exp(-w0 * detik) * (1 + w0 * detik);
  const w1 = w0 * Math.sqrt(1 - zeta * zeta), amp = Math.exp(-zeta * w0 * detik);
  return 1 - amp * (Math.sin(w1 * detik) * ((zeta * w0) / w1) + Math.cos(w1 * detik));
}
const lamaAlami = new Map();
function lamaPegasAlami(fps, redaman) {
  const kunci = `${fps}-${redaman}`;
  if (lamaAlami.has(kunci)) return lamaAlami.get(kunci);
  const beda = (f) => Math.abs(1 - posisiPegas(f / fps, redaman));
  let f = 0;
  while (beda(f) >= 0.005) f++;
  let selesai = f;
  for (let i = 0; i < 20; i++) { f++; if (beda(f) >= 0.005) { i = 0; selesai = f + 1; } }
  lamaAlami.set(kunci, selesai);
  return selesai;
}
/** spring({frame, fps, config: {damping}, durationInFrames}) dari 0 ke 1. */
export function pegas(frame, fps, redaman = 10, durasiFrame) {
  if (durasiFrame === undefined) return posisiPegas(Math.max(0, frame) / fps, redaman);
  if (frame > durasiFrame) return 1;
  const skala = frame / (durasiFrame / lamaPegasAlami(fps, redaman));
  return posisiPegas(Math.max(0, skala) / fps, redaman);
}

/**
 * Keadaan satu elemen pada frame tertentu (dihitung dari awal adegan): kelegapan, geser (px), skala, putaran (derajat),
 * potongan kanan untuk "sapu" (0–1 bagian tersembunyi), dan jumlah huruf untuk "ketik" (null = semua).
 */
export function keadaanElemen(e, frame, fps, lebar, tinggi, k) {
  const mulai = Math.round((e.masuk?.mulai || 0) * fps);
  const dur = Math.max(1, Math.round((e.masuk?.durasi || 0.6) * fps));
  const f = frame - mulai;
  const t = antara(f, [0, dur], [0, 1], pelanAkhir);
  const p = () => pegas(f, fps, 9, Math.round(dur * 1.6));
  const ada = f >= 0 ? 1 : 0;
  let op = t, tx = 0, ty = 0, sc = 1, rot = 0, sapu = 0, nKetik = null;
  switch (e.masuk?.preset) {
    case "tidak": op = ada; break;
    case "geser-kiri": tx = (t - 1) * lebar * 0.35; break;
    case "geser-kanan": tx = (1 - t) * lebar * 0.35; break;
    case "geser-atas": ty = (t - 1) * tinggi * 0.35; break;
    case "geser-bawah": ty = (1 - t) * tinggi * 0.35; break;
    case "pop": sc = p(); op = Math.min(1, t * 3); break;
    case "zoom": sc = 0.3 + 0.7 * t; break;
    case "putar": rot = (1 - t) * -200; sc = 0.2 + 0.8 * t; break;
    case "mantul": ty = (p() - 1) * tinggi * 0.45; op = ada; break;
    case "sapu": sapu = 1 - t; op = ada; break;
    case "ketik": if (e.tipe === "teks") { nKetik = Math.floor(antara(f, [0, dur], [0, String(e.isi).length])); op = ada; } break;
    default: break;
  }
  // Animasi keluar (opsional): elemen hilang pada detik tertentu dalam adegan
  if (e.keluar?.pada != null) {
    const pada = Math.round(e.keluar.pada * fps);
    const tk = antara(frame - pada, [0, 12], [0, 1], pelanAwal);
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
  return { op: op * (e.gaya?.buram ?? 1), tx, ty, sc, rot: (e.rot || 0) + rot, sapu, nKetik };
}

/** Transisi masuk adegan pada frame tertentu: kelegapan, geser (bagian lebar 0–1), skala. */
export function keadaanTransisi(transisi, frame) {
  const t = antara(frame, [0, 12], [0, 1], pelanAkhir);
  if (transisi === "tidak") return { op: 1, geser: 0, sc: 1 };
  if (transisi === "geser") return { op: 1, geser: 1 - t, sc: 1 };
  if (transisi === "zoom") return { op: t, geser: 0, sc: 1.15 - 0.15 * t };
  return { op: t, geser: 0, sc: 1 };
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

/** Baris subtitle yang tampil pada detik tertentu dalam adegan. */
export function subtitlePada(a, detik) {
  const bicara = a.detik || Math.max(1, detikAdeganRakitan(a) - 0.6);
  return barisSubtitle(a.narasi, bicara).find((b) => detik >= b.dari && detik < b.sampai) || null;
}

/** Rentang bicara narasi (frame video) untuk meredam musik latar. */
export function jendelaNarasi(p) {
  const awal = awalAdegan(p);
  return (p?.adegan || []).map((a, i) => (a.audio && a.detik ? [awal[i], awal[i] + Math.round(a.detik * FPS)] : null)).filter(Boolean);
}

/** Volume musik latar pada frame f: diredam saat narasi berbicara, memudar di awal & akhir video. */
export function volumeMusik(m, jendela, f, durasiFrame) {
  const redam = m.redam !== false && jendela.some(([d, s]) => f >= d - 6 && f <= s + 6) ? 0.3 : 1;
  const pudar = Math.min(1, f / 15, (durasiFrame - f) / 30);
  return Math.max(0, (m.volume ?? 0.35) * redam * pudar);
}
