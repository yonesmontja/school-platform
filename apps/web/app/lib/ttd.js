// Gambar tanda tangan (kepala sekolah/guru) hanya bisa diambil akun staf yang sedang masuk; tidak pernah publik.
import { API_URL, authHeaders } from "./akses";

/** Minta berkas tanda tangan dari path tersimpan (mis. "/storage/signatures/ttd_x.png"); hasilnya Response fetch. */
export const ambilTtd = (path) => fetch(`${API_URL}/signature/${encodeURIComponent(String(path || "").split("/").pop())}`, { headers: authHeaders(false) });

/** Tanda tangan sebagai data URL (null bila tidak ada atau tidak berhak). */
export async function ttdDataUrl(path) {
  if (!path) return null;
  try {
    const res = await ambilTtd(path);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((ok) => { const r = new FileReader(); r.onloadend = () => ok(r.result); r.readAsDataURL(blob); });
  } catch { return null; }
}
