// app/login/page.js
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { login } from '../lib/api';
import { halamanAwal } from '../lib/akses';
import './login.css';

// Peran dari beranda (?peran=…): hanya mengubah petunjuk isian; semua peran tetap masuk lewat endpoint yang sama
const PERAN_MASUK = {
  guru: { judul: 'Guru & Wali Kelas', ikon: 'bi-easel2', label: 'Email / Username', contoh: 'mis. nama@sekolah.com' },
  pengelola: { judul: 'Kepala Sekolah & Pengelola', ikon: 'bi-building', label: 'Email / Username', contoh: 'mis. kepsek@sekolah.com' },
  ortu: { judul: 'Orang Tua / Wali', ikon: 'bi-people', label: 'Username orang tua', contoh: 'ortu.NISN anak, mis. ortu.0123456789' },
  siswa: { judul: 'Siswa', ikon: 'bi-backpack', label: 'NISN', contoh: 'NISN Anda', angka: true },
};

export default function LoginPage() {
  const router = useRouter();
  const [peran, setPeran] = useState(null);
  // Dibaca di klien (bukan useSearchParams) agar halaman tidak perlu batas Suspense saat build
  const [email, setEmail] = useState('');
  // ?u= dari QR kartu peserta ujian: NISN langsung terisi, tinggal ketik sandi
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setPeran(PERAN_MASUK[q.get('peran')] || null);
    const u = q.get('u');
    if (u) { setEmail(u.slice(0, 100)); setTimeout(() => document.getElementById('masuk-sandi')?.focus(), 50); }
  }, []);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [lihatSandi, setLihatSandi] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = await login(email, password);
      localStorage.setItem('token', data.access_token);
      localStorage.setItem('user', JSON.stringify(data.data));
      router.push(halamanAwal(data.data));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Gaya Tabler "sign-in": logo di atas, kartu isian di tengah, mengikuti tema terang/gelap & warna aksen
  return (
    <div className="halaman-masuk">
      <div className="masuk-wadah">
        <div className="masuk-merek">
          <img className="masuk-ikon" src="/api/ikon-aplikasi/icon-192.png" alt="" width="40" height="40" />
          <span>SAPrapor</span>
        </div>

        <div className="card masuk-kartu">
          <div className="card-body">
            <h1 className="masuk-judul">Masuk ke akun Anda</h1>
            {peran && (
              <p className="masuk-peran"><i className={`bi ${peran.ikon}`} aria-hidden="true"></i>Masuk sebagai <b>{peran.judul}</b></p>
            )}

            {error && (
              <div className="alert alert-danger d-flex align-items-center gap-2 py-2" role="alert">
                <i className="bi bi-exclamation-circle"></i><span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate={false}>
              <div className="mb-3">
                <label className="form-label" htmlFor="masuk-login">{peran?.label || 'Email / Username / NISN'}</label>
                <input
                  id="masuk-login"
                  type="text"
                  className="form-control"
                  autoComplete="username"
                  autoFocus
                  inputMode={peran?.angka ? 'numeric' : undefined}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={peran?.contoh || 'mis. admin@sekolah.com atau NISN'}
                  required
                />
              </div>

              <div className="mb-3">
                <label className="form-label" htmlFor="masuk-sandi">Kata sandi</label>
                <div className="input-group masuk-sandi">
                  <input
                    id="masuk-sandi"
                    type={lihatSandi ? 'text' : 'password'}
                    className="form-control"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Kata sandi Anda"
                    autoComplete="current-password"
                    required
                  />
                  <button type="button" className="btn masuk-mata" onClick={() => setLihatSandi((v) => !v)}
                    aria-label={lihatSandi ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'} aria-pressed={lihatSandi}
                    title={lihatSandi ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}>
                    <i className={`bi ${lihatSandi ? 'bi-eye-slash' : 'bi-eye'}`}></i>
                  </button>
                </div>
              </div>

              <button type="submit" className="btn btn-primary w-100" disabled={loading}>
                {loading ? <><span className="spinner-border spinner-border-sm me-2"></span>Memproses...</> : 'Masuk'}
              </button>
            </form>
          </div>
        </div>

        <p className="masuk-petunjuk">
          Siswa masuk dengan NISN; orang tua dengan <b>ortu.NISN</b> anak.<br />Lupa kata sandi? Hubungi admin sekolah.
        </p>
        <p className="masuk-kembali">
          <Link href="/"><i className="bi bi-arrow-left" aria-hidden="true"></i> Kembali ke beranda</Link>
        </p>
      </div>
    </div>
  );
}
