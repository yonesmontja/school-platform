"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { TINGKAT, muatNotifikasi, tandaiDibaca, useNotifikasi, waktuRelatif } from "@/app/lib/notifikasi";
import { aturNotifPerangkat, notifPerangkatAktif, notifPerangkatDidukung } from "@/app/lib/pwa";

// Halaman "Perlu Tindakan": semua notifikasi pengguna, dikelompokkan per tingkat kepentingan
export default function NotifikasiPage() {
  const { data, belum_dibaca, memuat, galat } = useNotifikasi();
  const [hanyaBaru, setHanyaBaru] = useState(false);
  const [kategori, setKategori] = useState("");
  const [segar, setSegar] = useState(false);
  const [perangkat, setPerangkat] = useState({ didukung: false, aktif: false });
  useEffect(() => { setPerangkat({ didukung: notifPerangkatDidukung(), aktif: notifPerangkatAktif() }); }, []);
  const ubahPerangkat = async (aktif) => {
    const hasil = await aturNotifPerangkat(aktif, data);
    setPerangkat((p) => ({ ...p, aktif: hasil }));
    if (aktif && !hasil) alert("Izin notifikasi ditolak peramban. Aktifkan lewat pengaturan situs di peramban Anda.");
  };

  const daftarKategori = useMemo(() => [...new Set(data.map((n) => n.kategori))].sort(), [data]);
  const tampil = data.filter((n) => (!hanyaBaru || !n.dibaca) && (!kategori || n.kategori === kategori));
  const perTingkat = Object.keys(TINGKAT).map((t) => ({ t, item: tampil.filter((n) => n.tingkat === t) })).filter((g) => g.item.length);
  const hitung = (t) => data.filter((n) => n.tingkat === t && !n.dibaca).length;

  const segarkan = async () => { setSegar(true); await muatNotifikasi(); setSegar(false); };

  return (
    <div className="container-fluid py-3">
      <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
        <div className="me-auto">
          <h3 className="fw-bold mb-0"><i className="bi bi-bell text-primary me-2"></i>Perlu Tindakan</h3>
          <div className="small text-body-secondary">Pengingat otomatis dari data Anda: remedial, nilai di bawah KKM, jadwal, presensi, dan rapor. Notifikasi hilang sendiri setelah pekerjaannya selesai.</div>
        </div>
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={segarkan} disabled={segar}>
          <i className={`bi bi-arrow-clockwise ${segar ? "log-putar" : ""}`}></i><span className="d-none d-sm-inline ms-1">Segarkan</span>
        </button>
        <button type="button" className="btn btn-sm btn-primary" onClick={() => tandaiDibaca()} disabled={!belum_dibaca}>
          <i className="bi bi-check2-all me-1"></i>Tandai semua dibaca
        </button>
      </div>

      {perangkat.didukung && (
        <div className="form-check form-switch small mb-3">
          <input className="form-check-input" type="checkbox" id="notifPerangkat" checked={perangkat.aktif} onChange={(e) => ubahPerangkat(e.target.checked)} />
          <label className="form-check-label" htmlFor="notifPerangkat">
            <i className="bi bi-phone-vibrate me-1"></i>Munculkan notifikasi di perangkat ini untuk hal yang mendesak/perlu perhatian
            <span className="text-body-secondary"> (selama SAPrapor terbuka atau terpasang sebagai aplikasi)</span>
          </label>
        </div>
      )}

      {/* RINGKASAN PER TINGKAT */}
      <div className="row g-2 mb-3">
        {Object.entries(TINGKAT).map(([t, info]) => (
          <div key={t} className="col-6 col-lg-3">
            <div className="notif-ringkas" style={{ borderLeftColor: `var(--bs-${info.warna})` }}>
              <span className={`notif-ikon text-bg-${info.warna}`}><i className={`bi ${info.ikon}`}></i></span>
              <div>
                <div className="fs-4 fw-bold lh-1">{hitung(t)}</div>
                <div className="small text-body-secondary">{info.label} <span className="d-none d-sm-inline">belum dibaca</span></div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="card card-outline card-primary">
        <div className="card-header d-flex flex-wrap align-items-center gap-2">
          <div className="btn-group btn-group-sm" role="group" aria-label="Saring">
            <button type="button" className={`btn ${!hanyaBaru ? "btn-dark" : "btn-outline-dark"}`} onClick={() => setHanyaBaru(false)}>Semua <span className="badge text-bg-light ms-1">{data.length}</span></button>
            <button type="button" className={`btn ${hanyaBaru ? "btn-dark" : "btn-outline-dark"}`} onClick={() => setHanyaBaru(true)}>Belum dibaca <span className="badge text-bg-light ms-1">{belum_dibaca}</span></button>
          </div>
          <div className="d-flex flex-wrap gap-1 ms-md-auto">
            {["", ...daftarKategori].map((k) => (
              <button key={k || "semua"} type="button" className={`btn btn-sm rounded-pill ${kategori === k ? "btn-primary" : "btn-outline-secondary"}`} onClick={() => setKategori(k)}>{k || "Semua kategori"}</button>
            ))}
          </div>
        </div>
        <div className="card-body">
          {galat && <div className="alert alert-danger small">{galat}</div>}
          {memuat && !data.length ? (
            <div className="placeholder-glow">{[1, 2, 3].map((i) => <span key={i} className="placeholder col-12 rounded-3 mb-2" style={{ height: 72 }}></span>)}</div>
          ) : !tampil.length ? (
            <div className="text-center text-body-secondary py-5">
              <i className="bi bi-emoji-smile fs-1 d-block mb-2 text-success"></i>
              {data.length ? "Tidak ada notifikasi pada saringan ini." : "Tidak ada yang perlu ditindaklanjuti. Semua beres!"}
            </div>
          ) : (
            perTingkat.map(({ t, item }) => (
              <section key={t} className="mb-4">
                <h6 className={`text-uppercase small fw-bold text-${TINGKAT[t].warna}-emphasis mb-2`}><i className={`bi ${TINGKAT[t].ikon} me-1`}></i>{TINGKAT[t].label}</h6>
                <div className="d-flex flex-column gap-2">
                  {item.map((n) => (
                    <div key={n.kunci} className={`notif-kartu${n.dibaca ? " is-dibaca" : ""}`} style={{ borderLeftColor: `var(--bs-${TINGKAT[n.tingkat].warna})` }}>
                      <span className={`notif-ikon text-bg-${TINGKAT[n.tingkat].warna}`}><i className={`bi ${n.ikon}`}></i></span>
                      <div className="notif-isi">
                        <div className="d-flex flex-wrap align-items-center gap-2">
                          <span className="fw-semibold">{n.judul}</span>
                          {!n.dibaca && <span className="badge text-bg-primary">Baru</span>}
                        </div>
                        <div className="small text-body-secondary mt-1">{n.pesan}</div>
                        <div className="small text-body-tertiary mt-1">{n.kategori} · {waktuRelatif(n.waktu)}</div>
                      </div>
                      <div className="notif-aksi">
                        {n.tautan && (
                          <Link href={n.tautan} className="btn btn-sm btn-primary" onClick={() => !n.dibaca && tandaiDibaca([n.kunci])}>Buka <i className="bi bi-arrow-right"></i></Link>
                        )}
                        {!n.dibaca && (
                          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => tandaiDibaca([n.kunci])} title="Tandai dibaca"><i className="bi bi-check2"></i></button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
