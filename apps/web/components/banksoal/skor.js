// Penilaian jawaban paket soal di browser (pratinjau langsung saat mengoreksi).
// Harus sama dengan App\Services\PaketSoalService di backend; skor yang tersimpan tetap dihitung server.
import { HURUF } from "./konstanta";

export const OTOMATIS = ["PG", "PG_KOMPLEKS", "BENAR_SALAH", "ISIAN"];

const indeksHuruf = (t) => (String(t || "").toUpperCase().match(/[A-H]/g) || []).map((c) => c.charCodeAt(0) - 65);

/** Teks yang diketik guru di lembar koreksi → bentuk simpanan. PG "B", kompleks "AC", benar/salah "BSB". */
export function dariTeks(soal, teks) {
  const t = String(teks ?? "").trim();
  const isi = soal.isi || {};
  switch (soal.bentuk) {
    case "PG": {
      const i = indeksHuruf(t)[0];
      return i != null && i < (isi.pilihan || []).length ? i : null;
    }
    case "PG_KOMPLEKS":
      return [...new Set(indeksHuruf(t).filter((i) => i < (isi.pilihan || []).length))].sort((a, b) => a - b);
    case "BENAR_SALAH": {
      const huruf = t.toUpperCase().replace(/SALAH/g, "S").replace(/BENAR/g, "B").replace(/[^A-Z?-]/g, "").split("");
      return (isi.pernyataan || []).map((_, i) => (["B", "T"].includes(huruf[i]) ? true : ["S", "F"].includes(huruf[i]) ? false : null));
    }
    default:
      return t || null;
  }
}

/** Bentuk simpanan → teks untuk sel lembar koreksi. */
export function keTeks(soal, jawaban) {
  if (jawaban == null) return "";
  switch (soal.bentuk) {
    case "PG": return HURUF[jawaban] || "";
    case "PG_KOMPLEKS": return (jawaban || []).map((i) => HURUF[i]).join("");
    case "BENAR_SALAH": return (jawaban || []).some((v) => v != null) ? jawaban.map((v) => (v == null ? "-" : v ? "B" : "S")).join("") : "";
    default: return String(jawaban);
  }
}

const ratakan = (t) => {
  let s = String(t).replace(/\s+/g, " ").trim().toLowerCase().replace(/\.+$/, "");
  if (/^-?\d+(,\d+)?$/.test(s)) s = s.replace(",", ".");
  return s;
};

/** Skor otomatis satu butir; null untuk bentuk yang dinilai guru. */
export function skorOtomatis(soal, jawaban, maks) {
  const kunci = soal.kunci?.jawaban;
  switch (soal.bentuk) {
    case "PG": return jawaban != null && Number(jawaban) === Number(kunci) ? maks : 0;
    case "PG_KOMPLEKS": {
      const k = kunci || [];
      if (!k.length) return 0;
      const dipilih = jawaban || [];
      const benar = dipilih.filter((i) => k.includes(i)).length;
      const salah = dipilih.filter((i) => !k.includes(i)).length;
      return Math.round((Math.max(0, benar - salah) / k.length) * maks * 100) / 100;
    }
    case "BENAR_SALAH": {
      const k = kunci || [];
      if (!k.length) return 0;
      const cocok = k.filter((v, i) => jawaban?.[i] != null && Boolean(jawaban[i]) === Boolean(v)).length;
      return Math.round((cocok / k.length) * maks * 100) / 100;
    }
    case "ISIAN":
      return jawaban != null && (kunci || []).some((x) => ratakan(x) === ratakan(jawaban)) ? maks : 0;
    default: return null;
  }
}

/** Skor akhir satu butir: skor guru bila ada, selain itu otomatis. */
export function skorButir(butir, jawaban, skorManual) {
  const m = skorManual?.[butir.id];
  if (m !== undefined && m !== null && m !== "") return Math.min(Math.max(Number(m), 0), butir.skor_maks);
  return skorOtomatis(butir.soal, jawaban?.[butir.id], butir.skor_maks);
}

/** Ringkasan satu baris jawaban: total, nilai 0–100, dan apakah semua butir sudah dinilai. */
export function ringkas(butir, jawaban, skorManual) {
  let total = 0, maks = 0, lengkap = butir.length > 0;
  for (const b of butir) {
    maks += b.skor_maks;
    const s = skorButir(b, jawaban, skorManual);
    if (s == null) lengkap = false; else total += s;
  }
  return { total: Math.round(total * 100) / 100, nilai: maks ? Math.round((total / maks) * 10000) / 100 : 0, lengkap, maks };
}
