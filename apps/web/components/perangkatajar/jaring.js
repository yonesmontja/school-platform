// Spider web (peta tema PBPM) sebagai SVG murni: satu tema di tengah, cabang melingkar di sekelilingnya.
// Satu fungsi untuk layar, cetak/PDF, Word, dan PNG, jadi tampilannya selalu sama. Tata letak dihitung sendiri
// (radial di sepanjang elips) dan kanvas melebar otomatis bila cabang banyak, sehingga tidak pernah terpotong.

export const WARNA_CABANG = ["#206bc4", "#ae3ec9", "#0ca678", "#f76707", "#d63939", "#4263eb", "#1098ad", "#f59f00", "#74b816", "#d6336c", "#7048e8", "#495057"];

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** Pecah teks menjadi baris berdasarkan jumlah huruf; kata yang terlalu panjang dipotong. */
export function bungkus(teks, maks, batasBaris = 6) {
  const kata = String(teks || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const baris = [];
  let kini = "";
  for (let k of kata) {
    while (k.length > maks) { if (kini) { baris.push(kini); kini = ""; } baris.push(k.slice(0, maks - 1) + "-"); k = k.slice(maks - 1); }
    if ((kini ? `${kini} ${k}` : k).length > maks) { baris.push(kini); kini = k; } else kini = kini ? `${kini} ${k}` : k;
  }
  if (kini) baris.push(kini);
  if (baris.length > batasBaris) { baris.length = batasBaris; baris[batasBaris - 1] = `${baris[batasBaris - 1].replace(/.{0,2}$/, "")}…`; }
  return baris;
}

/** Titik pada tepi persegi panjang (pusat cx,cy; setengah lebar/tinggi w,h) searah vektor dx,dy. */
function tepiKotak(cx, cy, w, h, dx, dy) {
  const s = Math.min(w / Math.abs(dx || 1e-9), h / Math.abs(dy || 1e-9));
  return [cx + dx * s, cy + dy * s];
}

/** Titik pada tepi elips (pusat cx,cy; jari-jari rx,ry) searah vektor dx,dy. */
function tepiElips(cx, cy, rx, ry, dx, dy) {
  const s = 1 / Math.sqrt((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry));
  return [cx + dx * s, cy + dy * s];
}

/**
 * @param {object} p
 * @param {string} p.judul       tema di tengah
 * @param {string} [p.kategori]  baris kecil di atas tema (mis. HOBI)
 * @param {string} [p.subjudul]  judul diagram di atas kanvas
 * @param {{judul: string, detail?: string}[]} p.cabang
 * @param {"elips"|"kotak"} [p.bentuk] elips untuk jaring mapel, kotak untuk jaring konsep
 * @returns {{svg: string, lebar: number, tinggi: number}}
 */
export function svgJaring({ judul, kategori, subjudul, cabang = [], bentuk = "elips" }) {
  const n = cabang.length;
  const tambah = Math.max(0, n - 8);
  const W = 1200 + tambah * 80, H = 800 + tambah * 50;
  const atas = subjudul ? 56 : 16;
  const cx = W / 2, cy = atas + (H - atas) / 2;
  const nodeW = 236;
  const rx = W / 2 - nodeW / 2 - 24, ry = (H - atas) / 2 - 92;
  const pusatW = 150, pusatH = 62; // setengah ukuran kotak pusat
  const huruf = "font-family:'Segoe UI',Helvetica,Arial,sans-serif";

  const simpul = cabang.map((c, i) => {
    const sudut = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(1, n);
    const x = cx + rx * Math.cos(sudut), y = cy + ry * Math.sin(sudut);
    const judulBaris = bungkus(c.judul, 24, 2);
    const detailBaris = bungkus(c.detail, bentuk === "elips" ? 30 : 32, bentuk === "elips" ? 4 : 6);
    const tinggiTeks = judulBaris.length * 19 + (detailBaris.length ? 6 + detailBaris.length * 16 : 0);
    const h = Math.max(bentuk === "elips" ? 76 : 64, tinggiTeks + (bentuk === "elips" ? 34 : 24));
    const w = bentuk === "elips" ? nodeW + 24 : nodeW;
    return { ...c, x, y, w, h, judulBaris, detailBaris, tinggiTeks, warna: WARNA_CABANG[i % WARNA_CABANG.length] };
  });

  const panah = simpul.map((s) => {
    const dx = s.x - cx, dy = s.y - cy;
    const [x1, y1] = tepiKotak(cx, cy, pusatW, pusatH, dx, dy);
    const [x2, y2] = bentuk === "elips" ? tepiElips(s.x, s.y, s.w / 2 + 4, s.h / 2 + 4, -dx, -dy) : tepiKotak(s.x, s.y, s.w / 2 + 5, s.h / 2 + 5, -dx, -dy);
    return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#4a78c2" stroke-width="3.5" marker-end="url(#ujung)"/>`;
  }).join("");

  const node = simpul.map((s) => {
    const kotak = bentuk === "elips"
      ? `<ellipse cx="${s.x.toFixed(1)}" cy="${s.y.toFixed(1)}" rx="${s.w / 2}" ry="${s.h / 2}" fill="#ffffff" stroke="${s.warna}" stroke-width="3"/>`
      : `<rect x="${(s.x - s.w / 2).toFixed(1)}" y="${(s.y - s.h / 2).toFixed(1)}" width="${s.w}" height="${s.h}" rx="12" fill="#ffffff" stroke="${s.warna}" stroke-width="2.5"/>`
        + `<rect x="${(s.x - s.w / 2).toFixed(1)}" y="${(s.y - s.h / 2).toFixed(1)}" width="7" height="${s.h}" rx="3" fill="${s.warna}"/>`;
    let y = s.y - s.tinggiTeks / 2 + 14;
    const teks = s.judulBaris.map((b) => { const t = `<text x="${s.x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" style="${huruf};font-size:16px;font-weight:700" fill="#111827">${esc(b)}</text>`; y += 19; return t; }).join("")
      + (s.detailBaris.length ? (y += 4, "") : "")
      + s.detailBaris.map((b) => { const t = `<text x="${s.x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" style="${huruf};font-size:13.5px" fill="#374151">${esc(b)}</text>`; y += 16; return t; }).join("");
    return `<g>${kotak}${teks}</g>`;
  }).join("");

  const temaBaris = bungkus(judul || "Tema", 22, 2);
  let ty = cy - ((kategori ? 18 : 0) + temaBaris.length * 22) / 2 + 16;
  const pusat = `<rect x="${cx - pusatW}" y="${cy - pusatH}" width="${pusatW * 2}" height="${pusatH * 2}" rx="6" fill="#ffffff" stroke="#3b6db3" stroke-width="3"/>`
    + (kategori ? `<text x="${cx}" y="${ty.toFixed(1)}" text-anchor="middle" style="${huruf};font-size:15px;font-weight:700;letter-spacing:1.5px" fill="#3b6db3">${esc(String(kategori).toUpperCase())}</text>` : "")
    + temaBaris.map((b) => { ty += kategori || b !== temaBaris[0] ? 22 : 0; return `<text x="${cx}" y="${ty.toFixed(1)}" text-anchor="middle" style="${huruf};font-size:20px;font-weight:700" fill="#111827">${esc(b)}</text>`; }).join("");

  const kepala = subjudul ? `<text x="${cx}" y="34" text-anchor="middle" style="${huruf};font-size:22px;font-weight:700" fill="#111827">${esc(subjudul)}</text>` : "";
  const kosong = n ? "" : `<text x="${cx}" y="${cy + pusatH + 48}" text-anchor="middle" style="${huruf};font-size:15px" fill="#6b7280">Belum ada cabang. Tambahkan di daftar atau susun dengan AI.</text>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(subjudul || "Spider web")}: ${esc(judul)}">`
    + `<defs><marker id="ujung" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#4a78c2"/></marker></defs>`
    + `<rect width="${W}" height="${H}" fill="#ffffff"/>${kepala}${panah}${pusat}${node}${kosong}</svg>`;
  return { svg, lebar: W, tinggi: H };
}

/** Dua diagram peta tema: jaring mata pelajaran (dengan kalibrasi) dan jaring konsep. */
export const diagramPeta = (peta) => ({
  mapel: svgJaring({ judul: peta.judul, kategori: peta.jaring?.kategori, subjudul: "Spider Web Mata Pelajaran", bentuk: "elips",
    cabang: (peta.jaring?.mapel || []).map((c) => ({ judul: c.nama, detail: c.kalibrasi })) }),
  konsep: svgJaring({ judul: peta.judul, kategori: peta.jaring?.kategori, subjudul: "Spider Web Konsep", bentuk: "kotak",
    cabang: (peta.jaring?.konsep || []).map((c) => ({ judul: c.label, detail: c.detail })) }),
});

/** SVG → data URL PNG (latar putih), skala 2× agar tajam saat dicetak. */
export function svgKePng({ svg, lebar, tinggi }, skala = 2) {
  return new Promise((ok, gagal) => {
    const img = new Image();
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
    img.onload = () => {
      const kanvas = document.createElement("canvas");
      kanvas.width = Math.round(lebar * skala);
      kanvas.height = Math.round(tinggi * skala);
      const ctx = kanvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, kanvas.width, kanvas.height);
      ctx.drawImage(img, 0, 0, kanvas.width, kanvas.height);
      URL.revokeObjectURL(url);
      ok(kanvas.toDataURL("image/png"));
    };
    img.onerror = () => { URL.revokeObjectURL(url); gagal(new Error("Diagram tidak bisa diubah menjadi gambar.")); };
    img.src = url;
  });
}
