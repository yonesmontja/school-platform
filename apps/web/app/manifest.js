// Manifest PWA: aplikasi bisa dipasang di layar utama HP/laptop dan dibuka seperti aplikasi biasa
export default function manifest() {
  return {
    name: "EduRapor — Sistem Informasi Akademik",
    short_name: "EduRapor",
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
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Perlu Tindakan", url: "/dashboard/notifikasi", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Input Nilai", url: "/dashboard/nilai", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Presensi", url: "/dashboard/presensi", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Jurnal", url: "/dashboard/jurnal", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
