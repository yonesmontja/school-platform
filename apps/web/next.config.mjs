// Alamat core-api dari sisi server Next.js (jaringan Docker), bukan dari browser
const API_INTERNAL_URL = (process.env.API_INTERNAL_URL || "http://localhost:8000").replace(/\/+$/, "");

/** @type {import('next').NextConfig} */
const nextConfig = {
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
