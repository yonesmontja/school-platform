// Pulihkan tampilan setelah kembali dari WhatsApp. Membuka WhatsApp (terutama memilih grup) bisa membuat HP
// menutup halaman di latar belakang; saat kembali, halaman dimuat ulang dari awal. Selama panel WhatsApp
// terbuka, keadaan halaman disimpan di sessionStorage (khusus tab ini) dan dihapus saat panel ditutup.

export function simpanPulih(kunci, data) {
  try { sessionStorage.setItem(kunci, JSON.stringify(data)); } catch (e) { /* storage diblokir: tidak dipulihkan */ }
}

export function bacaPulih(kunci) {
  try { return JSON.parse(sessionStorage.getItem(kunci) || "null"); } catch (e) { return null; }
}

export function hapusPulih(kunci) {
  try { sessionStorage.removeItem(kunci); } catch (e) { /* abaikan */ }
}

export const PESAN_PULIH = "Melanjutkan dari tampilan terakhir sebelum membuka WhatsApp.";
