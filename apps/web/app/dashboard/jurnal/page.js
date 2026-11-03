"use client";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Swal from "sweetalert2";
import { useAkses } from "@/app/lib/akses";
import * as XLSX from "xlsx";
import { generateProfessionalPDF } from "@/utils/pdfExport";
import { API_ORIGIN, API_URL } from "@/app/lib/config";

const getToken = () => localStorage.getItem("token");

const STNKM_META = [
  { key: "val_S", short: "S", label: "Skill" },
  { key: "val_T", short: "T", label: "Teori" },
  { key: "val_N", short: "N", label: "Nalar" },
  { key: "val_K", short: "K", label: "Karakter" },
  { key: "val_M", short: "M", label: "Minat" },
];

// Harus sama dengan whitelist & batas di JurnalController
const LAMPIRAN_ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";
const LAMPIRAN_MAX_MB = 5;

// Harus sama dengan JurnalAIService::MODES di backend
const AI_MODES = [
  { value: "HEURISTIK", label: "Heuristik Lokal", desc: "Cepat, offline", icon: "bi-cpu" },
  { value: "GEMINI", label: "Google Gemini", desc: "Akurat, cloud", icon: "bi-google" },
  { value: "CLAUDE", label: "Anthropic Claude", desc: "Cermat memahami konteks", icon: "bi-robot" },
  { value: "QWEN", label: "Qwen (OpenRouter)", desc: "Alternatif hemat", icon: "bi-stars" },
  { value: "DEEPSEEK", label: "DeepSeek", desc: "Kuat bernalar", icon: "bi-lightning-charge" },
  { value: "OPENKEY", label: "OpenKey", desc: "Endpoint kustom", icon: "bi-key" },
];

const ROWS_PER_PAGE = 10;

// Tanggal lokal (YYYY-MM-DD); toISOString() memakai UTC sehingga pagi hari di WIB/WIT masih tanggal kemarin
const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const emptyForm = () => ({
  tanggal: todayLocal(),
  id_kelas: "", id_siswa: "", id_guru: "",
  konteks: "KBM", id_materi: "", id_jenis: "",
  narasi_kejadian: "", mode_dampak: "PISAH",
  lampiran_base64: null,
});

const EMPTY_AI = { val_S: 0, val_T: 0, val_N: 0, val_K: 0, val_M: 0, ai_mode: null, ai_raw_response: null };

const escapeHtml = (str) =>
  String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const formatTanggal = (str) => {
  if (!str) return "-";
  // Parse sebagai tanggal lokal agar tidak bergeser zona waktu
  const [y, m, d] = str.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
};

const num = (v) => parseFloat(v) || 0;
const totalStnkm = (j) => STNKM_META.reduce((sum, m) => sum + num(j[m.key]), 0);
const getNilaiColor = (v) => (num(v) > 0 ? "success" : num(v) < 0 ? "danger" : "secondary");
const getNilaiSign = (v) => (num(v) > 0 ? `+${num(v)}` : `${num(v)}`);
const isImage = (url) => /\.(jpg|jpeg|png|gif|webp)$/i.test(url || "");
const perluPembinaan = (j) => num(j.val_K) <= -2 || totalStnkm(j) < 0;

// Nomor WA ke format 628xxx
const normalisasiNomorWA = (nomor) => {
  let clean = String(nomor || "").replace(/[^0-9]/g, "");
  if (clean.startsWith("08")) clean = "62" + clean.substring(1);
  else if (clean.startsWith("8")) clean = "62" + clean;
  return clean;
};

// --- KOMPONEN KECIL ---
const StnkmBadges = ({ j }) => (
  <div className="d-flex flex-wrap gap-1">
    {STNKM_META.map((m) => (
      <span key={m.key} className={`badge text-bg-${getNilaiColor(j[m.key])}`} title={m.label}>
        {m.short} {getNilaiSign(j[m.key])}
      </span>
    ))}
  </div>
);

const InfoBox = ({ icon, color, label, value }) => (
  <div className="col-6 col-md-3">
    <div className="info-box shadow-sm mb-0 h-100">
      <span className={`info-box-icon text-bg-${color} shadow-sm`}><i className={`bi ${icon}`}></i></span>
      <div className="info-box-content">
        <span className="info-box-text small text-truncate">{label}</span>
        <span className="info-box-number fs-5">{value}</span>
      </div>
    </div>
  </div>
);

export default function JurnalAnekdotalPage() {
  // --- DATA REFERENSI ---
  const [classes, setClasses] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [mbks, setMbks] = useState([]);
  const [students, setStudents] = useState([]);
  const [materis, setMateris] = useState([]);
  const [settings, setSettings] = useState(null);
  const [userName, setUserName] = useState("");
  // Guru mencatat atas namanya sendiri dan hanya mengubah/menghapus jurnal miliknya
  const { isGuru, idGuru, milikSendiri } = useAkses();

  // --- LINIMASA & TABEL ---
  const [filterKelasFeed, setFilterKelasFeed] = useState("");
  const [journals, setJournals] = useState([]);
  const [loadingFeed, setLoadingFeed] = useState(false);
  const [activeTab, setActiveTab] = useState("linimasa");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortCol, setSortCol] = useState("tanggal");
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(1);

  // --- FORM ---
  const [formData, setFormData] = useState(emptyForm);
  // Mode yang dipilih guru; hasil sebenarnya (bisa fallback ke HEURISTIK) disimpan di aiResult.ai_mode
  const [aiModePilihan, setAiModePilihan] = useState("HEURISTIK");
  const [aiResult, setAiResult] = useState(EMPTY_AI);
  // Narasi yang terakhir dianalisis; jika narasi atau mesin AI berubah, analisis diulang saat posting
  const [narasiTeranalisis, setNarasiTeranalisis] = useState(null);
  const [showOpsi, setShowOpsi] = useState(false);
  const [kirimWaOrtu, setKirimWaOrtu] = useState(true);
  const [kirimWaGrup, setKirimWaGrup] = useState(true);
  const [editId, setEditId] = useState(null);
  const [lampiranLama, setLampiranLama] = useState(null);
  const [hapusLampiran, setHapusLampiran] = useState(false);
  const [filePreview, setFilePreview] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const formTopRef = useRef(null);
  const fileInputRef = useRef(null);

  const analyzed = aiResult.ai_mode !== null && narasiTeranalisis === formData.narasi_kejadian;

  const safeFetch = async (url, options = {}) => {
    const res = await fetch(url, { ...options, headers: { Accept: "application/json", ...options.headers } });
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

  // --- FETCH DATA REFERENSI ---
  const fetchInitial = useCallback(async () => {
    try {
      const [resC, resM, resT, resS] = await Promise.all([
        safeFetch(`${API_URL}/classes`, { headers: authHeader() }),
        safeFetch(`${API_URL}/mbk`, { headers: authHeader() }),
        safeFetch(`${API_URL}/teachers`, { headers: authHeader() }),
        safeFetch(`${API_URL}/settings`, { headers: authHeader() }),
      ]);
      setClasses(resC.data || []);
      setMbks(resM.data || []);
      setTeachers(resT.data || []);
      setSettings(resS || null);
    } catch (err) { Swal.fire("Error", err.message, "error"); }
  }, []);

  useEffect(() => {
    if (!getToken()) { window.location.href = "/login"; return; }
    try { setUserName(JSON.parse(localStorage.getItem("user") || "{}")?.name || ""); } catch (e) { /* abaikan */ }
    fetchInitial();
  }, [fetchInitial]);

  useEffect(() => {
    if (isGuru && idGuru) setFormData((f) => (f.id_guru === idGuru ? f : { ...f, id_guru: idGuru }));
  }, [isGuru, idGuru, editId]);

  // --- SISWA & MATERI SAAT KELAS DIPILIH ---
  useEffect(() => {
    if (!formData.id_kelas) { setStudents([]); setMateris([]); return; }
    const kelas = encodeURIComponent(formData.id_kelas);
    (async () => {
      try {
        const [resS, resM] = await Promise.all([
          safeFetch(`${API_URL}/students?id_kelas=${kelas}`, { headers: authHeader() }),
          safeFetch(`${API_URL}/materi/by-context?id_kelas=${kelas}`, { headers: authHeader() }),
        ]);
        setStudents(resS.data || []);
        setMateris(resM.data || []);
      } catch (err) { Swal.fire("Error", err.message, "error"); }
    })();
  }, [formData.id_kelas]);

  // --- FEED ---
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

  // --- PENCARIAN, SORTIR, PAGINASI ---
  const filteredJournals = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return journals;
    return journals.filter((j) =>
      [j.siswa?.nama_siswa, j.narasi_kejadian, j.tanggal, j.materi?.nama_materi, j.jenis?.kategori_penilaian, j.guru?.nama_guru]
        .some((v) => String(v || "").toLowerCase().includes(q))
    );
  }, [journals, searchQuery]);

  const sortedJournals = useMemo(() => {
    const getVal = (j) => {
      switch (sortCol) {
        case "siswa": return (j.siswa?.nama_siswa || "").toLowerCase();
        case "narasi": return (j.narasi_kejadian || "").toLowerCase();
        case "dampak": return j.mode_dampak || "";
        case "total": return totalStnkm(j);
        default: return `${j.tanggal || ""} ${j.created_at || ""}`;
      }
    };
    return [...filteredJournals].sort((a, b) => {
      const va = getVal(a), vb = getVal(b);
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });
  }, [filteredJournals, sortCol, sortAsc]);

  const totalPages = Math.max(1, Math.ceil(sortedJournals.length / ROWS_PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = sortedJournals.slice((currentPage - 1) * ROWS_PER_PAGE, currentPage * ROWS_PER_PAGE);

  useEffect(() => { setPage(1); }, [searchQuery, filterKelasFeed]);

  const handleSort = (col) => {
    if (sortCol === col) setSortAsc(!sortAsc);
    else { setSortCol(col); setSortAsc(col !== "tanggal" && col !== "total"); }
  };

  const ringkasan = useMemo(() => ({
    total: filteredJournals.length,
    apresiasi: filteredJournals.filter((j) => !perluPembinaan(j) && totalStnkm(j) > 0).length,
    pembinaan: filteredJournals.filter(perluPembinaan).length,
    intervensi: filteredJournals.filter((j) => j.mode_dampak === "BONUS").length,
  }), [filteredJournals]);

  // --- FORM HANDLERS ---
  const handleInputChange = (field, value) => {
    if (field === "id_kelas") {
      setFormData((prev) => ({ ...prev, id_kelas: value, id_siswa: "", id_materi: "" }));
      return;
    }
    if (field === "konteks") {
      setFormData((prev) => ({ ...prev, konteks: value, id_materi: "", id_jenis: "" }));
      return;
    }
    setFormData((prev) => ({ ...prev, [field]: value }));
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
      setFormData((prev) => ({ ...prev, lampiran_base64: event.target.result }));
    };
    reader.readAsDataURL(file);
  };

  const clearFile = () => {
    setFilePreview(null);
    setFormData((prev) => ({ ...prev, lampiran_base64: null }));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const resetForm = () => {
    // Kelas, tanggal, konteks, dan guru tetap untuk entri berikutnya
    setFormData((prev) => ({ ...emptyForm(), tanggal: prev.tanggal, id_kelas: prev.id_kelas, id_guru: prev.id_guru, konteks: prev.konteks }));
    setAiResult(EMPTY_AI);
    setNarasiTeranalisis(null);
    setEditId(null);
    setLampiranLama(null);
    setHapusLampiran(false);
    setFilePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // --- ANALISIS AI ---
  const runAnalysis = async (narasi) => {
    const data = await safeFetch(`${API_URL}/jurnal/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify({ narasi_kejadian: narasi, ai_mode: aiModePilihan }),
    });
    const ai = data.data || {};
    const result = {
      val_S: num(ai.S), val_T: num(ai.T), val_N: num(ai.N), val_K: num(ai.K), val_M: num(ai.M),
      ai_mode: ai.mode || "HEURISTIK",
      ai_raw_response: ai.raw || null,
    };
    setAiResult(result);
    setNarasiTeranalisis(narasi);

    if (aiModePilihan !== "HEURISTIK" && result.ai_mode !== aiModePilihan) {
      const label = AI_MODES.find((m) => m.value === aiModePilihan)?.label || aiModePilihan;
      Swal.fire({
        toast: true, position: "top-end", icon: "warning", showConfirmButton: false, timer: 4500,
        title: `${label} tidak tersedia`, text: "Otomatis beralih ke Heuristik Lokal. Periksa API Key di Pengaturan Sekolah.",
      });
    }
    return result;
  };

  const validasiNarasi = () => {
    if (formData.narasi_kejadian.trim().length < 10) {
      Swal.fire("Narasi Terlalu Pendek", "Isi narasi minimal 10 karakter.", "warning");
      return false;
    }
    return true;
  };

  const handleAnalyze = async () => {
    if (!validasiNarasi()) return;
    setAnalyzing(true);
    try {
      const result = await runAnalysis(formData.narasi_kejadian);
      if (aiModePilihan === "HEURISTIK" || result.ai_mode === aiModePilihan) {
        Swal.fire({ toast: true, position: "top-end", icon: "success", title: `Analisis selesai via ${result.ai_mode}`, showConfirmButton: false, timer: 2000 });
      }
    } catch (err) {
      Swal.fire("Analisis Gagal", err.message, "error");
    } finally { setAnalyzing(false); }
  };

  // --- PESAN & PANEL WHATSAPP ---
  const susunPesanWA = (j) => {
    const siswa = j.siswa || {};
    const namaSiswa = siswa.nama_siswa || j.id_siswa;
    const namaKelas = j.kelas?.nama_kelas || "-";
    const namaSekolah = settings?.nama_sekolah || "Sekolah";
    const namaGuru = j.guru?.nama_guru || userName || "Guru";

    const ortu = siswa.ortu, wali = siswa.wali;
    const nomorOrtu = normalisasiNomorWA(ortu?.no_wa || wali?.no_wa || siswa.no_wa);
    const namaOrtu = ortu?.nama_ayah || ortu?.nama_ibu || wali?.nama_wali;
    const sapaan = namaOrtu ? `Bapak/Ibu ${namaOrtu}` : `Bapak/Ibu Orang Tua/Wali dari ${namaSiswa}`;

    const total = totalStnkm(j);
    const warning = perluPembinaan(j);
    const header = warning
      ? "⚠️ *PERHATIAN KHUSUS / PEMBINAAN SISWA*"
      : total > 0 ? "🌟 *APRESIASI & PERKEMBANGAN POSITIF SISWA*" : "📝 *CATATAN OBSERVASI HARIAN SISWA*";
    const poin = STNKM_META.map((m) => `${m.short}:${getNilaiSign(j[m.key])}`).join(" | ");
    const konteks = j.materi?.nama_materi || j.jenis?.kategori_penilaian;

    const pesanOrtu =
      `Selamat pagi/siang ${sapaan},\n\n` +
      `Kami dari *${namaSekolah}* menyampaikan catatan jurnal observasi ananda:\n\n` +
      `${header}\n` +
      `📅 Tanggal: ${formatTanggal(j.tanggal)}\n` +
      `🏫 Kelas: ${namaKelas}\n` +
      `👦 Siswa: *${namaSiswa}*\n` +
      (konteks ? `📚 Konteks: ${konteks}\n` : "") +
      `📖 Catatan Guru:\n_"${j.narasi_kejadian}"_\n` +
      `📊 Indeks STNKM: [${poin}]\n\n` +
      `Mari terus bersinergi mendampingi tumbuh kembang ananda. Terima kasih.\n\n` +
      `Salam,\n*${namaGuru}*`;

    const pesanGrup =
      `*📢 UPDATE JURNAL OBSERVASI - ${namaSekolah.toUpperCase()}*\n` +
      `${header}\n` +
      `📅 Tanggal: ${formatTanggal(j.tanggal)}\n` +
      `🏫 Kelas: *${namaKelas}*\n` +
      `👦 Siswa: *${namaSiswa}*\n` +
      `👩‍🏫 Pencatat: ${namaGuru}\n\n` +
      `*Narasi Kejadian:*\n"${j.narasi_kejadian}"\n\n` +
      `*Skor STNKM:* [${poin}] (${j.mode_dampak === "BONUS" ? "Intervensi Nilai" : "Catatan Kualitatif"})`;

    return { namaSiswa, nomorOrtu, pesanOrtu, pesanGrup, warning };
  };

  const bukaWhatsApp = (nomor, teks) => {
    const url = nomor
      ? `https://wa.me/${nomor}?text=${encodeURIComponent(teks)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(teks)}`;
    window.open(url, "_blank", "noopener");
  };

  const salinTeks = async (teks) => {
    try {
      await navigator.clipboard.writeText(teks);
      Swal.showValidationMessage("✔ Teks disalin ke clipboard");
    } catch (e) {
      Swal.showValidationMessage("Gagal menyalin. Gunakan tombol WhatsApp.");
    }
    setTimeout(() => Swal.resetValidationMessage(), 1800);
  };

  const tampilkanPanelWA = (j, { judul, ortu = true, grup = true }) => {
    const paket = susunPesanWA(j);
    const badge = paket.warning
      ? '<span class="badge text-bg-danger"><i class="bi bi-exclamation-triangle me-1"></i>Pembinaan</span>'
      : '<span class="badge text-bg-success"><i class="bi bi-star-fill me-1"></i>Apresiasi / Observasi</span>';
    const infoNomor = paket.nomorOrtu ? `(${paket.nomorOrtu})` : "(nomor WA ortu belum diisi, pilih kontak di WA)";

    Swal.fire({
      title: judul,
      icon: "success",
      width: 560,
      confirmButtonText: "Selesai & Tutup",
      html:
        `<div class="text-start">` +
        `<div class="d-flex justify-content-between align-items-center gap-2 mb-3 p-2 bg-light rounded border">` +
        `<strong>${escapeHtml(paket.namaSiswa)}</strong>${badge}</div>` +
        (ortu
          ? `<label class="fw-bold small text-muted mb-1">1. Kirim ke Orang Tua / Wali ${escapeHtml(infoNomor)}</label>` +
            `<div class="d-flex gap-2 mb-3">` +
            `<button type="button" id="waOrtu" class="btn btn-success btn-sm flex-grow-1 fw-bold"><i class="bi bi-whatsapp me-1"></i>Chat WA Orang Tua</button>` +
            `<button type="button" id="salinOrtu" class="btn btn-outline-secondary btn-sm"><i class="bi bi-clipboard me-1"></i>Salin</button></div>`
          : "") +
        (grup
          ? `<label class="fw-bold small text-muted mb-1">${ortu ? "2" : "1"}. Teruskan ke Kepala Sekolah / Grup Guru</label>` +
            `<div class="d-flex gap-2">` +
            `<button type="button" id="waGrup" class="btn btn-primary btn-sm flex-grow-1 fw-bold"><i class="bi bi-whatsapp me-1"></i>WA Kepsek / Grup</button>` +
            `<button type="button" id="salinGrup" class="btn btn-outline-primary btn-sm"><i class="bi bi-clipboard me-1"></i>Salin</button></div>`
          : "") +
        `</div>`,
      didOpen: (popup) => {
        popup.querySelector("#waOrtu")?.addEventListener("click", () => bukaWhatsApp(paket.nomorOrtu, paket.pesanOrtu));
        popup.querySelector("#salinOrtu")?.addEventListener("click", () => salinTeks(paket.pesanOrtu));
        popup.querySelector("#waGrup")?.addEventListener("click", () => bukaWhatsApp("", paket.pesanGrup));
        popup.querySelector("#salinGrup")?.addEventListener("click", () => salinTeks(paket.pesanGrup));
      },
    });
  };

  // --- SIMPAN / PERBARUI JURNAL ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.id_kelas) return Swal.fire("Kelas Belum Dipilih", "Pilih kelas terlebih dahulu.", "warning");
    if (!formData.id_siswa) return Swal.fire("Siswa Belum Dipilih", "Pilih siswa terlebih dahulu.", "warning");
    if (!validasiNarasi()) return;

    setSaving(true);
    try {
      // Satu klik: jika narasi belum dianalisis (atau sudah diubah), analisis dulu baru simpan
      let ai = aiResult;
      if (!analyzed) {
        const label = AI_MODES.find((m) => m.value === aiModePilihan)?.label;
        Swal.fire({ title: "Menganalisis Perilaku...", text: `Mesin: ${label}`, allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        ai = await runAnalysis(formData.narasi_kejadian);
      }

      Swal.fire({ title: editId ? "Memperbarui Jurnal..." : "Menyimpan Jurnal...", allowOutsideClick: false, didOpen: () => Swal.showLoading() });
      const { konteks, ...form } = formData;
      const payload = {
        ...form,
        id_guru: form.id_guru || null,
        // KBM → materi pembelajaran, OBSERVASI → aktivitas MBK
        id_materi: konteks === "KBM" ? form.id_materi || null : null,
        id_jenis: konteks === "OBSERVASI" ? form.id_jenis || null : null,
        hapus_lampiran: hapusLampiran,
        ...ai,
      };

      const res = await safeFetch(editId ? `${API_URL}/jurnal/${encodeURIComponent(editId)}` : `${API_URL}/jurnal/store`, {
        method: editId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify(payload),
      });

      const wasEdit = !!editId;
      const kelasForm = formData.id_kelas;
      resetForm();

      // Tampilkan kelas yang baru diisi di linimasa
      if (filterKelasFeed && filterKelasFeed !== kelasForm) setFilterKelasFeed(kelasForm);
      else fetchFeed();

      const judul = wasEdit ? "Jurnal Berhasil Diperbarui!" : "Jurnal Berhasil Diposting!";
      if ((kirimWaOrtu || kirimWaGrup) && res.data) {
        tampilkanPanelWA(res.data, { judul, ortu: kirimWaOrtu, grup: kirimWaGrup });
      } else {
        Swal.fire({ toast: true, position: "top-end", icon: "success", title: judul, showConfirmButton: false, timer: 2000 });
      }
    } catch (err) {
      Swal.fire("Gagal Menyimpan", err.message, "error");
    } finally { setSaving(false); }
  };

  const handleEdit = (j) => {
    setEditId(j.id_jurnal);
    setFormData({
      tanggal: (j.tanggal || todayLocal()).slice(0, 10),
      id_kelas: j.id_kelas || "",
      id_siswa: j.id_siswa || "",
      id_guru: j.id_guru || "",
      konteks: j.id_jenis && !j.id_materi ? "OBSERVASI" : "KBM",
      id_materi: j.id_materi || "",
      id_jenis: j.id_jenis || "",
      narasi_kejadian: j.narasi_kejadian || "",
      mode_dampak: j.mode_dampak || "PISAH",
      lampiran_base64: null,
    });
    // Skor lama dipakai selama narasi dan mesin AI tidak diubah
    setAiResult({
      val_S: num(j.val_S), val_T: num(j.val_T), val_N: num(j.val_N), val_K: num(j.val_K), val_M: num(j.val_M),
      ai_mode: j.ai_mode || "HEURISTIK", ai_raw_response: j.ai_raw_response || null,
    });
    setNarasiTeranalisis(j.narasi_kejadian || "");
    setAiModePilihan(AI_MODES.some((m) => m.value === j.ai_mode) ? j.ai_mode : "HEURISTIK");
    setLampiranLama(j.lampiran_url || null);
    setHapusLampiran(false);
    setFilePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    formTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleDelete = async (j) => {
    const confirm = await Swal.fire({
      title: "Hapus Jurnal Permanen?",
      text: j.lampiran_url ? "Jurnal beserta file lampirannya akan ikut terhapus." : "Data ini akan dihapus permanen.",
      icon: "warning", showCancelButton: true, confirmButtonColor: "#d33", confirmButtonText: "Ya, Hapus!", cancelButtonText: "Batal",
    });
    if (!confirm.isConfirmed) return;
    try {
      await safeFetch(`${API_URL}/jurnal/${encodeURIComponent(j.id_jurnal)}`, { method: "DELETE", headers: authHeader() });
      if (editId === j.id_jurnal) resetForm();
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: "Jurnal dihapus", showConfirmButton: false, timer: 2000 });
      fetchFeed();
    } catch (err) { Swal.fire("Gagal", err.message, "error"); }
  };

  // --- EKSPOR ---
  const namaKelasFilter = classes.find((c) => String(c.id_kelas) === String(filterKelasFeed))?.nama_kelas || "Semua Kelas";
  const namaFileEkspor = `Jurnal_Anekdotal_${namaKelasFilter.replace(/\s+/g, "_")}_${todayLocal()}`;

  const exportRows = () => sortedJournals.map((j) => ({
    "Tanggal": j.tanggal,
    "Siswa": j.siswa?.nama_siswa || j.id_siswa,
    "Kelas": j.kelas?.nama_kelas || "-",
    "Konteks": j.materi?.nama_materi || j.jenis?.kategori_penilaian || "-",
    "Narasi": j.narasi_kejadian,
    "Dampak": j.mode_dampak === "BONUS" ? "Intervensi" : "Catatan",
    "Mode AI": j.ai_mode || "-",
    "Pencatat": j.guru?.nama_guru || "-",
    "S": num(j.val_S), "T": num(j.val_T), "N": num(j.val_N), "K": num(j.val_K), "M": num(j.val_M),
  }));

  const adaData = () => {
    if (sortedJournals.length === 0) { Swal.fire("Kosong", "Tidak ada data jurnal untuk diekspor.", "info"); return false; }
    return true;
  };

  const handleExportExcel = () => {
    if (!adaData()) return;
    const ws = XLSX.utils.json_to_sheet(exportRows());
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Jurnal");
    XLSX.writeFile(wb, `${namaFileEkspor}.xlsx`);
  };

  const handleExportCSV = () => {
    if (!adaData()) return;
    const rows = exportRows();
    const headers = Object.keys(rows[0]);
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [headers.map(esc).join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\r\n");
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
    const data = sortedJournals.map((j) => ({
      "Tanggal": formatTanggal(j.tanggal),
      "Siswa": j.siswa?.nama_siswa || j.id_siswa,
      "Kelas": j.kelas?.nama_kelas || "-",
      "Catatan Kejadian": j.narasi_kejadian,
      "Dampak": j.mode_dampak === "BONUS" ? "Intervensi" : "Catatan",
      "Skor STNKM": STNKM_META.map((m) => `${m.short}:${getNilaiSign(j[m.key])}`).join(" "),
    }));
    await generateProfessionalPDF(data, `Laporan Jurnal Anekdotal - ${namaKelasFilter}`, settings, getBase64ImageFromUrl);
  };

  // --- RENDER HELPERS ---
  const sortHeader = (col, label, className = "") => (
    <th role="button" className={`text-nowrap user-select-none ${className}`} onClick={() => handleSort(col)}>
      {label}{" "}
      <i className={`bi ${sortCol === col ? (sortAsc ? "bi-sort-up text-primary" : "bi-sort-down text-primary") : "bi-arrow-down-up text-muted opacity-50"}`}></i>
    </th>
  );

  const actionButtons = (j) => (
    <div className="btn-group btn-group-sm">
      <button type="button" className="btn btn-outline-success" title="Bagikan ke WhatsApp"
        onClick={() => tampilkanPanelWA(j, { judul: "Bagikan Jurnal ke WhatsApp" })}>
        <i className="bi bi-whatsapp"></i>
      </button>
      {milikSendiri(j.id_guru) && <>
        <button type="button" className="btn btn-outline-primary" title="Edit" onClick={() => handleEdit(j)}>
          <i className="bi bi-pencil"></i>
        </button>
        <button type="button" className="btn btn-outline-danger" title="Hapus" onClick={() => handleDelete(j)}>
          <i className="bi bi-trash"></i>
        </button>
      </>}
    </div>
  );

  const isKBM = formData.konteks === "KBM";
  const labelAiPilihan = AI_MODES.find((m) => m.value === aiModePilihan)?.label;
  const adaWA = kirimWaOrtu || kirimWaGrup;

  return (
    <div className="container-fluid mb-5">
      {/* HEADER HALAMAN */}
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <h3 className="fw-bold text-primary mb-0"><i className="bi bi-journal-text me-2"></i>Jurnal Anekdotal & Observasi</h3>
        <ol className="breadcrumb mb-0 small">
          <li className="breadcrumb-item"><a href="/dashboard">Dashboard</a></li>
          <li className="breadcrumb-item">TDU - Jadwal</li>
          <li className="breadcrumb-item active" aria-current="page">Jurnal Anekdotal</li>
        </ol>
      </div>

      {/* RINGKASAN */}
      <div className="row g-3 mb-3">
        <InfoBox icon="bi-journal-text" color="primary" label="Total Jurnal" value={ringkasan.total} />
        <InfoBox icon="bi-star-fill" color="success" label="Apresiasi" value={ringkasan.apresiasi} />
        <InfoBox icon="bi-exclamation-triangle-fill" color="warning" label="Perlu Pembinaan" value={ringkasan.pembinaan} />
        <InfoBox icon="bi-lightning-charge-fill" color="danger" label="Intervensi Nilai" value={ringkasan.intervensi} />
      </div>

      <div className="row g-3">
        {/* ================= KOLOM KIRI: FORM ================= */}
        <div className="col-12 col-lg-5" ref={formTopRef}>
          <div className={`card card-outline ${editId ? "card-warning" : "card-primary"} shadow-sm`}>
            <div className="card-header d-flex justify-content-between align-items-center gap-2">
              <h3 className="card-title fw-bold mb-0 fs-6">
                <i className={`bi ${editId ? "bi-pencil-square text-warning" : "bi-pen text-primary"} me-2`}></i>
                {editId ? "Edit Jurnal" : "Tulis Jurnal Baru"}
              </h3>
              {editId && (
                <button type="button" className="btn btn-sm btn-outline-secondary ms-auto" onClick={resetForm}>
                  <i className="bi bi-x-lg me-1"></i>Batal Edit
                </button>
              )}
            </div>

            <form onSubmit={handleSubmit}>
              <div className="card-body">
                <div className="row g-2 mb-3">
                  <div className="col-6">
                    <label className="form-label fw-bold small text-muted mb-1">Kelas *</label>
                    <select className="form-select form-select-sm fw-bold text-primary" required value={formData.id_kelas} onChange={(e) => handleInputChange("id_kelas", e.target.value)}>
                      <option value="">- Pilih Kelas -</option>
                      {classes.map((c) => <option key={c.id_kelas} value={c.id_kelas}>{c.nama_kelas}</option>)}
                    </select>
                  </div>
                  <div className="col-6">
                    <label className="form-label fw-bold small text-muted mb-1">Siswa *</label>
                    <select className="form-select form-select-sm" required value={formData.id_siswa} onChange={(e) => handleInputChange("id_siswa", e.target.value)} disabled={!formData.id_kelas}>
                      <option value="">{formData.id_kelas ? "- Pilih Siswa -" : "- Pilih Kelas Dulu -"}</option>
                      {students.map((s) => <option key={s.id_siswa} value={s.id_siswa}>{s.nama_siswa}</option>)}
                    </select>
                  </div>
                  <div className="col-6">
                    <label className="form-label fw-bold small text-muted mb-1">Tanggal *</label>
                    <input type="date" className="form-control form-control-sm" required value={formData.tanggal} onChange={(e) => handleInputChange("tanggal", e.target.value)} />
                  </div>
                  <div className="col-6">
                    <label className="form-label fw-bold small text-muted mb-1">Guru Pencatat</label>
                    <select className="form-select form-select-sm" value={formData.id_guru} disabled={isGuru} title={isGuru ? "Jurnal dicatat atas nama Anda" : undefined} onChange={(e) => handleInputChange("id_guru", e.target.value)}>
                      <option value="">- Opsional -</option>
                      {teachers.map((t) => <option key={t.id_guru} value={t.id_guru}>{t.nama_guru}</option>)}
                    </select>
                  </div>
                  <div className="col-12">
                    <label className="form-label fw-bold small text-muted mb-1">Jalur Konteks Kejadian</label>
                    <select className="form-select form-select-sm border-primary fw-bold" value={formData.konteks} onChange={(e) => handleInputChange("konteks", e.target.value)}>
                      <option value="KBM">📚 Pembelajaran di Kelas (Intrakurikuler / Materi)</option>
                      <option value="OBSERVASI">🏃 Observasi Perilaku Bebas (Luar KBM / Istirahat / Ekskul)</option>
                    </select>
                  </div>
                  <div className="col-12">
                    <label className="form-label fw-bold small text-muted mb-1">
                      {isKBM ? "Materi Pembelajaran (KBM)" : "Aktivitas Observasi / MBK (Luar KBM)"}
                    </label>
                    <select
                      className="form-select form-select-sm"
                      value={isKBM ? formData.id_materi : formData.id_jenis}
                      onChange={(e) => handleInputChange(isKBM ? "id_materi" : "id_jenis", e.target.value)}
                      disabled={isKBM && !formData.id_kelas}
                    >
                      <option value="">
                        {isKBM ? (formData.id_kelas ? "Observasi Umum di Kelas" : "- Pilih Kelas Dulu -") : "Observasi Perilaku Umum (Luar KBM)"}
                      </option>
                      {isKBM
                        ? materis.map((m) => (
                          <option key={m.id_materi} value={m.id_materi}>{m.mapel?.nama_mapel ? `[${m.mapel.nama_mapel}] ` : ""}{m.nama_materi}</option>
                        ))
                        : mbks.map((m) => <option key={m.id_jenis} value={m.id_jenis}>{m.kategori_penilaian}</option>)}
                    </select>
                  </div>
                </div>

                <div className="mb-3">
                  <label className="form-label fw-bold small text-muted mb-1">Narasi Kejadian / Perilaku *</label>
                  <textarea className="form-control bg-body-tertiary" rows="4" required maxLength={2000} value={formData.narasi_kejadian}
                    onChange={(e) => handleInputChange("narasi_kejadian", e.target.value)}
                    style={{ resize: "vertical" }}
                    placeholder="Ketik kejadian anekdotal atau perilaku siswa di sini..." />
                  <div className="d-flex flex-wrap justify-content-between gap-1">
                    <small className="text-muted">{formData.narasi_kejadian.length}/2000 karakter</small>
                    {aiResult.ai_mode && !analyzed && (
                      <small className="text-warning-emphasis"><i className="bi bi-arrow-repeat me-1"></i>Akan dianalisis ulang saat posting</small>
                    )}
                  </div>
                </div>

                {/* LAMPIRAN */}
                <div className="mb-3">
                  <label className="form-label fw-bold small text-muted mb-1"><i className="bi bi-paperclip me-1"></i>Bukti Foto / Dokumen (Opsional)</label>
                  {lampiranLama && !hapusLampiran && !filePreview && (
                    <div className="border rounded p-2 mb-2 bg-body-tertiary d-flex justify-content-between align-items-center gap-2">
                      <a href={`${API_ORIGIN}${lampiranLama}`} target="_blank" rel="noreferrer" className="small text-truncate">
                        <i className={`bi ${isImage(lampiranLama) ? "bi-image" : "bi-file-earmark-pdf"} me-1`}></i>Lampiran saat ini
                      </a>
                      <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setHapusLampiran(true)} title="Hapus lampiran">
                        <i className="bi bi-trash"></i>
                      </button>
                    </div>
                  )}
                  {hapusLampiran && !filePreview && (
                    <div className="small text-danger mb-2">
                      Lampiran lama akan dihapus saat disimpan.{" "}
                      <button type="button" className="btn btn-link btn-sm p-0 align-baseline" onClick={() => setHapusLampiran(false)}>Batalkan</button>
                    </div>
                  )}
                  {!filePreview ? (
                    <>
                      <input ref={fileInputRef} type="file" className="form-control form-control-sm" accept={LAMPIRAN_ACCEPT} onChange={handleFileChange} />
                      <small className="text-muted">
                        JPG, PNG, WEBP, atau PDF. Maksimal {LAMPIRAN_MAX_MB}MB.{lampiranLama && !hapusLampiran ? " File baru akan menggantikan lampiran saat ini." : ""}
                      </small>
                    </>
                  ) : (
                    <div className="border rounded p-2 bg-body-tertiary d-flex justify-content-between align-items-center gap-2">
                      <div className="d-flex align-items-center gap-2 overflow-hidden">
                        {filePreview.type.startsWith("image/") ? (
                          <img src={filePreview.url} alt="preview" style={{ width: 40, height: 40, objectFit: "cover" }} className="rounded" />
                        ) : (
                          <i className="bi bi-file-earmark-pdf fs-4 text-danger"></i>
                        )}
                        <small className="text-truncate">{filePreview.name}</small>
                      </div>
                      <button type="button" className="btn btn-sm btn-outline-danger" onClick={clearFile}><i className="bi bi-x-lg"></i></button>
                    </div>
                  )}
                </div>

                {/* PENGATURAN AI & DAMPAK */}
                <div className="border rounded mb-3">
                  <button type="button" className="btn btn-link w-100 text-start fw-bold text-decoration-none d-flex justify-content-between align-items-center gap-2"
                    onClick={() => setShowOpsi(!showOpsi)} aria-expanded={showOpsi}>
                    <span>
                      <i className="bi bi-gear-wide-connected me-2"></i>Pengaturan AI & Dampak Rapor
                      <span className="badge text-bg-light border ms-2 fw-normal">
                        {labelAiPilihan} · {formData.mode_dampak === "BONUS" ? "Intervensi" : "Terpisah"}
                      </span>
                    </span>
                    <i className={`bi ${showOpsi ? "bi-chevron-up" : "bi-chevron-down"}`}></i>
                  </button>
                  {showOpsi && (
                    <div className="px-3 pb-3">
                      <div className="fw-bold small mb-2">1. Otak Analisis (NLP)</div>
                      <div className="row g-1 mb-3">
                        {AI_MODES.map((m) => (
                          <div className="col-12 col-sm-6" key={m.value}>
                            <div className="form-check">
                              <input className="form-check-input" type="radio" name="ai_mode" id={`ai_${m.value}`} value={m.value}
                                checked={aiModePilihan === m.value}
                                onChange={(e) => { setAiModePilihan(e.target.value); setNarasiTeranalisis(null); }} />
                              <label className="form-check-label small" htmlFor={`ai_${m.value}`}>
                                <i className={`bi ${m.icon} me-1`}></i><b>{m.label}</b> <span className="text-muted">({m.desc})</span>
                              </label>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="fw-bold small mb-2">2. Dampak ke Nilai Akademik</div>
                      <div className="form-check">
                        <input className="form-check-input" type="radio" name="mode_dampak" id="imp_bonus" value="BONUS"
                          checked={formData.mode_dampak === "BONUS"} onChange={(e) => handleInputChange("mode_dampak", e.target.value)} />
                        <label className="form-check-label small" htmlFor="imp_bonus"><b>Mode Intervensi</b> (Ubah Angka Rapor)</label>
                      </div>
                      <div className="form-check">
                        <input className="form-check-input" type="radio" name="mode_dampak" id="imp_pisah" value="PISAH"
                          checked={formData.mode_dampak === "PISAH"} onChange={(e) => handleInputChange("mode_dampak", e.target.value)} />
                        <label className="form-check-label small" htmlFor="imp_pisah"><b>Mode Terpisah</b> (Hanya Narasi Kualitatif)</label>
                      </div>
                    </div>
                  )}
                </div>

                {/* PRATINJAU ANALISIS */}
                <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
                  <button type="button" className="btn btn-sm btn-outline-info fw-bold" onClick={handleAnalyze} disabled={analyzing || saving}>
                    {analyzing
                      ? <><span className="spinner-border spinner-border-sm me-1"></span>Menganalisis...</>
                      : <><i className="bi bi-magic me-1"></i>Pratinjau Analisis</>}
                  </button>
                  {analyzed ? (
                    <>
                      <span className={`badge ${aiResult.ai_mode !== "HEURISTIK" ? "text-bg-info" : "text-bg-secondary"}`}>{aiResult.ai_mode}</span>
                      <StnkmBadges j={aiResult} />
                    </>
                  ) : (
                    <small className="text-muted">Opsional. Analisis otomatis dijalankan saat posting.</small>
                  )}
                </div>

                {/* DISTRIBUSI WHATSAPP */}
                <div className="p-2 px-3 bg-success-subtle rounded border border-success-subtle">
                  <div className="small fw-bold text-success-emphasis mb-1"><i className="bi bi-whatsapp me-1"></i>Distribusi Notifikasi WhatsApp</div>
                  <div className="d-flex flex-wrap gap-3">
                    <div className="form-check form-switch m-0">
                      <input className="form-check-input" type="checkbox" id="chk_wa_ortu" checked={kirimWaOrtu} onChange={(e) => setKirimWaOrtu(e.target.checked)} />
                      <label className="form-check-label small fw-bold" htmlFor="chk_wa_ortu">WA Ortu Siswa</label>
                    </div>
                    <div className="form-check form-switch m-0">
                      <input className="form-check-input" type="checkbox" id="chk_wa_grup" checked={kirimWaGrup} onChange={(e) => setKirimWaGrup(e.target.checked)} />
                      <label className="form-check-label small fw-bold" htmlFor="chk_wa_grup">WA Kepsek / Grup</label>
                    </div>
                  </div>
                </div>
              </div>

              <div className="card-footer">
                <button type="submit" className={`btn ${editId ? "btn-warning" : "btn-primary"} w-100 fw-bold py-2 rounded-pill shadow-sm`} disabled={saving || analyzing}>
                  {saving
                    ? <><span className="spinner-border spinner-border-sm me-2"></span>Memproses...</>
                    : editId
                      ? <><i className="bi bi-pencil-square me-2"></i>Perbarui Jurnal{adaWA ? " & Proses WA" : ""}</>
                      : <><i className="bi bi-send me-2"></i>Posting Jurnal{adaWA ? " & Proses WA" : ""}</>}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* ================= KOLOM KANAN: LINIMASA & TABEL ================= */}
        <div className="col-12 col-lg-7">
          <div className="card card-primary card-outline shadow-sm mb-3">
            <div className="card-header">
              <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
                <ul className="nav nav-pills">
                  <li className="nav-item">
                    <button type="button" className={`nav-link py-1 px-3 rounded-pill fw-bold ${activeTab === "linimasa" ? "active" : ""}`} onClick={() => setActiveTab("linimasa")}>
                      <i className="bi bi-clock-history me-1"></i>Linimasa
                    </button>
                  </li>
                  <li className="nav-item">
                    <button type="button" className={`nav-link py-1 px-3 rounded-pill fw-bold ${activeTab === "tabel" ? "active" : ""}`} onClick={() => setActiveTab("tabel")}>
                      <i className="bi bi-table me-1"></i>Tabel Analitik
                    </button>
                  </li>
                </ul>
                <div className="d-flex align-items-center gap-2">
                  <label className="small fw-bold text-muted text-nowrap mb-0 d-none d-sm-inline" htmlFor="filterKelas">Filter Kelas:</label>
                  <select id="filterKelas" className="form-select form-select-sm border-primary fw-bold text-primary" style={{ minWidth: 150 }}
                    value={filterKelasFeed} onChange={(e) => setFilterKelasFeed(e.target.value)}>
                    <option value="">Semua Kelas</option>
                    {classes.map((c) => <option key={c.id_kelas} value={c.id_kelas}>{c.nama_kelas}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="card-body py-2">
              <div className="d-flex flex-wrap gap-2">
                <div className="input-group input-group-sm flex-grow-1" style={{ minWidth: 200 }}>
                  <span className="input-group-text bg-body text-primary"><i className="bi bi-search"></i></span>
                  <input type="text" className="form-control" placeholder="Cari siswa, narasi, materi, guru, atau tanggal..."
                    value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                  {searchQuery && (
                    <button type="button" className="btn btn-outline-secondary" onClick={() => setSearchQuery("")} title="Hapus pencarian"><i className="bi bi-x-lg"></i></button>
                  )}
                </div>
                <div className="btn-group btn-group-sm">
                  <button type="button" className="btn btn-outline-success fw-bold" onClick={handleExportExcel} title="Ekspor Excel"><i className="bi bi-file-earmark-excel me-1"></i>Excel</button>
                  <button type="button" className="btn btn-outline-secondary fw-bold" onClick={handleExportCSV} title="Ekspor CSV"><i className="bi bi-filetype-csv me-1"></i>CSV</button>
                  <button type="button" className="btn btn-outline-danger fw-bold" onClick={handleExportPDF} title="Cetak PDF resmi"><i className="bi bi-file-earmark-pdf me-1"></i>PDF</button>
                </div>
              </div>
            </div>
          </div>

          {loadingFeed && (
            <div className="text-center text-muted py-4"><span className="spinner-border spinner-border-sm me-2"></span>Memuat jurnal...</div>
          )}

          {!loadingFeed && filteredJournals.length === 0 && (
            <div className="card shadow-sm">
              <div className="card-body text-center py-5 text-muted">
                <i className="bi bi-cup-hot fs-1 d-block mb-2 opacity-50"></i>
                <p className="mb-0">{journals.length === 0 ? "Belum ada jurnal observasi untuk filter ini." : "Tidak ada jurnal yang cocok dengan pencarian."}</p>
              </div>
            </div>
          )}

          {/* TAB LINIMASA */}
          {!loadingFeed && activeTab === "linimasa" && sortedJournals.map((j) => (
            <div key={j.id_jurnal} className={`card shadow-sm mb-3 border-start border-4 ${editId === j.id_jurnal ? "border-warning" : j.mode_dampak === "BONUS" ? "border-danger" : "border-secondary"}`}>
              <div className="card-body p-3">
                <div className="d-flex gap-3">
                  <div className="rounded-circle bg-primary text-white d-flex align-items-center justify-content-center flex-shrink-0 shadow-sm"
                    style={{ width: 45, height: 45, fontSize: 18, fontWeight: "bold" }}>
                    {(j.siswa?.nama_siswa || "?").charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-grow-1" style={{ minWidth: 0 }}>
                    <div className="d-flex flex-wrap justify-content-between align-items-start gap-2">
                      <div style={{ minWidth: 0 }}>
                        <h6 className="fw-bold mb-0">
                          {j.siswa?.nama_siswa || j.id_siswa}
                          {j.mode_dampak === "BONUS"
                            ? <span className="badge text-bg-danger ms-2"><i className="bi bi-lightning-charge-fill me-1"></i>Intervensi</span>
                            : <span className="badge text-bg-secondary ms-2"><i className="bi bi-book me-1"></i>Catatan</span>}
                          {j.ai_mode && j.ai_mode !== "HEURISTIK" && <span className="badge text-bg-info ms-1"><i className="bi bi-robot me-1"></i>{j.ai_mode}</span>}
                        </h6>
                        <small className="text-muted">
                          {j.kelas?.nama_kelas || "-"} • {formatTanggal(j.tanggal)}
                          {(j.materi?.nama_materi || j.jenis?.kategori_penilaian) && <> • {j.materi?.nama_materi || j.jenis?.kategori_penilaian}</>}
                          {j.guru?.nama_guru && <> • Oleh: {j.guru.nama_guru}</>}
                        </small>
                      </div>
                      {actionButtons(j)}
                    </div>

                    <p className="mt-2 mb-2" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{j.narasi_kejadian}</p>

                    {j.lampiran_url && isImage(j.lampiran_url) && (
                      <a href={`${API_ORIGIN}${j.lampiran_url}`} target="_blank" rel="noreferrer" className="d-inline-block mb-2">
                        <img src={`${API_ORIGIN}${j.lampiran_url}`} alt="Lampiran bukti" className="rounded border shadow-sm"
                          style={{ maxHeight: 250, maxWidth: "100%", objectFit: "cover" }}
                          onError={(e) => { e.currentTarget.style.display = "none"; }} />
                      </a>
                    )}
                    {j.lampiran_url && !isImage(j.lampiran_url) && (
                      <div className="mb-2">
                        <a href={`${API_ORIGIN}${j.lampiran_url}`} target="_blank" rel="noreferrer" className="btn btn-sm btn-outline-secondary">
                          <i className="bi bi-paperclip me-1"></i>Lihat Dokumen Bukti
                        </a>
                      </div>
                    )}

                    <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 pt-2 border-top">
                      <div className="d-flex flex-wrap align-items-center gap-1">
                        <span className="small fw-bold text-muted me-1"><i className="bi bi-cpu me-1"></i>NLP:</span>
                        <StnkmBadges j={j} />
                      </div>
                      <button type="button" className="btn btn-sm btn-success rounded-pill px-3 fw-bold"
                        onClick={() => tampilkanPanelWA(j, { judul: "Bagikan Jurnal ke WhatsApp" })}>
                        <i className="bi bi-whatsapp me-1"></i>Teruskan WA
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* TAB TABEL ANALITIK */}
          {!loadingFeed && activeTab === "tabel" && sortedJournals.length > 0 && (
            <div className="card shadow-sm">
              <div className="card-body p-0">
                <div className="table-responsive">
                  <table className="table table-sm table-hover table-striped align-middle mb-0" style={{ fontSize: 13 }}>
                    <thead className="table-light">
                      <tr>
                        <th className="text-center">#</th>
                        {sortHeader("tanggal", "Tanggal")}
                        {sortHeader("siswa", "Siswa")}
                        {sortHeader("narasi", "Kejadian / Perilaku")}
                        {sortHeader("total", "Poin STNKM")}
                        {sortHeader("dampak", "Dampak", "text-center")}
                        <th className="text-center">Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((j, i) => (
                        <tr key={j.id_jurnal} className={editId === j.id_jurnal ? "table-warning" : ""}>
                          <td className="text-center text-muted">{(currentPage - 1) * ROWS_PER_PAGE + i + 1}</td>
                          <td className="text-nowrap">{formatTanggal(j.tanggal)}</td>
                          <td className="fw-bold text-primary">
                            {j.siswa?.nama_siswa || j.id_siswa}
                            <div className="small text-muted fw-normal">{j.kelas?.nama_kelas}</div>
                          </td>
                          <td style={{ minWidth: 220 }} title={j.narasi_kejadian}>
                            {j.narasi_kejadian.length > 120 ? `${j.narasi_kejadian.slice(0, 120)}…` : j.narasi_kejadian}
                          </td>
                          <td style={{ minWidth: 170 }}><StnkmBadges j={j} /></td>
                          <td className="text-center">
                            <span className={`badge ${j.mode_dampak === "BONUS" ? "text-bg-danger" : "text-bg-secondary"}`}>
                              {j.mode_dampak === "BONUS" ? "Intervensi" : "Catatan"}
                            </span>
                          </td>
                          <td className="text-center text-nowrap">{actionButtons(j)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="card-footer d-flex flex-wrap justify-content-between align-items-center gap-2">
                <small className="text-muted">
                  Menampilkan {(currentPage - 1) * ROWS_PER_PAGE + 1}–{Math.min(currentPage * ROWS_PER_PAGE, sortedJournals.length)} dari {sortedJournals.length} jurnal
                </small>
                <div className="btn-group btn-group-sm">
                  <button type="button" className="btn btn-outline-primary" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>
                    <i className="bi bi-chevron-left"></i> Sebelumnya
                  </button>
                  <span className="btn btn-outline-primary disabled fw-bold">{currentPage} / {totalPages}</span>
                  <button type="button" className="btn btn-outline-primary" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}>
                    Selanjutnya <i className="bi bi-chevron-right"></i>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
