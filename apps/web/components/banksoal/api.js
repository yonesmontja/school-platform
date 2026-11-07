import { API_URL, authHeaders } from "@/app/lib/akses";

/** Panggil API bank soal; galat dari server dilempar sebagai Error berpesan ramah. */
export async function minta(method, path, body) {
  const res = await fetch(`${API_URL}${path}`, { method, headers: authHeaders(body !== undefined), body: body === undefined ? undefined : JSON.stringify(body) });
  if (res.status === 401) { window.location.href = "/login"; throw new Error("Sesi berakhir, silakan masuk lagi."); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data.errors && Object.values(data.errors)[0]?.[0]) || data.message || `Gagal (status ${res.status}).`);
  return data;
}

/** Baca berkas sebagai data URL (base64). */
export const bacaBerkas = (file) => new Promise((ok, gagal) => {
  const r = new FileReader();
  r.onload = () => ok(r.result);
  r.onerror = () => gagal(new Error("Berkas tidak bisa dibaca."));
  r.readAsDataURL(file);
});
