// Daftar templat video belajar. Satu sumber untuk: formulir & pratinjau di aplikasi, layanan render di server,
// dan Studio Remotion. Setiap adegan punya `narasi` (dibacakan suara AI saat dirender) dan isian khas templat.
import { KartuGambar } from "./kartuGambar.jsx";
import { Berhitung } from "./berhitung.jsx";
import { Urutan } from "./urutan.jsx";
import { Pecahan } from "./pecahan.jsx";

export { FPS, LEBAR, TINGGI, RASIO, ukuranRasio, hitungDurasi, metadata, narasiPembuka, narasiPenutup } from "./umum.jsx";
import { RASIO } from "./umum.jsx";

export const TEMPLAT = [
  {
    id: "KartuGambar", nama: "Kartu Gambar & Suku Kata", ikon: "bi-card-image", komponen: KartuGambar,
    deskripsi: "Gambar besar, kata dipecah per suku kata yang menyala satu per satu, lalu kata utuh. Untuk kosakata dan membaca permulaan.",
    kolom: [
      { k: "gambar", label: "Gambar (emoji)", jenis: "emoji", contoh: "🐟" },
      { k: "kata", label: "Kata (pisahkan suku kata dengan -)", jenis: "teks", contoh: "i-kan", wajib: true },
      { k: "keterangan", label: "Keterangan singkat (opsional)", jenis: "teks", contoh: "Ikan hidup di air" },
      { k: "narasi", label: "Narasi yang dibacakan", jenis: "panjang", contoh: "Ini ikan. I, kan. Ikan. Ikan hidup di air." },
    ],
    contoh: {
      judul: "Kenali Kata: Makanan di Papua", emoji: "🍠", warna: "#16a34a",
      adegan: [
        { gambar: "🍠", kata: "u-bi", keterangan: "Ubi tumbuh di kebun", narasi: "Ini ubi. U, bi. Ubi. Mama menanam ubi di kebun." },
        { gambar: "🐟", kata: "i-kan", keterangan: "Ikan hidup di air", narasi: "Ini ikan. I, kan. Ikan. Bapak menangkap ikan di sungai." },
        { gambar: "🍌", kata: "pi-sang", keterangan: "Pisang berwarna kuning", narasi: "Ini pisang. Pi, sang. Pisang. Pisang yang matang berwarna kuning." },
        { gambar: "🥥", kata: "ke-la-pa", keterangan: "Kelapa ada airnya", narasi: "Ini kelapa. Ke, la, pa. Kelapa. Air kelapa segar diminum." },
      ],
      penutup: { teks: "Hebat! Sekarang coba baca sendiri." },
    },
  },
  {
    id: "Berhitung", nama: "Berhitung dengan Benda", ikon: "bi-123", komponen: Berhitung,
    deskripsi: "Benda muncul satu per satu sambil dihitung, atau penjumlahan dan pengurangan dengan benda nyata.",
    kolom: [
      { k: "benda", label: "Benda (emoji)", jenis: "emoji", contoh: "🍌" },
      { k: "jumlah", label: "Jumlah benda (1–10)", jenis: "angka", min: 1, max: 10, contoh: 3, wajib: true },
      { k: "operasi", label: "Operasi", jenis: "pilih", opsi: [["", "Hanya menghitung"], ["+", "Ditambah (+)"], ["-", "Dikurangi (−)"]], contoh: "" },
      { k: "jumlah2", label: "Jumlah yang ditambah/dikurangi", jenis: "angka", min: 0, max: 10, contoh: 2, tampil: (a) => !!a.operasi },
      { k: "keterangan", label: "Keterangan singkat (opsional)", jenis: "teks", contoh: "" },
      { k: "narasi", label: "Narasi yang dibacakan", jenis: "panjang", contoh: "Ada tiga pisang. Satu, dua, tiga." },
    ],
    contoh: {
      judul: "Ayo Berhitung", emoji: "🔢", warna: "#2563eb",
      adegan: [
        { benda: "🍌", jumlah: 3, operasi: "", narasi: "Mari kita hitung pisang. Satu, dua, tiga. Ada tiga pisang." },
        { benda: "🐟", jumlah: 2, operasi: "+", jumlah2: 3, narasi: "Bapak membawa dua ikan. Lalu datang tiga ikan lagi. Dua ditambah tiga sama dengan lima." },
        { benda: "🥭", jumlah: 5, operasi: "-", jumlah2: 2, narasi: "Ada lima mangga. Dua mangga dimakan. Lima dikurangi dua sama dengan tiga." },
      ],
      penutup: { teks: "Pintar! Coba hitung benda di sekitarmu." },
    },
  },
  {
    id: "Urutan", nama: "Urutan & Siklus", ikon: "bi-arrow-repeat", komponen: Urutan,
    deskripsi: "Setiap adegan menambah satu langkah pada rangkaian bergambar. Untuk daur hidup, siklus air, atau langkah kerja.",
    kolom: [
      { k: "gambar", label: "Gambar (emoji)", jenis: "emoji", contoh: "🥚" },
      { k: "teks", label: "Nama langkah (singkat)", jenis: "teks", contoh: "Telur", wajib: true },
      { k: "siklus", label: "Kembali ke awal (siklus)", jenis: "centang", hanyaTerakhir: true },
      { k: "narasi", label: "Narasi yang dibacakan", jenis: "panjang", contoh: "Mula-mula, katak bertelur di air." },
    ],
    contoh: {
      judul: "Daur Hidup Katak", emoji: "🐸", warna: "#059669",
      adegan: [
        { gambar: "🥚", teks: "Telur", narasi: "Mula-mula, induk katak bertelur di air. Telurnya banyak sekali." },
        { gambar: "🐟", teks: "Berudu", narasi: "Telur menetas menjadi berudu. Berudu berenang dengan ekornya." },
        { gambar: "🦎", teks: "Katak muda", narasi: "Berudu tumbuh kaki. Ekornya makin pendek. Sekarang menjadi katak muda." },
        { gambar: "🐸", teks: "Katak dewasa", siklus: true, narasi: "Katak muda tumbuh menjadi katak dewasa. Lalu katak bertelur lagi. Begitu seterusnya." },
      ],
      penutup: { teks: "Hebat! Kamu tahu daur hidup katak." },
    },
  },
  {
    id: "Pecahan", nama: "Pecahan", ikon: "bi-pie-chart", komponen: Pecahan,
    deskripsi: "Benda bulat dipotong sama besar, sebagian diambil, lalu lambang pecahan muncul.",
    kolom: [
      { k: "benda", label: "Benda", jenis: "pilih", opsi: [["kue", "Kue"], ["pizza", "Pizza"], ["semangka", "Semangka"], ["roti", "Roti"]], contoh: "kue" },
      { k: "bagian", label: "Dipotong menjadi (penyebut)", jenis: "angka", min: 2, max: 12, contoh: 4, wajib: true },
      { k: "diambil", label: "Diambil (pembilang)", jenis: "angka", min: 1, max: 12, contoh: 1, wajib: true },
      { k: "sebutan", label: "Cara membaca", jenis: "teks", contoh: "seperempat" },
      { k: "narasi", label: "Narasi yang dibacakan", jenis: "panjang", contoh: "Kue dipotong menjadi empat bagian sama besar. Satu bagian diambil. Itu satu per empat, atau seperempat." },
    ],
    contoh: {
      judul: "Mengenal Pecahan", emoji: "🍰", warna: "#f59e0b",
      adegan: [
        { benda: "kue", bagian: 2, diambil: 1, sebutan: "setengah", narasi: "Kue dipotong menjadi dua bagian sama besar. Satu bagian diambil. Itu satu per dua, atau setengah." },
        { benda: "semangka", bagian: 4, diambil: 1, sebutan: "seperempat", narasi: "Semangka dipotong menjadi empat bagian sama besar. Satu bagian diambil. Itu satu per empat, atau seperempat." },
        { benda: "pizza", bagian: 4, diambil: 3, sebutan: "tiga per empat", narasi: "Sekarang pizza dipotong empat. Tiga bagian diambil. Itu tiga per empat." },
      ],
      penutup: { teks: "Hebat! Kamu sudah mengenal pecahan." },
    },
  },
];

export const templatById = (id) => TEMPLAT.find((t) => t.id === id);

/** Bersihkan isian dari formulir: hanya kolom templat, angka sebagai angka. */
export function rapikanProps(templat, props) {
  const t = templatById(templat);
  if (!t) return props;
  const kolom = new Map(t.kolom.map((c) => [c.k, c]));
  return {
    rasio: RASIO[props.rasio] ? props.rasio : "16:9",
    judul: String(props.judul || t.nama).slice(0, 120),
    emoji: props.emoji || t.contoh.emoji,
    warna: /^#[0-9a-f]{6}$/i.test(props.warna || "") ? props.warna : t.contoh.warna,
    adegan: (props.adegan || []).slice(0, 15).map((a) => Object.fromEntries([...kolom].map(([k, c]) => {
      const v = a[k];
      if (c.jenis === "angka") return [k, v === "" || v == null ? null : Number(v)];
      if (c.jenis === "centang") return [k, !!v];
      return [k, v == null ? "" : String(v).slice(0, k === "narasi" ? 600 : 120)];
    }))),
    penutup: { teks: String(props.penutup?.teks || "").slice(0, 120) },
  };
}
