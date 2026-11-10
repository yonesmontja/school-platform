// Alat bantu tes: halaman yang memakai API tes, masuk sebagai peran tertentu, dan penjaga error.
const base = require("@playwright/test");

const API = process.env.API_E2E || "http://127.0.0.1:8090";
const SANDI = "Uji-E2E-2026";
const AKUN = { admin: "admin.e2e", kepsek: "kepsek.e2e", guru: "guru.e2e", guru2: "guru2.e2e", ortu: "ortu.e2e", siswa: "siswa.e2e" };

async function masukApi(peran) {
  const res = await fetch(`${API}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ login: AKUN[peran], password: SANDI }),
  });
  if (!res.ok) throw new Error(`Login ${peran} gagal: ${res.status}`);
  return res.json();
}

/**
 * Unggah berkas lewat API tes (multipart). Dipakai untuk unggahan berkas karena Chromium tidak menyerahkan isi berkas
 * ke permintaan yang disadap tes; di situs sebenarnya halaman & /api satu origin sehingga unggahan dari halaman berjalan.
 */
async function unggahApi(sesi, path, kolom, berkas) {
  const fs = require("fs");
  const form = new FormData();
  for (const [k, v] of Object.entries(kolom)) form.append(k, v);
  form.append(berkas.nama, new Blob([fs.readFileSync(berkas.path)], { type: berkas.tipe }), require("path").basename(berkas.path));
  const res = await fetch(`${API}/api${path}`, { method: "POST", headers: { Authorization: `Bearer ${sesi.access_token}`, Accept: "application/json" }, body: form });
  if (!res.ok) throw new Error(`Unggah gagal: ${res.status} ${await res.text()}`);
  return res.json();
}

/** Panggil API tes langsung (untuk memeriksa data yang disimpan lewat halaman). */
async function api(sesi, path) {
  const res = await fetch(`${API}/api${path}`, { headers: { Authorization: `Bearer ${sesi.access_token}`, Accept: "application/json" } });
  return res.json();
}

const test = base.test.extend({
  page: async ({ page }, use) => {
    // Semua /api (dan berkas unggahan /storage) diteruskan ke API tes; halaman tetap dari WEB_URL
    await page.route((url) => url.pathname.includes("/api/") || url.pathname.startsWith("/storage/"), async (route) => {
      const asal = new URL(route.request().url());
      try {
        const response = await route.fetch({ url: API + asal.pathname + asal.search });
        await route.fulfill({ response });
      } catch (e) {
        // Permintaan yang masih berjalan saat tes selesai & halaman ditutup: abaikan
        if (!/closed/.test(String(e))) throw e;
      }
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.errorsJs = errors;
    await use(page);
    base.expect(errors, "Tidak boleh ada error JavaScript di halaman").toEqual([]);
  },
  // masuk("guru") → token & user disimpan seperti setelah login, lalu sesi dikembalikan
  masuk: async ({ page }, use) => {
    await use(async (peran) => {
      const sesi = await masukApi(peran);
      await page.addInitScript(([token, user]) => {
        localStorage.setItem("token", token);
        localStorage.setItem("user", user);
      }, [sesi.access_token, JSON.stringify(sesi.data)]);
      return sesi;
    });
  },
});

/** Pilih opsi <select> berdasarkan teks label (mis. "4A"). */
async function pilih(select, teks) {
  const nilai = await select.locator("option", { hasText: teks }).first().getAttribute("value");
  await select.selectOption(nilai);
}

/** <select> tepat setelah label berteks tertentu (pola formulir di aplikasi: label + select). */
const selectBerlabel = (page, teks) =>
  page.locator(`xpath=//label[contains(normalize-space(.), "${teks}")]/following::select[1]`).first();

const hariIni = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Jayapura" });

module.exports = { test, expect: base.expect, api, unggahApi, pilih, selectBerlabel, hariIni, SANDI, AKUN, API };
