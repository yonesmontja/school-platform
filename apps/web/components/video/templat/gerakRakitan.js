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
    case "kata": op = ada; break; // tiap kata memudar sendiri (keadaanKata)
    case "hitung": op = Math.min(1, t * 4); break;
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
  // Narasi utuh satu berkas (API render v1): musik diredam sepanjang video
  if (p?.narasi_utuh?.src) return [[0, hitungDurasiRakitan(p)]];
  const awal = awalAdegan(p);
  return (p?.adegan || []).map((a, i) => (a.audio && a.detik ? [awal[i], awal[i] + Math.round(a.detik * FPS)] : null)).filter(Boolean);
}

/** Volume musik latar pada frame f: diredam saat narasi berbicara, memudar di awal & akhir video. */
export function volumeMusik(m, jendela, f, durasiFrame) {
  const redam = m.redam !== false && jendela.some(([d, s]) => f >= d - 6 && f <= s + 6) ? 0.3 : 1;
  const pudar = Math.min(1, f / 15, (durasiFrame - f) / 30);
  return Math.max(0, (m.volume ?? 0.35) * redam * pudar);
}

// ===== E1: gaya visual (font, kamera, latar hias, teks kinetik, kartu kaca) =====

/** Font video (berkas OFL di apps/web/public/fonts/video; dipasang juga di image layanan render). */
export const HURUF = {
  "Nunito": "Nunito, 'Noto Sans', 'DejaVu Sans', Arial, sans-serif",
  "Poppins": "Poppins, 'Noto Sans', 'DejaVu Sans', Arial, sans-serif",
  "Playfair Display": "'Playfair Display', 'Noto Serif', Georgia, serif",
  "Noto Sans": "'Noto Sans', 'DejaVu Sans', Arial, sans-serif",
  "Noto Serif": "'Noto Serif', 'DejaVu Serif', Georgia, serif",
  "DejaVu Sans": "'DejaVu Sans', Verdana, sans-serif",
};
export const hurufElemen = (e, merek) => HURUF[e?.gaya?.huruf] || HURUF[merek?.huruf] || HURUF.Nunito;

const pelanTengah = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** Gerak kamera pelan sepanjang adegan: skala & geser (px) untuk seluruh isi adegan kecuali subtitle. */
export function keadaanKamera(kamera, f, n, lebar) {
  const p = pelanTengah(Math.min(1, Math.max(0, f / Math.max(1, n - 1))));
  switch (kamera) {
    case "zoom-masuk": return { sc: 1 + 0.08 * p, tx: 0 };
    case "zoom-keluar": return { sc: 1.08 - 0.08 * p, tx: 0 };
    case "geser-kiri": return { sc: 1.08, tx: (0.5 - p) * 0.06 * lebar };
    case "geser-kanan": return { sc: 1.08, tx: (p - 0.5) * 0.06 * lebar };
    default: return { sc: 1, tx: 0 };
  }
}

// Bilangan acak semu yang tetap (sama di setiap frame & mesin)
const acak = (i, s = 1) => { const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); };

/**
 * Latar hias bergerak → daftar bentuk sederhana (koordinat px dari kiri-atas bingkai):
 * {jenis: "lingkaran", x, y, r, warna, op, blur} | {jenis: "kotak", x, y, w, h, rot, warna, op} | {jenis: "poligon", titik: [[x,y]...], warna, op}
 */
export function primitifHias(hias, f, W, H, warna = "#ffffff") {
  const d = f / FPS, m = Math.min(W, H), M = Math.max(W, H), hasil = [];
  switch (hias) {
    case "gumpalan":
      for (let i = 0; i < 4; i++) {
        hasil.push({ jenis: "lingkaran", x: W * (0.15 + 0.7 * acak(i, 1)) + Math.sin(d * 0.35 + i * 1.7) * W * 0.08,
          y: H * (0.15 + 0.7 * acak(i, 2)) + Math.cos(d * 0.3 + i * 2.3) * H * 0.08, r: M * (0.22 + 0.12 * acak(i, 3)),
          warna, op: 0.22 + 0.12 * acak(i, 4), blur: m * 0.09 });
      }
      break;
    case "bokeh":
      for (let i = 0; i < 16; i++) {
        const cepat = 0.02 + 0.03 * acak(i, 2), y = (((acak(i, 3) - d * cepat) % 1) + 1) % 1;
        hasil.push({ jenis: "lingkaran", x: W * acak(i, 1) + Math.sin(d * 0.8 + i) * m * 0.015, y: H * (y * 1.2 - 0.1),
          r: m * (0.012 + 0.04 * acak(i, 4)), warna, op: 0.12 + 0.25 * acak(i, 5), blur: m * 0.004 });
      }
      break;
    case "garis": {
      const lebarG = M * 0.05, jarak = M * 0.16, geser = (d * M * 0.03) % jarak;
      for (let i = -3; i < Math.ceil((W + H) / jarak) + 2; i++) {
        hasil.push({ jenis: "kotak", x: i * jarak + geser - H * 0.3, y: H / 2, w: lebarG, h: M * 2, rot: 30, warna, op: 0.07 });
      }
      break;
    }
    case "titik": {
      const jarak = m * 0.07, gx = (d * m * 0.012) % jarak, gy = (d * m * 0.008) % jarak;
      for (let x = -1; x < W / jarak + 1; x++) for (let y = -1; y < H / jarak + 1; y++) {
        hasil.push({ jenis: "lingkaran", x: x * jarak + gx, y: y * jarak + gy, r: m * 0.0055, warna, op: 0.2, blur: 0 });
      }
      break;
    }
    case "gelombang":
      [[0.78, 0.035, 0.12, 0.6], [0.85, 0.03, 0.22, -0.8]].forEach(([dasar, tinggi, op, laju], j) => {
        const titik = [];
        for (let i = 0; i <= 32; i++) {
          const x = (i / 32) * W;
          titik.push([x, H * dasar + Math.sin((i / 32) * Math.PI * 4 + d * laju + j * 2) * H * tinggi]);
        }
        titik.push([W, H], [0, H]);
        hasil.push({ jenis: "poligon", titik, warna, op });
      });
      break;
    default: break;
  }
  return hasil;
}

/** Kecerahan warna hex (0–255). */
export const kecerahan = (hex) => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || ""));
  return m ? 0.299 * parseInt(m[1], 16) + 0.587 * parseInt(m[2], 16) + 0.114 * parseInt(m[3], 16) : 128;
};
/** Kartu kaca: isian & garis tepi transparan; lebih pekat bila teksnya gelap. */
export function gayaKaca(warnaTeks) {
  const gelap = kecerahan(warnaTeks) < 128;
  return gelap ? { isi: "rgba(255,255,255,0.62)", garis: "rgba(255,255,255,0.9)" } : { isi: "rgba(255,255,255,0.14)", garis: "rgba(255,255,255,0.42)" };
}

/** Animasi "kata": kata ke-i muncul memudar & membesar bergiliran sepanjang durasi masuk. */
export function keadaanKata(e, frame, fps, i, n) {
  const mulai = Math.round((e.masuk?.mulai || 0) * fps);
  const sebar = Math.max(1, Math.round((e.masuk?.durasi || 0.6) * fps));
  const awal = mulai + (n > 1 ? (i * sebar) / n : 0);
  const t = antara(frame - awal, [0, 10], [0, 1], pelanAkhir);
  return { op: t, sc: 0.86 + 0.14 * t };
}
/** Potong teks menjadi kata; "\n" menjadi tanda pindah baris (null). */
export const kataTeks = (isi) => String(isi ?? "").split(/(\r?\n)/).flatMap((b) => (/\n/.test(b) ? [null] : b.split(/\s+/).filter(Boolean)));

/** Animasi "hitung": angka pertama dalam teks naik dari 0 ke nilainya (ribuan bertitik ala Indonesia). */
export function teksHitung(isi, frame, fps, e) {
  const s = String(isi ?? "");
  const m = /\d[\d.]*(,\d+)?/.exec(s);
  if (!m) return s;
  const desimal = m[1] ? m[1].length - 1 : 0;
  const nilai = parseFloat(m[0].replace(/\./g, "").replace(",", "."));
  const mulai = Math.round((e.masuk?.mulai || 0) * fps), dur = Math.max(1, Math.round((e.masuk?.durasi || 0.6) * fps));
  const t = antara(frame - mulai, [0, dur], [0, 1], pelanAkhir);
  const v = nilai * t;
  const [bulat, pecah] = v.toFixed(desimal).split(".");
  const angka = bulat.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + (pecah ? "," + pecah : "");
  return s.slice(0, m.index) + angka + s.slice(m.index + m[0].length);
}

// ===== Pustaka aset (E2): emoji 3D Fluent & ikon Tabler, berkas lokal di /pustaka (web) dan layanan render =====

export const POLA_IKON = /^(outline|filled)\/[a-z0-9-]+$/;
/** Jalur berkas ikon dari isi elemen "outline/nama" atau "filled/nama"; null bila tidak sah. */
export const srcIkon = (isi) => (POLA_IKON.test(String(isi || "")) ? `/pustaka/ikon/${isi}.svg` : null);
/** SVG ikon diwarnai; px = ukuran raster (Revideo), tanpa px = mengisi kotak (Remotion). Garis tipis untuk ikon garis. */
export function svgIkon(teks, warna, tipis, px) {
  let t = String(teks || "").trim();
  if (!/^<svg[\s>]/.test(t) || /<script|\son\w+=/i.test(t)) return null;
  t = t.replace(/currentColor/g, warna || "#1f2937");
  if (tipis) t = t.replace(/stroke-width="2"/, 'stroke-width="1.25"');
  return t.replace(/width="24" height="24"/, px ? `width="${px}" height="${px}"` : 'width="100%" height="100%"');
}
/** Sisi kotak gambar emoji 3D (sedikit lebih besar dari glyph huruf berukuran sama). */
export const sisiEmoji3d = (g, k) => (g?.ukuran || 120) * k * 1.1;

// ===== Animasi Lottie unggahan sekolah (E3) =====

export const POLA_LOTTIE = /^\/storage\/video-aset\/[\w.-]+\.json$/;
/**
 * Frame Lottie (relatif terhadap awal animasinya) pada frame video: mulai bersama animasi masuk elemen, diputar dengan
 * kecepatan pilihan, berulang atau berhenti di frame terakhir. meta = { fr, ip, op } dari berkas Lottie.
 */
export function frameLottie(e, frame, fps, meta) {
  const n = Math.max(1, (meta?.op || 1) - (meta?.ip || 0));
  const mulai = Math.round((e?.masuk?.mulai || 0) * fps);
  const lf = (Math.max(0, frame - mulai) / fps) * (e?.gaya?.kecepatan || 1) * (meta?.fr || 30);
  return e?.gaya?.ulang === false ? Math.min(lf, n - 1) : lf % n;
}

// ===== Ukuran bingkai & elemen peta (API render v1) =====

/** Ukuran bingkai naskah: rasio dasar (±720p), atau sisi pendek 1080 px bila resolusi "1080p". */
export function ukuranNaskah(p) {
  const u = ukuranRasio(p?.rasio);
  if (p?.resolusi !== "1080p") return u;
  const f = 1080 / Math.min(u.lebar, u.tinggi);
  return { ...u, lebar: Math.round(u.lebar * f), tinggi: Math.round(u.tinggi * f) };
}

const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + (Math.max(-85, Math.min(85, lat)) * Math.PI) / 360));

/** Proyeksi Mercator bujur/lintang → piksel kotak w×h (bbox sudah disesuaikan perbandingannya; sisa dibagi rata). */
function proyeksiPeta(bbox, w, h) {
  const [x0, y0, x1, y1] = bbox;
  const m0 = mercY(y0), m1 = mercY(y1);
  const lw = x1 - x0, lh = ((m1 - m0) * 180) / Math.PI;
  const s = Math.max(w / lw, h / lh);
  const ox = (w - lw * s) / 2, oy = (h - lh * s) / 2;
  return (lon, lat) => [ox + (lon - x0) * s, oy + ((m1 - mercY(lat)) * 180 * s) / Math.PI];
}

/** Catmull-Rom → titik-titik halus untuk rute, beserta panjang kumulatif. */
function haluskanRute(pts, langkah = 14) {
  if (pts.length < 2) return { titik: pts, panjang: [0] };
  const hasil = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 1; k <= langkah; k++) {
      const t = k / langkah, t2 = t * t, t3 = t2 * t;
      hasil.push([0, 1].map((d) => 0.5 * (2 * p1[d] + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3)));
    }
  }
  const panjang = [0];
  for (let i = 1; i < hasil.length; i++) panjang.push(panjang[i - 1] + Math.hypot(hasil[i][0] - hasil[i - 1][0], hasil[i][1] - hasil[i - 1][1]));
  return { titik: hasil, panjang };
}

/**
 * Geometri peta dalam piksel kotak elemen (dihitung sekali per ukuran): path SVG daratan & garis lintang/bujur,
 * titik rute yang dihaluskan, penanda, dan label wilayah. Dipakai Remotion (SVG) dan Revideo (Path/Circle/Txt).
 */
export function geometriPeta(peta, w, h) {
  const p = proyeksiPeta(peta?.bbox || [0, 0, 1, 1], w, h);
  let darat = "";
  for (const r of peta?.daratan || []) {
    for (let i = 0; i + 1 < r.length; i += 2) {
      const [x, y] = p(r[i], r[i + 1]);
      darat += `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    darat += "Z";
  }
  // Garis lintang/bujur tiap 1°, 2°, atau 5° mengikuti luas bingkai
  const [x0, y0, x1, y1] = peta?.bbox || [0, 0, 1, 1];
  const jarak = x1 - x0 > 25 ? 5 : x1 - x0 > 8 ? 2 : 1;
  let kisi = "";
  for (let lon = Math.ceil(x0 / jarak) * jarak; lon <= x1; lon += jarak) { const [a, b] = p(lon, y0), [c, d] = p(lon, y1); kisi += `M${a.toFixed(1)} ${b.toFixed(1)}L${c.toFixed(1)} ${d.toFixed(1)}`; }
  for (let lat = Math.ceil(y0 / jarak) * jarak; lat <= y1; lat += jarak) { const [a, b] = p(x0, lat), [c, d] = p(x1, lat); kisi += `M${a.toFixed(1)} ${b.toFixed(1)}L${c.toFixed(1)} ${d.toFixed(1)}`; }
  const rute = haluskanRute((peta?.rute || []).map(([lon, lat]) => p(lon, lat)));
  return {
    darat, kisi, rute,
    // Label penanda di kiri titik bila titik dekat tepi kanan, agar tidak terpotong bingkai
    titik: (peta?.titik || []).map((t) => { const xy = p(t.lon, t.lat); return { ...t, xy, kiri: xy[0] > w * 0.6 }; }),
    label: (peta?.label || []).map((t) => ({ ...t, xy: p(t.lon, t.lat) })),
  };
}

/** Rute yang sudah tergambar sampai proporsi u (0–1): path SVG, ujung, dan sudut arah (radian). */
export function ruteSampai(rute, u) {
  const { titik, panjang } = rute;
  if (titik.length < 2 || u <= 0) return { d: "", ujung: null, sudut: 0 };
  const target = panjang[panjang.length - 1] * Math.min(1, u);
  let d = `M${titik[0][0].toFixed(1)} ${titik[0][1].toFixed(1)}`;
  let i = 1;
  for (; i < titik.length && panjang[i] <= target; i++) d += `L${titik[i][0].toFixed(1)} ${titik[i][1].toFixed(1)}`;
  let ujung = titik[i - 1], dari = titik[Math.max(0, i - 2)];
  if (i < titik.length) {
    const s = (target - panjang[i - 1]) / Math.max(1e-6, panjang[i] - panjang[i - 1]);
    dari = titik[i - 1];
    ujung = [dari[0] + (titik[i][0] - dari[0]) * s, dari[1] + (titik[i][1] - dari[1]) * s];
    d += `L${ujung[0].toFixed(1)} ${ujung[1].toFixed(1)}`;
  }
  return { d, ujung, sudut: Math.atan2(ujung[1] - dari[1], ujung[0] - dari[0]) };
}

/**
 * Waktu animasi peta pada detik t sejak adegan mulai: penanda muncul bergantian lalu berdenyut, label wilayah memudar
 * masuk, rute tergambar dari detik 0,9 selama 2,8 detik dengan easing halus.
 */
export function keadaanPeta(peta, t) {
  const halus = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
  const pop = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : 1 + 2.2 * Math.pow(x - 1, 3) + 1.2 * Math.pow(x - 1, 2));
  return {
    titik: (peta?.titik || []).map((_, i) => {
      const mulai = 0.4 + i * 0.3;
      return { skala: pop((t - mulai) / 0.45), denyut: t > mulai ? ((t - mulai) % 1.6) / 1.6 : -1, label: halus((t - mulai - 0.25) / 0.4) };
    }),
    label: (peta?.label || []).map((_, i) => halus((t - 0.6 - i * 0.25) / 0.6)),
    rute: halus((t - 0.9) / 2.8),
  };
}

