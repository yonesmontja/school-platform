// Semua halaman terbuka untuk perannya tanpa error JavaScript dan tanpa geser ke samping
// (dijalankan di desktop dan HP, lihat projects di playwright.config.js).
const { test, expect } = require("../bantu");

const HALAMAN = {
  admin: ["", "master-siswa", "master-keluarga", "master-guru", "master-kelas", "master-mapel", "master-materi",
    "master-periode", "hari-libur", "master-kategori", "master-mbk", "nilai", "bank-soal", "import-excel", "jurnal", "jadwal", "presensi",
    "diagnostik", "p5", "rapor", "laporan-stnkm", "pengguna", "pengaturan", "log-aktivitas", "notifikasi", "akun", "panduan"],
  guru: ["", "nilai", "bank-soal", "jurnal", "jadwal", "hari-libur", "presensi", "diagnostik", "p5", "rapor", "laporan-stnkm", "notifikasi", "akun", "panduan"],
  ortu: ["portal", "notifikasi", "akun", "panduan"],
};

for (const [peran, daftar] of Object.entries(HALAMAN)) {
  for (const hal of daftar) {
    const path = `/dashboard${hal ? `/${hal}` : ""}`;
    test(`${peran} ${path}`, async ({ page, masuk }) => {
      await masuk(peran);
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`${path.replace(/\//g, "\/")}$`));
      await expect(page.locator(".app-main :is(h1, h2, h3, h4, h5, .page-title)").first()).toBeVisible();
      await page.waitForTimeout(1500);
      const lebar = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
      expect(lebar[0], "halaman tidak boleh bisa digeser ke samping").toBeLessThanOrEqual(lebar[1]);
    });
  }
}

test("guru tidak bisa membuka halaman khusus admin", async ({ page, masuk }) => {
  await masuk("guru");
  await page.goto("/dashboard/pengguna");
  await expect(page).not.toHaveURL(/\/dashboard\/pengguna$/);
});
