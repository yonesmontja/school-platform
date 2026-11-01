// app/login/page.js
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { login } from '../lib/api';
import { halamanAwal } from '../lib/akses';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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

  return (
    <div style={styles.container} data-bs-theme="light">
      <div style={styles.card}>
        <h1 style={styles.title}>🏫 School Platform</h1>
        <p style={styles.subtitle}>Masuk ke akun Anda</p>

        {error && <div style={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Email / Username / NISN</label>
            <input
              type="text"
              autoComplete="username"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="mis. admin@sekolah.com atau NISN"
              required
              style={styles.input}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
              style={styles.input}
            />
          </div>

          <button type="submit" disabled={loading} style={styles.button}>
            {loading ? 'Memproses...' : 'Login'}
          </button>
        </form>
        <p style={styles.hint}>Siswa masuk dengan NISN; orang tua dengan <b>ortu.NISN</b> anak. Lupa password? Hubungi admin sekolah.</p>
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  card: {
    background: 'white',
    padding: '40px',
    borderRadius: '12px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
    width: '100%',
    maxWidth: '400px',
  },
  title: {
    margin: 0,
    fontSize: '24px',
    textAlign: 'center',
    color: '#333',
  },
  subtitle: {
    textAlign: 'center',
    color: '#666',
    marginBottom: '30px',
  },
  formGroup: {
    marginBottom: '20px',
  },
  label: {
    display: 'block',
    marginBottom: '6px',
    fontSize: '14px',
    fontWeight: '600',
    color: '#333',
  },
  input: {
    width: '100%',
    padding: '12px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    fontSize: '14px',
    boxSizing: 'border-box',
    outline: 'none',
  },
  button: {
    width: '100%',
    padding: '12px',
    background: '#667eea',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  hint: {
    marginTop: '18px',
    marginBottom: 0,
    fontSize: '12px',
    color: '#888',
    textAlign: 'center',
    lineHeight: 1.5,
  },
  error: {
    background: '#fee',
    color: '#c33',
    padding: '10px',
    borderRadius: '6px',
    marginBottom: '20px',
    fontSize: '14px',
  },
};