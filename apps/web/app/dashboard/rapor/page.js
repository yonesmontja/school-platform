"use client";
import { useState, useEffect, useMemo, useRef, Fragment } from "react";
import Link from "next/link";
import Swal from "sweetalert2";
import { useAkses } from "@/app/lib/akses";
import { PESAN_PULIH, bacaPulih, hapusPulih, simpanPulih } from "@/app/lib/pulihHalaman";

const getToken = () => localStorage.getItem("token");
import {
  DIMENSI, FRASA_POSITIF, FRASA_BIMBINGAN, MODE_KALKULASI, JENIS_DOKUMEN, AI_MODES, PREDIKAT, CATATAN_DEFAULT, CATATAN_P5_DEFAULT, num, rata, todayYmd, tanggalPanjang, formatNomorWA, labelKelasResmi, urlTtd, mapelBerlaku, hitungRapor, susunPesanWA, RAPOR_CSS, PREVIEW_CSS, KopIdentitas, TandaTangan, HalamanBerkop, Sampul, Biodata, Akademik, RaporP5, TAMPILAN_KOKURIKULER,
} from "@/components/rapor/raporDokumen";
import { API_URL } from "@/app/lib/config";
import { eksporErapor } from "@/components/rapor/eksporErapor";

// Modal sederhana berbasis state agar tidak bergantung pada JS Bootstrap
const Modal = ({ show, title, icon, headerClass = "bg-primary text-white", size = "modal-lg", onClose, children, footer }) => {
  if (!show) return null;
  return (
    <>
      <div className="modal fade show d-block" tabIndex="-1" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className={`modal-dialog ${size} modal-dialog-centered modal-dialog-scrollable`}>
          <div className="modal-content border-0 shadow">
            <div className={`modal-header ${headerClass}`}>
              <h5 className="modal-title fw-bold"><i className={`bi ${icon} me-2`}></i>{title}</h5>
              <button type="button" className={`btn-close${headerClass.includes("text-white") ? " btn-close-white" : ""}`} onClick={onClose} aria-label="Tutup"></button>
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

export default function CetakRaporPage() {
  const { isGuru, bolehKelolaKelas } = useAkses();
  const [classes, setClasses] = useState([]);
  const [periodes, setPeriodes] = useState([]);
  const [filters, setFilters] = useState({ id_periode: "", id_kelas: "", id_siswa: "" });
  const [modeKalkulasi, setModeKalkulasi] = useState("2");
  const [jenisDokumen, setJenisDokumen] = useState("lengkap");
  const [tampilanKokurikuler, setTampilanKokurikuler] = useState("deskripsi");
  const [bobot, setBobot] = useState({ S: 1, T: 1, N: 1, K: 1, M: 1 });
  const [tanggalRapor, setTanggalRapor] = useState(todayYmd());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  // Modal Catatan Wali (AI)
  const [showCatatan, setShowCatatan] = useState(false);
  const [catatanDraft, setCatatanDraft] = useState("");
  const [aiMode, setAiMode] = useState("GEMINI");
  const [aiLoading, setAiLoading] = useState(false);
  const [simpanLoading, setSimpanLoading] = useState(false);
  const [bukaWaSetelahSimpan, setBukaWaSetelahSimpan] = useState(true);

  // Modal WhatsApp
  const [showWA, setShowWA] = useState(false);
  const [waLoading, setWaLoading] = useState(false);

  const previewRef = useRef(null);

  // Panel WhatsApp terbuka → keadaan disimpan agar pulih bila halaman dimuat ulang saat kembali (lib/pulihHalaman)
  const KUNCI_PULIH = "rapor_pulih";
  const [dipulihkan, setDipulihkan] = useState(false);
  useEffect(() => {
    const simpanan = bacaPulih(KUNCI_PULIH);
    if (simpanan?.filters?.id_siswa) {
      setFilters(simpanan.filters);
      setModeKalkulasi(simpanan.modeKalkulasi);
      setJenisDokumen(simpanan.jenisDokumen);
      setTampilanKokurikuler(simpanan.tampilanKokurikuler);
      setTanggalRapor(simpanan.tanggalRapor);
      setShowWA(true);
      setDipulihkan(true);
    }
  }, []);
  useEffect(() => {
    if (showWA && filters.id_siswa) simpanPulih(KUNCI_PULIH, { filters, modeKalkulasi, jenisDokumen, tampilanKokurikuler, tanggalRapor });
  }, [showWA, filters, modeKalkulasi, jenisDokumen, tampilanKokurikuler, tanggalRapor]);
  const tutupWA = () => {
    setShowWA(false);
    setDipulihkan(false);
    hapusPulih(KUNCI_PULIH);
  };

  // Guru hanya membuka rapor kelas binaannya (wali kelas)
  const kelasTersedia = useMemo(() => classes.filter((k) => bolehKelolaKelas(k.id_kelas)), [classes, bolehKelolaKelas]);
  useEffect(() => {
    if (isGuru && kelasTersedia.length === 1 && !filters.id_kelas) setFilters((f) => ({ ...f, id_kelas: kelasTersedia[0].id_kelas }));
  }, [isGuru, kelasTersedia]);

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
  const postJSON = (url, body) => safeFetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  useEffect(() => {
    if (!getToken()) { window.location.href = "/login"; return; }
    (async () => {
      try {
        const res = await safeFetch(`${API_URL}/nilai/filters`);
        setClasses(res.classes || []);
        setPeriodes(res.periodes || []);
        const aktif = (res.periodes || []).find((p) => p.status_aktif === "AKTIF");
        // Periode yang dipulihkan (lihat KUNCI_PULIH) tidak ditimpa periode aktif
        if (aktif) setFilters((f) => (f.id_periode ? f : { ...f, id_periode: aktif.id_periode }));
      } catch (err) { Swal.fire("Error", err.message, "error"); }
    })();
  }, []);

  // Data rapor dimuat ulang saat kelas/periode berubah; siswa yang sama tetap terpilih bila masih ada
  useEffect(() => {
    const { id_kelas, id_periode } = filters;
    if (!id_kelas || !id_periode) { setData(null); return; }
    let batal = false;
    (async () => {
      setLoading(true);
      try {
        const res = await safeFetch(`${API_URL}/rapor/data?${new URLSearchParams({ id_kelas, id_periode })}`);
        if (batal) return;
        setData(res);
        setFilters((f) => (res.students.some((s) => s.id_siswa === f.id_siswa) ? f : { ...f, id_siswa: "" }));
      } catch (err) { if (!batal) Swal.fire("Gagal Memuat Data", err.message, "error"); }
      finally { if (!batal) setLoading(false); }
    })();
    return () => { batal = true; };
  }, [filters.id_kelas, filters.id_periode]);

  const rapor = useMemo(
    () => (data && filters.id_siswa ? hitungRapor(data, filters.id_siswa, modeKalkulasi, bobot) : null),
    [data, filters.id_siswa, modeKalkulasi, bobot],
  );
  const wa = useMemo(() => (rapor ? susunPesanWA(rapor) : null), [rapor]);

  // Rekap satu kelas untuk disalin ke format nilai e-Rapor (lembar per mapel, kehadiran, kokurikuler, catatan wali)
  const handleErapor = () => {
    if (!data?.students?.length) return Swal.fire("Pilih kelas", "Pilih periode dan kelas terlebih dahulu.", "info");
    try {
      const hasil = eksporErapor({ data, modeKalkulasi, bobot });
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: `Rekap e-Rapor: ${hasil.mapel} mapel, ${hasil.siswa} siswa`, showConfirmButton: false, timer: 3000 });
    } catch (err) { Swal.fire("Gagal ekspor", err.message, "error"); }
  };

  // Urutan halaman sesuai jenis dokumen; halaman terakhir tanpa pemisah agar tidak ada kertas kosong
  const halaman = useMemo(() => {
    if (!rapor) return [];
    const list = [];
    if (jenisDokumen === "lengkap") list.push({ key: "sampul", jenis: "sampul" }, { key: "biodata", jenis: "biodata" });
    if (jenisDokumen !== "p5") list.push({ key: "akademik", jenis: "akademik" });
    if (jenisDokumen !== "akademik") rapor.proyek.forEach((p, i) => list.push({ key: p.id_proyek, jenis: "p5", proyek: p, urutan: i + 1 }));
    return list;
  }, [rapor, jenisDokumen]);

  const siswaList = data?.students || [];
  const idxSiswa = siswaList.findIndex((s) => s.id_siswa === filters.id_siswa);
  const pindahSiswa = (arah) => {
    const next = siswaList[idxSiswa + arah];
    if (next) setFilters((f) => ({ ...f, id_siswa: next.id_siswa }));
  };

  const butuhSiswa = () => {
    if (rapor) return true;
    Swal.fire("Pilih Siswa Dulu", "Pilih Periode, Kelas, dan Peserta Didik terlebih dahulu.", "warning");
    return false;
  };

  // --- CETAK (jendela cetak bawaan browser → Simpan sebagai PDF) ---
  const handleCetak = () => {
    if (!butuhSiswa()) return;
    if (halaman.length === 0) return Swal.fire("Tidak Ada Halaman", "Kelas ini belum memiliki kegiatan kokurikuler untuk dicetak.", "info");
    const win = window.open("", "_blank", "width=1024,height=768");
    if (!win) return Swal.fire("Pop-up Diblokir", "Izinkan pop-up untuk situs ini agar jendela cetak bisa dibuka.", "warning");
    const judul = `Rapor_${jenisDokumen}_${rapor.siswa.nama_siswa}`.replace(/[^\w\-]+/g, "_");
    win.document.write(`<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><title>${judul}</title><style>
      @page { size: A4 portrait; margin: 15mm; }
      * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      body { margin: 0; }
      ${RAPOR_CSS}
    </style></head><body>${previewRef.current.innerHTML}</body></html>`);
    win.document.close();
    win.focus();
    // Beri waktu gambar tanda tangan termuat sebelum dialog cetak muncul
    setTimeout(() => { win.print(); win.close(); }, 800);
  };

  // --- CATATAN WALI KELAS ---
  const bukaCatatan = () => {
    if (!butuhSiswa()) return;
    setCatatanDraft(rapor.catatanTersimpan ? rapor.catatan : "");
    setShowCatatan(true);
  };

  const generateCatatan = async () => {
    setAiLoading(true);
    try {
      const res = await postJSON(`${API_URL}/rapor/catatan-wali/generate`, { id_siswa: filters.id_siswa, ai_mode: aiMode });
      setCatatanDraft(res.data);
      const pakaiLokal = res.mode === "LOKAL" && aiMode !== "LOKAL";
      Swal.fire({
        toast: true, position: "top-end", showConfirmButton: false, timer: pakaiLokal ? 4500 : 2500,
        icon: pakaiLokal ? "warning" : "success",
        title: pakaiLokal ? "AI tidak tersedia (key kosong/gagal atau belum ada jurnal). Narasi disusun secara lokal." : "Narasi selesai disusun.",
      });
    } catch (err) { Swal.fire("Gagal", err.message, "error"); }
    finally { setAiLoading(false); }
  };

  const simpanCatatan = async () => {
    const teks = catatanDraft.trim();
    if (!teks) return Swal.fire("Perhatian", "Catatan tidak boleh kosong.", "warning");
    setSimpanLoading(true);
    try {
      const res = await postJSON(`${API_URL}/rapor/catatan-wali`, { id_siswa: filters.id_siswa, id_periode: filters.id_periode, catatan_final: teks });
      setData((d) => ({ ...d, catatan_wali: [...d.catatan_wali.filter((c) => c.id_siswa !== filters.id_siswa), res.data] }));
      setShowCatatan(false);
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: "Catatan tersimpan!", showConfirmButton: false, timer: 2000 });
      if (bukaWaSetelahSimpan) setShowWA(true);
    } catch (err) { Swal.fire("Gagal Menyimpan", err.message, "error"); }
    finally { setSimpanLoading(false); }
  };

  // --- WHATSAPP ---
  const bukaWA = () => { if (butuhSiswa()) setShowWA(true); };
  const bukaChat = (nomor, teks) => {
    const url = nomor ? `https://wa.me/${nomor}?text=${encodeURIComponent(teks)}` : `https://api.whatsapp.com/send?text=${encodeURIComponent(teks)}`;
    window.open(url, "_blank", "noopener");
  };
  const salin = async (teks) => {
    try {
      await navigator.clipboard.writeText(teks);
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: "Ringkasan rapor disalin!", showConfirmButton: false, timer: 2000 });
    } catch (e) { Swal.fire("Gagal Menyalin", "Browser menolak akses clipboard.", "error"); }
  };
  const kirimOtomatis = async () => {
    const antrean = [
      wa.nomorOrtu && { target: wa.nomorOrtu, message: wa.pesanOrtu },
      wa.idGrup && { target: wa.idGrup, message: wa.pesanGrup },
      wa.nomorKepsek && { target: wa.nomorKepsek, message: wa.pesanGrup },
    ].filter(Boolean);
    if (antrean.length === 0) {
      return Swal.fire("Tujuan Kosong", "Nomor WA orang tua, nomor Kepsek, dan ID grup guru belum diisi. Lengkapi di Master Siswa/Ortu dan Pengaturan Sekolah, atau gunakan tombol WA manual.", "warning");
    }
    setWaLoading(true);
    try {
      const res = await postJSON(`${API_URL}/whatsapp`, { daftar_pesan: antrean });
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: `${res.count} pesan terkirim otomatis via API!`, showConfirmButton: false, timer: 3000 });
    } catch (err) { Swal.fire("Belum Terkirim", err.message, "warning"); }
    finally { setWaLoading(false); }
  };

  const waApiAktif = !!data?.settings?.status_wa_api && !!data?.settings?.has_wa_api_token;

  return (
    <div className="container-fluid mb-5">
      <style>{RAPOR_CSS + PREVIEW_CSS}</style>

      {/* HEADER HALAMAN */}
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <div>
          <h3 className="fw-bold text-primary mb-0"><i className="bi bi-file-earmark-richtext me-2"></i>Pusat Cetak &amp; Distribusi Rapor</h3>
          <small className="text-muted">Pratinjau, cetak PDF, catatan wali kelas berbasis AI, dan kirim ringkasan ke WhatsApp</small>
        </div>
        <ol className="breadcrumb mb-0 small">
          <li className="breadcrumb-item"><Link href="/dashboard">Dashboard</Link></li>
          <li className="breadcrumb-item">Laporan</li>
          <li className="breadcrumb-item active" aria-current="page">Cetak Rapor</li>
        </ol>
      </div>

      {/* PANEL KONTROL */}
      <div className="card card-outline card-primary shadow-sm mb-3">
        <div className="card-header d-flex flex-wrap align-items-center gap-2">
          <h3 className="card-title fw-semibold mb-0 me-auto"><i className="bi bi-sliders me-2"></i>Parameter Rapor</h3>
          <div className="btn-group btn-group-sm">
            <button type="button" className="btn btn-warning fw-semibold" onClick={bukaCatatan} title="Catatan Wali Kelas (AI)">
              <i className="bi bi-magic me-1"></i><span className="d-none d-sm-inline">Catatan Wali</span>
            </button>
            <button type="button" className="btn btn-success fw-semibold" onClick={bukaWA} title="Kirim ringkasan ke WhatsApp">
              <i className="bi bi-whatsapp me-1"></i><span className="d-none d-sm-inline">WhatsApp</span>
            </button>
            <button type="button" className="btn btn-primary fw-semibold" onClick={handleErapor} disabled={!data?.students?.length} title="Unduh rekap nilai satu kelas untuk diisikan ke e-Rapor">
              <i className="bi bi-file-earmark-spreadsheet me-1"></i><span className="d-none d-sm-inline">e-Rapor</span>
            </button>
            <button type="button" className="btn btn-danger fw-semibold" onClick={handleCetak} title="Cetak / simpan PDF">
              <i className="bi bi-file-earmark-pdf me-1"></i><span className="d-none d-sm-inline">Cetak PDF</span>
            </button>
          </div>
        </div>
        <div className="card-body">
          <div className="row g-3">
            <div className="col-12 col-sm-6 col-lg-3">
              <label className="form-label fw-semibold small mb-1">Periode</label>
              <select className="form-select" value={filters.id_periode} onChange={(e) => setFilters((f) => ({ ...f, id_periode: e.target.value }))}>
                <option value="">— Pilih Periode —</option>
                {periodes.map((p) => <option key={p.id_periode} value={p.id_periode}>{p.tahun_ajaran} ({p.semester}){p.status_aktif === "AKTIF" ? " • Aktif" : ""}</option>)}
              </select>
            </div>
            <div className="col-12 col-sm-6 col-lg-3">
              <label className="form-label fw-semibold small mb-1">Kelas</label>
              <select className="form-select" value={filters.id_kelas} onChange={(e) => setFilters((f) => ({ ...f, id_kelas: e.target.value }))}>
                <option value="">— Pilih Kelas —</option>
                {kelasTersedia.map((k) => <option key={k.id_kelas} value={k.id_kelas}>{k.nama_kelas}</option>)}
              </select>
              {isGuru && classes.length > 0 && kelasTersedia.length === 0 && <div className="form-text text-danger">Anda belum menjadi wali kelas mana pun.</div>}
            </div>
            <div className="col-12 col-lg-6">
              <label className="form-label fw-semibold small mb-1">Peserta Didik</label>
              <div className="input-group">
                <button type="button" className="btn btn-outline-secondary" disabled={idxSiswa <= 0} onClick={() => pindahSiswa(-1)} title="Siswa sebelumnya"><i className="bi bi-chevron-left"></i></button>
                <select className="form-select" value={filters.id_siswa} disabled={!data} onChange={(e) => setFilters((f) => ({ ...f, id_siswa: e.target.value }))}>
                  <option value="">{data ? "— Pilih Peserta Didik —" : "— Pilih Kelas Dulu —"}</option>
                  {siswaList.map((s, i) => <option key={s.id_siswa} value={s.id_siswa}>{i + 1}. {s.nama_siswa}</option>)}
                </select>
                <button type="button" className="btn btn-outline-secondary" disabled={idxSiswa < 0 || idxSiswa >= siswaList.length - 1} onClick={() => pindahSiswa(1)} title="Siswa berikutnya"><i className="bi bi-chevron-right"></i></button>
              </div>
            </div>
            <div className="col-12 col-sm-6 col-lg-4">
              <label className="form-label fw-semibold small mb-1">Kalkulasi Akademik</label>
              <select className="form-select" value={modeKalkulasi} onChange={(e) => setModeKalkulasi(e.target.value)}>
                {MODE_KALKULASI.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
              <small className="text-muted">{MODE_KALKULASI.find((m) => m.value === modeKalkulasi)?.info}</small>
            </div>
            <div className="col-12 col-sm-6 col-lg-4">
              <label className="form-label fw-semibold small mb-1">Jenis Dokumen</label>
              <select className="form-select" value={jenisDokumen} onChange={(e) => setJenisDokumen(e.target.value)}>
                {JENIS_DOKUMEN.map((j) => <option key={j.value} value={j.value}>{j.label}</option>)}
              </select>
            </div>
            {jenisDokumen !== "akademik" && (
              <div className="col-12 col-sm-6 col-lg-4">
                <label className="form-label fw-semibold small mb-1">Tampilan Kokurikuler</label>
                <select className="form-select" value={tampilanKokurikuler} onChange={(e) => setTampilanKokurikuler(e.target.value)}>
                  {TAMPILAN_KOKURIKULER.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            )}
            <div className="col-12 col-sm-6 col-lg-4">
              <label className="form-label fw-semibold small mb-1">Tanggal Rapor</label>
              <input type="date" className="form-control" value={tanggalRapor} onChange={(e) => e.target.value && setTanggalRapor(e.target.value)} />
            </div>

            {modeKalkulasi === "3" && (
              <div className="col-12">
                <div className="alert alert-warning mb-0 py-2">
                  <div className="fw-semibold small mb-2"><i className="bi bi-sliders me-1"></i>Bobot Penentu Nilai Akhir (0.0 – 1.0)</div>
                  <div className="d-flex flex-wrap gap-2">
                    {DIMENSI.map((d) => (
                      <div key={d.key} className="input-group input-group-sm" style={{ width: 140 }}>
                        <span className={`input-group-text fw-bold text-${d.color}`}>{d.label}</span>
                        <input type="number" className="form-control" min="0" max="1" step="0.1" value={bobot[d.key]}
                          onChange={(e) => setBobot((b) => ({ ...b, [d.key]: Math.min(1, Math.max(0, parseFloat(e.target.value) || 0)) }))} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* RINGKASAN SISWA */}
      {rapor && (
        <div className="row g-3 mb-3">
          <div className="col-6 col-xl-3">
            <div className="info-box shadow-sm mb-0 h-100">
              <span className="info-box-icon text-bg-primary shadow-sm"><i className="bi bi-mortarboard"></i></span>
              <div className="info-box-content">
                <span className="info-box-text small">Rata-rata Akademik</span>
                <span className="info-box-number fs-5">{rapor.rataUmum}</span>
                <small className="text-muted text-truncate">{rapor.mapelRows.filter((m) => m.nilai !== null).length} dari {rapor.mapelRows.length} mapel bernilai</small>
              </div>
            </div>
          </div>
          <div className="col-6 col-xl-3">
            <div className="info-box shadow-sm mb-0 h-100">
              <span className="info-box-icon text-bg-success shadow-sm"><i className="bi bi-bullseye"></i></span>
              <div className="info-box-content">
                <span className="info-box-text small">Indeks STNKM</span>
                <span className="small fw-semibold">{DIMENSI.map((d) => `${d.key}:${rapor.poinSTNKM[d.key]}`).join(" ")}</span>
                <small className="text-muted">Bonus jurnal: {rapor.bonusJurnal.toFixed(1)}</small>
              </div>
            </div>
          </div>
          <div className="col-6 col-xl-3">
            <div className="info-box shadow-sm mb-0 h-100">
              <span className="info-box-icon text-bg-warning shadow-sm"><i className="bi bi-calendar-x"></i></span>
              <div className="info-box-content">
                <span className="info-box-text small">Ketidakhadiran</span>
                <span className="info-box-number fs-6">S {rapor.presensi.sakit} · I {rapor.presensi.izin} · A {rapor.presensi.alpa}</span>
                <small className="text-muted">{data.presensi.length ? "Dari data presensi" : "Belum ada data presensi"}</small>
              </div>
            </div>
          </div>
          <div className="col-6 col-xl-3">
            <div className="info-box shadow-sm mb-0 h-100">
              <span className={`info-box-icon shadow-sm ${rapor.catatanTersimpan ? "text-bg-info" : "text-bg-secondary"}`}><i className="bi bi-chat-quote"></i></span>
              <div className="info-box-content">
                <span className="info-box-text small">Catatan Wali</span>
                <span className="info-box-number fs-6">{rapor.catatanTersimpan ? "Tersimpan" : "Otomatis"}</span>
                <button type="button" className="btn btn-link btn-sm p-0 text-start" onClick={bukaCatatan}>{rapor.catatanTersimpan ? "Ubah catatan" : "Susun dengan AI"}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PRATINJAU */}
      {!filters.id_kelas || !filters.id_periode || !filters.id_siswa ? (
        <div className="card shadow-sm"><div className="card-body text-center py-5 text-muted">
          <i className="bi bi-book display-5 text-primary opacity-50"></i>
          <h5 className="fw-semibold mt-3">Pilih Periode, Kelas, dan Peserta Didik untuk menampilkan pratinjau rapor</h5>
          {loading && <div className="spinner-border spinner-border-sm text-primary mt-2"></div>}
        </div></div>
      ) : loading || !rapor ? (
        <div className="card shadow-sm"><div className="card-body text-center py-5 text-muted">
          <div className="spinner-border text-primary mb-2"></div><div>Menyiapkan dokumen rapor...</div>
        </div></div>
      ) : (
        <div className="card shadow-sm">
          <div className="card-header d-flex flex-wrap align-items-center gap-2">
            <h3 className="card-title fw-semibold mb-0 me-auto"><i className="bi bi-eye me-2"></i>Pratinjau A4 · {halaman.length} halaman</h3>
            {jenisDokumen !== "akademik" && rapor.proyek.length === 0 && (
              <span className="badge text-bg-light border text-wrap"><i className="bi bi-info-circle me-1"></i>Belum ada kegiatan kokurikuler untuk kelas & periode ini</span>
            )}
          </div>
          <div className="card-body bg-body-secondary">
            <div className="rapor-preview" ref={previewRef}>
              {halaman.map((h, i) => {
                const pecah = i < halaman.length - 1;
                if (h.jenis === "sampul") return <Sampul key={h.key} r={rapor} pecah={pecah} />;
                if (h.jenis === "biodata") return <Biodata key={h.key} r={rapor} tanggal={tanggalRapor} pecah={pecah} />;
                if (h.jenis === "akademik") return <Akademik key={h.key} r={rapor} tanggal={tanggalRapor} pecah={pecah} />;
                return <RaporP5 key={h.key} r={rapor} proyek={h.proyek} urutan={h.urutan} tanggal={tanggalRapor} pecah={pecah} tampilan={tampilanKokurikuler} />;
              })}
              {halaman.length === 0 && <div className="text-center text-muted py-5">Tidak ada halaman untuk jenis dokumen ini.</div>}
            </div>
          </div>
        </div>
      )}

      {/* MODAL CATATAN WALI KELAS */}
      <Modal show={showCatatan} title="Sintesis Catatan Wali Kelas (AI)" icon="bi-robot" onClose={() => setShowCatatan(false)} footer={(
        <>
          <button type="button" className="btn btn-secondary" onClick={() => setShowCatatan(false)}>Tutup</button>
          <button type="button" className="btn btn-success fw-semibold" onClick={simpanCatatan} disabled={simpanLoading || aiLoading}>
            {simpanLoading ? <span className="spinner-border spinner-border-sm me-2"></span> : <i className="bi bi-save me-2"></i>}Simpan Catatan Final
          </button>
        </>
      )}>
        <div className="alert alert-info small py-2"><i className="bi bi-info-circle me-1"></i>AI merangkum jurnal observasi siswa menjadi paragraf catatan rapor yang baku dan apresiatif. Hasilnya bisa diedit sebelum disimpan.</div>
        <div className="mb-3 p-2 px-3 bg-body rounded border">
          <label className="fw-semibold small d-block mb-1">Mesin AI:</label>
          <div className="d-flex flex-wrap gap-3">
            {AI_MODES.map((m) => (
              <div key={m.value} className="form-check">
                <input className="form-check-input" type="radio" name="ai_mode" id={`ai_${m.value}`} value={m.value} checked={aiMode === m.value} onChange={() => setAiMode(m.value)} />
                <label className="form-check-label small fw-semibold" htmlFor={`ai_${m.value}`}>{m.label}</label>
              </div>
            ))}
          </div>
        </div>
        <label className="fw-semibold text-primary mb-2">Evaluasi Siswa: <span className="text-body">{rapor?.siswa.nama_siswa}</span></label>
        <textarea className="form-control mb-3" rows="5" value={catatanDraft} disabled={aiLoading} maxLength={2000}
          onChange={(e) => setCatatanDraft(e.target.value)} placeholder="Catatan akhir rapor akan muncul di sini..."></textarea>
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
          <button type="button" className="btn btn-outline-primary fw-semibold" onClick={generateCatatan} disabled={aiLoading}>
            {aiLoading ? <><span className="spinner-border spinner-border-sm me-2"></span>AI sedang merangkai kalimat...</> : <><i className="bi bi-magic me-2"></i>Generate Narasi via AI</>}
          </button>
          <div className="form-check form-switch m-0">
            <input className="form-check-input" type="checkbox" id="buka_wa" checked={bukaWaSetelahSimpan} onChange={(e) => setBukaWaSetelahSimpan(e.target.checked)} />
            <label className="form-check-label small fw-semibold text-success" htmlFor="buka_wa"><i className="bi bi-whatsapp me-1"></i>Buka panel WA setelah simpan</label>
          </div>
        </div>
      </Modal>

      {/* MODAL WHATSAPP */}
      <Modal show={showWA && !!wa} title="Distribusi Ringkasan Rapor (WA)" icon="bi-whatsapp" headerClass="bg-success text-white" onClose={tutupWA}
        footer={<button type="button" className="btn btn-success" onClick={tutupWA}>Selesai &amp; Tutup</button>}>
        {wa && (
          <>
            {dipulihkan && (
              <div className="alert alert-info small py-2"><i className="bi bi-arrow-counterclockwise me-1"></i>{PESAN_PULIH}</div>
            )}
            <div className="alert alert-secondary small py-2">
              <i className="bi bi-whatsapp text-success me-1"></i>Ringkasan berisi nilai mapel, indeks STNKM, kehadiran, dan Catatan Wali Kelas.
            </div>
            <div className="fw-bold text-primary mb-3"><i className="bi bi-person-badge me-1"></i>{rapor.siswa.nama_siswa} ({labelKelasResmi(rapor.kelas.nama_kelas || "-")})</div>

            <label className="fw-semibold small text-muted mb-1">1. Orang Tua / Wali {wa.nomorOrtu ? `(${wa.nomorOrtu})` : "(nomor belum diisi — pilih kontak di WA)"}</label>
            <div className="d-flex gap-2 mb-3">
              <button type="button" className="btn btn-success btn-sm flex-grow-1 fw-semibold" onClick={() => bukaChat(wa.nomorOrtu, wa.pesanOrtu)}><i className="bi bi-whatsapp me-1"></i>Chat WA Orang Tua / Wali</button>
              <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => salin(wa.pesanOrtu)}><i className="bi bi-clipboard me-1"></i>Salin</button>
            </div>

            <label className="fw-semibold small text-muted mb-1">2. Kepala Sekolah / Grup Guru {wa.nomorKepsek ? `(Kepsek ${wa.nomorKepsek})` : ""}</label>
            <div className="d-flex gap-2 mb-3">
              <button type="button" className="btn btn-primary btn-sm flex-grow-1 fw-semibold" onClick={() => bukaChat(wa.nomorKepsek, wa.pesanGrup)}><i className="bi bi-whatsapp me-1"></i>WA Kepsek / Grup</button>
              <button type="button" className="btn btn-outline-primary btn-sm" onClick={() => salin(wa.pesanGrup)}><i className="bi bi-clipboard me-1"></i>Salin Teks Grup</button>
            </div>

            <details className="mb-3">
              <summary className="small text-muted">Lihat isi pesan untuk orang tua</summary>
              <pre className="small bg-body border rounded p-2 mt-2 mb-0" style={{ whiteSpace: "pre-wrap" }}>{wa.pesanOrtu}</pre>
            </details>

            <div className="border-top pt-3">
              <button type="button" className="btn btn-dark btn-sm w-100 fw-semibold" onClick={kirimOtomatis} disabled={waLoading || !waApiAktif}>
                {waLoading ? <span className="spinner-border spinner-border-sm me-2"></span> : <i className="bi bi-robot me-1"></i>}Kirim Otomatis via API Gateway (Fonnte)
              </button>
              {!waApiAktif && (
                <small className="text-muted d-block mt-1">
                  <i className="bi bi-info-circle me-1"></i>Kirim otomatis belum aktif. Isi token Fonnte dan nyalakan di <Link href="/dashboard/pengaturan">Pengaturan Sekolah</Link>.
                </small>
              )}
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
