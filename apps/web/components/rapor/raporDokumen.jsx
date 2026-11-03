"use client";
// Mesin kalkulasi & komponen dokumen rapor, dipakai halaman Cetak Rapor dan Portal Siswa/Orang Tua
import { Fragment } from "react";
import { API_URL } from "@/app/lib/config";
import { tingkatKktp, tingkatNilai } from "@/app/lib/kktp";


export const DIMENSI = [
  { key: "S", label: "Skill", nama: "keterampilan praktik", color: "primary" },
  { key: "T", label: "Teori", nama: "pemahaman konsep teori", color: "success" },
  { key: "N", label: "Nalar", nama: "penalaran kritis", color: "info" },
  { key: "K", label: "Karakter", nama: "sikap & karakter", color: "warning" },
  { key: "M", label: "Minat", nama: "minat & antusiasme", color: "danger" },
];
export const FRASA_POSITIF = ["Menunjukkan keunggulan dalam", "Sangat kompeten pada", "Memiliki penguasaan yang kuat terkait", "Sangat antusias dan cakap dalam"];
export const FRASA_BIMBINGAN = ["namun perlu pendampingan lebih pada", "dan disarankan untuk lebih fokus melatih", "meski demikian, masih membutuhkan bimbingan dalam"];
export const MODE_KALKULASI = [
  { value: "1", label: "1. Konvensional", info: "Rata-rata nilai mentah per mapel." },
  { value: "2", label: "2. Hibrida (STNKM)", info: "Rata-rata nilai mentah + bonus jurnal (mode BONUS) dibagi rata ke semua mapel." },
  { value: "3", label: "3. Absolut (STNKM)", info: "Rata-rata tertimbang poin S-T-N-K-M sesuai bobot + bonus jurnal." },
];
export const JENIS_DOKUMEN = [
  { value: "lengkap", label: "Buku Lengkap" },
  { value: "akademik", label: "Akademik Saja" },
  { value: "p5", label: "Rapor P5 Saja" },
];
export const AI_MODES = [
  { value: "GEMINI", label: "Google Gemini" },
  { value: "CLAUDE", label: "Claude" },
  { value: "QWEN", label: "Qwen" },
  { value: "DEEPSEEK", label: "DeepSeek" },
  { value: "OPENKEY", label: "OpenKey" },
  { value: "LOKAL", label: "Tanpa AI (Lokal)" },
];
export const PREDIKAT = ["BB", "MB", "BSH", "SB"];
export const CATATAN_DEFAULT = "Peserta didik menunjukkan perkembangan sikap dan karakter yang stabil.";
export const CATATAN_P5_DEFAULT = "Peserta didik mengikuti proses proyek dengan antusias.";

export const num = (v) => parseFloat(v) || 0;
export const rata = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
export const todayYmd = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const tanggalPanjang = (ymd) => {
  if (!ymd) return "-";
  const [y, m, d] = String(ymd).slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
};
export const formatNomorWA = (nomor) => {
  const clean = String(nomor || "").replace(/\D/g, "");
  if (clean.startsWith("08")) return "62" + clean.slice(1);
  if (clean.startsWith("8")) return "62" + clean;
  return clean;
};
// Nama kelas yang sudah diawali "Kelas" tidak diberi awalan lagi
export const labelKelasResmi = (nama) => (/^kelas\b/i.test(nama) ? nama : `Kelas ${nama}`);
export const urlTtd = (path) => (path ? `${API_URL}/signature/${path.split("/").pop()}` : null);

// Mapel agama hanya ditampilkan sesuai agama siswa; IPA/IPS tidak diajarkan di kelas 1–3 (logika GAS)
export const mapelBerlaku = (namaMapel, agama, tingkat) => {
  const nm = namaMapel.toLowerCase();
  if (nm.includes("agama")) {
    if (!agama || agama === "-") return true;
    if (agama.includes("kristen")) return nm.includes("kristen") && !nm.includes("katolik");
    for (const a of ["katolik", "islam", "hindu", "buddha", "konghucu"]) if (agama.includes(a)) return nm.includes(a);
    return false;
  }
  if ((nm === "ipa" || nm === "ips") && tingkat >= 1 && tingkat <= 3) return false;
  return true;
};

// =========================================================================
// DESKRIPSI CAPAIAN DARI INDIKATOR (IKTP)
// =========================================================================
// "Peserta didik dapat membandingkan pecahan" → "membandingkan pecahan", agar enak dibaca di dalam kalimat
const frasaIndikator = (teks) => {
  const t = String(teks || "").trim().replace(/[.;]+$/, "").replace(/^(peserta didik|siswa|murid|ananda)\s+(dapat|mampu|bisa)\s+/i, "");
  return t.charAt(0).toLowerCase() + t.slice(1);
};
// "serta", bukan "dan": deskripsi indikator sendiri sering memuat kata "dan"
const gabungFrasa = (list) => (list.length <= 1 ? list.join("") : `${list.slice(0, -1).join(", ")} serta ${list[list.length - 1]}`);

/**
 * Nilai per indikator satu siswa pada satu mapel: nilai remedial terbaru menggantikan nilai reguler,
 * selain itu rata-rata nilai reguler. Kalimat: indikator terkuat (≥ KKM) dan yang perlu bimbingan (< KKM).
 */
export function deskripsiIndikator(baris, kkm, tingkat) {
  const per = new Map();
  baris.forEach((b) => {
    const p = per.get(b.id_indikator) || { deskripsi: b.deskripsi, urutan: b.urutan, reguler: [], remedial: null };
    if (b.tipe_nilai === "REMEDIAL") p.remedial = num(b.nilai); // baris sudah urut tanggal: yang terakhir menang
    else p.reguler.push(num(b.nilai));
    per.set(b.id_indikator, p);
  });
  const items = [...per.values()].map((p) => ({ ...p, nilai: p.remedial ?? rata(p.reguler) }));
  if (!items.length) return null;

  const perlu = items.filter((i) => i.nilai < kkm).sort((a, b) => a.nilai - b.nilai).slice(0, 2);
  // Semua tuntas: indikator terendah disebut "perlu peningkatan" bila belum mencapai tingkat tertinggi
  const terendah = [...items].sort((a, b) => a.nilai - b.nilai)[0];
  const tingkatkan = !perlu.length && items.length > 1 && terendah.nilai < tingkat[0].min ? terendah : null;
  const kuat = items.filter((i) => i.nilai >= kkm && i !== tingkatkan).sort((a, b) => b.nilai - a.nilai).slice(0, 2);

  const seg = [];
  if (kuat.length) {
    const level = tingkatNilai(rata(kuat.map((i) => i.nilai)), tingkat).label.toLowerCase();
    seg.push({ t: `Menunjukkan penguasaan yang ${level} dalam ` }, { t: gabungFrasa(kuat.map((i) => frasaIndikator(i.deskripsi))), b: true });
  }
  if (perlu.length) {
    seg.push({ t: kuat.length ? ". Perlu bimbingan dalam " : "Perlu bimbingan dalam " }, { t: gabungFrasa(perlu.map((i) => frasaIndikator(i.deskripsi))), b: true });
  } else if (tingkatkan) {
    seg.push({ t: ". Perlu peningkatan dalam " }, { t: frasaIndikator(tingkatkan.deskripsi), b: true });
  }
  seg.push({ t: "." });
  return seg;
}

// =========================================================================
// MESIN KALKULASI RAPOR (port dari rapor.html GAS)
// =========================================================================
export function hitungRapor(data, idSiswa, modeKalkulasi, bobot) {
  const siswa = data.students.find((s) => s.id_siswa === idSiswa);
  if (!siswa) return null;
  const kelas = data.kelas || {};
  const periode = data.periode || {};
  const agama = String(siswa.agama?.nama_agama || "").toLowerCase();
  const tingkat = parseInt(String(kelas.nama_kelas || "").match(/\d+/)?.[0] || "0", 10);

  // Mapel paralel dengan nama sama digabung jadi satu baris
  const grupMapel = [];
  data.subjects.filter((m) => mapelBerlaku(String(m.nama_mapel || "").trim(), agama, tingkat)).forEach((m) => {
    const nama = String(m.nama_mapel).trim();
    const ada = grupMapel.find((g) => g.kunci === nama.toLowerCase());
    if (ada) ada.ids.push(m.id_mapel);
    else grupMapel.push({ kunci: nama.toLowerCase(), nama, kkm: m.kkm ?? 75, ids: [m.id_mapel] });
  });

  // Jurnal: mode BONUS menambah nilai akhir, mode PISAH menjadi bahan catatan karakter
  const jurnal = data.jurnal.filter((j) => j.id_siswa === idSiswa);
  let bonusJurnal = 0;
  const narasiPisah = [];
  jurnal.forEach((j) => {
    if (j.mode_dampak === "BONUS") bonusJurnal += DIMENSI.reduce((s, d) => s + num(j[`val_${d.key}`]), 0);
    else if (j.mode_dampak === "PISAH" && j.narasi_kejadian) narasiPisah.push(j.narasi_kejadian);
  });
  const bonusPerMapel = bonusJurnal / (grupMapel.length || 1);
  const tingkatCapaian = tingkatKktp(data.settings);
  const nilaiIndikatorSiswa = (data.nilai_indikator || []).filter((n) => n.id_siswa === idSiswa);
  const totalBobot = DIMENSI.reduce((s, d) => s + bobot[d.key], 0) || 1;

  const poinGlobal = Object.fromEntries(DIMENSI.map((d) => [d.key, []]));
  const mapelRows = grupMapel.map((g, i) => {
    const nilaiSiswa = data.nilai.filter((n) => n.id_siswa === idSiswa && g.ids.includes(n.id_mapel) && num(n.nilai) > 0);
    const row = { no: i + 1, nama: g.nama, kkm: g.kkm, nilai: null, deskripsi: null };
    if (nilaiSiswa.length === 0) return row;

    const avg = Object.fromEntries(DIMENSI.map((d) => [d.key, rata(nilaiSiswa.map((n) => num(n[`poin_${d.key}`])))]));
    nilaiSiswa.forEach((n) => DIMENSI.forEach((d) => poinGlobal[d.key].push(num(n[`poin_${d.key}`]))));
    const kuat = [], bimbingan = [];
    nilaiSiswa.forEach((n) => {
      const materi = n.materi?.nama_materi;
      if (!materi) return;
      const target = num(n.nilai) >= g.kkm ? kuat : bimbingan;
      if (!target.includes(materi)) target.push(materi);
    });

    let akhir;
    if (modeKalkulasi === "3") {
      akhir = DIMENSI.reduce((s, d) => s + avg[d.key] * bobot[d.key], 0) / totalBobot + bonusPerMapel;
    } else {
      akhir = rata(nilaiSiswa.map((n) => num(n.nilai))) + (modeKalkulasi === "2" ? bonusPerMapel : 0);
    }
    row.nilai = Math.round(Math.min(Math.max(akhir, 0), 100));

    if (modeKalkulasi === "1") {
      row.deskripsi = [{ t: row.nilai >= 90 ? "Sangat baik dalam memahami materi dan kompetensi dasar."
        : row.nilai >= g.kkm ? "Baik dalam memahami sebagian besar kompetensi dasar."
          : "Membutuhkan bimbingan lebih lanjut untuk menguasai kompetensi dasar." }];
    } else {
      const urut = [...DIMENSI].sort((a, b) => avg[b.key] - avg[a.key]);
      const tertinggi = urut[0], terendah = urut[urut.length - 1];
      row.deskripsi = [
        { t: `${FRASA_POSITIF[i % FRASA_POSITIF.length]} aspek ` }, { t: tertinggi.nama, b: true },
        ...(kuat.length ? [{ t: " khususnya pada materi " }, { t: kuat.slice(0, 2).join(", "), b: true }] : []),
        { t: `, ${FRASA_BIMBINGAN[i % FRASA_BIMBINGAN.length]} aspek ` }, { t: terendah.nama, b: true },
        ...(bimbingan.length ? [{ t: " terkait materi " }, { t: bimbingan.slice(0, 2).join(", "), b: true }] : []),
        { t: "." },
      ];
    }
    // Mapel yang dinilai per indikator memakai deskripsi capaian dari indikatornya (selaras KKTP)
    const dariIndikator = deskripsiIndikator(nilaiIndikatorSiswa.filter((n) => g.ids.includes(n.id_mapel)), g.kkm, tingkatCapaian);
    if (dariIndikator) row.deskripsi = dariIndikator;
    return row;
  });

  const catatanWali = data.catatan_wali.find((c) => c.id_siswa === idSiswa);
  const presensi = { hadir: 0, sakit: 0, izin: 0, alpa: 0 };
  data.presensi.filter((p) => p.id_siswa === idSiswa).forEach((p) => {
    const st = String(p.status_kehadiran || "").toLowerCase();
    presensi[st in presensi ? st : "hadir"]++;
  });

  const proyek = data.proyek.map((p) => {
    const dimensi = [];
    p.targets.forEach((t) => {
      let grup = dimensi.find((d) => d.nama === t.dimensi);
      if (!grup) dimensi.push(grup = { nama: t.dimensi, targets: [] });
      const nilai = data.nilai_p5.find((n) => n.id_proyek === p.id_proyek && n.id_siswa === idSiswa && n.id_target === t.id_target);
      grup.targets.push({ ...t, predikat: nilai?.predikat || null });
    });
    const catatan = data.catatan_p5.find((c) => c.id_proyek === p.id_proyek && c.id_siswa === idSiswa);
    return { ...p, dimensi, catatan: catatan?.catatan_proses || CATATAN_P5_DEFAULT };
  });

  const terisi = mapelRows.filter((r) => r.nilai !== null);
  return {
    siswa, kelas, periode,
    sek: data.settings || {},
    waliKelas: data.wali_kelas,
    isGenap: /genap/i.test(String(periode.semester || "")) || String(periode.semester) === "2",
    agamaTeks: siswa.agama?.nama_agama || "-",
    mapelRows,
    rataUmum: terisi.length ? (terisi.reduce((s, r) => s + r.nilai, 0) / terisi.length).toFixed(1) : "-",
    poinSTNKM: Object.fromEntries(DIMENSI.map((d) => [d.key, Math.round(rata(poinGlobal[d.key]))])),
    bonusJurnal,
    catatan: catatanWali?.catatan_final || (narasiPisah.length ? narasiPisah.join(" | ") : CATATAN_DEFAULT),
    catatanTersimpan: !!catatanWali,
    presensi,
    proyek,
  };
}

// Pesan WhatsApp ringkasan rapor untuk orang tua dan untuk kepsek/grup guru
export function susunPesanWA(r) {
  const s = r.siswa;
  const kontak = s.no_wa || s.ortu?.no_wa || s.wali?.no_wa || "";
  const namaOrtu = s.ortu?.nama_ayah || s.ortu?.nama_ibu || s.wali?.nama_wali || "";
  const sapaan = namaOrtu ? `Bapak/Ibu ${namaOrtu}` : `Bapak/Ibu Orang Tua/Wali dari ${s.nama_siswa}`;
  const namaSekolah = r.sek.nama_sekolah || "Sekolah";
  const namaKelas = r.kelas.nama_kelas || "-";
  const labelKelas = labelKelasResmi(namaKelas);
  const periodeStr = `${r.periode.tahun_ajaran || "-"} (Semester ${r.periode.semester || "-"})`;
  const waliNama = r.waliKelas?.nama_guru || "Wali Kelas";
  const terisi = r.mapelRows.filter((m) => m.nilai !== null);
  const barisMapel = terisi.length ? terisi.map((m, i) => `${i + 1}. ${m.nama}: *${m.nilai}*`).join("\n") : "- Belum ada nilai akademik terinput -";
  const p = r.poinSTNKM;
  const pr = r.presensi;

  const pesanOrtu = `Selamat pagi/siang ${sapaan},\n\n`
    + `Salam kasih dari *${namaSekolah}*. Berikut kami sampaikan *Ringkasan Laporan Hasil Belajar (Rapor)* ananda:\n\n`
    + `👦 Nama Siswa: *${s.nama_siswa}*\n🏫 Kelas: *${namaKelas}*\n📅 Periode: ${periodeStr}\n\n`
    + `*📚 CAPAIAN NILAI AKADEMIK:*\n${barisMapel}\n📈 *Rata-Rata Umum: ${r.rataUmum}*\n\n`
    + `*🎯 PROFIL DIMENSI STNKM (RATA-RATA):*\n• Skill (S): ${p.S} | Teori (T): ${p.T} | Nalar (N): ${p.N}\n• Karakter (K): ${p.K} | Minat (M): ${p.M}\n\n`
    + `*🗓️ REKAP KEHADIRAN:*\n🤒 Sakit: ${pr.sakit} hr | 📝 Izin: ${pr.izin} hr | ❌ Alpa: ${pr.alpa} hr\n\n`
    + `*💬 CATATAN EVALUASI WALI KELAS:*\n_"${r.catatan}"_\n\n`
    + `Terima kasih atas kerja sama dan dukungan Bapak/Ibu dalam mendampingi pendidikan ananda bersama kami.\n\n`
    + `Hormat kami,\n*${waliNama}*\n(Wali ${labelKelas})`;

  const pesanGrup = `*📊 RINGKASAN RAPOR SISWA - ${namaSekolah.toUpperCase()}*\n`
    + `👦 Siswa: *${s.nama_siswa}* (${labelKelas})\n📅 Periode: ${periodeStr}\n📈 Rata-Rata Akademik: *${r.rataUmum}*\n`
    + `🎯 Indeks STNKM: [S:${p.S} | T:${p.T} | N:${p.N} | K:${p.K} | M:${p.M}]\n`
    + `🗓️ Ketidakhadiran: S:${pr.sakit} | I:${pr.izin} | A:${pr.alpa}\n\n`
    + `*Catatan Wali Kelas (${waliNama}):*\n"${r.catatan}"`;

  return {
    nomorOrtu: formatNomorWA(kontak), sapaan, pesanOrtu, pesanGrup,
    nomorKepsek: formatNomorWA(r.sek.no_wa_kepsek), idGrup: r.sek.id_wa_group_guru || "",
  };
}

// CSS dokumen dipakai bersama oleh pratinjau dan jendela cetak
export const RAPOR_CSS = `
.rp-page { font-family: "Times New Roman", Times, serif; color: #000; font-size: 12px; line-height: 1.35; }
.rp-break { page-break-after: always; break-after: page; }
.rp-main { width: 100%; border-collapse: collapse; }
.rp-main > thead { display: table-header-group; }
.rp-main > tfoot { display: table-footer-group; }
.rp-main > thead > tr > td, .rp-main > tbody > tr > td, .rp-main > tfoot > tr > td { border: none; padding: 0 2px; }
.rp-head { width: 100%; border-collapse: collapse; border-bottom: 3px double #000; margin-bottom: 12px; font-size: 13px; }
.rp-head td { padding: 2px 0 6px; vertical-align: top; }
.rp-title { font-weight: bold; font-size: 13px; margin: 14px 0 6px; }
.rp-table { width: 100%; border-collapse: collapse; margin-top: 5px; font-size: 12px; }
.rp-table th, .rp-table td { border: 1px solid #000; padding: 6px; text-align: left; vertical-align: middle; }
.rp-table th { background: #f0f0f0; text-align: center; font-weight: bold; }
.rp-table .rp-c { text-align: center; }
.rp-table .rp-dim { background: #fafafa; font-weight: bold; }
.rp-box { border: 1px solid #000; padding: 10px; min-height: 50px; font-style: italic; background: #fafafa; margin-bottom: 12px; }
.rp-proyek { border: 1px solid #000; padding: 8px 10px; margin-bottom: 10px; background: #f9f9f9; }
.rp-ttd { width: 100%; border-collapse: collapse; text-align: center; font-size: 13px; margin-top: 18px; page-break-inside: avoid; }
.rp-ttd td { padding: 0; vertical-align: top; }
.rp-ttd-space { height: 70px; display: flex; align-items: center; justify-content: center; }
.rp-ttd-space img { max-height: 64px; max-width: 160px; }
.rp-cover { text-align: center; padding: 30mm 15mm; border: 4px double #000; min-height: 255mm; box-sizing: border-box; }
.rp-cover-box { border: 2px solid #000; padding: 15px; width: 75%; margin: 25mm auto; border-radius: 6px; }
.rp-bio { width: 100%; font-size: 13px; line-height: 1.9; border-collapse: collapse; }
.rp-bio td { vertical-align: top; }
.rp-table tr, .rp-bio tr { page-break-inside: avoid; }
`;
export const PREVIEW_CSS = `
.rapor-preview { overflow-x: auto; padding-bottom: 8px; }
.rapor-preview .rp-page { background: #fff; width: 210mm; min-height: 297mm; padding: 15mm; margin: 0 auto 20px; box-sizing: border-box; box-shadow: 0 4px 12px rgba(0,0,0,.15); }
`;

// =========================================================================
// KOMPONEN DOKUMEN
// =========================================================================
export const KopIdentitas = ({ r }) => (
  <table className="rp-head"><tbody>
    <tr><td width="20%">Nama Sekolah</td><td width="2%">:</td><td width="48%"><strong>{r.sek.nama_sekolah || "-"}</strong></td><td width="12%">Kelas</td><td width="2%">:</td><td width="16%">{r.kelas.nama_kelas || "-"}</td></tr>
    <tr><td>Alamat</td><td>:</td><td>{r.sek.alamat_sekolah || "-"}</td><td>Semester</td><td>:</td><td>{r.periode.semester || "-"}</td></tr>
    <tr><td>Nama Peserta Didik</td><td>:</td><td><strong>{r.siswa.nama_siswa}</strong></td><td>Tahun Ajaran</td><td>:</td><td>{r.periode.tahun_ajaran || "-"}</td></tr>
    <tr><td>NISN / NPSN</td><td>:</td><td>{r.siswa.nisn || r.siswa.id_siswa} / {r.sek.npsn || "-"}</td><td></td><td></td><td></td></tr>
  </tbody></table>
);

export const TandaTangan = ({ r, tanggal }) => {
  const ttdKepsek = urlTtd(r.sek.ttd_kepsek_url);
  const lebar = r.isGenap ? "33.3%" : "50%";
  return (
    <table className="rp-ttd"><tbody><tr>
      <td width={lebar}>Mengetahui,<br />Orang Tua/Wali,<div className="rp-ttd-space"></div>( ............................................ )</td>
      {r.isGenap && (
        <td width={lebar}>
          Mengetahui,<br />Kepala Sekolah,
          <div className="rp-ttd-space">{ttdKepsek && <img src={ttdKepsek} alt="" />}</div>
          <strong>{r.sek.nama_kepsek || "-"}</strong><br />NIP. {r.sek.nip_kepsek || "-"}
        </td>
      )}
      <td width={lebar}>
        {r.sek.kota || "-"}, {tanggalPanjang(tanggal)}<br />Wali Kelas,<div className="rp-ttd-space"></div>
        <strong>{r.waliKelas?.nama_guru || "...................................."}</strong>
        {r.waliKelas?.nip_nik && <><br />NIP. {r.waliKelas.nip_nik}</>}
      </td>
    </tr></tbody></table>
  );
};

// Kop identitas & tanda tangan diulang otomatis bila isi halaman meluber ke kertas berikutnya
export const HalamanBerkop = ({ r, tanggal, pecah, children, footer }) => (
  <div className={`rp-page${pecah ? " rp-break" : ""}`}>
    <table className="rp-main">
      <thead><tr><td><KopIdentitas r={r} /></td></tr></thead>
      <tbody><tr><td>{children}</td></tr></tbody>
      <tfoot><tr><td style={{ paddingTop: 12 }}>{footer}<TandaTangan r={r} tanggal={tanggal} /></td></tr></tfoot>
    </table>
  </div>
);

export const Sampul = ({ r, pecah }) => (
  <div className={`rp-page${pecah ? " rp-break" : ""}`}>
    <div className="rp-cover">
      <div style={{ fontSize: 22, fontWeight: "bold", marginBottom: 8 }}>LAPORAN HASIL CAPAIAN KOMPETENSI PESERTA DIDIK</div>
      <div style={{ fontSize: 17, fontWeight: "bold" }}>{String(r.sek.nama_sekolah || "").toUpperCase()}</div>
      <div className="rp-cover-box">
        <div style={{ fontSize: 13, marginBottom: 6 }}>NAMA PESERTA DIDIK:</div>
        <div style={{ fontSize: 18, fontWeight: "bold", textTransform: "uppercase" }}>{r.siswa.nama_siswa}</div>
        <hr style={{ borderTop: "1px solid #000", margin: "10px 0" }} />
        <div style={{ fontSize: 13 }}>NISN: <strong>{r.siswa.nisn || r.siswa.id_siswa}</strong></div>
      </div>
      <div style={{ fontSize: 14, fontWeight: "bold" }}>
        NPSN: {r.sek.npsn || "-"}<br />{r.sek.alamat_sekolah || ""}<br />{String(r.sek.kota || "").toUpperCase()}
      </div>
    </div>
  </div>
);

export const Biodata = ({ r, tanggal, pecah }) => {
  const s = r.siswa;
  const ttdKepsek = urlTtd(r.sek.ttd_kepsek_url);
  const baris = [
    ["Nama Lengkap Peserta Didik", <strong key="n">{s.nama_siswa}</strong>],
    ["Nomor Induk / NISN", `${s.id_siswa} / ${s.nisn || "-"}`],
    ["Tempat, Tanggal Lahir", `${s.tempat_lahir || "-"}, ${s.tgl_lahir ? tanggalPanjang(s.tgl_lahir) : "-"}`],
    ["Jenis Kelamin", s.jenis_kelamin === "P" ? "Perempuan" : s.jenis_kelamin === "L" ? "Laki-laki" : "-"],
    ["Agama", r.agamaTeks],
    ["Alamat Peserta Didik", s.jalan_siswa || s.ortu?.jalan_ortu || "-"],
    ["Nama Orang Tua (Ayah / Ibu)", `${s.ortu?.nama_ayah || "-"} / ${s.ortu?.nama_ibu || "-"}`],
    ["Nama Wali Peserta Didik", s.wali?.nama_wali || "-"],
  ];
  return (
    <div className={`rp-page${pecah ? " rp-break" : ""}`} style={{ paddingTop: "25mm" }}>
      <h3 style={{ textAlign: "center", fontWeight: "bold", marginBottom: 20, textDecoration: "underline", fontSize: 16 }}>KETERANGAN TENTANG DIRI PESERTA DIDIK</h3>
      <table className="rp-bio"><tbody>
        {baris.map(([label, nilai], i) => (
          <tr key={label}><td width="5%">{i + 1}.</td><td width="38%">{label}</td><td width="2%">:</td><td>{nilai}</td></tr>
        ))}
      </tbody></table>
      <table className="rp-ttd" style={{ marginTop: "30mm" }}><tbody><tr>
        <td width="55%"></td>
        <td style={{ textAlign: "left", paddingLeft: 20 }}>
          {r.sek.kota || "-"}, {tanggalPanjang(tanggal)}<br />Kepala Sekolah,
          <div className="rp-ttd-space" style={{ justifyContent: "flex-start" }}>{ttdKepsek && <img src={ttdKepsek} alt="" />}</div>
          <strong>{r.sek.nama_kepsek || "-"}</strong><br />NIP. {r.sek.nip_kepsek || "-"}
        </td>
      </tr></tbody></table>
    </div>
  );
};

export const Akademik = ({ r, tanggal, pecah }) => (
  <HalamanBerkop r={r} tanggal={tanggal} pecah={pecah} footer={(
    <>
      <div className="rp-title">B. CATATAN EVALUASI WALI KELAS</div>
      <div className="rp-box">{r.catatan}</div>
      <div className="rp-title">C. KETIDAKHADIRAN</div>
      <table className="rp-table" style={{ width: "45%" }}><tbody>
        <tr><td width="65%">Sakit</td><td className="rp-c">{r.presensi.sakit} hari</td></tr>
        <tr><td>Izin</td><td className="rp-c">{r.presensi.izin} hari</td></tr>
        <tr><td>Tanpa Keterangan (Alpa)</td><td className="rp-c">{r.presensi.alpa} hari</td></tr>
      </tbody></table>
    </>
  )}>
    <div className="rp-title" style={{ marginTop: 0 }}>A. CAPAIAN KOMPETENSI AKADEMIK (INTRAKURIKULER)</div>
    <table className="rp-table">
      <thead><tr><th width="6%">No</th><th width="28%">Mata Pelajaran</th><th width="8%">KKM</th><th width="10%">Nilai Akhir</th><th width="48%">Deskripsi Capaian Kompetensi (STNKM)</th></tr></thead>
      <tbody>
        {r.mapelRows.length === 0 && <tr><td colSpan="5" className="rp-c">Belum ada mata pelajaran.</td></tr>}
        {r.mapelRows.map((m) => (
          <tr key={m.no}>
            <td className="rp-c">{m.no}</td>
            <td><strong>{m.nama}</strong></td>
            <td className="rp-c">{m.kkm}</td>
            <td className="rp-c" style={{ fontWeight: "bold", fontSize: 13 }}>{m.nilai ?? "-"}</td>
            <td style={{ fontSize: 11, lineHeight: 1.4 }}>
              {m.deskripsi ? m.deskripsi.map((seg, i) => (seg.b ? <strong key={i}>{seg.t}</strong> : <Fragment key={i}>{seg.t}</Fragment>)) : "-"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </HalamanBerkop>
);

export const RaporP5 = ({ r, proyek, urutan, tanggal, pecah }) => (
  <HalamanBerkop r={r} tanggal={tanggal} pecah={pecah} footer={(
    <>
      <div className="rp-title">CATATAN PROSES PROYEK:</div>
      <div className="rp-box">{proyek.catatan}</div>
    </>
  )}>
    <div className="rp-title" style={{ marginTop: 0 }}>RAPOR PROJEK PENGUATAN PROFIL PELAJAR PANCASILA (PROJEK {urutan})</div>
    <div className="rp-proyek">
      <strong>Judul Projek: {proyek.judul_proyek}</strong>{proyek.fase ? ` (Fase ${proyek.fase})` : ""}<br />
      <span style={{ fontSize: 11 }}>{proyek.deskripsi_proyek || "-"}</span>
    </div>
    <div style={{ fontSize: 11, marginBottom: 6 }}>
      <strong>Keterangan Predikat:</strong> BB = Belum Berkembang | MB = Mulai Berkembang | BSH = Berkembang Sesuai Harapan | SB = Sangat Berkembang
    </div>
    <table className="rp-table">
      <thead>
        <tr><th rowSpan="2" width="56%">Dimensi, Elemen, &amp; Sub-Elemen</th><th colSpan="4" width="44%">Pencapaian</th></tr>
        <tr>{PREDIKAT.map((p) => <th key={p} width="11%">{p}</th>)}</tr>
      </thead>
      <tbody>
        {proyek.dimensi.length === 0 && <tr><td colSpan="5" className="rp-c">Belum ada target projek.</td></tr>}
        {proyek.dimensi.map((d) => (
          <Fragment key={d.nama}>
            <tr><td colSpan="5" className="rp-dim">{d.nama}</td></tr>
            {d.targets.map((t) => (
              <tr key={t.id_target}>
                <td><strong>{t.elemen || "-"}</strong><br />{t.sub_elemen || "-"}<br /><em style={{ fontSize: 10 }}>Capaian: {t.capaian_akhir_fase || "-"}</em></td>
                {PREDIKAT.map((p) => <td key={p} className="rp-c" style={{ fontWeight: "bold" }}>{t.predikat === p ? "✓" : ""}</td>)}
              </tr>
            ))}
          </Fragment>
        ))}
      </tbody>
    </table>
  </HalamanBerkop>
);
