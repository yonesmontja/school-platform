'use client';

import { useState, useEffect, useRef } from 'react';
import Swal from 'sweetalert2';
import { API_ORIGIN, API_URL } from "@/app/lib/config";
import { buatIkonDariLogo } from "@/app/lib/ikonAplikasi";

// Harus sama dengan SchoolSetting::API_KEY_FIELDS di backend
const AI_PROVIDERS = [
  { field: 'api_key_gemini', label: 'Google Gemini', placeholder: 'Tempel API key dari Google AI Studio' },
  { field: 'api_key_claude', label: 'Anthropic Claude', placeholder: 'Tempel API key dari Claude Console' },
  { field: 'api_key_qwen', label: 'Qwen (via OpenRouter)', placeholder: 'Tempel API key dari OpenRouter' },
  { field: 'api_key_deepseek', label: 'DeepSeek', placeholder: 'Tempel API key dari DeepSeek Platform' },
  { field: 'api_key_openkey', label: 'OpenKey (API kustom kompatibel OpenAI)', placeholder: 'Tempel API key endpoint kustom' },
  { field: 'api_key_elevenlabs', label: 'ElevenLabs (suara narasi video)', placeholder: 'Tempel API key dari ElevenLabs' },
];

// Token WhatsApp diperlakukan sama seperti API key (terenkripsi, tidak dikirim balik)
const WA_TOKEN = { field: 'wa_api_token', label: 'Token Fonnte', placeholder: 'Tempel token device dari dashboard Fonnte' };
// Client Secret integrasi Canva (impor desain di Studio Rakit Video): terenkripsi, tidak dikirim balik
const CANVA_SECRET = { field: 'canva_client_secret', label: 'Canva: Client Secret', placeholder: 'Tempel Client Secret (diawali cnvca) dari Canva Developer Portal' };
const AZURE_KEY = { field: 'azure_speech_key', label: 'Azure Speech: Key', placeholder: 'Tempel Key 1 dari resource Speech di Azure Portal' };
const SECRET_FIELDS = [...AI_PROVIDERS, WA_TOKEN, CANVA_SECRET, AZURE_KEY];

const emptyPerProvider = (value) => Object.fromEntries(SECRET_FIELDS.map((p) => [p.field, value]));

// Input API key: selalu kosong saat dimuat karena key tidak pernah dikirim dari server
function ApiKeyField({ provider, hasKey, value, onChange, show, onToggleShow, hapus, onToggleHapus }) {
  return (
    <div className="col-md-6">
      <label className="form-label fw-bold small text-muted d-flex align-items-center gap-2">
        {provider.label}
        {hasKey && !hapus ? (
          <span className="badge bg-success"><i className="bi bi-check-circle me-1"></i>Sudah diisi</span>
        ) : (
          <span className="badge bg-secondary">Belum diisi</span>
        )}
      </label>
      <div className="input-group">
        <input
          type={show ? 'text' : 'password'}
          className="form-control"
          autoComplete="new-password"
          placeholder={hasKey ? 'Kosongkan jika tidak ingin mengganti' : provider.placeholder}
          value={value}
          disabled={hapus}
          onChange={(e) => onChange(e.target.value)}
        />
        <button type="button" className="btn btn-outline-secondary" onClick={onToggleShow} disabled={hapus} title={show ? 'Sembunyikan' : 'Tampilkan'}>
          <i className={`bi ${show ? 'bi-eye-slash' : 'bi-eye'}`}></i>
        </button>
      </div>
      {hasKey && (
        <div className="form-check mt-1">
          <input type="checkbox" className="form-check-input" id={`hapus_${provider.field}`} checked={hapus} onChange={(e) => onToggleHapus(e.target.checked)} />
          <label className="form-check-label small text-danger" htmlFor={`hapus_${provider.field}`}>Hapus key ini saat disimpan</label>
        </div>
      )}
    </div>
  );
}

export default function PengaturanSekolahPage() {
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    nama_sekolah: '',
    alamat_sekolah: '',
    kota: '',
    nama_kepsek: '',
    nip_kepsek: '',
    npsn: '',
    ttd_kepsek_url: ''
  });
  const [ttdPreview, setTtdPreview] = useState(null);
  const fileInputRef = useRef(null);
  const [logoPreview, setLogoPreview] = useState(null);
  const logoInputRef = useRef(null);
  // Ikon aplikasi perlu dibuat ulang dari logo (sakelar baru dinyalakan atau logo diganti)
  const [ikonPerlu, setIkonPerlu] = useState(false);
  // API key tidak pernah dikirim dari server; input ini hanya untuk key baru
  const [apiKeyInputs, setApiKeyInputs] = useState(emptyPerProvider(''));
  const [showApiKeys, setShowApiKeys] = useState(emptyPerProvider(false));
  const [hapusApiKeys, setHapusApiKeys] = useState(emptyPerProvider(false));
  const getToken = () => localStorage.getItem('token');

  const safeFetch = async (url, options = {}) => {
    const res = await fetch(url, options);
    const textData = await res.text();
    let data = {};
    try { data = textData ? JSON.parse(textData) : {}; } 
    catch (e) { throw new Error(`Respon server tidak valid. Status: ${res.status}`); }
    if (!res.ok) throw new Error(data.message || data.error || 'Terjadi kesalahan pada server');
    return data;
  };

  // Ambil data pengaturan saat halaman dimuat
  useEffect(() => {
    if (!getToken()) { window.location.href = '/login'; return; }
    
    const fetchSettings = async () => {
      try {
        const data = await safeFetch(`${API_URL}/settings`, {
          headers: { Authorization: `Bearer ${getToken()}`, Accept: 'application/json' },
        });
        setFormData(data);
        if (data.logo_sekolah_url) setLogoPreview(`${API_URL}/logo-sekolah?v=${encodeURIComponent(data.logo_sekolah_url.split('/').pop())}`);
        if (data.ttd_kepsek_url) {
          // Jika URL dari backend adalah path lokal (misal /storage/...), kita bisa langsung tampilkan
          // Pastikan API_URL dasar disesuaikan (path relatif /storage/... diberi asal API)
          const fullUrl = data.ttd_kepsek_url.startsWith('http') 
            ? data.ttd_kepsek_url 
            : `${API_ORIGIN}${data.ttd_kepsek_url}`;
          setTtdPreview(fullUrl);
        }
      } catch (err) {
        Swal.fire('Error', err.message, 'error');
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // Handle Upload TTD (Konversi ke Base64)
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validasi ukuran (maks 2MB)
    if (file.size > 2 * 1024 * 1024) {
      return Swal.fire('File Terlalu Besar', 'Maksimal ukuran file TTD adalah 2MB.', 'warning');
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64String = event.target.result;
      setTtdPreview(base64String); // Preview langsung
      // Simpan base64 ke state formData (kita pakai key khusus untuk base64 sementara)
      setFormData({ ...formData, ttd_kepsek_base64: base64String });
    };
    reader.readAsDataURL(file);
  };

  // Logo resmi: diperkecil di peramban (sisi terpanjang maks. 600 px) dan disimpan sebagai PNG agar tajam di kop
  const handleLogoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      e.target.value = '';
      return Swal.fire('Format Tidak Didukung', 'Gunakan gambar PNG, JPG, atau WEBP.', 'warning');
    }
    if (file.size > 5 * 1024 * 1024) {
      e.target.value = '';
      return Swal.fire('File Terlalu Besar', 'Maksimal ukuran file logo adalah 5MB.', 'warning');
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const skala = Math.min(1, 600 / Math.max(img.naturalWidth, img.naturalHeight));
      const kanvas = document.createElement('canvas');
      kanvas.width = Math.max(1, Math.round(img.naturalWidth * skala));
      kanvas.height = Math.max(1, Math.round(img.naturalHeight * skala));
      kanvas.getContext('2d').drawImage(img, 0, 0, kanvas.width, kanvas.height);
      URL.revokeObjectURL(url);
      if (kanvas.width < 32 || kanvas.height < 32) {
        if (logoInputRef.current) logoInputRef.current.value = '';
        return Swal.fire('Logo Terlalu Kecil', 'Gunakan logo minimal 32 × 32 piksel (disarankan 300 piksel atau lebih).', 'warning');
      }
      const dataUrl = kanvas.toDataURL('image/png');
      setLogoPreview(dataUrl);
      setFormData((f) => ({ ...f, logo_sekolah_base64: dataUrl }));
      setIkonPerlu(true);
    };
    img.onerror = () => { URL.revokeObjectURL(url); Swal.fire('Gagal', 'Berkas logo tidak bisa dibaca sebagai gambar.', 'error'); };
    img.src = url;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    Swal.fire({
      title: 'Menyimpan...', text: 'Menyimpan pengaturan sekolah.', allowOutsideClick: false,
      didOpen: () => { Swal.showLoading(); }
    });

    try {
      // Ikon aplikasi dibuat dari logo yang tampil di pratinjau (logo baru atau yang sudah tersimpan)
      let ikon = null;
      if (formData.ikon_dari_logo && logoPreview && ikonPerlu) ikon = await buatIkonDariLogo(logoPreview);
      const result = await safeFetch(`${API_URL}/settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
          Accept: 'application/json'
        },
        body: JSON.stringify({
          ...formData,
          ikon_dari_logo: !!formData.ikon_dari_logo && !!logoPreview,
          ...(ikon ? { ikon_aplikasi: ikon } : {}),
          ...Object.fromEntries(SECRET_FIELDS.flatMap(({ field }) => [
            [field, apiKeyInputs[field].trim()],
            [`hapus_${field}`, hapusApiKeys[field]],
          ])),
        }),
      });

      if (result.data) {
        // Perbarui status "sudah diisi" & model dari respons server
        setFormData((prev) => ({
          ...prev,
          ...Object.fromEntries(SECRET_FIELDS.map(({ field }) => [`has_${field}`, result.data[`has_${field}`]])),
          status_wa_api: result.data.status_wa_api,
          ai_model_name: result.data.ai_model_name,
          openkey_base_url: result.data.openkey_base_url,
          openkey_model_name: result.data.openkey_model_name,
          // Logo sudah tersimpan di server: jangan unggah ulang pada penyimpanan berikutnya
          logo_sekolah_url: result.data.logo_sekolah_url || '',
          logo_sekolah_base64: null,
          ikon_dari_logo: !!result.data.ikon_dari_logo,
        }));
        setIkonPerlu(false);
      }
      setApiKeyInputs(emptyPerProvider(''));
      setShowApiKeys(emptyPerProvider(false));
      setHapusApiKeys(emptyPerProvider(false));

      Swal.fire({ toast:true, position:'top-end', icon:'success', title:'Pengaturan Disimpan!', showConfirmButton:false, timer:2000 });
    } catch (err) {
      Swal.fire('Gagal Menyimpan', err.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) return <div className="p-4 text-center">Memuat pengaturan...</div>;

  return (
    <div className="container-fluid mt-4 mb-5">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h3 className="fw-bold text-primary m-0">
          <i className="bi bi-gear-fill me-2"></i>Pengaturan Sekolah
        </h3>
        <a href="/dashboard/akun" className="btn btn-outline-secondary btn-sm"><i className="bi bi-person-gear me-1"></i>Preferensi tampilan pribadi ada di Akun Saya</a>
      </div>

      <div className="card border-0 shadow-sm p-4">
        <form onSubmit={handleSubmit}>
          <div className="row g-3">
            <div className="col-md-6">
              <label className="form-label fw-bold small text-muted">Nama Sekolah *</label>
              <input type="text" className="form-control" name="nama_sekolah" required value={formData.nama_sekolah || ''} onChange={handleInputChange} />
            </div>
            <div className="col-md-6">
              <label className="form-label fw-bold small text-muted">NPSN</label>
              <input type="text" className="form-control" name="npsn" value={formData.npsn || ''} onChange={handleInputChange} />
            </div>
            
            <div className="col-md-12">
              <label className="form-label fw-bold small text-muted">Alamat Lengkap</label>
              <input type="text" className="form-control" name="alamat_sekolah" value={formData.alamat_sekolah || ''} onChange={handleInputChange} />
            </div>
            <div className="col-md-6">
              <label className="form-label fw-bold small text-muted">Kota/Kabupaten *</label>
              <input type="text" className="form-control" name="kota" required value={formData.kota || ''} onChange={handleInputChange} />
            </div>

            {/* LOGO RESMI SEKOLAH */}
            <div className="col-md-12">
              <label className="form-label fw-bold small text-muted" htmlFor="logoSekolah">Logo Resmi Sekolah</label>
              <div className="d-flex flex-column flex-md-row gap-4 align-items-start border p-3 rounded bg-light">
                <div className="border bg-white rounded d-flex justify-content-center align-items-center" style={{ width: '120px', height: '120px', overflow: 'hidden' }}>
                  {logoPreview ? (
                    <img src={logoPreview} alt="Logo sekolah" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                  ) : (
                    <span className="text-muted small text-center px-2">Belum ada logo</span>
                  )}
                </div>
                <div className="flex-grow-1">
                  <p className="small text-muted mb-2">
                    Dipakai di kop semua dokumen resmi: modul ajar (cetak, PDF &amp; Word), ATP, Prota &amp; Promes, paket soal, rapor, dan laporan lain.
                    Gunakan PNG berlatar transparan atau JPG, minimal 300 piksel. Bila kosong, kop memakai lambang inisial sekolah.
                  </p>
                  <input id="logoSekolah" type="file" className="form-control form-control-sm" accept="image/png, image/jpeg, image/webp" onChange={handleLogoChange} ref={logoInputRef} />
                  {logoPreview && (
                    <button type="button" className="btn btn-sm btn-outline-danger mt-2" onClick={() => {
                      setLogoPreview(null);
                      setFormData((f) => ({ ...f, logo_sekolah_base64: null, logo_sekolah_url: '' }));
                      if (logoInputRef.current) logoInputRef.current.value = '';
                    }}>
                      Hapus Logo
                    </button>
                  )}
                  <div className="form-check form-switch mt-3">
                    <input className="form-check-input" type="checkbox" role="switch" id="ikonDariLogo" disabled={!logoPreview}
                      checked={!!formData.ikon_dari_logo && !!logoPreview}
                      onChange={(e) => { setFormData((f) => ({ ...f, ikon_dari_logo: e.target.checked })); if (e.target.checked) setIkonPerlu(true); }} />
                    <label className="form-check-label small" htmlFor="ikonDariLogo">Pakai logo sekolah sebagai ikon aplikasi</label>
                    <div className="form-text">
                      Ikon di tab peramban, layar utama HP (aplikasi terpasang), dan sidebar. Bila dimatikan atau logo dihapus, kembali ke ikon bawaan.
                      Aplikasi yang sudah terpasang di HP memperbarui ikonnya sendiri beberapa waktu kemudian, atau setelah dipasang ulang.
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <hr className="my-4" />
            <h5 className="fw-bold text-secondary">Profil Kepala Sekolah</h5>

            <div className="col-md-6">
              <label className="form-label fw-bold small text-muted">Nama Kepala Sekolah *</label>
              <input type="text" className="form-control" name="nama_kepsek" required value={formData.nama_kepsek || ''} onChange={handleInputChange} />
            </div>
            <div className="col-md-6">
              <label className="form-label fw-bold small text-muted">NIP Kepala Sekolah</label>
              <input type="text" className="form-control" name="nip_kepsek" value={formData.nip_kepsek || ''} onChange={handleInputChange} />
            </div>

            {/* UPLOAD TANDA TANGAN */}
            <div className="col-md-12 mt-4">
              <label className="form-label fw-bold small text-muted">Tanda Tangan Elektronik (Kepsek)</label>
              <div className="d-flex flex-column flex-md-row gap-4 align-items-start border p-3 rounded bg-light">
                
                {/* AREA PREVIEW */}
                <div className="border bg-white rounded d-flex justify-content-center align-items-center" style={{ width: '200px', height: '100px', overflow: 'hidden' }}>
                  {ttdPreview ? (
                    <img src={ttdPreview} alt="TTD Kepsek" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                  ) : (
                    <span className="text-muted small">Belum ada TTD</span>
                  )}
                </div>

                {/* AREA INPUT */}
                <div className="flex-grow-1">
                  <p className="small text-muted mb-2">Upload gambar tanda tangan dengan latar belakang transparan (PNG) atau putih. Maksimal 2MB.</p>
                  <input type="file" className="form-control form-control-sm" accept="image/png, image/jpeg" onChange={handleFileChange} ref={fileInputRef} />
                  {ttdPreview && (
                    <button type="button" className="btn btn-sm btn-outline-danger mt-2" onClick={() => {
                      setTtdPreview(null);
                      setFormData({ ...formData, ttd_kepsek_base64: null, ttd_kepsek_url: '' });
                      if(fileInputRef.current) fileInputRef.current.value = '';
                    }}>
                      Hapus TTD
                    </button>
                  )}
                </div>
              </div>
            </div>

            <hr className="my-4" />
            <h5 className="fw-bold text-secondary mb-0">Kriteria Ketercapaian TP (KKTP)</h5>
            <p className="small text-muted mb-3">
              Batas bawah tiap tingkat capaian untuk nilai 0–100, dipakai di Input Nilai dan deskripsi capaian rapor.
              Nilai di bawah batas Cukup tergolong <b>Perlu Bimbingan</b>. Batas tuntas (remedial) tetap mengikuti KKM tiap mapel.
            </p>
            <div className="row g-3">
              {[["kktp_cukup", "Cukup mulai", 70], ["kktp_baik", "Baik mulai", 80], ["kktp_sangat_baik", "Sangat Baik mulai", 90]].map(([name, label, bawaan]) => (
                <div className="col-4" key={name}>
                  <label className="form-label fw-bold small">{label}</label>
                  <input type="number" min="1" max="100" className="form-control" name={name}
                    value={formData[name] ?? bawaan} onChange={handleInputChange} />
                </div>
              ))}
            </div>

            <hr className="my-4" />
            <h5 className="fw-bold text-secondary mb-0">Nilai Remedial di Rapor</h5>
            <p className="small text-muted mb-3">
              Berlaku untuk rapor, Laporan STNKM, dan Dashboard. Nilai remedial tetap tersimpan apa adanya, jadi kebijakan ini bisa diganti kapan saja.
              Status tuntas selalu mengikuti nilai remedial sebenarnya.
            </p>
            <div className="d-flex flex-column gap-2">
              {[["KKM", "Dibatasi setinggi KKM mapel (mis. KKM 75, remedial 92 → rapor 75)"], ["ASLI", "Apa adanya (rapor memakai nilai remedial sebenarnya)"]].map(([v, label]) => (
                <div className="form-check" key={v}>
                  <input className="form-check-input" type="radio" name="batas_nilai_remedial" id={`batas_${v}`} value={v}
                    checked={(formData.batas_nilai_remedial ?? "KKM") === v} onChange={handleInputChange} />
                  <label className="form-check-label small" htmlFor={`batas_${v}`}>{label}</label>
                </div>
              ))}
            </div>

            <hr className="my-4" />
            <h5 className="fw-bold text-secondary mb-0">Skala Predikat Kokurikuler</h5>
            <p className="small text-muted mb-3">
              Dipakai di menu Proyek dan bagian kokurikuler rapor. Predikat tetap tersimpan rinci, jadi skala bisa diganti kapan saja tanpa kehilangan data.
            </p>
            <div className="d-flex flex-column gap-2">
              {[["4", "4 tingkat: BB / MB / BSH / SB (seperti P5)"], ["3", "3 tingkat: Berkembang / Cakap / Mahir (mengikuti e-Rapor; BB & MB → Berkembang, BSH → Cakap, SB → Mahir)"]].map(([v, label]) => (
                <div className="form-check" key={v}>
                  <input className="form-check-input" type="radio" name="skala_kokurikuler" id={`skala_${v}`} value={v}
                    checked={String(formData.skala_kokurikuler ?? "4") === v} onChange={handleInputChange} />
                  <label className="form-check-label small" htmlFor={`skala_${v}`}>{label}</label>
                </div>
              ))}
            </div>

            <hr className="my-4" />
            <h5 className="fw-bold text-secondary mb-0">Integrasi AI</h5>
            <p className="small text-muted mb-0">
              Dipakai untuk analisis Jurnal Anekdotal dan Catatan Wali Kelas di rapor. Key disimpan terenkripsi di server dan tidak akan ditampilkan kembali.
              Jika key provider yang dipilih kosong atau gagal, sistem otomatis memakai mode lokal.
            </p>

            {AI_PROVIDERS.map((p) => (
              <ApiKeyField
                key={p.field}
                provider={p}
                hasKey={!!formData[`has_${p.field}`]}
                value={apiKeyInputs[p.field]}
                onChange={(v) => setApiKeyInputs((prev) => ({ ...prev, [p.field]: v }))}
                show={showApiKeys[p.field]}
                onToggleShow={() => setShowApiKeys((prev) => ({ ...prev, [p.field]: !prev[p.field] }))}
                hapus={hapusApiKeys[p.field]}
                onToggleHapus={(checked) => {
                  setHapusApiKeys((prev) => ({ ...prev, [p.field]: checked }));
                  setApiKeyInputs((prev) => ({ ...prev, [p.field]: '' }));
                }}
              />
            ))}

            <div className="col-md-6">
              <label className="form-label fw-bold small text-muted">OpenKey: Base URL</label>
              <input
                type="url"
                className="form-control"
                name="openkey_base_url"
                placeholder="https://api.contoh.com/v1"
                value={formData.openkey_base_url || ''}
                onChange={handleInputChange}
              />
              <div className="form-text">Wajib HTTPS. Boleh dengan atau tanpa akhiran /v1.</div>
            </div>
            <div className="col-md-6">
              <label className="form-label fw-bold small text-muted">OpenKey: Nama Model</label>
              <input
                type="text"
                className="form-control"
                name="openkey_model_name"
                placeholder="gpt-4o-mini"
                value={formData.openkey_model_name || ''}
                onChange={handleInputChange}
              />
            </div>

            <div className="col-md-6">
              <label className="form-label fw-bold small text-muted">Model Gemini</label>
              <input
                type="text"
                className="form-control"
                name="ai_model_name"
                list="ai-model-options"
                placeholder="gemini-2.5-flash"
                value={formData.ai_model_name || ''}
                onChange={handleInputChange}
              />
              <datalist id="ai-model-options">
                <option value="gemini-2.5-flash" />
                <option value="gemini-2.5-flash-lite" />
                <option value="gemini-2.5-pro" />
              </datalist>
              <div className="form-text">Pilih dari daftar atau ketik nama model lain. Kosongkan untuk tetap memakai model saat ini.</div>
            </div>

            <hr className="my-4" />
            <h5 className="fw-bold text-secondary mb-0">Suara Narasi Video Belajar</h5>
            <p className="small text-muted mb-0">
              Suara AI lokal (Piper) selalu tersedia tanpa biaya. ElevenLabs memakai API key di atas; Gemini memakai API key Gemini.
              Klon suara guru dibuat di situs ElevenLabs (Voices → Instant Voice Clone, dengan rekaman 1–3 menit dan persetujuan pemilik suara), lalu tempel ID suaranya di sini.
            </p>
            <div className="col-md-4">
              <label className="form-label fw-bold small text-muted" htmlFor="elNetral">ElevenLabs: ID suara netral</label>
              <input id="elNetral" type="text" className="form-control" name="elevenlabs_voice_netral" placeholder="kosong = suara bawaan" value={formData.elevenlabs_voice_netral || ''} onChange={handleInputChange} />
            </div>
            <div className="col-md-4">
              <label className="form-label fw-bold small text-muted" htmlFor="elKlon">ElevenLabs: ID suara klon</label>
              <input id="elKlon" type="text" className="form-control" name="elevenlabs_voice_klon" placeholder="ID suara hasil klon" value={formData.elevenlabs_voice_klon || ''} onChange={handleInputChange} />
            </div>
            <div className="col-md-4">
              <label className="form-label fw-bold small text-muted" htmlFor="gmSuara">Gemini: nama suara</label>
              <input id="gmSuara" type="text" className="form-control" name="gemini_tts_voice" list="gemini-suara" placeholder="Kore" value={formData.gemini_tts_voice || ''} onChange={handleInputChange} />
              <datalist id="gemini-suara"><option value="Kore" /><option value="Puck" /><option value="Leda" /><option value="Aoede" /><option value="Zephyr" /></datalist>
            </div>

            <hr className="my-4" />
            <h5 className="fw-bold text-secondary mb-0">Integrasi Canva (Studio Rakit Video)</h5>
            <p className="small text-muted mb-0">
              Agar pembuat video bisa mengimpor desain Canva: buat integrasi di <a href="https://www.canva.com/developers/integrations/connect-api" target="_blank" rel="noopener noreferrer">Canva Developer Portal</a> (Your integrations → Create an integration → Public),
              aktifkan cakupan <code>design:meta:read</code>, <code>design:content:read</code>, dan <code>profile:read</code>, lalu tambahkan Redirect URL berikut. Integrasi draf bisa dipakai akun pembuatnya tanpa menunggu review Canva.
            </p>
            <div className="col-12">
              <label className="form-label fw-bold small text-muted" htmlFor="canvaRedirect">Redirect URL (salin ke Canva)</label>
              <input id="canvaRedirect" type="text" className="form-control font-monospace" readOnly suppressHydrationWarning value={typeof window !== 'undefined' ? `${window.location.origin}/api/video-belajar/canva/kembali` : ''} onFocus={(e) => e.target.select()} />
            </div>
            <div className="col-md-6">
              <label className="form-label fw-bold small text-muted" htmlFor="canvaId">Canva: Client ID</label>
              <input id="canvaId" type="text" className="form-control" name="canva_client_id" placeholder="OC-…" value={formData.canva_client_id || ''} onChange={handleInputChange} />
            </div>
            <ApiKeyField
              provider={CANVA_SECRET}
              hasKey={!!formData.has_canva_client_secret}
              value={apiKeyInputs.canva_client_secret}
              onChange={(v) => setApiKeyInputs((prev) => ({ ...prev, canva_client_secret: v }))}
              show={showApiKeys.canva_client_secret}
              onToggleShow={() => setShowApiKeys((prev) => ({ ...prev, canva_client_secret: !prev.canva_client_secret }))}
              hapus={hapusApiKeys.canva_client_secret}
              onToggleHapus={(checked) => {
                setHapusApiKeys((prev) => ({ ...prev, canva_client_secret: checked }));
                setApiKeyInputs((prev) => ({ ...prev, canva_client_secret: '' }));
              }}
            />

            <hr className="my-4" />
            <h5 className="fw-bold text-secondary mb-0">Suara Azure (API Render)</h5>
            <p className="small text-muted mb-0">
              Dipakai video dari API Render (mis. suara <code>id-ID-ArdiNeural</code>). Buat resource <b>Speech</b> di Azure Portal (paket F0 gratis cukup untuk uji), lalu salin Key 1 dan Region-nya.
              Bila kosong, narasi API Render memakai suara Gemini (bila API key Gemini diisi) atau suara lokal Piper.
            </p>
            <ApiKeyField
              provider={AZURE_KEY}
              hasKey={!!formData.has_azure_speech_key}
              value={apiKeyInputs.azure_speech_key}
              onChange={(v) => setApiKeyInputs((prev) => ({ ...prev, azure_speech_key: v }))}
              show={showApiKeys.azure_speech_key}
              onToggleShow={() => setShowApiKeys((prev) => ({ ...prev, azure_speech_key: !prev.azure_speech_key }))}
              hapus={hapusApiKeys.azure_speech_key}
              onToggleHapus={(checked) => {
                setHapusApiKeys((prev) => ({ ...prev, azure_speech_key: checked }));
                setApiKeyInputs((prev) => ({ ...prev, azure_speech_key: '' }));
              }}
            />
            <div className="col-md-6">
              <label className="form-label fw-bold small text-muted" htmlFor="azureRegion">Azure Speech: Region</label>
              <input id="azureRegion" type="text" className="form-control" name="azure_speech_region" placeholder="mis. southeastasia" value={formData.azure_speech_region || ''} onChange={handleInputChange} />
            </div>

            <hr className="my-4" />
            <h5 className="fw-bold text-secondary mb-0">Integrasi WhatsApp</h5>
            <p className="small text-muted mb-0">
              Dipakai untuk mengirim ringkasan rapor. Tombol WA manual selalu tersedia; kirim otomatis lewat gateway Fonnte hanya berjalan jika diaktifkan dan token diisi.
            </p>

            <div className="col-md-6">
              <label className="form-label fw-bold small text-muted">Nomor WA Kepala Sekolah</label>
              <input type="tel" className="form-control" name="no_wa_kepsek" placeholder="08xxxxxxxxxx" value={formData.no_wa_kepsek || ''} onChange={handleInputChange} />
            </div>
            <div className="col-md-6">
              <label className="form-label fw-bold small text-muted">Nomor WA Admin (peringatan keamanan)</label>
              <input type="tel" className="form-control" name="no_wa_admin" placeholder="08xxxxxxxxxx" value={formData.no_wa_admin || ''} onChange={handleInputChange} />
              <div className="form-text">Menerima pesan otomatis bila satu akun gagal login 10 kali dalam 15 menit (perlu kirim otomatis Fonnte aktif).</div>
            </div>
            <div className="col-md-6">
              <label className="form-label fw-bold small text-muted">ID Grup WA Guru</label>
              <input type="text" className="form-control" name="id_wa_group_guru" placeholder="120363xxxxxxxxxx@g.us" value={formData.id_wa_group_guru || ''} onChange={handleInputChange} />
              <div className="form-text">Hanya untuk kirim otomatis; ID grup bisa dilihat di dashboard Fonnte.</div>
            </div>

            <ApiKeyField
              provider={WA_TOKEN}
              hasKey={!!formData.has_wa_api_token}
              value={apiKeyInputs.wa_api_token}
              onChange={(v) => setApiKeyInputs((prev) => ({ ...prev, wa_api_token: v }))}
              show={showApiKeys.wa_api_token}
              onToggleShow={() => setShowApiKeys((prev) => ({ ...prev, wa_api_token: !prev.wa_api_token }))}
              hapus={hapusApiKeys.wa_api_token}
              onToggleHapus={(checked) => {
                setHapusApiKeys((prev) => ({ ...prev, wa_api_token: checked }));
                setApiKeyInputs((prev) => ({ ...prev, wa_api_token: '' }));
              }}
            />
            <div className="col-md-6 d-flex align-items-center">
              <div className="form-check form-switch mt-md-4">
                <input className="form-check-input" type="checkbox" id="status_wa_api" checked={!!formData.status_wa_api}
                  onChange={(e) => setFormData({ ...formData, status_wa_api: e.target.checked })} />
                <label className="form-check-label fw-bold small" htmlFor="status_wa_api">Aktifkan kirim otomatis via Fonnte</label>
              </div>
            </div>

          </div>

          <div className="text-end mt-4 pt-3 border-top">
            <button type="submit" className="btn btn-primary fw-bold px-4" disabled={isSubmitting}>
              {isSubmitting ? <><span className="spinner-border spinner-border-sm me-2"></span>Menyimpan...</> : <><i className="bi bi-save me-2"></i>Simpan Pengaturan</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}