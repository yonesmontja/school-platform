"use client";
import { useState, useEffect, useMemo, Fragment } from "react";
import Link from "next/link";
import Swal from "sweetalert2";
import * as XLSX from "xlsx";
import { generateProfessionalPDF } from "@/utils/pdfExport";

const API_URL = "http://localhost:8000/api";
const getToken = () => localStorage.getItem("token");

const DIMENSI_PROFIL = [
  "Beriman, Bertakwa kepada Tuhan YME, dan Berakhlak Mulia",
  "Berkebinekaan Global",
  "Bergotong Royong",
  "Mandiri",
  "Bernalar Kritis",
  "Kreatif",
];
const STNKM = [
  { key: "S", label: "Skill", color: "primary" },
  { key: "T", label: "Teori", color: "success" },
  { key: "N", label: "Nalar", color: "info" },
  { key: "K", label: "Karakter", color: "warning" },
  { key: "M", label: "Minat", color: "danger" },
];
const PREDIKAT = [
  { value: "SB", label: "Sangat Berkembang", color: "success" },
  { value: "BSH", label: "Berkembang Sesuai Harapan", color: "primary" },
  { value: "MB", label: "Mulai Berkembang", color: "warning" },
  { value: "BB", label: "Belum Berkembang", color: "danger" },
];
const PREDIKAT_MAP = Object.fromEntries(PREDIKAT.map((p) => [p.value, p]));
const AI_MODES = [
  { value: "GEMINI", label: "Gemini" },
  { value: "CLAUDE", label: "Claude" },
  { value: "QWEN", label: "Qwen" },
  { value: "DEEPSEEK", label: "DeepSeek" },
  { value: "OPENKEY", label: "OpenKey" },
  { value: "LOKAL", label: "Tanpa AI" },
];
const targetKosong = () => ({ id_target: null, dimensi: "", elemen: "", sub_elemen: "", capaian_akhir_fase: "", relasi_stnkm: ["K"] });
// "poin_K,poin_M" → ["K", "M"]
const parseRelasi = (str) => String(str || "").split(",").map((r) => r.trim().replace(/^poin_/i, "").toUpperCase()).filter((d) => STNKM.some((s) => s.key === d));
const todayYmd = () => new Date().toISOString().slice(0, 10);

const Modal = ({ show, title, icon, onClose, children, footer }) => {
  if (!show) return null;
  return (
    <>
      <div className="modal fade show d-block" tabIndex="-1" role="dialog" aria-modal="true">
        <div className="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable">
          <div className="modal-content border-0 shadow">
            <div className="modal-header bg-primary text-white">
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

export default function P5Page() {
  const [classes, setClasses] = useState([]);
  const [periodes, setPeriodes] = useState([]);
  const [settings, setSettings] = useState(null);
  const [filters, setFilters] = useState({ id_kelas: "", id_periode: "", id_proyek: "" });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("CATATAN");

  // Form projek
  const [formProyek, setFormProyek] = useState(null);
  const [savingProyek, setSavingProyek] = useState(false);

  // Catatan proses
  const [catatan, setCatatan] = useState({});
  const [aiMode, setAiMode] = useState("GEMINI");
  const [aiBusy, setAiBusy] = useState({});
  const [batchAI, setBatchAI] = useState(null);
  const [savingCatatan, setSavingCatatan] = useState(false);

  // Nilai P5
  const [hitungLoading, setHitungLoading] = useState(false);
  const [cariNilai, setCariNilai] = useState("");

  const safeFetch = async (url, opts = {}) => {
    const res = await fetch(url, { ...opts, headers: { Accept: "application/json", Authorization: `Bearer ${getToken()}`, ...opts.headers } });
    if (res.status === 401) { window.location.href = "/login"; throw new Error("Sesi berakhir, silakan login ulang."); }
    const text = await res.text();
    let json = {};
    try { json = text ? JSON.parse(text) : {}; } catch (e) { throw new Error(`Respon server tidak valid. Status: ${res.status}`); }
    if (!res.ok) {
      const firstError = json.errors ? Object.values(json.errors)[0]?.[0] : null;
      throw new Error(firstError || json.message || "Terjadi kesalahan pada server");
    }
    return json;
  };
  const sendJSON = (url, method, body) => safeFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  useEffect(() => {
    if (!getToken()) { window.location.href = "/login"; return; }
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

  // Muat ulang data; projek terpilih dipertahankan bila masih ada, selain itu pilih projek pertama
  const muatData = async (pilihProyek) => {
    const { id_kelas, id_periode } = filters;
    const res = await safeFetch(`${API_URL}/p5?${new URLSearchParams({ id_kelas, id_periode })}`);
    setData(res);
    setFilters((f) => {
      const tujuan = pilihProyek ?? f.id_proyek;
      return { ...f, id_proyek: res.proyek.some((p) => p.id_proyek === tujuan) ? tujuan : (res.proyek[0]?.id_proyek || "") };
    });
    return res;
  };

  useEffect(() => {
    if (!filters.id_kelas || !filters.id_periode) { setData(null); return; }
    let batal = false;
    (async () => {
      setLoading(true);
      try {
        const res = await safeFetch(`${API_URL}/p5?${new URLSearchParams({ id_kelas: filters.id_kelas, id_periode: filters.id_periode })}`);
        if (batal) return;
        setData(res);
        setFilters((f) => ({ ...f, id_proyek: res.proyek[0]?.id_proyek || "" }));
      } catch (err) { if (!batal) Swal.fire("Gagal Memuat Data", err.message, "error"); }
      finally { if (!batal) setLoading(false); }
    })();
    return () => { batal = true; };
  }, [filters.id_kelas, filters.id_periode]);

  const proyek = data?.proyek.find((p) => p.id_proyek === filters.id_proyek) || null;
  const namaKelas = classes.find((k) => k.id_kelas === filters.id_kelas)?.nama_kelas || "-";

  // Catatan tersimpan untuk projek terpilih
  const catatanTersimpan = useMemo(() => {
    if (!data || !proyek) return {};
    return Object.fromEntries(data.catatan.filter((c) => c.id_proyek === proyek.id_proyek).map((c) => [c.id_siswa, c.catatan_proses]));
  }, [data, proyek]);
  useEffect(() => { setCatatan(catatanTersimpan); }, [catatanTersimpan]);

  const catatanBerubah = useMemo(
    () => (data?.students || []).some((s) => (catatan[s.id_siswa] || "").trim() !== (catatanTersimpan[s.id_siswa] || "").trim()),
    [data, catatan, catatanTersimpan],
  );

  const gantiProyek = async (id_proyek) => {
    if (catatanBerubah) {
      const ok = await Swal.fire({ title: "Buang perubahan catatan?", text: "Ada catatan proses yang belum disimpan.", icon: "warning", showCancelButton: true, confirmButtonText: "Ya, Buang", cancelButtonText: "Batal" });
      if (!ok.isConfirmed) return;
    }
    setFilters((f) => ({ ...f, id_proyek }));
  };

  // ================= PROJEK =================
  const bukaProyekBaru = () => setFormProyek({ id_proyek: null, judul_proyek: "", fase: "", deskripsi_proyek: "", targets: [targetKosong()] });
  const bukaEditProyek = () => {
    if (!proyek) return;
    setFormProyek({
      id_proyek: proyek.id_proyek, judul_proyek: proyek.judul_proyek, fase: proyek.fase || "", deskripsi_proyek: proyek.deskripsi_proyek || "",
      targets: proyek.targets.map((t) => ({ ...t, elemen: t.elemen || "", sub_elemen: t.sub_elemen || "", capaian_akhir_fase: t.capaian_akhir_fase || "", relasi_stnkm: parseRelasi(t.relasi_stnkm) })),
    });
  };
  const ubahTarget = (i, field, value) => setFormProyek((f) => ({ ...f, targets: f.targets.map((t, j) => (j === i ? { ...t, [field]: value } : t)) }));
  const toggleRelasi = (i, key) => setFormProyek((f) => ({
    ...f,
    targets: f.targets.map((t, j) => (j === i ? { ...t, relasi_stnkm: t.relasi_stnkm.includes(key) ? t.relasi_stnkm.filter((k) => k !== key) : [...t.relasi_stnkm, key] } : t)),
  }));

  const simpanProyek = async () => {
    const f = formProyek;
    if (!f.judul_proyek.trim()) return Swal.fire("Perhatian", "Judul projek wajib diisi.", "warning");
    if (f.targets.length === 0 || f.targets.some((t) => !t.dimensi.trim())) return Swal.fire("Perhatian", "Setiap target wajib memiliki dimensi.", "warning");
    if (f.id_proyek && proyek && proyek.targets.some((t) => !f.targets.some((x) => x.id_target === t.id_target))) {
      const ok = await Swal.fire({ title: "Ada target yang dihapus", text: "Nilai P5 siswa pada target yang dihapus juga akan hilang. Lanjutkan?", icon: "warning", showCancelButton: true, confirmButtonText: "Ya, Simpan", cancelButtonText: "Batal" });
      if (!ok.isConfirmed) return;
    }
    setSavingProyek(true);
    try {
      const body = { ...f, id_kelas: filters.id_kelas, id_periode: filters.id_periode };
      const res = f.id_proyek
        ? await sendJSON(`${API_URL}/p5/proyek/${f.id_proyek}`, "PUT", body)
        : await sendJSON(`${API_URL}/p5/proyek`, "POST", body);
      await muatData(res.data.id_proyek);
      setFormProyek(null);
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: res.message, showConfirmButton: false, timer: 2500 });
    } catch (err) { Swal.fire("Gagal Menyimpan", err.message, "error"); }
    finally { setSavingProyek(false); }
  };

  const hapusProyek = async () => {
    if (!proyek) return;
    const ok = await Swal.fire({
      title: "Hapus projek ini?", html: `<b>${proyek.judul_proyek.replace(/</g, "&lt;")}</b> beserta seluruh target, nilai P5, dan catatan prosesnya akan dihapus.`,
      icon: "warning", showCancelButton: true, confirmButtonColor: "#dc3545", confirmButtonText: "Ya, Hapus", cancelButtonText: "Batal",
    });
    if (!ok.isConfirmed) return;
    try {
      const res = await safeFetch(`${API_URL}/p5/proyek/${proyek.id_proyek}`, { method: "DELETE" });
      await muatData("");
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: res.message, showConfirmButton: false, timer: 2500 });
    } catch (err) { Swal.fire("Gagal", err.message, "error"); }
  };

  // ================= CATATAN PROSES =================
  const sihirAI = async (idSiswa, diam = false) => {
    setAiBusy((b) => ({ ...b, [idSiswa]: true }));
    try {
      const res = await sendJSON(`${API_URL}/p5/catatan/generate`, "POST", { id_siswa: idSiswa, id_proyek: proyek.id_proyek, draf: catatan[idSiswa] || "", ai_mode: aiMode });
      setCatatan((c) => ({ ...c, [idSiswa]: res.data }));
      if (!diam) {
        const lokal = res.mode === "LOKAL" && aiMode !== "LOKAL";
        Swal.fire({ toast: true, position: "top-end", showConfirmButton: false, timer: lokal ? 4000 : 2000, icon: lokal ? "warning" : "success",
          title: lokal ? "AI tidak tersedia (key kosong/gagal). Catatan disusun secara lokal." : "Catatan dirapikan AI!" });
      }
      return res.mode;
    } catch (err) {
      if (!diam) Swal.fire("Gagal", err.message, "error");
      throw err;
    } finally { setAiBusy((b) => ({ ...b, [idSiswa]: false })); }
  };

  // Isi semua catatan yang masih kosong satu per satu agar tidak membebani provider AI
  const sihirSemuaKosong = async () => {
    const kosong = data.students.filter((s) => !(catatan[s.id_siswa] || "").trim());
    if (kosong.length === 0) return Swal.fire("Semua Terisi", "Tidak ada catatan yang kosong.", "info");
    const ok = await Swal.fire({ title: `Susun ${kosong.length} catatan kosong?`, text: "AI menyusun catatan dari jurnal observasi tiap siswa. Hasilnya bisa diedit sebelum disimpan.", icon: "question", showCancelButton: true, confirmButtonText: "Ya, Susun", cancelButtonText: "Batal" });
    if (!ok.isConfirmed) return;
    let gagal = 0, lokal = 0;
    for (let i = 0; i < kosong.length; i++) {
      setBatchAI({ selesai: i, total: kosong.length });
      try { if ((await sihirAI(kosong[i].id_siswa, true)) === "LOKAL" && aiMode !== "LOKAL") lokal++; } catch (e) { gagal++; }
    }
    setBatchAI(null);
    Swal.fire("Selesai", `${kosong.length - gagal} catatan tersusun${lokal ? ` (${lokal} disusun lokal karena AI tidak tersedia)` : ""}${gagal ? `, ${gagal} gagal` : ""}. Periksa lalu klik Simpan.`, gagal ? "warning" : "success");
  };

  const simpanCatatan = async () => {
    setSavingCatatan(true);
    try {
      const records = data.students.map((s) => ({ id_siswa: s.id_siswa, catatan_proses: catatan[s.id_siswa] || "" }));
      const res = await sendJSON(`${API_URL}/p5/catatan`, "POST", { id_proyek: proyek.id_proyek, records });
      await muatData();
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: res.message, showConfirmButton: false, timer: 2500 });
    } catch (err) { Swal.fire("Gagal Menyimpan", err.message, "error"); }
    finally { setSavingCatatan(false); }
  };

  // ================= NILAI P5 =================
  const nilaiProyek = useMemo(() => {
    if (!data || !proyek) return new Map();
    return new Map(data.nilai.filter((n) => n.id_proyek === proyek.id_proyek).map((n) => [`${n.id_siswa}|${n.id_target}`, n]));
  }, [data, proyek]);

  const rekapPredikat = useMemo(() => {
    const c = Object.fromEntries(PREDIKAT.map((p) => [p.value, 0]));
    nilaiProyek.forEach((n) => { c[n.predikat]++; });
    return c;
  }, [nilaiProyek]);

  const terakhirDihitung = useMemo(() => {
    let max = null;
    nilaiProyek.forEach((n) => { if (!max || n.updated_at > max) max = n.updated_at; });
    return max ? new Date(max).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : null;
  }, [nilaiProyek]);

  const hitungNilai = async () => {
    const ok = await Swal.fire({
      title: "Jalankan ekstraksi STNKM?",
      html: "Predikat P5 tiap siswa dihitung dari rata-rata poin STNKM nilai harian sesuai relasi target.<br><small class='text-muted'>Hasil sebelumnya (termasuk ubahan manual) akan ditimpa.</small>",
      icon: "question", showCancelButton: true, confirmButtonText: "Ya, Ekstrak Sekarang", cancelButtonText: "Batal",
    });
    if (!ok.isConfirmed) return;
    setHitungLoading(true);
    try {
      const res = await sendJSON(`${API_URL}/p5/hitung`, "POST", { id_proyek: proyek.id_proyek });
      await muatData();
      const r = res.rekap;
      Swal.fire({
        title: "Ekstraksi Selesai", icon: "success",
        html: `${res.message}<br>SB: <b>${r.SB}</b> · BSH: <b>${r.BSH}</b> · MB: <b>${r.MB}</b> · BB: <b>${r.BB}</b>`
          + (res.target_tanpa_relasi ? `<div class="alert alert-warning small mt-3 mb-0">${res.target_tanpa_relasi} target belum punya relasi STNKM sehingga skornya 0 (BB). Atur relasinya lewat Edit Projek.</div>` : ""),
      });
    } catch (err) { Swal.fire("Gagal", err.message, "error"); }
    finally { setHitungLoading(false); }
  };

  const ubahPredikat = async (n, predikat) => {
    try {
      await sendJSON(`${API_URL}/p5/nilai/${n.id_nilaip5}`, "PUT", { predikat });
      setData((d) => ({ ...d, nilai: d.nilai.map((x) => (x.id_nilaip5 === n.id_nilaip5 ? { ...x, predikat } : x)) }));
    } catch (err) { Swal.fire("Gagal", err.message, "error"); }
  };

  const siswaNilai = useMemo(() => {
    const q = cariNilai.trim().toLowerCase();
    return (data?.students || []).filter((s) => !q || s.nama_siswa.toLowerCase().includes(q));
  }, [data, cariNilai]);

  // --- EKSPOR NILAI ---
  const barisNilai = () => {
    const rows = [];
    siswaNilai.forEach((s) => proyek.targets.forEach((t) => {
      const n = nilaiProyek.get(`${s.id_siswa}|${t.id_target}`);
      rows.push({ No: rows.length + 1, "Nama Siswa": s.nama_siswa, "Dimensi Target P5": `${t.dimensi}${t.elemen ? ` - ${t.elemen}` : ""}`, "Skor STNKM": n ? n.skor_rata2 : "-", Predikat: n?.predikat || "-" });
    }));
    return rows;
  };
  const adaNilai = () => {
    if (!proyek || nilaiProyek.size === 0) { Swal.fire("Kosong", "Belum ada nilai P5. Jalankan Ekstrak Nilai P5 terlebih dahulu.", "info"); return false; }
    return true;
  };
  const namaFile = () => `Nilai_P5_${namaKelas.replace(/\s+/g, "_")}_${todayYmd()}`;
  const eksporExcel = () => {
    if (!adaNilai()) return;
    const wb = XLSX.utils.book_new();
    const matriks = siswaNilai.map((s, i) => ({
      No: i + 1, "Nama Siswa": s.nama_siswa,
      ...Object.fromEntries(proyek.targets.map((t, j) => [`T${j + 1}. ${t.dimensi}`.slice(0, 60), nilaiProyek.get(`${s.id_siswa}|${t.id_target}`)?.predikat || "-"])),
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(matriks), "Matriks Predikat");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(barisNilai()), "Detail Skor");
    XLSX.writeFile(wb, `${namaFile()}.xlsx`);
  };
  const eksporCSV = () => {
    if (!adaNilai()) return;
    const rows = barisNilai();
    const headers = Object.keys(rows[0]);
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [headers.map(esc).join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\r\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    link.download = `${namaFile()}.csv`;
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
  const eksporPDF = async () => {
    if (!adaNilai()) return;
    await generateProfessionalPDF(barisNilai(), `Laporan Evaluasi P5 - ${proyek.judul_proyek} - ${namaKelas}`, settings, getBase64ImageFromUrl);
  };

  const jumlahCatatan = Object.values(catatanTersimpan).filter(Boolean).length;
  const targetTanpaRelasi = proyek ? proyek.targets.filter((t) => parseRelasi(t.relasi_stnkm).length === 0).length : 0;

  return (
    <div className="container-fluid mb-5">
      {/* HEADER HALAMAN */}
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <div>
          <h3 className="fw-bold text-primary mb-0"><i className="bi bi-stars me-2"></i>Projek P5</h3>
          <small className="text-muted">Projek Penguatan Profil Pelajar Pancasila: target, catatan proses, dan predikat</small>
        </div>
        <ol className="breadcrumb mb-0 small">
          <li className="breadcrumb-item"><Link href="/dashboard">Dashboard</Link></li>
          <li className="breadcrumb-item">Transaksi</li>
          <li className="breadcrumb-item active" aria-current="page">Projek P5</li>
        </ol>
      </div>

      {/* FILTER */}
      <div className="card card-outline card-primary shadow-sm mb-3">
        <div className="card-header"><h3 className="card-title fw-semibold mb-0"><i className="bi bi-funnel me-2"></i>Pilih Projek</h3></div>
        <div className="card-body">
          <div className="row g-3 align-items-end">
            <div className="col-12 col-md-3">
              <label className="form-label fw-semibold small mb-1">Periode</label>
              <select className="form-select" value={filters.id_periode} onChange={(e) => setFilters((f) => ({ ...f, id_periode: e.target.value }))}>
                <option value="">— Pilih Periode —</option>
                {periodes.map((p) => <option key={p.id_periode} value={p.id_periode}>{p.tahun_ajaran} ({p.semester}){p.status_aktif === "AKTIF" ? " • Aktif" : ""}</option>)}
              </select>
            </div>
            <div className="col-12 col-md-3">
              <label className="form-label fw-semibold small mb-1">Kelas</label>
              <select className="form-select" value={filters.id_kelas} onChange={(e) => setFilters((f) => ({ ...f, id_kelas: e.target.value }))}>
                <option value="">— Pilih Kelas —</option>
                {classes.map((k) => <option key={k.id_kelas} value={k.id_kelas}>{k.nama_kelas}</option>)}
              </select>
            </div>
            <div className="col-12 col-md-6">
              <label className="form-label fw-semibold small mb-1">Projek</label>
              <div className="input-group">
                <select className="form-select" value={filters.id_proyek} disabled={!data || data.proyek.length === 0} onChange={(e) => gantiProyek(e.target.value)}>
                  {!data ? <option value="">— Pilih Kelas Dulu —</option> : data.proyek.length === 0 ? <option value="">— Belum ada projek —</option> : null}
                  {(data?.proyek || []).map((p) => <option key={p.id_proyek} value={p.id_proyek}>{p.judul_proyek}{p.fase ? ` (Fase ${p.fase})` : ""}</option>)}
                </select>
                <button type="button" className="btn btn-primary" disabled={!data} onClick={bukaProyekBaru} title="Projek baru"><i className="bi bi-plus-lg"></i><span className="d-none d-lg-inline ms-1">Baru</span></button>
                <button type="button" className="btn btn-outline-secondary" disabled={!proyek} onClick={bukaEditProyek} title="Edit projek & target"><i className="bi bi-pencil"></i></button>
                <button type="button" className="btn btn-outline-danger" disabled={!proyek} onClick={hapusProyek} title="Hapus projek"><i className="bi bi-trash"></i></button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {!filters.id_kelas || !filters.id_periode ? (
        <div className="card shadow-sm"><div className="card-body text-center py-5 text-muted">
          <i className="bi bi-clipboard-check display-5 text-primary opacity-50"></i>
          <h5 className="fw-semibold mt-3">Pilih periode dan kelas untuk mengelola projek P5</h5>
        </div></div>
      ) : loading || !data ? (
        <div className="card shadow-sm"><div className="card-body text-center py-5 text-muted">
          <div className="spinner-border text-primary mb-2"></div><div>Memuat data projek...</div>
        </div></div>
      ) : !proyek ? (
        <div className="card shadow-sm"><div className="card-body text-center py-5 text-muted">
          <i className="bi bi-folder-plus display-5 text-primary opacity-50"></i>
          <h5 className="fw-semibold mt-3">Belum ada projek P5 untuk {namaKelas} pada periode ini</h5>
          <p className="small">Buat projek beserta target dimensinya, lalu isi catatan proses dan ekstrak predikat siswa.</p>
          <button type="button" className="btn btn-primary" onClick={bukaProyekBaru}><i className="bi bi-plus-lg me-1"></i>Buat Projek Pertama</button>
        </div></div>
      ) : (
        <>
          {/* INFO PROJEK */}
          <div className="card shadow-sm mb-3">
            <div className="card-body">
              <div className="row g-3">
                <div className="col-12 col-lg-5">
                  <h5 className="fw-bold mb-1">{proyek.judul_proyek} {proyek.fase && <span className="badge text-bg-primary align-middle">Fase {proyek.fase}</span>}</h5>
                  <p className="small text-muted mb-2" style={{ whiteSpace: "pre-line" }}>{proyek.deskripsi_proyek || "Tidak ada deskripsi."}</p>
                  <div className="d-flex flex-wrap gap-2 small">
                    <span className="badge text-bg-light border"><i className="bi bi-bullseye me-1"></i>{proyek.targets.length} target</span>
                    <span className="badge text-bg-light border"><i className="bi bi-chat-left-text me-1"></i>{jumlahCatatan}/{data.students.length} catatan</span>
                    <span className="badge text-bg-light border"><i className="bi bi-award me-1"></i>{nilaiProyek.size ? `Dihitung ${terakhirDihitung}` : "Belum diekstrak"}</span>
                  </div>
                </div>
                <div className="col-12 col-lg-7">
                  <div className="small fw-semibold text-muted mb-1">Target Dimensi &amp; Relasi STNKM</div>
                  <ul className="list-group list-group-flush small border rounded">
                    {proyek.targets.map((t, i) => {
                      const relasi = parseRelasi(t.relasi_stnkm);
                      return (
                        <li key={t.id_target} className="list-group-item d-flex justify-content-between align-items-start gap-2 py-1">
                          <div><span className="text-muted me-1">T{i + 1}.</span><strong>{t.dimensi}</strong>{t.elemen && <span className="text-muted"> · {t.elemen}</span>}</div>
                          <div className="text-nowrap">
                            {relasi.length ? relasi.map((r) => <span key={r} className={`badge text-bg-${STNKM.find((s) => s.key === r).color} ms-1`}>{r}</span>)
                              : <span className="badge text-bg-secondary">tanpa relasi</span>}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  {targetTanpaRelasi > 0 && <small className="text-warning d-block mt-1"><i className="bi bi-exclamation-triangle me-1"></i>{targetTanpaRelasi} target tanpa relasi STNKM akan selalu mendapat BB saat diekstrak.</small>}
                </div>
              </div>
            </div>
          </div>

          {/* TAB */}
          <ul className="nav nav-tabs">
            <li className="nav-item"><button type="button" className={`nav-link ${tab === "CATATAN" ? "active fw-semibold" : ""}`} onClick={() => setTab("CATATAN")}>
              <i className="bi bi-pencil-square me-1"></i>Catatan Proses{catatanBerubah && <span className="badge text-bg-warning ms-1">belum disimpan</span>}
            </button></li>
            <li className="nav-item"><button type="button" className={`nav-link ${tab === "NILAI" ? "active fw-semibold" : ""}`} onClick={() => setTab("NILAI")}>
              <i className="bi bi-award me-1"></i>Nilai P5
            </button></li>
          </ul>

          {tab === "CATATAN" ? (
            <div className="card shadow-sm border-top-0 rounded-top-0">
              <div className="card-body">
                <div className="d-flex flex-wrap align-items-center gap-3 mb-3 p-2 px-3 bg-body-tertiary border rounded">
                  <span className="small fw-semibold">Mesin AI pemoles:</span>
                  {AI_MODES.map((m) => (
                    <div key={m.value} className="form-check form-check-inline m-0">
                      <input className="form-check-input" type="radio" name="ai_p5" id={`ai_${m.value}`} checked={aiMode === m.value} onChange={() => setAiMode(m.value)} />
                      <label className="form-check-label small" htmlFor={`ai_${m.value}`}>{m.label}</label>
                    </div>
                  ))}
                  <button type="button" className="btn btn-sm btn-outline-info ms-auto" onClick={sihirSemuaKosong} disabled={!!batchAI}>
                    {batchAI ? <><span className="spinner-border spinner-border-sm me-1"></span>{batchAI.selesai}/{batchAI.total}</> : <><i className="bi bi-magic me-1"></i>Susun Semua yang Kosong</>}
                  </button>
                </div>
                <div className="table-responsive">
                  <table className="table align-middle mb-0">
                    <thead className="table-light">
                      <tr><th className="text-center" style={{ width: 50 }}>No</th><th style={{ width: "22%" }}>Nama Siswa</th><th>Narasi Catatan Proses (Kualitatif)</th></tr>
                    </thead>
                    <tbody>
                      {data.students.length === 0 && <tr><td colSpan="3" className="text-center text-muted py-4">Tidak ada siswa di kelas ini.</td></tr>}
                      {data.students.map((s, i) => {
                        const berubahIni = (catatan[s.id_siswa] || "").trim() !== (catatanTersimpan[s.id_siswa] || "").trim();
                        return (
                          <tr key={s.id_siswa} className={berubahIni ? "table-warning" : ""}>
                            <td className="text-center text-muted">{i + 1}</td>
                            <td><div className="fw-semibold">{s.nama_siswa}</div><small className="text-muted">{s.nisn || s.id_siswa}</small></td>
                            <td>
                              <div className="d-flex align-items-start gap-2">
                                <textarea className="form-control form-control-sm" rows="3" maxLength={2000} value={catatan[s.id_siswa] || ""} disabled={aiBusy[s.id_siswa]}
                                  placeholder="Ketik kata kunci kasar (mis. aktif diskusi, suka membantu teman), lalu klik tombol sihir agar AI merapikannya menjadi bahasa rapor."
                                  onChange={(e) => setCatatan((c) => ({ ...c, [s.id_siswa]: e.target.value }))}></textarea>
                                <button type="button" className="btn btn-outline-info align-self-stretch" style={{ minWidth: 46 }} onClick={() => sihirAI(s.id_siswa).catch(() => {})}
                                  disabled={aiBusy[s.id_siswa] || !!batchAI} title="Rapikan draf / susun otomatis dengan AI">
                                  {aiBusy[s.id_siswa] ? <span className="spinner-border spinner-border-sm"></span> : <i className="bi bi-magic"></i>}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="card-footer d-flex flex-wrap justify-content-between align-items-center gap-2 position-sticky bottom-0 bg-body" style={{ zIndex: 2 }}>
                <small className="text-muted"><i className="bi bi-info-circle me-1"></i>Catatan yang dikosongkan akan dihapus; rapor memakai kalimat bawaan.</small>
                <div className="d-flex gap-2">
                  <button type="button" className="btn btn-outline-secondary" disabled={!catatanBerubah || savingCatatan} onClick={() => setCatatan(catatanTersimpan)}><i className="bi bi-arrow-counterclockwise me-1"></i>Reset</button>
                  <button type="button" className="btn btn-success fw-semibold" disabled={!catatanBerubah || savingCatatan || !!batchAI} onClick={simpanCatatan}>
                    {savingCatatan ? <span className="spinner-border spinner-border-sm me-2"></span> : <i className="bi bi-save me-2"></i>}Simpan Semua Catatan
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="card shadow-sm border-top-0 rounded-top-0">
              <div className="card-body">
                <div className="alert alert-info d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-2 py-2">
                  <div className="small">
                    <i className="bi bi-robot me-1"></i>Skor = rata-rata poin STNKM dari nilai harian siswa sesuai relasi target.
                    Predikat: <b>SB</b> ≥ 90 · <b>BSH</b> ≥ 75 · <b>MB</b> ≥ 60 · <b>BB</b> &lt; 60. Predikat bisa diubah manual per sel.
                  </div>
                  <button type="button" className="btn btn-primary btn-sm fw-semibold text-nowrap" onClick={hitungNilai} disabled={hitungLoading}>
                    {hitungLoading ? <span className="spinner-border spinner-border-sm me-1"></span> : <i className="bi bi-magic me-1"></i>}Ekstrak Nilai P5
                  </button>
                </div>

                <div className="row g-2 mb-3 align-items-center">
                  <div className="col-12 col-md-5">
                    <div className="input-group input-group-sm">
                      <span className="input-group-text bg-body"><i className="bi bi-search"></i></span>
                      <input type="search" className="form-control" placeholder="Cari nama siswa..." value={cariNilai} onChange={(e) => setCariNilai(e.target.value)} />
                    </div>
                  </div>
                  <div className="col-12 col-md-7 d-flex flex-wrap justify-content-md-end align-items-center gap-2">
                    {PREDIKAT.map((p) => <span key={p.value} className={`badge text-bg-${p.color}`} title={p.label}>{p.value}: {rekapPredikat[p.value]}</span>)}
                    <div className="btn-group btn-group-sm">
                      <button type="button" className="btn btn-outline-success" onClick={eksporExcel}><i className="bi bi-file-earmark-excel me-1"></i>Excel</button>
                      <button type="button" className="btn btn-outline-secondary" onClick={eksporCSV}><i className="bi bi-filetype-csv me-1"></i>CSV</button>
                      <button type="button" className="btn btn-outline-danger" onClick={eksporPDF}><i className="bi bi-file-earmark-pdf me-1"></i>PDF</button>
                    </div>
                  </div>
                </div>

                {nilaiProyek.size === 0 ? (
                  <div className="text-center text-muted py-5 border rounded">
                    <i className="bi bi-magic fs-1 d-block mb-2 opacity-50"></i>Belum ada nilai. Klik <b>Ekstrak Nilai P5</b> untuk menghitung predikat seluruh siswa.
                  </div>
                ) : (
                  <div className="table-responsive">
                    <table className="table table-bordered table-sm align-middle mb-0 small">
                      <thead className="table-light">
                        <tr>
                          <th className="text-center" style={{ width: 40 }}>No</th>
                          <th style={{ minWidth: 160 }}>Nama Siswa</th>
                          {proyek.targets.map((t, j) => (
                            <th key={t.id_target} className="text-center" style={{ minWidth: 110 }} title={`${t.dimensi}${t.elemen ? ` · ${t.elemen}` : ""}`}>
                              T{j + 1}<div className="fw-normal text-muted text-truncate" style={{ maxWidth: 140 }}>{t.dimensi}</div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {siswaNilai.length === 0 && <tr><td colSpan={proyek.targets.length + 2} className="text-center text-muted py-4">Pencarian tidak menemukan hasil.</td></tr>}
                        {siswaNilai.map((s, i) => (
                          <tr key={s.id_siswa}>
                            <td className="text-center text-muted">{i + 1}</td>
                            <td className="fw-semibold">{s.nama_siswa}</td>
                            {proyek.targets.map((t) => {
                              const n = nilaiProyek.get(`${s.id_siswa}|${t.id_target}`);
                              if (!n) return <td key={t.id_target} className="text-center text-muted">–</td>;
                              const p = PREDIKAT_MAP[n.predikat];
                              return (
                                <td key={t.id_target} className="text-center">
                                  <select className={`form-select form-select-sm fw-semibold text-bg-${p.color} border-0 mx-auto`} style={{ maxWidth: 90 }}
                                    value={n.predikat} onChange={(e) => ubahPredikat(n, e.target.value)} title={p.label}>
                                    {PREDIKAT.map((x) => <option key={x.value} value={x.value}>{x.value}</option>)}
                                  </select>
                                  <div className="text-muted" style={{ fontSize: 11 }}>skor {Number(n.skor_rata2).toFixed(1)}</div>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* MODAL PROJEK & TARGET */}
      <Modal show={!!formProyek} title={formProyek?.id_proyek ? "Edit Projek P5" : "Projek P5 Baru"} icon="bi-folder2-open" onClose={() => !savingProyek && setFormProyek(null)} footer={(
        <>
          <button type="button" className="btn btn-secondary" onClick={() => setFormProyek(null)} disabled={savingProyek}>Batal</button>
          <button type="button" className="btn btn-primary fw-semibold" onClick={simpanProyek} disabled={savingProyek}>
            {savingProyek ? <span className="spinner-border spinner-border-sm me-2"></span> : <i className="bi bi-save me-2"></i>}Simpan Projek
          </button>
        </>
      )}>
        {formProyek && (
          <>
            <div className="row g-3 mb-3">
              <div className="col-12 col-md-9">
                <label className="form-label fw-semibold small mb-1">Judul Projek *</label>
                <input type="text" className="form-control" maxLength={255} value={formProyek.judul_proyek} onChange={(e) => setFormProyek((f) => ({ ...f, judul_proyek: e.target.value }))} />
              </div>
              <div className="col-12 col-md-3">
                <label className="form-label fw-semibold small mb-1">Fase</label>
                <select className="form-select" value={formProyek.fase} onChange={(e) => setFormProyek((f) => ({ ...f, fase: e.target.value }))}>
                  <option value="">—</option>
                  {["A", "B", "C"].map((x) => <option key={x} value={x}>Fase {x}</option>)}
                </select>
              </div>
              <div className="col-12">
                <label className="form-label fw-semibold small mb-1">Deskripsi / Fokus Projek</label>
                <textarea className="form-control" rows="2" maxLength={2000} value={formProyek.deskripsi_proyek} onChange={(e) => setFormProyek((f) => ({ ...f, deskripsi_proyek: e.target.value }))}></textarea>
                <div className="form-text">Kelas: <b>{namaKelas}</b> · dipakai juga oleh AI saat menyusun catatan proses.</div>
              </div>
            </div>

            <div className="d-flex align-items-center mb-2">
              <h6 className="fw-bold mb-0 me-auto">Target Dimensi ({formProyek.targets.length})</h6>
              <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => setFormProyek((f) => ({ ...f, targets: [...f.targets, targetKosong()] }))}><i className="bi bi-plus-lg me-1"></i>Tambah Target</button>
            </div>
            <datalist id="dimensi-profil">{DIMENSI_PROFIL.map((d) => <option key={d} value={d} />)}</datalist>
            {formProyek.targets.map((t, i) => (
              <div key={t.id_target || `baru-${i}`} className="card mb-2">
                <div className="card-body py-2">
                  <div className="d-flex align-items-center mb-2">
                    <span className="badge text-bg-secondary me-2">T{i + 1}</span>
                    {!t.id_target && <span className="badge text-bg-info me-2">baru</span>}
                    <button type="button" className="btn btn-sm btn-link text-danger ms-auto p-0" disabled={formProyek.targets.length === 1}
                      onClick={() => setFormProyek((f) => ({ ...f, targets: f.targets.filter((_, j) => j !== i) }))}><i className="bi bi-x-circle me-1"></i>Hapus</button>
                  </div>
                  <div className="row g-2">
                    <div className="col-12 col-md-4">
                      <label className="form-label small mb-0">Dimensi *</label>
                      <input type="text" className="form-control form-control-sm" list="dimensi-profil" maxLength={255} value={t.dimensi} onChange={(e) => ubahTarget(i, "dimensi", e.target.value)} placeholder="Pilih atau ketik dimensi" />
                    </div>
                    <div className="col-12 col-md-4">
                      <label className="form-label small mb-0">Elemen</label>
                      <input type="text" className="form-control form-control-sm" maxLength={255} value={t.elemen} onChange={(e) => ubahTarget(i, "elemen", e.target.value)} />
                    </div>
                    <div className="col-12 col-md-4">
                      <label className="form-label small mb-0">Sub-Elemen</label>
                      <input type="text" className="form-control form-control-sm" maxLength={255} value={t.sub_elemen} onChange={(e) => ubahTarget(i, "sub_elemen", e.target.value)} />
                    </div>
                    <div className="col-12 col-md-8">
                      <label className="form-label small mb-0">Capaian Akhir Fase</label>
                      <textarea className="form-control form-control-sm" rows="1" maxLength={2000} value={t.capaian_akhir_fase} onChange={(e) => ubahTarget(i, "capaian_akhir_fase", e.target.value)}></textarea>
                    </div>
                    <div className="col-12 col-md-4">
                      <label className="form-label small mb-0">Relasi STNKM (dasar skor)</label>
                      <div className="d-flex flex-wrap gap-1">
                        {STNKM.map((s) => (
                          <Fragment key={s.key}>
                            <input type="checkbox" className="btn-check" id={`rel_${i}_${s.key}`} checked={t.relasi_stnkm.includes(s.key)} onChange={() => toggleRelasi(i, s.key)} />
                            <label className={`btn btn-sm btn-outline-${s.color}`} htmlFor={`rel_${i}_${s.key}`} title={s.label}>{s.key}</label>
                          </Fragment>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </>
        )}
      </Modal>
    </div>
  );
}
