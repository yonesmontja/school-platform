// app/page.js — beranda publik Sekolah Anak Papua. Tamu melihat beranda lalu memilih peran untuk masuk;
// pengguna yang sudah masuk diteruskan ke halaman awal perannya (AlihkanBilaMasuk).
import Link from "next/link";
import AlihkanBilaMasuk from "./_beranda/AlihkanBilaMasuk";
import "./_beranda/beranda.css";
import { muatSekolah, muatSpmb } from "./_beranda/sekolah";

// Identitas sekolah dibaca di server dan disegarkan tiap 5 menit
export const revalidate = 300;

export async function generateMetadata() {
  const s = await muatSekolah();
  return {
    title: `${s.nama_sekolah} · ${s.kota}`,
    description: `Ruang belajar digital ${s.nama_sekolah}, ${s.kota}: capaian belajar, rapor, jadwal, dan perkembangan anak untuk guru, orang tua, dan siswa.`,
  };
}

const PERAN = [
  { peran: "guru", ikon: "bi-easel2", judul: "Guru & Wali Kelas", isi: "Nilai per tujuan pembelajaran, jurnal anekdotal, presensi, jadwal, dan perangkat ajar.", cara: "Email atau username" },
  { peran: "pengelola", ikon: "bi-building", judul: "Kepala Sekolah & Pengelola", isi: "Peta Tema, persetujuan perangkat ajar, rapor, dan pemantauan sekolah. Juga untuk admin, wakasek, dan yayasan.", cara: "Email atau username" },
  { peran: "ortu", ikon: "bi-people", judul: "Orang Tua / Wali", isi: "Capaian anak, tindak lanjut belajar di rumah, jadwal, dan kehadiran.", cara: "ortu.NISN anak" },
  { peran: "siswa", ikon: "bi-backpack", judul: "Siswa", isi: "Ujian online, video belajar, dan jadwal kelas.", cara: "NISN" },
];

const ALUR = [
  { judul: "Realita", isi: "Anak mengamati kehidupan di sekitarnya: kampung, kebun, sungai, dan laut." },
  { judul: "Imajinasi", isi: "Dari yang dilihat, anak membayangkan kemungkinan dan bertanya “bagaimana jika”." },
  { judul: "Makna", isi: "Guru menautkan temuan anak ke konsep berbagai mata pelajaran." },
  { judul: "Produk anak", isi: "Anak menghasilkan karya nyata yang bisa dibagikan kepada keluarga dan kampung." },
];

const tanggalPanjang = (t) => new Date(`${t}T00:00:00`).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });

/** Pita motif geometris (segitiga & belah ketupat) yang terinspirasi ragam hias ukiran Papua. */
function PitaMotif({ id, className = "" }) {
  return (
    <svg className={`pita-motif ${className}`} aria-hidden="true" focusable="false" preserveAspectRatio="none">
      <defs>
        <pattern id={id} width="48" height="20" patternUnits="userSpaceOnUse">
          <path d="M0 20 L12 4 L24 20 Z" fill="currentColor" opacity=".9" />
          <path d="M24 0 L36 16 L48 0 Z" fill="currentColor" opacity=".45" />
          <path d="M12 10 L18 4 L24 10 L18 16 Z" fill="var(--b-pasir)" opacity=".9" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}

/** Lanskap: pegunungan, matahari terbit, dan laut Teluk Cenderawasih. */
function Lanskap() {
  return (
    <svg className="lanskap" viewBox="0 0 1440 260" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
      <path d="M0 150 L140 70 L250 130 L380 40 L520 140 L640 90 L780 160 L900 60 L1040 150 L1180 80 L1300 140 L1440 90 V260 H0 Z" fill="#0b3a5c" opacity=".55" />
      <path d="M0 190 L120 120 L230 175 L360 105 L470 180 L610 125 L730 190 L860 115 L990 185 L1120 130 L1250 190 L1440 140 V260 H0 Z" fill="#0a2e4a" opacity=".85" />
      <path d="M0 215 C120 205 240 225 360 215 S600 205 720 215 960 228 1080 216 1320 206 1440 214 V260 H0 Z" fill="#0f5f99" />
      <path d="M0 232 C160 222 320 242 480 232 S800 222 960 234 1280 242 1440 230 V260 H0 Z" fill="#1178c2" />
    </svg>
  );
}

export default async function Beranda() {
  const [s, spmb] = await Promise.all([muatSekolah(), muatSpmb()]);
  const spmbBuka = spmb.find((g) => g.buka);
  const spmbNanti = !spmbBuka && spmb[0];
  const npsn = s.npsn && !/^0+$/.test(s.npsn) ? s.npsn : null;
  const alamat = [s.alamat_sekolah, s.kota].filter(Boolean).join(", ");
  const tahun = new Date().getFullYear();

  return (
    <div className="beranda">
      <AlihkanBilaMasuk />
      <a className="lompat-isi" href="#peran">Langsung ke pilihan masuk</a>

      <header className="b-atas">
        <div className="b-wadah b-atas-isi">
          <Link href="/" className="b-merek" aria-label={`${s.nama_sekolah}, beranda`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={s.ada_logo ? "/api/logo-sekolah" : "/api/ikon-aplikasi/icon-192.png"} alt="" width="40" height="40" />
            <span>{s.nama_sekolah}</span>
          </Link>
          <nav className="b-atas-nav" aria-label="Menu beranda">
            <Link href="/spmb" className="b-atas-tautan">SPMB</Link>
            <Link href="/login" className="b-tombol b-tombol-garis b-tombol-kecil">Masuk</Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="b-hero">
          <div className="b-wadah b-hero-isi">
            <div className="b-hero-teks">
              <p className="b-alis">{s.kota} · Papua Tengah</p>
              <h1>Belajar dari aset, tumbuh untuk <em>masa depan Papua</em>.</h1>
              <p className="b-pengantar">
                Ruang belajar digital {s.nama_sekolah}. Capaian belajar, rapor, jadwal, dan perkembangan setiap anak
                ada di satu tempat bagi guru, orang tua, dan siswa.
              </p>
              <div className="b-aksi">
                <a href="#peran" className="b-tombol b-tombol-emas">Pilih cara masuk <i className="bi bi-arrow-down" aria-hidden="true"></i></a>
                <Link href="/login" className="b-tombol b-tombol-terang">Langsung masuk</Link>
              </div>
            </div>
            <div className="b-hero-logo" aria-hidden="true">
              <div className="b-cincin">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.ada_logo ? "/api/logo-sekolah" : "/api/ikon-aplikasi/icon-512.png"} alt="" width="320" height="320" />
              </div>
            </div>
          </div>
          <Lanskap />
        </section>

        <PitaMotif id="motif-atas" />

        {(spmbBuka || spmbNanti) && (
          <section className="b-spmb" aria-labelledby="judul-spmb">
            <div className="b-wadah b-spmb-isi">
              <div>
                <p className="b-alis b-alis-gelap">Penerimaan murid baru · {(spmbBuka || spmbNanti).tahun_ajaran}</p>
                <h2 id="judul-spmb">{spmbBuka ? `${spmbBuka.nama} dibuka` : `${spmbNanti.nama} segera dibuka`}</h2>
                <p className="b-sub mb-0">
                  {spmbBuka
                    ? <>Daftar daring sampai <b>{tanggalPanjang(spmbBuka.tgl_tutup)}</b>. Isi formulir, unggah berkas, lalu pantau hasilnya dengan nomor pendaftaran.</>
                    : <>Formulir dibuka <b>{tanggalPanjang(spmbNanti.tgl_buka)}</b> sampai {tanggalPanjang(spmbNanti.tgl_tutup)}.</>}
                </p>
              </div>
              <div className="b-aksi">
                {spmbBuka && <Link href="/spmb" className="b-tombol b-tombol-emas">Daftar sekarang <i className="bi bi-arrow-right" aria-hidden="true"></i></Link>}
                <Link href="/spmb?cek=1" className="b-tombol b-tombol-gelap">Cek status pendaftaran</Link>
              </div>
            </div>
          </section>
        )}

        <section className="b-bagian" id="peran" aria-labelledby="judul-peran">
          <div className="b-wadah">
            <p className="b-alis b-alis-gelap">Masuk sesuai peran</p>
            <h2 id="judul-peran">Siapa Anda hari ini?</h2>
            <p className="b-sub">Semua peran masuk lewat satu pintu; pilih peran agar petunjuk isiannya sesuai.</p>
            <ul className="b-peran">
              {PERAN.map((p) => (
                <li key={p.peran}>
                  <Link href={`/login?peran=${p.peran}`} className="b-kartu">
                    <span className="b-kartu-ikon"><i className={`bi ${p.ikon}`} aria-hidden="true"></i></span>
                    <span className="b-kartu-judul">{p.judul}</span>
                    <span className="b-kartu-isi">{p.isi}</span>
                    <span className="b-kartu-kaki">
                      <span>Masuk dengan <b>{p.cara}</b></span>
                      <i className="bi bi-arrow-right" aria-hidden="true"></i>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="b-bagian b-bagian-pasir" aria-labelledby="judul-alur">
          <div className="b-wadah">
            <p className="b-alis b-alis-gelap">Cara kami belajar</p>
            <h2 id="judul-alur">Berangkat dari kehidupan anak Papua</h2>
            <p className="b-sub">Setiap tema dimulai dari dunia yang dikenal anak, lalu dirangkai lintas mata pelajaran.</p>
            <ol className="b-alur">
              {ALUR.map((a, i) => (
                <li key={a.judul}>
                  <span className="b-alur-no">{String(i + 1).padStart(2, "0")}</span>
                  <h3>{a.judul}</h3>
                  <p>{a.isi}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="b-semboyan" aria-label="Semboyan sekolah">
          <div className="b-wadah">
            <p>“Cerita Masa Depan Papua”</p>
            <span>Semboyan {s.nama_sekolah}</span>
          </div>
        </section>
      </main>

      <PitaMotif id="motif-kaki" className="pita-tipis" />
      <footer className="b-kaki">
        <div className="b-wadah b-kaki-isi">
          <div className="b-kaki-merek">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={s.ada_logo ? "/api/logo-sekolah" : "/api/ikon-aplikasi/icon-192.png"} alt="" width="48" height="48" />
            <div>
              <b>{s.nama_sekolah}</b>
              {alamat && <span>{alamat}</span>}
              {npsn && <span>NPSN {npsn}</span>}
            </div>
          </div>
          <div className="b-kaki-tautan">
            <Link href="/spmb">SPMB</Link>
            <Link href="/login">Masuk</Link>
            <span>© {tahun} {s.nama_sekolah} · SAPrapor</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
