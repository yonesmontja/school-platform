// Pindahkan lembar: nilai yang terlanjur disimpan (lewat Import Excel) dengan materi salah dipindah sekaligus ke materi
// yang benar, dengan pratinjau, peringatan nilai indikator, dan pilihan timpa bila lembar tujuan sudah berisi nilai.
const path = require("path");
const { test, expect, API } = require("../bantu");

async function api(sesi, method, url, body) {
  const res = await fetch(`${API}/api${url}`, {
    method,
    headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${sesi.access_token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${url}: ${res.status} ${await res.text()}`);
  return res.json();
}

const META = { id_kelas: "KLS-E4A", id_mapel: "MPL-EMTK", id_periode: "PER-E2E", id_jenis: "JNS-UH" };
const TANGGAL = "2026-10-12";

test("guru memindahkan lembar yang salah materi, menimpa nilai lama di lembar tujuan", async ({ page, masuk }) => {
  const sesi = await masuk("guru");
  // Hasil import ke materi yang salah (Pecahan Sederhana, dinilai per indikator) ...
  await api(sesi, "POST", "/nilai/batch", { ...META, id_materi: "MTR-E1", tanggal: TANGGAL, records: [
    { id_siswa: "SIS-E1", nilai_indikator: { "IND-E1": 70 } },
    { id_siswa: "SIS-E2", nilai_indikator: { "IND-E1": 80 } },
  ] });
  // ... sementara di materi yang benar (Bilangan Cacah) Abner sudah punya nilai lama
  await api(sesi, "POST", "/nilai/batch", { ...META, id_materi: "MTR-E2", tanggal: TANGGAL, records: [{ id_siswa: "SIS-E1", nilai: 95 }] });

  // Tautan "Pindahkan lembar" dari Import Excel membuka lembar asal lalu dialognya
  await page.goto(`/dashboard/nilai?${new URLSearchParams({ ...META, id_materi: "MTR-E1", tanggal: TANGGAL, pindah: "1" })}`);
  const dialog = page.locator("[data-modal-pindah-lembar]");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Pecahan Sederhana");
  await expect(page.locator("[data-buka-pindah-lembar]")).toBeVisible();

  await dialog.getByLabel("Materi yang benar").selectOption("MTR-E2");
  await expect(dialog.locator("[data-pratinjau-pindah]")).toContainText("2 nilai siswa akan dipindahkan");
  await expect(dialog.locator("[data-pratinjau-pindah]")).toContainText("2 nilai per indikator dihapus");
  const bentrok = dialog.locator("[data-bentrok-pindah]");
  await expect(bentrok).toContainText("1 siswa sudah punya nilai di lembar tujuan");
  await expect(bentrok).toContainText("Abner Kogoya");

  // Tanpa memilih timpa, tombol simpan tidak aktif
  await expect(dialog.locator("button[type=submit]")).toBeDisabled();
  await dialog.getByLabel(/Timpa dengan nilai dari lembar asal/).check();
  await dialog.screenshot({ path: path.join(__dirname, "../hasil/pindah-lembar.png") });
  await dialog.getByRole("button", { name: "Pindahkan & timpa" }).click();

  await expect(page.locator(".swal2-popup")).toContainText("2 nilai dipindahkan ke Bilangan Cacah");
  await expect(page.locator(".swal2-popup")).toContainText("1 nilai lama di lembar tujuan ditimpa");
  await page.getByRole("button", { name: "Buka lembar tujuan" }).click();
  await expect(dialog).toBeHidden();

  const q = (materi) => new URLSearchParams({ ...META, id_materi: materi, tanggal: TANGGAL });
  const tujuan = await api(sesi, "GET", `/nilai/students?${q("MTR-E2")}`);
  const nilai = Object.fromEntries(tujuan.students.filter((s) => s.id_nilai).map((s) => [s.id_siswa, Number(s.nilai)]));
  expect(nilai).toEqual({ "SIS-E1": 70, "SIS-E2": 80 });
  const asal = await api(sesi, "GET", `/nilai/students?${q("MTR-E1")}`);
  expect(asal.students.filter((s) => s.id_nilai)).toHaveLength(0);
});
