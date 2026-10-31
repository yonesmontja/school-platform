"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";

export default function DashboardLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
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

  // Tandai menu aktif; "/dashboard" harus sama persis agar tidak aktif di semua halaman
  const navLinkClass = (href) => {
    const isActive =
      href === "/dashboard"
        ? pathname === href
        : pathname === href || pathname.startsWith(`${href}/`);
    return isActive ? "nav-link active" : "nav-link";
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
              {/* --- MENU UTAMA --- */}
              <li className="nav-header">MENU UTAMA</li>
              <li className="nav-item">
                <a href="/dashboard" className={navLinkClass("/dashboard")}>
                  <i className="nav-icon bi bi-speedometer2"></i>
                  <p>Dashboard</p>
                </a>
              </li>

              {/* --- MASTER DATA --- */}
              <li className="nav-header">MASTER DATA</li>
              <li className="nav-item">
                <a href="/dashboard/master-siswa" className={navLinkClass("/dashboard/master-siswa")}>
                  <i className="nav-icon bi bi-people-fill"></i>
                  <p>Master Siswa</p>
                </a>
              </li>
              <li className="nav-item">
                <a href="/dashboard/master-guru" className={navLinkClass("/dashboard/master-guru")}>
                  <i className="nav-icon bi bi-person-video3"></i>
                  <p>Master Guru</p>
                </a>
              </li>
              <li className="nav-item">
                <a href="/dashboard/master-kelas" className={navLinkClass("/dashboard/master-kelas")}>
                  <i className="nav-icon bi bi-door-open-fill"></i>
                  <p>Master Kelas</p>
                </a>
              </li>
              <li className="nav-item">
                <a href="/dashboard/master-mapel" className={navLinkClass("/dashboard/master-mapel")}>
                  <i className="nav-icon bi bi-book-half"></i>
                  <p>Master Mapel</p>
                </a>
              </li>

              {/* --- REFERENSI PENILAIAN --- */}
              <li className="nav-header">REFERENSI PENILAIAN</li>
              <li className="nav-item">
                <a href="/dashboard/master-periode" className={navLinkClass("/dashboard/master-periode")}>
                  <i className="nav-icon bi bi-calendar-week"></i>
                  <p>Master Periode</p>
                </a>
              </li>
              <li className="nav-item">
                <a href="/dashboard/master-kategori" className={navLinkClass("/dashboard/master-kategori")}>
                  <i className="nav-icon bi bi-tags"></i>
                  <p>Master Kategori</p>
                </a>
              </li>
              <li className="nav-item">
                <a href="/dashboard/master-mbk" className={navLinkClass("/dashboard/master-mbk")}>
                  <i className="nav-icon bi bi-list-check"></i>
                  <p>Master MBK</p>
                </a>
              </li>
              <li className="nav-item">
                <a href="/dashboard/master-materi" className={navLinkClass("/dashboard/master-materi")}>
                  <i className="nav-icon bi bi-journal-bookmark"></i>
                  <p>Master Materi</p>
                </a>
              </li>

              {/* --- TRANSAKSI --- */}
              <li className="nav-header">TRANSAKSI</li>
              <li className="nav-item">
                <a href="/dashboard/nilai" className={navLinkClass("/dashboard/nilai")}>
                  <i className="nav-icon bi bi-pencil-square"></i>
                  <p>Input Nilai</p>
                </a>
              </li>
              <li className="nav-item">
                <a href="/dashboard/jurnal" className={navLinkClass("/dashboard/jurnal")}>
                  <i className="nav-icon bi bi-journal-text"></i>
                  <p>Jurnal Anekdotal</p>
                </a>
              </li>

              {/* --- PENGATURAN --- */}
              <li className="nav-header">PENGATURAN</li>
              <li className="nav-item">
                <a href="/dashboard/pengaturan" className={navLinkClass("/dashboard/pengaturan")}>
                  <i className="nav-icon bi bi-gear-fill"></i>
                  <p>Pengaturan Sekolah</p>
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
