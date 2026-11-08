// Konfigurasi alat ukur HP murah. Contoh: docker run -d --name school_web_ukur -p 127.0.0.1:3004:3000 infra-web
// lalu: WEB_URL=http://localhost:3004 npx playwright test --config alat/playwright.ukur.js
const dasar = require("../playwright.config.js");
module.exports = { ...dasar, testDir: ".", testMatch: /ukur-hp\.spec\.js/, projects: [{ name: "ukur", use: { ...dasar.projects[0].use } }] };
