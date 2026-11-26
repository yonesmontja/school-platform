"use client";
import { useCallback, useEffect, useState } from "react";
import { API_URL } from "@/app/lib/config";

const tgl = (v) => (v ? new Date(v).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) : "-");
// Waktu ditulis dalam WIT (zona sekolah), apa pun zona perangkat pembaca
const jam = (v) => (v ? `${new Date(v).toLocaleString("id-ID", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jayapura" })} WIT` : "-");
const KEPUTUSAN = { NAIK: "Naik kelas", TIDAK_NAIK: "Tinggal kelas", LULUS: "Lulus" };

/** Status bertingkat: hijau hanya bila sudah disahkan kepala sekolah dan isinya tidak berubah sejak terbit. */
function statusDari(d) {
  if (d.status === "DIGANTI") return { kunci: "diganti", nada: "oranye", ikon: "bi-arrow-repeat", judul: "Rapor ini sudah diganti versi yang lebih baru", ket: "Minta rapor versi terbaru kepada wali kelas. Rapor yang Anda pegang tidak berlaku lagi." };
  if (d.berubah) return { kunci: "berubah", nada: "oranye", ikon: "bi-exclamation-triangle-fill", judul: "Rapor resmi, tetapi nilai di sekolah sudah berubah sejak diterbitkan", ket: "Isi di bawah adalah nilai saat rapor diterbitkan. Tanyakan ke sekolah apakah ada rapor perbaikan." };
  if (!d.disahkan_pada) return { kunci: "menunggu", nada: "kuning", ikon: "bi-hourglass-split", judul: "Diterbitkan wali kelas, menunggu pengesahan kepala sekolah", ket: "Rapor ini tercatat resmi di sekolah, tetapi belum disahkan kepala sekolah." };
  return { kunci: "sah", nada: "hijau", ikon: "bi-patch-check-fill", judul: "Rapor sah dan berlaku", ket: "Tercatat di sistem sekolah, ditandatangani wali kelas, dan disahkan kepala sekolah." };
}

/** Hasil cek kode rapor (dibaca di peramban dari API publik). */
export default function HasilRapor({ kode, sekolah }) {
  const [hasil, setHasil] = useState(null);
  const [inisial, setInisial] = useState("");
  const [memuat, setMemuat] = useState(false);

  const periksa = useCallback(async (huruf = "") => {
    setMemuat(true);
    const q = huruf ? `?${new URLSearchParams({ inisial: huruf })}` : "";
    try {
      const r = await fetch(`${API_URL}/verifikasi-rapor/${encodeURIComponent(kode)}${q}`, { headers: { Accept: "application/json" }, cache: "no-store" });
      setHasil({ ok: r.ok, status: r.status, ...(await r.json().catch(() => ({}))) });
    } catch {
      setHasil({ ok: false, message: "Tidak dapat menghubungi server. Periksa sambungan internet lalu muat ulang." });
    } finally { setMemuat(false); }
  }, [kode]);
  useEffect(() => { periksa(); }, [periksa]);

  if (!hasil) return <div className="vr-kartu"><div className="vr-isi vr-redup">Memeriksa rapor…</div></div>;
  if (!hasil.ok) {
    return (
      <div className="vr-kartu" data-verifikasi-rapor="tidak-ditemukan">
        <div className="vr-pita vr-merah" role="status"><i className="bi bi-x-octagon-fill" aria-hidden="true"></i>
          <div><strong>{hasil.status === 429 ? "Terlalu banyak percobaan" : "Rapor tidak terverifikasi"}</strong>
            <span>{hasil.status === 429 ? "Tunggu satu menit lalu muat ulang halaman." : hasil.message || "Kode tidak ditemukan."}</span></div>
        </div>
        <div className="vr-isi vr-kecil">Kode yang diperiksa: <span className="vr-kode">{String(kode).toUpperCase()}</span>. Jika rapor ini Anda terima dari sekolah, hubungi wali kelas atau tata usaha untuk memastikan.</div>
      </div>
    );
  }

  const d = hasil.data;
  const st = statusDari(d);
  const kop = { ...sekolah, ...Object.fromEntries(Object.entries(d.kop || {}).filter(([, v]) => v !== null && v !== "")) };
  const logo = kop.ada_logo ? "/api/logo-sekolah" : "/api/ikon-aplikasi/icon-192.png";
  const kirimInisial = (e) => { e.preventDefault(); if (inisial.trim()) periksa(inisial.trim()); };

  return (
    <div className="vr-kartu" data-verifikasi-rapor={st.kunci === "sah" || st.kunci === "menunggu" ? "berlaku" : st.kunci} data-status={st.kunci}>
      {/* Kop digital sekolah */}
      <div className="vr-kop">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} alt={`Logo ${kop.nama || "sekolah"}`} width="56" height="56" />
        <div>
          <div className="vr-kop-nama">{kop.nama || d.sekolah}</div>
          <div className="vr-kop-sub">{[kop.npsn && `NPSN ${kop.npsn}`, kop.alamat, kop.kota].filter(Boolean).join(" · ")}</div>
        </div>
      </div>

      <div className={`vr-pita vr-${st.nada}`} role="status" data-pita-status={st.kunci}>
        <i className={`bi ${st.ikon}`} aria-hidden="true"></i>
        <div><strong>{st.judul}</strong><span>{st.ket}</span></div>
      </div>

      <div className="vr-isi">
        <div className="vr-meta">
          <span>Kode <span className="vr-kode">{d.kode || String(kode).toUpperCase()}</span>{d.versi > 1 ? ` · Versi ${d.versi}` : " · Versi 1"}</span>
          <span data-diperiksa><i className="bi bi-clock-history me-1" aria-hidden="true"></i>Diperiksa {jam(d.diperiksa_pada)}</span>
        </div>

        <div className="vr-siswa">
          <div className="vr-nama">{d.nama_siswa}</div>
          <div className="vr-redup">{d.nama_kelas} · {d.tahun_ajaran} semester {d.semester}{d.nisn ? ` · NISN ${d.nisn}` : ""}</div>
          <div className="vr-redup vr-kecil">Tanggal rapor {tgl(d.tanggal_rapor)}</div>
        </div>

        <h2 className="vr-judul-bagian">Pengesahan elektronik</h2>
        <ul className="vr-ttd">
          <li data-ttd="wali">
            <i className="bi bi-check-circle-fill vr-ok" aria-hidden="true"></i>
            <div><span className="vr-peran">Wali kelas</span><strong>{d.nama_wali || "-"}</strong>
              <span className="vr-redup vr-kecil">Ditandatangani secara elektronik · {jam(d.diterbitkan_pada)}</span></div>
          </li>
          <li data-ttd="kepsek">
            {d.disahkan_pada
              ? <i className="bi bi-check-circle-fill vr-ok" aria-hidden="true"></i>
              : <i className="bi bi-hourglass-split vr-tunggu" aria-hidden="true"></i>}
            <div><span className="vr-peran">Kepala sekolah</span>
              {d.disahkan_pada ? (
                <><strong>{d.nama_kepsek}</strong>
                  {d.nip_kepsek && <span className="vr-redup vr-kecil">NIP {d.nip_kepsek}</span>}
                  <span className="vr-redup vr-kecil">Disahkan secara elektronik · {jam(d.disahkan_pada)}</span></>
              ) : <span className="vr-redup">Belum disahkan</span>}
            </div>
          </li>
        </ul>

        <h2 className="vr-judul-bagian">Cocokkan nilai</h2>
        {d.perlu_inisial ? (
          <form className="vr-inisial" onSubmit={kirimInisial} data-form-inisial>
            <label htmlFor="vr-inisial">Untuk melihat nilai, ketik <b>dua huruf awal nama siswa</b> seperti tertulis di rapor.</label>
            <div className="vr-inisial-baris">
              <input id="vr-inisial" className="form-control" value={inisial} onChange={(e) => setInisial(e.target.value.replace(/[^\p{L}]/gu, "").slice(0, 2).toUpperCase())}
                maxLength={2} autoComplete="off" inputMode="text" placeholder="AG" aria-describedby="vr-inisial-ket" />
              <button type="submit" className="btn btn-dark" disabled={memuat || inisial.length < 2}>{memuat ? "Memeriksa…" : "Tampilkan nilai"}</button>
            </div>
            <div id="vr-inisial-ket" className={`vr-kecil ${d.inisial_salah ? "vr-salah" : "vr-redup"}`} role={d.inisial_salah ? "alert" : undefined}>
              {d.inisial_salah ? "Huruf awal tidak cocok dengan nama di rapor. Periksa lagi." : "Langkah ini menjaga nilai siswa dari orang yang hanya memegang kode."}
            </div>
          </form>
        ) : (
          <>
            {d.kenaikan && <p className="vr-keputusan">Keputusan: <strong>{KEPUTUSAN[d.kenaikan.keputusan] || d.kenaikan.keputusan}</strong></p>}
            <div className="vr-tabel-wadah">
              <table className="vr-tabel" data-tabel-nilai>
                <thead><tr><th scope="col">Mata pelajaran</th><th scope="col" className="vr-angka">KKM</th><th scope="col" className="vr-angka">Nilai</th></tr></thead>
                <tbody>
                  {d.mapel.map((m) => <tr key={m.nama}><td>{m.nama}</td><td className="vr-angka">{m.kkm ?? "-"}</td><td className="vr-angka"><strong>{m.nilai ?? "-"}</strong></td></tr>)}
                </tbody>
                {d.rata_umum !== null && <tfoot><tr><th scope="row" colSpan={2}>Rata-rata</th><th className="vr-angka">{d.rata_umum}</th></tr></tfoot>}
              </table>
            </div>
          </>
        )}

        <div className="vr-bantuan">
          <i className="bi bi-info-circle" aria-hidden="true"></i>
          <span>Ada yang berbeda dengan rapor yang Anda pegang? Hubungi wali kelas <b>{d.nama_wali || "siswa"}</b> atau tata usaha {kop.nama || "sekolah"}{kop.alamat ? ` (${kop.alamat})` : ""}, dan sebutkan kode di atas.</span>
        </div>
      </div>
    </div>
  );
}
