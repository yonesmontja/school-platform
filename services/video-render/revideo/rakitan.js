// Penulis render Revideo untuk naskah rakitan Studio Rakit Video. Bentuk naskahnya sama dengan komposisi Remotion
// (apps/web/components/video/templat/rakitan.jsx); waktu & animasi dihitung oleh gerakRakitan.js yang sama, jadi
// keduanya bergerak identik. Adegan digambar per frame: tiap `yield` = satu frame. Audio (narasi & musik) tidak
// diputar di sini; worker mencampurnya sendiri lalu menempelkannya ke video hasil render.
import { Circle, Gradient, Img, Line, Node, Rect, Txt, blur, makeScene2D } from "@revideo/2d";
import { loadImage, useScene } from "@revideo/core";
import lottie from "lottie-web/build/player/lottie_light_canvas";
import { FPS, HURUF, POLA_LOTTIE, frameAdegan, frameLottie, gayaKaca, geometriPeta, keadaanPeta, ruteSampai, hurufElemen, kataTeks, keadaanElemen, keadaanKamera, keadaanKata, keadaanTransisi, primitifHias, sisiEmoji3d, srcIkon, subtitlePada, svgIkon, teksHitung } from "../templat/gerakRakitan.js";
import { srcEmoji3d } from "../templat/emoji3d.js";

const EMOJI = "'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif";
const RATA = { kiri: "left", kanan: "right" };

const srcAset = (url, dasar) => (!url ? null : /^https?:|^data:|^blob:/.test(url) ? url : `${dasar || ""}${url}`);
/** Ukuran gambar agar muat (contain) atau menutupi (cover) kotak. */
function pas(img, w, h, tutup) {
  const nw = img?.naturalWidth || w, nh = img?.naturalHeight || h;
  const s = tutup ? Math.max(w / nw, h / nh) : Math.min(w / nw, h / nh);
  return [nw * s, nh * s];
}

/** Bentuk dasar dalam kotak w×h (setara SVG viewBox 0–100 di komposisi Remotion). */
function buatBentuk(isi, g, w, h) {
  const garis = g.garis ? { stroke: g.garis, lineWidth: 3 } : {};
  const titik = (daftar, skalaW, skalaH) => daftar.map(([x, y]) => [(x / 100 - 0.5) * skalaW, (y / 100 - 0.5) * skalaH]);
  switch (isi) {
    case "bulat": return new Circle({ width: w * 0.98, height: h * 0.98, fill: g.warna, ...garis });
    case "lingkaran": return new Circle({ width: w * 0.92, height: h * 0.92, stroke: g.warna, lineWidth: 6 });
    case "panah": return new Line({ points: titik([[0, 35], [62, 35], [62, 10], [100, 50], [62, 90], [62, 65], [0, 65]], w, h), closed: true, fill: g.warna, ...garis });
    case "bintang": {
      const s = Math.min(w, h);
      return new Line({ points: titik([[50, 3], [61, 37], [97, 37], [68, 58], [79, 93], [50, 72], [21, 93], [32, 58], [3, 37], [39, 37]], s, s), closed: true, fill: g.warna, ...garis });
    }
    case "garis": return new Rect({ width: w, height: h * 0.12, radius: h * 0.06, fill: g.warna });
    default: return new Rect({ width: w, height: h, radius: ((g.sudut || 0) / 100) * Math.min(w, h), fill: g.warna, ...garis });
  }
}

/** Simpul yang menggambar kanvas luar (hasil lottie-web) pada kotak w×h berpusat di titik asal. */
class KanvasLuar extends Node {
  draw(context) {
    if (this.kanvas) context.drawImage(this.kanvas, -this.kanvas.width / 2, -this.kanvas.height / 2);
    super.draw(context);
  }
}

/** Peta (API render v1) di kanvas 2D, setara SVG PetaRakitan di komposisi Remotion. */
function gambarPeta(cx, e, geo, darat, kisi, st, w, h, k, huruf) {
  const g = e.gaya || {};
  const aksen = g.aksen || "#fbbf24", garis = g.garis || "#38bdf8";
  const fs = (g.ukuran || 30) * k;
  cx.setTransform(1, 0, 0, 1, 0, 0);
  cx.clearRect(0, 0, w, h);
  cx.fillStyle = g.latar || "#06223a"; cx.fillRect(0, 0, w, h);
  cx.save(); cx.globalAlpha = 0.07; cx.strokeStyle = "#ffffff"; cx.lineWidth = 1.2 * k; cx.stroke(kisi); cx.restore();
  cx.save(); cx.translate(0, 3 * k); cx.globalAlpha = 0.18; cx.fillStyle = garis; cx.fill(darat, "evenodd"); cx.restore();
  cx.fillStyle = g.warna || "#1f4e5f"; cx.fill(darat, "evenodd");
  geo.label.forEach((l, i) => {
    cx.save(); cx.globalAlpha = st.label[i] * 0.9; cx.fillStyle = "#bae6fd"; cx.textAlign = "center"; cx.textBaseline = "alphabetic";
    cx.font = `italic 600 ${fs * 0.8}px ${huruf}`; cx.letterSpacing = `${fs * 0.12}px`;
    cx.fillText(String(l.nama).toUpperCase(), l.xy[0], l.xy[1]); cx.restore();
  });
  const r = ruteSampai(geo.rute, st.rute);
  if (r.d) {
    cx.save(); cx.strokeStyle = garis; cx.lineWidth = 5 * k; cx.lineCap = "round"; cx.lineJoin = "round";
    cx.shadowColor = garis; cx.shadowBlur = 12 * k; cx.stroke(new Path2D(r.d)); cx.restore();
  }
  if (r.ujung) {
    cx.save(); cx.translate(r.ujung[0], r.ujung[1]); cx.rotate(r.sudut); cx.fillStyle = "#ffffff";
    cx.beginPath(); cx.moveTo(12 * k, 0); cx.lineTo(-8 * k, -8 * k); cx.lineTo(-4 * k, 0); cx.lineTo(-8 * k, 8 * k); cx.closePath(); cx.fill(); cx.restore();
  }
  geo.titik.forEach((p, i) => {
    const s = st.titik[i];
    if (s.skala <= 0) return;
    const [x, y] = p.xy;
    if (s.denyut >= 0) { cx.save(); cx.globalAlpha = 1 - s.denyut; cx.strokeStyle = aksen; cx.lineWidth = 3 * k; cx.beginPath(); cx.arc(x, y, (10 + 26 * s.denyut) * k, 0, Math.PI * 2); cx.stroke(); cx.restore(); }
    cx.save(); cx.fillStyle = aksen; cx.strokeStyle = "#ffffff"; cx.lineWidth = 3 * k; cx.beginPath(); cx.arc(x, y, 10 * k * s.skala, 0, Math.PI * 2); cx.fill(); cx.stroke(); cx.restore();
    cx.save(); cx.globalAlpha = s.label; cx.font = `800 ${fs}px ${huruf}`; cx.textAlign = p.kiri ? "right" : "left"; cx.textBaseline = "alphabetic";
    cx.lineJoin = "round"; cx.lineWidth = 6 * k; cx.strokeStyle = "#04121f"; cx.fillStyle = "#ffffff";
    const teks = `${p.ikon === "port" ? "⚓ " : ""}${p.nama}`;
    const lx = x + (p.kiri ? -18 : 18) * k;
    cx.strokeText(teks, lx, y - 18 * k); cx.fillText(teks, lx, y - 18 * k); cx.restore();
  });
}

/** Satu elemen → simpul Revideo + fungsi pembaru per frame. */
function* buatElemen(e, c) {
  const { lebar: W, tinggi: H, k, huruf, asetDasar } = c;
  const g = e.gaya || {};
  const w = (e.w / 100) * W, h = (e.h / 100) * H;
  let isi, lebarIsi = w, ketik = null, animasiTeks = null, animasiLottie = null, animasiPeta = null;
  if (e.tipe === "teks") {
    const u = (g.ukuran || 60) * k;
    const gayaTeks = {
      fontFamily: hurufElemen(e, c.merek), fontSize: u, lineHeight: u * 1.18, fill: g.warna || "#1f2937",
      fontWeight: g.tebal ? 800 : 400, fontStyle: g.miring ? "italic" : "normal", textAlign: RATA[g.rata] || "center",
      ...(g.garis ? { stroke: g.garis, lineWidth: Math.max(1, u * 0.05), strokeFirst: true } : {}),
      ...(g.bayangan ? { shadowColor: "rgba(0,0,0,.45)", shadowBlur: 10 * k, shadowOffset: [0, 4 * k] } : {}),
    };
    const kaca = g.kaca ? gayaKaca(g.warna) : null;
    const kulit = kaca
      ? { padding: [0.25 * u, 0.45 * u], fill: kaca.isi, stroke: kaca.garis, lineWidth: 1.5 * k, radius: Math.max(g.sudut || 0, 14) * k }
      : g.latar ? { padding: [0.25 * u, 0.45 * u], fill: g.latar, radius: (g.sudut || 0) * k } : {};
    // Lebar kotak sudah termasuk padding (box-sizing: border-box, sama dengan komposisi Remotion & pratinjau Studio)
    const lebarTeks = kaca || g.latar ? Math.max(u, w - 0.9 * u) : w;
    if (e.masuk?.preset === "kata") {
      // Kata demi kata: tiap kata satu Txt dalam baris fleksibel yang membungkus (sama dengan flex-wrap di Remotion)
      const kata = kataTeks(e.isi), n = kata.filter(Boolean).length;
      const daun = kata.map((x) => (x === null ? new Rect({ width: "100%", height: 0 }) : new Txt({ ...gayaTeks, text: x })));
      isi = new Rect({ layout: true, direction: "row", wrap: "wrap", width: w, gap: [0.28 * u, 0],
        justifyContent: { left: "start", right: "end" }[RATA[g.rata]] || "center", children: daun, ...kulit });
      const kataSaja = daun.filter((d, i) => kata[i] !== null);
      animasiTeks = (f) => kataSaja.forEach((d, i) => { const s = keadaanKata(e, f, FPS, i, n); d.opacity(s.op).scale(s.sc); });
    } else {
      // Revideo tidak mengenal white-space: pre-wrap, jadi tiap baris menjadi satu Txt dalam tata letak kolom
      const baris = String(e.isi ?? "").split(/\r?\n/);
      const daun = baris.map((b) => new Txt({ ...gayaTeks, width: lebarTeks, textWrap: true, text: b || " " }));
      isi = new Rect({ layout: true, direction: "column", children: daun, ...kulit });
      if (e.masuk?.preset === "hitung") {
        animasiTeks = (f) => { const t = teksHitung(e.isi, f, FPS, e).split(/\r?\n/); daun.forEach((d, i) => d.text(t[i] || " ")); };
      } else {
        // Efek ketik: n huruf pertama dibagi ke baris-baris (baris yang belum diketik tidak tampil)
        ketik = (nh) => {
          let sisa = nh;
          daun.forEach((d, i) => {
            const tampil = baris[i].slice(0, Math.max(0, sisa));
            d.text(sisa < 0 ? "" : tampil || " ");
            sisa -= baris[i].length + 1;
          });
        };
      }
    }
  } else if (e.tipe === "emoji" && g.emoji !== "datar" && srcEmoji3d(e.isi)) {
    // Emoji 3D (Fluent): gambar dari pustaka lokal, ukurannya setara glyph berukuran sama
    const src = srcAset(srcEmoji3d(e.isi), asetDasar), s = sisiEmoji3d(g, k);
    yield loadImage(src);
    isi = new Img({ src, width: s, height: s });
  } else if (e.tipe === "ikon") {
    // Ikon SVG: diwarnai lalu dirasterisasi pada ukuran tampilnya agar tetap tajam
    const src = srcIkon(e.isi);
    const teks = src ? yield fetch(srcAset(src, asetDasar)).then((r) => (r.ok ? r.text() : "")).catch(() => "") : "";
    const sisi = Math.min(w, h), px = Math.ceil(sisi * 2);
    const svg = svgIkon(teks, g.warna, g.tebal === false, px);
    const anak = [];
    if (svg) {
      const data = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      yield loadImage(data);
      anak.push(new Img({ src: data, width: sisi, height: sisi }));
    }
    isi = new Node({ children: anak });
  } else if (e.tipe === "peta") {
    isi = new KanvasLuar({});
    const kanvas = document.createElement("canvas");
    kanvas.width = Math.max(1, Math.round(w)); kanvas.height = Math.max(1, Math.round(h));
    const cx = kanvas.getContext("2d");
    const geo = geometriPeta(e.peta, kanvas.width, kanvas.height);
    const darat = new Path2D(geo.darat), kisi = new Path2D(geo.kisi);
    yield document.fonts.load(`800 30px ${huruf}`).catch(() => null);
    isi.kanvas = kanvas;
    animasiPeta = (f) => gambarPeta(cx, e, geo, darat, kisi, keadaanPeta(e.peta, f / FPS), kanvas.width, kanvas.height, k, huruf);
    animasiPeta(0);
  } else if (e.tipe === "lottie") {
    // Lottie (lottie-web "light canvas", tanpa expression) digambar ke kanvas w×h, disetel ke frame tiap yield
    isi = new KanvasLuar({});
    const data = POLA_LOTTIE.test(String(e.isi || "")) ? yield fetch(srcAset(e.isi, asetDasar)).then((r) => (r.ok ? r.json() : null)).catch(() => null) : null;
    if (data) {
      const kanvas = document.createElement("canvas");
      kanvas.width = Math.max(1, Math.round(w)); kanvas.height = Math.max(1, Math.round(h));
      const a = lottie.loadAnimation({ renderer: "canvas", loop: false, autoplay: false, animationData: data,
        rendererSettings: { context: kanvas.getContext("2d"), preserveAspectRatio: "xMidYMid meet", clearCanvas: true } });
      const bergambar = (data.assets || []).some((x) => x && x.p);
      yield new Promise((ok) => { a.addEventListener(bergambar ? "loaded_images" : "DOMLoaded", ok); setTimeout(ok, 8000); });
      isi.kanvas = kanvas;
      animasiLottie = (f) => a.goToAndStop(frameLottie(e, f, FPS, data), true);
    }
  } else if (e.tipe === "emoji") {
    isi = new Txt({ text: String(e.isi ?? ""), fontFamily: EMOJI, fontSize: (g.ukuran || 120) * k, lineHeight: (g.ukuran || 120) * k, fill: "#000" });
  } else if (e.tipe === "gambar") {
    const src = srcAset(e.isi, asetDasar);
    const anak = [];
    if (src) {
      const img = yield loadImage(src);
      const [iw, ih] = pas(img, w, h, false);
      anak.push(new Img({ src, width: iw, height: ih }));
    }
    isi = new Rect({ width: w, height: h, radius: (g.sudut || 0) * k, clip: true, children: anak });
  } else {
    isi = buatBentuk(e.isi, g, w, h);
  }
  if (g.bayangan && e.tipe !== "teks") { isi.shadowColor("rgba(0,0,0,.35)"); isi.shadowBlur(10 * k); isi.shadowOffset([0, 6 * k]); }

  // "Sapu": konten dipotong dari kanan oleh persegi pemotong yang melebar dari tepi kiri
  const sapu = e.masuk?.preset === "sapu" ? new Rect({ clip: true, height: H * 4 }) : null;
  if (sapu) sapu.add(isi);
  const simpul = new Node({ x: (e.x / 100 - 0.5) * W, y: (e.y / 100 - 0.5) * H, children: [sapu || isi] });
  const x0 = simpul.x(), y0 = simpul.y();
  const perbarui = (f) => {
    const s = keadaanElemen(e, f, FPS, W, H, k);
    simpul.position([x0 + s.tx, y0 + s.ty]).rotation(s.rot).scale(s.sc).opacity(Math.max(0, s.op));
    if (ketik && s.nKetik !== null) ketik(s.nKetik);
    if (animasiTeks) animasiTeks(f);
    if (animasiLottie) animasiLottie(f);
    if (animasiPeta) animasiPeta(f);
    if (sapu) {
      const lebarTampak = lebarIsi * (1 - s.sapu);
      sapu.width(Math.max(0.001, lebarTampak)).x(-lebarIsi / 2 + lebarTampak / 2);
      isi.x(-sapu.x());
    }
  };
  return { simpul, perbarui };
}

function* buatLatar(l, c) {
  const { lebar: W, tinggi: H, asetDasar } = c;
  if (l?.tipe === "gambar" && l.gambar) {
    const src = srcAset(l.gambar, asetDasar);
    const img = yield loadImage(src);
    const [iw, ih] = pas(img, W, H, true);
    return new Rect({ width: W, height: H, clip: true, fill: "#000", children: [
      new Img({ src, width: iw, height: ih }),
      ...(l.redup > 0 ? [new Rect({ width: W, height: H, fill: `rgba(0,0,0,${l.redup})` })] : []),
    ] });
  }
  if (l?.tipe === "gradien") {
    // Setara CSS linear-gradient(135deg, …): garis gradien diagonal ke kanan bawah sepanjang (W+H)·sin 45°
    const p = ((W + H) * Math.SQRT1_2) / 2, d = [Math.SQRT1_2 * p, Math.SQRT1_2 * p];
    return new Rect({ width: W, height: H, fill: new Gradient({ type: "linear", from: [-d[0], -d[1]], to: d, stops: [{ offset: 0, color: l.warna }, { offset: 1, color: l.warna2 }] }) });
  }
  return new Rect({ width: W, height: H, fill: l?.warna || "#fff" });
}

/** Latar hias bergerak: simpul dibuat sekali, posisinya diperbarui per frame dari primitifHias(). */
function buatHias(l, c) {
  if (!l?.hias || l.hias === "tidak") return null;
  const { lebar: W, tinggi: H } = c, warna = l.warna_hias || "#ffffff";
  const grup = new Rect({ width: W, height: H, clip: true });
  const simpul = primitifHias(l.hias, 0, W, H, warna).map((b) => {
    const n = b.jenis === "lingkaran" ? new Circle({ fill: b.warna, ...(b.blur ? { filters: [blur(b.blur)] } : {}) })
      : b.jenis === "kotak" ? new Rect({ fill: b.warna }) : new Line({ closed: true, fill: b.warna, points: [] });
    grup.add(n);
    return n;
  });
  const perbarui = (f) => primitifHias(l.hias, f, W, H, warna).forEach((b, i) => {
    const n = simpul[i];
    if (!n) return;
    n.opacity(b.op);
    if (b.jenis === "lingkaran") n.position([b.x - W / 2, b.y - H / 2]).size([b.r * 2, b.r * 2]);
    else if (b.jenis === "kotak") n.position([b.x - W / 2, b.y - H / 2]).size([b.w, b.h]).rotation(b.rot);
    else n.points(b.titik.map(([x, y]) => [x - W / 2, y - H / 2]));
  });
  return { grup, perbarui };
}

function buatSubtitle(c) {
  const { lebar: W, tinggi: H, k, huruf, tegak } = c;
  const teks = new Txt({ text: "", fontFamily: huruf, fontSize: 34 * k, lineHeight: 34 * k * 1.3, fontWeight: 700, fill: "#fff", textAlign: "center", textWrap: true });
  const kotak = new Rect({ layout: true, maxWidth: W * 0.88, padding: [6 * k, 16 * k], fill: "rgba(0,0,0,.62)", radius: 10 * k, offset: [0, 1],
    y: H / 2 - H * (tegak ? 0.17 : 0.06), children: [teks] });
  return { kotak, teks };
}

export default makeScene2D("rakitan", function* (view) {
  const p = useScene().variables.get("naskah", {})();
  const W = Number(useScene().variables.get("lebar", 1280)()), H = Number(useScene().variables.get("tinggi", 720)());
  const c = { lebar: W, tinggi: H, k: Math.min(W, H) / 720, tegak: H > W * 1.05, huruf: HURUF[p?.merek?.huruf] || HURUF.Nunito, merek: p?.merek, asetDasar: p?.asetDasar };
  view.fill("#000");

  // Logo sekolah di atas semua adegan
  let logo = null;
  const m = p?.merek;
  if (m?.logo && m.posisi_logo !== "tidak") {
    const [v, hz] = (m.posisi_logo || "kanan-atas").split("-").reverse();
    const s = 110 * c.k, src = srcAset(m.logo, c.asetDasar);
    const img = yield loadImage(src);
    const [iw, ih] = pas(img, s, s, false);
    const tepi = 24 * c.k + s / 2;
    logo = new Img({ src, width: iw, height: ih, x: hz === "kiri" ? -W / 2 + tepi : W / 2 - tepi, y: v === "atas" ? -H / 2 + tepi : H / 2 - tepi });
  }

  for (const a of p?.adegan || []) {
    const grup = new Node({});
    // Kamera menggerakkan latar, hiasan, dan elemen; subtitle tetap diam
    const isiKamera = new Node({});
    grup.add(isiKamera);
    isiKamera.add(yield* buatLatar(a.latar, c));
    const hias = buatHias(a.latar, c);
    if (hias) isiKamera.add(hias.grup);
    const elemen = [];
    for (const e of a.elemen || []) {
      const el = yield* buatElemen(e, c);
      isiKamera.add(el.simpul);
      elemen.push(el);
    }
    const sub = p.subtitle && a.narasi ? buatSubtitle(c) : null;
    if (sub) grup.add(sub.kotak);
    view.add(grup);
    if (logo) { view.add(logo); logo.moveToTop(); }

    const n = frameAdegan(a);
    for (let f = 0; f < n; f++) {
      const tr = keadaanTransisi(a.transisi, f);
      grup.opacity(tr.op).x(tr.geser * W).scale(tr.sc);
      const kam = keadaanKamera(a.kamera, f, n, W);
      isiKamera.x(kam.tx).scale(kam.sc);
      if (hias) hias.perbarui(f);
      elemen.forEach((el) => el.perbarui(f));
      if (sub) {
        const baris = subtitlePada(a, f / FPS);
        sub.kotak.opacity(baris ? 1 : 0);
        sub.teks.text(baris ? baris.teks : " ");
      }
      yield;
    }
    grup.remove();
  }
});
