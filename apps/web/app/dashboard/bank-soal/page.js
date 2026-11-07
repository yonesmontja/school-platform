"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Swal from "sweetalert2";
import { useAkses } from "@/app/lib/akses";
import { BENTUK, LEVEL, STATUS, SUMBER, labelBentuk } from "@/components/banksoal/konstanta";
import PratinjauSoal, { LencanaStnkm } from "@/components/banksoal/PratinjauSoal";
import EditorSoal from "@/components/banksoal/EditorSoal";
import ModalDrafAI from "@/components/banksoal/ModalDrafAI";
import KisiKisi from "@/components/banksoal/KisiKisi";
import ImporSoal from "@/components/banksoal/ImporSoal";
import PaketSoal from "@/components/banksoal/PaketSoal";
import { minta } from "@/components/banksoal/api";

const TAB = [
  { id: "soal", label: "Bank Soal", icon: "bi-collection" },
  { id: "kisi", label: "Kisi-kisi", icon: "bi-grid-3x3" },
  { id: "paket", label: "Paket Soal", icon: "bi-journal-text" },
  { id: "impor", label: "Impor Paket", icon: "bi-box-arrow-in-down" },
];
const FILTER_AWAL = { id_mapel: "", status: "", bentuk: "", level_kognitif: "", cari: "", milik: false };

/** Hasil analisis butir dari paket yang pernah memakai soal ini. */
function LencanaTeruji({ stat }) {
  const warna = stat.teruji_baik ? "success" : stat.daya_beda === "JELEK" || stat.p < 0.2 || stat.p > 0.9 ? "danger" : "warning";
  const kesukaran = { MUDAH: "mudah", SEDANG: "sedang", SUKAR: "sukar" }[stat.kesukaran];
  return (
    <span className={`badge text-bg-${warna}-subtle border border-${warna}-subtle text-${warna}-emphasis fw-normal lencana-teruji`}
      title={`Dipakai di ${stat.paket} paket, ${stat.n} siswa.\nProporsi menjawab benar ${stat.p} (${kesukaran}), daya beda ${stat.d}.\n${stat.saran || ""}`}>
      <i className={`bi ${stat.teruji_baik ? "bi-patch-check" : "bi-graph-down"} me-1`}></i>
      {stat.teruji_baik ? "Teruji baik" : "Perlu ditinjau"} · {Math.round(stat.p * 100)}% benar · D {stat.d}
    </span>
  );
}

export default function BankSoalBungkus() {
  // useSearchParams perlu Suspense; tautan Perlu Tindakan membawa ?status=&milik=
  return <Suspense fallback={null}><BankSoalPage /></Suspense>;
}

function BankSoalPage() {
  const params = useSearchParams();
  const { user, isPengelola } = useAkses();
  const [tab, setTab] = useState("soal");
  const [referensi, setReferensi] = useState(null);
  // Filter dari tautan Perlu Tindakan (?status=&milik=) dipakai sejak pemuatan pertama
  const filterTautan = () => ({ ...FILTER_AWAL, status: params.get("status") || "", milik: params.get("milik") === "1" });
  const [filter, setFilter] = useState(filterTautan);
  const permintaan = useRef(0);
  const [halaman, setHalaman] = useState(1);
  const [data, setData] = useState({ data: [], meta: { per_status: {}, jumlah_halaman: 1, total: 0 } });
  const [memuat, setMemuat] = useState(true);
  const [dipilih, setDipilih] = useState([]);
  const [terbuka, setTerbuka] = useState({}); // soal yang pratinjaunya dibuka
  const [editor, setEditor] = useState(null); // { soal } untuk EditorSoal
  const [drafAi, setDrafAi] = useState(false);

  useEffect(() => {
    minta("GET", "/bank-soal/referensi").then(setReferensi).catch((err) => Swal.fire("Gagal memuat", err.message, "error"));
  }, []);

  // Tautan dari Perlu Tindakan saat halaman sudah terbuka
  useEffect(() => {
    if (!params.get("status") && !params.get("milik")) return;
    setTab("soal");
    setFilter((f) => {
      const baru = filterTautan();
      return f.status === baru.status && f.milik === baru.milik ? f : baru;
    });
    setHalaman(1);
  }, [params]);

  const muat = useCallback(async () => {
    const ke = ++permintaan.current; // hanya jawaban permintaan terakhir yang dipakai
    setMemuat(true);
    try {
      const q = new URLSearchParams({ page: halaman });
      Object.entries(filter).forEach(([k, v]) => { if (v) q.set(k, v === true ? "1" : v); });
      const hasil = await minta("GET", `/bank-soal?${q}`);
      if (ke !== permintaan.current) return;
      setData(hasil);
      setDipilih([]);
    } catch (err) { if (ke === permintaan.current) Swal.fire("Gagal memuat", err.message, "error"); }
    finally { if (ke === permintaan.current) setMemuat(false); }
  }, [filter, halaman]);
  useEffect(() => { muat(); }, [muat]);

  const ubahFilter = (patch) => { setFilter((f) => ({ ...f, ...patch })); setHalaman(1); };
  const bolehUbah = (s) => isPengelola || s.dibuat_oleh === user?.id;
  const bolehSetujui = !!referensi?.boleh_setujui;
  const pilihan = data.data.filter((s) => dipilih.includes(s.id_soal));

  const aksiMassal = async (jenis) => {
    const ids = jenis === "ajukan" ? pilihan.filter((s) => ["DRAF", "REVISI"].includes(s.status)).map((s) => s.id_soal)
      : pilihan.filter((s) => s.status === "DIAJUKAN").map((s) => s.id_soal);
    if (!ids.length) return Swal.fire("Tidak ada yang cocok", jenis === "ajukan" ? "Pilih soal berstatus Draf atau Perlu revisi." : "Pilih soal yang sedang menunggu persetujuan.", "info");
    let catatan = null;
    if (jenis === "revisi") {
      const r = await Swal.fire({ title: `Kembalikan ${ids.length} soal`, input: "textarea", inputLabel: "Catatan perbaikan untuk guru", inputPlaceholder: "mis. pengecoh nomor 2 terlalu mudah; sesuaikan bahasa untuk kelas 2",
        showCancelButton: true, confirmButtonText: "Kembalikan", cancelButtonText: "Batal", inputValidator: (v) => (!v?.trim() ? "Tulis catatan perbaikannya." : undefined) });
      if (!r.isConfirmed) return;
      catatan = r.value;
    }
    try {
      const res = await minta("POST", `/bank-soal/${jenis}`, { id_soal: ids, ...(catatan ? { catatan } : {}) });
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: res.message, showConfirmButton: false, timer: 2500 });
      muat();
    } catch (err) { Swal.fire("Gagal", err.message, "error"); }
  };

  const tarik = async (s) => {
    try { await minta("POST", `/bank-soal/${s.id_soal}/tarik`); muat(); }
    catch (err) { Swal.fire("Gagal", err.message, "error"); }
  };

  const hapus = async (s) => {
    const ok = await Swal.fire({ title: "Hapus soal ini?", text: s.pertanyaan.slice(0, 120), icon: "warning", showCancelButton: true, confirmButtonText: "Hapus", cancelButtonText: "Batal", confirmButtonColor: "#dc3545" });
    if (!ok.isConfirmed) return;
    try { await minta("DELETE", `/bank-soal/${s.id_soal}`); muat(); }
    catch (err) { Swal.fire("Gagal", err.message, "error"); }
  };

  const perStatus = data.meta.per_status || {};
  const totalSemua = Object.values(perStatus).reduce((a, b) => a + Number(b), 0);

  return (
    <div className="container-fluid mt-4 mb-5">
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-3 gap-2">
        <div>
          <h3 className="fw-bold text-primary mb-0"><i className="bi bi-patch-question me-2"></i>Bank Soal</h3>
          <small className="text-muted">Kisi-kisi, soal per TP, dan paket ujian dalam kerangka STNKM: disusun bersama AI, disetujui kepala sekolah, dikoreksi, dan dianalisis</small>
        </div>
        <ol className="breadcrumb mb-0 small">
          <li className="breadcrumb-item"><a href="/dashboard">Dashboard</a></li>
          <li className="breadcrumb-item">TDU - Jadwal</li>
          <li className="breadcrumb-item active" aria-current="page">Bank Soal</li>
        </ol>
      </div>

      <ul className="nav nav-pills mb-3 gap-1 flex-nowrap overflow-auto">
        {TAB.map((t) => (
          <li key={t.id} className="nav-item">
            <button type="button" className={`nav-link text-nowrap ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
              <i className={`bi ${t.icon} me-1`}></i>{t.label}
              {t.id === "soal" && bolehSetujui && Number(perStatus.DIAJUKAN) > 0 && <span className="badge rounded-pill text-bg-warning ms-1">{perStatus.DIAJUKAN}</span>}
            </button>
          </li>
        ))}
      </ul>

      {!referensi ? (
        <div className="text-muted"><span className="spinner-border spinner-border-sm me-2"></span>Memuat…</div>
      ) : !referensi.mapel.length ? (
        <div className="alert alert-info"><i className="bi bi-info-circle me-2"></i>Akun Anda belum mengampu mata pelajaran. Minta admin menautkan mapel di Master Mapel.</div>
      ) : tab === "kisi" ? (
        <KisiKisi referensi={referensi} onSoalBerubah={muat} />
      ) : tab === "paket" ? (
        <PaketSoal referensi={referensi} />
      ) : tab === "impor" ? (
        <ImporSoal referensi={referensi} onSelesai={() => { setTab("soal"); ubahFilter({ ...FILTER_AWAL, status: "DRAF", milik: true }); }} />
      ) : (
        <div className="card shadow-sm">
          <div className="card-header d-flex flex-wrap align-items-center gap-2">
            <h3 className="card-title fw-semibold mb-0 me-auto"><i className="bi bi-collection me-2"></i>Daftar Soal</h3>
            <button className="btn btn-sm btn-outline-primary" onClick={() => setEditor({ soal: null })}><i className="bi bi-plus-lg me-1"></i>Tulis soal</button>
            <button className="btn btn-sm btn-primary" onClick={() => setDrafAi(true)}><i className="bi bi-magic me-1"></i>Buat dengan AI</button>
          </div>
          <div className="card-body">
            {/* Status */}
            <div className="d-flex flex-wrap gap-1 mb-2" role="group" aria-label="Status soal">
              <button type="button" className={`btn btn-sm ${!filter.status ? "btn-dark" : "btn-outline-secondary"}`} onClick={() => ubahFilter({ status: "" })}>Semua <span className="badge text-bg-light ms-1">{totalSemua}</span></button>
              {Object.entries(STATUS).map(([k, st]) => (
                <button key={k} type="button" className={`btn btn-sm ${filter.status === k ? `btn-${st.warna}` : "btn-outline-secondary"}`} onClick={() => ubahFilter({ status: k })}>
                  <i className={`bi ${st.icon} me-1`}></i>{st.label} <span className="badge text-bg-light ms-1">{perStatus[k] || 0}</span>
                </button>
              ))}
            </div>
            {/* Filter lain */}
            <div className="row g-2 mb-3">
              <div className="col-6 col-md-3"><select className="form-select form-select-sm" value={filter.id_mapel} onChange={(e) => ubahFilter({ id_mapel: e.target.value })} aria-label="Filter mapel">
                <option value="">Semua mapel</option>{referensi.mapel.map((m) => <option key={m.id_mapel} value={m.id_mapel}>{m.nama_mapel}</option>)}</select></div>
              <div className="col-6 col-md-2"><select className="form-select form-select-sm" value={filter.bentuk} onChange={(e) => ubahFilter({ bentuk: e.target.value })} aria-label="Filter bentuk">
                <option value="">Semua bentuk</option>{BENTUK.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}</select></div>
              <div className="col-6 col-md-2"><select className="form-select form-select-sm" value={filter.level_kognitif} onChange={(e) => ubahFilter({ level_kognitif: e.target.value })} aria-label="Filter level">
                <option value="">Semua level</option>{LEVEL.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}</select></div>
              <div className="col-6 col-md-3"><input type="search" className="form-control form-control-sm" placeholder="Cari pertanyaan atau TP" aria-label="Cari soal"
                value={filter.cari} onChange={(e) => ubahFilter({ cari: e.target.value })} /></div>
              <div className="col-12 col-md-2 d-flex align-items-center"><div className="form-check form-switch m-0">
                <input className="form-check-input" type="checkbox" id="soalSaya" checked={filter.milik} onChange={(e) => ubahFilter({ milik: e.target.checked })} />
                <label className="form-check-label small" htmlFor="soalSaya">Soal saya</label></div></div>
            </div>

            {/* Aksi massal */}
            {dipilih.length > 0 && (
              <div className="alert alert-light border d-flex flex-wrap align-items-center gap-2 py-2">
                <span className="small me-auto"><b>{dipilih.length}</b> soal dipilih</span>
                <button className="btn btn-sm btn-warning" onClick={() => aksiMassal("ajukan")}><i className="bi bi-send me-1"></i>Ajukan ke kepala sekolah</button>
                {bolehSetujui && <>
                  <button className="btn btn-sm btn-success" onClick={() => aksiMassal("setujui")}><i className="bi bi-patch-check me-1"></i>Setujui</button>
                  <button className="btn btn-sm btn-outline-danger" onClick={() => aksiMassal("revisi")}><i className="bi bi-arrow-counterclockwise me-1"></i>Kembalikan</button>
                </>}
              </div>
            )}

            {memuat ? <div className="text-muted small py-3"><span className="spinner-border spinner-border-sm me-2"></span>Memuat soal…</div>
              : !data.data.length ? (
                <div className="text-center text-muted py-5">
                  <i className="bi bi-patch-question fs-1 d-block mb-2"></i>
                  {filter.status || filter.cari || filter.bentuk || filter.id_mapel ? "Tidak ada soal yang cocok dengan filter." : "Belum ada soal. Mulai dari kisi-kisi, minta AI membuat draf, atau impor paket soal lama."}
                </div>
              ) : (
                <div className="d-flex flex-column gap-2">
                  <div className="form-check small">
                    <input className="form-check-input" type="checkbox" id="pilihSemua" checked={dipilih.length === data.data.length}
                      onChange={(e) => setDipilih(e.target.checked ? data.data.map((s) => s.id_soal) : [])} />
                    <label className="form-check-label" htmlFor="pilihSemua">Pilih semua di halaman ini</label>
                  </div>
                  {data.data.map((s) => {
                    const st = STATUS[s.status];
                    return (
                      <div key={s.id_soal} className="border rounded p-2 kartu-soal" style={{ borderLeft: `4px solid var(--bs-${st.warna})` }}>
                        <div className="d-flex gap-2 align-items-start">
                          <input type="checkbox" className="form-check-input mt-1" aria-label="Pilih soal" checked={dipilih.includes(s.id_soal)}
                            onChange={(e) => setDipilih((d) => (e.target.checked ? [...d, s.id_soal] : d.filter((x) => x !== s.id_soal)))} />
                          <div className="flex-grow-1 min-w-0">
                            <div className="d-flex flex-wrap gap-1 align-items-center mb-1 small">
                              <span className={`badge text-bg-${st.warna}`}><i className={`bi ${st.icon} me-1`}></i>{st.label}</span>
                              <span className="badge text-bg-light border">{labelBentuk(s.bentuk)}</span>
                              <span className="badge text-bg-light border">{s.level_kognitif}</span>
                              <LencanaStnkm soal={s} />
                              {s.sumber !== "MANUAL" && <span className="badge text-bg-light border fw-normal"><i className={`bi ${s.sumber === "AI" ? "bi-magic" : "bi-box-arrow-in-down"} me-1`}></i>{SUMBER[s.sumber]}</span>}
                              {(s.gambar_svg || s.gambar_url) && <i className="bi bi-image text-muted" title="Bergambar"></i>}
                              {s.statistik && <LencanaTeruji stat={s.statistik} />}
                            </div>
                            {terbuka[s.id_soal] ? <div className="py-1"><PratinjauSoal soal={s} /></div>
                              : <div className="text-truncate">{s.pertanyaan}</div>}
                            <div className="small text-muted mt-1">
                              {s.mapel?.nama_mapel}{s.kelas && ` · ${s.kelas.nama_kelas}`} · {s.indikator?.deskripsi || s.materi?.nama_materi || "TP belum dipilih"}
                              {s.pembuat && ` · ${s.pembuat.name}`}{s.versi > 1 && ` · versi ${s.versi}`}
                            </div>
                            {s.status === "REVISI" && s.catatan_revisi && <div className="small text-danger-emphasis mt-1"><i className="bi bi-chat-left-quote me-1"></i>{s.catatan_revisi}</div>}
                          </div>
                          <div className="d-flex flex-wrap gap-1 justify-content-end">
                            <button className="btn btn-sm btn-outline-secondary" onClick={() => setTerbuka((t) => ({ ...t, [s.id_soal]: !t[s.id_soal] }))} aria-label={terbuka[s.id_soal] ? "Tutup pratinjau" : "Lihat soal"}>
                              <i className={`bi ${terbuka[s.id_soal] ? "bi-eye-slash" : "bi-eye"}`}></i></button>
                            {bolehUbah(s) && (s.status !== "DIAJUKAN" || bolehSetujui) && (
                              <button className="btn btn-sm btn-outline-primary" onClick={() => setEditor({ soal: s })} aria-label="Ubah soal"><i className="bi bi-pencil"></i></button>
                            )}
                            {bolehUbah(s) && ["DRAF", "REVISI"].includes(s.status) && (
                              <button className="btn btn-sm btn-outline-warning" onClick={() => minta("POST", "/bank-soal/ajukan", { id_soal: [s.id_soal] }).then(muat).catch((e) => Swal.fire("Gagal", e.message, "error"))}
                                title="Ajukan ke kepala sekolah" aria-label="Ajukan soal"><i className="bi bi-send"></i></button>
                            )}
                            {bolehSetujui && s.status === "DIAJUKAN" && (
                              <button className="btn btn-sm btn-success" onClick={() => minta("POST", "/bank-soal/setujui", { id_soal: [s.id_soal] }).then(muat).catch((e) => Swal.fire("Gagal", e.message, "error"))}
                                aria-label="Setujui soal" title="Setujui"><i className="bi bi-patch-check"></i></button>
                            )}
                            {bolehUbah(s) && s.status === "DIAJUKAN" && !bolehSetujui && (
                              <button className="btn btn-sm btn-outline-secondary" onClick={() => tarik(s)} title="Tarik pengajuan untuk diubah" aria-label="Tarik pengajuan"><i className="bi bi-arrow-return-left"></i></button>
                            )}
                            {bolehUbah(s) && (s.status !== "DISETUJUI" || isPengelola) && (
                              <button className="btn btn-sm btn-outline-danger" onClick={() => hapus(s)} aria-label="Hapus soal"><i className="bi bi-trash"></i></button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

            {data.meta.jumlah_halaman > 1 && (
              <div className="d-flex justify-content-between align-items-center mt-3 small">
                <span className="text-muted">{data.meta.total} soal · halaman {data.meta.halaman} dari {data.meta.jumlah_halaman}</span>
                <div className="btn-group btn-group-sm">
                  <button className="btn btn-outline-secondary" disabled={halaman <= 1} onClick={() => setHalaman((h) => h - 1)} aria-label="Halaman sebelumnya"><i className="bi bi-chevron-left"></i></button>
                  <button className="btn btn-outline-secondary" disabled={halaman >= data.meta.jumlah_halaman} onClick={() => setHalaman((h) => h + 1)} aria-label="Halaman berikutnya"><i className="bi bi-chevron-right"></i></button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {editor && referensi && (
        <EditorSoal soal={editor.soal} referensi={referensi} bawaan={filter.id_mapel ? { id_mapel: filter.id_mapel } : undefined} onTutup={() => setEditor(null)} onTersimpan={() => { setEditor(null); muat(); }} />
      )}
      {drafAi && referensi && (
        <ModalDrafAI referensi={referensi} onTutup={() => setDrafAi(false)}
          onSelesai={() => { setDrafAi(false); ubahFilter({ ...FILTER_AWAL, status: "DRAF", milik: true }); }} />
      )}
    </div>
  );
}
