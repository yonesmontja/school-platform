// Sebelum tes: pastikan API tes berjalan, lalu kosongkan & isi ulang database sekolah fiktif.
const { execSync } = require("node:child_process");
const path = require("node:path");

const API = process.env.API_E2E || "http://127.0.0.1:8090";
const jalankan = (cmd) => execSync(cmd, { stdio: "inherit", env: { ...process.env, MSYS_NO_PATHCONV: "1" } });

module.exports = async () => {
  const infra = path.resolve(__dirname, "../../infra");
  jalankan(`docker compose -f "${path.join(infra, "docker-compose.yml")}" --profile e2e up -d core-api-e2e`);
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${API}/api/health`)).ok) break; } catch (e) { /* belum siap */ }
    await new Promise((r) => setTimeout(r, 2000));
  }
  jalankan("docker exec school_core_api_e2e php artisan e2e:siapkan");
};
