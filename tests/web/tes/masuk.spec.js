// Login lewat formulir: tiap peran diarahkan ke halaman awalnya, sandi salah ditolak.
const { test, expect, SANDI, AKUN } = require("../bantu");

async function login(page, username, sandi) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle"); // tunggu React aktif, isian sebelum itu terhapus
  await page.getByPlaceholder("mis. admin@sekolah.com atau NISN").fill(username);
  await page.locator('input[type="password"]').fill(sandi);
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
}

test("admin masuk dan membuka Dashboard", async ({ page }) => {
  await login(page, AKUN.admin, SANDI);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText("Admin Uji").first()).toBeVisible();
});

test("orang tua masuk dan diarahkan ke Portal", async ({ page }) => {
  await login(page, AKUN.ortu, SANDI);
  await expect(page).toHaveURL(/\/dashboard\/portal/);
  await expect(page.getByText("Abner Kogoya").first()).toBeVisible();
});

test("sandi salah ditolak dengan pesan", async ({ page }) => {
  await login(page, AKUN.guru, "sandi-keliru");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByText(/salah|gagal|tidak/i).first()).toBeVisible();
});

test("halaman dashboard tanpa login kembali ke /login", async ({ page }) => {
  await page.goto("/dashboard/nilai");
  await expect(page).toHaveURL(/\/login/);
});

test("kata sandi bisa ditampilkan dan disembunyikan lagi", async ({ page }) => {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  const sandi = page.getByLabel("Kata sandi", { exact: true });
  await sandi.fill("rahasia");
  await page.getByRole("button", { name: "Tampilkan kata sandi" }).click();
  await expect(sandi).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Sembunyikan kata sandi" }).click();
  await expect(sandi).toHaveAttribute("type", "password");
});
