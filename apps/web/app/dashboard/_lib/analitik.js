// Perhitungan dasbor analitik: KPI, EWS, grafik bawaan, dan grafik kustom pengguna.
// Semua fungsi murni (tanpa React) agar mudah diuji dan dipakai ulang untuk ekspor.

export const DIMENSI = [
  { key: "S", label: "Skill", full: "Skill (Keterampilan)", color: "#0d6efd" },
  { key: "T", label: "Teori", full: "Teori (Pengetahuan)", color: "#198754" },
  { key: "N", label: "Nalar", full: "Nalar (Berpikir Kritis)", color: "#fd7e14" },
  { key: "K", label: "Karakter", full: "Karakter (Sikap & Etika)", color: "#6f42c1" },
  { key: "M", label: "Minat", full: "Minat (Keterlibatan)", color: "#d63384" },
];
export const STATUS_HADIR = [
  { key: "HADIR", label: "Hadir", color: "#198754" },
  { key: "SAKIT", label: "Sakit", color: "#ffc107" },
  { key: "IZIN", label: "Izin", color: "#0dcaf0" },
  { key: "ALPA", label: "Alpa", color: "#dc3545" },
];
export const PALET = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#64748b", "#14b8a6", "#a855f7"];
export const MODE_WAKTU = [
  { id: "daily", label: "Per Hari" },
  { id: "weekly", label: "Per Minggu" },
  { id: "monthly", label: "Per Bulan" },
];
export const EWS_DEFAULT = { belowKkmKritis: 2, alpaKritis: 3, absenPantau: 5, jurnalNegKritis: 2 };

const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"];

export const num = (v) => parseFloat(v) || 0;
export const rata = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
export const r1 = (v) => (v === null || v === undefined || Number.isNaN(v) ? null : Math.round(v * 10) / 10);
export const fmt = (v, d = 1) => (v === null || v === undefined || Number.isNaN(v) ? "–" : Number(v).toFixed(d));

// ================= WAKTU =================
const parseYmd = (s) => {
  const [y, m, d] = String(s).slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
};
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const seninDari = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));

export function kunciWaktu(tanggal, mode) {
  const d = parseYmd(tanggal);
  if (mode === "daily") return { key: ymd(d), label: `${d.getDate()} ${BULAN[d.getMonth()]}` };
  if (mode === "weekly") {
    const s = seninDari(d);
    return { key: ymd(s), label: `Mg ${s.getDate()} ${BULAN[s.getMonth()]}` };
  }
  return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: `${BULAN[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}` };
}

// Deret waktu utuh dari tanggal pertama sampai terakhir, agar sumbu waktu tidak meloncat
export function deretWaktu(tanggalList, mode) {
  const valid = tanggalList.filter(Boolean).map((t) => String(t).slice(0, 10)).sort();
  if (!valid.length) return [];
  const awal = parseYmd(valid[0]);
  const akhir = parseYmd(valid[valid.length - 1]);
  const hasil = [];
  let cur = mode === "weekly" ? seninDari(awal) : mode === "monthly" ? new Date(awal.getFullYear(), awal.getMonth(), 1) : awal;
  while (cur <= akhir && hasil.length < 400) {
    hasil.push(kunciWaktu(ymd(cur), mode));
    cur = mode === "daily" ? new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1)
      : mode === "weekly" ? new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 7)
        : new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  }
  return hasil;
}

// ================= KONTEKS REFERENSI =================
export function buatKonteks(data) {
  const siswa = new Map(data.students.map((s) => [s.id_siswa, s]));
  const mapel = new Map(data.subjects.map((m) => [m.id_mapel, m]));
  const kelas = new Map(data.classes.map((k) => [k.id_kelas, k]));
  const mbk = new Map(data.mbk.map((j) => [j.id_jenis, j]));
  return {
    namaSiswa: (id) => siswa.get(id)?.nama_siswa || id,
    siswa: (id) => siswa.get(id),
    namaMapel: (id) => mapel.get(id)?.nama_mapel || id,
    namaKelas: (id) => kelas.get(id)?.nama_kelas || id || "-",
    namaJenis: (id) => mbk.get(id)?.kategori_penilaian || "Tanpa jenis",
    kkm: (idMapel) => mapel.get(idMapel)?.kkm ?? 75,
  };
}

const poinGabungan = (n) => rata(DIMENSI.map((d) => num(n[`poin_${d.key}`])));
const indeksKarakter = (avgValK) => Math.max(0, Math.min(100, (avgValK + 5) * 10)); // skor jurnal -5..5 → 0..100

// ================= KPI =================
export function hitungKPI(data, ctx) {
  const { nilai, presensi, jurnal } = data;
  const avgNilai = rata(nilai.map((n) => num(n.nilai)));
  const mapelDinilai = [...new Set(nilai.map((n) => n.id_mapel))];
  const kkmRata = rata(mapelDinilai.map((id) => ctx.kkm(id))) ?? 75;
  const tuntas = nilai.length ? nilai.filter((n) => num(n.nilai) >= ctx.kkm(n.id_mapel)).length / nilai.length : null;

  const aka = Object.fromEntries(DIMENSI.map((d) => [d.key, rata(nilai.map((n) => num(n[`poin_${d.key}`])))]));
  const jur = Object.fromEntries(DIMENSI.map((d) => [d.key, rata(jurnal.map((j) => num(j[`val_${d.key}`])))]));
  const hadir = presensi.filter((p) => p.status_kehadiran === "HADIR").length;

  // Tren bulanan rata-rata nilai untuk sparkline & perubahan dari bulan sebelumnya
  const bulanan = deretWaktu(nilai.map((n) => n.tanggal), "monthly").map((b) => {
    const isi = nilai.filter((n) => kunciWaktu(n.tanggal, "monthly").key === b.key);
    return rata(isi.map((n) => num(n.nilai)));
  });
  const terisi = bulanan.filter((v) => v !== null);
  const delta = terisi.length >= 2 ? terisi[terisi.length - 1] - terisi[terisi.length - 2] : null;

  return {
    avgNilai, kkmRata, tuntas, delta, sparkline: bulanan,
    aka, akaKomposit: nilai.length ? rata(Object.values(aka)) : null,
    jur, jurKomposit: jurnal.length ? rata(Object.values(jur)) : null,
    hadirPct: presensi.length ? (hadir / presensi.length) * 100 : null,
  };
}

// ================= EARLY WARNING SYSTEM =================
export function hitungEWS(data, ctx, ambang = EWS_DEFAULT) {
  const a = { ...EWS_DEFAULT, ...ambang };
  const hasil = [];
  data.students.forEach((s) => {
    const issues = [];
    let skor = 0;

    // A. Akademik: nilai di bawah KKM mapel
    const bawah = data.nilai.filter((n) => n.id_siswa === s.id_siswa && num(n.nilai) < ctx.kkm(n.id_mapel))
      .map((n) => `${ctx.namaMapel(n.id_mapel)} (${num(n.nilai)})`);
    if (bawah.length >= a.belowKkmKritis) {
      skor = Math.max(skor, 3);
      issues.push({ kategori: "AKADEMIK", deskripsi: `Mendapat ${bawah.length} nilai di bawah KKM: ${bawah.slice(0, 3).join(", ")}${bawah.length > 3 ? ", …" : ""}.` });
    } else if (bawah.length) {
      skor = Math.max(skor, 1);
      issues.push({ kategori: "AKADEMIK", deskripsi: `${bawah.length} nilai di bawah KKM: ${bawah.join(", ")}.` });
    }

    // B. Presensi
    const pres = data.presensi.filter((p) => p.id_siswa === s.id_siswa);
    const alpa = pres.filter((p) => p.status_kehadiran === "ALPA").length;
    const sakitIzin = pres.filter((p) => p.status_kehadiran === "SAKIT" || p.status_kehadiran === "IZIN").length;
    if (alpa >= a.alpaKritis) {
      skor = Math.max(skor, 3);
      issues.push({ kategori: "PRESENSI", deskripsi: `Ketidakhadiran kritis: ${alpa} kali Alpa (tanpa keterangan).` });
    } else if (alpa >= 1 || alpa + sakitIzin >= a.absenPantau) {
      skor = Math.max(skor, 2);
      issues.push({ kategori: "PRESENSI", deskripsi: `Kehadiran perlu dipantau: ${alpa} Alpa, ${sakitIzin} Sakit/Izin.` });
    }

    // C. Karakter: jurnal dengan skor Karakter/Skill negatif
    const neg = data.jurnal.filter((j) => j.id_siswa === s.id_siswa && (num(j.val_K) < 0 || num(j.val_S) < 0));
    if (neg.length >= a.jurnalNegKritis) {
      skor = Math.max(skor, 3);
      issues.push({ kategori: "KARAKTER", deskripsi: `Tercatat ${neg.length} kejadian negatif pada jurnal perilaku; perlu pembinaan/konseling.` });
    } else if (neg.length === 1) {
      skor = Math.max(skor, 2);
      const narasi = neg[0].narasi_kejadian || "";
      issues.push({ kategori: "KARAKTER", deskripsi: `1 catatan perilaku negatif: "${narasi.slice(0, 60)}${narasi.length > 60 ? "…" : ""}".` });
    }

    if (issues.length) {
      hasil.push({
        id_siswa: s.id_siswa, nisn: s.nisn, nama_siswa: s.nama_siswa, kelas: ctx.namaKelas(s.id_kelas),
        skor, tingkatan: skor === 3 ? "Bahaya (Tinggi)" : skor === 2 ? "Perhatian (Sedang)" : "Waspada",
        warna: skor === 3 ? "danger" : skor === 2 ? "warning" : "info",
        kategori: [...new Set(issues.map((i) => i.kategori))], issues,
      });
    }
  });
  return hasil.sort((x, y) => y.skor - x.skor || x.nama_siswa.localeCompare(y.nama_siswa));
}

// ================= KONFIG CHART.JS =================
const opsiDasar = (extra = {}) => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: "index", intersect: false },
  plugins: { legend: { position: "bottom", labels: { usePointStyle: true, boxWidth: 8, padding: 12 } }, ...extra.plugins },
  ...extra.root,
});
const gayaGaris = (color, extra = {}) => ({
  borderColor: color, backgroundColor: `${color}22`, pointBackgroundColor: color,
  borderWidth: 2.5, tension: 0.35, pointRadius: 3, pointHoverRadius: 6, spanGaps: true, ...extra,
});
const kosong = (pesan) => ({ kosong: pesan });

// 1. Progres STNKM (garis 5 dimensi)
export function grafikProgres(data, ctx, { sumber = "AKADEMIK", siswa = "ALL", mode = "monthly" }) {
  const aka = sumber === "AKADEMIK";
  const recs = (aka ? data.nilai : data.jurnal).filter((r) => siswa === "ALL" || r.id_siswa === siswa);
  if (!recs.length) return kosong(aka ? "Belum ada nilai pada konteks ini." : "Belum ada jurnal pada konteks ini.");
  const deret = deretWaktu(recs.map((r) => r.tanggal), mode);
  const isiPer = new Map(deret.map((b) => [b.key, []]));
  recs.forEach((r) => isiPer.get(kunciWaktu(r.tanggal, mode).key)?.push(r));
  const nilaiDim = (rows, d) => r1(rata(rows.map((r) => num(r[aka ? `poin_${d.key}` : `val_${d.key}`]))));

  const datasets = DIMENSI.map((d) => ({ label: d.full, data: deret.map((b) => nilaiDim(isiPer.get(b.key), d)), ...gayaGaris(d.color) }));
  return {
    config: {
      type: "line",
      data: { labels: deret.map((b) => b.label), datasets },
      options: opsiDasar({ root: { scales: { y: { beginAtZero: !aka ? false : true }, x: { grid: { display: false }, ticks: { autoSkip: true, maxTicksLimit: 16 } } } } }),
    },
    table: {
      headers: ["Periode", ...DIMENSI.map((d) => d.label), "Jumlah Entri"],
      rows: deret.map((b, i) => [b.label, ...datasets.map((ds) => ds.data[i] ?? "-"), isiPer.get(b.key).length]),
    },
  };
}

// 2. Radar profil STNKM kelas (dan siswa terpilih)
export function grafikRadar(data, ctx, { siswa = "ALL" }) {
  if (!data.nilai.length) return kosong("Belum ada nilai untuk membentuk profil STNKM.");
  const profil = (rows) => DIMENSI.map((d) => r1(rata(rows.map((n) => num(n[`poin_${d.key}`])))));
  const datasets = [{ label: "Rata-rata kelas", data: profil(data.nilai), borderColor: "#3b82f6", backgroundColor: "rgba(59,130,246,.22)", pointBackgroundColor: "#3b82f6", borderWidth: 2 }];
  const milikSiswa = siswa !== "ALL" ? data.nilai.filter((n) => n.id_siswa === siswa) : [];
  if (milikSiswa.length) {
    datasets.push({ label: ctx.namaSiswa(siswa), data: profil(milikSiswa), borderColor: "#f59e0b", backgroundColor: "rgba(245,158,11,.18)", pointBackgroundColor: "#f59e0b", borderWidth: 2, borderDash: [5, 4] });
  }
  return {
    config: {
      type: "radar",
      data: { labels: DIMENSI.map((d) => d.full), datasets },
      options: opsiDasar({ root: { interaction: { mode: "nearest", intersect: false }, scales: { r: { beginAtZero: true, ticks: { backdropColor: "transparent" } } } } }),
    },
    table: { headers: ["Dimensi", ...datasets.map((d) => d.label)], rows: DIMENSI.map((d, i) => [d.full, ...datasets.map((ds) => ds.data[i] ?? "-")]) },
  };
}

// 3. Rata-rata per mapel vs KKM
export function grafikMapel(data, ctx) {
  const grup = new Map();
  data.nilai.forEach((n) => {
    const nama = ctx.namaMapel(n.id_mapel).trim();
    if (!grup.has(nama)) grup.set(nama, { nama, kkm: ctx.kkm(n.id_mapel), nilai: [] });
    grup.get(nama).nilai.push(num(n.nilai));
  });
  if (!grup.size) return kosong("Belum ada nilai mapel pada konteks ini.");
  const list = [...grup.values()].map((g) => ({ ...g, avg: r1(rata(g.nilai)) })).sort((a, b) => a.nama.localeCompare(b.nama));
  return {
    config: {
      type: "bar",
      data: {
        labels: list.map((g) => g.nama),
        datasets: [
          { label: "Rata-rata nilai", data: list.map((g) => g.avg), backgroundColor: list.map((g) => (g.avg >= g.kkm ? "rgba(16,185,129,.75)" : "rgba(239,68,68,.75)")), borderRadius: 8, order: 2 },
          { type: "line", label: "KKM", data: list.map((g) => g.kkm), borderColor: "#ef4444", borderDash: [6, 4], borderWidth: 2, pointRadius: 0, fill: false, order: 1 },
        ],
      },
      options: opsiDasar({ root: { scales: { y: { beginAtZero: true, suggestedMax: 100 }, x: { grid: { display: false } } } } }),
    },
    table: {
      headers: ["Mata Pelajaran", "Rata-rata", "KKM", "Status", "Jumlah Entri"],
      rows: list.map((g) => [g.nama, g.avg, g.kkm, g.avg >= g.kkm ? "Tuntas" : "Perlu Bimbingan", g.nilai.length]),
    },
  };
}

// 4. Proporsi jenis penilaian
export function grafikJenis(data, ctx) {
  const hitung = new Map();
  data.nilai.forEach((n) => { const k = ctx.namaJenis(n.id_jenis); hitung.set(k, (hitung.get(k) || 0) + 1); });
  if (!hitung.size) return kosong("Belum ada entri nilai.");
  const list = [...hitung.entries()].sort((a, b) => b[1] - a[1]);
  const total = data.nilai.length;
  return {
    config: {
      type: "doughnut",
      data: { labels: list.map((x) => x[0]), datasets: [{ data: list.map((x) => x[1]), backgroundColor: list.map((_, i) => PALET[i % PALET.length]), borderWidth: 2 }] },
      options: opsiDasar({ root: { cutout: "62%", interaction: { mode: "nearest", intersect: true } } }),
    },
    table: { headers: ["Jenis Penilaian", "Jumlah Entri", "Persentase"], rows: list.map(([k, v]) => [k, v, `${((v / total) * 100).toFixed(1)}%`]) },
  };
}

// 5. Distribusi nilai (histogram rentang)
export function grafikDistribusi(data) {
  if (!data.nilai.length) return kosong("Belum ada nilai.");
  const rentang = [
    { label: "< 60", min: -Infinity, max: 60, color: "#ef4444" },
    { label: "60–69", min: 60, max: 70, color: "#f97316" },
    { label: "70–79", min: 70, max: 80, color: "#f59e0b" },
    { label: "80–89", min: 80, max: 90, color: "#10b981" },
    { label: "90–100", min: 90, max: Infinity, color: "#3b82f6" },
  ];
  const jumlah = rentang.map((r) => data.nilai.filter((n) => num(n.nilai) >= r.min && num(n.nilai) < r.max).length);
  return {
    config: {
      type: "bar",
      data: { labels: rentang.map((r) => r.label), datasets: [{ label: "Jumlah nilai", data: jumlah, backgroundColor: rentang.map((r) => r.color), borderRadius: 8 }] },
      options: opsiDasar({ plugins: { legend: { display: false } }, root: { scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false } } } } }),
    },
    table: { headers: ["Rentang Nilai", "Jumlah", "Persentase"], rows: rentang.map((r, i) => [r.label, jumlah[i], `${((jumlah[i] / data.nilai.length) * 100).toFixed(1)}%`]) },
  };
}

// 6. Komposisi kehadiran
export function grafikKehadiran(data) {
  if (!data.presensi.length) return kosong("Belum ada data presensi pada periode ini.");
  const jumlah = STATUS_HADIR.map((s) => data.presensi.filter((p) => p.status_kehadiran === s.key).length);
  return {
    config: {
      type: "doughnut",
      data: { labels: STATUS_HADIR.map((s) => s.label), datasets: [{ data: jumlah, backgroundColor: STATUS_HADIR.map((s) => s.color), borderWidth: 2 }] },
      options: opsiDasar({ root: { cutout: "62%", interaction: { mode: "nearest", intersect: true } } }),
    },
    table: { headers: ["Status", "Jumlah", "Persentase"], rows: STATUS_HADIR.map((s, i) => [s.label, jumlah[i], `${((jumlah[i] / data.presensi.length) * 100).toFixed(1)}%`]) },
  };
}

// 7. Korelasi nilai, kehadiran, dan karakter per siswa
export function grafikKorelasi(data, ctx, { batas = 15 } = {}) {
  const baris = data.students.map((s) => {
    const nil = data.nilai.filter((n) => n.id_siswa === s.id_siswa);
    const pres = data.presensi.filter((p) => p.id_siswa === s.id_siswa);
    const jur = data.jurnal.filter((j) => j.id_siswa === s.id_siswa);
    return {
      nama: s.nama_siswa,
      nilai: nil.length ? r1(rata(nil.map((n) => num(n.nilai)))) : null,
      hadir: pres.length ? r1((pres.filter((p) => p.status_kehadiran === "HADIR").length / pres.length) * 100) : null,
      karakter: jur.length ? r1(indeksKarakter(rata(jur.map((j) => num(j.val_K))))) : null,
    };
  }).filter((b) => b.nilai !== null || b.hadir !== null || b.karakter !== null).slice(0, batas);
  if (!baris.length) return kosong("Belum ada data nilai, presensi, atau jurnal siswa.");
  const ds = [
    { key: "nilai", label: "Rata-rata nilai", color: "rgba(59,130,246,.8)" },
    { key: "hadir", label: "% Kehadiran", color: "rgba(16,185,129,.8)" },
    { key: "karakter", label: "Indeks karakter", color: "rgba(245,158,11,.85)" },
  ];
  return {
    config: {
      type: "bar",
      data: { labels: baris.map((b) => b.nama.split(" ")[0]), datasets: ds.map((d) => ({ label: d.label, data: baris.map((b) => b[d.key]), backgroundColor: d.color, borderRadius: 5 })) },
      options: opsiDasar({ root: { scales: { y: { beginAtZero: true, max: 100 }, x: { grid: { display: false } } } } }),
    },
    table: { headers: ["Siswa", ...ds.map((d) => d.label)], rows: baris.map((b) => [b.nama, b.nilai ?? "-", b.hadir ?? "-", b.karakter ?? "-"]) },
  };
}

// ================= GRAFIK KUSTOM =================
export const METRIK = [
  { id: "nilai_avg", label: "Rata-rata nilai", sumber: "nilai", agg: "avg", nilaiDari: (r) => num(r.nilai) },
  { id: "stnkm_avg", label: "Rata-rata poin STNKM (gabungan)", sumber: "nilai", agg: "avg", nilaiDari: poinGabungan },
  ...DIMENSI.map((d) => ({ id: `poin_${d.key}`, label: `Poin ${d.label} (akademik)`, sumber: "nilai", agg: "avg", nilaiDari: (r) => num(r[`poin_${d.key}`]) })),
  { id: "tuntas_pct", label: "% Ketuntasan (nilai ≥ KKM)", sumber: "nilai", agg: "pct", cocok: (r, ctx) => num(r.nilai) >= ctx.kkm(r.id_mapel) },
  { id: "nilai_count", label: "Jumlah entri nilai", sumber: "nilai", agg: "count" },
  ...DIMENSI.map((d) => ({ id: `jurnal_${d.key}`, label: `Skor jurnal ${d.label}`, sumber: "jurnal", agg: "avg", nilaiDari: (r) => num(r[`val_${d.key}`]) })),
  { id: "jurnal_count", label: "Jumlah entri jurnal", sumber: "jurnal", agg: "count" },
  { id: "hadir_pct", label: "% Kehadiran", sumber: "presensi", agg: "pct", cocok: (r) => r.status_kehadiran === "HADIR" },
  { id: "alpa_count", label: "Jumlah alpa", sumber: "presensi", agg: "count", saring: (r) => r.status_kehadiran === "ALPA" },
  { id: "absen_count", label: "Jumlah tidak hadir (S/I/A)", sumber: "presensi", agg: "count", saring: (r) => r.status_kehadiran !== "HADIR" },
];
export const KELOMPOK = [
  { id: "mapel", label: "Mata pelajaran", sumber: ["nilai"], kunci: (r) => r.id_mapel, nama: (k, ctx) => ctx.namaMapel(k) },
  { id: "jenis", label: "Jenis penilaian", sumber: ["nilai"], kunci: (r) => r.id_jenis || "-", nama: (k, ctx) => ctx.namaJenis(k) },
  { id: "siswa", label: "Siswa", sumber: ["nilai", "jurnal", "presensi"], kunci: (r) => r.id_siswa, nama: (k, ctx) => ctx.namaSiswa(k) },
  { id: "kelas", label: "Kelas", sumber: ["nilai", "jurnal", "presensi"], kunci: (r) => r.id_kelas, nama: (k, ctx) => ctx.namaKelas(k) },
  { id: "bulan", label: "Bulan", waktu: "monthly", sumber: ["nilai", "jurnal", "presensi"] },
  { id: "minggu", label: "Minggu", waktu: "weekly", sumber: ["nilai", "jurnal", "presensi"] },
  { id: "hari", label: "Hari", waktu: "daily", sumber: ["nilai", "jurnal", "presensi"] },
];
export const TIPE_GRAFIK = [
  { id: "bar", label: "Batang", icon: "bi-bar-chart" },
  { id: "barH", label: "Batang horizontal", icon: "bi-bar-chart-steps" },
  { id: "line", label: "Garis", icon: "bi-graph-up" },
  { id: "area", label: "Area", icon: "bi-graph-up-arrow" },
  { id: "doughnut", label: "Donat", icon: "bi-pie-chart" },
  { id: "pie", label: "Pai", icon: "bi-pie-chart-fill" },
  { id: "polarArea", label: "Polar", icon: "bi-bullseye" },
  { id: "radar", label: "Radar", icon: "bi-hexagon" },
];
export const PRESET_KUSTOM = [
  { judul: "10 siswa dengan rata-rata nilai tertinggi", tipe: "barH", metrik: ["nilai_avg"], kelompok: "siswa", urut: "desc", batas: 10 },
  { judul: "% ketuntasan per mata pelajaran", tipe: "bar", metrik: ["tuntas_pct"], kelompok: "mapel", urut: "desc", batas: 15 },
  { judul: "Tren jumlah entri nilai per minggu", tipe: "area", metrik: ["nilai_count"], kelompok: "minggu", urut: "label", batas: 52 },
  { judul: "Kehadiran per kelas", tipe: "bar", metrik: ["hadir_pct"], kelompok: "kelas", urut: "desc", batas: 20 },
  { judul: "Skor karakter & minat jurnal per siswa", tipe: "bar", metrik: ["jurnal_K", "jurnal_M"], kelompok: "siswa", urut: "desc", batas: 12 },
  { judul: "Poin Skill vs Teori per mapel", tipe: "radar", metrik: ["poin_S", "poin_T"], kelompok: "mapel", urut: "label", batas: 12 },
];

const agregasi = (metrik, rows, ctx) => {
  const isi = metrik.saring ? rows.filter(metrik.saring) : rows;
  if (metrik.agg === "count") return isi.length;
  if (!isi.length) return null;
  if (metrik.agg === "pct") return r1((isi.filter((r) => metrik.cocok(r, ctx)).length / isi.length) * 100);
  return r1(rata(isi.map(metrik.nilaiDari)));
};

export function hitungKustom(data, ctx, spec) {
  const kelompok = KELOMPOK.find((k) => k.id === spec.kelompok);
  const daftarMetrik = (spec.metrik || []).map((id) => METRIK.find((m) => m.id === id)).filter(Boolean);
  if (!kelompok || !daftarMetrik.length) return kosong("Pilih metrik dan pengelompokan.");
  const tidakCocok = daftarMetrik.filter((m) => !kelompok.sumber.includes(m.sumber));
  if (tidakCocok.length) {
    return kosong(`Metrik "${tidakCocok[0].label}" tidak bisa dikelompokkan per ${kelompok.label.toLowerCase()} (data ${tidakCocok[0].sumber} tidak memiliki atribut itu).`);
  }

  const sumberData = { nilai: data.nilai, jurnal: data.jurnal, presensi: data.presensi };
  const melingkar = ["doughnut", "pie", "polarArea"].includes(spec.tipe);
  const metrikAktif = melingkar ? daftarMetrik.slice(0, 1) : daftarMetrik;

  // Tentukan grup (kunci + label) dari semua sumber yang dipakai
  let grup;
  if (kelompok.waktu) {
    const semuaTanggal = metrikAktif.flatMap((m) => sumberData[m.sumber].map((r) => r.tanggal));
    grup = deretWaktu(semuaTanggal, kelompok.waktu);
  } else {
    const kunciSet = new Set(metrikAktif.flatMap((m) => sumberData[m.sumber].map(kelompok.kunci)).filter((k) => k !== null && k !== undefined));
    grup = [...kunciSet].map((k) => ({ key: k, label: kelompok.nama(k, ctx) }));
  }
  if (!grup.length) return kosong("Belum ada data untuk kombinasi ini.");

  const kunciDari = (r) => (kelompok.waktu ? kunciWaktu(r.tanggal, kelompok.waktu).key : kelompok.kunci(r));
  const nilaiSeri = metrikAktif.map((m) => {
    const per = new Map(grup.map((g) => [g.key, []]));
    sumberData[m.sumber].forEach((r) => per.get(kunciDari(r))?.push(r));
    return grup.map((g) => agregasi(m, per.get(g.key), ctx));
  });

  // Urutkan grup non-waktu berdasarkan metrik pertama, lalu batasi jumlahnya
  let urutan = grup.map((_, i) => i);
  if (!kelompok.waktu && spec.urut !== "label") {
    urutan.sort((a, b) => ((nilaiSeri[0][b] ?? -Infinity) - (nilaiSeri[0][a] ?? -Infinity)) * (spec.urut === "asc" ? -1 : 1));
  } else if (!kelompok.waktu) {
    urutan.sort((a, b) => String(grup[a].label).localeCompare(String(grup[b].label)));
  }
  const batas = Math.max(1, Math.min(Number(spec.batas) || 12, 100));
  if (!kelompok.waktu) urutan = urutan.slice(0, batas);

  const labels = urutan.map((i) => grup[i].label);
  const warnaDasar = spec.warna && spec.warna !== "palet" ? spec.warna : null;
  const datasets = metrikAktif.map((m, mi) => {
    const data2 = urutan.map((i) => nilaiSeri[mi][i]);
    const color = mi === 0 && warnaDasar ? warnaDasar : PALET[mi % PALET.length];
    if (melingkar) return { label: m.label, data: data2, backgroundColor: labels.map((_, i) => PALET[i % PALET.length]), borderWidth: 2 };
    if (spec.tipe === "line" || spec.tipe === "area") return { label: m.label, data: data2, ...gayaGaris(color, { fill: spec.tipe === "area" ? "origin" : false, backgroundColor: `${color}33` }) };
    if (spec.tipe === "radar") return { label: m.label, data: data2, borderColor: color, backgroundColor: `${color}33`, pointBackgroundColor: color, borderWidth: 2 };
    return { label: m.label, data: data2, backgroundColor: `${color}cc`, borderColor: color, borderWidth: 1, borderRadius: 6 };
  });

  const tipeChart = spec.tipe === "barH" ? "bar" : spec.tipe === "area" ? "line" : spec.tipe;
  const sumbu = ["bar", "barH", "line", "area"].includes(spec.tipe);
  return {
    config: {
      type: tipeChart,
      data: { labels, datasets },
      options: opsiDasar({
        plugins: { legend: { display: melingkar || datasets.length > 1 } },
        root: {
          ...(spec.tipe === "barH" ? { indexAxis: "y" } : {}),
          ...(melingkar ? { interaction: { mode: "nearest", intersect: true } } : {}),
          ...(sumbu ? { scales: { [spec.tipe === "barH" ? "x" : "y"]: { beginAtZero: true }, [spec.tipe === "barH" ? "y" : "x"]: { grid: { display: false } } } } : {}),
          ...(spec.tipe === "radar" ? { scales: { r: { beginAtZero: true, ticks: { backdropColor: "transparent" } } } } : {}),
        },
      }),
    },
    table: { headers: [kelompok.label, ...metrikAktif.map((m) => m.label)], rows: labels.map((l, i) => [l, ...datasets.map((d) => d.data[i] ?? "-")]) },
  };
}
