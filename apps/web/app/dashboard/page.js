"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

const API_URL = "http://localhost:8000/api";
const getToken = () => localStorage.getItem("token");

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState({ siswa: 0, guru: 0, kelas: 0, mapel: 0 });

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (!userData || !getToken()) { router.push("/login"); return; }
    setUser(JSON.parse(userData));

    const fetchStats = async () => {
      const headers = { Authorization: `Bearer ${getToken()}`, Accept: "application/json" };
      try {
        const responses = await Promise.all([
          fetch(`${API_URL}/students`, { headers }),
          fetch(`${API_URL}/teachers`, { headers }),
          fetch(`${API_URL}/classes`, { headers }),
          fetch(`${API_URL}/subjects`, { headers }),
        ]);

        // Token kedaluwarsa / tidak valid: kembali ke login
        if (responses.some((res) => res.status === 401)) {
          localStorage.removeItem("token");
          localStorage.removeItem("user");
          router.push("/login");
          return;
        }

        const [sData, tData, cData, mData] = await Promise.all(responses.map((res) => res.json()));
        setStats({
          siswa: (sData.data || []).length,
          guru: (tData.data || []).length,
          kelas: (cData.data || []).length,
          mapel: (mData.data || []).length,
        });
      } catch (err) { console.error(err); }
    };
    fetchStats();
  }, [router]);

  const cards = [
    { label: "Total Siswa", value: stats.siswa, icon: "bi-people-fill", color: "primary", link: "/dashboard/master-siswa" },
    { label: "Total Guru", value: stats.guru, icon: "bi-person-video3", color: "success", link: "/dashboard/master-guru" },
    { label: "Total Kelas", value: stats.kelas, icon: "bi-door-open-fill", color: "warning", link: "/dashboard/master-kelas" },
    { label: "Total Mapel", value: stats.mapel, icon: "bi-book-half", color: "info", link: "/dashboard/master-mapel" },
  ];

  return (
    <div className="container-fluid mt-4">
      <div className="mb-4">
        <h3 className="fw-bold text-primary mb-1">
          Selamat Datang, {user?.name || "Admin"}! 👋
        </h3>
        <p className="text-muted">Sistem Informasi Akademik & Analitik STNKM</p>
      </div>

      <div className="row g-3 mb-4">
        {cards.map((c) => (
          <div className="col-md-3 col-6" key={c.link}>
            <div className={`card border-0 shadow-sm h-100 border-start border-${c.color} border-4`}
                 style={{ cursor: "pointer" }} onClick={() => router.push(c.link)}>
              <div className="card-body">
                <div className="d-flex justify-content-between align-items-center">
                  <div>
                    <p className="text-muted small mb-1">{c.label}</p>
                    <h2 className="fw-bold text-dark m-0">{c.value}</h2>
                  </div>
                  <i className={`bi ${c.icon} text-${c.color}`} style={{ fontSize: "2.5rem", opacity: 0.3 }}></i>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="row g-3">
        <div className="col-md-6">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-body">
              <h5 className="fw-bold text-secondary mb-3"><i className="bi bi-info-circle me-2"></i>Informasi Akun</h5>
              <table className="table table-sm table-borderless mb-0">
                <tbody>
                  <tr><td width="30%" className="text-muted">Nama</td><td className="fw-bold">{user?.name}</td></tr>
                  <tr><td className="text-muted">Email</td><td className="fw-bold">{user?.email}</td></tr>
                  <tr><td className="text-muted">Role</td><td><span className="badge bg-primary">{user?.role?.toUpperCase()}</span></td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div className="col-md-6">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-body">
              <h5 className="fw-bold text-secondary mb-3"><i className="bi bi-rocket-takeoff me-2"></i>Akses Cepat</h5>
              <div className="d-flex flex-column gap-2">
                <a href="/dashboard/nilai" className="btn btn-outline-primary text-start"><i className="bi bi-pencil-square me-2"></i>Input Nilai Siswa</a>
                <a href="/dashboard/master-siswa" className="btn btn-outline-success text-start"><i className="bi bi-person-plus me-2"></i>Tambah Siswa Baru</a>
                <a href="/dashboard/pengaturan" className="btn btn-outline-secondary text-start"><i className="bi bi-gear me-2"></i>Pengaturan Sekolah</a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
