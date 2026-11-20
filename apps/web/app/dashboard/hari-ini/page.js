"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Swal from "sweetalert2";
import { API_URL, useAkses } from "@/app/lib/akses";
import { minta } from "@/components/banksoal/api";
import { FotoKecil } from "@/components/siswa/EditorFoto";
import { galatJaringan, sedangOffline, tambahAntrean, useOnline } from "@/app/lib/antrean";
import { TINGKAT } from "@/app/lib/notifikasi";

// Status presensi dengan tombol besar untuk jempol
const STATUS = [
  { k: "HADIR", s: "H", label: "Hadir", warna: "success" },
  { k: "SAKIT", s: "S", label: "Sakit", warna: "info" },
  { k: "IZIN", s: "I", label: "Izin", warna: "warning" },
  { k: "ALPA", s: "A", label: "Alpa", warna: "danger" },
];
const SIMPANAN = "hari-ini-terakhir";
const tanggalPanjang = (t) => new Date(`${t}T00:00:00`).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const salam = (jam) => { const h = Number(String(jam).slice(0, 2)); return h < 11 ? "Selamat pagi" : h < 15 ? "Selamat siang" : h < 18 ? "Selamat sore" : "Selamat malam"; };
const WARNA_SESI = { Menunggu: "secondary", Berlangsung: "primary", Selesai: "success" };

function bacaSimpanan() { try { return JSON.parse(localStorage.getItem(SIMPANAN) || "null"); } catch (e) { return null; } }

/** Presensi cepat satu kelas: semua Hadir dulu, ketuk status bila perlu. */
function PresensiCepat({ kelas, tanggal, periode, onSelesai, onTutup }) {
  const [lembar, setLembar] = useState(() => Object.fromEntries(kelas.siswa.map((s) => [s.id_siswa, s.status || "HADIR"])));
  const [ket, setKet] = useState(() => Object.fromEntries(kelas.siswa.map((s) => [s.id_siswa, s.keterangan || ""])));
  const [simpan, setSimpan] = useState(false);
  const hitung = STATUS.map((st) => ({ ...st, n: Object.values(lembar).filter((v) => v === st.k).length }));

  const kirim = async () => {
    const records = kelas.siswa.map((s) => ({ id_siswa: s.id_siswa, status_kehadiran: lembar[s.id_siswa], keterangan: (ket[s.id_siswa] || "").trim() }));
    const body = { id_kelas: kelas.id_kelas, id_periode: periode, tanggal, records };
    const tidakHadir = records.filter((r) => r.status_kehadiran !== "HADIR").length;
    const offline = async () => {
      await tambahAntrean({ jenis: "presensi", url: `${API_URL}/presensi/batch`, body, label: `Presensi ${kelas.nama_kelas} ${tanggalPanjang(tanggal)} · ${tidakHadir} tidak hadir` });
      Swal.fire({ icon: "info", title: "Disimpan di HP", text: "Anda sedang offline. Presensi dikirim otomatis saat tersambung lagi.", confirmButtonText: "Mengerti" });
      onSelesai(records, true);
    };
    if (sedangOffline()) return offline();
    setSimpan(true);
    try {
      const r = await minta("POST", "/presensi/batch", body);
      Swal.fire({ toast: true, position: "top", icon: "success", title: r.message || "Presensi tersimpan", showConfirmButton: false, timer: 2500 });
      onSelesai(records, false);
    } catch (e) {
      if (galatJaringan(e)) return offline();
      Swal.fire("Belum tersimpan", e.message, "warning");
    } finally { setSimpan(false); }
  };

  return (
    <div className="hi-lembar" data-presensi-cepat={kelas.nama_kelas}>
      <div className="d-flex align-items-center gap-2 mb-2 position-sticky top-0 bg-body py-2" style={{ zIndex: 2 }}>
        <button type="button" className="btn btn-light btn-sm" onClick={onTutup} aria-label="Kembali"><i className="bi bi-arrow-left"></i></button>
        <div className="me-auto">
          <div className="fw-bold">Presensi {kelas.nama_kelas}</div>
          <div className="small text-body-secondary">{hitung.map((h) => `${h.s} ${h.n}`).join(" · ")}</div>
        </div>
        <button type="button" className="btn btn-outline-success btn-sm" onClick={() => setLembar(Object.fromEntries(kelas.siswa.map((s) => [s.id_siswa, "HADIR"])))}>Semua hadir</button>
      </div>
      <div className="list-group mb-3">
        {kelas.siswa.map((s) => (
          <div key={s.id_siswa} className="list-group-item px-2" data-baris-presensi={s.nama_siswa}>
            <div className="d-flex align-items-center gap-2">
              <FotoKecil siswa={s} ukuran={36} />
              <div className="me-auto min-w-0">
                <div className="fw-semibold text-truncate">{s.nama_siswa}</div>
              </div>
              <div className="btn-group" role="group" aria-label={`Status ${s.nama_siswa}`}>
                {STATUS.map((st) => (
                  <button key={st.k} type="button" title={st.label} aria-label={`${st.label} ${s.nama_siswa}`} aria-pressed={lembar[s.id_siswa] === st.k}
                    className={`btn hi-status ${lembar[s.id_siswa] === st.k ? `btn-${st.warna}` : `btn-outline-${st.warna}`}`}
                    onClick={() => setLembar((l) => ({ ...l, [s.id_siswa]: st.k }))}>{st.s}</button>
                ))}
              </div>
            </div>
            {lembar[s.id_siswa] !== "HADIR" && (
              <input className="form-control form-control-sm mt-2" placeholder="Keterangan (opsional), mis. demam, acara keluarga"
                value={ket[s.id_siswa]} onChange={(e) => setKet((k) => ({ ...k, [s.id_siswa]: e.target.value }))} aria-label={`Keterangan ${s.nama_siswa}`} />
            )}
          </div>
        ))}
      </div>
      <div className="position-sticky bottom-0 bg-body py-2">
        <button type="button" className="btn btn-primary btn-lg w-100" onClick={kirim} disabled={simpan}>
          {simpan ? <span className="spinner-border spinner-border-sm me-2"></span> : <i className="bi bi-check2-circle me-2"></i>}Simpan presensi
        </button>
      </div>
    </div>
  );
}

/**
 * Mode "Hari ini" untuk guru di HP: jadwal mengajar hari ini dengan tombol besar ke presensi, jurnal, dan nilai;
 * presensi cepat kelas binaan (tetap bisa disimpan saat offline); pengingat teratas.
 */
export default function HariIniPage() {
  const { user } = useAkses();
  const online = useOnline();
  const [data, setData] = useState(null);
  const [dariSimpanan, setDariSimpanan] = useState(false);
  const [buka, setBuka] = useState(null); // id_kelas presensi cepat

  const muat = useCallback(async () => {
    try {
      const r = await minta("GET", "/hari-ini");
      setData(r); setDariSimpanan(false);
      try { localStorage.setItem(SIMPANAN, JSON.stringify(r)); } catch (e) { /* penyimpanan penuh */ }
    } catch (e) {
      const lama = bacaSimpanan();
      if (lama) { setData(lama); setDariSimpanan(true); } else setData({ galat: e.message });
    }
  }, []);
  useEffect(() => { muat(); }, [muat]);
  useEffect(() => { if (online && dariSimpanan) muat(); }, [online, dariSimpanan, muat]);

  const kelasBuka = useMemo(() => data?.kelas_binaan?.find((k) => k.id_kelas === buka), [data, buka]);

  if (!data) return <div className="container py-4 text-body-secondary"><span className="spinner-border spinner-border-sm me-2"></span>Memuat hari ini…</div>;
  if (data.galat) return <div className="container py-4"><div className="alert alert-warning">{data.galat}</div></div>;

  if (kelasBuka) {
    return (
      <div className="container py-2 hi-wadah">
        <style>{HI_CSS}</style>
        <PresensiCepat kelas={kelasBuka} tanggal={data.tanggal} periode={data.periode} onTutup={() => setBuka(null)}
          onSelesai={(records, antre) => {
            const status = Object.fromEntries(records.map((r) => [r.id_siswa, r]));
            setData((d) => ({ ...d, kelas_binaan: d.kelas_binaan.map((k) => k.id_kelas !== kelasBuka.id_kelas ? k : {
              ...k, antre, terisi: k.siswa.length,
              siswa: k.siswa.map((s) => ({ ...s, status: status[s.id_siswa]?.status_kehadiran, keterangan: status[s.id_siswa]?.keterangan })),
            }) }));
            setBuka(null);
            if (!antre) muat();
          }} />
      </div>
    );
  }

  const tutupPresensi = data.libur || data.bukan_hari_presensi;
  return (
    <div className="container py-3 hi-wadah">
      <style>{HI_CSS}</style>
      <div className="mb-3">
        <div className="small text-body-secondary">{tanggalPanjang(data.tanggal)}</div>
        <h4 className="fw-bold mb-0" data-judul-hari-ini>{salam(data.jam)}, {user?.name?.split(" ")[0] || "Bapak/Ibu"}</h4>
        {dariSimpanan && <div className="small text-warning mt-1"><i className="bi bi-wifi-off me-1"></i>Offline: menampilkan data terakhir yang dimuat.</div>}
        {data.libur && <div className="alert alert-info py-2 small mt-2 mb-0"><i className="bi bi-calendar-heart me-1"></i>Hari libur: {data.libur}</div>}
      </div>

      {/* PRESENSI KELAS BINAAN */}
      {data.kelas_binaan.map((k) => {
        const lengkap = k.terisi >= k.siswa.length && k.siswa.length > 0;
        const tidakHadir = k.siswa.filter((s) => s.status && s.status !== "HADIR");
        return (
          <div key={k.id_kelas} className={`card mb-3 border-${lengkap ? "success" : "warning"}`} data-kartu-presensi={k.nama_kelas}>
            <div className="card-body">
              <div className="d-flex align-items-center gap-2 mb-2">
                <i className={`bi ${lengkap ? "bi-check-circle-fill text-success" : "bi-calendar-check text-warning"} fs-4`}></i>
                <div className="me-auto">
                  <div className="fw-bold">Presensi {k.nama_kelas}</div>
                  <div className="small text-body-secondary" data-status-presensi>
                    {tutupPresensi ? `${data.bukan_hari_presensi || "Hari libur"}: tidak ada presensi.`
                      : lengkap ? `Sudah diisi${k.antre ? " (menunggu sinyal)" : ""} · ${tidakHadir.length ? `${tidakHadir.length} tidak hadir` : "semua hadir"}`
                      : `Belum diisi · ${k.siswa.length} siswa`}
                  </div>
                </div>
              </div>
              {tidakHadir.length > 0 && (
                <div className="small mb-2">{tidakHadir.map((s) => <span key={s.id_siswa} className="badge text-bg-light border me-1 mb-1">{s.nama_siswa} · {STATUS.find((x) => x.k === s.status)?.label}</span>)}</div>
              )}
              {!tutupPresensi && (
                <button type="button" className={`btn btn-lg w-100 ${lengkap ? "btn-outline-secondary" : "btn-warning"}`} onClick={() => setBuka(k.id_kelas)}>
                  <i className="bi bi-hand-index-thumb me-2"></i>{lengkap ? "Ubah presensi" : "Isi presensi cepat"}
                </button>
              )}
            </div>
          </div>
        );
      })}

      {/* JADWAL MENGAJAR HARI INI */}
      <div className="d-flex align-items-center mb-2">
        <h6 className="fw-bold mb-0 me-auto"><i className="bi bi-calendar3-week me-1 text-primary"></i>Mengajar hari ini</h6>
        <Link href="/dashboard/jadwal" className="small">Jadwal lengkap</Link>
      </div>
      {data.sesi.length === 0 && <div className="card card-body text-body-secondary small mb-3" data-tanpa-sesi>Tidak ada sesi mengajar hari ini.</div>}
      {data.sesi.map((j) => {
        const nilaiUrl = `/dashboard/nilai?${new URLSearchParams(Object.fromEntries(Object.entries({ id_kelas: j.id_kelas, id_mapel: j.id_mapel, id_materi: j.id_materi, tanggal: data.tanggal }).filter(([, v]) => v)))}`;
        return (
          <div key={j.id_jadwal} className={`card mb-2 hi-sesi ${j.status_sesi === "Berlangsung" ? "border-primary border-2" : ""}`} data-sesi-hari-ini={j.judul}>
            <div className="card-body py-2">
              <div className="d-flex align-items-start gap-2">
                <div className="text-center hi-jam"><div className="fw-bold">{j.mulai}</div><div className="small text-body-secondary">{j.selesai}</div></div>
                <div className="me-auto min-w-0">
                  <div className="fw-semibold">{j.judul}</div>
                  <div className="small text-body-secondary">{[j.nama_kelas, j.ruangan, j.modul && `${j.modul}${j.pertemuan_ke ? ` · P${j.pertemuan_ke}` : ""}`].filter(Boolean).join(" · ")}</div>
                </div>
                <span className={`badge text-bg-${WARNA_SESI[j.status_sesi] || "secondary"}`}>{j.status_sesi}</span>
              </div>
              <div className="row g-1 mt-2">
                <div className="col-4"><Link href={j.id_kelas ? `/dashboard/presensi?kelas=${encodeURIComponent(j.id_kelas)}` : "/dashboard/presensi"} className="btn btn-light w-100 hi-aksi">
                  <i className={`bi ${j.presensi_mapel ? "bi-check2-square text-success" : "bi-person-check"}`}></i><span>Presensi</span></Link></div>
                <div className="col-4"><Link href="/dashboard/jurnal" className="btn btn-light w-100 hi-aksi"><i className="bi bi-journal-text"></i><span>Jurnal</span></Link></div>
                <div className="col-4"><Link href={nilaiUrl} className="btn btn-light w-100 hi-aksi">
                  <i className={`bi ${j.nilai ? "bi-check2-square text-success" : "bi-pencil-square"}`}></i><span>Nilai{j.nilai ? ` (${j.nilai})` : ""}</span></Link></div>
              </div>
            </div>
          </div>
        );
      })}

      {/* PERINGATAN & PENGINGAT */}
      {data.peringatan_dini > 0 && (
        <Link href="/dashboard/peringatan-dini" className="card card-body mb-2 mt-3 text-decoration-none border-danger-subtle" data-hi-peringatan>
          <div className="d-flex align-items-center gap-2"><i className="bi bi-activity text-danger fs-4"></i>
            <div className="me-auto"><b>{data.peringatan_dini} siswa</b> kelas binaan berisiko sedang/tinggi</div><i className="bi bi-chevron-right"></i></div>
        </Link>
      )}
      {data.pengingat.length > 0 && (
        <div className="mt-3">
          <div className="d-flex align-items-center mb-2">
            <h6 className="fw-bold mb-0 me-auto"><i className="bi bi-bell me-1 text-primary"></i>Perlu tindakan</h6>
            <Link href="/dashboard/notifikasi" className="small">Semua ({data.jumlah_pengingat})</Link>
          </div>
          <div className="list-group">
            {data.pengingat.map((n) => (
              <Link key={n.kunci} href={n.tautan || "/dashboard/notifikasi"} className="list-group-item list-group-item-action d-flex gap-2 align-items-start">
                <i className={`bi ${n.ikon} text-${TINGKAT[n.tingkat]?.warna || "secondary"} mt-1`}></i>
                <div className="min-w-0"><div className="fw-semibold small">{n.judul}</div><div className="small text-body-secondary text-truncate">{n.pesan}</div></div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const HI_CSS = `
.hi-wadah { max-width: 640px; }
.hi-status { min-width: 2.6rem; min-height: 2.6rem; font-weight: 700; }
.hi-aksi { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: .55rem .25rem; font-size: .8rem; }
.hi-aksi .bi { font-size: 1.25rem; }
.hi-jam { min-width: 3.2rem; }
`;
