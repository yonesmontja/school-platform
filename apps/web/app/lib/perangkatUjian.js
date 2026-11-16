// Identitas perangkat untuk mode ujian CBT: satu siswa = satu perangkat per sesi (pengawas bisa mengizinkan pindah perangkat).
// Disimpan di localStorage; bila diblokir, dibuat ulang per kunjungan (tetap konsisten selama halaman terbuka).
let cadangan = null;

export function idPerangkat() {
  try {
    let id = localStorage.getItem("cbt_perangkat");
    if (!id) {
      id = (crypto.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`).slice(0, 64);
      localStorage.setItem("cbt_perangkat", id);
    }
    return id;
  } catch (e) {
    cadangan ??= `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    return cadangan;
  }
}

export const layarPenuhDidukung = () => typeof document !== "undefined" && !!document.documentElement.requestFullscreen;
export const sedangLayarPenuh = () => typeof document !== "undefined" && !!document.fullscreenElement;

export async function masukLayarPenuh() {
  try { if (layarPenuhDidukung() && !sedangLayarPenuh()) await document.documentElement.requestFullscreen({ navigationUI: "hide" }); } catch (e) { /* ditolak browser */ }
}

export async function keluarLayarPenuh() {
  try { if (sedangLayarPenuh()) await document.exitFullscreen(); } catch (e) { /* abaikan */ }
}
