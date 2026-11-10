"use client";
// Pustaka aset Studio (E2): cari & pilih emoji 3D (Fluent Emoji, Microsoft, MIT) dan ikon (Tabler Icons, MIT).
// Berkas & indeksnya ada di /pustaka (apps/web/public/pustaka, disalin juga ke layanan render), jadi tidak ada
// unduhan dari luar saat menyunting maupun merender. Indeks dimuat sekali saat panel pertama kali dibuka.
import { useEffect, useMemo, useState } from "react";

// Kata kunci pustaka berbahasa Inggris; kata Indonesia yang umum di sekolah dipetakan ke padanannya.
const KAMUS = {
  sekolah: "school", kelas: "classroom school", guru: "teacher", siswa: "student", murid: "student", pelajar: "student",
  buku: "book", pena: "pen", pensil: "pencil", tulis: "write writing pencil", baca: "book read", belajar: "book learn school education study",
  ujian: "exam test check", nilai: "grade chart score star", rapor: "report file chart", juara: "trophy medal winner award", piala: "trophy",
  medali: "medal", wisuda: "graduation", lulus: "graduation", topi: "hat cap", tas: "bag backpack", papan: "board chalkboard",
  kalender: "calendar", jadwal: "calendar clock schedule", jam: "clock time", waktu: "clock time hourglass", hari: "calendar sun",
  matematika: "math abacus calculator", hitung: "calculator abacus math", angka: "number numbers", ilmu: "science microscope",
  sains: "science microscope test tube", kimia: "test tube flask chemistry", fisika: "atom magnet", biologi: "dna microbe leaf",
  komputer: "computer laptop desktop", laptop: "laptop", internet: "world globe wifi", dunia: "world globe earth", peta: "map world",
  bumi: "earth globe world", musik: "music note", seni: "art palette", gambar: "picture art palette photo", foto: "camera photo",
  olahraga: "sport ball", bola: "ball soccer", lari: "running run", renang: "swimming swim", sepeda: "bicycle bike",
  makan: "food eat fork", minum: "drink cup", air: "water droplet", buah: "fruit apple", sayur: "vegetable", nasi: "rice",
  rumah: "house home", masjid: "mosque", gereja: "church", pura: "temple", bus: "bus", mobil: "car", motor: "motorcycle", kapal: "ship boat",
  pesawat: "airplane plane", jalan: "road walk", kota: "city building", desa: "village house", gedung: "building",
  hewan: "animal", kucing: "cat", anjing: "dog", burung: "bird", ikan: "fish", kupu: "butterfly", pohon: "tree", bunga: "flower",
  daun: "leaf", hutan: "forest tree", gunung: "mountain", laut: "ocean water wave", pantai: "beach", matahari: "sun", bulan: "moon",
  bintang: "star", hujan: "rain cloud", awan: "cloud", api: "fire", lampu: "light bulb lamp", ide: "light bulb idea",
  senang: "happy smile grinning", gembira: "happy smile party", sedih: "sad crying", marah: "angry", kaget: "surprised astonished",
  tertawa: "laugh joy", cinta: "love heart", hati: "heart love", suka: "thumbs up like heart", jempol: "thumbs up", tepuk: "clapping",
  salam: "waving hand", tangan: "hand", doa: "folded hands pray", semangat: "flexed biceps fire muscle", hebat: "star trophy clap",
  orang: "person people", anak: "child kid", laki: "man boy", perempuan: "woman girl", keluarga: "family", teman: "friend people",
  ayah: "man father", ibu: "woman mother", bayi: "baby", dokter: "doctor health", polisi: "police", petani: "farmer",
  pesta: "party celebration", hadiah: "gift present", ulang: "birthday cake", kue: "cake", perayaan: "party celebration confetti",
  bendera: "flag", indonesia: "indonesia flag", merdeka: "flag indonesia", uang: "money cash coin", bayar: "money credit card",
  rapat: "meeting people", pengumuman: "megaphone loudspeaker announcement", berita: "news newspaper", surat: "mail letter envelope",
  pesan: "message chat", telepon: "phone telephone", video: "video camera movie", film: "movie film", kamera: "camera",
  centang: "check mark", benar: "check correct", salah: "cross wrong x", tanya: "question", info: "info information",
  peringatan: "warning alert", kunci: "key lock", aman: "lock shield safe", rumus: "math function", target: "target goal",
  roket: "rocket", tumbuh: "growth seedling chart up", naik: "up arrow chart", turun: "down arrow", panah: "arrow",
  kanan: "right", kiri: "left", atas: "up", bawah: "down", lokasi: "location pin map", alamat: "location pin home",
  pengguna: "user person", grup: "users group", pengaturan: "settings gear", cari: "search magnifying", tambah: "plus add",
  hapus: "trash delete", unduh: "download", unggah: "upload", berbagi: "share", suara: "volume sound speaker", mikrofon: "microphone",
};

const cache = {};
async function muat(jenis) {
  if (!cache[jenis]) cache[jenis] = fetch(`/pustaka/indeks-${jenis}.json`).then((r) => { if (!r.ok) throw new Error("Indeks pustaka tidak termuat."); return r.json(); });
  try { return await cache[jenis]; } catch (e) { delete cache[jenis]; throw e; }
}

/** Kata kueri → kelompok sinonim (cocok bila salah satu sinonim ada di kata kunci). */
const kelompokKueri = (q) => q.toLowerCase().split(/[\s,]+/).filter(Boolean).map((t) => [t, ...(KAMUS[t] ? KAMUS[t].split(" ") : [])]);
function cari(daftar, q, kunci, nama) {
  const kel = kelompokKueri(q);
  if (!kel.length) return daftar;
  const hasil = [];
  for (const x of daftar) {
    const teks = kunci(x);
    if (kel.every((sin) => sin.some((s) => teks.includes(s)))) hasil.push(x);
  }
  // Nama yang diawali kata pertama tampil lebih dulu
  const awal = kel[0];
  return hasil.sort((a, b) => Number(!awal.some((s) => nama(a).startsWith(s))) - Number(!awal.some((s) => nama(b).startsWith(s))));
}

const LANGKAH = 120;

export default function PustakaAset({ jenisAwal = "emoji", judul = "Pustaka aset", onPilih, onTutup }) {
  const [jenis, setJenis] = useState(jenisAwal);
  const [data, setData] = useState({});
  const [galat, setGalat] = useState("");
  const [q, setQ] = useState("");
  const [grup, setGrup] = useState("");
  const [isian, setIsian] = useState(false);
  const [batas, setBatas] = useState(LANGKAH);

  useEffect(() => {
    let batal = false;
    setGalat("");
    if (!data[jenis]) muat(jenis).then((d) => { if (!batal) setData((x) => ({ ...x, [jenis]: d })); }).catch((e) => { if (!batal) setGalat(e.message); });
    return () => { batal = true; };
  }, [jenis, data]);
  useEffect(() => { setBatas(LANGKAH); }, [jenis, q, grup, isian]);
  useEffect(() => { setGrup(""); }, [jenis]);

  const daftar = data[jenis];
  // emoji: [nama, glyph, kata kunci, grup]; ikon: [nama, kata kunci, kategori, ada versi isi]
  const kategori = useMemo(() => (daftar ? [...new Set(daftar.map((x) => (jenis === "emoji" ? x[3] : x[2])).filter(Boolean))].sort() : []), [daftar, jenis]);
  const hasil = useMemo(() => {
    if (!daftar) return [];
    let d = daftar;
    if (grup) d = d.filter((x) => (jenis === "emoji" ? x[3] : x[2]) === grup);
    if (jenis === "ikon" && isian) d = d.filter((x) => x[3]);
    return cari(d, q.trim(), (x) => (jenis === "emoji" ? x[2] : x[1]).toLowerCase(), (x) => x[0]);
  }, [daftar, q, grup, isian, jenis]);

  const pilih = (x) => onPilih(jenis === "emoji" ? { tipe: "emoji", isi: x[1] } : { tipe: "ikon", isi: `${isian ? "filled" : "outline"}/${x[0]}` });

  return (
    <>
      <div className="modal d-block" tabIndex={-1} role="dialog" aria-modal="true" aria-label={judul}>
        <div className="modal-dialog modal-lg modal-dialog-scrollable">
          <div className="modal-content border-0 shadow">
            <div className="modal-header">
              <h5 className="modal-title fw-bold"><i className="bi bi-collection text-primary me-2"></i>{judul}</h5>
              <button type="button" className="btn-close" onClick={onTutup} aria-label="Tutup"></button>
            </div>
            <div className="modal-body">
              <ul className="nav nav-pills nav-fill mb-2" role="tablist">
                {[["emoji", "Emoji 3D", "bi-emoji-smile"], ["ikon", "Ikon", "bi-bezier2"]].map(([v, l, ic]) => (
                  <li key={v} className="nav-item" role="presentation">
                    <button type="button" role="tab" aria-selected={jenis === v} className={`nav-link py-1 ${jenis === v ? "active" : ""}`} onClick={() => setJenis(v)}><i className={`bi ${ic} me-1`}></i>{l}</button>
                  </li>
                ))}
              </ul>
              <div className="row g-2 mb-2">
                <div className="col-12 col-md-6">
                  <label className="visually-hidden" htmlFor="pkCari">Cari aset</label>
                  <input id="pkCari" type="search" className="form-control form-control-sm" autoFocus placeholder="Cari: buku, guru, juara, roket…" value={q} onChange={(e) => setQ(e.target.value)} />
                </div>
                <div className="col-7 col-md-4">
                  <label className="visually-hidden" htmlFor="pkGrup">Kategori</label>
                  <select id="pkGrup" className="form-select form-select-sm" value={grup} onChange={(e) => setGrup(e.target.value)}>
                    <option value="">Semua kategori</option>
                    {kategori.map((k) => <option key={k} value={k}>{k}</option>)}
                  </select>
                </div>
                {jenis === "ikon" && (
                  <div className="col-5 col-md-2 d-flex align-items-center">
                    <div className="form-check form-switch mb-0">
                      <input className="form-check-input" type="checkbox" role="switch" id="pkIsi" checked={isian} onChange={(e) => setIsian(e.target.checked)} />
                      <label className="form-check-label small" htmlFor="pkIsi">Versi isi</label>
                    </div>
                  </div>
                )}
              </div>
              {galat && <div className="alert alert-danger py-2 small">{galat}</div>}
              {!daftar && !galat && <div className="text-center text-body-secondary py-5"><span className="spinner-border spinner-border-sm me-2"></span>Memuat pustaka…</div>}
              {daftar && (
                <>
                  <div className="small text-body-secondary mb-2" aria-live="polite">{hasil.length.toLocaleString("id-ID")} hasil</div>
                  <div className="studio-pustaka">
                    {hasil.slice(0, batas).map((x) => (
                      <button key={x[0]} type="button" className="studio-pustaka-item" title={x[0].replace(/-/g, " ")} aria-label={`${jenis === "emoji" ? "Emoji" : "Ikon"} ${x[0].replace(/-/g, " ")}`} onClick={() => pilih(x)}>
                        <img src={jenis === "emoji" ? `/pustaka/emoji/${x[0]}.webp` : `/pustaka/ikon/${isian ? "filled" : "outline"}/${x[0]}.svg`} alt="" loading="lazy" width={jenis === "emoji" ? 48 : 30} height={jenis === "emoji" ? 48 : 30} />
                      </button>
                    ))}
                  </div>
                  {hasil.length > batas && <div className="text-center mt-2"><button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setBatas((b) => b + LANGKAH * 2)}>Tampilkan lebih banyak</button></div>}
                  {!hasil.length && <div className="text-center text-body-secondary py-4">Tidak ada yang cocok. Coba kata lain (bahasa Indonesia atau Inggris).</div>}
                </>
              )}
            </div>
            <div className="modal-footer justify-content-between">
              <span className="small text-body-secondary">Fluent Emoji 3D © Microsoft · Tabler Icons © Paweł Kuna — lisensi MIT</span>
              <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onTutup}>Tutup</button>
            </div>
          </div>
        </div>
      </div>
      <div className="modal-backdrop show"></div>
    </>
  );
}
