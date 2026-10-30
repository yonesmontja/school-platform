'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getUser } from '../lib/api';

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login');
      return;
    }

    getUser(token)
      .then((data) => setUser(data))
      .catch(() => {
        localStorage.removeItem('token');
        router.push('/login');
      })
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) {
    return <div className="p-4 text-center">Memuat data...</div>;
  }

  return (
    <div className="p-4">
      <h1 className="fw-bold">Selamat datang, {user?.name}!</h1>
      <p className="text-muted">Ini adalah halaman dashboard Anda.</p>

      <div className="card shadow-sm mt-4 border-0" style={{ maxWidth: '500px' }}>
        <div className="card-header bg-white fw-bold">
          📋 Info Akun
        </div>
        <div className="card-body">
          <table className="table table-borderless mb-0">
            <tbody>
              <tr>
                <td className="text-muted" width="30%">ID</td>
                <td className="fw-bold">{user?.id}</td>
              </tr>
              <tr>
                <td className="text-muted">Email</td>
                <td className="fw-bold">{user?.email}</td>
              </tr>
              <tr>
                <td className="text-muted">Nama</td>
                <td className="fw-bold">{user?.name}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}