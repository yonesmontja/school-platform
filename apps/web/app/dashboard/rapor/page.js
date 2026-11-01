"use client";
import { useState, useEffect, useMemo, useRef, Fragment } from "react";
import Link from "next/link";
import Swal from "sweetalert2";

const API_URL = "http://localhost:8000/api";
const getToken = () => localStorage.getItem("token");

const DIMENSI = [
  { key: "S", label: "Skill", nama: "keterampilan praktik", color: "primary" },
  { key: "T", label: "Teori", nama: "pemahaman konsep teori", color: "success" },
  { key: "N", label: "Nalar", nama: "penalaran kritis", color: "info" },
  { key: "K", label: "Karakter", nama: "sikap & karakter", color: "warning" },
  { key: "M", label: "Minat", nama: "minat & antusiasme", color: "danger" },
];
const FRASA_POSITIF = ["Menunjukkan keunggulan dalam", "Sangat kompeten pada", "Memiliki penguasaan yang kuat terkait", "Sangat antusias dan cakap dalam"];
const FRASA_BIMBINGAN = ["namun perlu pendampingan lebih pada", "dan disarankan untuk lebih fokus melatih", "meski demikian, masih membutuhkan bimbingan dalam"];
const MODE_KALKULASI = [
  { value: "1", label: "1. Konvensional", info: "Rata-rata nilai mentah per mapel." },
  { value: "2", label: "2. Hibrida (STNKM)", info: "Rata-rata nilai mentah + bonus jurnal (mode BONUS) dibagi rata ke semua mapel." },
  { value: "3", label: "3. Absolut (STNKM)", info: "Rata-rata tertimbang poin S-T-N-K-M sesuai bobot + bonus jurnal." },
];
const JENIS_DOKUMEN = [
  { value: "lengkap", label: "Buku Lengkap" },
  { value: "akademik", label: "Akademik Saja" },
  { value: "p5", label: "Rapor P5 Saja" },
];
const AI_MODES = [
  { value: "GEMINI", label: "Google Gemini" },
  { value: "CLAUDE", label: "Claude" },
  { value: "QWEN", label: "Qwen" },
  { value: "DEEPSEEK", label: "DeepSeek" },
  { value: "OPENKEY", label: "OpenKey" },
  { value: "LOKAL", label: "Tanpa AI (Lokal)" },
];
const PREDIKAT = ["BB", "MB", "BSH", "SB"];
const CATATAN_DEFAULT = "Peserta didik menunjukkan perkembangan sikap dan karakter yang stabil.";
const CATATAN_P5_DEFAULT = "Peserta didik mengikuti proses proyek dengan antusias.";

const num = (v) => parseFloat(v) || 0;
const rata = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
const todayYmd = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const tanggalPanjang = (ymd) => {
  if (!ymd) return "-";
  const [y, m, d] = String(ymd).slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
};
const formatNomorWA = (nomor) => {
  const clean = String(nomor || "").replace(/\D/g, "");
  if (clean.startsWith("08")) return "62" + clean.slice(1);
  if (clean.startsWith("8")) return "62" + clean;
  return clean;
};
// Nama kelas yang sudah diawali "Kelas" tidak diberi awalan lagi
const labelKelasResmi = (nama) => (/^kelas\b/i.test(nama) ? nama : `Kelas ${nama}`);
const urlTtd = (path) => (path ? `${API_URL}/signature/${path.split("/").pop()}` : null);

// Mapel agama hanya ditampilkan sesuai agama siswa; IPA/IPS tidak diajarkan di kelas 1–3 (logika GAS)
const mapelBerlaku = (namaMapel, agama, tingkat) => {
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
// MESIN KALKULASI RAPOR (port dari rapor.html GAS)
// =========================================================================
function hitungRapor(data, idSiswa, modeKalkulasi, bobot) {
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
function susunPesanWA(r) {
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
const RAPOR_CSS = `
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
const PREVIEW_CSS = `
.rapor-preview { overflow-x: auto; padding-bottom: 8px; }
.rapor-preview .rp-page { background: #fff; width: 210mm; min-height: 297mm; padding: 15mm; margin: 0 auto 20px; box-sizing: border-box; box-shadow: 0 4px 12px rgba(0,0,0,.15); }
`;

// =========================================================================
// KOMPONEN DOKUMEN
// =========================================================================
const KopIdentitas = ({ r }) => (
  <table className="rp-head"><tbody>
    <tr><td width="20%">Nama Sekolah</td><td width="2%">:</td><td width="48%"><strong>{r.sek.nama_sekolah || "-"}</strong></td><td width="12%">Kelas</td><td width="2%">:</td><td width="16%">{r.kelas.nama_kelas || "-"}</td></tr>
    <tr><td>Alamat</td><td>:</td><td>{r.sek.alamat_sekolah || "-"}</td><td>Semester</td><td>:</td><td>{r.periode.semester || "-"}</td></tr>
    <tr><td>Nama Peserta Didik</td><td>:</td><td><strong>{r.siswa.nama_siswa}</strong></td><td>Tahun Ajaran</td><td>:</td><td>{r.periode.tahun_ajaran || "-"}</td></tr>
    <tr><td>NISN / NPSN</td><td>:</td><td>{r.siswa.nisn || r.siswa.id_siswa} / {r.sek.npsn || "-"}</td><td></td><td></td><td></td></tr>
  </tbody></table>
);

const TandaTangan = ({ r, tanggal }) => {
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
const HalamanBerkop = ({ r, tanggal, pecah, children, footer }) => (
  <div className={`rp-page${pecah ? " rp-break" : ""}`}>
    <table className="rp-main">
      <thead><tr><td><KopIdentitas r={r} /></td></tr></thead>
      <tbody><tr><td>{children}</td></tr></tbody>
      <tfoot><tr><td style={{ paddingTop: 12 }}>{footer}<TandaTangan r={r} tanggal={tanggal} /></td></tr></tfoot>
    </table>
  </div>
);

const Sampul = ({ r, pecah }) => (
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

const Biodata = ({ r, tanggal, pecah }) => {
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

const Akademik = ({ r, tanggal, pecah }) => (
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

const RaporP5 = ({ r, proyek, urutan, tanggal, pecah }) => (
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

// Modal sederhana berbasis state agar tidak bergantung pada JS Bootstrap
const Modal = ({ show, title, icon, headerClass = "bg-primary text-white", size = "modal-lg", onClose, children, footer }) => {
  if (!show) return null;
  return (
    <>
      <div className="modal fade show d-block" tabIndex="-1" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className={`modal-dialog ${size} modal-dialog-centered modal-dialog-scrollable`}>
          <div className="modal-content border-0 shadow">
            <div className={`modal-header ${headerClass}`}>
              <h5 className="modal-title fw-bold"><i className={`bi ${icon} me-2`}></i>{title}</h5>
              <button type="button" className={`btn-close${headerClass.includes("text-white") ? " btn-close-white" : ""}`} onClick={onClose} aria-label="Tutup"></button>
            </div>
            <div className="modal-body bg-body-tertiary">{children}</div>
            {footer && <div className="modal-footer">{footer}</div>}
          </div>
        </div>
      </div>
      <div className="modal-backdrop fade show"></div>
    </>
  );
};

export default function CetakRaporPage() {
  const [classes, setClasses] = useState([]);
  const [periodes, setPeriodes] = useState([]);
  const [filters, setFilters] = useState({ id_periode: "", id_kelas: "", id_siswa: "" });
  const [modeKalkulasi, setModeKalkulasi] = useState("2");
  const [jenisDokumen, setJenisDokumen] = useState("lengkap");
  const [bobot, setBobot] = useState({ S: 1, T: 1, N: 1, K: 1, M: 1 });
  const [tanggalRapor, setTanggalRapor] = useState(todayYmd());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  // Modal Catatan Wali (AI)
  const [showCatatan, setShowCatatan] = useState(false);
  const [catatanDraft, setCatatanDraft] = useState("");
  const [aiMode, setAiMode] = useState("GEMINI");
  const [aiLoading, setAiLoading] = useState(false);
  const [simpanLoading, setSimpanLoading] = useState(false);
  const [bukaWaSetelahSimpan, setBukaWaSetelahSimpan] = useState(true);

  // Modal WhatsApp
  const [showWA, setShowWA] = useState(false);
  const [waLoading, setWaLoading] = useState(false);

  const previewRef = useRef(null);

  const safeFetch = async (url, opts = {}) => {
    const res = await fetch(url, { ...opts, headers: { Accept: "application/json", Authorization: `Bearer ${getToken()}`, ...opts.headers } });
    if (res.status === 401) { window.location.href = "/login"; throw new Error("Sesi berakhir, silakan login ulang."); }
    const text = await res.text();
    let json = {};
    try { json = text ? JSON.parse(text) : {}; } catch (e) { throw new Error(`Respon server tidak valid. Status: ${res.status}`); }
    if (!res.ok) {
      const firstError = json.errors ? Object.values(json.errors)[0]?.[0] : null;
      throw new Error(firstError || json.reason || json.message || "Terjadi kesalahan pada server");
    }
    return json;
  };
  const postJSON = (url, body) => safeFetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  useEffect(() => {
    if (!getToken()) { window.location.href = "/login"; return; }
    (async () => {
      try {
        const res = await safeFetch(`${API_URL}/nilai/filters`);
        setClasses(res.classes || []);
        setPeriodes(res.periodes || []);
        const aktif = (res.periodes || []).find((p) => p.status_aktif === "AKTIF");
        if (aktif) setFilters((f) => ({ ...f, id_periode: aktif.id_periode }));
      } catch (err) { Swal.fire("Error", err.message, "error"); }
    })();
  }, []);

  // Data rapor dimuat ulang saat kelas/periode berubah; siswa yang sama tetap terpilih bila masih ada
  useEffect(() => {
    const { id_kelas, id_periode } = filters;
    if (!id_kelas || !id_periode) { setData(null); return; }
    let batal = false;
    (async () => {
      setLoading(true);
      try {
        const res = await safeFetch(`${API_URL}/rapor/data?${new URLSearchParams({ id_kelas, id_periode })}`);
        if (batal) return;
        setData(res);
        setFilters((f) => (res.students.some((s) => s.id_siswa === f.id_siswa) ? f : { ...f, id_siswa: "" }));
      } catch (err) { if (!batal) Swal.fire("Gagal Memuat Data", err.message, "error"); }
      finally { if (!batal) setLoading(false); }
    })();
    return () => { batal = true; };
  }, [filters.id_kelas, filters.id_periode]);

  const rapor = useMemo(
    () => (data && filters.id_siswa ? hitungRapor(data, filters.id_siswa, modeKalkulasi, bobot) : null),
    [data, filters.id_siswa, modeKalkulasi, bobot],
  );
  const wa = useMemo(() => (rapor ? susunPesanWA(rapor) : null), [rapor]);

  // Urutan halaman sesuai jenis dokumen; halaman terakhir tanpa pemisah agar tidak ada kertas kosong
  const halaman = useMemo(() => {
    if (!rapor) return [];
    const list = [];
    if (jenisDokumen === "lengkap") list.push({ key: "sampul", jenis: "sampul" }, { key: "biodata", jenis: "biodata" });
    if (jenisDokumen !== "p5") list.push({ key: "akademik", jenis: "akademik" });
    if (jenisDokumen !== "akademik") rapor.proyek.forEach((p, i) => list.push({ key: p.id_proyek, jenis: "p5", proyek: p, urutan: i + 1 }));
    return list;
  }, [rapor, jenisDokumen]);

  const siswaList = data?.students || [];
  const idxSiswa = siswaList.findIndex((s) => s.id_siswa === filters.id_siswa);
  const pindahSiswa = (arah) => {
    const next = siswaList[idxSiswa + arah];
    if (next) setFilters((f) => ({ ...f, id_siswa: next.id_siswa }));
  };

  const butuhSiswa = () => {
    if (rapor) return true;
    Swal.fire("Pilih Siswa Dulu", "Pilih Periode, Kelas, dan Peserta Didik terlebih dahulu.", "warning");
    return false;
  };

  // --- CETAK (jendela cetak bawaan browser → Simpan sebagai PDF) ---
  const handleCetak = () => {
    if (!butuhSiswa()) return;
    if (halaman.length === 0) return Swal.fire("Tidak Ada Halaman", "Kelas ini belum memiliki projek P5 untuk dicetak.", "info");
    const win = window.open("", "_blank", "width=1024,height=768");
    if (!win) return Swal.fire("Pop-up Diblokir", "Izinkan pop-up untuk situs ini agar jendela cetak bisa dibuka.", "warning");
    const judul = `Rapor_${jenisDokumen}_${rapor.siswa.nama_siswa}`.replace(/[^\w\-]+/g, "_");
    win.document.write(`<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><title>${judul}</title><style>
      @page { size: A4 portrait; margin: 15mm; }
      * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      body { margin: 0; }
      ${RAPOR_CSS}
    </style></head><body>${previewRef.current.innerHTML}</body></html>`);
    win.document.close();
    win.focus();
    // Beri waktu gambar tanda tangan termuat sebelum dialog cetak muncul
    setTimeout(() => { win.print(); win.close(); }, 800);
  };

  // --- CATATAN WALI KELAS ---
  const bukaCatatan = () => {
    if (!butuhSiswa()) return;
    setCatatanDraft(rapor.catatanTersimpan ? rapor.catatan : "");
    setShowCatatan(true);
  };

  const generateCatatan = async () => {
    setAiLoading(true);
    try {
      const res = await postJSON(`${API_URL}/rapor/catatan-wali/generate`, { id_siswa: filters.id_siswa, ai_mode: aiMode });
      setCatatanDraft(res.data);
      const pakaiLokal = res.mode === "LOKAL" && aiMode !== "LOKAL";
      Swal.fire({
        toast: true, position: "top-end", showConfirmButton: false, timer: pakaiLokal ? 4500 : 2500,
        icon: pakaiLokal ? "warning" : "success",
        title: pakaiLokal ? "AI tidak tersedia (key kosong/gagal atau belum ada jurnal). Narasi disusun secara lokal." : "Narasi selesai disusun.",
      });
    } catch (err) { Swal.fire("Gagal", err.message, "error"); }
    finally { setAiLoading(false); }
  };

  const simpanCatatan = async () => {
    const teks = catatanDraft.trim();
    if (!teks) return Swal.fire("Perhatian", "Catatan tidak boleh kosong.", "warning");
    setSimpanLoading(true);
    try {
      const res = await postJSON(`${API_URL}/rapor/catatan-wali`, { id_siswa: filters.id_siswa, id_periode: filters.id_periode, catatan_final: teks });
      setData((d) => ({ ...d, catatan_wali: [...d.catatan_wali.filter((c) => c.id_siswa !== filters.id_siswa), res.data] }));
      setShowCatatan(false);
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: "Catatan tersimpan!", showConfirmButton: false, timer: 2000 });
      if (bukaWaSetelahSimpan) setShowWA(true);
    } catch (err) { Swal.fire("Gagal Menyimpan", err.message, "error"); }
    finally { setSimpanLoading(false); }
  };

  // --- WHATSAPP ---
  const bukaWA = () => { if (butuhSiswa()) setShowWA(true); };
  const bukaChat = (nomor, teks) => {
    const url = nomor ? `https://wa.me/${nomor}?text=${encodeURIComponent(teks)}` : `https://api.whatsapp.com/send?text=${encodeURIComponent(teks)}`;
    window.open(url, "_blank", "noopener");
  };
  const salin = async (teks) => {
    try {
      await navigator.clipboard.writeText(teks);
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: "Ringkasan rapor disalin!", showConfirmButton: false, timer: 2000 });
    } catch (e) { Swal.fire("Gagal Menyalin", "Browser menolak akses clipboard.", "error"); }
  };
  const kirimOtomatis = async () => {
    const antrean = [
      wa.nomorOrtu && { target: wa.nomorOrtu, message: wa.pesanOrtu },
      wa.idGrup && { target: wa.idGrup, message: wa.pesanGrup },
      wa.nomorKepsek && { target: wa.nomorKepsek, message: wa.pesanGrup },
    ].filter(Boolean);
    if (antrean.length === 0) {
      return Swal.fire("Tujuan Kosong", "Nomor WA orang tua, nomor Kepsek, dan ID grup guru belum diisi. Lengkapi di Master Siswa/Ortu dan Pengaturan Sekolah, atau gunakan tombol WA manual.", "warning");
    }
    setWaLoading(true);
    try {
      const res = await postJSON(`${API_URL}/rapor/whatsapp`, { daftar_pesan: antrean });
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: `${res.count} pesan terkirim otomatis via API!`, showConfirmButton: false, timer: 3000 });
    } catch (err) { Swal.fire("Belum Terkirim", err.message, "warning"); }
    finally { setWaLoading(false); }
  };

  const waApiAktif = !!data?.settings?.status_wa_api && !!data?.settings?.has_wa_api_token;

  return (
    <div className="container-fluid mb-5">
      <style>{RAPOR_CSS + PREVIEW_CSS}</style>

      {/* HEADER HALAMAN */}
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <div>
          <h3 className="fw-bold text-primary mb-0"><i className="bi bi-file-earmark-richtext me-2"></i>Pusat Cetak &amp; Distribusi Rapor</h3>
          <small className="text-muted">Pratinjau, cetak PDF, catatan wali kelas berbasis AI, dan kirim ringkasan ke WhatsApp</small>
        </div>
        <ol className="breadcrumb mb-0 small">
          <li className="breadcrumb-item"><Link href="/dashboard">Dashboard</Link></li>
          <li className="breadcrumb-item">Laporan</li>
          <li className="breadcrumb-item active" aria-current="page">Cetak Rapor</li>
        </ol>
      </div>

      {/* PANEL KONTROL */}
      <div className="card card-outline card-primary shadow-sm mb-3">
        <div className="card-header d-flex flex-wrap align-items-center gap-2">
          <h3 className="card-title fw-semibold mb-0 me-auto"><i className="bi bi-sliders me-2"></i>Parameter Rapor</h3>
          <div className="btn-group btn-group-sm">
            <button type="button" className="btn btn-warning fw-semibold" onClick={bukaCatatan} title="Catatan Wali Kelas (AI)">
              <i className="bi bi-magic me-1"></i><span className="d-none d-sm-inline">Catatan Wali</span>
            </button>
            <button type="button" className="btn btn-success fw-semibold" onClick={bukaWA} title="Kirim ringkasan ke WhatsApp">
              <i className="bi bi-whatsapp me-1"></i><span className="d-none d-sm-inline">WhatsApp</span>
            </button>
            <button type="button" className="btn btn-danger fw-semibold" onClick={handleCetak} title="Cetak / simpan PDF">
              <i className="bi bi-file-earmark-pdf me-1"></i><span className="d-none d-sm-inline">Cetak PDF</span>
            </button>
          </div>
        </div>
        <div className="card-body">
          <div className="row g-3">
            <div className="col-12 col-sm-6 col-lg-3">
              <label className="form-label fw-semibold small mb-1">Periode</label>
              <select className="form-select" value={filters.id_periode} onChange={(e) => setFilters((f) => ({ ...f, id_periode: e.target.value }))}>
                <option value="">— Pilih Periode —</option>
                {periodes.map((p) => <option key={p.id_periode} value={p.id_periode}>{p.tahun_ajaran} ({p.semester}){p.status_aktif === "AKTIF" ? " • Aktif" : ""}</option>)}
              </select>
            </div>
            <div className="col-12 col-sm-6 col-lg-3">
              <label className="form-label fw-semibold small mb-1">Kelas</label>
              <select className="form-select" value={filters.id_kelas} onChange={(e) => setFilters((f) => ({ ...f, id_kelas: e.target.value }))}>
                <option value="">— Pilih Kelas —</option>
                {classes.map((k) => <option key={k.id_kelas} value={k.id_kelas}>{k.nama_kelas}</option>)}
              </select>
            </div>
            <div className="col-12 col-lg-6">
              <label className="form-label fw-semibold small mb-1">Peserta Didik</label>
              <div className="input-group">
                <button type="button" className="btn btn-outline-secondary" disabled={idxSiswa <= 0} onClick={() => pindahSiswa(-1)} title="Siswa sebelumnya"><i className="bi bi-chevron-left"></i></button>
                <select className="form-select" value={filters.id_siswa} disabled={!data} onChange={(e) => setFilters((f) => ({ ...f, id_siswa: e.target.value }))}>
                  <option value="">{data ? "— Pilih Peserta Didik —" : "— Pilih Kelas Dulu —"}</option>
                  {siswaList.map((s, i) => <option key={s.id_siswa} value={s.id_siswa}>{i + 1}. {s.nama_siswa}</option>)}
                </select>
                <button type="button" className="btn btn-outline-secondary" disabled={idxSiswa < 0 || idxSiswa >= siswaList.length - 1} onClick={() => pindahSiswa(1)} title="Siswa berikutnya"><i className="bi bi-chevron-right"></i></button>
              </div>
            </div>
            <div className="col-12 col-sm-6 col-lg-4">
              <label className="form-label fw-semibold small mb-1">Kalkulasi Akademik</label>
              <select className="form-select" value={modeKalkulasi} onChange={(e) => setModeKalkulasi(e.target.value)}>
                {MODE_KALKULASI.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
              <small className="text-muted">{MODE_KALKULASI.find((m) => m.value === modeKalkulasi)?.info}</small>
            </div>
            <div className="col-12 col-sm-6 col-lg-4">
              <label className="form-label fw-semibold small mb-1">Jenis Dokumen</label>
              <select className="form-select" value={jenisDokumen} onChange={(e) => setJenisDokumen(e.target.value)}>
                {JENIS_DOKUMEN.map((j) => <option key={j.value} value={j.value}>{j.label}</option>)}
              </select>
            </div>
            <div className="col-12 col-sm-6 col-lg-4">
              <label className="form-label fw-semibold small mb-1">Tanggal Rapor</label>
              <input type="date" className="form-control" value={tanggalRapor} onChange={(e) => e.target.value && setTanggalRapor(e.target.value)} />
            </div>

            {modeKalkulasi === "3" && (
              <div className="col-12">
                <div className="alert alert-warning mb-0 py-2">
                  <div className="fw-semibold small mb-2"><i className="bi bi-sliders me-1"></i>Bobot Penentu Nilai Akhir (0.0 – 1.0)</div>
                  <div className="d-flex flex-wrap gap-2">
                    {DIMENSI.map((d) => (
                      <div key={d.key} className="input-group input-group-sm" style={{ width: 140 }}>
                        <span className={`input-group-text fw-bold text-${d.color}`}>{d.label}</span>
                        <input type="number" className="form-control" min="0" max="1" step="0.1" value={bobot[d.key]}
                          onChange={(e) => setBobot((b) => ({ ...b, [d.key]: Math.min(1, Math.max(0, parseFloat(e.target.value) || 0)) }))} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* RINGKASAN SISWA */}
      {rapor && (
        <div className="row g-3 mb-3">
          <div className="col-6 col-xl-3">
            <div className="info-box shadow-sm mb-0 h-100">
              <span className="info-box-icon text-bg-primary shadow-sm"><i className="bi bi-mortarboard"></i></span>
              <div className="info-box-content">
                <span className="info-box-text small">Rata-rata Akademik</span>
                <span className="info-box-number fs-5">{rapor.rataUmum}</span>
                <small className="text-muted text-truncate">{rapor.mapelRows.filter((m) => m.nilai !== null).length} dari {rapor.mapelRows.length} mapel bernilai</small>
              </div>
            </div>
          </div>
          <div className="col-6 col-xl-3">
            <div className="info-box shadow-sm mb-0 h-100">
              <span className="info-box-icon text-bg-success shadow-sm"><i className="bi bi-bullseye"></i></span>
              <div className="info-box-content">
                <span className="info-box-text small">Indeks STNKM</span>
                <span className="small fw-semibold">{DIMENSI.map((d) => `${d.key}:${rapor.poinSTNKM[d.key]}`).join(" ")}</span>
                <small className="text-muted">Bonus jurnal: {rapor.bonusJurnal.toFixed(1)}</small>
              </div>
            </div>
          </div>
          <div className="col-6 col-xl-3">
            <div className="info-box shadow-sm mb-0 h-100">
              <span className="info-box-icon text-bg-warning shadow-sm"><i className="bi bi-calendar-x"></i></span>
              <div className="info-box-content">
                <span className="info-box-text small">Ketidakhadiran</span>
                <span className="info-box-number fs-6">S {rapor.presensi.sakit} · I {rapor.presensi.izin} · A {rapor.presensi.alpa}</span>
                <small className="text-muted">{data.presensi.length ? "Dari data presensi" : "Belum ada data presensi"}</small>
              </div>
            </div>
          </div>
          <div className="col-6 col-xl-3">
            <div className="info-box shadow-sm mb-0 h-100">
              <span className={`info-box-icon shadow-sm ${rapor.catatanTersimpan ? "text-bg-info" : "text-bg-secondary"}`}><i className="bi bi-chat-quote"></i></span>
              <div className="info-box-content">
                <span className="info-box-text small">Catatan Wali</span>
                <span className="info-box-number fs-6">{rapor.catatanTersimpan ? "Tersimpan" : "Otomatis"}</span>
                <button type="button" className="btn btn-link btn-sm p-0 text-start" onClick={bukaCatatan}>{rapor.catatanTersimpan ? "Ubah catatan" : "Susun dengan AI"}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PRATINJAU */}
      {!filters.id_kelas || !filters.id_periode || !filters.id_siswa ? (
        <div className="card shadow-sm"><div className="card-body text-center py-5 text-muted">
          <i className="bi bi-book display-5 text-primary opacity-50"></i>
          <h5 className="fw-semibold mt-3">Pilih Periode, Kelas, dan Peserta Didik untuk menampilkan pratinjau rapor</h5>
          {loading && <div className="spinner-border spinner-border-sm text-primary mt-2"></div>}
        </div></div>
      ) : loading || !rapor ? (
        <div className="card shadow-sm"><div className="card-body text-center py-5 text-muted">
          <div className="spinner-border text-primary mb-2"></div><div>Menyiapkan dokumen rapor...</div>
        </div></div>
      ) : (
        <div className="card shadow-sm">
          <div className="card-header d-flex flex-wrap align-items-center gap-2">
            <h3 className="card-title fw-semibold mb-0 me-auto"><i className="bi bi-eye me-2"></i>Pratinjau A4 · {halaman.length} halaman</h3>
            {jenisDokumen !== "akademik" && rapor.proyek.length === 0 && (
              <span className="badge text-bg-light border text-wrap"><i className="bi bi-info-circle me-1"></i>Belum ada projek P5 untuk kelas & periode ini</span>
            )}
          </div>
          <div className="card-body bg-body-secondary">
            <div className="rapor-preview" ref={previewRef}>
              {halaman.map((h, i) => {
                const pecah = i < halaman.length - 1;
                if (h.jenis === "sampul") return <Sampul key={h.key} r={rapor} pecah={pecah} />;
                if (h.jenis === "biodata") return <Biodata key={h.key} r={rapor} tanggal={tanggalRapor} pecah={pecah} />;
                if (h.jenis === "akademik") return <Akademik key={h.key} r={rapor} tanggal={tanggalRapor} pecah={pecah} />;
                return <RaporP5 key={h.key} r={rapor} proyek={h.proyek} urutan={h.urutan} tanggal={tanggalRapor} pecah={pecah} />;
              })}
              {halaman.length === 0 && <div className="text-center text-muted py-5">Tidak ada halaman untuk jenis dokumen ini.</div>}
            </div>
          </div>
        </div>
      )}

      {/* MODAL CATATAN WALI KELAS */}
      <Modal show={showCatatan} title="Sintesis Catatan Wali Kelas (AI)" icon="bi-robot" onClose={() => setShowCatatan(false)} footer={(
        <>
          <button type="button" className="btn btn-secondary" onClick={() => setShowCatatan(false)}>Tutup</button>
          <button type="button" className="btn btn-success fw-semibold" onClick={simpanCatatan} disabled={simpanLoading || aiLoading}>
            {simpanLoading ? <span className="spinner-border spinner-border-sm me-2"></span> : <i className="bi bi-save me-2"></i>}Simpan Catatan Final
          </button>
        </>
      )}>
        <div className="alert alert-info small py-2"><i className="bi bi-info-circle me-1"></i>AI merangkum jurnal observasi siswa menjadi paragraf catatan rapor yang baku dan apresiatif. Hasilnya bisa diedit sebelum disimpan.</div>
        <div className="mb-3 p-2 px-3 bg-body rounded border">
          <label className="fw-semibold small d-block mb-1">Mesin AI:</label>
          <div className="d-flex flex-wrap gap-3">
            {AI_MODES.map((m) => (
              <div key={m.value} className="form-check">
                <input className="form-check-input" type="radio" name="ai_mode" id={`ai_${m.value}`} value={m.value} checked={aiMode === m.value} onChange={() => setAiMode(m.value)} />
                <label className="form-check-label small fw-semibold" htmlFor={`ai_${m.value}`}>{m.label}</label>
              </div>
            ))}
          </div>
        </div>
        <label className="fw-semibold text-primary mb-2">Evaluasi Siswa: <span className="text-body">{rapor?.siswa.nama_siswa}</span></label>
        <textarea className="form-control mb-3" rows="5" value={catatanDraft} disabled={aiLoading} maxLength={2000}
          onChange={(e) => setCatatanDraft(e.target.value)} placeholder="Catatan akhir rapor akan muncul di sini..."></textarea>
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
          <button type="button" className="btn btn-outline-primary fw-semibold" onClick={generateCatatan} disabled={aiLoading}>
            {aiLoading ? <><span className="spinner-border spinner-border-sm me-2"></span>AI sedang merangkai kalimat...</> : <><i className="bi bi-magic me-2"></i>Generate Narasi via AI</>}
          </button>
          <div className="form-check form-switch m-0">
            <input className="form-check-input" type="checkbox" id="buka_wa" checked={bukaWaSetelahSimpan} onChange={(e) => setBukaWaSetelahSimpan(e.target.checked)} />
            <label className="form-check-label small fw-semibold text-success" htmlFor="buka_wa"><i className="bi bi-whatsapp me-1"></i>Buka panel WA setelah simpan</label>
          </div>
        </div>
      </Modal>

      {/* MODAL WHATSAPP */}
      <Modal show={showWA && !!wa} title="Distribusi Ringkasan Rapor (WA)" icon="bi-whatsapp" headerClass="bg-success text-white" onClose={() => setShowWA(false)}
        footer={<button type="button" className="btn btn-success" onClick={() => setShowWA(false)}>Selesai &amp; Tutup</button>}>
        {wa && (
          <>
            <div className="alert alert-secondary small py-2">
              <i className="bi bi-whatsapp text-success me-1"></i>Ringkasan berisi nilai mapel, indeks STNKM, kehadiran, dan Catatan Wali Kelas.
            </div>
            <div className="fw-bold text-primary mb-3"><i className="bi bi-person-badge me-1"></i>{rapor.siswa.nama_siswa} ({labelKelasResmi(rapor.kelas.nama_kelas || "-")})</div>

            <label className="fw-semibold small text-muted mb-1">1. Orang Tua / Wali {wa.nomorOrtu ? `(${wa.nomorOrtu})` : "(nomor belum diisi — pilih kontak di WA)"}</label>
            <div className="d-flex gap-2 mb-3">
              <button type="button" className="btn btn-success btn-sm flex-grow-1 fw-semibold" onClick={() => bukaChat(wa.nomorOrtu, wa.pesanOrtu)}><i className="bi bi-whatsapp me-1"></i>Chat WA Orang Tua / Wali</button>
              <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => salin(wa.pesanOrtu)}><i className="bi bi-clipboard me-1"></i>Salin</button>
            </div>

            <label className="fw-semibold small text-muted mb-1">2. Kepala Sekolah / Grup Guru {wa.nomorKepsek ? `(Kepsek ${wa.nomorKepsek})` : ""}</label>
            <div className="d-flex gap-2 mb-3">
              <button type="button" className="btn btn-primary btn-sm flex-grow-1 fw-semibold" onClick={() => bukaChat(wa.nomorKepsek, wa.pesanGrup)}><i className="bi bi-whatsapp me-1"></i>WA Kepsek / Grup</button>
              <button type="button" className="btn btn-outline-primary btn-sm" onClick={() => salin(wa.pesanGrup)}><i className="bi bi-clipboard me-1"></i>Salin Teks Grup</button>
            </div>

            <details className="mb-3">
              <summary className="small text-muted">Lihat isi pesan untuk orang tua</summary>
              <pre className="small bg-body border rounded p-2 mt-2 mb-0" style={{ whiteSpace: "pre-wrap" }}>{wa.pesanOrtu}</pre>
            </details>

            <div className="border-top pt-3">
              <button type="button" className="btn btn-dark btn-sm w-100 fw-semibold" onClick={kirimOtomatis} disabled={waLoading || !waApiAktif}>
                {waLoading ? <span className="spinner-border spinner-border-sm me-2"></span> : <i className="bi bi-robot me-1"></i>}Kirim Otomatis via API Gateway (Fonnte)
              </button>
              {!waApiAktif && (
                <small className="text-muted d-block mt-1">
                  <i className="bi bi-info-circle me-1"></i>Kirim otomatis belum aktif. Isi token Fonnte dan nyalakan di <Link href="/dashboard/pengaturan">Pengaturan Sekolah</Link>.
                </small>
              )}
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
