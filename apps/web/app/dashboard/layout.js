"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { SIDEBAR_PREF_EVENT, bacaAccordion } from "@/app/lib/sidebarPrefs";

const DASHBOARD_ITEM = { href: "/dashboard", label: "Dashboard", icon: "bi-speedometer2" };

// Grup menu sidebar; setiap grup bisa dilipat/dibuka
const MENU_GROUPS = [
  {
    id: "master", label: "Master Data", icon: "bi-database",
    items: [
      { href: "/dashboard/master-siswa", label: "Master Siswa", icon: "bi-people-fill" },
      { href: "/dashboard/master-guru", label: "Master Guru", icon: "bi-person-video3" },
      { href: "/dashboard/master-kelas", label: "Master Kelas", icon: "bi-door-open-fill" },
      { href: "/dashboard/master-mapel", label: "Master Mapel", icon: "bi-book-half" },
    ],
  },
  {
    id: "referensi", label: "Referensi Penilaian", icon: "bi-sliders2",
    items: [
      { href: "/dashboard/master-periode", label: "Master Periode", icon: "bi-calendar-week" },
      { href: "/dashboard/master-kategori", label: "Master Kategori", icon: "bi-tags" },
      { href: "/dashboard/master-mbk", label: "Master MBK", icon: "bi-list-check" },
      { href: "/dashboard/master-materi", label: "Master Materi", icon: "bi-journal-bookmark" },
    ],
  },
  {
    id: "transaksi", label: "Transaksi", icon: "bi-lightning-charge",
    items: [
      { href: "/dashboard/nilai", label: "Input Nilai", icon: "bi-pencil-square" },
      { href: "/dashboard/jurnal", label: "Jurnal Anekdotal", icon: "bi-journal-text" },
      { href: "/dashboard/presensi", label: "Presensi", icon: "bi-calendar-check" },
      { href: "/dashboard/p5", label: "Projek P5", icon: "bi-stars" },
      { href: "/dashboard/import-excel", label: "Import Excel", icon: "bi-file-earmark-arrow-up" },
    ],
  },
  {
    id: "laporan", label: "Laporan", icon: "bi-bar-chart-line",
    items: [
      { href: "/dashboard/laporan-stnkm", label: "Laporan STNKM", icon: "bi-graph-up-arrow" },
      { href: "/dashboard/rapor", label: "Cetak Rapor", icon: "bi-file-earmark-richtext" },
    ],
  },
  {
    id: "pengaturan", label: "Pengaturan", icon: "bi-gear",
    items: [
      { href: "/dashboard/pengaturan", label: "Pengaturan Sekolah", icon: "bi-gear-fill" },
    ],
  },
];

// Status sidebar disimpan per browser
const KEY_OPEN = "sidebar_open_groups";
const KEY_MINI = "sidebar_mini";
const DESKTOP_QUERY = "(min-width: 992px)";

const isActivePath = (pathname, href) =>
  href === "/dashboard" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
const normalisasi = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const bacaStorage = (key, fallback) => {
  try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
};
const tulisStorage = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage penuh/diblokir */ }
};

// Tebalkan bagian label yang cocok dengan kata kunci pencarian
const Sorot = ({ teks, kata }) => {
  if (!kata) return teks;
  const i = normalisasi(teks).indexOf(normalisasi(kata));
  if (i < 0) return teks;
  return <>{teks.slice(0, i)}<mark className="nav-search-mark">{teks.slice(i, i + kata.length)}</mark>{teks.slice(i + kata.length)}</>;
};

export default function DashboardLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState(null);

  // Desktop: sidebar penuh atau mini (ikon saja). HP/tablet: sidebar melayang yang dibuka-tutup.
  const [isDesktop, setIsDesktop] = useState(true);
  const [isMini, setIsMini] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accordion, setAccordion] = useState(true);
  const [openGroups, setOpenGroups] = useState([]);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  const [query, setQuery] = useState("");
  const [pilihanCari, setPilihanCari] = useState(0);
  const searchRef = useRef(null);

  // Menu melayang untuk grup saat sidebar mini
  const [flyout, setFlyout] = useState(null);
  const flyoutTimer = useRef(null);

  const mini = isDesktop && isMini;
  const activeGroupId = MENU_GROUPS.find((g) => g.items.some((it) => isActivePath(pathname, it.href)))?.id;

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (userData) setUser(JSON.parse(userData));

    setIsMini(bacaStorage(KEY_MINI, false) === true);
    setAccordion(bacaAccordion());
    const saved = bacaStorage(KEY_OPEN, []);
    if (Array.isArray(saved)) setOpenGroups(saved);
    setPrefsLoaded(true);

    const mq = window.matchMedia(DESKTOP_QUERY);
    const onMq = () => { setIsDesktop(mq.matches); setMobileOpen(false); };
    onMq();
    mq.addEventListener("change", onMq);

    const onPref = () => setAccordion(bacaAccordion());
    window.addEventListener(SIDEBAR_PREF_EVENT, onPref);
    window.addEventListener("storage", onPref);
    return () => {
      mq.removeEventListener("change", onMq);
      window.removeEventListener(SIDEBAR_PREF_EVENT, onPref);
      window.removeEventListener("storage", onPref);
    };
  }, []);

  // Class body dipakai AdminLTE untuk lebar sidebar (mini) dan sidebar melayang di HP
  useEffect(() => {
    const b = document.body.classList;
    b.toggle("sidebar-mini", mini);
    b.toggle("sidebar-collapse", mini);
    b.toggle("sidebar-without-hover", mini);
    b.toggle("sidebar-open", !isDesktop && mobileOpen);
  }, [mini, isDesktop, mobileOpen]);

  useEffect(() => { if (prefsLoaded) tulisStorage(KEY_MINI, isMini); }, [isMini, prefsLoaded]);
  useEffect(() => { if (prefsLoaded) tulisStorage(KEY_OPEN, openGroups); }, [openGroups, prefsLoaded]);

  // Saat accordion dinyalakan, sisakan satu grup terbuka
  useEffect(() => {
    if (accordion) setOpenGroups((prev) => (prev.length > 1 ? [activeGroupId && prev.includes(activeGroupId) ? activeGroupId : prev[0]] : prev));
  }, [accordion]);

  // Grup yang berisi halaman aktif selalu dibuka saat berpindah halaman
  useEffect(() => {
    if (!activeGroupId) return;
    setOpenGroups((prev) => (prev.includes(activeGroupId) ? prev : accordion ? [activeGroupId] : [...prev, activeGroupId]));
  }, [activeGroupId]);

  // Pindah halaman: tutup sidebar HP, menu melayang, dan pencarian
  useEffect(() => { setMobileOpen(false); setFlyout(null); setQuery(""); }, [pathname]);

  const toggleGroup = (id) =>
    setOpenGroups((prev) => (prev.includes(id) ? prev.filter((g) => g !== id) : accordion ? [id] : [...prev, id]));

  const toggleSidebar = () => {
    if (isDesktop) { setIsMini((m) => !m); setFlyout(null); }
    else setMobileOpen((o) => !o);
  };

  // --- PENCARIAN MENU ---
  const hasilCari = useMemo(() => {
    const q = normalisasi(query.trim());
    if (!q) return null;
    const cocokDash = normalisasi(DASHBOARD_ITEM.label).includes(q);
    const grup = MENU_GROUPS.map((g) => {
      const grupCocok = normalisasi(g.label).includes(q);
      return { ...g, items: g.items.filter((it) => grupCocok || normalisasi(it.label).includes(q)) };
    }).filter((g) => g.items.length);
    const datar = [...(cocokDash ? [DASHBOARD_ITEM] : []), ...grup.flatMap((g) => g.items)];
    return { cocokDash, grup, datar };
  }, [query]);

  useEffect(() => { setPilihanCari(0); }, [query]);

  const fokusCari = () => {
    if (isDesktop) setIsMini(false);
    else setMobileOpen(true);
    setFlyout(null);
    // Tunggu sidebar melebar sebelum fokus
    setTimeout(() => searchRef.current?.focus(), 60);
  };

  // Ctrl/Cmd+K atau "/" di luar kolom isian membuka pencarian menu
  useEffect(() => {
    const onKey = (e) => {
      const mengetik = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
      if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !mengetik)) {
        e.preventDefault();
        fokusCari();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isDesktop]);

  const onKeyCari = (e) => {
    const daftar = hasilCari?.datar || [];
    if (e.key === "ArrowDown") { e.preventDefault(); setPilihanCari((i) => Math.min(i + 1, daftar.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setPilihanCari((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter" && daftar[pilihanCari]) { e.preventDefault(); router.push(daftar[pilihanCari].href); searchRef.current?.blur(); }
    else if (e.key === "Escape") { setQuery(""); searchRef.current?.blur(); }
  };

  // --- MENU MELAYANG (MODE MINI) ---
  const bukaFlyout = (group, el) => {
    clearTimeout(flyoutTimer.current);
    const r = el.getBoundingClientRect();
    // Jaga agar panel tidak keluar dari bawah layar
    const tinggi = 56 + group.items.length * 40;
    setFlyout({ id: group.id, top: Math.max(8, Math.min(r.top, window.innerHeight - tinggi - 8)), left: r.right + 10 });
  };
  const tutupFlyoutNanti = () => {
    clearTimeout(flyoutTimer.current);
    flyoutTimer.current = setTimeout(() => setFlyout(null), 180);
  };
  const batalTutupFlyout = () => clearTimeout(flyoutTimer.current);
  const flyoutGroup = flyout ? MENU_GROUPS.find((g) => g.id === flyout.id) : null;

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.push("/login");
  };

  // Tandai menu aktif; "/dashboard" harus sama persis agar tidak aktif di semua halaman
  const navLinkClass = (href, extra = "") => `nav-link${isActivePath(pathname, href) ? " active" : ""}${extra}`;
  const idxCari = (href) => hasilCari?.datar.findIndex((it) => it.href === href) ?? -1;

  const renderItem = (item, i, fokusable = true) => {
    const terpilih = hasilCari && idxCari(item.href) === pilihanCari;
    return (
      <li key={item.href} className="nav-item" style={{ "--i": i }}>
        <Link href={item.href} className={navLinkClass(item.href, terpilih ? " is-search-focus" : "")} tabIndex={fokusable ? undefined : -1} title={mini ? item.label : undefined}>
          <i className={`nav-icon bi ${item.icon}`}></i>
          <p><Sorot teks={item.label} kata={query.trim()} /></p>
        </Link>
      </li>
    );
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
                onClick={toggleSidebar}
                style={{ border: "none", background: "transparent" }}
                title={isDesktop ? (isMini ? "Lebarkan sidebar" : "Ciutkan sidebar") : "Buka menu"}
                aria-label="Buka/tutup sidebar"
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
      <aside className={`app-sidebar bg-body-secondary shadow${mini ? " is-mini" : ""}`} data-bs-theme="dark">
        <div className="sidebar-brand">
          <Link href="/dashboard" className="brand-link">
            <span className="brand-text fw-light">🏫 EduRapor Admin</span>
          </Link>
        </div>
        <div className="sidebar-wrapper">
          {/* PENCARIAN MENU */}
          <div className="nav-search">
            {mini ? (
              <button type="button" className="nav-search-mini" onClick={fokusCari} title="Cari menu (Ctrl+K)" aria-label="Cari menu">
                <i className="bi bi-search"></i>
              </button>
            ) : (
              <div className="nav-search-box">
                <i className="bi bi-search nav-search-icon"></i>
                <input
                  ref={searchRef}
                  type="search"
                  className="nav-search-input"
                  placeholder="Cari menu..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={onKeyCari}
                  aria-label="Cari menu"
                />
                {query ? (
                  <button type="button" className="nav-search-clear" onClick={() => { setQuery(""); searchRef.current?.focus(); }} aria-label="Hapus pencarian">
                    <i className="bi bi-x-lg"></i>
                  </button>
                ) : (
                  <kbd className="nav-search-kbd">Ctrl K</kbd>
                )}
              </div>
            )}
          </div>

          <nav className="mt-1">
            <ul className="nav sidebar-menu flex-column" role="menu">
              {hasilCari ? (
                /* --- HASIL PENCARIAN: semua grup yang cocok ditampilkan terbuka --- */
                <>
                  {hasilCari.cocokDash && renderItem(DASHBOARD_ITEM, 0)}
                  {hasilCari.grup.map((group) => (
                    <li key={group.id} className="nav-group is-open is-search">
                      <div className="nav-search-group"><i className={`bi ${group.icon} me-2`}></i><Sorot teks={group.label} kata={query.trim()} /></div>
                      <ul className="nav flex-column nav-group-items">{group.items.map((it, i) => renderItem(it, i))}</ul>
                    </li>
                  ))}
                  {hasilCari.datar.length === 0 ? (
                    <li className="nav-search-empty"><i className="bi bi-emoji-neutral d-block fs-4 mb-1"></i>Menu &quot;{query}&quot; tidak ditemukan</li>
                  ) : (
                    <li className="nav-search-hint"><kbd>↑</kbd><kbd>↓</kbd> pilih · <kbd>Enter</kbd> buka · <kbd>Esc</kbd> batal</li>
                  )}
                </>
              ) : (
                <>
                  {renderItem(DASHBOARD_ITEM, 0)}

                  {/* --- GRUP MENU (bisa dilipat; mode mini memakai menu melayang) --- */}
                  {MENU_GROUPS.map((group) => {
                    const open = !mini && openGroups.includes(group.id);
                    const hasActive = group.id === activeGroupId;
                    return (
                      <li
                        key={group.id}
                        className={`nav-group${open ? " is-open" : ""}${hasActive ? " has-active" : ""}${flyout?.id === group.id ? " is-flyout" : ""}`}
                        onMouseEnter={mini ? (e) => bukaFlyout(group, e.currentTarget) : undefined}
                        onMouseLeave={mini ? tutupFlyoutNanti : undefined}
                      >
                        <button
                          type="button"
                          className="nav-group-toggle"
                          onClick={(e) => (mini
                            ? (flyout?.id === group.id ? setFlyout(null) : bukaFlyout(group, e.currentTarget.parentElement))
                            : toggleGroup(group.id))}
                          aria-expanded={mini ? flyout?.id === group.id : open}
                          aria-controls={mini ? "sidebar-flyout" : `grup-${group.id}`}
                          title={mini ? group.label : undefined}
                        >
                          <span className="nav-group-icon"><i className={`bi ${group.icon}`}></i></span>
                          <span className="nav-group-label">{group.label}</span>
                          <span className="nav-group-count">{group.items.length}</span>
                          <i className="bi bi-chevron-right nav-group-chevron"></i>
                        </button>
                        {!mini && (
                          <div className="nav-group-panel" id={`grup-${group.id}`} inert={!open}>
                            <ul className="nav flex-column nav-group-items">{group.items.map((it, i) => renderItem(it, i, open))}</ul>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </>
              )}
            </ul>
          </nav>
        </div>
      </aside>

      {/* LATAR GELAP SAAT SIDEBAR TERBUKA DI HP */}
      {!isDesktop && mobileOpen && <div className="sidebar-backdrop" onClick={() => setMobileOpen(false)} aria-hidden="true"></div>}

      {/* MENU MELAYANG MODE MINI */}
      {mini && flyoutGroup && (
        <div
          id="sidebar-flyout"
          className="sidebar-flyout"
          data-bs-theme="dark"
          style={{ top: flyout.top, left: flyout.left }}
          onMouseEnter={batalTutupFlyout}
          onMouseLeave={tutupFlyoutNanti}
          role="menu"
        >
          <div className="sidebar-flyout-title"><i className={`bi ${flyoutGroup.icon} me-2`}></i>{flyoutGroup.label}</div>
          <ul className="nav flex-column">
            {flyoutGroup.items.map((item, i) => (
              <li key={item.href} className="nav-item" style={{ "--i": i }}>
                <Link href={item.href} className={navLinkClass(item.href)}>
                  <i className={`bi ${item.icon}`}></i><span>{item.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* KONTEN UTAMA */}
      <main className="app-main">
        <div className="app-content">
          <div className="container-fluid">{children}</div>
        </div>
      </main>
    </div>
  );
}
