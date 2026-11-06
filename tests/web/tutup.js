// Setelah tes: hentikan API tes agar tidak memakan memori (database tes tetap ada untuk diperiksa).
const { execSync } = require("node:child_process");
const path = require("node:path");

module.exports = async () => {
  const compose = path.resolve(__dirname, "../../infra/docker-compose.yml");
  execSync(`docker compose -f "${compose}" --profile e2e stop core-api-e2e`, { stdio: "ignore" });
};
