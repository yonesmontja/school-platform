import { API_ORIGIN, API_URL } from "@/app/lib/config";
export { API_ORIGIN, API_URL };
// Utilitas modul Jadwal: format waktu lokal, warna, pesan WhatsApp, dan target STNKM sesi.


export const WARNA_JADWAL = ["#3f51b5", "#039be5", "#33b679", "#0b8043", "#f6bf26", "#f4511e", "#e67c73", "#d50000", "#8e24aa", "#7986cb", "#616161", "#795548"];
export const PALET_GURU = ["#3f51b5", "#e67c73", "#33b679", "#f4511e", "#8e24aa", "#039be5", "#f6bf26", "#0b8043", "#d81b60", "#7986cb", "#795548", "#616161"];

export const STATUS_SESI = [
  { id: "Menunggu", label: "Menunggu", icon: "bi-hourglass-split", color: "warning" },
  { id: "Berlangsung", label: "Berlangsung", icon: "bi-play-circle", color: "success" },
  { id: "Selesai", label: "Selesai", icon: "bi-check2-circle", color: "secondary" },
  { id: "Batal", label: "Batal", icon: "bi-x-circle", color: "danger" },
];
export const STATUS_MAP = Object.fromEntries(STATUS_SESI.map((s) => [s.id, s]));

export const HARI = [
  { id: 1, singkat: "Sen", label: "Senin" },
  { id: 2, singkat: "Sel", label: "Selasa" },
  { id: 3, singkat: "Rab", label: "Rabu" },
  { id: 4, singkat: "Kam", label: "Kamis" },
  { id: 5, singkat: "Jum", label: "Jumat" },
  { id: 6, singkat: "Sab", label: "Sabtu" },
  { id: 0, singkat: "Min", label: "Minggu" },
];

export const TAMPILAN = [
  { id: "timeGridDay", label: "Hari", tombol: "d" },
  { id: "timeGridWeek", label: "Minggu", tombol: "w" },
  { id: "dayGridMonth", label: "Bulan", tombol: "m" },
  { id: "listWeek", label: "Agenda", tombol: "a" },
];

export const PREFS_DEFAULT = {
  view: "timeGridWeek",
  jamMulai: "06:00",
  jamSelesai: "17:00",
  hari: "senin-sabtu", // senin-jumat | senin-sabtu | semua
  warnaiBerdasar: "jadwal", // jadwal | guru | status
  panelKiri: true,
};

const pad = (n) => String(n).padStart(2, "0");
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const jamMenit = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const keInputLokal = (d) => `${ymd(d)}T${jamMenit(d)}`;
export const parseLokal = (s) => {
  const [t, j = "00:00"] = String(s).split("T");
  const [y, m, d] = t.split("-").map(Number);
  const [h, mi] = j.split(":").map(Number);
  return new Date(y, m - 1, d, h, mi);
};
export const tambahMenit = (jam, menit) => {
  const [h, m] = jam.split(":").map(Number);
  const total = Math.min(23 * 60 + 59, h * 60 + m + menit);
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
};
export const tanggalPanjang = (d) => d.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
export const rentangJam = (mulai, selesai) => `${jamMenit(mulai)} – ${jamMenit(selesai)}`;
export const urlLampiran = (url) => (url && url.startsWith("/storage/") ? `${API_ORIGIN}${url}` : url);

export const formatNomorWA = (nomor) => {
  const clean = String(nomor || "").replace(/\D/g, "");
  if (clean.startsWith("08")) return "62" + clean.slice(1);
  if (clean.startsWith("8")) return "62" + clean;
  return clean;
};

export const judulSesi = (j) => j.judul || j.mapel?.nama_mapel || "Sesi";

// Target observasi STNKM dari matriks materi + daftar fokus guru (logika GAS: bobot < 50% perlu perhatian)
export function targetStnkm(materi) {
  if (!materi) return null;
  const persen = Object.fromEntries(["S", "T", "N", "K", "M"].map((k) => [k, Math.round((parseFloat(materi[`mat_${k}`]) || 0) * 100)]));
  const todo = [];
  if (persen.S < 50) todo.push({ dim: "S", prioritas: "tinggi", judul: "Fokus Skill (S) rendah", saran: "Bobot keterampilan masih di bawah target. Siapkan metode praktik interaktif." });
  if (persen.N < 50) todo.push({ dim: "N", prioritas: "sedang", judul: "Fokus Nalar (N) rendah", saran: "Masukkan pertanyaan pemantik kritis di sesi ini." });
  if (persen.M < 50) todo.push({ dim: "M", prioritas: "sedang", judul: "Fokus Minat (M) rendah", saran: "Gunakan bahan eksplorasi kontekstual Papua yang menarik." });
  return { persen, todo };
}

// Pesan pengingat sesi untuk grup guru/kepsek dan japri guru (port dari jadwal.html GAS)
export function susunPesanWA(j, { sekolah, jumlahSesi = 1, sampai = null } = {}) {
  const namaSekolah = sekolah?.nama_sekolah || "Sekolah";
  const mulai = parseLokal(j.mulai);
  const selesai = parseLokal(j.selesai);
  const namaGuru = j.guru?.nama_guru || "Guru pengampu";
  const kelas = j.kelas?.nama_kelas ? (/^kelas\b/i.test(j.kelas.nama_kelas) ? j.kelas.nama_kelas : `Kelas ${j.kelas.nama_kelas}`) : "-";
  const ruang = j.ruangan?.nama_ruangan || "-";
  const materi = j.materi?.nama_materi || "-";
  const t = targetStnkm(j.materi);
  const stnkm = t
    ? `\n🎯 *Target Observasi STNKM:*\n[S: ${t.persen.S}% | T: ${t.persen.T}% | N: ${t.persen.N}% | K: ${t.persen.K}% | M: ${t.persen.M}%]`
      + (t.todo.length ? `\n*To-Do Fokus Guru:*\n${t.todo.map((x) => `- ${x.judul}: ${x.saran}`).join("\n")}` : "")
    : "";
  const rangkaian = jumlahSesi > 1 ? `\n🔁 *Jadwal berulang:* ${jumlahSesi} pertemuan${sampai ? ` s.d. ${new Date(sampai).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}` : ""}` : "";
  const lampiran = j.lampiran_url ? `\n📎 *Lampiran:* ${urlLampiran(j.lampiran_url)}` : "";
  const waktu = `${tanggalPanjang(mulai)}, ${rentangJam(mulai, selesai)} WIT`;

  const pesanGrup = `*📅 PENGINGAT JADWAL & PERSIAPAN SESI - ${namaSekolah.toUpperCase()}*\n\n`
    + `📚 ${j.judul ? "Agenda" : "Mapel"}: *${judulSesi(j)}*\n`
    + (j.judul ? "" : `💡 Topik/Materi: *${materi}*\n`)
    + `👩‍🏫 Instruktur: *${namaGuru}*\n🏫 Kelas / Ruang: ${kelas} (${ruang})\n🗓️ Waktu: ${waktu}\n📌 Status: ${j.status_sesi || "Menunggu"}`
    + rangkaian + `\n\n📦 *Persiapan Alat & Catatan:*\n${j.catatan || "- Tidak ada catatan khusus -"}` + stnkm + lampiran
    + "\n\n_Mari siapkan sesi pembelajaran terbaik untuk anak-anak Papua!_ 🙏";

  const pesanGuru = `Halo Rekan Guru *${namaGuru}*,\nBerikut pengingat sesi mengajar & persiapan Anda di *${namaSekolah}*:\n\n`
    + `📚 ${judulSesi(j)}${j.judul ? "" : ` (${materi})`}\n🏫 ${kelas} – ${ruang}\n🗓️ ${waktu}${rangkaian}\n`
    + `📦 *Persiapan:* ${j.catatan || "-"}` + stnkm + lampiran + "\n\nSemangat melayani! 🌟";

  return {
    judul: `${judulSesi(j)}${j.materi?.nama_materi ? ` – ${j.materi.nama_materi}` : ""}`,
    namaGuru,
    nomorGuru: formatNomorWA(j.guru?.no_wa),
    nomorKepsek: formatNomorWA(sekolah?.no_wa_kepsek),
    idGrup: sekolah?.id_wa_group_guru || "",
    pesanGrup,
    pesanGuru,
  };
}
