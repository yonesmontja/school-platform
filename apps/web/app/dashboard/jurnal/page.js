"use client";
import { useState, useEffect, useCallback } from "react";
import Swal from "sweetalert2";

const API_URL = "http://localhost:8000/api";
const getToken = () => localStorage.getItem("token");

const STNKM_META = [
  { key: 'val_S', label: 'Skill', color: 'primary', icon: 'bi-tools' },
  { key: 'val_T', label: 'Teori', color: 'success', icon: 'bi-book' },
  { key: 'val_N', label: 'Nalar', color: 'info', icon: 'bi-lightbulb' },
  { key: 'val_K', label: 'Karakter', color: 'warning', icon: 'bi-heart' },
  { key: 'val_M', label: 'Minat', color: 'danger', icon: 'bi-fire' },
];

// Harus sama dengan whitelist & batas di JurnalController
const LAMPIRAN_ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";
const LAMPIRAN_MAX_MB = 5;

// Tanggal lokal (YYYY-MM-DD); toISOString() memakai UTC sehingga pagi hari di WIB/WIT masih tanggal kemarin
const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const EMPTY_AI = { val_S: 0, val_T: 0, val_N: 0, val_K: 0, val_M: 0, ai_mode: null, ai_raw_response: null };

export default function JurnalAnekdotalPage() {
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [mbks, setMbks] = useState([]);
  const [materis, setMateris] = useState([]);

  const [filterKelasFeed, setFilterKelasFeed] = useState("");
  const [journals, setJournals] = useState([]);
  const [loadingFeed, setLoadingFeed] = useState(false);

  const [formData, setFormData] = useState({
    tanggal: todayLocal(),
    id_kelas: "", id_siswa: "", id_jenis: "", id_materi: "",
    narasi_kejadian: "", mode_dampak: "PISAH",
    lampiran_base64: null,
  });
  // Mode yang dipilih guru; hasil sebenarnya (bisa fallback ke HEURISTIK) disimpan di aiResult.ai_mode
  const [aiModePilihan, setAiModePilihan] = useState("HEURISTIK");
  const [aiResult, setAiResult] = useState(EMPTY_AI);

  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filePreview, setFilePreview] = useState(null);

  const analyzed = aiResult.ai_mode !== null;

  const safeFetch = async (url, options = {}) => {
    const res = await fetch(url, { ...options, headers: { Accept: "application/json", ...options.headers } });
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

  // --- FETCH INITIAL DATA ---
  const fetchInitial = useCallback(async () => {
    try {
      const [resC, resM] = await Promise.all([
        safeFetch(`${API_URL}/classes`, { headers: authHeader() }),
        safeFetch(`${API_URL}/mbk`, { headers: authHeader() }),
      ]);
      setClasses(resC.data || []);
      setMbks(resM.data || []);
    } catch (err) { Swal.fire("Error", err.message, "error"); }
  }, []);

  useEffect(() => {
    if (!getToken()) { window.location.href = "/login"; return; }
    fetchInitial();
  }, [fetchInitial]);

  // --- FETCH SISWA & MATERI SAAT KELAS DIPILIH ---
  useEffect(() => {
    if (!formData.id_kelas) {
      setStudents([]); setMateris([]); return;
    }
    const kelas = encodeURIComponent(formData.id_kelas);
    const fetchContext = async () => {
      try {
        const [resS, resM] = await Promise.all([
          safeFetch(`${API_URL}/students?id_kelas=${kelas}`, { headers: authHeader() }),
          safeFetch(`${API_URL}/materi/by-context?id_kelas=${kelas}`, { headers: authHeader() }),
        ]);
        setStudents(resS.data || []);
        setMateris(resM.data || []);
      } catch (err) { Swal.fire("Error", err.message, "error"); }
    };
    fetchContext();
  }, [formData.id_kelas]);

  // --- FETCH FEED ---
  const fetchFeed = useCallback(async () => {
    setLoadingFeed(true);
    try {
      const params = filterKelasFeed ? `?id_kelas=${encodeURIComponent(filterKelasFeed)}` : "";
      const data = await safeFetch(`${API_URL}/jurnal${params}`, { headers: authHeader() });
      setJournals(data.data || []);
    } catch (err) { Swal.fire("Error", err.message, "error"); }
    finally { setLoadingFeed(false); }
  }, [filterKelasFeed]);

  useEffect(() => { fetchFeed(); }, [fetchFeed]);

  // --- FORM HANDLERS ---
  const handleInputChange = (field, value) => {
    if (field === "id_kelas") {
      setFormData(prev => ({ ...prev, id_kelas: value, id_siswa: "", id_materi: "" }));
      return;
    }
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleNarasiChange = (val) => {
    setFormData(prev => ({ ...prev, narasi_kejadian: val }));
    // Hasil analisis tidak berlaku lagi jika narasi diubah
    if (analyzed) setAiResult(EMPTY_AI);
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!LAMPIRAN_ACCEPT.split(",").includes(file.type)) {
      e.target.value = "";
      return Swal.fire("Format Tidak Didukung", "Lampiran harus berupa gambar (JPG/PNG/WEBP) atau PDF.", "warning");
    }
    if (file.size > LAMPIRAN_MAX_MB * 1024 * 1024) {
      e.target.value = "";
      return Swal.fire("File Terlalu Besar", `Maksimal ${LAMPIRAN_MAX_MB}MB`, "warning");
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      setFilePreview({ name: file.name, type: file.type, url: event.target.result });
      setFormData(prev => ({ ...prev, lampiran_base64: event.target.result }));
    };
    reader.readAsDataURL(file);
  };

  const clearFile = () => {
    setFilePreview(null);
    setFormData(prev => ({ ...prev, lampiran_base64: null }));
  };

  // --- ANALISIS AI ---
  const handleAnalyze = async () => {
    if (!formData.narasi_kejadian || formData.narasi_kejadian.trim().length < 10) {
      return Swal.fire("Narasi Terlalu Pendek", "Isi narasi minimal 10 karakter agar AI bisa menganalisis.", "warning");
    }
    setAnalyzing(true);
    Swal.fire({ title: "AI Menganalisis...", text: "Sedang memproses narasi Anda.", allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
      const data = await safeFetch(`${API_URL}/jurnal/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ narasi_kejadian: formData.narasi_kejadian, ai_mode: aiModePilihan }),
      });
      const ai = data.data || {};
      setAiResult({
        val_S: parseFloat(ai.S || 0),
        val_T: parseFloat(ai.T || 0),
        val_N: parseFloat(ai.N || 0),
        val_K: parseFloat(ai.K || 0),
        val_M: parseFloat(ai.M || 0),
        ai_mode: ai.mode || "HEURISTIK",
        ai_raw_response: ai.raw || null,
      });

      if (aiModePilihan === "GEMINI" && ai.mode !== "GEMINI") {
        Swal.fire("Gemini Tidak Tersedia", "Analisis memakai Heuristik Lokal. Periksa API Key & Model AI di Pengaturan Sekolah.", "info");
      } else {
        Swal.fire({ toast: true, position: "top-end", icon: "success", title: `Analisis selesai via ${ai.mode}`, showConfirmButton: false, timer: 2000 });
      }
    } catch (err) {
      Swal.fire("Analisis Gagal", err.message, "error");
    } finally { setAnalyzing(false); }
  };

  // --- SIMPAN JURNAL ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.id_siswa) return Swal.fire("Siswa Belum Dipilih", "Pilih siswa terlebih dahulu.", "warning");
    if (!formData.narasi_kejadian || formData.narasi_kejadian.trim().length < 10) {
      return Swal.fire("Narasi Terlalu Pendek", "Isi narasi minimal 10 karakter.", "warning");
    }
    if (!analyzed) {
      return Swal.fire("Belum Dianalisis", "Klik \"Analisis Narasi dengan AI\" terlebih dahulu agar poin STNKM terisi.", "warning");
    }

    setSaving(true);
    Swal.fire({ title: "Menyimpan Jurnal...", allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
      await safeFetch(`${API_URL}/jurnal/store`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ ...formData, ...aiResult }),
      });
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: "Jurnal tersimpan!", showConfirmButton: false, timer: 2000 });

      // Reset narasi & siswa untuk entri berikutnya (kelas, tanggal, materi tetap)
      setFormData(prev => ({ ...prev, id_siswa: "", narasi_kejadian: "", lampiran_base64: null }));
      setAiResult(EMPTY_AI);
      setFilePreview(null);
      fetchFeed();
    } catch (err) {
      Swal.fire("Gagal Menyimpan", err.message, "error");
    } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    const confirm = await Swal.fire({
      title: "Hapus Jurnal?", text: "Data ini akan dihapus permanen.", icon: "warning",
      showCancelButton: true, confirmButtonColor: "#d33", confirmButtonText: "Ya, Hapus!", cancelButtonText: "Batal"
    });
    if (confirm.isConfirmed) {
      try {
        await safeFetch(`${API_URL}/jurnal/${encodeURIComponent(id)}`, { method: "DELETE", headers: authHeader() });
        Swal.fire({ toast: true, position: "top-end", icon: "success", title: "Dihapus!", showConfirmButton: false, timer: 2000 });
        fetchFeed();
      } catch (err) { Swal.fire("Gagal", err.message, "error"); }
    }
  };

  const formatTanggal = (str) => {
    if (!str) return "-";
    // Parse sebagai tanggal lokal agar tidak bergeser zona waktu
    const [y, m, d] = str.slice(0, 10).split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("id-ID", { day: 'numeric', month: 'long', year: 'numeric' });
  };

  const isImage = (url) => /\.(jpg|jpeg|png|gif|webp)$/i.test(url || "");

  const getNilaiColor = (v) => {
    if (v > 0) return 'success';
    if (v < 0) return 'danger';
    return 'secondary';
  };

  const getNilaiSign = (v) => v > 0 ? `+${v}` : `${v}`;

  return (
    <div className="container-fluid mt-4 mb-5">
      <h3 className="fw-bold text-primary mb-4"><i className="bi bi-journal-text me-2"></i>Jurnal Anekdotal & Analitik STNKM</h3>

      <div className="row g-4">
        {/* KOLOM KIRI: FORM INPUT */}
        <div className="col-lg-5">
          <div className="card border-0 shadow-sm border-top border-primary border-4">
            <div className="card-body p-4">
              <h5 className="fw-bold text-secondary mb-3"><i className="bi bi-pencil-square me-2"></i>Tulis Jurnal Baru</h5>

              <form onSubmit={handleSubmit}>
                <div className="row g-2 mb-3">
                  <div className="col-6">
                    <label className="form-label fw-bold small text-muted">Tanggal *</label>
                    <input type="date" className="form-control form-control-sm" value={formData.tanggal} onChange={(e) => handleInputChange("tanggal", e.target.value)} required />
                  </div>
                  <div className="col-6">
                    <label className="form-label fw-bold small text-muted">Mode Dampak *</label>
                    <select className="form-select form-select-sm" value={formData.mode_dampak} onChange={(e) => handleInputChange("mode_dampak", e.target.value)}>
                      <option value="PISAH">Catatan (Tidak Ubah Nilai)</option>
                      <option value="BONUS">Intervensi (Ubah Nilai Rapor)</option>
                    </select>
                  </div>
                </div>

                <div className="mb-3">
                  <label className="form-label fw-bold small text-muted">Kelas *</label>
                  <select className="form-select form-select-sm" required value={formData.id_kelas} onChange={(e) => handleInputChange("id_kelas", e.target.value)}>
                    <option value="">-- Pilih Kelas --</option>
                    {classes.map(c => <option key={c.id_kelas} value={c.id_kelas}>{c.nama_kelas}</option>)}
                  </select>
                </div>

                <div className="row g-2 mb-3">
                  <div className="col-6">
                    <label className="form-label fw-bold small text-muted">Siswa *</label>
                    <select className="form-select form-select-sm" required value={formData.id_siswa} onChange={(e) => handleInputChange("id_siswa", e.target.value)} disabled={!formData.id_kelas}>
                      <option value="">{formData.id_kelas ? "-- Pilih Siswa --" : "-- Pilih Kelas Dulu --"}</option>
                      {students.map(s => <option key={s.id_siswa} value={s.id_siswa}>{s.nama_siswa}</option>)}
                    </select>
                  </div>
                  <div className="col-6">
                    <label className="form-label fw-bold small text-muted">Materi / Konteks</label>
                    <select className="form-select form-select-sm" value={formData.id_materi} onChange={(e) => handleInputChange("id_materi", e.target.value)} disabled={!formData.id_kelas}>
                      <option value="">-- Opsional --</option>
                      {materis.map(m => <option key={m.id_materi} value={m.id_materi}>{m.nama_materi}</option>)}
                    </select>
                  </div>
                </div>

                <div className="mb-3">
                  <label className="form-label fw-bold small text-muted">Jenis Penilaian (MBK)</label>
                  <select className="form-select form-select-sm" value={formData.id_jenis} onChange={(e) => handleInputChange("id_jenis", e.target.value)}>
                    <option value="">-- Opsional --</option>
                    {mbks.map(m => <option key={m.id_jenis} value={m.id_jenis}>{m.kategori_penilaian}</option>)}
                  </select>
                </div>

                <div className="mb-3">
                  <label className="form-label fw-bold small text-muted">Narasi Kejadian / Observasi *</label>
                  <textarea className="form-control bg-light" rows="4" required maxLength={2000} value={formData.narasi_kejadian}
                    onChange={(e) => handleNarasiChange(e.target.value)}
                    placeholder="Contoh: Siswa sangat jujur mengakui kesalahannya dan membantu teman yang kesulitan belajar." />
                  <small className="text-muted">{formData.narasi_kejadian.length}/2000 karakter</small>
                </div>

                <div className="mb-3">
                  <label className="form-label fw-bold small text-muted">Lampiran Bukti (Opsional)</label>
                  {!filePreview ? (
                    <>
                      <input type="file" className="form-control form-control-sm" accept={LAMPIRAN_ACCEPT} onChange={handleFileChange} />
                      <small className="text-muted">JPG, PNG, WEBP, atau PDF. Maksimal {LAMPIRAN_MAX_MB}MB.</small>
                    </>
                  ) : (
                    <div className="border rounded p-2 bg-light d-flex justify-content-between align-items-center">
                      <div className="d-flex align-items-center gap-2">
                        {filePreview.type.startsWith('image/') ? (
                          <img src={filePreview.url} alt="preview" style={{ width: '40px', height: '40px', objectFit: 'cover' }} className="rounded" />
                        ) : (
                          <i className="bi bi-file-earmark-pdf fs-4 text-danger"></i>
                        )}
                        <small className="text-truncate" style={{ maxWidth: '200px' }}>{filePreview.name}</small>
                      </div>
                      <button type="button" className="btn btn-sm btn-outline-danger" onClick={clearFile}><i className="bi bi-x"></i></button>
                    </div>
                  )}
                </div>

                {/* AI ANALYZE SECTION */}
                <div className="border-top pt-3 mb-3">
                  <h6 className="fw-bold text-secondary mb-2"><i className="bi bi-robot me-2"></i>Analisis AI</h6>
                  <div className="mb-2">
                    <select className="form-select form-select-sm" value={aiModePilihan} onChange={(e) => setAiModePilihan(e.target.value)}>
                      <option value="HEURISTIK">Heuristik Lokal (Offline)</option>
                      <option value="GEMINI">Google Gemini (AI)</option>
                    </select>
                  </div>
                  <button type="button" className="btn btn-info text-white w-100 fw-bold" onClick={handleAnalyze} disabled={analyzing}>
                    {analyzing ? (
                      <><span className="spinner-border spinner-border-sm me-2"></span>Menganalisis...</>
                    ) : (
                      <><i className="bi bi-magic me-1"></i> Analisis Narasi dengan AI</>
                    )}
                  </button>

                  {analyzed && (
                    <div className="mt-3 p-3 bg-light rounded border">
                      <div className="small fw-bold text-muted mb-2">
                        Hasil Analisis STNKM
                        <span className={`badge ms-2 ${aiResult.ai_mode === 'GEMINI' ? 'bg-info text-dark' : 'bg-secondary'}`}>{aiResult.ai_mode}</span>
                      </div>
                      <div className="d-flex flex-wrap gap-2">
                        {STNKM_META.map(m => (
                          <div key={m.key} className="text-center" style={{ minWidth: '55px' }}>
                            <span className={`badge bg-${getNilaiColor(aiResult[m.key])} d-block w-100`}>
                              {getNilaiSign(aiResult[m.key])}
                            </span>
                            <small className={`text-${m.color} fw-bold`} style={{ fontSize: '10px' }}>{m.label}</small>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <button type="submit" className="btn btn-primary w-100 fw-bold py-2 shadow-sm" disabled={saving}>
                  {saving ? (
                    <><span className="spinner-border spinner-border-sm me-2"></span>Menyimpan...</>
                  ) : (
                    <><i className="bi bi-send me-2"></i> Posting Jurnal</>
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>

        {/* KOLOM KANAN: FEED */}
        <div className="col-lg-7">
          <div className="card border-0 shadow-sm mb-3">
            <div className="card-body p-3">
              <div className="row g-2 align-items-center">
                <div className="col-md-6">
                  <h5 className="fw-bold text-secondary m-0"><i className="bi bi-clock-history me-2"></i>Linimasa Jurnal</h5>
                </div>
                <div className="col-md-6">
                  <select className="form-select form-select-sm" value={filterKelasFeed} onChange={(e) => setFilterKelasFeed(e.target.value)}>
                    <option value="">-- Semua Kelas --</option>
                    {classes.map(c => <option key={c.id_kelas} value={c.id_kelas}>{c.nama_kelas}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {loadingFeed && (
            <div className="text-center text-muted py-4">
              <span className="spinner-border spinner-border-sm me-2"></span>Memuat linimasa...
            </div>
          )}

          {!loadingFeed && journals.length === 0 && (
            <div className="card border-0 shadow-sm">
              <div className="card-body text-center py-5 text-muted">
                <i className="bi bi-inbox fs-1 d-block mb-2 opacity-50"></i>
                <p>Belum ada jurnal untuk filter ini.</p>
              </div>
            </div>
          )}

          {journals.map(j => (
            <div key={j.id_jurnal} className={`card border-0 shadow-sm mb-3 border-start border-4 border-${j.mode_dampak === 'BONUS' ? 'danger' : 'secondary'}`}>
              <div className="card-body p-3">
                <div className="d-flex gap-3">
                  <div className="rounded-circle bg-primary text-white d-flex align-items-center justify-content-center flex-shrink-0"
                       style={{ width: '45px', height: '45px', fontSize: '18px', fontWeight: 'bold' }}>
                    {(j.siswa?.nama_siswa || "?").charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-grow-1">
                    <div className="d-flex justify-content-between align-items-start">
                      <div>
                        <h6 className="fw-bold mb-0">
                          {j.siswa?.nama_siswa || j.id_siswa}
                          {j.mode_dampak === 'BONUS'
                            ? <span className="badge bg-danger ms-2"><i className="bi bi-lightning-charge-fill me-1"></i>Intervensi</span>
                            : <span className="badge bg-secondary ms-2"><i className="bi bi-eye me-1"></i>Catatan</span>
                          }
                          {j.ai_mode === 'GEMINI' && <span className="badge bg-info text-dark ms-1"><i className="bi bi-robot me-1"></i>AI</span>}
                        </h6>
                        <small className="text-muted">
                          {j.kelas?.nama_kelas || "-"} • {formatTanggal(j.tanggal)}
                          {j.materi?.nama_materi && <> • {j.materi.nama_materi}</>}
                        </small>
                      </div>
                      <button className="btn btn-sm btn-outline-danger" onClick={() => handleDelete(j.id_jurnal)} title="Hapus">
                        <i className="bi bi-trash"></i>
                      </button>
                    </div>

                    <p className="mt-2 mb-2 text-dark" style={{ whiteSpace: 'pre-wrap' }}>{j.narasi_kejadian}</p>

                    {j.lampiran_url && isImage(j.lampiran_url) && (
                      <div className="mb-2">
                        <img src={`http://localhost:8000${j.lampiran_url}`} alt="Lampiran"
                             className="rounded border" style={{ maxHeight: '250px', maxWidth: '100%' }}
                             onError={(e) => { e.target.style.display = 'none'; }} />
                      </div>
                    )}
                    {j.lampiran_url && !isImage(j.lampiran_url) && (
                      <div className="mb-2">
                        <a href={`http://localhost:8000${j.lampiran_url}`} target="_blank" rel="noreferrer" className="btn btn-sm btn-outline-secondary">
                          <i className="bi bi-paperclip me-1"></i> Lihat Lampiran
                        </a>
                      </div>
                    )}

                    <div className="d-flex flex-wrap gap-2 mt-2 pt-2 border-top">
                      <span className="small fw-bold text-muted me-1"><i className="bi bi-cpu me-1"></i>NLP:</span>
                      {STNKM_META.map(m => (
                        <span key={m.key} className={`badge bg-${getNilaiColor(j[m.key])}`} title={m.label}>
                          {getNilaiSign(j[m.key])} <small>{m.label.charAt(0)}</small>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
