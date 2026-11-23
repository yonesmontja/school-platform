// Rumus Laporan STNKM yang dipakai bersama oleh halaman laporan kelas dan halaman rincian siswa,
// agar angka Hari & Entri di rincian selalu sama dengan tabel Rekapitulasi.
//
// Sumber STNKM:
// - AKADEMIK: poin S–M dari nilai (0–100; diisi manual atau nilai × matriks) + poin Teori B.Ind & Math.
// - JURNAL:   skor S–M dari jurnal anekdotal (skala −5..+5).
// - LENGKAP:  keduanya. Skalanya berbeda, jadi ada dua cara tampil:
//     DUA_SUMBU: akademik di sumbu kiri (0–100), jurnal di sumbu kanan (−5..+5), tidak dirata-rata bersama;
//     KONVERSI:  skor jurnal dikonversi ke 0–100 ((skor + 5) × 10), lalu dirata-rata bersama poin akademik.
// Nilai nol/kosong diabaikan per dimensi (bukan titik data). Skor jurnal negatif tetap dihitung.

export const DIMENSI = [
  { key: "S", label: "Skill", color: "#0d6efd" },
  { key: "T", label: "Teori", color: "#198754" },
  { key: "N", label: "Nalar", color: "#0dcaf0" },
  { key: "K", label: "Karakter", color: "#fd7e14" },
  { key: "M", label: "Minat", color: "#dc3545" },
];
// Garis mapel khusus = rata-rata poin aspek Teori (poin_T) dari nilai mapel tersebut
export const MAPEL_KHUSUS = [
  { key: "BIndo", label: "B.Ind", nama: "Teori B. Indonesia", color: "#6f42c1", cocok: (n) => n.includes("indonesia") },
  { key: "Math", label: "Math", nama: "Teori Matematika", color: "#495057", cocok: (n) => n.includes("matematika") || n.includes("math") },
];
// Skor jurnal pada mode Lengkap · dua sumbu
export const DIMENSI_JURNAL = DIMENSI.map((d) => ({ ...d, key: `j${d.key}`, dasar: d.key, label: `J·${d.key}`, nama: `Jurnal ${d.label}` }));

export const KUNCI_UTAMA = [...DIMENSI.map((d) => d.key), ...MAPEL_KHUSUS.map((k) => k.key)];
export const KUNCI_JURNAL = DIMENSI_JURNAL.map((d) => d.key);
export const KUNCI = [...KUNCI_UTAMA, ...KUNCI_JURNAL];

export const SUMBER = [
  { value: "AKADEMIK", label: "Akademik", icon: "bi-mortarboard", ket: "Poin S–M dari nilai (0–100)" },
  { value: "JURNAL", label: "Jurnal", icon: "bi-journal-text", ket: "Skor S–M dari jurnal anekdotal (−5..+5)" },
  { value: "LENGKAP", label: "Lengkap", icon: "bi-layers", ket: "Akademik + jurnal" },
];
export const CARA_LENGKAP = [
  { value: "DUA_SUMBU", label: "Dua sumbu", icon: "bi-distribute-vertical", ket: "Akademik di sumbu kiri (0–100), jurnal di sumbu kanan (−5..+5). Keduanya tidak dicampur." },
  { value: "KONVERSI", label: "Konversi 0–100", icon: "bi-arrow-left-right", ket: "Skor jurnal dikonversi ke 0–100 ((skor + 5) × 10: −5 → 0, 0 → 50, +5 → 100), lalu dirata-rata bersama poin akademik." },
];
export const sumberValid = (v) => (SUMBER.some((s) => s.value === v) ? v : "AKADEMIK");
export const caraValid = (v) => (CARA_LENGKAP.some((c) => c.value === v) ? v : "DUA_SUMBU");
export const labelSumber = (sumber, cara) => {
  const s = SUMBER.find((x) => x.value === sumber)?.label || "Akademik";
  return sumber === "LENGKAP" ? `${s} (${CARA_LENGKAP.find((c) => c.value === cara)?.label})` : s;
};
export const konversiJurnal = (v) => (v + 5) * 10;
/** Mode yang skala utamanya skor jurnal (−5..+5) */
export const skalaJurnal = (sumber) => sumber === "JURNAL";
export const pakaiDuaSumbu = (sumber, cara) => sumber === "LENGKAP" && cara === "DUA_SUMBU";

// --- UTIL TANGGAL (semua tanggal lokal, tanpa jam) ---
const DAY_MS = 24 * 60 * 60 * 1000;
export const parseYmd = (str) => {
  const [y, m, d] = String(str).slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
};
export const toYmd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const seninDari = (d) => {
  const hari = d.getDay();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - (hari === 0 ? 6 : hari - 1));
};
const selisihHari = (a, b) => Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / DAY_MS);
// Tanggal mulai semester bawaan: Ganjil pertengahan Juli tahun pertama, Genap awal Januari tahun kedua
export const tanggalMulaiDefault = (periode) => {
  const tahun = parseInt(String(periode?.tahun_ajaran || "").split("/")[0], 10) || new Date().getFullYear();
  return /genap/i.test(periode?.semester || "") ? `${tahun + 1}-01-05` : `${tahun}-07-13`;
};

const num = (v) => parseFloat(v) || 0;
const ada = (v) => v !== null && v !== undefined && !Number.isNaN(v) && v !== 0;
export const rataDari = (vals) => {
  const isi = vals.filter((v) => v !== null && v !== undefined);
  return isi.length ? isi.reduce((a, b) => a + b, 0) / isi.length : null;
};
export const rataKunci = (rows) => Object.fromEntries(KUNCI.map((k) => [k, rataDari(rows.map((r) => r[k]))]));
/** Rata-rata gabungan dari kunci utama (S–M, B.Ind, Math) yang tersedia */
export const rataGabungan = (t) => rataDari(KUNCI_UTAMA.map((k) => t[k]));
/** Rata-rata skor jurnal (mode dua sumbu) */
export const rataJurnal = (t) => rataDari(KUNCI_JURNAL.map((k) => t[k]));

/** Data mentah API → entri bernomor minggu (sejak Senin minggu 1). */
export function normalisasi(laporan, senin) {
  const mapelKhusus = {};
  (laporan.mapels || []).forEach((m) => {
    const nama = m.nama_mapel.toLowerCase();
    MAPEL_KHUSUS.forEach((k) => { if (!mapelKhusus[k.key] && k.cocok(nama)) mapelKhusus[k.key] = m.id_mapel; });
  });
  const mingguKe = (tanggal) => Math.floor(selisihHari(senin, parseYmd(tanggal)) / 7) + 1;

  let sebelumMulai = 0;
  const nilai = [], jurnal = [];
  (laporan.nilai || []).forEach((r) => {
    const wk = mingguKe(r.tanggal);
    if (wk < 1) { sebelumMulai++; return; }
    const poin = Object.fromEntries(DIMENSI.map((d) => [d.key, num(r[`poin_${d.key}`])]));
    nilai.push({
      ...poin, sumber: "NILAI", wk, id: r.id_nilai, id_siswa: r.id_siswa, id_mapel: r.id_mapel, tanggal: String(r.tanggal).slice(0, 10), nilai: num(r.nilai),
      mapel: r.mapel?.nama_mapel, materi: r.materi?.nama_materi || r.id_materi, jenis: r.jenis?.kategori_penilaian || r.id_jenis,
      metode: r.metode_stnkm, tipe: r.tipe_nilai,
      pengisi: { guru: r.guru?.nama_guru || r.id_guru, idGuru: r.id_guru, pengisi: r.pengisi?.name, idGuruPengisi: r.pengisi?.id_guru },
      ...Object.fromEntries(MAPEL_KHUSUS.map((k) => [`is${k.key}`, r.id_mapel === mapelKhusus[k.key]])),
    });
  });
  (laporan.jurnal || []).forEach((j) => {
    const wk = mingguKe(j.tanggal);
    if (wk < 1) { sebelumMulai++; return; }
    jurnal.push({
      sumber: "JURNAL", wk, id: j.id_jurnal, id_siswa: j.id_siswa, tanggal: String(j.tanggal).slice(0, 10),
      narasi: j.narasi_kejadian ?? null, tersembunyi: !!j.tersembunyi, sensitif: !!j.sensitif, dampak: j.mode_dampak,
      pengisi: { guru: j.guru?.nama_guru || j.id_guru, idGuru: j.id_guru, pengisi: j.pencatat?.name, idGuruPengisi: j.pencatat?.id_guru },
      ...Object.fromEntries(DIMENSI.map((d) => [d.key, num(j[`val_${d.key}`])])),
    });
  });
  const mingguIni = mingguKe(toYmd(new Date()));
  const maxWk = Math.max(1, mingguIni, ...nilai.map((n) => n.wk), ...jurnal.map((j) => j.wk));
  return { nilai, jurnal, maxWk, sebelumMulai, mapelKhusus };
}

/** Saring entri menurut rentang minggu dan mapel (mapel hanya berlaku untuk nilai). */
export function saring(basis, { dari, sampai, mapel }) {
  const dalam = (e) => e.wk >= dari && e.wk <= sampai;
  return {
    nilai: basis.nilai.filter((n) => dalam(n) && (!mapel || n.id_mapel === mapel)),
    jurnal: basis.jurnal.filter(dalam),
  };
}

/**
 * Sumbangan satu entri ke record harian menurut sumber STNKM: { kunci: nilai } untuk dimensi yang tidak nol.
 * Entri tanpa sumbangan sama sekali tidak dihitung sebagai entri (tidak muncul di Hari/Entri maupun grafik).
 */
export function sumbanganEntri(e, sumber, cara) {
  const hasil = {};
  if (e.sumber === "NILAI") {
    if (sumber === "JURNAL") return hasil;
    DIMENSI.forEach((d) => { if (ada(e[d.key])) hasil[d.key] = e[d.key]; });
    MAPEL_KHUSUS.forEach((k) => { if (e[`is${k.key}`] && ada(e.T)) hasil[k.key] = e.T; });
    return hasil;
  }
  if (sumber === "AKADEMIK") return hasil;
  DIMENSI.forEach((d) => {
    const v = e[d.key];
    if (!ada(v)) return;
    if (sumber === "JURNAL") hasil[d.key] = v;
    else if (cara === "KONVERSI") hasil[d.key] = konversiJurnal(v);
    else hasil[`j${d.key}`] = v;
  });
  return hasil;
}

/**
 * Record rata-rata harian per siswa: semua sumbangan satu siswa pada tanggal yang sama dirata-rata per dimensi.
 * Mengembalikan { harian, entri } — entri = daftar entri yang menyumbang (dengan sumbangannya).
 */
export function bangunHarian(terfilter, sumber, cara) {
  const map = new Map();
  const entri = [];
  [...terfilter.nilai, ...terfilter.jurnal].forEach((e) => {
    const s = sumbanganEntri(e, sumber, cara);
    if (!Object.keys(s).length) return;
    entri.push({ ...e, sumbangan: s });
    const kunci = `${e.id_siswa}|${e.tanggal}`;
    if (!map.has(kunci)) map.set(kunci, { id_siswa: e.id_siswa, tanggal: e.tanggal, wk: e.wk, jumlah: {}, cacah: {}, entri: 0 });
    const a = map.get(kunci);
    a.entri++;
    Object.entries(s).forEach(([k, v]) => { a.jumlah[k] = (a.jumlah[k] || 0) + v; a.cacah[k] = (a.cacah[k] || 0) + 1; });
  });
  const harian = [...map.values()]
    .map((a) => ({ id_siswa: a.id_siswa, tanggal: a.tanggal, wk: a.wk, entri: a.entri, ...Object.fromEntries(KUNCI.map((k) => [k, a.cacah[k] ? a.jumlah[k] / a.cacah[k] : null])) }))
    .sort((a, b) => a.tanggal.localeCompare(b.tanggal));
  entri.sort((a, b) => a.tanggal.localeCompare(b.tanggal) || (a.sumber === b.sumber ? 0 : a.sumber === "NILAI" ? -1 : 1));
  return { harian, entri };
}

/** Rekap satu siswa dari record hariannya: rata-rata per kunci, rata gabungan, jumlah hari & entri. */
export function rekapSiswa(rows) {
  const avg = rataKunci(rows);
  return { ...avg, rata: rataGabungan(avg), rataJurnal: rataJurnal(avg), hari: rows.length, entri: rows.reduce((n, r) => n + r.entri, 0) };
}

/** Kolom angka yang tampil di tabel & ekspor menurut sumber STNKM. */
export function kolomTampil(sumber, cara) {
  const dim = DIMENSI.map((d) => ({ key: d.key, label: d.key, nama: d.label }));
  const khusus = MAPEL_KHUSUS.map((k) => ({ key: k.key, label: k.label, nama: k.nama, ekspor: `${k.label} (Teori)` }));
  if (sumber === "JURNAL") return [...dim, { key: "rata", label: "Rata-rata", nama: "Rata-rata skor jurnal", kuat: true }];
  const kolom = [...dim, ...khusus, { key: "rata", label: "Rata-rata", nama: "Rata-rata STNKM-B.Ind-Math", kuat: true }];
  if (pakaiDuaSumbu(sumber, cara)) kolom.push({ key: "rataJurnal", label: "Jurnal", nama: "Rata-rata skor jurnal (−5..+5)", kuat: true });
  return kolom;
}

export const fmt = (v, d = 1) => (v === null || v === undefined || Number.isNaN(v) ? "–" : Number(v).toFixed(d));
export const angkaEkspor = (v) => (v === null || v === undefined ? "-" : Number(fmt(v)));
