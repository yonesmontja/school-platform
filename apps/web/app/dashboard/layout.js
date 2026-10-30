"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function DashboardLayout({ children }) {
  const router = useRouter();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    // Mengatur class pada body agar AdminLTE tahu sidebar harus dilipat atau tidak
    if (isCollapsed) {
      document.body.classList.add("sidebar-collapse");
    } else {
      document.body.classList.remove("sidebar-collapse");
    }

    // Ambil data user dari localStorage
    const userData = localStorage.getItem("user");
    if (userData) {
      setUser(JSON.parse(userData));
    }
  }, [isCollapsed]);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.push("/login");
  };

  return (
    <div className="app-wrapper">
      {/* NAVBAR ATAS */}
      <nav className="app-header navbar navbar-expand bg-white shadow-sm mb-4">
        <div className="container-fluid">
          <ul className="navbar-nav">
            <li className="nav-item">
              <button
                className="nav-link btn btn-link"
                onClick={() => setIsCollapsed(!isCollapsed)}
                style={{ border: "none", background: "transparent" }}
              >
                <i className="bi bi-list fs-5"></i>
              </button>
            </li>
            <li className="nav-item d-none d-md-block">
              <span className="nav-link fw-bold text-dark">
                <i className="bi bi-mortarboard-fill text-primary me-2"></i>
                Sistem Informasi Akademik & Analitik STNKM
              </span>
            </li>
          </ul>
          <ul className="navbar-nav ms-auto align-items-center">
            {/* BADGE USER */}
            {user && (
              <li className="nav-item me-3 d-none d-md-block">
                <div className="badge bg-light text-dark border px-3 py-2 rounded-pill shadow-sm">
                  <i className="bi bi-person-circle text-primary me-1"></i>
                  {user.name} ({user.role ? user.role.toUpperCase() : "USER"})
                </div>
              </li>
            )}
            {/* TOMBOL LOGOUT */}
            <li className="nav-item">
              <button
                onClick={handleLogout}
                className="btn btn-danger btn-sm rounded-pill px-3 fw-bold"
              >
                <i className="bi bi-power me-1"></i> Keluar
              </button>
            </li>
          </ul>
        </div>
      </nav>

      {/* SIDEBAR KIRI */}
      <aside
        className="app-sidebar bg-body-secondary shadow"
        data-bs-theme="dark"
      >
        <div className="sidebar-brand">
          <a href="/dashboard" className="brand-link">
            <span className="brand-text fw-light">🏫 EduRapor Admin</span>
          </a>
        </div>
        <div className="sidebar-wrapper">
          <nav className="mt-2">
            <ul
              className="nav sidebar-menu flex-column"
              data-lte-toggle="treeview"
              role="menu"
            >
              <li className="nav-item">
                <a href="/dashboard" className="nav-link">
                  <i className="nav-icon bi bi-speedometer2"></i>
                  <p>Dashboard</p>
                </a>
              </li>
              <li className="nav-item">
                <a href="/dashboard/master-siswa" className="nav-link active">
                  <i className="nav-icon bi bi-people-fill"></i>
                  <p>Master Siswa</p>
                </a>
              </li>
              <li className="nav-item">
                <a href="/dashboard/pengaturan" className="nav-link">
                  <i className="nav-icon bi bi-gear-fill"></i>
                  <p>Pengaturan Sekolah</p>
                </a>
              </li>
              <li className="nav-item">
                <a href="/dashboard/master-guru" className="nav-link">
                  <i className="nav-icon bi bi-gear-fill"></i>
                  <p>Master Guru</p>
                </a>
              </li>
              <li className="nav-item">
                <a href="/dashboard/master-kelas" className="nav-link">
                  <i className="nav-icon bi bi-door-open-fill"></i>
                  <p>Master Kelas</p>
                </a>
              </li>
              <li className="nav-item">
                <a href="/dashboard/master-mapel" className="nav-link">
                  <i className="nav-icon bi bi-book-half"></i>
                  <p>Master Mapel</p>
                </a>
              </li>
              <li className="nav-item">
                <a href="/dashboard/nilai" className="nav-link">
                  <i className="nav-icon bi bi-pencil-square"></i>
                  <p>Input Nilai</p>
                </a>
              </li>
            </ul>
          </nav>
        </div>
      </aside>

      {/* KONTEN UTAMA */}
      <main className="app-main">
        <div className="app-content">
          <div className="container-fluid">{children}</div>
        </div>
      </main>
    </div>
  );
}
