// Aplikasi Android (TWA): halaman publik unduhan APK, tautan dari beranda, dan berkas verifikasi domain untuk TWA.
const { test, expect } = require("../bantu");

test.describe.configure({ timeout: 180000 });

test("beranda menautkan halaman Aplikasi Android dengan tombol unduh APK", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("navigation", { name: "Menu beranda" }).getByRole("link", { name: "Aplikasi Android" }).click();
  await expect(page).toHaveURL(/\/android$/);
  const kartu = page.locator("[data-unduh-android]");
  await expect(kartu.locator("[data-versi-android]")).toContainText(/Versi \d+\.\d+\.\d+/);
  await expect(kartu.getByRole("link", { name: /Unduh APK/ })).toHaveAttribute("href", "/unduh/saprapor-android.apk");
  await expect(page.getByText("Izinkan dari sumber ini")).toBeVisible();
});

test("APK dan assetlinks tersaji untuk TWA", async ({ request, baseURL }) => {
  const apk = await request.head(`${baseURL}/unduh/saprapor-android.apk`);
  expect(apk.status()).toBe(200);
  expect(apk.headers()["content-type"]).toContain("application/vnd.android.package-archive");
  const tautan = await (await request.get(`${baseURL}/.well-known/assetlinks.json`)).json();
  expect(tautan[0].target.package_name).toBe("com.saprapor.app");
  expect(tautan[0].target.sha256_cert_fingerprints[0]).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
});
