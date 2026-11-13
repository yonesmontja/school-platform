// Olah data Prota/Promes dari API menjadi kolom & baris Gantt, matriks Promes, dan tabel ekspor.

export const STATUS_TP = {
  TUNTAS: { label: "Tuntas", warna: "#2fb344", ket: "JP terlaksana sudah memenuhi alokasi ATP" },
  BERLANGSUNG: { label: "Berlangsung", warna: "#206bc4", ket: "Sudah ada sesi yang berjalan/selesai, alokasi belum terpenuhi" },
  TERJADWAL: { label: "Terjadwal", warna: "#4299e1", ket: "Sudah ada sesi di jadwal, belum dilaksanakan" },
  TERLAMBAT: { label: "Terlambat", warna: "#d63939", ket: "Rentang minggu rencana sudah lewat, alokasi JP belum terpenuhi" },
  BELUM: { label: "Belum", warna: "#8a94a6", ket: "Belum ada sesi jadwal untuk TP ini" },
};

const BULAN_PENDEK = ["", "Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const tglPendek = (s) => new Date(`${s}T00:00`).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
const ymdHariIni = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
export const nilaiDi = (obj, i) => (obj ? Number(obj[i] ?? obj[String(i)] ?? 0) : 0);

const barisGantt = (b, keKolom) => ({
  id: `${b.id}`, no: b.no,
  judul: b.tp || b.materi || "(TP belum diisi)",
  sub: [b.materi, b.alokasi_jp ? `${b.alokasi_jp} JP` : null, b.minggu_teks ? `minggu ${b.minggu_teks}` : null].filter(Boolean).join(" · "),
  tp: b.tp && b.materi ? `Materi: ${b.materi}` : null,
  jp: b.alokasi_jp, jpSelesai: b.jp_selesai, jpTerjadwal: b.jp_terjadwal, persen: b.persen, status: b.status, mingguTeks: b.minggu_teks,
  rencana: { awal: keKolom(b.rencana.awal), akhir: keKolom(b.rencana.akhir) },
  realisasi: b.realisasi ? { awal: keKolom(b.realisasi.awal), akhir: keKolom(b.realisasi.akhir) } : null,
  sesi: b.sesi.map((s) => ({ ...s, kolom: s.minggu >= 0 ? keKolom(s.minggu) : -1 })),
});

/** Promes: satu kolom per minggu kalender semester. */
export function ganttPromes(d) {
  const kolom = d.minggu.map((m) => ({
    key: m.mulai, label: m.efektif ? String(m.ke_efektif) : "–", grup: m.nama_bulan, efektif: m.efektif,
    judul: `${tglPendek(m.mulai)}–${tglPendek(m.selesai)}${m.efektif ? ` · minggu efektif ke-${m.ke_efektif}` : ` · tidak efektif${m.ditandai ? `: ${m.ditandai}` : ""}`}${m.libur.length ? ` · libur: ${m.libur.join(", ")}` : ""}`,
  }));
  const hari = ymdHariIni();
  let posisi = null;
  if (d.minggu_ini >= 0 && d.minggu_ini < d.minggu.length) {
    const selisih = (new Date(`${hari}T00:00`) - new Date(`${d.minggu[d.minggu_ini].mulai}T00:00`)) / 864e5;
    posisi = d.minggu_ini + Math.min(1, Math.max(0, selisih / 7));
  }
  return { kolom, baris: d.baris.map((b) => barisGantt(b, (i) => i)), posisi };
}

/** Prota: satu kolom per bulan, Ganjil lalu Genap; minggu dipetakan ke bulannya. */
export function ganttProta(data) {
  const kolom = [];
  const baris = [];
  let posisi = null;
  const hari = ymdHariIni();
  data.semester.forEach((d) => {
    const awal = kolom.length;
    const indeksBulan = Object.fromEntries(d.bulan.map((b, i) => [b.bulan, awal + i]));
    d.bulan.forEach((b) => kolom.push({
      key: `${d.periode.id_periode}-${b.bulan}`, label: BULAN_PENDEK[Number(b.bulan.slice(5))], grup: `Semester ${d.periode.semester} ${d.periode.tahun_ajaran}`,
      efektif: b.efektif > 0, judul: `${b.nama} · ${b.efektif} minggu efektif dari ${b.jumlah_minggu}`,
    }));
    const keKolom = (i) => indeksBulan[d.minggu[Math.max(0, Math.min(d.minggu.length - 1, i))]?.bulan] ?? awal;
    baris.push({ id: `seksi-${d.periode.id_periode}`, seksi: `Semester ${d.periode.semester}${d.atp ? ` · ${d.atp.judul}` : " · belum ada ATP"}` });
    d.baris.forEach((b) => baris.push({ ...barisGantt(b, keKolom), id: `${d.periode.id_periode}-${b.id}` }));
    if (hari >= d.periode.tanggal_mulai && hari <= d.periode.tanggal_selesai) {
      const kunci = hari.slice(0, 7);
      if (indeksBulan[kunci] !== undefined) {
        const t = new Date(`${hari}T00:00`);
        const hariDalamBulan = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
        posisi = indeksBulan[kunci] + (t.getDate() - 1) / hariDalamBulan;
      }
    }
  });
  return { kolom, baris, posisi };
}

/** Ringkasan Prota dari kedua semester. */
export function ringkasProta(data) {
  const r = { jp_rencana: 0, jp_selesai: 0, tp_total: 0, tp_tuntas: 0, tp_terlambat: 0, sesi_total: 0, sesi_selesai: 0, minggu_efektif: 0, minggu_total: 0 };
  data.semester.forEach((d) => Object.keys(r).forEach((k) => { r[k] += Number(d.ringkasan[k] || 0); }));
  r.persen = r.jp_rencana ? Math.round(Math.min(100, (r.jp_selesai / r.jp_rencana) * 100)) : 0;
  return r;
}

/** Baris tabel Promes (dipakai tampilan & ekspor): JP rencana per minggu kalender. */
export function matriksPromes(d) {
  return d.baris.map((b) => ({
    b,
    sel: d.minggu.map((m, i) => ({ rencana: nilaiDi(b.rencana.jp_per_minggu, i), realisasi: nilaiDi(b.realisasi_per_minggu, i), efektif: m.efektif })),
  }));
}

export const namaFile = (s) => String(s || "").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "_");
