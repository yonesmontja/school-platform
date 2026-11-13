// Alamat core-api dari sisi server Next.js (jaringan Docker), bukan dari browser
const API_INTERNAL_URL = (process.env.API_INTERNAL_URL || "http://localhost:8000").replace(/\/+$/, "");

// Header keamanan untuk semua respons (halaman dan API yang diteruskan)
const HEADER_KEAMANAN = [
  // Browser mengingat untuk selalu memakai HTTPS (diabaikan browser pada http://localhost)
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Aplikasi tidak boleh dimuat di dalam iframe situs lain (clickjacking)
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" }, // mikrofon: soal membaca nyaring
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // Tombol indikator dev Next.js menutupi form di layar HP
  devIndicators: false,
  // Mode dev memblokir aset JS untuk domain selain localhost; domain tunnel harus didaftarkan
  allowedDevOrigins: ["web.saprapor.com", "*.saprapor.com"],
  async headers() {
    const aturan = [
      { source: "/:path*", headers: HEADER_KEAMANAN },
      // Service worker selalu diperiksa ulang (jangan sampai versi lama tertahan di Cloudflare/browser)
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }, { key: "Service-Worker-Allowed", value: "/" }] },
    ];
    // Mode dev: nama file JS tetap walau isinya berubah. Cloudflare mengganti "no-cache" bawaan Next.js
    // menjadi max-age 4 jam, sehingga HP memakai versi lama; "no-store" mencegah cache di Cloudflare & browser.
    if (process.env.NODE_ENV !== "production") {
      aturan.push({ source: "/_next/:path*", headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }] });
    }
    return aturan;
  },
  // Browser memanggil /api dan /storage di domain yang sama; Next.js meneruskannya ke core-api
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${API_INTERNAL_URL}/api/:path*` },
      { source: "/storage/:path*", destination: `${API_INTERNAL_URL}/storage/:path*` },
    ];
  },
  experimental: {
    // Bawaan 30 detik; pembuatan narasi AI (jurnal, rapor) bisa lebih lama, dan unggahan dokumen
    // puluhan MB lewat internet sekolah bisa butuh beberapa menit (batas yang sama di halaman Pustaka Dokumen)
    proxyTimeout: 600_000,
    // Bawaan 10 MB; lampiran jadwal (maks. 10 MB) dikirim sebagai base64 (±13,4 MB), dan dokumen Pustaka
    // (maks. 50 MB) bersama teks hasil baca browser. Lebih dari batas ini Next.js memotong kiriman diam-diam.
    proxyClientMaxBodySize: "64mb",
  },
};

export default nextConfig;
