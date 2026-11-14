// Manifest PWA: aplikasi bisa dipasang di layar utama HP/laptop dan dibuka seperti aplikasi biasa.
// Ikon lewat /api/ikon-aplikasi: logo sekolah bila diaktifkan admin, selain itu dialihkan ke /icons bawaan.
export default function manifest() {
  return {
    name: "SAPrapor — Sistem Informasi Akademik",
    short_name: "SAPrapor",
    description: "Nilai, jurnal STNKM, presensi, remedial, dan rapor dalam satu aplikasi sekolah.",
    id: "/dashboard",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "any",
    lang: "id",
    background_color: "#f1f5f9",
    theme_color: "#2563eb",
    categories: ["education", "productivity"],
    icons: [
      { src: "/api/ikon-aplikasi/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/api/ikon-aplikasi/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/api/ikon-aplikasi/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Perlu Tindakan", url: "/dashboard/notifikasi", icons: [{ src: "/api/ikon-aplikasi/icon-192.png", sizes: "192x192" }] },
      { name: "Input Nilai", url: "/dashboard/nilai", icons: [{ src: "/api/ikon-aplikasi/icon-192.png", sizes: "192x192" }] },
      { name: "Presensi", url: "/dashboard/presensi", icons: [{ src: "/api/ikon-aplikasi/icon-192.png", sizes: "192x192" }] },
      { name: "Jurnal", url: "/dashboard/jurnal", icons: [{ src: "/api/ikon-aplikasi/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
