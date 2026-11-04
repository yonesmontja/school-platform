// Ekspor rekap rapor satu kelas ke Excel bergaya e-Rapor SD (Kurikulum Merdeka).
// Format resmi impor e-Rapor berbeda tiap versi dan diunduh dari aplikasi e-Rapor masing-masing sekolah,
// jadi berkas ini disusun mengikuti konsep e-Rapor: satu lembar per mata pelajaran berisi NISN, nama,
// nilai akhir, ceklis tujuan pembelajaran (T = tercapai, P = perlu pendampingan), dan dua deskripsi capaian
// kompetensi (yang sudah dicapai & yang perlu pendampingan). Isinya bisa disalin per kolom ke format e-Rapor.
import * as XLSX from "xlsx";
import { hitungRapor, num } from "@/components/rapor/raporDokumen";

const rata = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const BATAS_DESKRIPSI = 300; // panjang aman satu kolom deskripsi di e-Rapor

// "Menyebutkan pembilang" → "menyebutkan pembilang" (huruf awal kecil agar menyatu dalam kalimat)
const frasa = (t) => String(t || "").trim().replace(/[.;]+$/, "").replace(/^\p{Lu}(?!\p{Lu})/u, (c) => c.toLowerCase());
// Penghubung terakhir "serta" agar tidak rancu dengan "dan" di dalam rumusan TP
const gabung = (a) => (a.length <= 1 ? a.join("") : `${a.slice(0, -1).join(", ")}, serta ${a[a.length - 1]}`.replace(/^([^,]+), serta/, "$1 serta"));
const potong = (t) => (t.length > BATAS_DESKRIPSI ? `${t.slice(0, BATAS_DESKRIPSI - 1).replace(/[\s,]+\S*$/, "")}.` : t);
const namaLembar = (nama, dipakai) => {
  let n = String(nama).replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 28) || "Mapel";
  let k = n, i = 2;
  while (dipakai.has(k.toLowerCase())) k = `${n.slice(0, 25)} ${i++}`;
  dipakai.add(k.toLowerCase());
  return k;
};

/**
 * Daftar TP per mapel untuk kelas ini. Mapel yang dinilai per indikator memakai indikatornya (TP),
 * mapel tanpa indikator memakai materi yang dinilai sebagai lingkup capaian.
 */
function daftarTp(data, idsMapel) {
  const ind = new Map();
  (data.nilai_indikator || []).filter((b) => idsMapel.includes(b.id_mapel)).forEach((b) => {
    if (!ind.has(b.id_indikator)) ind.set(b.id_indikator, { kunci: `I:${b.id_indikator}`, materi: b.nama_materi || "-", teks: b.deskripsi, urutan: b.urutan ?? 0 });
  });
  if (ind.size) return [...ind.values()].sort((a, b) => a.materi.localeCompare(b.materi) || a.urutan - b.urutan);
  const materi = new Map();
  data.nilai.filter((n) => idsMapel.includes(n.id_mapel) && n.materi?.nama_materi).forEach((n) => {
    if (!materi.has(n.id_materi)) materi.set(n.id_materi, { kunci: `M:${n.id_materi}`, materi: n.materi.nama_materi, teks: n.materi.nama_materi, urutan: 0 });
  });
  return [...materi.values()].sort((a, b) => a.materi.localeCompare(b.materi));
}

/** Nilai efektif siswa per TP: remedial terbaru menggantikan rata-rata nilai reguler (sama dengan rapor). */
function nilaiTp(data, idSiswa, idsMapel) {
  const per = {};
  (data.nilai_indikator || []).filter((b) => b.id_siswa === idSiswa && idsMapel.includes(b.id_mapel)).forEach((b) => {
    const p = (per[`I:${b.id_indikator}`] ??= { reguler: [], remedial: null });
    if (b.tipe_nilai === "REMEDIAL") p.remedial = num(b.nilai); else p.reguler.push(num(b.nilai));
  });
  data.nilai.filter((n) => n.id_siswa === idSiswa && idsMapel.includes(n.id_mapel) && num(n.nilai) > 0).forEach((n) => {
    const p = (per[`M:${n.id_materi}`] ??= { reguler: [], remedial: null });
    if (n.tipe_nilai === "REMEDIAL") p.remedial = num(n.nilai); else p.reguler.push(num(n.nilai));
  });
  return Object.fromEntries(Object.entries(per).map(([k, p]) => [k, p.remedial ?? rata(p.reguler)]));
}

function deskripsi(tercapai, perlu) {
  return {
    tercapai: tercapai.length ? potong(`Menunjukkan penguasaan yang baik dalam ${gabung(tercapai.map((t) => frasa(t.teks)))}.`) : "",
    perlu: perlu.length ? potong(`Perlu pendampingan dalam ${gabung(perlu.map((t) => frasa(t.teks)))}.`) : "",
  };
}

const lebarKolom = (baris) => baris[0].map((_, c) => ({ wch: Math.min(60, Math.max(6, ...baris.map((r) => String(r[c] ?? "").length + 2))) }));

export function eksporErapor({ data, modeKalkulasi, bobot }) {
  const siswa = [...data.students].sort((a, b) => String(a.nama_siswa).localeCompare(String(b.nama_siswa)));
  const rapor = Object.fromEntries(siswa.map((s) => [s.id_siswa, hitungRapor(data, s.id_siswa, modeKalkulasi, bobot)]));
  const kelas = data.kelas?.nama_kelas || "-";
  const periode = `${data.periode?.tahun_ajaran || "-"} ${data.periode?.semester || ""}`.trim();
  const wb = XLSX.utils.book_new();
  const dipakai = new Set(["petunjuk", "referensi tp", "kehadiran", "kokurikuler", "catatan wali"]);
  const referensi = [["Mata Pelajaran", "Kode", "Materi / Lingkup", "Tujuan Pembelajaran (TP)"]];
  const ringkasMapel = [];

  // Grup mapel mengikuti baris rapor (mapel paralel bernama sama digabung)
  const grup = [];
  data.subjects.forEach((m) => {
    const nama = String(m.nama_mapel).trim();
    const ada = grup.find((g) => g.nama.toLowerCase() === nama.toLowerCase());
    if (ada) ada.ids.push(m.id_mapel); else grup.push({ nama, kkm: Number(m.kkm) || 75, ids: [m.id_mapel] });
  });

  grup.forEach((g) => {
    const adaNilai = siswa.some((s) => rapor[s.id_siswa]?.mapelRows.find((r) => r.nama === g.nama)?.nilai != null);
    if (!adaNilai) return;
    const tp = daftarTp(data, g.ids);
    tp.forEach((t, i) => referensi.push([g.nama, `TP${i + 1}`, t.materi, t.teks]));

    const baris = [
      [`Mata Pelajaran: ${g.nama}`, "", "", `KKM: ${g.kkm}`],
      [`Kelas: ${kelas}`, "", "", `Semester: ${periode}`],
      [],
      ["No", "NISN", "Nama Siswa", "Nilai Akhir", ...tp.map((_, i) => `TP${i + 1}`), "Capaian Kompetensi (Tercapai)", "Capaian Kompetensi (Perlu Pendampingan)"],
    ];
    siswa.forEach((s, i) => {
      const nilai = rapor[s.id_siswa]?.mapelRows.find((r) => r.nama === g.nama)?.nilai ?? "";
      const per = nilaiTp(data, s.id_siswa, g.ids);
      const status = tp.map((t) => (per[t.kunci] == null ? "" : per[t.kunci] >= g.kkm ? "T" : "P"));
      const d = deskripsi(tp.filter((_, j) => status[j] === "T"), tp.filter((_, j) => status[j] === "P"));
      baris.push([i + 1, s.nisn || "", s.nama_siswa, nilai, ...status, d.tercapai, d.perlu]);
    });
    const ws = XLSX.utils.aoa_to_sheet(baris);
    ws["!cols"] = lebarKolom(baris.slice(3));
    ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 3, c: 0 }, e: { r: baris.length - 1, c: baris[3].length - 1 } }) };
    XLSX.utils.book_append_sheet(wb, ws, namaLembar(g.nama, dipakai));
    ringkasMapel.push([g.nama, tp.length, siswa.filter((s) => rapor[s.id_siswa]?.mapelRows.find((r) => r.nama === g.nama)?.nilai != null).length]);
  });

  const lembar = (nama, baris) => {
    const ws = XLSX.utils.aoa_to_sheet(baris);
    ws["!cols"] = lebarKolom(baris);
    XLSX.utils.book_append_sheet(wb, ws, nama);
  };

  lembar("Kehadiran", [["No", "NISN", "Nama Siswa", "Sakit", "Izin", "Tanpa Keterangan"],
    ...siswa.map((s, i) => { const p = rapor[s.id_siswa]?.presensi || {}; return [i + 1, s.nisn || "", s.nama_siswa, p.sakit || 0, p.izin || 0, p.alpa || 0]; })]);

  const proyek = data.proyek || [];
  if (proyek.length) {
    lembar("Kokurikuler", [["No", "NISN", "Nama Siswa", ...proyek.map((p) => `Deskripsi: ${p.judul_proyek}`)],
      ...siswa.map((s, i) => [i + 1, s.nisn || "", s.nama_siswa,
        ...(rapor[s.id_siswa]?.proyek || []).map((p) => (p.dimensi.some((d) => d.targets.some((t) => t.predikat)) ? potong(p.deskripsi) : ""))])]);
  }

  lembar("Catatan Wali", [["No", "NISN", "Nama Siswa", "Catatan Wali Kelas"],
    ...siswa.map((s, i) => [i + 1, s.nisn || "", s.nama_siswa, rapor[s.id_siswa]?.catatanTersimpan ? rapor[s.id_siswa].catatan : ""])]);

  lembar("Referensi TP", referensi);

  // Petunjuk di depan
  const petunjuk = [
    ["REKAP NILAI UNTUK e-RAPOR SD (Kurikulum Merdeka)"],
    [`Sekolah: ${data.settings?.nama_sekolah || "-"}`],
    [`Kelas: ${kelas}   ·   Semester: ${periode}   ·   Wali kelas: ${data.wali_kelas?.nama_guru || "-"}`],
    [`Diekspor: ${new Date().toLocaleString("id-ID")}`],
    [],
    ["Cara memakai"],
    ["1. Di e-Rapor, buka Input Nilai Rapor → pilih kelas & mapel → Download Format Nilai."],
    ["2. Buka lembar mapel yang sama di berkas ini; salin kolom per kolom ke format e-Rapor, dicocokkan per NISN/nama siswa."],
    ["3. Nilai Akhir → kolom nilai rapor. Kolom TP → ceklis TP di e-Rapor (T = tercapai, P = perlu pendampingan, kosong = belum dinilai)."],
    ["4. Capaian Kompetensi (Tercapai/Perlu Pendampingan) → kolom deskripsi; maks. 300 karakter, sudah dipangkas otomatis."],
    ["5. Simpan format e-Rapor sesuai petunjuk aplikasinya (umumnya Excel 97-2003 .xls), lalu Upload/Import Nilai."],
    ["6. Lembar Kehadiran, Kokurikuler, dan Catatan Wali untuk menu wali kelas di e-Rapor."],
    [],
    ["Keterangan"],
    ["• Nilai akhir = nilai rapor EduRapor dengan mode kalkulasi yang sedang dipilih; nilai remedial mengikuti kebijakan sekolah."],
    ["• TP ditentukan dari indikator penilaian; mapel tanpa indikator memakai materi yang dinilai. Daftar lengkap ada di lembar Referensi TP."],
    ["• Berkas ini bukan format impor resmi e-Rapor; susunan kolomnya dibuat agar mudah disalin ke format nilai versi mana pun."],
    [],
    ["Mata Pelajaran", "Jumlah TP", "Siswa bernilai"],
    ...ringkasMapel,
  ];
  const ws = XLSX.utils.aoa_to_sheet(petunjuk);
  ws["!cols"] = [{ wch: 110 }, { wch: 12 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, ws, "Petunjuk");
  wb.SheetNames = ["Petunjuk", ...wb.SheetNames.filter((n) => n !== "Petunjuk")];

  const nama = `eRapor_${kelas}_${periode}`.replace(/[^\w\-]+/g, "_");
  XLSX.writeFile(wb, `${nama}.xlsx`);
  return { mapel: ringkasMapel.length, siswa: siswa.length };
}
