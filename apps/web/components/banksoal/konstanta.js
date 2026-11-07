// Konstanta bank soal (harus sama dengan BankSoal & SoalAIService di backend)
export const BENTUK = [
  { value: "PG", label: "Pilihan ganda", icon: "bi-ui-radios" },
  { value: "PG_KOMPLEKS", label: "Pilihan ganda kompleks", icon: "bi-ui-checks" },
  { value: "BENAR_SALAH", label: "Benar / Salah", icon: "bi-toggles" },
  { value: "ISIAN", label: "Isian singkat", icon: "bi-input-cursor-text" },
  { value: "URAIAN", label: "Uraian", icon: "bi-text-paragraph" },
  { value: "MENJODOHKAN", label: "Menjodohkan", icon: "bi-arrow-left-right" },
  { value: "MENGURUTKAN", label: "Mengurutkan", icon: "bi-sort-numeric-down" },
  { value: "LENGKAPI_GAMBAR", label: "Melengkapi gambar", icon: "bi-image-alt" },
];
export const labelBentuk = (v) => BENTUK.find((b) => b.value === v)?.label || v;

export const LEVEL = [
  { value: "C1", label: "C1 Mengingat" },
  { value: "C2", label: "C2 Memahami" },
  { value: "C3", label: "C3 Menerapkan" },
  { value: "C4", label: "C4 Menganalisis" },
  { value: "C5", label: "C5 Mengevaluasi" },
  { value: "C6", label: "C6 Mencipta" },
];
export const KESULITAN = [
  { value: "MUDAH", label: "Mudah" },
  { value: "SEDANG", label: "Sedang" },
  { value: "SULIT", label: "Sulit" },
];

// Arti dimensi STNKM sama dengan narasi rapor (RaporAIService::DIMENSI)
export const DIMENSI = [
  { key: "S", label: "Keterampilan praktik", warna: "primary" },
  { key: "T", label: "Pemahaman konsep", warna: "success" },
  { key: "N", label: "Penalaran & pemecahan masalah", warna: "warning" },
  { key: "K", label: "Sikap & karakter", warna: "danger" },
  { key: "M", label: "Minat & antusiasme belajar", warna: "info" },
];

export const STATUS = {
  DRAF: { label: "Draf", warna: "secondary", icon: "bi-pencil" },
  DIAJUKAN: { label: "Menunggu persetujuan", warna: "warning", icon: "bi-hourglass-split" },
  DISETUJUI: { label: "Disetujui", warna: "success", icon: "bi-patch-check" },
  REVISI: { label: "Perlu revisi", warna: "danger", icon: "bi-arrow-counterclockwise" },
};

export const SUMBER = { MANUAL: "Ditulis guru", AI: "Draf AI", IMPOR: "Impor paket" };

// berkas: bisa membaca PDF/foto; gambar: bisa dicoba membuat ilustrasi (sama dengan SoalAIService::MODES_GAMBAR)
export const AI_MODES = [
  { value: "GEMINI", label: "Google Gemini", berkas: true, gambar: true },
  { value: "CLAUDE", label: "Anthropic Claude", berkas: true },
  { value: "QWEN", label: "Qwen (OpenRouter)", gambar: true },
  { value: "DEEPSEEK", label: "DeepSeek" },
  { value: "OPENKEY", label: "OpenKey", gambar: true },
];
// Model gambar bawaan per penyedia (SoalAIService::MODEL_GAMBAR); guru boleh menggantinya
export const MODEL_GAMBAR = { GEMINI: "gemini-2.5-flash-image", OPENKEY: "gpt-image-1", QWEN: "google/gemini-2.5-flash-image" };

// Pilihan AI terakhir diingat per perangkat
const KUNCI_AI = "banksoal_ai";
export const bacaAiMode = () => { try { return localStorage.getItem(KUNCI_AI) || "GEMINI"; } catch (e) { return "GEMINI"; } };
export const simpanAiMode = (v) => { try { localStorage.setItem(KUNCI_AI, v); } catch (e) { /* abaikan */ } };

export const HURUF = ["A", "B", "C", "D", "E", "F"];
