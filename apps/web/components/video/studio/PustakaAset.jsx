"use client";
// Pustaka aset Studio (E2/E3): cari & pilih emoji 3D (Fluent Emoji, Microsoft, MIT) dan ikon (Tabler Icons, MIT),
// aset unggahan sekolah (gambar, SVG, animasi Lottie), dan desain dari akun Canva pembuat video.
// Berkas & indeksnya ada di /pustaka (apps/web/public/pustaka, disalin juga ke layanan render), jadi tidak ada
// unduhan dari luar saat menyunting maupun merender. Indeks dimuat sekali saat panel pertama kali dibuka.
import { useCallback, useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import { minta } from "@/components/banksoal/api";

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

export default function PustakaAset({ jenisAwal = "emoji", judul = "Pustaka aset", onPilih, onTutup, onUnggah }) {
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
    if ((jenis === "emoji" || jenis === "ikon") && !data[jenis]) muat(jenis).then((d) => { if (!batal) setData((x) => ({ ...x, [jenis]: d })); }).catch((e) => { if (!batal) setGalat(e.message); });
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
                {[["emoji", "Emoji 3D", "bi-emoji-smile"], ["ikon", "Ikon", "bi-bezier2"], ["unggahan", "Unggahan sekolah", "bi-cloud-arrow-up"], ["canva", "Canva", "bi-palette2"]].map(([v, l, ic]) => (
                  <li key={v} className="nav-item" role="presentation">
                    <button type="button" role="tab" aria-selected={jenis === v} className={`nav-link py-1 ${jenis === v ? "active" : ""}`} onClick={() => setJenis(v)}><i className={`bi ${ic} me-1`}></i>{l}</button>
                  </li>
                ))}
              </ul>
              {jenis === "unggahan" && <TabUnggahan onPilih={onPilih} onUnggah={onUnggah} />}
              {jenis === "canva" && <TabCanva onSelesai={() => setJenis("unggahan")} />}
              {(jenis === "emoji" || jenis === "ikon") && <>
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
              </>}
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

const LABEL_JENIS = { GAMBAR: "Gambar", SVG: "SVG", LOTTIE: "Lottie" };

/** Aset milik sekolah: gambar/SVG/Lottie yang pernah diunggah atau diimpor dari Canva, plus unggah baru. */
function TabUnggahan({ onPilih, onUnggah }) {
  const [daftar, setDaftar] = useState(null);
  const [saring, setSaring] = useState("");
  const [proses, setProses] = useState(false);
  useEffect(() => {
    minta("GET", "/video-belajar/aset").then((r) => setDaftar((r.data || []).filter((a) => a.jenis !== "AUDIO"))).catch((e) => { setDaftar([]); Swal.fire("Gagal", e.message, "error"); });
  }, []);
  const unggahBaru = async (jenis) => {
    const f = await new Promise((ok) => {
      const i = Object.assign(document.createElement("input"), { type: "file", accept: jenis === "lottie" ? "application/json,.json" : "image/png,image/jpeg,image/webp,image/svg+xml,.svg" });
      i.onchange = () => ok(i.files?.[0]); i.click();
    });
    if (!f || !onUnggah) return;
    setProses(true);
    const url = await onUnggah(f, jenis);
    setProses(false);
    if (url) onPilih({ tipe: jenis === "lottie" ? "lottie" : "gambar", isi: url });
  };
  const tampil = (daftar || []).filter((a) => !saring || a.jenis === saring);
  return (
    <div>
      <div className="d-flex flex-wrap gap-2 align-items-center mb-2">
        <button type="button" className="btn btn-sm btn-primary" disabled={proses} onClick={() => unggahBaru("gambar")}><i className="bi bi-image me-1"></i>Unggah gambar / SVG</button>
        <button type="button" className="btn btn-sm btn-primary" disabled={proses} onClick={() => unggahBaru("lottie")}><i className="bi bi-film me-1"></i>Unggah animasi Lottie</button>
        {proses && <span className="spinner-border spinner-border-sm"></span>}
        <label className="visually-hidden" htmlFor="pkJenis">Jenis aset</label>
        <select id="pkJenis" className="form-select form-select-sm ms-auto" style={{ width: "auto" }} value={saring} onChange={(e) => setSaring(e.target.value)}>
          <option value="">Semua jenis</option><option value="GAMBAR">Gambar</option><option value="SVG">SVG</option><option value="LOTTIE">Lottie</option>
        </select>
      </div>
      <div className="form-text mb-2">SVG dibersihkan dari skrip &amp; tautan luar (maks. 1 MB). Lottie: JSON dari After Effects/LottieFiles dengan gambar tertanam (maks. 3 MB); kode expression dibuang.</div>
      {!daftar && <div className="text-center text-body-secondary py-5"><span className="spinner-border spinner-border-sm me-2"></span>Memuat aset sekolah…</div>}
      {daftar && !tampil.length && <div className="text-center text-body-secondary py-4">Belum ada aset. Unggah gambar, SVG, atau animasi Lottie milik sekolah.</div>}
      <div className="studio-pustaka studio-pustaka-besar">
        {tampil.map((a) => (
          <button key={a.id} type="button" className="studio-pustaka-item flex-column" title={a.nama_asli || a.path} aria-label={`${LABEL_JENIS[a.jenis] || "Aset"} ${a.nama_asli || ""}`}
            onClick={() => onPilih({ tipe: a.jenis === "LOTTIE" ? "lottie" : "gambar", isi: a.path })}>
            {a.jenis === "LOTTIE" ? <i className="bi bi-film fs-2 text-primary"></i> : <img src={a.path} alt="" loading="lazy" style={{ maxWidth: "80%", maxHeight: "62%", objectFit: "contain" }} />}
            <span className="studio-pustaka-nama">{LABEL_JENIS[a.jenis]} · {a.nama_asli || "tanpa nama"}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Desain di akun Canva pembuat video: sambungkan (OAuth), cari, lalu impor halaman sebagai gambar aset. */
function TabCanva({ onSelesai }) {
  const [status, setStatus] = useState(null);
  const [q, setQ] = useState("");
  const [desain, setDesain] = useState(null);
  const [lanjutan, setLanjutan] = useState(null);
  const [pilih, setPilih] = useState(null);
  const [opsi, setOpsi] = useState({ format: "png", halaman: "1", transparan: false, foto: "tidak" });
  const [proses, setProses] = useState(false);
  const [galat, setGalat] = useState("");

  const periksa = useCallback(() => { minta("GET", "/video-belajar/canva").then((r) => setStatus(r.data)).catch((e) => setGalat(e.message)); }, []);
  useEffect(() => {
    periksa();
    // Jendela pop-up OAuth (canva-selesai.html) mengabari tab ini; suntingan Studio tidak hilang
    const kabar = (st) => {
      if (st === "tersambung") periksa();
      else Swal.fire("Canva", st === "batal" ? "Penyambungan dibatalkan." : "Penyambungan Canva gagal. Coba lagi.", st === "batal" ? "info" : "error");
    };
    let kanal = null;
    try { kanal = new BroadcastChannel("studio-canva"); kanal.onmessage = (m) => kabar(m.data?.canva); } catch { /* peramban lama */ }
    const simpan = (ev) => { if (ev.key === "studio-canva" && ev.newValue && !kanal) kabar(ev.newValue.split(":")[0]); };
    window.addEventListener("storage", simpan);
    return () => { kanal?.close(); window.removeEventListener("storage", simpan); };
  }, [periksa]);
  const cari = useCallback(async (lagi = false) => {
    setGalat("");
    try {
      const qs = new URLSearchParams({ ...(q.trim() ? { cari: q.trim() } : {}), ...(lagi && lanjutan ? { lanjutan } : {}) });
      const r = await minta("GET", `/video-belajar/canva/desain?${qs}`);
      setDesain((d) => (lagi ? [...(d || []), ...r.data.items] : r.data.items));
      setLanjutan(r.data.lanjutan || null);
    } catch (e) { setGalat(e.message); if (!lagi) setDesain([]); }
  }, [q, lanjutan]);
  useEffect(() => { if (status?.tersambung) cari(false); }, [status?.tersambung]); // eslint-disable-line react-hooks/exhaustive-deps

  const sambung = async () => {
    // Jendela dibuka langsung saat klik (agar tidak diblokir), lalu diarahkan ke halaman izin Canva
    const jendela = window.open("", "canva-sambung", "width=520,height=720");
    try {
      const r = await minta("POST", "/video-belajar/canva/sambung", { asal: window.location.origin });
      if (jendela) jendela.location.href = r.url; else window.open(r.url, "_blank", "noopener");
    } catch (e) { jendela?.close(); Swal.fire("Gagal", e.message, "error"); }
  };
  const putuskan = async () => {
    await minta("DELETE", "/video-belajar/canva/sambung").catch(() => {});
    setStatus((s) => ({ ...s, tersambung: false, nama: null })); setDesain(null);
  };
  const impor = async () => {
    const halaman = opsi.halaman.trim().toLowerCase() === "semua" ? [] : opsi.halaman.split(/[\s,]+/).map(Number).filter((n) => n >= 1);
    setProses(true);
    try {
      const r = await minta("POST", "/video-belajar/canva/impor", {
        id_desain: pilih.id, judul: pilih.judul, format: opsi.format, halaman: halaman.length ? halaman.slice(0, 10) : undefined,
        transparan: opsi.format === "png" && opsi.transparan, foto_siswa: opsi.foto !== "tidak", izin_ortu: opsi.foto === "izin",
      });
      Swal.fire({ icon: "success", title: "Diimpor dari Canva", text: `${r.message} Pilih di tab Unggahan sekolah.`, timer: 2200, showConfirmButton: false });
      setPilih(null); onSelesai();
    } catch (e) { Swal.fire("Gagal", e.message, "error"); }
    setProses(false);
  };

  if (galat && !status) return <div className="alert alert-danger py-2 small">{galat}</div>;
  if (!status) return <div className="text-center text-body-secondary py-5"><span className="spinner-border spinner-border-sm me-2"></span>Memeriksa sambungan Canva…</div>;
  if (!status.terkonfigurasi) return <div className="alert alert-info small mb-0"><i className="bi bi-info-circle me-1"></i>Integrasi Canva belum diatur. Admin perlu mengisi Client ID &amp; Client Secret di <b>Pengaturan → Integrasi Canva</b>.</div>;
  if (!status.tersambung) return (
    <div className="text-center py-4">
      <p className="text-body-secondary small">Sambungkan akun Canva Anda untuk mengimpor desain (poster, slide, infografis) sebagai gambar di video.</p>
      <button type="button" className="btn btn-primary" onClick={sambung}><i className="bi bi-link-45deg me-1"></i>Sambungkan akun Canva</button>
    </div>
  );
  if (pilih) return (
    <div>
      <button type="button" className="btn btn-sm btn-link px-0 mb-2" onClick={() => setPilih(null)}><i className="bi bi-arrow-left me-1"></i>Kembali ke daftar desain</button>
      <div className="d-flex gap-3 flex-wrap">
        {pilih.thumbnail && <img src={pilih.thumbnail} alt="" style={{ width: 160, maxHeight: 200, objectFit: "contain" }} className="border rounded" />}
        <div className="flex-grow-1" style={{ minWidth: 220 }}>
          <div className="fw-semibold mb-2">{pilih.judul}{pilih.halaman ? <span className="text-body-secondary small"> · {pilih.halaman} halaman</span> : null}</div>
          <div className="row g-2">
            <div className="col-6"><label className="form-label small mb-1" htmlFor="cvFormat">Format</label>
              <select id="cvFormat" className="form-select form-select-sm" value={opsi.format} onChange={(e) => setOpsi({ ...opsi, format: e.target.value })}><option value="png">PNG (tajam)</option><option value="jpg">JPG (lebih kecil)</option></select></div>
            <div className="col-6"><label className="form-label small mb-1" htmlFor="cvHal">Halaman</label>
              <input id="cvHal" className="form-control form-control-sm" value={opsi.halaman} onChange={(e) => setOpsi({ ...opsi, halaman: e.target.value })} placeholder="1, 2, 3 atau semua" /></div>
            {opsi.format === "png" && <div className="col-12"><div className="form-check form-switch">
              <input className="form-check-input" type="checkbox" role="switch" id="cvTrans" checked={opsi.transparan} onChange={(e) => setOpsi({ ...opsi, transparan: e.target.checked })} />
              <label className="form-check-label small" htmlFor="cvTrans">Latar transparan (perlu Canva berbayar/Education)</label></div></div>}
            <div className="col-12"><label className="form-label small mb-1" htmlFor="cvFoto">Memuat foto siswa?</label>
              <select id="cvFoto" className="form-select form-select-sm" value={opsi.foto} onChange={(e) => setOpsi({ ...opsi, foto: e.target.value })}>
                <option value="tidak">Tidak</option><option value="izin">Ya, orang tua sudah memberi izin</option><option value="belum">Ya, belum ada izin orang tua</option></select></div>
          </div>
          <button type="button" className="btn btn-primary btn-sm mt-3" disabled={proses} onClick={impor}>{proses ? <><span className="spinner-border spinner-border-sm me-1"></span>Mengekspor dari Canva…</> : <><i className="bi bi-download me-1"></i>Impor (maks. 10 halaman)</>}</button>
        </div>
      </div>
    </div>
  );
  return (
    <div>
      <div className="d-flex gap-2 align-items-center mb-2">
        <label className="visually-hidden" htmlFor="cvCari">Cari desain Canva</label>
        <input id="cvCari" type="search" className="form-control form-control-sm" placeholder="Cari desain Canva…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") cari(false); }} />
        <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => cari(false)}>Cari</button>
        <button type="button" className="btn btn-sm btn-outline-secondary text-nowrap" onClick={putuskan} title="Putuskan akun Canva">Putuskan{status.nama ? ` (${status.nama})` : ""}</button>
      </div>
      {galat && <div className="alert alert-danger py-2 small">{galat}</div>}
      {!desain && <div className="text-center text-body-secondary py-5"><span className="spinner-border spinner-border-sm me-2"></span>Memuat desain…</div>}
      {desain && !desain.length && <div className="text-center text-body-secondary py-4">Tidak ada desain.</div>}
      <div className="studio-pustaka studio-pustaka-besar">
        {(desain || []).map((d) => (
          <button key={d.id} type="button" className="studio-pustaka-item flex-column" aria-label={`Desain Canva ${d.judul}`} onClick={() => setPilih(d)}>
            {d.thumbnail ? <img src={d.thumbnail} alt="" loading="lazy" style={{ maxWidth: "90%", maxHeight: "65%", objectFit: "contain" }} /> : <i className="bi bi-file-earmark-image fs-2"></i>}
            <span className="studio-pustaka-nama">{d.judul}</span>
          </button>
        ))}
      </div>
      {lanjutan && <div className="text-center mt-2"><button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => cari(true)}>Tampilkan lebih banyak</button></div>}
    </div>
  );
}
