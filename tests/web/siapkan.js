// Sebelum tes: pastikan API tes berjalan, kosongkan & isi ulang database sekolah fiktif, lalu panaskan
// halaman web agar tes pertama tidak kehabisan waktu menunggu kompilasi (next dev) atau server dingin.
const { execSync } = require("node:child_process");
const path = require("node:path");

const API = process.env.API_E2E || "http://127.0.0.1:8090";
const WEB = process.env.WEB_URL || "http://localhost:3001";
const HALAMAN = [
  "/login", "/dashboard", "/dashboard/nilai", "/dashboard/jurnal", "/dashboard/presensi", "/dashboard/rapor",
  "/dashboard/portal", "/dashboard/notifikasi", "/dashboard/akun", "/dashboard/jadwal",
];
const jalankan = (cmd) => execSync(cmd, { stdio: "inherit", env: { ...process.env, MSYS_NO_PATHCONV: "1" } });

async function tunggu(url, kali = 60) {
  for (let i = 0; i < kali; i++) {
    try { if ((await fetch(url)).ok) return; } catch (e) { /* belum siap */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
}

module.exports = async () => {
  const infra = path.resolve(__dirname, "../../infra");
  jalankan(`docker compose -f "${path.join(infra, "docker-compose.yml")}" --profile e2e up -d core-api-e2e`);
  // Panaskan halaman sambil API tes bersiap
  const panas = Promise.all(HALAMAN.map((p) => fetch(WEB + p).catch(() => {})));
  await tunggu(`${API}/api/health`, 120);
  jalankan("docker exec school_core_api_e2e php artisan e2e:siapkan");
  await panas;
};
