// Kunci layar selama AI bekerja: setiap permintaan POST ber-ai_mode (selain HEURISTIK/LOKAL) dihitung,
// dan selama masih ada yang berjalan seluruh tampilan dikunci oleh <KunciAi/> agar pengguna tidak mengeklik hal lain.
// Permintaan latar (mis. antrean offline) melewati kunci dengan opsi fetch { kunciAi: false }.
const PENDENGAR = new Set();
let aktif = 0;
let mulai = null;

const kabari = () => PENDENGAR.forEach((f) => f({ aktif, mulai }));

export function dengarKunciAi(f) {
  PENDENGAR.add(f);
  f({ aktif, mulai });
  return () => PENDENGAR.delete(f);
}

const LOKAL = ["HEURISTIK", "LOKAL"];

export function permintaanAi(init) {
  if (!init || init.kunciAi === false) return false;
  if (String(init.method || "GET").toUpperCase() !== "POST") return false;
  const b = init.body;
  let mode = null;
  if (typeof b === "string") mode = b.match(/"ai_mode"\s*:\s*"([A-Za-z_]+)"/)?.[1] || null;
  else if (typeof FormData !== "undefined" && b instanceof FormData) mode = b.get("ai_mode");
  return !!mode && !LOKAL.includes(String(mode).toUpperCase());
}

export function pasangKunciAi() {
  if (typeof window === "undefined" || window.__kunciAi) return;
  window.__kunciAi = true;
  const asli = window.fetch.bind(window);
  window.fetch = (input, init) => {
    if (!permintaanAi(init)) return asli(input, init);
    aktif += 1;
    if (aktif === 1) mulai = Date.now();
    kabari();
    return asli(input, init).finally(() => {
      aktif = Math.max(0, aktif - 1);
      if (aktif === 0) mulai = null;
      kabari();
    });
  };
}
