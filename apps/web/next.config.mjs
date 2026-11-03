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
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // Mode dev memblokir aset JS untuk domain selain localhost; domain tunnel harus didaftarkan
  allowedDevOrigins: ["web.saprapor.com", "*.saprapor.com"],
  async headers() {
    return [{ source: "/:path*", headers: HEADER_KEAMANAN }];
  },
  // Browser memanggil /api dan /storage di domain yang sama; Next.js meneruskannya ke core-api
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${API_INTERNAL_URL}/api/:path*` },
      { source: "/storage/:path*", destination: `${API_INTERNAL_URL}/storage/:path*` },
    ];
  },
  experimental: {
    // Bawaan 30 detik; pembuatan narasi AI (jurnal, rapor) bisa lebih lama
    proxyTimeout: 180_000,
    // Bawaan 10 MB; lampiran jadwal (maks. 10 MB) dikirim sebagai base64 sehingga ±13,4 MB
    proxyClientMaxBodySize: "25mb",
  },
};

export default nextConfig;
