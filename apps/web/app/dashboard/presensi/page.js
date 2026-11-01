"use client";
import { useState, useEffect, useMemo, Fragment } from "react";
import Link from "next/link";
import Swal from "sweetalert2";
import { useAkses } from "@/app/lib/akses";
import * as XLSX from "xlsx";
import { generateProfessionalPDF } from "@/utils/pdfExport";

const API_URL = "http://localhost:8000/api";
const getToken = () => localStorage.getItem("token");

const STATUS = [
  { value: "HADIR", label: "Hadir", short: "H", color: "success" },
  { value: "SAKIT", label: "Sakit", short: "S", color: "warning" },
  { value: "IZIN", label: "Izin", short: "I", color: "info" },
  { value: "ALPA", label: "Alpa", short: "A", color: "danger" },
];
const STATUS_MAP = Object.fromEntries(STATUS.map((s) => [s.value, s]));
const ROWS_PER_PAGE = 10;

const todayYmd = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const tanggalPanjang = (ymd) => {
  const [y, m, d] = String(ymd).slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
};
const formatNomorWA = (nomor) => {
  const clean = String(nomor || "").replace(/\D/g, "");
  if (clean.startsWith("08")) return "62" + clean.slice(1);
  if (clean.startsWith("8")) return "62" + clean;
  return clean;
};
const kontakOrtu = (s) => {
  const namaOrtu = s?.ortu?.nama_ayah || s?.ortu?.nama_ibu || s?.wali?.nama_wali || "";
  return {
    nomor: formatNomorWA(s?.no_wa || s?.ortu?.no_wa || s?.wali?.no_wa),
    sapaan: namaOrtu ? `Bapak/Ibu ${namaOrtu}` : `Bapak/Ibu Orang Tua dari ${s?.nama_siswa || "siswa"}`,
  };
};
const bukaChat = (nomor, teks) => {
  const url = nomor ? `https://wa.me/${nomor}?text=${encodeURIComponent(teks)}` : `https://api.whatsapp.com/send?text=${encodeURIComponent(teks)}`;
  window.open(url, "_blank", "noopener");
};

const Modal = ({ show, title, icon, headerClass = "bg-success text-white", onClose, children, footer }) => {
  if (!show) return null;
  return (
    <>
      <div className="modal fade show d-block" tabIndex="-1" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
          <div className="modal-content border-0 shadow">
            <div className={`modal-header ${headerClass}`}>
              <h5 className="modal-title fw-bold"><i className={`bi ${icon} me-2`}></i>{title}</h5>
              <button type="button" className="btn-close btn-close-white" onClick={onClose} aria-label="Tutup"></button>
            </div>
            <div className="modal-body bg-body-tertiary">{children}</div>
            {footer && <div className="modal-footer">{footer}</div>}
          </div>
        </div>
      </div>
      <div className="modal-backdrop fade show"></div>
    </>
  );
};

export default function PresensiPage() {
  const [classes, setClasses] = useState([]);
  // Presensi diisi semua guru; menghapus satu tanggal hanya wali kelas & pengelola
  const { bolehKelolaKelas } = useAkses();
  const [periodes, setPeriodes] = useState([]);
  const [settings, setSettings] = useState(null);
  const [user, setUser] = useState(null);
  const [filters, setFilters] = useState({ id_kelas: "", id_periode: "", tanggal: todayYmd() });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  // Lembar input: status per siswa untuk tanggal terpilih
  const [lembar, setLembar] = useState({});
  const [waOrtu, setWaOrtu] = useState(true);
  const [waGrup, setWaGrup] = useState(true);
  const [saving, setSaving] = useState(false);
  const [panelWA, setPanelWA] = useState(null);

  // Riwayat
  const [modeRiwayat, setModeRiwayat] = useState("TANGGAL");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [sortCol, setSortCol] = useState("tanggal");
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(1);

  const safeFetch = async (url, opts = {}) => {
    const res = await fetch(url, { ...opts, headers: { Accept: "application/json", Authorization: `Bearer ${getToken()}`, ...opts.headers } });
    if (res.status === 401) { window.location.href = "/login"; throw new Error("Sesi berakhir, silakan login ulang."); }
    const text = await res.text();
    let json = {};
    try { json = text ? JSON.parse(text) : {}; } catch (e) { throw new Error(`Respon server tidak valid. Status: ${res.status}`); }
    if (!res.ok) {
      const firstError = json.errors ? Object.values(json.errors)[0]?.[0] : null;
      throw new Error(firstError || json.reason || json.message || "Terjadi kesalahan pada server");
    }
    return json;
  };
  const sendJSON = (url, method, body) => safeFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  useEffect(() => {
    if (!getToken()) { window.location.href = "/login"; return; }
    try { setUser(JSON.parse(localStorage.getItem("user") || "null")); } catch (e) { setUser(null); }
    (async () => {
      try {
        const [resF, resS] = await Promise.all([safeFetch(`${API_URL}/nilai/filters`), safeFetch(`${API_URL}/settings`)]);
        setClasses(resF.classes || []);
        setPeriodes(resF.periodes || []);
        setSettings(resS || null);
        const aktif = (resF.periodes || []).find((p) => p.status_aktif === "AKTIF");
        if (aktif) setFilters((f) => ({ ...f, id_periode: aktif.id_periode }));
      } catch (err) { Swal.fire("Error", err.message, "error"); }
    })();
  }, []);

  const muatData = async (id_kelas, id_periode) => {
    const res = await safeFetch(`${API_URL}/presensi?${new URLSearchParams({ id_kelas, id_periode })}`);
    setData(res);
    return res;
  };

  useEffect(() => {
    const { id_kelas, id_periode } = filters;
    if (!id_kelas || !id_periode) { setData(null); return; }
    let batal = false;
    (async () => {
      setLoading(true);
      try {
        const res = await safeFetch(`${API_URL}/presensi?${new URLSearchParams({ id_kelas, id_periode })}`);
        if (!batal) { setData(res); setPage(1); }
      } catch (err) { if (!batal) Swal.fire("Gagal Memuat Data", err.message, "error"); }
      finally { if (!batal) setLoading(false); }
    })();
    return () => { batal = true; };
  }, [filters.id_kelas, filters.id_periode]);

  const presensiTanggal = useMemo(
    () => (data ? data.presensi.filter((p) => p.tanggal === filters.tanggal) : []),
    [data, filters.tanggal],
  );
  const sudahTercatat = presensiTanggal.length > 0;

  // Lembar diisi ulang dari data tersimpan setiap kali kelas/tanggal berganti (default: Hadir)
  useEffect(() => {
    if (!data) { setLembar({}); return; }
    const tersimpan = Object.fromEntries(presensiTanggal.map((p) => [p.id_siswa, p.status_kehadiran]));
    setLembar(Object.fromEntries(data.students.map((s) => [s.id_siswa, tersimpan[s.id_siswa] || "HADIR"])));
  }, [data, presensiTanggal]);

  const hitungLembar = useMemo(() => {
    const c = Object.fromEntries(STATUS.map((s) => [s.value, 0]));
    Object.values(lembar).forEach((v) => { c[v] = (c[v] || 0) + 1; });
    return c;
  }, [lembar]);

  const berubah = useMemo(() => {
    const tersimpan = Object.fromEntries(presensiTanggal.map((p) => [p.id_siswa, p.status_kehadiran]));
    return Object.entries(lembar).some(([id, st]) => (tersimpan[id] || (sudahTercatat ? null : "HADIR")) !== st) || !sudahTercatat;
  }, [lembar, presensiTanggal, sudahTercatat]);

  const namaKelas = classes.find((k) => k.id_kelas === filters.id_kelas)?.nama_kelas || "-";
  const namaSekolah = settings?.nama_sekolah || "Sekolah";
  const pencatat = user?.name || "Guru / Wali Kelas";
  const siswaMap = useMemo(() => new Map((data?.students || []).map((s) => [s.id_siswa, s])), [data]);

  const pesanOrtu = (siswa, tanggal, status) => {
    const { sapaan } = kontakOrtu(siswa);
    const ket = {
      ALPA: "tercatat *TIDAK HADIR (Tanpa Keterangan / Alpa)*",
      SAKIT: "tercatat *SAKIT* (Semoga ananda lekas pulih 🙏)",
      IZIN: "tercatat *IZIN*",
      HADIR: "tercatat *HADIR*",
    }[status];
    return `Selamat pagi/siang ${sapaan},\n\nKami dari *${namaSekolah}* menginformasikan bahwa pada hari ini:\n`
      + `📅 Tanggal: ${tanggalPanjang(tanggal)}\n🏫 Kelas: ${namaKelas}\n👦 Nama Siswa: *${siswa.nama_siswa}*\n📌 Status Presensi: ${ket}\n\n`
      + `Apabila ada hal yang perlu dikonfirmasikan terkait kehadiran ananda, silakan menghubungi kami kembali.\n\nSalam kasih,\n*${pencatat}*`;
  };

  // --- SIMPAN ---
  const handleSimpan = async () => {
    if (!data?.students.length) return;
    setSaving(true);
    try {
      const records = data.students.map((s) => ({ id_siswa: s.id_siswa, status_kehadiran: lembar[s.id_siswa] || "HADIR" }));
      const res = await sendJSON(`${API_URL}/presensi/batch`, "POST", { ...filters, records });
      await muatData(filters.id_kelas, filters.id_periode);

      const tidakHadir = data.students
        .filter((s) => lembar[s.id_siswa] !== "HADIR")
        .map((s) => ({ siswa: s, status: lembar[s.id_siswa], nomor: kontakOrtu(s).nomor, pesan: pesanOrtu(s, filters.tanggal, lembar[s.id_siswa]) }));
      const rincian = tidakHadir.length
        ? tidakHadir.map((x, i) => `${i + 1}. ${x.siswa.nama_siswa} (${STATUS_MAP[x.status].label})`).join("\n")
        : "- Nihil (Seluruh siswa hadir 100% 🎉)";
      const rekap = `*📊 LAPORAN PRESENSI HARIAN - ${namaSekolah.toUpperCase()}*\n📅 Tanggal: ${tanggalPanjang(filters.tanggal)}\n🏫 Kelas: *${namaKelas}*\n👩‍🏫 Pencatat: ${pencatat}\n\n`
        + `*Ringkasan Kehadiran:*\n✅ Hadir: ${hitungLembar.HADIR} | 🤒 Sakit: ${hitungLembar.SAKIT} | 📝 Izin: ${hitungLembar.IZIN} | ❌ Alpa: ${hitungLembar.ALPA}\n`
        + `👥 Total Siswa: ${data.students.length}\n\n*Catatan Siswa Tidak Hadir:*\n${rincian}`;

      // Kirim otomatis hanya jika Fonnte aktif; selain itu panel WA manual langsung tampil
      let api = null;
      const antrean = [
        ...(waOrtu ? tidakHadir.filter((x) => x.nomor).map((x) => ({ target: x.nomor, message: x.pesan })) : []),
        ...(waGrup && settings?.id_wa_group_guru ? [{ target: settings.id_wa_group_guru, message: rekap }] : []),
        ...(waGrup && settings?.no_wa_kepsek ? [{ target: settings.no_wa_kepsek, message: rekap }] : []),
      ];
      if (settings?.status_wa_api && settings?.has_wa_api_token && antrean.length) {
        try { api = await sendJSON(`${API_URL}/whatsapp`, "POST", { daftar_pesan: antrean }); }
        catch (err) { api = { sent: false, reason: err.message }; }
      }
      setPanelWA({ pesan: res.message, tidakHadir, rekap, api });
    } catch (err) { Swal.fire("Gagal Menyimpan", err.message, "error"); }
    finally { setSaving(false); }
  };

  const handleHapusTanggal = async () => {
    const ok = await Swal.fire({
      title: "Hapus presensi tanggal ini?", html: `Seluruh presensi <b>${namaKelas}</b> pada <b>${tanggalPanjang(filters.tanggal)}</b> akan dihapus.`,
      icon: "warning", showCancelButton: true, confirmButtonColor: "#dc3545", confirmButtonText: "Ya, Hapus", cancelButtonText: "Batal",
    });
    if (!ok.isConfirmed) return;
    try {
      const res = await safeFetch(`${API_URL}/presensi/tanggal?${new URLSearchParams({ id_kelas: filters.id_kelas, tanggal: filters.tanggal })}`, { method: "DELETE" });
      await muatData(filters.id_kelas, filters.id_periode);
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: res.message, showConfirmButton: false, timer: 2500 });
    } catch (err) { Swal.fire("Gagal", err.message, "error"); }
  };

  const salin = async (teks) => {
    try {
      await navigator.clipboard.writeText(teks);
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: "Teks rekap disalin! Siap ditempel ke grup WA.", showConfirmButton: false, timer: 2500 });
    } catch (e) { Swal.fire("Gagal Menyalin", "Browser menolak akses clipboard.", "error"); }
  };

  // --- RIWAYAT ---
  const riwayat = useMemo(() => (data?.presensi || []).map((p) => ({ ...p, nama_siswa: siswaMap.get(p.id_siswa)?.nama_siswa || p.id_siswa })), [data, siswaMap]);

  const rekapSiswa = useMemo(() => (data?.students || []).map((s) => {
    const milik = riwayat.filter((p) => p.id_siswa === s.id_siswa);
    const c = Object.fromEntries(STATUS.map((st) => [st.value, milik.filter((p) => p.status_kehadiran === st.value).length]));
    return { id_siswa: s.id_siswa, nisn: s.nisn, nama_siswa: s.nama_siswa, ...c, total: milik.length, persen: milik.length ? (c.HADIR / milik.length) * 100 : null };
  }), [data, riwayat]);

  const tampil = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const sumber = modeRiwayat === "TANGGAL" ? riwayat : rekapSiswa;
    const list = sumber.filter((r) => {
      if (modeRiwayat === "TANGGAL" && filterStatus && r.status_kehadiran !== filterStatus) return false;
      if (!q) return true;
      return r.nama_siswa.toLowerCase().includes(q) || (modeRiwayat === "TANGGAL" && (r.tanggal.includes(q) || STATUS_MAP[r.status_kehadiran].label.toLowerCase().includes(q)));
    });
    return [...list].sort((a, b) => {
      let va = a[sortCol], vb = b[sortCol];
      if (typeof va === "string") { va = va.toLowerCase(); vb = String(vb ?? "").toLowerCase(); }
      else { va = va ?? -Infinity; vb = vb ?? -Infinity; }
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return a.nama_siswa.localeCompare(b.nama_siswa);
    });
  }, [riwayat, rekapSiswa, modeRiwayat, searchQuery, filterStatus, sortCol, sortAsc]);

  const totalPages = Math.max(1, Math.ceil(tampil.length / ROWS_PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = tampil.slice((currentPage - 1) * ROWS_PER_PAGE, currentPage * ROWS_PER_PAGE);

  const gantiMode = (m) => { setModeRiwayat(m); setSortCol(m === "TANGGAL" ? "tanggal" : "nama_siswa"); setSortAsc(m !== "TANGGAL"); setPage(1); };
  const handleSort = (col) => {
    if (sortCol === col) setSortAsc(!sortAsc);
    else { setSortCol(col); setSortAsc(col === "nama_siswa"); }
  };
  const sortHeader = (col, label, className = "text-center") => (
    <th key={col} role="button" className={`text-nowrap user-select-none ${className}`} onClick={() => handleSort(col)}>
      {label}{" "}
      <i className={`bi ${sortCol === col ? (sortAsc ? "bi-sort-up text-primary" : "bi-sort-down text-primary") : "bi-arrow-down-up text-muted opacity-50"}`}></i>
    </th>
  );

  const editTanggal = (tanggal) => {
    setFilters((f) => ({ ...f, tanggal }));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // --- EKSPOR ---
  const labelPeriode = (() => {
    const p = periodes.find((x) => x.id_periode === filters.id_periode);
    return p ? `${p.tahun_ajaran} (${p.semester})` : "";
  })();
  const namaFile = `Presensi_${namaKelas.replace(/\s+/g, "_")}_${todayYmd()}`;
  const barisTanggal = () => tampil.map((r, i) => ({ No: i + 1, Tanggal: r.tanggal, "Nama Siswa": r.nama_siswa, Status: STATUS_MAP[r.status_kehadiran].label }));
  const barisRekap = (list = modeRiwayat === "SISWA" ? tampil : rekapSiswa) => list.map((r, i) => ({
    No: i + 1, NISN: r.nisn || r.id_siswa, "Nama Siswa": r.nama_siswa,
    Hadir: r.HADIR, Sakit: r.SAKIT, Izin: r.IZIN, Alpa: r.ALPA, "Total Hari": r.total, "% Hadir": r.persen === null ? "-" : Number(r.persen.toFixed(1)),
  }));
  const adaData = () => {
    if (!data) { Swal.fire("Pilih Kelas", "Pilih kelas dan periode terlebih dahulu.", "info"); return false; }
    if (tampil.length === 0) { Swal.fire("Kosong", "Tidak ada data untuk diekspor.", "info"); return false; }
    return true;
  };
  const handleExcel = () => {
    if (!adaData()) return;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(barisRekap(rekapSiswa)), "Rekap Siswa");
    const semua = [...riwayat].sort((a, b) => b.tanggal.localeCompare(a.tanggal) || a.nama_siswa.localeCompare(b.nama_siswa))
      .map((r, i) => ({ No: i + 1, Tanggal: r.tanggal, "Nama Siswa": r.nama_siswa, Status: STATUS_MAP[r.status_kehadiran].label }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(semua.length ? semua : [{ Keterangan: "Tidak ada data" }]), "Riwayat Harian");
    XLSX.writeFile(wb, `${namaFile}.xlsx`);
  };
  const handleCSV = () => {
    if (!adaData()) return;
    const rows = modeRiwayat === "TANGGAL" ? barisTanggal() : barisRekap();
    const headers = Object.keys(rows[0]);
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [headers.map(esc).join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${namaFile}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };
  const getBase64ImageFromUrl = async (imageUrl) => {
    if (!imageUrl) return null;
    try {
      const response = await fetch(`${API_URL}/signature/${imageUrl.split("/").pop()}`);
      if (!response.ok) return null;
      const blob = await response.blob();
      return new Promise((resolve) => { const r = new FileReader(); r.onloadend = () => resolve(r.result); r.readAsDataURL(blob); });
    } catch (e) { return null; }
  };
  const handlePDF = async () => {
    if (!adaData()) return;
    const judul = modeRiwayat === "TANGGAL" ? "Laporan Historis Presensi" : "Rekap Kehadiran Siswa";
    await generateProfessionalPDF(modeRiwayat === "TANGGAL" ? barisTanggal() : barisRekap(), `${judul} ${namaKelas} - ${labelPeriode}`, settings, getBase64ImageFromUrl);
  };

  const waApiAktif = !!settings?.status_wa_api && !!settings?.has_wa_api_token;

  return (
    <div className="container-fluid mb-5">
      {/* HEADER HALAMAN */}
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <div>
          <h3 className="fw-bold text-primary mb-0"><i className="bi bi-calendar-check me-2"></i>Presensi Harian</h3>
          <small className="text-muted">Catat kehadiran satu kelas sekaligus dan kabari orang tua lewat WhatsApp</small>
        </div>
        <ol className="breadcrumb mb-0 small">
          <li className="breadcrumb-item"><Link href="/dashboard">Dashboard</Link></li>
          <li className="breadcrumb-item">Transaksi</li>
          <li className="breadcrumb-item active" aria-current="page">Presensi</li>
        </ol>
      </div>

      {/* FILTER */}
      <div className="card card-outline card-primary shadow-sm mb-3">
        <div className="card-header"><h3 className="card-title fw-semibold mb-0"><i className="bi bi-funnel me-2"></i>Kelas &amp; Tanggal</h3></div>
        <div className="card-body">
          <div className="row g-3">
            <div className="col-12 col-md-4">
              <label className="form-label fw-semibold small mb-1">Kelas</label>
              <select className="form-select" value={filters.id_kelas} onChange={(e) => setFilters((f) => ({ ...f, id_kelas: e.target.value }))}>
                <option value="">— Pilih Kelas —</option>
                {classes.map((k) => <option key={k.id_kelas} value={k.id_kelas}>{k.nama_kelas}</option>)}
              </select>
            </div>
            <div className="col-12 col-md-4">
              <label className="form-label fw-semibold small mb-1">Periode</label>
              <select className="form-select" value={filters.id_periode} onChange={(e) => setFilters((f) => ({ ...f, id_periode: e.target.value }))}>
                <option value="">— Pilih Periode —</option>
                {periodes.map((p) => <option key={p.id_periode} value={p.id_periode}>{p.tahun_ajaran} ({p.semester}){p.status_aktif === "AKTIF" ? " • Aktif" : ""}</option>)}
              </select>
            </div>
            <div className="col-12 col-md-4">
              <label className="form-label fw-semibold small mb-1">Tanggal</label>
              <input type="date" className="form-control" max={todayYmd()} value={filters.tanggal}
                onChange={(e) => e.target.value && setFilters((f) => ({ ...f, tanggal: e.target.value }))} />
            </div>
          </div>
        </div>
      </div>

      {!filters.id_kelas || !filters.id_periode ? (
        <div className="card shadow-sm"><div className="card-body text-center py-5 text-muted">
          <i className="bi bi-people display-5 text-primary opacity-50"></i>
          <h5 className="fw-semibold mt-3">Pilih kelas dan periode untuk memuat daftar siswa</h5>
        </div></div>
      ) : loading || !data ? (
        <div className="card shadow-sm"><div className="card-body text-center py-5 text-muted">
          <div className="spinner-border text-primary mb-2"></div><div>Memuat data presensi...</div>
        </div></div>
      ) : (
        <>
          {/* LEMBAR PRESENSI */}
          <div className="card card-outline card-success shadow-sm mb-3">
            <div className="card-header d-flex flex-wrap align-items-center gap-2">
              <h3 className="card-title fw-semibold mb-0 me-auto">
                <i className="bi bi-ui-checks me-2"></i>{tanggalPanjang(filters.tanggal)}
                {sudahTercatat
                  ? <span className="badge text-bg-success ms-2 fw-normal">Sudah tercatat</span>
                  : <span className="badge text-bg-secondary ms-2 fw-normal">Belum tercatat</span>}
              </h3>
              <div className="d-flex flex-wrap gap-1">
                {STATUS.map((s) => <span key={s.value} className={`badge text-bg-${s.color}`}>{s.label}: {hitungLembar[s.value]}</span>)}
              </div>
            </div>
            <div className="card-body p-0">
              {data.students.length === 0 ? (
                <div className="text-center text-muted py-5">Tidak ada siswa terdaftar di kelas ini.</div>
              ) : (
                <>
                  <div className="d-flex flex-wrap align-items-center gap-2 px-3 py-2 border-bottom bg-body-tertiary">
                    <small className="text-muted me-auto">Klik status untuk tiap siswa. Bawaan: Hadir.</small>
                    <button type="button" className="btn btn-sm btn-outline-success" onClick={() => setLembar(Object.fromEntries(data.students.map((s) => [s.id_siswa, "HADIR"])))}>
                      <i className="bi bi-check2-all me-1"></i>Tandai Semua Hadir
                    </button>
                    {sudahTercatat && bolehKelolaKelas(filters.id_kelas) && (
                      <button type="button" className="btn btn-sm btn-outline-danger" onClick={handleHapusTanggal}><i className="bi bi-trash me-1"></i>Hapus Tanggal Ini</button>
                    )}
                  </div>
                  <div className="table-responsive">
                    <table className="table table-hover align-middle mb-0">
                      <thead className="table-light">
                        <tr><th className="text-center" style={{ width: 50 }}>No</th><th>Nama Siswa</th><th className="text-center">Status Kehadiran</th></tr>
                      </thead>
                      <tbody>
                        {data.students.map((s, i) => (
                          <tr key={s.id_siswa} className={lembar[s.id_siswa] && lembar[s.id_siswa] !== "HADIR" ? `table-${STATUS_MAP[lembar[s.id_siswa]].color}` : ""}>
                            <td className="text-center text-muted">{i + 1}</td>
                            <td>
                              <div className="fw-semibold">{s.nama_siswa}</div>
                              <small className="text-muted">{s.nisn || s.id_siswa}</small>
                            </td>
                            <td className="text-center">
                              <div className="btn-group btn-group-sm flex-wrap" role="group" aria-label={`Status ${s.nama_siswa}`}>
                                {STATUS.map((st) => (
                                  <Fragment key={st.value}>
                                    <input type="radio" className="btn-check" name={`st_${s.id_siswa}`} id={`${st.value}_${s.id_siswa}`}
                                      checked={lembar[s.id_siswa] === st.value} onChange={() => setLembar((l) => ({ ...l, [s.id_siswa]: st.value }))} />
                                    <label className={`btn btn-outline-${st.color}`} htmlFor={`${st.value}_${s.id_siswa}`} style={{ minWidth: 64 }}>{st.label}</label>
                                  </Fragment>
                                ))}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
            {data.students.length > 0 && (
              <div className="card-footer d-flex flex-wrap justify-content-between align-items-center gap-2">
                <div className="d-flex flex-wrap gap-3">
                  <div className="form-check form-switch m-0">
                    <input className="form-check-input" type="checkbox" id="wa_ortu" checked={waOrtu} onChange={(e) => setWaOrtu(e.target.checked)} />
                    <label className="form-check-label small fw-semibold text-success" htmlFor="wa_ortu"><i className="bi bi-whatsapp me-1"></i>WA Ortu (Sakit/Izin/Alpa)</label>
                  </div>
                  <div className="form-check form-switch m-0">
                    <input className="form-check-input" type="checkbox" id="wa_grup" checked={waGrup} onChange={(e) => setWaGrup(e.target.checked)} />
                    <label className="form-check-label small fw-semibold text-primary" htmlFor="wa_grup"><i className="bi bi-people me-1"></i>Rekap Grup Guru / Kepsek</label>
                  </div>
                  <small className="text-muted">{waApiAktif ? "Pesan dikirim otomatis via Fonnte." : "Setelah simpan, tombol WA manual akan muncul."}</small>
                </div>
                <button type="button" className="btn btn-success fw-semibold px-4" onClick={handleSimpan} disabled={saving}>
                  {saving ? <span className="spinner-border spinner-border-sm me-2"></span> : <i className="bi bi-save me-2"></i>}
                  {sudahTercatat ? (berubah ? "Perbarui Presensi" : "Simpan Ulang") : "Simpan Presensi"}
                </button>
              </div>
            )}
          </div>

          {/* RIWAYAT */}
          <div className="card card-outline card-secondary shadow-sm">
            <div className="card-header d-flex flex-wrap align-items-center gap-2">
              <h3 className="card-title fw-semibold mb-0 me-auto"><i className="bi bi-clock-history me-2"></i>Riwayat Presensi · {labelPeriode}</h3>
              <div className="btn-group btn-group-sm">
                {[["TANGGAL", "Per Tanggal", "bi-list-ul"], ["SISWA", "Rekap Siswa", "bi-person-lines-fill"]].map(([v, l, ic]) => (
                  <button key={v} type="button" className={`btn ${modeRiwayat === v ? "btn-secondary" : "btn-outline-secondary"}`} onClick={() => gantiMode(v)}>
                    <i className={`bi ${ic} me-1`}></i>{l}
                  </button>
                ))}
              </div>
              <div className="btn-group btn-group-sm">
                <button type="button" className="btn btn-outline-success" onClick={handleExcel} title="Rekap siswa & riwayat harian"><i className="bi bi-file-earmark-excel me-1"></i>Excel</button>
                <button type="button" className="btn btn-outline-secondary" onClick={handleCSV}><i className="bi bi-filetype-csv me-1"></i>CSV</button>
                <button type="button" className="btn btn-outline-danger" onClick={handlePDF}><i className="bi bi-file-earmark-pdf me-1"></i>PDF</button>
              </div>
            </div>
            <div className="card-body">
              <div className="row g-2 mb-3">
                <div className="col-12 col-md-6">
                  <div className="input-group input-group-sm">
                    <span className="input-group-text bg-body"><i className="bi bi-search"></i></span>
                    <input type="search" className="form-control" placeholder={modeRiwayat === "TANGGAL" ? "Cari nama, status, atau tanggal..." : "Cari nama siswa..."}
                      value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }} />
                  </div>
                </div>
                {modeRiwayat === "TANGGAL" && (
                  <div className="col-12 col-md-3">
                    <select className="form-select form-select-sm" value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}>
                      <option value="">Semua Status</option>
                      {STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </div>
                )}
              </div>
              <div className="table-responsive">
                <table className="table table-hover table-sm align-middle mb-0 small">
                  <thead className="table-light">
                    {modeRiwayat === "TANGGAL" ? (
                      <tr>
                        <th className="text-center">No</th>
                        {sortHeader("tanggal", "Tanggal", "")}
                        {sortHeader("nama_siswa", "Nama Siswa", "")}
                        {sortHeader("status_kehadiran", "Status")}
                        <th className="text-center">Aksi</th>
                      </tr>
                    ) : (
                      <tr>
                        <th className="text-center">No</th>
                        {sortHeader("nama_siswa", "Nama Siswa", "")}
                        {STATUS.map((s) => sortHeader(s.value, s.label))}
                        {sortHeader("total", "Total Hari")}
                        {sortHeader("persen", "% Hadir")}
                      </tr>
                    )}
                  </thead>
                  <tbody>
                    {pageRows.length === 0 && (
                      <tr><td colSpan="8" className="text-center text-muted py-4">{riwayat.length ? "Pencarian tidak menemukan hasil." : "Belum ada data presensi pada periode ini."}</td></tr>
                    )}
                    {modeRiwayat === "TANGGAL" ? pageRows.map((r, i) => {
                      const st = STATUS_MAP[r.status_kehadiran];
                      const siswa = siswaMap.get(r.id_siswa);
                      return (
                        <tr key={r.id_presensi}>
                          <td className="text-center text-muted">{(currentPage - 1) * ROWS_PER_PAGE + i + 1}</td>
                          <td className="text-nowrap">{r.tanggal}</td>
                          <td className="fw-semibold">{r.nama_siswa}</td>
                          <td className="text-center"><span className={`badge text-bg-${st.color}`}>{st.label}</span></td>
                          <td className="text-center text-nowrap">
                            {siswa && (
                              <button type="button" className="btn btn-sm btn-outline-success me-1" title="Kirim WA ke orang tua"
                                onClick={() => bukaChat(kontakOrtu(siswa).nomor, pesanOrtu(siswa, r.tanggal, r.status_kehadiran))}>
                                <i className="bi bi-whatsapp"></i>
                              </button>
                            )}
                            <button type="button" className="btn btn-sm btn-outline-warning" title="Ubah presensi tanggal ini" onClick={() => editTanggal(r.tanggal)}>
                              <i className="bi bi-pencil"></i>
                            </button>
                          </td>
                        </tr>
                      );
                    }) : pageRows.map((r, i) => (
                      <tr key={r.id_siswa}>
                        <td className="text-center text-muted">{(currentPage - 1) * ROWS_PER_PAGE + i + 1}</td>
                        <td><div className="fw-semibold">{r.nama_siswa}</div><small className="text-muted">{r.nisn || r.id_siswa}</small></td>
                        {STATUS.map((s) => <td key={s.value} className={`text-center ${r[s.value] && s.value !== "HADIR" ? `text-${s.color} fw-semibold` : ""}`}>{r[s.value]}</td>)}
                        <td className="text-center">{r.total}</td>
                        <td className="text-center fw-semibold">{r.persen === null ? "–" : `${r.persen.toFixed(1)}%`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            {totalPages > 1 && (
              <div className="card-footer d-flex justify-content-between align-items-center">
                <button type="button" className="btn btn-sm btn-outline-secondary" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}><i className="bi bi-chevron-left"></i></button>
                <small className="text-muted">Halaman {currentPage} dari {totalPages}</small>
                <button type="button" className="btn btn-sm btn-outline-secondary" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}><i className="bi bi-chevron-right"></i></button>
              </div>
            )}
          </div>
        </>
      )}

      {/* PANEL WA SETELAH SIMPAN */}
      <Modal show={!!panelWA} title="Presensi Tersimpan!" icon="bi-check-circle" onClose={() => setPanelWA(null)}
        footer={<button type="button" className="btn btn-success" onClick={() => setPanelWA(null)}>Selesai &amp; Tutup</button>}>
        {panelWA && (
          <>
            <div className="small text-muted mb-2">{panelWA.pesan}</div>
            {panelWA.api?.sent ? (
              <div className="alert alert-success py-2 small"><i className="bi bi-robot me-1"></i><strong>Kirim otomatis:</strong> {panelWA.api.count} pesan WA terkirim via Fonnte.</div>
            ) : panelWA.api ? (
              <div className="alert alert-warning py-2 small"><i className="bi bi-exclamation-triangle me-1"></i>Kirim otomatis gagal: {panelWA.api.reason} Gunakan tombol manual di bawah.</div>
            ) : (
              <div className="alert alert-secondary py-2 small"><i className="bi bi-hand-index me-1"></i><strong>Mode manual:</strong> klik tombol di bawah untuk mengirim lewat WhatsApp HP/Web Anda.</div>
            )}

            {panelWA.tidakHadir.length ? (
              <>
                <label className="fw-semibold small text-muted mb-2">Kirim WA ke orang tua siswa yang tidak hadir:</label>
                <div className="list-group mb-3" style={{ maxHeight: 240, overflowY: "auto" }}>
                  {panelWA.tidakHadir.map((x) => (
                    <div key={x.siswa.id_siswa} className="list-group-item d-flex justify-content-between align-items-center gap-2 py-2">
                      <div className="text-truncate">
                        <span className={`badge text-bg-${STATUS_MAP[x.status].color} me-1`}>{STATUS_MAP[x.status].label}</span>
                        <strong className="small">{x.siswa.nama_siswa}</strong>{" "}
                        <small className="text-muted">{x.nomor ? `(${x.nomor})` : "(nomor belum diisi)"}</small>
                      </div>
                      <button type="button" className="btn btn-sm btn-success text-nowrap" onClick={() => bukaChat(x.nomor, x.pesan)}><i className="bi bi-whatsapp me-1"></i>Chat Ortu</button>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="alert alert-info py-2 small"><i className="bi bi-emoji-smile me-1"></i>Semua siswa <strong>hadir (100%)</strong> pada tanggal ini!</div>
            )}

            <div className="border-top pt-3">
              <label className="fw-semibold small text-muted mb-2">Rekap kelas untuk grup guru &amp; kepala sekolah:</label>
              <div className="d-flex gap-2">
                <button type="button" className="btn btn-outline-primary btn-sm w-50" onClick={() => salin(panelWA.rekap)}><i className="bi bi-clipboard me-1"></i>Salin Teks Rekap</button>
                <button type="button" className="btn btn-success btn-sm w-50" onClick={() => bukaChat(formatNomorWA(settings?.no_wa_kepsek), panelWA.rekap)}><i className="bi bi-whatsapp me-1"></i>Bagikan ke WA</button>
              </div>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
