"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import Swal from "sweetalert2";
import * as XLSX from "xlsx";
import { API_URL } from "@/app/lib/config";
import { useAlasanBukanHariSekolah } from "@/app/lib/hariSekolah";
import RingkasanNilai from "@/components/nilai/RingkasanNilai";

const getToken = () => localStorage.getItem("token");

const MAX_FILE_MB = 10;
// Harus sama dengan batas records di JurnalController::importBatch
const MAX_JURNAL_ROWS = 1000;
const PREVIEW_PAGE_SIZE = 50;
const DIMENSI = ["S", "T", "N", "K", "M"];

// Tanggal lokal (YYYY-MM-DD); toISOString() memakai UTC sehingga pagi hari di WIB/WIT masih tanggal kemarin
const toYmd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const todayLocal = () => toYmd(new Date());

// Nama kolom dicocokkan tanpa membedakan huruf besar/kecil, spasi, "-" dan "_"
const normKey = (k) => String(k).toLowerCase().replace(/[\s_-]/g, "");
const COLUMN_ALIASES = {
  id_siswa: ["idsiswa", "id", "nis"],
  nama_siswa: ["namasiswa", "nama"],
  nilai: ["nilai", "skor"],
  rata: ["ratarata", "rata2", "rerata", "nilai"],
  tanggal: ["tanggal", "tgl"],
  tipe: ["tipe", "tipenilai"],
  narasi: ["narasikejadian", "narasi", "catatan"],
  ...Object.fromEntries(DIMENSI.map((d) => [d, [d.toLowerCase(), `poin${d.toLowerCase()}`, `val${d.toLowerCase()}`]])),
};

const isEmpty = (v) => v === undefined || v === null || String(v).trim() === "";
// Sel indikator di template remedial yang tidak perlu diulang berisi "✓ tuntas"; dianggap kosong
const kosongIndikator = (v) => isEmpty(v) || /tuntas|^[-–]$/i.test(String(v).trim());
const formatAngka = (v) => (Number.isInteger(v) ? v : Number(v).toFixed(1));

// Nama dianggap cocok bila tiap kata di file adalah awal salah satu kata nama di sistem ("Budi S." cocok dengan "Budi Santoso")
const kataNama = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
const namaCocok = (dariFile, diSistem) => {
  const f = kataNama(dariFile), s = kataNama(diSistem);
  return !f.length || f.every((k) => s.some((t) => t.startsWith(k)));
};
const toNumber = (v) => {
  if (typeof v === "number") return v;
  const n = Number(String(v).trim().replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};

// Sel tanggal bisa berupa serial Excel, "YYYY-MM-DD" atau "DD/MM/YYYY"
const parseTanggal = (v) => {
  if (v instanceof Date && !isNaN(v)) return toYmd(v);
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    return d ? `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}` : null;
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
};

const labelPeriode = (p) => `${p.tahun_ajaran} (${p.semester})`;

// Kolom indikator di template: "1. Deskripsi singkat [IND-XXXX]"; ID di dalam kurung siku yang dibaca saat import
const POLA_KOLOM_INDIKATOR = /\[(IND-[A-Za-z0-9]+)\]\s*$/;
const kolomIndikator = (no, i) => `${no}. ${i.deskripsi.length > 40 ? `${i.deskripsi.slice(0, 39)}…` : i.deskripsi} [${i.id_indikator}]`;
const labelMateri = (m) => `${m.nama_materi}${m.kategori?.nama_kategori ? ` [${m.kategori.nama_kategori}]` : ""}`;

const STATUS_META = {
  ok: { label: "Siap", cls: "text-bg-success", row: "" },
  skip: { label: "Dilewati", cls: "text-bg-warning", row: "table-warning" },
  error: { label: "Error", cls: "text-bg-danger", row: "table-danger" },
};

const InfoBox = ({ icon, color, label, value }) => (
  <div className="col-6 col-lg-3">
    <div className="info-box shadow-sm mb-0 h-100">
      <span className={`info-box-icon text-bg-${color} shadow-sm`}><i className={`bi ${icon}`}></i></span>
      <div className="info-box-content">
        <span className="info-box-text small text-truncate">{label}</span>
        <span className="info-box-number fs-5">{value}</span>
      </div>
    </div>
  </div>
);

export default function ImportExcelPage() {
  // --- DATA REFERENSI ---
  const [ref, setRef] = useState({ periodes: [], classes: [], subjects: [], mbks: [], students: [] });
  const [materis, setMateris] = useState([]);
  const [loadingRef, setLoadingRef] = useState(true);

  // --- PENGATURAN ---
  const [mode, setMode] = useState("NILAI"); // NILAI | JURNAL
  const [metode, setMetode] = useState("OTOMATIS"); // OTOMATIS | MANUAL
  const [meta, setMeta] = useState({
    id_kelas: "", id_mapel: "", id_periode: "", id_jenis: "", id_materi: "", tanggal: todayLocal(),
    id_jenis_jurnal: "", mode_dampak: "PISAH",
  });

  // --- FILE ---
  const [fileName, setFileName] = useState("");
  const [rawRows, setRawRows] = useState([]);
  const [colMap, setColMap] = useState({});
  const [hanyaBermasalah, setHanyaBermasalah] = useState(false);
  const [previewPage, setPreviewPage] = useState(1);
  const [saving, setSaving] = useState(false);
  const [versiRingkasan, setVersiRingkasan] = useState(0); // naik setelah impor agar ringkasan dimuat ulang
  const [rencanaRemedial, setRencanaRemedial] = useState([]);
  const fileInputRef = useRef(null);

  const safeFetch = async (url, opts = {}) => {
    const res = await fetch(url, { ...opts, headers: { Accept: "application/json", ...opts.headers } });
    if (res.status === 401) { window.location.href = "/login"; throw new Error("Sesi berakhir, silakan login ulang."); }
    const text = await res.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch (e) { throw new Error(`Respon server tidak valid. Status: ${res.status}`); }
    if (!res.ok) {
      const firstError = data.errors ? Object.values(data.errors)[0]?.[0] : null;
      throw new Error(firstError || data.message || "Terjadi kesalahan pada server");
    }
    return data;
  };

  const authHeader = () => ({ Authorization: `Bearer ${getToken()}` });

  useEffect(() => {
    if (!getToken()) { window.location.href = "/login"; return; }
    (async () => {
      try {
        const [resF, resS] = await Promise.all([
          safeFetch(`${API_URL}/nilai/filters`, { headers: authHeader() }),
          safeFetch(`${API_URL}/students`, { headers: authHeader() }),
        ]);
        setRef({ periodes: resF.periodes || [], classes: resF.classes || [], subjects: resF.subjects || [], mbks: resF.mbks || [], students: resS.data || [] });
        const aktif = (resF.periodes || []).find((p) => p.status_aktif === "AKTIF");
        if (aktif) setMeta((m) => ({ ...m, id_periode: m.id_periode || aktif.id_periode }));
      } catch (err) { Swal.fire("Error", err.message, "error"); }
      finally { setLoadingRef(false); }
    })();
  }, []);

  // Materi bergantung pada kelas + mapel + periode (sama dengan halaman Input Nilai)
  useEffect(() => {
    const { id_kelas, id_mapel, id_periode } = meta;
    if (!id_kelas || !id_mapel) { setMateris([]); return; }
    let batal = false;
    (async () => {
      try {
        const params = new URLSearchParams({ id_kelas, id_mapel, ...(id_periode && { id_periode }) });
        const data = await safeFetch(`${API_URL}/nilai/materi?${params}`, { headers: authHeader() });
        if (batal) return;
        const list = data.data || [];
        setMateris(list);
        setMeta((m) => (m.id_materi && !list.some((x) => x.id_materi === m.id_materi) ? { ...m, id_materi: "" } : m));
      } catch (err) { if (!batal) setMateris([]); }
    })();
    return () => { batal = true; };
  }, [meta.id_kelas, meta.id_mapel, meta.id_periode]);

  const resetFile = () => {
    setRawRows([]); setColMap({}); setFileName(""); setPreviewPage(1); setHanyaBermasalah(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Format file berbeda per jenis data/metode, jadi file yang sudah diunggah dibuang
  const gantiMode = (m) => { setMode(m); resetFile(); };
  const gantiMetode = (m) => { setMetode(m); resetFile(); };

  const isNilai = mode === "NILAI";
  const siswaById = useMemo(() => new Map(ref.students.map((s) => [String(s.id_siswa), s])), [ref.students]);
  // NISN juga diterima di kolom id_siswa, karena sheet Data Siswa menampilkannya
  const siswaByNisn = useMemo(() => new Map(ref.students.filter((s) => s.nisn).map((s) => [String(s.nisn).trim(), s])), [ref.students]);
  const kkmMapel = Number(ref.subjects.find((m) => m.id_mapel === meta.id_mapel)?.kkm ?? 75);
  const tanggalLibur = useAlasanBukanHariSekolah(isNilai ? meta.tanggal : "");
  const siswaKelas = useMemo(() => ref.students.filter((s) => s.id_kelas === meta.id_kelas), [ref.students, meta.id_kelas]);
  const kelasTerpilih = ref.classes.find((k) => k.id_kelas === meta.id_kelas);
  const indikatorMateri = materis.find((m) => m.id_materi === meta.id_materi)?.indikator || [];
  // Indikator hanya untuk metode OTOMATIS: poin STNKM manual tidak dihitung dari nilai

  const metaLengkap = isNilai
    ? ["id_kelas", "id_mapel", "id_periode", "id_jenis", "id_materi", "tanggal"].every((k) => meta[k])
    : true;
  const metaPenilaian = ["id_kelas", "id_mapel", "id_periode", "id_jenis", "id_materi"].every((k) => meta[k]);

  // Rencana tindak lanjut pada penilaian terpilih, untuk mencocokkan baris REMEDIAL sebelum disimpan
  useEffect(() => {
    if (!isNilai || !metaPenilaian) { setRencanaRemedial([]); return; }
    let batal = false;
    (async () => {
      try {
        const params = new URLSearchParams({ id_kelas: meta.id_kelas, id_mapel: meta.id_mapel, id_periode: meta.id_periode, id_jenis: meta.id_jenis, id_materi: meta.id_materi });
        const data = await safeFetch(`${API_URL}/nilai/remedial?${params}`, { headers: authHeader() });
        if (!batal) setRencanaRemedial(data.data || []);
      } catch (err) { if (!batal) setRencanaRemedial([]); }
    })();
    return () => { batal = true; };
  }, [isNilai, metaPenilaian, meta.id_kelas, meta.id_mapel, meta.id_periode, meta.id_jenis, meta.id_materi]);

  // Sama dengan server: rencana terbuka paling awal; bila semua selesai, rencana selesai terakhir (nilai remedial diperbarui)
  const rencanaBySiswa = useMemo(() => {
    const map = new Map();
    const urut = rencanaRemedial.slice().sort((a, b) =>
      (a.status === b.status ? 0 : a.status === "DIRENCANAKAN" ? -1 : 1)
      || (a.status === "DIRENCANAKAN"
        ? String(a.tanggal_rencana).localeCompare(String(b.tanggal_rencana))
        : String(b.tanggal_selesai || "").localeCompare(String(a.tanggal_selesai || ""))));
    urut.forEach((r) => { if (!map.has(String(r.id_siswa))) map.set(String(r.id_siswa), r); });
    return map;
  }, [rencanaRemedial]);
  const rencanaTerbuka = useMemo(() => [...rencanaBySiswa.values()].filter((r) => r.status === "DIRENCANAKAN"), [rencanaBySiswa]);

  // Nilai reguler yang sudah tersimpan pada penilaian + tanggal terpilih, agar pratinjau menunjukkan nilai yang akan diganti
  const [nilaiTersimpan, setNilaiTersimpan] = useState(() => new Map());
  useEffect(() => {
    if (!isNilai || !metaLengkap) { setNilaiTersimpan(new Map()); return; }
    let batal = false;
    (async () => {
      try {
        const params = new URLSearchParams({ id_kelas: meta.id_kelas, id_mapel: meta.id_mapel, id_periode: meta.id_periode, id_jenis: meta.id_jenis, id_materi: meta.id_materi, tanggal: meta.tanggal });
        const data = await safeFetch(`${API_URL}/nilai/students?${params}`, { headers: authHeader() });
        if (!batal) setNilaiTersimpan(new Map((data.students || []).filter((s) => s.id_nilai).map((s) => [String(s.id_siswa), Number(s.nilai)])));
      } catch (err) { if (!batal) setNilaiTersimpan(new Map()); }
    })();
    return () => { batal = true; };
  }, [isNilai, metaLengkap, meta.id_kelas, meta.id_mapel, meta.id_periode, meta.id_jenis, meta.id_materi, meta.tanggal]);

  // --- TEMPLATE ---
  // remedial = true: hanya siswa dengan rencana tindak lanjut terbuka, kolom tipe sudah berisi REMEDIAL
  const handleDownloadTemplate = (remedial = false) => {
    // Bila kelas dipilih, template langsung berisi daftar siswanya
    const siswa = siswaKelas.length ? siswaKelas : [
      { id_siswa: "SIS-0001", nama_siswa: "Contoh Siswa A" },
      { id_siswa: "SIS-0002", nama_siswa: "Contoh Siswa B" },
    ];
    let header, rows, petunjuk;

    const petunjukTipe = "Kolom tipe (opsional): kosong/NORMAL = nilai reguler; REMEDIAL = nilai remedial bagi siswa yang sudah punya rencana tindak lanjut pada penilaian ini.";
    if (remedial) {
      const info = ["nilai_asal", "tindak_lanjut", "tanggal_rencana"];
      // Nilai asal per indikator: kolom untuk indikator yang belum mencapai KKM pada siswa mana pun (sama dengan Input Nilai)
      const lemah = (r) => (r.nilai_asal?.nilai_indikator || []).filter((i) => Number(i.nilai) < kkmMapel);
      const indRemedial = metode !== "OTOMATIS" ? [] : [...new Map(rencanaTerbuka.flatMap(lemah).map((i) => [i.id_indikator, i])).values()]
        .sort((a, b) => (a.indikator?.urutan ?? 0) - (b.indikator?.urutan ?? 0));
      const kolomInd = indRemedial.map((i, n) => kolomIndikator(n + 1, { id_indikator: i.id_indikator, deskripsi: i.indikator?.deskripsi || i.id_indikator }));
      const isian = metode === "OTOMATIS" ? [...kolomInd, "nilai"] : [...DIMENSI, "Rata-rata"];
      header = ["id_siswa", "nama_siswa", ...info, ...isian, "tipe"];
      rows = rencanaTerbuka.map((r) => {
        const lemahSiswa = new Set(lemah(r).map((i) => i.id_indikator));
        return [
          r.id_siswa, r.siswa?.nama_siswa || r.id_siswa, Number(r.nilai_asal?.nilai), r.opsi_tindakan, String(r.tanggal_rencana).slice(0, 10),
          ...indRemedial.map((i) => (lemahSiswa.has(i.id_indikator) ? "" : "✓ tuntas")),
          ...(metode === "OTOMATIS" ? [""] : [...DIMENSI, "Rata-rata"].map(() => "")), "REMEDIAL",
        ];
      });
      petunjuk = [
        "Template ini berisi siswa yang sedang menjalani remedial pada penilaian terpilih.",
        ...(kolomInd.length ? [
          "Nilai asal dinilai per indikator: isi nilai remedial (0-100) di kolom indikator yang kosong. Sel bertanda \"✓ tuntas\" tidak perlu diulang dan tetap memakai nilai asalnya.",
          "Nilai remedial = rata-rata seluruh indikator setelah perbaikan. Kolom nilai hanya dipakai untuk siswa yang nilai asalnya tidak per indikator.",
          ...indRemedial.map((i, n) => `Indikator ${n + 1}: ${i.indikator?.deskripsi || i.id_indikator}`),
        ] : [`Isi kolom ${metode === "OTOMATIS" ? "nilai (0-100)" : "poin S, T, N, K, M dan/atau Rata-rata"} dengan hasil remedial.`]),
        "Kosongkan baris siswa yang belum mengikuti remedial.",
        "Kolom nilai_asal, tindak_lanjut dan tanggal_rencana hanya informasi; tidak dibaca saat import.",
        "Tanggal pada parameter import dicatat sebagai tanggal pelaksanaan remedial. Rencana siswa otomatis berstatus Selesai.",
      ];
    } else if (isNilai && metode === "OTOMATIS") {
      const kolomInd = indikatorMateri.map((i, n) => kolomIndikator(n + 1, i));
      header = ["id_siswa", "nama_siswa", ...kolomInd, "nilai", "tipe"];
      rows = siswa.map((s) => [s.id_siswa, s.nama_siswa, ...kolomInd.map(() => ""), "", ""]);
      petunjuk = [
        "Isi kolom nilai (0-100). Kosongkan bila siswa tidak dinilai.",
        ...(kolomInd.length ? [
          "Materi ini punya indikator (IKTP): isi nilai 0-100 di kolom indikator yang dinilai. Nilai siswa = rata-rata indikator yang terisi, dan kolom nilai diabaikan untuk baris itu.",
          "Kolom indikator yang tidak dinilai boleh dihapus atau dikosongkan. Jangan ubah kode [IND-...] di judul kolom.",
          ...indikatorMateri.map((i, n) => `Indikator ${n + 1}: ${i.deskripsi}`),
        ] : []),
        "Poin STNKM dihitung sistem dari matriks Jenis Penilaian x Materi.", petunjukTipe,
      ];
    } else if (isNilai) {
      header = ["id_siswa", "nama_siswa", ...DIMENSI, "Rata-rata", "tipe"];
      rows = siswa.map((s) => [s.id_siswa, s.nama_siswa, "", "", "", "", "", "", ""]);
      petunjuk = ["Isi poin S, T, N, K, M apa adanya; poin disimpan tanpa dihitung ulang.", "Rata-rata (0-100) menjadi nilai siswa. Bila kosong, dihitung dari rata-rata S-M.", petunjukTipe];
    } else {
      header = ["id_siswa", "nama_siswa", "tanggal", "narasi_kejadian", ...DIMENSI.map((d) => `val_${d}`)];
      rows = siswa.map((s) => [s.id_siswa, s.nama_siswa, todayLocal(), "", 0, 0, 0, 0, 0]);
      petunjuk = ["Satu baris = satu catatan jurnal. Baris tanpa tanggal atau narasi dilewati.", "Tanggal: YYYY-MM-DD atau DD/MM/YYYY. Skor val_S - val_M antara -5 dan 5."];
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    ws["!cols"] = header.map((h) => ({ wch: h === "narasi_kejadian" ? 50 : h === "nama_siswa" || h === "tindak_lanjut" ? 28 : POLA_KOLOM_INDIKATOR.test(h) ? 24 : 14 }));
    XLSX.utils.book_append_sheet(wb, ws, "Format_Data");

    // Sheet referensi: guru menyalin ID & nama siswa dari sini ke Format_Data
    const namaKelasById = new Map(ref.classes.map((k) => [k.id_kelas, k.nama_kelas]));
    const daftarSiswa = (siswaKelas.length ? siswaKelas : ref.students.slice().sort((a, b) =>
      String(namaKelasById.get(a.id_kelas) || "").localeCompare(String(namaKelasById.get(b.id_kelas) || ""), "id", { numeric: true })
      || a.nama_siswa.localeCompare(b.nama_siswa, "id")));
    const wsSiswa = XLSX.utils.aoa_to_sheet([
      ["ID Siswa (Gunakan ini)", "NISN", "Nama Lengkap Siswa", "Kelas"],
      ...daftarSiswa.map((s) => [s.id_siswa, s.nisn || "", s.nama_siswa, namaKelasById.get(s.id_kelas) || "-"]),
    ]);
    wsSiswa["!cols"] = [{ wch: 24 }, { wch: 14 }, { wch: 36 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, wsSiswa, "Data Siswa");

    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Petunjuk"], ...petunjuk.map((p) => [p]), [],
      ["Salin ID Siswa dan Nama dari sheet 'Data Siswa' ke kolom id_siswa dan nama_siswa di sheet 'Format_Data'."],
      ["Yang dibaca saat import hanya sheet 'Format_Data'. Jangan ubah baris judul."]]), "Petunjuk");
    const suffix = remedial ? `Remedial_${metode}` : isNilai ? `Nilai_${metode}` : "Jurnal";
    XLSX.writeFile(wb, `Template_${suffix}${kelasTerpilih ? `_${kelasTerpilih.nama_kelas.replace(/\s+/g, "_")}` : ""}.xlsx`);
  };

  // --- BACA FILE ---
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      resetFile();
      return Swal.fire("File Terlalu Besar", `Ukuran maksimal ${MAX_FILE_MB} MB.`, "warning");
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        // Tanpa cellDates: sel tanggal dibaca sebagai serial Excel, karena konversi ke Date bisa mundur sehari akibat zona waktu.
        // raw: teks CSV tidak ditebak tipenya (SheetJS membaca "07/10/2026" sebagai format AS, 10 Juli).
        const wb = XLSX.read(new Uint8Array(ev.target.result), { type: "array", raw: true });
        // Baca sheet Format_Data; tanpa itu, sheet pertama selain sheet referensi template
        const namaSheet = wb.SheetNames.find((n) => normKey(n) === "formatdata")
          || wb.SheetNames.find((n) => !["datasiswa", "petunjuk"].includes(normKey(n)))
          || wb.SheetNames[0];
        const json = XLSX.utils.sheet_to_json(wb.Sheets[namaSheet], { defval: "" });
        if (json.length === 0) { resetFile(); return Swal.fire("Kosong", `Sheet "${namaSheet}" tidak memiliki data.`, "warning"); }

        // Petakan kolom file ke kolom yang dikenal
        const keys = Object.keys(json[0]);
        const map = {};
        Object.entries(COLUMN_ALIASES).forEach(([target, aliases]) => {
          const found = aliases.map((a) => keys.find((k) => normKey(k) === a)).find(Boolean);
          if (found) map[target] = found;
        });

        // Kolom indikator dikenali dari kode [IND-...] di judulnya
        map.indikator = isNilai && metode === "OTOMATIS"
          ? keys.map((k) => ({ key: k, id: String(k).match(POLA_KOLOM_INDIKATOR)?.[1] })).filter((c) => c.id)
          : [];
        const wajib = isNilai
          ? (metode === "OTOMATIS" ? ["id_siswa", ...(map.indikator.length ? [] : ["nilai"])] : ["id_siswa", ...DIMENSI])
          : ["id_siswa", "tanggal", "narasi"];
        const label = { narasi: "narasi_kejadian", rata: "Rata-rata" };
        const hilang = wajib.filter((c) => !map[c]);
        if (!hilang.length && isNilai && metode === "OTOMATIS" && !map.nilai && !map.indikator.length) hilang.push("nilai");
        if (hilang.length) {
          resetFile();
          return Swal.fire("Format Tidak Sesuai", `Kolom wajib tidak ditemukan: <b>${hilang.map((c) => label[c] || c).join(", ")}</b>.<br>Gunakan tombol <b>Unduh Template</b>.`, "error");
        }
        setColMap(map); setRawRows(json); setFileName(file.name); setPreviewPage(1); setHanyaBermasalah(false);
      } catch (err) { resetFile(); Swal.fire("Gagal Membaca File", err.message, "error"); }
    };
    reader.readAsArrayBuffer(file);
  };

  // --- VALIDASI (dihitung ulang bila pengaturan berubah) ---
  const validated = useMemo(() => {
    const seen = new Set();
    return rawRows.map((row, idx) => {
      const get = (k) => (colMap[k] ? row[colMap[k]] : "");
      const errors = [], skips = [];
      const isiKolomId = String(get("id_siswa")).trim();
      const siswa = siswaById.get(isiKolomId) || siswaByNisn.get(isiKolomId);
      // Baris dengan NISN disimpan memakai ID siswa
      const idSiswa = siswa ? String(siswa.id_siswa) : isiKolomId;
      const namaFile = String(get("nama_siswa") ?? "").trim();
      const out = { rowNum: idx + 2, id_siswa: idSiswa, nama: siswa?.nama_siswa || namaFile || "-" };

      if (!isiKolomId) errors.push("ID siswa kosong");
      else if (!siswa) errors.push("ID siswa / NISN tidak terdaftar");
      else if (isNilai && meta.id_kelas && siswa.id_kelas !== meta.id_kelas) errors.push("Bukan siswa kelas terpilih");
      // ID yang salah salin membuat nilai masuk ke siswa lain: nama di file dibandingkan dengan nama pemilik ID
      if (siswa && namaFile && !namaCocok(namaFile, siswa.nama_siswa)) out.cek = `Nama di file: "${namaFile}"`;

      if (isNilai) {
        // Kolom tipe opsional: REMEDIAL menautkan nilai ke rencana tindak lanjut siswa; kosong = reguler
        const rawTipe = normKey(get("tipe") ?? "");
        if (["remedial", "rem", "r"].includes(rawTipe)) out.tipe = "REMEDIAL";
        else if (["", "normal", "reguler", "regular", "n"].includes(rawTipe)) out.tipe = "NORMAL";
        else errors.push("Tipe harus NORMAL atau REMEDIAL");
        const rencana = out.tipe === "REMEDIAL" && siswa ? rencanaBySiswa.get(idSiswa) : null;
        // Remedial per indikator: indikator yang diulang menggantikan nilai asalnya (sama dengan server)
        const asalInd = Object.fromEntries((rencana?.nilai_asal?.nilai_indikator || []).map((i) => [i.id_indikator, Number(i.nilai)]));
        const remedialPerIndikator = Object.keys(asalInd).length > 0;

        if (metode === "OTOMATIS") {
          // Nilai per indikator lebih dulu; bila semua kosong, pakai kolom nilai
          const petaInd = {};
          let adaIsianInd = false;
          (colMap.indikator || []).forEach(({ key, id }) => {
            const raw = row[key];
            if (kosongIndikator(raw)) return;
            adaIsianInd = true;
            const v = toNumber(raw);
            const no = indikatorMateri.findIndex((i) => i.id_indikator === id) + 1;
            const label = no ? `Indikator ${no}` : id;
            if (remedialPerIndikator ? !(id in asalInd) : !no) {
              errors.push(remedialPerIndikator ? `${id} tidak dinilai pada nilai asal siswa ini` : `Kolom ${id} bukan indikator aktif materi terpilih`);
            } else if (isNaN(v)) errors.push(`${label} bukan angka`);
            else if (v < 0 || v > 100) errors.push(`${label} di luar 0-100`);
            else petaInd[id] = v;
          });
          const angka = Object.values(petaInd);
          const raw = get("nilai");
          if (angka.length) {
            out.nilai_indikator = petaInd;
            const semua = remedialPerIndikator ? Object.values({ ...asalInd, ...petaInd }) : angka;
            out.nilai = Math.round((semua.reduce((a, b) => a + b, 0) / semua.length) * 100) / 100;
            out.info_indikator = remedialPerIndikator ? `${angka.length} indikator diulang` : `${angka.length} indikator`;
          } else if (isEmpty(raw)) {
            // Isian indikator yang salah bukan baris kosong: tetap ditandai error
            if (!adaIsianInd) skips.push("Nilai kosong");
          } else {
            const v = toNumber(raw);
            if (isNaN(v)) errors.push("Nilai bukan angka");
            else if (v < 0 || v > 100) errors.push("Nilai di luar 0-100");
            else out.nilai = v;
          }
        } else {
          const poin = {};
          DIMENSI.forEach((d) => {
            const raw = get(d);
            const v = isEmpty(raw) ? null : toNumber(raw);
            if (v !== null && isNaN(v)) errors.push(`Poin ${d} bukan angka`);
            poin[d] = v;
          });
          const terisi = DIMENSI.filter((d) => poin[d] !== null && !isNaN(poin[d]));
          const rawRata = get("rata");
          let rata = isEmpty(rawRata) ? null : toNumber(rawRata);
          if (rata === null && terisi.length) rata = Math.round((terisi.reduce((a, d) => a + poin[d], 0) / terisi.length) * 100) / 100;
          if (rata === null && !terisi.length) skips.push("Baris kosong");
          else if (isNaN(rata)) errors.push("Rata-rata bukan angka");
          else if (rata < 0 || rata > 100) errors.push("Rata-rata di luar 0-100");
          else out.nilai = rata;
          DIMENSI.forEach((d) => { out[`poin_${d}`] = poin[d] ?? 0; });
        }
        out.tipe_info = out.tipe === "NORMAL" ? "Reguler" : "Remedial";
        if (out.tipe === "NORMAL" && nilaiTersimpan.has(idSiswa)) out.lama = formatAngka(nilaiTersimpan.get(idSiswa));
        if (out.tipe === "REMEDIAL" && siswa) {
          // Dicocokkan di sini agar baris yang tidak punya rencana dilewati, bukan menggagalkan seluruh import
          if (!metaPenilaian) errors.push("Lengkapi parameter penilaian untuk mencocokkan rencana remedial");
          else if (!rencana) errors.push("Belum punya rencana tindak lanjut pada penilaian ini");
          else out.tipe_info = rencana.status === "SELESAI"
            ? `Remedial · perbarui nilai ${Number(rencana.nilai_remedial?.nilai ?? 0)}`
            : `Remedial · ${rencana.opsi_tindakan}`;
        }
        if (idSiswa && !skips.length) {
          const kunci = `${out.tipe}|${idSiswa}`;
          if (seen.has(kunci)) errors.push("Siswa ganda di file");
          seen.add(kunci);
        }
      } else {
        const rawTgl = get("tanggal"), narasi = String(get("narasi") ?? "").trim();
        if (isEmpty(rawTgl)) skips.push("Tanggal kosong");
        else if (!(out.tanggal = parseTanggal(rawTgl))) errors.push("Format tanggal tidak dikenali");
        if (!narasi) skips.push("Narasi kosong");
        else if (narasi.length > 2000) errors.push("Narasi lebih dari 2000 karakter");
        out.narasi = narasi;
        DIMENSI.forEach((d) => {
          const raw = get(d);
          const v = isEmpty(raw) ? 0 : toNumber(raw);
          if (isNaN(v)) errors.push(`val_${d} bukan angka`);
          else if (v < -5 || v > 5) errors.push(`val_${d} di luar -5 s/d 5`);
          out[`val_${d}`] = v;
        });
      }

      // Baris yang memang kosong cukup dilewati; error di kolom lain tidak relevan lagi
      const status = skips.length ? "skip" : errors.length ? "error" : "ok";
      return { ...out, status, pesan: status === "skip" ? skips.join(", ") : errors.join(", ") };
    });
  }, [rawRows, colMap, siswaById, siswaByNisn, isNilai, metode, meta.id_kelas, rencanaBySiswa, metaPenilaian, indikatorMateri, nilaiTersimpan]);

  const ringkasan = useMemo(() => ({
    total: validated.length,
    ok: validated.filter((r) => r.status === "ok").length,
    skip: validated.filter((r) => r.status === "skip").length,
    error: validated.filter((r) => r.status === "error").length,
    // Siap disimpan tetapi perlu dilihat: nama berbeda dengan pemilik ID, atau menggantikan nilai yang sudah tersimpan
    cekNama: validated.filter((r) => r.status === "ok" && r.cek).length,
    ganti: validated.filter((r) => r.status === "ok" && r.lama !== undefined).length,
  }), [validated]);

  const tampil = hanyaBermasalah ? validated.filter((r) => r.status !== "ok" || r.cek) : validated;
  const totalPreviewPages = Math.max(1, Math.ceil(tampil.length / PREVIEW_PAGE_SIZE));
  const currentPreviewPage = Math.min(previewPage, totalPreviewPages);
  const pageRows = tampil.slice((currentPreviewPage - 1) * PREVIEW_PAGE_SIZE, currentPreviewPage * PREVIEW_PAGE_SIZE);

  const terlaluBanyak = !isNilai && ringkasan.ok > MAX_JURNAL_ROWS;
  const liburNilai = isNilai && !!tanggalLibur;
  const bisaSimpan = ringkasan.ok > 0 && ringkasan.error === 0 && metaLengkap && !terlaluBanyak && !liburNilai && !saving;

  // --- SIMPAN ---
  const handleSubmit = async () => {
    if (!metaLengkap) return Swal.fire("Lengkapi Atribut", "Isi Kelas, Mapel, Periode, Jenis Penilaian, Materi, dan Tanggal terlebih dahulu.", "warning");
    if (liburNilai) return Swal.fire("Bukan hari sekolah", tanggalLibur, "warning");
    if (ringkasan.error > 0) return Swal.fire("Masih Ada Error", "Perbaiki baris bertanda merah di file, lalu unggah ulang.", "warning");
    const siap = validated.filter((r) => r.status === "ok");

    const konfirmasi = await Swal.fire({
      title: `Simpan ${siap.length} ${isNilai ? "nilai" : "jurnal"}?`,
      html: isNilai
        ? `${ringkasan.ganti ? `<b>${ringkasan.ganti}</b> siswa sudah punya nilai pada tanggal ini; nilai lamanya akan <b>diganti</b>.` : "Semua nilai reguler disimpan sebagai nilai baru."}${siap.some((r) => r.tipe === "REMEDIAL") ? `<br>${siap.filter((r) => r.tipe === "REMEDIAL").length} nilai remedial akan menuntaskan rencana tindak lanjut siswanya.` : ""}${ringkasan.cekNama ? `<br><span class="text-warning-emphasis"><b>${ringkasan.cekNama}</b> baris namanya berbeda dengan pemilik ID siswa. Pastikan ID-nya benar.</span>` : ""}${ringkasan.skip ? `<br>${ringkasan.skip} baris kosong dilewati.` : ""}`
        : `Setiap baris disimpan sebagai jurnal baru.${ringkasan.skip ? `<br>${ringkasan.skip} baris kosong dilewati.` : ""}`,
      icon: "question", showCancelButton: true, confirmButtonText: "Ya, simpan", cancelButtonText: "Batal",
    });
    if (!konfirmasi.isConfirmed) return;

    setSaving(true);
    try {
      const res = isNilai
        ? await safeFetch(`${API_URL}/nilai/batch`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeader() },
          body: JSON.stringify({
            id_kelas: meta.id_kelas, id_mapel: meta.id_mapel, id_periode: meta.id_periode,
            id_jenis: meta.id_jenis, id_materi: meta.id_materi, tanggal: meta.tanggal, metode_stnkm: metode,
            records: siap.map((r) => ({
              id_siswa: r.id_siswa, nilai: r.nilai, tipe_nilai: r.tipe,
              ...(r.nilai_indikator && { nilai_indikator: r.nilai_indikator }),
              ...(metode === "MANUAL" && Object.fromEntries(DIMENSI.map((d) => [`poin_${d}`, r[`poin_${d}`]]))),
            })),
          }),
        })
        : await safeFetch(`${API_URL}/jurnal/import`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeader() },
          body: JSON.stringify({
            id_jenis: meta.id_jenis_jurnal || null, mode_dampak: meta.mode_dampak,
            records: siap.map((r) => ({
              id_siswa: r.id_siswa, tanggal: r.tanggal, narasi_kejadian: r.narasi,
              ...Object.fromEntries(DIMENSI.map((d) => [`val_${d}`, r[`val_${d}`]])),
            })),
          }),
        });
      resetFile();
      setVersiRingkasan((v) => v + 1);
      // Tautan langsung ke lembar nilai yang baru diimpor (didukung halaman Input Nilai)
      const lembar = new URLSearchParams({ id_kelas: meta.id_kelas, id_mapel: meta.id_mapel, id_periode: meta.id_periode, id_jenis: meta.id_jenis, id_materi: meta.id_materi, tanggal: meta.tanggal });
      const n = Number(res.perlu_tindak_lanjut) || 0;
      await Swal.fire({
        icon: n ? "info" : "success", title: "Import Berhasil",
        html: `${res.message}${isNilai && n ? `<br><br><b>${n}</b> siswa di bawah KKM ${kkmMapel} belum punya rencana tindak lanjut. Atur lewat tombol <b>Tindak Lanjut</b> di lembar Input Nilai.` : ""}`,
        showCancelButton: true, confirmButtonText: isNilai ? (n ? "Buka lembar & atur tindak lanjut" : "Lihat di Input Nilai") : "Lihat di Jurnal", cancelButtonText: "Import lagi",
      }).then((r) => { if (r.isConfirmed) window.location.assign(isNilai ? `/dashboard/nilai?${lembar}` : "/dashboard/jurnal"); });
    } catch (err) { Swal.fire("Gagal Menyimpan", err.message, "error"); }
    finally { setSaving(false); }
  };

  // --- RENDER HELPERS ---
  const setField = (key, value) => setMeta((m) => ({ ...m, [key]: value }));

  const selectField = (key, label, list, valueKey, labelFn, placeholder, col = "col-12 col-sm-6 col-lg-4", disabled = false) => (
    <div className={col}>
      <label className="form-label fw-semibold small mb-1">{label}</label>
      <select className="form-select" value={meta[key]} disabled={disabled} onChange={(e) => setField(key, e.target.value)}>
        <option value="">{placeholder}</option>
        {list.map((o) => <option key={o[valueKey]} value={o[valueKey]}>{labelFn(o)}</option>)}
      </select>
    </div>
  );

  const segmented = (name, value, onChange, items) => (
    <div className="btn-group w-100" role="group">
      {items.map((it) => (
        <span key={it.value} className="d-contents">
          <input type="radio" className="btn-check" name={name} id={`${name}-${it.value}`} checked={value === it.value} onChange={() => onChange(it.value)} />
          <label className={`btn btn-outline-${it.color || "primary"}`} htmlFor={`${name}-${it.value}`}>
            <i className={`bi ${it.icon} me-1`}></i>{it.label}
          </label>
        </span>
      ))}
    </div>
  );

  const previewColumns = isNilai
    ? [...(metode === "OTOMATIS"
      ? [{ key: "nilai", label: "Nilai" }, ...(colMap.indikator?.length ? [{ key: "info_indikator", label: "Dari Indikator" }] : [])]
      : [...DIMENSI.map((d) => ({ key: `poin_${d}`, label: d })), { key: "nilai", label: "Rata-rata" }]),
      ...(ringkasan.ganti ? [{ key: "lama", label: "Nilai Lama (diganti)" }] : []),
      ...(colMap.tipe ? [{ key: "tipe_info", label: "Tipe" }] : [])]
    : [{ key: "tanggal", label: "Tanggal" }, { key: "narasi", label: "Narasi Kejadian", wide: true }, ...DIMENSI.map((d) => ({ key: `val_${d}`, label: d }))];

  if (loadingRef) {
    return <div className="text-center text-muted py-5"><div className="spinner-border text-primary mb-2"></div><div>Memuat data referensi...</div></div>;
  }

  return (
    <div className="container-fluid mb-5">
      <style jsx>{`.d-contents { display: contents; }`}</style>

      {/* HEADER HALAMAN */}
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <div>
          <h3 className="fw-bold text-primary mb-0"><i className="bi bi-file-earmark-arrow-up me-2"></i>Import Data Massal</h3>
          <small className="text-muted">Unggah nilai akademik atau jurnal anekdotal dari file Excel</small>
        </div>
        <ol className="breadcrumb mb-0 small">
          <li className="breadcrumb-item"><Link href="/dashboard">Dashboard</Link></li>
          <li className="breadcrumb-item">Asesmen</li>
          <li className="breadcrumb-item active" aria-current="page">Import Excel</li>
        </ol>
      </div>

      <div className="row g-3 mb-3">
        {/* PENGATURAN IMPORT */}
        <div className="col-12 col-xl-8">
          <div className="card card-outline card-primary shadow-sm h-100">
            <div className="card-header"><h3 className="card-title fw-semibold mb-0"><i className="bi bi-sliders me-2"></i>Pengaturan Import</h3></div>
            <div className="card-body">
              <div className="row g-3">
                <div className="col-12 col-md-6">
                  <label className="form-label fw-semibold small mb-1">Jenis Data</label>
                  {segmented("mode", mode, gantiMode, [
                    { value: "NILAI", label: "Nilai Akademik", icon: "bi-pencil-square" },
                    { value: "JURNAL", label: "Jurnal Anekdotal", icon: "bi-journal-text" },
                  ])}
                </div>
                {isNilai ? (
                  <div className="col-12 col-md-6">
                    <label className="form-label fw-semibold small mb-1">Metode Poin STNKM</label>
                    {segmented("metode", metode, gantiMetode, [
                      { value: "OTOMATIS", label: "Dihitung Sistem", icon: "bi-calculator", color: "success" },
                      { value: "MANUAL", label: "Apa Adanya", icon: "bi-file-earmark-text", color: "success" },
                    ])}
                  </div>
                ) : (
                  <div className="col-12 col-md-6">
                    <label className="form-label fw-semibold small mb-1">Mode Dampak Rapor</label>
                    {segmented("dampak", meta.mode_dampak, (v) => setField("mode_dampak", v), [
                      { value: "PISAH", label: "Catatan Terpisah", icon: "bi-layout-split", color: "secondary" },
                      { value: "BONUS", label: "Intervensi Nilai", icon: "bi-lightning-charge", color: "danger" },
                    ])}
                  </div>
                )}
              </div>

              <div className="small text-muted mt-2">
                <i className="bi bi-info-circle me-1"></i>
                {isNilai
                  ? metode === "OTOMATIS"
                    ? "File cukup berisi nilai 0–100; poin STNKM dihitung dari matriks Jenis Penilaian × Materi, sama seperti Input Nilai."
                    : "Poin S, T, N, K, M dari file disimpan apa adanya; kolom Rata-rata menjadi nilai siswa."
                  : "Skor STNKM diambil dari kolom val_S – val_M di file, tanpa analisis AI."}
              </div>

              <hr />
              <h6 className="fw-semibold text-secondary mb-3">
                <i className="bi bi-tags me-1"></i>{isNilai ? "Atribut Nilai (wajib)" : "Atribut Jurnal"}
              </h6>
              <div className="row g-3">
                {isNilai ? (
                  <>
                    {selectField("id_kelas", "Kelas", ref.classes, "id_kelas", (k) => k.nama_kelas, "— Pilih Kelas —")}
                    {selectField("id_mapel", "Mata Pelajaran", ref.subjects, "id_mapel", (m) => m.nama_mapel, "— Pilih Mapel —")}
                    {selectField("id_periode", "Periode", ref.periodes, "id_periode", (p) => `${labelPeriode(p)}${p.status_aktif === "AKTIF" ? " • Aktif" : ""}`, "— Pilih Periode —")}
                    {selectField("id_jenis", "Jenis Penilaian", ref.mbks, "id_jenis", (j) => j.kategori_penilaian, "— Pilih Jenis —")}
                    {selectField("id_materi", "Topik / Materi", materis, "id_materi", labelMateri,
                      !meta.id_kelas || !meta.id_mapel ? "— Pilih kelas & mapel dulu —" : materis.length ? "— Pilih Materi —" : "— Belum ada materi —",
                      "col-12 col-sm-6 col-lg-4", materis.length === 0)}
                    <div className="col-12 col-sm-6 col-lg-4">
                      <label className="form-label fw-semibold small mb-1">Tanggal Penilaian</label>
                      <input type="date" className={`form-control ${tanggalLibur ? "is-invalid" : ""}`} value={meta.tanggal} onChange={(e) => setField("tanggal", e.target.value)} />
                      {tanggalLibur && <div className="invalid-feedback">{tanggalLibur}</div>}
                    </div>
                  </>
                ) : (
                  <>
                    {selectField("id_kelas", "Kelas (untuk isi template)", ref.classes, "id_kelas", (k) => k.nama_kelas, "— Semua / tanpa kelas —", "col-12 col-sm-6")}
                    {selectField("id_jenis_jurnal", "Aktivitas MBK (opsional)", ref.mbks, "id_jenis", (j) => j.kategori_penilaian, "— Tanpa MBK —", "col-12 col-sm-6")}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* UNGGAH FILE */}
        <div className="col-12 col-xl-4">
          <div className="card card-outline card-success shadow-sm h-100">
            <div className="card-header"><h3 className="card-title fw-semibold mb-0"><i className="bi bi-cloud-arrow-up me-2"></i>Unggah File</h3></div>
            <div className="card-body d-flex flex-column gap-3">
              <div className="d-flex gap-3">
                <span className="badge rounded-circle text-bg-primary align-self-start" style={{ width: 28, height: 28, lineHeight: "20px" }}>1</span>
                <div className="flex-fill">
                  <div className="fw-semibold small">Unduh template</div>
                  <small className="text-muted d-block mb-2">
                    {siswaKelas.length
                      ? `Berisi ${siswaKelas.length} siswa ${kelasTerpilih?.nama_kelas}, plus sheet Data Siswa untuk disalin.`
                      : "Sheet Data Siswa berisi semua siswa untuk disalin. Pilih kelas agar template langsung terisi."}
                  </small>
                  <div className="d-flex flex-wrap gap-2">
                    <button type="button" className="btn btn-sm btn-outline-success" onClick={() => handleDownloadTemplate()}>
                      <i className="bi bi-download me-1"></i>Unduh Template
                    </button>
                    {isNilai && (
                      <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => handleDownloadTemplate(true)}
                        disabled={!metaPenilaian || rencanaTerbuka.length === 0}
                        title={!metaPenilaian ? "Lengkapi parameter penilaian terlebih dahulu" : rencanaTerbuka.length === 0 ? "Tidak ada siswa yang sedang remedial pada penilaian ini" : ""}>
                        <i className="bi bi-life-preserver me-1"></i>Template Remedial{metaPenilaian && ` (${rencanaTerbuka.length})`}
                      </button>
                    )}
                  </div>
                  {isNilai && metaPenilaian && rencanaTerbuka.length > 0 && (
                    <small className="text-danger-emphasis d-block mt-1">
                      <i className="bi bi-info-circle me-1"></i>{rencanaTerbuka.length} siswa sedang remedial pada penilaian ini.
                    </small>
                  )}
                </div>
              </div>
              <div className="d-flex gap-3">
                <span className="badge rounded-circle text-bg-primary align-self-start" style={{ width: 28, height: 28, lineHeight: "20px" }}>2</span>
                <div className="flex-fill">
                  <div className="fw-semibold small">Isi lalu unggah</div>
                  <small className="text-muted d-block mb-2">Format .xlsx, .xls, atau .csv — maks. {MAX_FILE_MB} MB. Yang dibaca sheet Format_Data.</small>
                  <input ref={fileInputRef} type="file" className="form-control form-control-sm" accept=".xlsx,.xls,.csv" onChange={handleFileChange} />
                </div>
              </div>
              <div className="d-flex gap-3">
                <span className="badge rounded-circle text-bg-primary align-self-start" style={{ width: 28, height: 28, lineHeight: "20px" }}>3</span>
                <div className="flex-fill">
                  <div className="fw-semibold small">Periksa pratinjau & simpan</div>
                  <small className="text-muted">Baris bermasalah ditandai sebelum disimpan.</small>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* RINGKASAN & PROGRES sebelum mengimpor: penilaian terakhir dan capaian per materi */}
      {isNilai && (
        <RingkasanNilai idKelas={meta.id_kelas} idMapel={meta.id_mapel} idPeriode={meta.id_periode} idMateri={meta.id_materi}
          namaKelas={kelasTerpilih?.nama_kelas} namaMapel={ref.subjects.find((m) => m.id_mapel === meta.id_mapel)?.nama_mapel}
          muatUlang={versiRingkasan} labelBuka="Lihat di Input Nilai"
          onBukaSesi={(sesi) => window.location.assign(`/dashboard/nilai?${new URLSearchParams({ id_kelas: meta.id_kelas, id_mapel: meta.id_mapel, id_periode: meta.id_periode, id_jenis: sesi.id_jenis, id_materi: sesi.id_materi, tanggal: sesi.tanggal })}`)}
          onPilihMateri={(id) => setField("id_materi", id)} />
      )}

      {/* PRATINJAU */}
      {rawRows.length > 0 && (
        <div className="card card-outline card-info shadow-sm">
          <div className="card-header d-flex flex-wrap align-items-center gap-2">
            <h3 className="card-title fw-semibold mb-0 me-auto">
              <i className="bi bi-table me-2"></i>Pratinjau
              <span className="text-muted fw-normal small ms-2 text-break">{fileName}</span>
            </h3>
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={resetFile} disabled={saving}>
              <i className="bi bi-x-lg me-1"></i>Batal
            </button>
          </div>
          <div className="card-body">
            <div className="row g-3 mb-3">
              <InfoBox icon="bi-list-ol" color="primary" label="Total Baris" value={ringkasan.total} />
              <InfoBox icon="bi-check-circle" color="success" label="Siap Disimpan" value={ringkasan.ok} />
              <InfoBox icon="bi-skip-forward" color="warning" label="Dilewati (kosong)" value={ringkasan.skip} />
              <InfoBox icon="bi-x-circle" color="danger" label="Error" value={ringkasan.error} />
            </div>

            <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
              <div className="form-check form-switch mb-0">
                <input className="form-check-input" type="checkbox" id="hanyaBermasalah" checked={hanyaBermasalah}
                  onChange={(e) => { setHanyaBermasalah(e.target.checked); setPreviewPage(1); }} />
                <label className="form-check-label small" htmlFor="hanyaBermasalah">Tampilkan hanya baris bermasalah atau perlu dicek</label>
              </div>
              <small className="text-muted">{tampil.length} baris ditampilkan</small>
            </div>

            <div className="table-responsive border rounded" style={{ maxHeight: 480 }}>
              <table className="table table-sm table-hover align-middle mb-0 small">
                <thead className="table-light" style={{ position: "sticky", top: 0, zIndex: 1 }}>
                  <tr>
                    <th className="text-center">Baris</th>
                    <th>ID Siswa</th>
                    <th>Nama</th>
                    {previewColumns.map((c) => <th key={c.key} className={c.wide ? "" : "text-center"}>{c.label}</th>)}
                    <th className="text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.length === 0 ? (
                    <tr><td colSpan={previewColumns.length + 4} className="text-center text-muted py-4">Tidak ada baris bermasalah.</td></tr>
                  ) : pageRows.map((r) => (
                    <tr key={r.rowNum} className={STATUS_META[r.status].row}>
                      <td className="text-center text-muted">{r.rowNum}</td>
                      <td className="text-nowrap">{r.id_siswa || "-"}</td>
                      <td className="text-nowrap">{r.nama}</td>
                      {previewColumns.map((c) => (
                        <td key={c.key} className={c.wide ? "" : "text-center"} style={c.wide ? { minWidth: 240 } : undefined}>
                          {r[c.key] ?? "-"}
                        </td>
                      ))}
                      <td className="text-center">
                        <span className={`badge ${STATUS_META[r.status].cls}`}>{STATUS_META[r.status].label}</span>
                        {r.pesan && <div className="small text-body-secondary mt-1">{r.pesan}</div>}
                        {r.cek && (
                          <div className="small text-warning-emphasis mt-1" title="Nama di file berbeda dengan pemilik ID siswa ini. Pastikan ID-nya tidak salah salin.">
                            <i className="bi bi-exclamation-triangle me-1"></i>{r.cek}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPreviewPages > 1 && (
              <div className="d-flex justify-content-between align-items-center mt-2">
                <button type="button" className="btn btn-sm btn-outline-secondary" disabled={currentPreviewPage === 1} onClick={() => setPreviewPage(currentPreviewPage - 1)}>
                  <i className="bi bi-chevron-left"></i>
                </button>
                <small className="text-muted">Halaman {currentPreviewPage} dari {totalPreviewPages}</small>
                <button type="button" className="btn btn-sm btn-outline-secondary" disabled={currentPreviewPage === totalPreviewPages} onClick={() => setPreviewPage(currentPreviewPage + 1)}>
                  <i className="bi bi-chevron-right"></i>
                </button>
              </div>
            )}
          </div>
          <div className="card-footer d-flex flex-wrap align-items-center gap-2">
            <small className="me-auto">
              {ringkasan.error > 0 ? (
                <span className="text-danger fw-semibold"><i className="bi bi-exclamation-triangle me-1"></i>{ringkasan.error} baris error. Perbaiki file lalu unggah ulang.</span>
              ) : !metaLengkap ? (
                <span className="text-warning-emphasis fw-semibold"><i className="bi bi-exclamation-circle me-1"></i>Lengkapi atribut nilai di atas sebelum menyimpan.</span>
              ) : liburNilai ? (
                <span className="text-danger fw-semibold"><i className="bi bi-calendar-x me-1"></i>{tanggalLibur}</span>
              ) : terlaluBanyak ? (
                <span className="text-danger fw-semibold"><i className="bi bi-exclamation-triangle me-1"></i>Maksimal {MAX_JURNAL_ROWS} jurnal per import. Pecah file menjadi beberapa bagian.</span>
              ) : (
                <span className="text-success fw-semibold"><i className="bi bi-check-circle me-1"></i>{ringkasan.ok} baris siap disimpan.
                  {ringkasan.cekNama > 0 && <span className="text-warning-emphasis ms-1">{ringkasan.cekNama} baris namanya perlu dicek.</span>}
                </span>
              )}
            </small>
            <button type="button" className="btn btn-success fw-semibold px-4" onClick={handleSubmit} disabled={!bisaSimpan}>
              {saving
                ? <><span className="spinner-border spinner-border-sm me-2"></span>Menyimpan...</>
                : <><i className="bi bi-cloud-arrow-up me-1"></i>Simpan {ringkasan.ok} Baris</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
