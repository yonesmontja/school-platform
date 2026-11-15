"use client";
// Penulisan seragam "siapa yang mengisi" untuk semua menu (nilai, jadwal, jurnal, presensi, tindak lanjut, pembinaan, …):
// - penginput = guru yang tercatat → satu nama saja (badge guru);
// - penginput berbeda (mis. admin mengisi untuk guru) → badge guru + "diisi <nama akun>" di bawahnya;
// - tanpa guru tercatat → nama penginput sebagai badge.
// Penentuan memakai id_guru akun penginput bila tersedia, dan nama sebagai cadangan.

const rapi = (s) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Nama penginput yang perlu ditampilkan sebagai "diisi …", atau null bila sama dengan guru / tidak diketahui.
 * @param {{guru?: string, idGuru?: string, pengisi?: string, idGuruPengisi?: string}} o
 */
export function pengisiLain({ guru, idGuru, pengisi, idGuruPengisi }) {
  if (!pengisi) return null;
  if (!guru) return null;
  if (idGuru && idGuruPengisi) return idGuru === idGuruPengisi ? null : pengisi;
  return rapi(guru) === rapi(pengisi) ? null : pengisi;
}

/** Perangkat/bahan ber-mapel (bank soal, kisi-kisi, paket, ATP, modul, video): guru pengampu mapel vs akun pembuat. */
export const pengisiMapel = (x) => ({ guru: x?.mapel?.guru?.nama_guru, idGuru: x?.mapel?.id_guru, pengisi: x?.pembuat?.name, idGuruPengisi: x?.pembuat?.id_guru });

/** Versi teks (Excel/PDF): "Guru" atau "Guru (diisi Akun)". */
export function teksPengisi(o) {
  const utama = o.guru || o.pengisi || "";
  const lain = pengisiLain(o);
  return lain ? `${utama} (diisi ${lain})` : utama || "-";
}

/**
 * props: guru, idGuru, pengisi, idGuruPengisi, kosong ("-"), sebaris (true: "diisi …" di sebelah badge, untuk baris meta)
 */
export default function Pengisi({ guru, idGuru, pengisi, idGuruPengisi, kosong = "-", sebaris = false, className = "" }) {
  const utama = guru || pengisi;
  if (!utama) return <span className={`text-muted ${className}`}>{kosong}</span>;
  const lain = pengisiLain({ guru, idGuru, pengisi, idGuruPengisi });
  return (
    <span className={`pengisi ${className}`}>
      <span className="badge bg-body-secondary text-body-secondary border fw-normal text-wrap text-start">{utama}</span>
      {lain && <small className={`${sebaris ? "ms-1" : "d-block"} text-muted`} title="Akun yang menginput">diisi {lain}</small>}
    </span>
  );
}
