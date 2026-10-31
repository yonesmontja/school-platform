'use client';

import { useState, useEffect, useRef } from 'react';
import Swal from 'sweetalert2';

// Harus sama dengan SchoolSetting::API_KEY_FIELDS di backend
const AI_PROVIDERS = [
  { field: 'api_key_gemini', label: 'Google Gemini', placeholder: 'Tempel API key dari Google AI Studio' },
  { field: 'api_key_claude', label: 'Anthropic Claude', placeholder: 'Tempel API key dari Claude Console' },
  { field: 'api_key_qwen', label: 'Qwen (via OpenRouter)', placeholder: 'Tempel API key dari OpenRouter' },
  { field: 'api_key_deepseek', label: 'DeepSeek', placeholder: 'Tempel API key dari DeepSeek Platform' },
  { field: 'api_key_openkey', label: 'OpenKey (API kustom kompatibel OpenAI)', placeholder: 'Tempel API key endpoint kustom' },
];

const emptyPerProvider = (value) => Object.fromEntries(AI_PROVIDERS.map((p) => [p.field, value]));

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
  // API key tidak pernah dikirim dari server; input ini hanya untuk key baru
  const [apiKeyInputs, setApiKeyInputs] = useState(emptyPerProvider(''));
  const [showApiKeys, setShowApiKeys] = useState(emptyPerProvider(false));
  const [hapusApiKeys, setHapusApiKeys] = useState(emptyPerProvider(false));

  const API_URL = 'http://localhost:8000/api';
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
        if (data.ttd_kepsek_url) {
          // Jika URL dari backend adalah path lokal (misal /storage/...), kita bisa langsung tampilkan
          // Pastikan API_URL dasar disesuaikan (jika path relatif, tambahkan http://localhost:8000)
          const fullUrl = data.ttd_kepsek_url.startsWith('http') 
            ? data.ttd_kepsek_url 
            : `http://localhost:8000${data.ttd_kepsek_url}`;
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    Swal.fire({
      title: 'Menyimpan...', text: 'Menyimpan pengaturan sekolah.', allowOutsideClick: false,
      didOpen: () => { Swal.showLoading(); }
    });

    try {
      const result = await safeFetch(`${API_URL}/settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
          Accept: 'application/json'
        },
        body: JSON.stringify({
          ...formData,
          ...Object.fromEntries(AI_PROVIDERS.flatMap(({ field }) => [
            [field, apiKeyInputs[field].trim()],
            [`hapus_${field}`, hapusApiKeys[field]],
          ])),
        }),
      });

      if (result.data) {
        // Perbarui status "sudah diisi" & model dari respons server
        setFormData((prev) => ({
          ...prev,
          ...Object.fromEntries(AI_PROVIDERS.map(({ field }) => [`has_${field}`, result.data[`has_${field}`]])),
          ai_model_name: result.data.ai_model_name,
          openkey_base_url: result.data.openkey_base_url,
          openkey_model_name: result.data.openkey_model_name,
        }));
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
            <h5 className="fw-bold text-secondary mb-0">Integrasi AI</h5>
            <p className="small text-muted mb-0">
              Dipakai untuk analisis Jurnal Anekdotal. Key disimpan terenkripsi di server dan tidak akan ditampilkan kembali.
              Jika key provider yang dipilih kosong atau gagal, analisis otomatis memakai Heuristik Lokal.
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