"use client";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";
import * as XLSX from "xlsx";
import { generateProfessionalPDF } from "@/utils/pdfExport";

const API_URL = "http://localhost:8000/api";
const getToken = () => localStorage.getItem("token");

const DEFAULT_KKM = 75;
const ROWS_PER_PAGE = 10;

// Urutan pengisian filter, sekaligus daftar periksa saat lembar nilai belum tampil
const FILTER_FIELDS = [
  { key: "id_kelas", label: "Kelas", icon: "bi-building" },
  { key: "id_mapel", label: "Mata Pelajaran", icon: "bi-book" },
  { key: "id_periode", label: "Periode Akademik", icon: "bi-calendar3" },
  { key: "id_jenis", label: "Jenis Penilaian", icon: "bi-tag" },
  { key: "id_materi", label: "Topik / Materi", icon: "bi-list-check" },
];

const KATEGORI = [
  { key: "sb", label: "Sangat Baik", range: "≥ 90", min: 90, color: "success" },
  { key: "b", label: "Baik", range: "80 – 89", min: 80, color: "primary" },
  { key: "c", label: "Cukup", range: "70 – 79", min: 70, color: "warning" },
  { key: "k", label: "Perlu Bimbingan", range: "< 70", min: -Infinity, color: "danger" },
];

// Tanggal lokal (YYYY-MM-DD); toISOString() memakai UTC sehingga pagi hari di WIB/WIT masih tanggal kemarin
const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const emptyFilters = () => ({ id_kelas: "", id_mapel: "", id_periode: "", id_jenis: "", id_materi: "", tanggal: todayLocal() });

const formatTanggal = (str) => {
  if (!str) return "-";
  // Parse sebagai tanggal lokal agar tidak bergeser zona waktu
  const [y, m, d] = str.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
};

const formatAngka = (v) => (Number.isInteger(v) ? v : Number(v).toFixed(1));
const kkmMapel = (mapel) => Number(mapel?.kkm ?? DEFAULT_KKM);
const kategoriNilai = (v) => KATEGORI.find((k) => v >= k.min);

// "" = kosong (tidak dinilai), null = tidak valid, angka = valid
const parseNilai = (raw) => {
  const str = String(raw ?? "").trim();
  if (str === "") return "";
  const v = Number(str.replace(",", "."));
  return Number.isFinite(v) && v >= 0 && v <= 100 ? v : null;
};

const labelMapel = (m) => `${m.nama_mapel}${m.guru?.nama_guru ? ` — ${m.guru.nama_guru}` : ""} (KKM ${kkmMapel(m)})`;
const labelMateri = (m) => `${m.nama_materi}${m.kategori?.nama_kategori ? ` [${m.kategori.nama_kategori}]` : ""}`;
const labelPeriode = (p) => (p ? `${p.tahun_ajaran} (${p.semester})` : "-");

// --- KOMPONEN KECIL ---
const InfoBox = ({ icon, color, label, children }) => (
  <div className="col-6 col-xl-3">
    <div className="info-box shadow-sm mb-0 h-100">
      <span className={`info-box-icon text-bg-${color} shadow-sm`}><i className={`bi ${icon}`}></i></span>
      <div className="info-box-content">
        <span className="info-box-text small text-truncate">{label}</span>
        {children}
      </div>
    </div>
  </div>
);

const StatusBadge = ({ nilai, kkm }) => {
  if (nilai === "") return <span className="badge text-bg-light border text-muted">Belum dinilai</span>;
  if (nilai === null) return <span className="badge text-bg-danger"><i className="bi bi-exclamation-circle me-1"></i>Tidak valid</span>;
  const kat = kategoriNilai(nilai);
  return (
    <div className="d-flex flex-wrap justify-content-center gap-1">
      <span className={`badge bg-${kat.color}-subtle text-${kat.color}-emphasis border border-${kat.color}-subtle`}>{kat.label}</span>
      {nilai >= kkm
        ? <span className="badge text-bg-success"><i className="bi bi-check-lg me-1"></i>Tuntas</span>
        : <span className="badge text-bg-danger"><i className="bi bi-x-lg me-1"></i>Belum Tuntas</span>}
    </div>
  );
};

export default function InputNilaiPage() {
  const router = useRouter();

  // --- DATA REFERENSI ---
  const [options, setOptions] = useState({ periodes: [], classes: [], subjects: [], mbks: [] });
  const [materis, setMateris] = useState([]);
  const [settings, setSettings] = useState(null);

  // --- LEMBAR NILAI ---
  const [filters, setFilters] = useState(emptyFilters);
  const [students, setStudents] = useState([]);
  const [loadingSheet, setLoadingSheet] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState(null);
  const filterCardRef = useRef(null);

  // --- RIWAYAT ---
  const [riwayat, setRiwayat] = useState([]);
  const [loadingRiwayat, setLoadingRiwayat] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortCol, setSortCol] = useState("tanggal");
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(1);

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

  // --- TURUNAN ---
  const mapelTerpilih = options.subjects.find((m) => m.id_mapel === filters.id_mapel);
  const kelasTerpilih = options.classes.find((k) => k.id_kelas === filters.id_kelas);
  const periodeTerpilih = options.periodes.find((p) => p.id_periode === filters.id_periode);
  const kkm = kkmMapel(mapelTerpilih);
  const filterLengkap = FILTER_FIELDS.every((f) => filters[f.key]);

  const rows = useMemo(() => students.map((s) => {
    const nilai = parseNilai(s.inputNilai);
    const awal = s.nilai === null ? "" : s.nilai;
    return { ...s, parsed: nilai, berubah: nilai !== awal };
  }), [students]);

  const jumlahBerubah = rows.filter((r) => r.berubah).length;
  const adaTidakValid = rows.some((r) => r.parsed === null);
  const jumlahTercatat = students.filter((s) => s.id_nilai).length;

  // --- FETCH ---
  useEffect(() => {
    if (!getToken()) { window.location.href = "/login"; return; }
    (async () => {
      try {
        const [resF, resS] = await Promise.all([
          safeFetch(`${API_URL}/nilai/filters`, { headers: authHeader() }),
          safeFetch(`${API_URL}/settings`, { headers: authHeader() }),
        ]);
        setOptions({ periodes: resF.periodes || [], classes: resF.classes || [], subjects: resF.subjects || [], mbks: resF.mbks || [] });
        setSettings(resS || null);
        const aktif = (resF.periodes || []).find((p) => p.status_aktif === "AKTIF");
        if (aktif) setFilters((f) => ({ ...f, id_periode: f.id_periode || aktif.id_periode }));
      } catch (err) { Swal.fire("Error", err.message, "error"); }
    })();
  }, []);

  // Materi bergantung pada kelas + mapel + periode
  useEffect(() => {
    const { id_kelas, id_mapel, id_periode } = filters;
    if (!id_kelas || !id_mapel) { setMateris([]); return; }
    let batal = false;
    (async () => {
      try {
        const params = new URLSearchParams({ id_kelas, id_mapel, ...(id_periode && { id_periode }) });
        const data = await safeFetch(`${API_URL}/nilai/materi?${params}`, { headers: authHeader() });
        if (batal) return;
        const list = data.data || [];
        setMateris(list);
        setFilters((f) => (f.id_materi && !list.some((m) => m.id_materi === f.id_materi) ? { ...f, id_materi: "" } : f));
      } catch (err) { if (!batal) setMateris([]); }
    })();
    return () => { batal = true; };
  }, [filters.id_kelas, filters.id_mapel, filters.id_periode]);

  const fetchStudents = useCallback(async () => {
    if (!FILTER_FIELDS.every((f) => filters[f.key])) { setStudents([]); return; }
    setLoadingSheet(true);
    try {
      const params = new URLSearchParams({
        id_kelas: filters.id_kelas, id_mapel: filters.id_mapel, id_periode: filters.id_periode,
        id_jenis: filters.id_jenis, id_materi: filters.id_materi,
      });
      const data = await safeFetch(`${API_URL}/nilai/students?${params}`, { headers: authHeader() });
      setStudents((data.students || []).map((s) => ({ ...s, inputNilai: s.nilai ?? "" })));
    } catch (err) { Swal.fire("Error", err.message, "error"); }
    finally { setLoadingSheet(false); }
  }, [filters.id_kelas, filters.id_mapel, filters.id_periode, filters.id_jenis, filters.id_materi]);

  useEffect(() => { fetchStudents(); }, [fetchStudents]);

  const fetchRiwayat = useCallback(async () => {
    if (!filters.id_kelas || !filters.id_periode) { setRiwayat([]); return; }
    setLoadingRiwayat(true);
    try {
      const params = new URLSearchParams({ id_kelas: filters.id_kelas, id_periode: filters.id_periode });
      const data = await safeFetch(`${API_URL}/nilai?${params}`, { headers: authHeader() });
      setRiwayat(data.data || []);
    } catch (err) { Swal.fire("Error", err.message, "error"); }
    finally { setLoadingRiwayat(false); }
  }, [filters.id_kelas, filters.id_periode]);

  useEffect(() => { fetchRiwayat(); setPage(1); }, [fetchRiwayat]);

  // Peringatan saat meninggalkan halaman dengan nilai yang belum disimpan
  useEffect(() => {
    if (jumlahBerubah === 0) return;
    const handler = (e) => { e.preventDefault(); e.returnValue = ""; };
    // Link Next.js (menu sidebar) tidak memicu beforeunload; klik dicegat di fase capture sebelum sampai ke React
    const onLinkClick = async (e) => {
      const a = e.target.closest?.("a[href]");
      if (!a || a.target === "_blank" || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      e.preventDefault();
      e.stopPropagation();
      if (await konfirmasiBuangPerubahan()) router.push(url.pathname + url.search);
    };
    window.addEventListener("beforeunload", handler);
    document.addEventListener("click", onLinkClick, true);
    return () => {
      window.removeEventListener("beforeunload", handler);
      document.removeEventListener("click", onLinkClick, true);
    };
  }, [jumlahBerubah]);

  // --- FILTER ---
  const konfirmasiBuangPerubahan = async () => {
    if (jumlahBerubah === 0) return true;
    const res = await Swal.fire({
      title: "Buang perubahan?",
      text: `${jumlahBerubah} nilai belum disimpan dan akan hilang.`,
      icon: "warning", showCancelButton: true,
      confirmButtonText: "Ya, buang", cancelButtonText: "Kembali", confirmButtonColor: "#dc3545",
    });
    return res.isConfirmed;
  };

  const ubahFilter = async (patch) => {
    // Tanggal tidak memuat ulang lembar nilai, jadi perubahan aman dipertahankan
    const memuatUlang = Object.keys(patch).some((k) => k !== "tanggal");
    if (memuatUlang && !(await konfirmasiBuangPerubahan())) return;
    // Mengganti parameter berarti membuka lembar lain, bukan lagi penilaian yang sedang diedit
    if (memuatUlang) setEditId(null);
    setFilters((f) => ({ ...f, ...patch }));
  };

  // --- LEMBAR NILAI ---
  const handleInput = (id_siswa, val) => {
    setStudents((prev) => prev.map((s) => (s.id_siswa === id_siswa ? { ...s, inputNilai: val } : s)));
  };

  // Enter / panah bawah pindah ke siswa berikutnya, panah atas ke sebelumnya
  const handleKeyDown = (e, idx) => {
    const arah = e.key === "Enter" || e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (!arah) return;
    e.preventDefault();
    const next = document.querySelector(`input[data-nilai-idx="${idx + arah}"]`);
    if (next) { next.focus(); next.select(); }
  };

  const handleReset = () => setStudents((prev) => prev.map((s) => ({ ...s, inputNilai: s.nilai ?? "" })));

  const statistik = useMemo(() => {
    const terisi = rows.map((r) => r.parsed).filter((v) => typeof v === "number");
    const n = terisi.length;
    const tuntas = terisi.filter((v) => v >= kkm).length;
    const distribusi = Object.fromEntries(KATEGORI.map((k) => [k.key, 0]));
    terisi.forEach((v) => { distribusi[kategoriNilai(v).key]++; });
    return {
      total: rows.length, terisi: n, tuntas, distribusi,
      rata: n ? terisi.reduce((a, b) => a + b, 0) / n : 0,
      max: n ? Math.max(...terisi) : 0,
      min: n ? Math.min(...terisi) : 0,
      persenTuntas: n ? Math.round((tuntas / n) * 100) : 0,
      persenTerisi: rows.length ? Math.round((n / rows.length) * 100) : 0,
    };
  }, [rows, kkm]);

  const cancelEdit = () => {
    setEditId(null);
    setFilters((f) => ({ ...f, id_materi: "", tanggal: todayLocal() }));
  };

  const handleSave = async (e) => {
    e?.preventDefault();
    if (!filters.tanggal) return Swal.fire("Perhatian", "Tanggal penilaian wajib diisi.", "warning");
    if (adaTidakValid) return Swal.fire("Nilai Tidak Valid", "Periksa kembali isian bertanda merah. Nilai harus berupa angka 0 – 100.", "warning");

    const records = rows.filter((r) => typeof r.parsed === "number").map((r) => ({ id_siswa: r.id_siswa, nilai: r.parsed }));
    if (records.length === 0) return Swal.fire("Kosong", "Isi minimal satu nilai siswa.", "warning");

    const dikosongkan = rows.filter((r) => r.parsed === "" && r.id_nilai).length;
    if (dikosongkan > 0) {
      const res = await Swal.fire({
        title: "Ada nilai yang dikosongkan",
        html: `${dikosongkan} siswa sudah punya nilai tetapi kini dikosongkan. Nilai lama mereka <b>tidak</b> ikut terhapus; gunakan tombol hapus di riwayat bila perlu.`,
        icon: "info", showCancelButton: true, confirmButtonText: "Lanjut simpan", cancelButtonText: "Kembali",
      });
      if (!res.isConfirmed) return;
    }

    setSaving(true);
    try {
      const data = await safeFetch(`${API_URL}/nilai/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({
          id_kelas: filters.id_kelas, id_mapel: filters.id_mapel, id_periode: filters.id_periode,
          id_jenis: filters.id_jenis, id_materi: filters.id_materi, tanggal: filters.tanggal, records,
        }),
      });
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: data.message, showConfirmButton: false, timer: 2500 });
      if (editId) setEditId(null);
      await Promise.all([fetchStudents(), fetchRiwayat()]);
    } catch (err) { Swal.fire("Gagal Menyimpan", err.message, "error"); }
    finally { setSaving(false); }
  };

  // --- RIWAYAT ---
  const handleEdit = async (r) => {
    if (!(await konfirmasiBuangPerubahan())) return;
    setEditId(r.id_nilai);
    setFilters({
      id_kelas: r.id_kelas, id_mapel: r.id_mapel, id_periode: r.id_periode,
      id_jenis: r.id_jenis, id_materi: r.id_materi, tanggal: String(r.tanggal).slice(0, 10),
    });
    filterCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleDelete = async (r) => {
    const res = await Swal.fire({
      title: "Hapus nilai ini?",
      html: `<b>${r.siswa?.nama_siswa || r.id_siswa}</b> — ${r.mapel?.nama_mapel || ""}, ${r.materi?.nama_materi || ""} (nilai ${formatAngka(Number(r.nilai))}).<br>Data yang dihapus tidak dapat dikembalikan.`,
      icon: "warning", showCancelButton: true,
      confirmButtonText: "Ya, hapus", cancelButtonText: "Batal", confirmButtonColor: "#dc3545",
    });
    if (!res.isConfirmed) return;
    try {
      const data = await safeFetch(`${API_URL}/nilai/${r.id_nilai}`, { method: "DELETE", headers: authHeader() });
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: data.message, showConfirmButton: false, timer: 2000 });
      if (editId === r.id_nilai) setEditId(null);
      fetchRiwayat();
      if (students.some((s) => s.id_nilai === r.id_nilai)) {
        // Pertahankan isian lain; siswa ini kembali berstatus belum dinilai
        setStudents((prev) => prev.map((s) => (s.id_nilai === r.id_nilai ? { ...s, id_nilai: null, nilai: null, inputNilai: "" } : s)));
      }
    } catch (err) { Swal.fire("Gagal Menghapus", err.message, "error"); }
  };

  const handleSort = (col) => {
    if (sortCol === col) setSortAsc(!sortAsc);
    else { setSortCol(col); setSortAsc(col !== "tanggal" && col !== "nilai"); }
  };

  const filteredRiwayat = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const cocok = (r) => [r.siswa?.nama_siswa, r.siswa?.nisn, r.mapel?.nama_mapel, r.jenis?.kategori_penilaian, r.materi?.nama_materi, r.materi?.kategori?.nama_kategori, r.id_guru]
      .some((v) => String(v ?? "").toLowerCase().includes(q));
    const nilaiSort = {
      tanggal: (r) => String(r.tanggal),
      siswa: (r) => (r.siswa?.nama_siswa || "").toLowerCase(),
      mapel: (r) => (r.mapel?.nama_mapel || "").toLowerCase(),
      jenis: (r) => (r.jenis?.kategori_penilaian || "").toLowerCase(),
      nilai: (r) => Number(r.nilai),
      guru: (r) => String(r.id_guru || "").toLowerCase(),
    }[sortCol];
    return (q ? riwayat.filter(cocok) : riwayat.slice()).sort((a, b) => {
      const va = nilaiSort(a), vb = nilaiSort(b);
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });
  }, [riwayat, searchQuery, sortCol, sortAsc]);

  const totalPages = Math.max(1, Math.ceil(filteredRiwayat.length / ROWS_PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filteredRiwayat.slice((currentPage - 1) * ROWS_PER_PAGE, currentPage * ROWS_PER_PAGE);

  // --- EKSPOR ---
  const namaKelas = kelasTerpilih?.nama_kelas || "Kelas";
  const namaFileEkspor = `Rekap_Nilai_${namaKelas.replace(/\s+/g, "_")}_${todayLocal()}`;

  const exportRows = () => filteredRiwayat.map((r, i) => {
    const kkmR = kkmMapel(r.mapel);
    const v = Number(r.nilai);
    return {
      "No": i + 1,
      "Tanggal": formatTanggal(r.tanggal),
      "NISN": r.siswa?.nisn || r.id_siswa,
      "Nama Siswa": r.siswa?.nama_siswa || r.id_siswa,
      "Mata Pelajaran": r.mapel?.nama_mapel || r.id_mapel,
      "Jenis": r.jenis?.kategori_penilaian || r.id_jenis,
      "Materi": r.materi?.nama_materi || r.id_materi,
      "Kategori STNKM": r.materi?.kategori?.nama_kategori || "-",
      "KKM": kkmR,
      "Nilai": formatAngka(v),
      "Ketuntasan": v >= kkmR ? "TUNTAS" : "BELUM TUNTAS",
      "Pengisi": r.id_guru || "-",
    };
  });

  const adaData = () => {
    if (!filters.id_kelas) { Swal.fire("Pilih Kelas", "Pilih kelas terlebih dahulu untuk mengekspor riwayat nilai.", "info"); return false; }
    if (filteredRiwayat.length === 0) { Swal.fire("Kosong", "Belum ada data nilai untuk diekspor.", "info"); return false; }
    return true;
  };

  const handleExportExcel = () => {
    if (!adaData()) return;
    const ws = XLSX.utils.json_to_sheet(exportRows());
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Rekap Nilai");
    XLSX.writeFile(wb, `${namaFileEkspor}.xlsx`);
  };

  const handleExportCSV = () => {
    if (!adaData()) return;
    const data = exportRows();
    const headers = Object.keys(data[0]);
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [headers.map(esc).join(","), ...data.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\r\n");
    // BOM agar Excel membaca UTF-8 dengan benar
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${namaFileEkspor}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const getBase64ImageFromUrl = async (imageUrl) => {
    if (!imageUrl) return null;
    try {
      const response = await fetch(`${API_URL}/signature/${imageUrl.split("/").pop()}`);
      if (!response.ok) return null;
      const blob = await response.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    } catch (error) { return null; }
  };

  const handleExportPDF = async () => {
    if (!adaData()) return;
    const data = exportRows().map((r) => ({
      "No": r.No,
      "Tanggal": r.Tanggal,
      "Nama Siswa": r["Nama Siswa"],
      "Mapel": r["Mata Pelajaran"],
      "Jenis": r.Jenis,
      "Materi (Kategori)": `${r.Materi}${r["Kategori STNKM"] !== "-" ? ` (${r["Kategori STNKM"]})` : ""}`,
      "KKM": r.KKM,
      "Nilai": r.Nilai,
      "Ketuntasan": r.Ketuntasan,
      "Pengisi": r.Pengisi,
    }));
    await generateProfessionalPDF(data, `Rekap Nilai ${namaKelas} - ${labelPeriode(periodeTerpilih)}`, settings, getBase64ImageFromUrl);
  };

  // --- RENDER HELPERS ---
  const sortHeader = (col, label, className = "") => (
    <th role="button" className={`text-nowrap user-select-none ${className}`} onClick={() => handleSort(col)}>
      {label}{" "}
      <i className={`bi ${sortCol === col ? (sortAsc ? "bi-sort-up text-primary" : "bi-sort-down text-primary") : "bi-arrow-down-up text-muted opacity-50"}`}></i>
    </th>
  );

  const selectField = (key, label, icon, list, valueKey, labelFn, placeholder, disabled = false) => (
    <div className="col-12 col-sm-6 col-lg-4">
      <label className="form-label fw-semibold small mb-1"><i className={`bi ${icon} text-primary me-1`}></i>{label}</label>
      <select className="form-select" value={filters[key]} disabled={disabled} onChange={(e) => ubahFilter({ [key]: e.target.value })}>
        <option value="">{placeholder}</option>
        {list.map((o) => <option key={o[valueKey]} value={o[valueKey]}>{labelFn(o)}</option>)}
      </select>
    </div>
  );

  const placeholderMateri = !filters.id_kelas ? "— Pilih kelas dulu —"
    : !filters.id_mapel ? "— Pilih mapel dulu —"
    : materis.length === 0 ? "— Belum ada materi untuk mapel ini —"
    : "— Pilih Materi —";

  const maxDistribusi = Math.max(1, ...Object.values(statistik.distribusi));

  return (
    <div className="container-fluid mb-5">
      {/* HEADER HALAMAN */}
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <div>
          <h3 className="fw-bold text-primary mb-0"><i className="bi bi-pencil-square me-2"></i>Input Nilai Kelas</h3>
          <small className="text-muted">Pencatatan capaian akademik siswa berbasis materi dan dimensi STNKM</small>
        </div>
        <ol className="breadcrumb mb-0 small">
          <li className="breadcrumb-item"><a href="/dashboard">Dashboard</a></li>
          <li className="breadcrumb-item">Transaksi</li>
          <li className="breadcrumb-item active" aria-current="page">Input Nilai</li>
        </ol>
      </div>

      {/* PARAMETER PENILAIAN */}
      <div ref={filterCardRef} className={`card card-outline ${editId ? "card-warning" : "card-primary"} shadow-sm mb-3`} style={{ scrollMarginTop: "1rem" }}>
        <div className="card-header">
          <h3 className="card-title fw-semibold mb-0">
            <i className="bi bi-funnel me-2"></i>Parameter Penilaian
          </h3>
        </div>
        <div className="card-body">
          <div className="row g-3">
            {selectField("id_kelas", "Kelas", "bi-building", options.classes, "id_kelas", (k) => k.nama_kelas, "— Pilih Kelas —")}
            {selectField("id_mapel", "Mata Pelajaran", "bi-book", options.subjects, "id_mapel", labelMapel, "— Pilih Mata Pelajaran —")}
            {selectField("id_periode", "Periode Akademik", "bi-calendar3", options.periodes, "id_periode",
              (p) => `${labelPeriode(p)}${p.status_aktif === "AKTIF" ? " • Aktif" : ""}`, "— Pilih Periode —")}
            {selectField("id_jenis", "Jenis Penilaian", "bi-tag", options.mbks, "id_jenis", (j) => j.kategori_penilaian, "— Pilih Jenis —")}
            {selectField("id_materi", "Topik / Materi", "bi-list-check", materis, "id_materi", labelMateri, placeholderMateri, materis.length === 0)}
            <div className="col-12 col-sm-6 col-lg-4">
              <label className="form-label fw-semibold small mb-1"><i className="bi bi-calendar-event text-primary me-1"></i>Tanggal Penilaian</label>
              <input type="date" className="form-control" value={filters.tanggal} required
                onChange={(e) => ubahFilter({ tanggal: e.target.value })} />
            </div>
          </div>
        </div>
        {editId && (
          <div className="card-footer bg-warning-subtle d-flex flex-wrap justify-content-between align-items-center gap-2">
            <span className="fw-semibold text-warning-emphasis small">
              <i className="bi bi-pencil-square me-1"></i>Mode Edit: lembar di bawah memuat penilaian lama. Ubah nilai atau tanggal, lalu simpan.
            </span>
            <button type="button" className="btn btn-sm btn-outline-dark" onClick={cancelEdit}>
              <i className="bi bi-x-lg me-1"></i>Batalkan Edit
            </button>
          </div>
        )}
      </div>

      {!filterLengkap ? (
        // DAFTAR PERIKSA FILTER
        <div className="card shadow-sm mb-3">
          <div className="card-body text-center py-5">
            <i className="bi bi-clipboard-data display-5 text-primary opacity-50"></i>
            <h5 className="fw-semibold mt-3">Lengkapi parameter untuk membuka lembar nilai</h5>
            <div className="d-flex flex-wrap justify-content-center gap-2 mt-3">
              {FILTER_FIELDS.map((f) => (
                <span key={f.key} className={`badge rounded-pill px-3 py-2 ${filters[f.key] ? "text-bg-success" : "bg-body-secondary text-body-secondary border"}`}>
                  <i className={`bi ${filters[f.key] ? "bi-check-circle-fill" : f.icon} me-1`}></i>{f.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* PANEL ANALITIK */}
          <div className="card card-outline card-info shadow-sm mb-3">
            <div className="card-header d-flex flex-wrap align-items-center gap-2">
              <h3 className="card-title fw-semibold mb-0 me-auto"><i className="bi bi-pie-chart me-2"></i>Analitik Kelas</h3>
              <span className="badge text-bg-secondary">KKM {kkm}</span>
              <span className="badge bg-info-subtle text-info-emphasis border border-info-subtle">
                <i className="bi bi-lightning-charge-fill me-1"></i>Dihitung langsung
              </span>
            </div>
            <div className="card-body">
              <div className="row g-3">
                <InfoBox icon="bi-graph-up" color="primary" label="Rata-rata Kelas">
                  <span className="info-box-number fs-5">{statistik.terisi ? statistik.rata.toFixed(1) : "–"}</span>
                  {statistik.terisi > 0 && (
                    <small className={statistik.rata >= kkm ? "text-success" : "text-danger"}>
                      {statistik.rata >= kkm ? "Di atas KKM" : "Di bawah KKM"}
                    </small>
                  )}
                </InfoBox>
                <InfoBox icon="bi-arrows-expand" color="info" label="Rentang Nilai">
                  <span className="info-box-number fs-6">
                    {statistik.terisi ? (
                      <>
                        <span className="text-success" title="Tertinggi"><i className="bi bi-caret-up-fill"></i>{formatAngka(statistik.max)}</span>
                        <span className="text-muted mx-1">/</span>
                        <span className="text-danger" title="Terendah"><i className="bi bi-caret-down-fill"></i>{formatAngka(statistik.min)}</span>
                      </>
                    ) : "–"}
                  </span>
                </InfoBox>
                <InfoBox icon="bi-patch-check" color="success" label="Ketuntasan KKM">
                  <span className="info-box-number fs-5">{statistik.persenTuntas}%</span>
                  <small className="text-muted">{statistik.tuntas} / {statistik.terisi} siswa tuntas</small>
                </InfoBox>
                <InfoBox icon="bi-hourglass-split" color="warning" label="Progres Input">
                  <span className="info-box-number fs-5">{statistik.terisi}/{statistik.total}</span>
                  <div className="progress mt-1" style={{ height: 4 }} role="progressbar" aria-valuenow={statistik.persenTerisi} aria-valuemin="0" aria-valuemax="100">
                    <div className="progress-bar bg-warning" style={{ width: `${statistik.persenTerisi}%` }}></div>
                  </div>
                </InfoBox>
              </div>

              <div className="row g-3 align-items-center mt-1 pt-3 border-top">
                <div className="col-12 col-md-7">
                  <small className="fw-semibold text-muted d-block mb-2"><i className="bi bi-layers me-1"></i>Distribusi Kategori Capaian</small>
                  <div className="d-flex flex-wrap gap-2">
                    {KATEGORI.map((k) => (
                      <span key={k.key} className={`badge text-bg-${k.color} p-2 fw-normal`}>
                        {k.label} ({k.range}): <b>{statistik.distribusi[k.key]}</b>
                      </span>
                    ))}
                  </div>
                </div>
                <div className="col-12 col-md-5">
                  <div className="d-flex align-items-end justify-content-around gap-2 border-bottom" style={{ height: 110 }}>
                    {[...KATEGORI].reverse().map((k) => (
                      <div key={k.key} className="d-flex flex-column align-items-center justify-content-end h-100 flex-fill" style={{ maxWidth: 56 }}
                        title={`${k.label}: ${statistik.distribusi[k.key]} siswa`}>
                        <small className="fw-semibold">{statistik.distribusi[k.key]}</small>
                        <div className={`w-100 rounded-top bg-${k.color}`}
                          style={{ height: `${(statistik.distribusi[k.key] / maxDistribusi) * 80}%`, minHeight: 2, opacity: 0.8, transition: "height .3s ease" }}></div>
                      </div>
                    ))}
                  </div>
                  <div className="d-flex justify-content-around gap-2 mt-1">
                    {[...KATEGORI].reverse().map((k) => (
                      <small key={k.key} className="text-muted fw-semibold text-center flex-fill" style={{ maxWidth: 56, fontSize: 11 }}>{k.range}</small>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* LEMBAR NILAI */}
          <form onSubmit={handleSave} className="card card-outline card-success shadow-sm mb-3">
            <div className="card-header d-flex flex-wrap align-items-center gap-2">
              <h3 className="card-title fw-semibold mb-0 me-auto">
                <i className="bi bi-people me-2"></i>Lembar Nilai
                <span className="text-muted fw-normal small ms-2">{mapelTerpilih?.nama_mapel} · {namaKelas}</span>
              </h3>
              {jumlahTercatat > 0 && (
                <span className="badge bg-primary-subtle text-primary-emphasis border border-primary-subtle">
                  <i className="bi bi-database-check me-1"></i>{jumlahTercatat} nilai sudah tercatat
                </span>
              )}
            </div>
            <div className="card-body p-0">
              {loadingSheet ? (
                <div className="text-center py-5 text-muted"><div className="spinner-border text-success mb-2"></div><div>Memuat daftar siswa...</div></div>
              ) : rows.length === 0 ? (
                <div className="text-center py-5 text-muted"><i className="bi bi-person-x fs-1 d-block mb-2"></i>Belum ada siswa terdaftar pada kelas ini.</div>
              ) : (
                <div className="table-responsive">
                  <table className="table table-hover align-middle mb-0">
                    <thead className="table-light">
                      <tr>
                        <th className="text-center" style={{ width: 56 }}>No</th>
                        <th>Nama Siswa</th>
                        <th className="text-center" style={{ width: 160 }}>
                          Nilai <span className="fw-normal text-muted">(0 – 100)</span>
                        </th>
                        <th className="text-center" style={{ minWidth: 190 }}>Predikat & Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, idx) => (
                        <tr key={r.id_siswa} className={r.berubah ? "table-warning" : ""}>
                          <td className="text-center fw-semibold text-muted">{idx + 1}</td>
                          <td>
                            <div className="fw-semibold">{r.nama_siswa}</div>
                            <small className="text-muted">NISN: {r.nisn || r.id_siswa}</small>
                            {r.id_nilai && r.tanggal && r.tanggal !== filters.tanggal && (
                              <small className="text-muted d-block"><i className="bi bi-clock-history me-1"></i>Tercatat {formatTanggal(r.tanggal)}</small>
                            )}
                          </td>
                          <td>
                            <input type="number" step="any" min="0" max="100" inputMode="decimal"
                              data-nilai-idx={idx}
                              className={`form-control text-center fw-bold ${r.parsed === null ? "is-invalid" : ""}`}
                              value={r.inputNilai} placeholder="Kosong"
                              onChange={(e) => handleInput(r.id_siswa, e.target.value)}
                              onKeyDown={(e) => handleKeyDown(e, idx)}
                              onFocus={(e) => e.target.select()}
                              aria-label={`Nilai ${r.nama_siswa}`} />
                          </td>
                          <td className="text-center"><StatusBadge nilai={r.parsed} kkm={kkm} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            {rows.length > 0 && (
              <div className="card-footer bg-body position-sticky bottom-0 d-flex flex-wrap align-items-center gap-2 border-top shadow-sm" style={{ zIndex: 2 }}>
                <small className="text-muted me-auto">
                  {jumlahBerubah > 0
                    ? <span className="text-warning-emphasis fw-semibold"><i className="bi bi-pencil me-1"></i>{jumlahBerubah} perubahan belum disimpan</span>
                    : <><i className="bi bi-keyboard me-1"></i>Kosongkan jika siswa tidak hadir. Tekan Enter untuk pindah ke siswa berikutnya.</>}
                </small>
                {jumlahBerubah > 0 && (
                  <button type="button" className="btn btn-outline-secondary" onClick={handleReset} disabled={saving}>
                    <i className="bi bi-arrow-counterclockwise me-1"></i>Reset
                  </button>
                )}
                <button type="submit" className="btn btn-success fw-semibold px-4" disabled={saving}>
                  {saving
                    ? <><span className="spinner-border spinner-border-sm me-2"></span>Menyimpan...</>
                    : <><i className="bi bi-floppy me-1"></i>Simpan Nilai Kelas</>}
                </button>
              </div>
            )}
          </form>
        </>
      )}

      {/* RIWAYAT INPUT NILAI */}
      <div className="card card-outline card-secondary shadow-sm">
        <div className="card-header d-flex flex-wrap align-items-center gap-2">
          <h3 className="card-title fw-semibold mb-0 me-auto">
            <i className="bi bi-clock-history me-2"></i>Riwayat Input Nilai
            {filters.id_kelas && <span className="text-muted fw-normal small ms-2">{namaKelas} · {labelPeriode(periodeTerpilih)}</span>}
          </h3>
          <div className="btn-group btn-group-sm">
            <button type="button" className="btn btn-outline-success" onClick={handleExportExcel}><i className="bi bi-file-earmark-excel me-1"></i>Excel</button>
            <button type="button" className="btn btn-outline-secondary" onClick={handleExportCSV}><i className="bi bi-filetype-csv me-1"></i>CSV</button>
            <button type="button" className="btn btn-outline-danger" onClick={handleExportPDF}><i className="bi bi-file-earmark-pdf me-1"></i>PDF</button>
          </div>
        </div>
        <div className="card-body">
          {!filters.id_kelas || !filters.id_periode ? (
            <div className="text-center text-muted py-4"><i className="bi bi-info-circle me-1"></i>Pilih kelas dan periode untuk melihat riwayat nilai.</div>
          ) : (
            <>
              <div className="row g-2 mb-3">
                <div className="col-12 col-md-6">
                  <div className="input-group input-group-sm">
                    <span className="input-group-text bg-body"><i className="bi bi-search"></i></span>
                    <input type="search" className="form-control" placeholder="Cari siswa, mapel, materi, pengisi..."
                      value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }} />
                  </div>
                </div>
                <div className="col-12 col-md-6 text-md-end align-self-center">
                  <small className="text-muted">{filteredRiwayat.length} entri{searchQuery && ` dari ${riwayat.length}`}</small>
                </div>
              </div>

              <div className="table-responsive">
                <table className="table table-hover table-sm align-middle mb-0 small">
                  <thead className="table-light">
                    <tr>
                      {sortHeader("tanggal", "Tanggal")}
                      {sortHeader("siswa", "Siswa")}
                      {sortHeader("mapel", "Mapel")}
                      {sortHeader("jenis", "Jenis")}
                      <th>Materi & Kategori STNKM</th>
                      {sortHeader("nilai", "Nilai", "text-center")}
                      {sortHeader("guru", "Pengisi")}
                      <th className="text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingRiwayat ? (
                      <tr><td colSpan="8" className="text-center py-4 text-muted"><span className="spinner-border spinner-border-sm me-2"></span>Memuat riwayat...</td></tr>
                    ) : pageRows.length === 0 ? (
                      <tr><td colSpan="8" className="text-center py-4 text-muted">Tidak ada riwayat nilai yang ditemukan.</td></tr>
                    ) : pageRows.map((r) => {
                      const v = Number(r.nilai);
                      const tuntas = v >= kkmMapel(r.mapel);
                      return (
                        <tr key={r.id_nilai} className={editId === r.id_nilai ? "table-warning" : ""}>
                          <td className="text-nowrap">{formatTanggal(r.tanggal)}</td>
                          <td>
                            <div className="fw-semibold">{r.siswa?.nama_siswa || r.id_siswa}</div>
                            <small className="text-muted">{r.siswa?.nisn || r.id_siswa}</small>
                          </td>
                          <td>{r.mapel?.nama_mapel || r.id_mapel}</td>
                          <td><span className="badge bg-info-subtle text-info-emphasis border border-info-subtle">{r.jenis?.kategori_penilaian || r.id_jenis}</span></td>
                          <td>
                            {r.materi?.nama_materi || r.id_materi}
                            {r.materi?.kategori?.nama_kategori && (
                              <div><span className="badge text-bg-secondary fw-normal text-wrap">{r.materi.kategori.nama_kategori}</span></div>
                            )}
                          </td>
                          <td className="text-center">
                            <span className={`badge fs-6 ${tuntas ? "text-bg-success" : "text-bg-danger"}`} title={tuntas ? "Tuntas" : "Belum tuntas"}>{formatAngka(v)}</span>
                          </td>
                          <td><span className="badge bg-body-secondary text-body-secondary border fw-normal">{r.id_guru || "-"}</span></td>
                          <td className="text-center">
                            <div className="btn-group btn-group-sm">
                              <button type="button" className="btn btn-outline-primary" title="Edit" onClick={() => handleEdit(r)}><i className="bi bi-pencil"></i></button>
                              <button type="button" className="btn btn-outline-danger" title="Hapus" onClick={() => handleDelete(r)}><i className="bi bi-trash"></i></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
        {filters.id_kelas && filters.id_periode && totalPages > 1 && (
          <div className="card-footer d-flex flex-wrap justify-content-between align-items-center gap-2">
            <small className="text-muted">Halaman {currentPage} dari {totalPages}</small>
            <ul className="pagination pagination-sm mb-0">
              <li className={`page-item ${currentPage === 1 ? "disabled" : ""}`}>
                <button type="button" className="page-link" onClick={() => setPage(currentPage - 1)}><i className="bi bi-chevron-left"></i></button>
              </li>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                .flatMap((p, i, arr) => [
                  i > 0 && p - arr[i - 1] > 1 && <li key={`gap-${p}`} className="page-item disabled"><span className="page-link">…</span></li>,
                  <li key={p} className={`page-item ${p === currentPage ? "active" : ""}`}>
                    <button type="button" className="page-link" onClick={() => setPage(p)}>{p}</button>
                  </li>,
                ])}
              <li className={`page-item ${currentPage === totalPages ? "disabled" : ""}`}>
                <button type="button" className="page-link" onClick={() => setPage(currentPage + 1)}><i className="bi bi-chevron-right"></i></button>
              </li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
