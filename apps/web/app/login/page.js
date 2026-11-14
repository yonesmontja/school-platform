// app/login/page.js
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { login } from '../lib/api';
import { halamanAwal } from '../lib/akses';
import './login.css';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
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

            {error && (
              <div className="alert alert-danger d-flex align-items-center gap-2 py-2" role="alert">
                <i className="bi bi-exclamation-circle"></i><span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate={false}>
              <div className="mb-3">
                <label className="form-label" htmlFor="masuk-login">Email / Username / NISN</label>
                <input
                  id="masuk-login"
                  type="text"
                  className="form-control"
                  autoComplete="username"
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="mis. admin@sekolah.com atau NISN"
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
      </div>
    </div>
  );
}
