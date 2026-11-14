"use client";

// Paket jadwal dari Promes: pilih mapel–kelas–semester dan jam pelajaran mingguan, sistem menyusun seluruh sesi semester
// menurut ATP & minggu efektif (TP sudah tertaut), lalu guru/admin meninjau dan mengaktifkan.
import { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import { useAkses } from "@/app/lib/akses";
import { kirimAPI, pesanGalat } from "./FormJadwal";

const HARI = [[1, "Senin"], [2, "Selasa"], [3, "Rabu"], [4, "Kamis"], [5, "Jumat"], [6, "Sabtu"]];
const STATUS = {
  BARU: { label: "Baru", kelas: "text-bg-success" },
  BENTROK: { label: "Bentrok", kelas: "text-bg-warning" },
  SUDAH_ADA: { label: "Sudah ada", kelas: "text-bg-secondary" },
};
const tglId = (ymd) => new Date(`${ymd}T00:00`).toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const hariIni = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

/**
 * @param {{awal?: {id_mapel?: string, id_kelas?: string, id_periode?: string}, onClose: Function, onSelesai: Function}} p
 */
export default function PaketJadwal({ awal = {}, onClose, onSelesai }) {
  const { isGuru, idGuru } = useAkses();
  const [ref, setRef] = useState(null);
  const [f, setF] = useState({ id_mapel: awal.id_mapel || "", id_kelas: awal.id_kelas || "", id_periode: awal.id_periode || "", id_guru: "", id_ruangan: "", mulai_dari: hariIni() });
  const [slot, setSlot] = useState([]);
  const [slotDiubah, setSlotDiubah] = useState(false);
  const [info, setInfo] = useState(null); // referensi paket: ATP, rentang semester, saran pola
  const [hasil, setHasil] = useState(null);
  const [pilih, setPilih] = useState(new Set());
  const [sibuk, setSibuk] = useState(false);
  const ubah = (patch) => { setF((x) => ({ ...x, ...patch })); setHasil(null); };

  useEffect(() => {
    Promise.all([kirimAPI("GET", "/program-ajar/referensi"), kirimAPI("GET", "/jadwal/referensi")]).then(([a, b]) => {
      if (!a.ok || !b.ok) return Swal.fire("Gagal memuat data", pesanGalat(a.ok ? b.json : a.json), "error");
      setRef({ ...a.json, teachers: b.json.teachers || [], ruangan: b.json.ruangan || [] });
      const aktif = a.json.periode.find((p) => p.status_aktif === "AKTIF") || a.json.periode[0];
      setF((x) => ({ ...x, id_periode: x.id_periode || aktif?.id_periode || "", id_mapel: x.id_mapel || (isGuru ? a.json.mapel_diampu?.[0] : "") || "" }));
    }).catch((e) => Swal.fire("Gagal", e.message, "error"));
  }, [isGuru]);

  // Guru hanya mapel yang diampunya
  const mapelPilihan = useMemo(() => {
    if (!ref) return [];
    return isGuru ? ref.subjects.filter((s) => (ref.mapel_diampu || []).includes(s.id_mapel)) : ref.subjects;
  }, [ref, isGuru]);

  // Referensi paket tiap kali mapel/kelas/semester berganti: ATP acuan + pola jam yang sudah dipakai
  useEffect(() => {
    if (!f.id_mapel || !f.id_periode) { setInfo(null); return; }
    let batal = false;
    const q = new URLSearchParams({ id_mapel: f.id_mapel, id_periode: f.id_periode, ...(f.id_kelas ? { id_kelas: f.id_kelas } : {}) });
    kirimAPI("GET", `/jadwal/paket/referensi?${q}`).then((r) => {
      if (batal) return;
      if (!r.ok) { setInfo({ galat: pesanGalat(r.json) }); return; }
      setInfo(r.json);
      const s = r.json.saran || {};
      setF((x) => ({
        ...x,
        id_guru: isGuru ? idGuru || "" : s.id_guru_mapel || s.id_guru || "",
        id_ruangan: x.id_ruangan || s.id_ruangan || "",
        mulai_dari: r.json.periode && x.mulai_dari < r.json.periode.mulai ? r.json.periode.mulai : x.mulai_dari,
      }));
      if (!slotDiubah) setSlot((s.slot || []).map(({ hari, mulai, selesai }) => ({ hari, mulai, selesai })));
    }).catch(() => {});
    return () => { batal = true; };
  }, [f.id_mapel, f.id_kelas, f.id_periode]); // eslint-disable-line react-hooks/exhaustive-deps

  const ubahSlot = (i, patch) => { setSlotDiubah(true); setHasil(null); setSlot((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x))); };
  const tambahSlot = () => { setSlotDiubah(true); setHasil(null); setSlot((s) => [...s, { hari: 1, mulai: "07:30", selesai: "08:40" }]); };
  const hapusSlot = (i) => { setSlotDiubah(true); setHasil(null); setSlot((s) => s.filter((_, j) => j !== i)); };
  const jpMinggu = slot.reduce((n, s) => {
    const [a, b] = [s.mulai, s.selesai].map((t) => { const [h, m] = String(t).split(":").map(Number); return h * 60 + m; });
    return n + (b > a ? Math.max(1, Math.round((b - a) / 35)) : 0);
  }, 0);

  const badan = () => ({ ...f, id_kelas: f.id_kelas || null, id_ruangan: f.id_ruangan || null, id_guru: f.id_guru || null, slot });

  const pratinjau = async () => {
    if (!f.id_mapel) return Swal.fire("Perhatian", "Pilih mata pelajaran.", "warning");
    if (!slot.length) return Swal.fire("Perhatian", "Isi minimal satu jam pelajaran mingguan.", "warning");
    setSibuk(true);
    try {
      const r = await kirimAPI("POST", "/jadwal/paket/pratinjau", badan());
      if (!r.ok) return Swal.fire("Belum bisa disusun", pesanGalat(r.json), "warning");
      setHasil(r.json);
      setPilih(new Set(r.json.sesi.filter((s) => s.status === "BARU").map((s) => s.kunci)));
    } finally { setSibuk(false); }
  };

  const aktifkan = async () => {
    if (!pilih.size) return Swal.fire("Perhatian", "Centang minimal satu sesi.", "warning");
    const bentrok = hasil.sesi.filter((s) => pilih.has(s.kunci) && s.status === "BENTROK").length;
    const ok = await Swal.fire({
      title: `Aktifkan ${pilih.size} sesi?`,
      html: `Sesi dibuat di kalender sebagai satu rangkaian (bisa diubah atau dihapus sekaligus).${bentrok ? `<br><b>${bentrok} sesi bentrok</b> ikut dibuat.` : ""}`,
      icon: "question", showCancelButton: true, confirmButtonText: "Aktifkan", cancelButtonText: "Batal",
    });
    if (!ok.isConfirmed) return;
    setSibuk(true);
    try {
      const r = await kirimAPI("POST", "/jadwal/paket/aktifkan", { ...badan(), pilih: [...pilih] });
      if (!r.ok) return Swal.fire("Gagal", pesanGalat(r.json), "error");
      onSelesai?.(r.json);
    } finally { setSibuk(false); }
  };

  const toggle = (k) => setPilih((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const bolehPilih = (s) => s.status !== "SUDAH_ADA";
  const semuaPilihan = hasil ? hasil.sesi.filter(bolehPilih).map((s) => s.kunci) : [];

  return (
    <>
      <div className="modal fade show d-block" tabIndex="-1" role="dialog" aria-modal="true" aria-labelledby="judulPaket" onClick={(e) => e.target === e.currentTarget && !sibuk && onClose()}>
        <div className="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable">
          <div className="modal-content border-0 shadow rounded-4">
            <div className="modal-header border-0 pb-0">
              <h5 className="modal-title fw-bold" id="judulPaket"><i className="bi bi-box-seam me-2 text-primary"></i>Paket jadwal dari Promes</h5>
              <button type="button" className="btn-close" onClick={onClose} disabled={sibuk} aria-label="Tutup"></button>
            </div>
            <div className="modal-body">
              <p className="small text-body-secondary">Sistem menyusun sesi semester dari ATP dan minggu efektif Prota/Promes: TP yang direncanakan di minggu itu langsung tertaut ke sesinya. Hari libur dan minggu tidak efektif dilewati; sesi yang sudah ada tidak digandakan.</p>

              <div className="row g-3">
                <div className="col-md-4">
                  <label className="form-label small fw-semibold mb-1" htmlFor="pkMapel">Mata pelajaran</label>
                  <select id="pkMapel" className="form-select" value={f.id_mapel} onChange={(e) => { setSlotDiubah(false); ubah({ id_mapel: e.target.value }); }} disabled={!ref}>
                    <option value="">— Pilih mapel —</option>
                    {mapelPilihan.map((s) => <option key={s.id_mapel} value={s.id_mapel}>{s.nama_mapel}</option>)}
                  </select>
                </div>
                <div className="col-md-4">
                  <label className="form-label small fw-semibold mb-1" htmlFor="pkKelas">Kelas</label>
                  <select id="pkKelas" className="form-select" value={f.id_kelas} onChange={(e) => { setSlotDiubah(false); ubah({ id_kelas: e.target.value }); }} disabled={!ref}>
                    <option value="">— Semua / tanpa kelas —</option>
                    {(ref?.classes || []).map((k) => <option key={k.id_kelas} value={k.id_kelas}>{k.nama_kelas}</option>)}
                  </select>
                </div>
                <div className="col-md-4">
                  <label className="form-label small fw-semibold mb-1" htmlFor="pkPeriode">Semester</label>
                  <select id="pkPeriode" className="form-select" value={f.id_periode} onChange={(e) => ubah({ id_periode: e.target.value })} disabled={!ref}>
                    {(ref?.periode || []).map((p) => <option key={p.id_periode} value={p.id_periode}>{p.semester} {p.tahun_ajaran}{p.status_aktif === "AKTIF" ? " (aktif)" : ""}</option>)}
                  </select>
                </div>
                <div className="col-md-4">
                  <label className="form-label small fw-semibold mb-1" htmlFor="pkGuru">Guru</label>
                  <select id="pkGuru" className="form-select" value={f.id_guru} onChange={(e) => ubah({ id_guru: e.target.value })} disabled={isGuru}>
                    <option value="">— Guru pengampu mapel —</option>
                    {(ref?.teachers || []).map((t) => <option key={t.id_guru} value={t.id_guru}>{t.nama_guru}</option>)}
                  </select>
                </div>
                <div className="col-md-4">
                  <label className="form-label small fw-semibold mb-1" htmlFor="pkRuang">Ruangan</label>
                  <select id="pkRuang" className="form-select" value={f.id_ruangan} onChange={(e) => ubah({ id_ruangan: e.target.value })}>
                    <option value="">— Tanpa ruangan —</option>
                    {(ref?.ruangan || []).map((r) => <option key={r.id_ruangan} value={r.id_ruangan}>{r.nama_ruangan}</option>)}
                  </select>
                </div>
                <div className="col-md-4">
                  <label className="form-label small fw-semibold mb-1" htmlFor="pkDari">Mulai dari tanggal</label>
                  <input id="pkDari" type="date" className="form-control" value={f.mulai_dari} min={info?.periode?.mulai} max={info?.periode?.selesai} onChange={(e) => ubah({ mulai_dari: e.target.value })} />
                </div>
              </div>

              {info?.galat && <div className="alert alert-danger small mt-3 mb-0">{info.galat}</div>}
              {info && !info.galat && (info.atp ? (
                <div className="alert alert-light border small mt-3 mb-0 d-flex flex-wrap gap-3">
                  <span><i className="bi bi-diagram-3 me-1 text-primary"></i>ATP acuan: <b>{info.atp.judul}</b>{info.atp.status !== "DISETUJUI" && <span className="badge text-bg-warning ms-1">{info.atp.status === "DIAJUKAN" ? "Menunggu persetujuan" : "Draf"}</span>}</span>
                  <span>{info.atp.jumlah_tp} TP · {info.atp.total_jp} JP</span>
                  {info.atp.jp_per_minggu ? <span>Rencana {info.atp.jp_per_minggu} JP/minggu</span> : null}
                  <span>Semester {tglId(info.periode.mulai)} – {tglId(info.periode.selesai)}</span>
                </div>
              ) : (
                <div className="alert alert-warning small mt-3 mb-0"><i className="bi bi-exclamation-triangle me-1"></i>Belum ada ATP untuk mapel, kelas, dan semester ini. <a href="/dashboard/perangkat-ajar">Susun ATP di Perangkat Ajar</a> terlebih dahulu.</div>
              ))}

              <div className="mt-3">
                <div className="d-flex align-items-center mb-2">
                  <span className="small fw-semibold"><i className="bi bi-clock me-1"></i>Jam pelajaran mingguan</span>
                  <span className={`badge ms-2 ${info?.atp?.jp_per_minggu && jpMinggu < info.atp.jp_per_minggu ? "text-bg-warning" : "text-bg-light border"}`}>{jpMinggu} JP/minggu</span>
                  <button type="button" className="btn btn-sm btn-outline-primary ms-auto" onClick={tambahSlot} disabled={slot.length >= 10}><i className="bi bi-plus-lg me-1"></i>Tambah jam</button>
                </div>
                {!slot.length && <div className="small text-body-secondary">Belum ada jam. Tambahkan hari dan jam pelajaran mapel ini setiap minggu{f.id_mapel ? "" : " (pilih mapel dulu)"}.</div>}
                {slot.map((s, i) => (
                  <div key={i} className="d-flex flex-wrap gap-2 align-items-center mb-2">
                    <select className="form-select form-select-sm" style={{ maxWidth: 140 }} aria-label={`Hari jam ${i + 1}`} value={s.hari} onChange={(e) => ubahSlot(i, { hari: Number(e.target.value) })}>
                      {HARI.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                    <input type="time" className="form-control form-control-sm" style={{ maxWidth: 120 }} aria-label={`Mulai jam ${i + 1}`} value={s.mulai} onChange={(e) => ubahSlot(i, { mulai: e.target.value })} />
                    <span className="small">–</span>
                    <input type="time" className="form-control form-control-sm" style={{ maxWidth: 120 }} aria-label={`Selesai jam ${i + 1}`} value={s.selesai} onChange={(e) => ubahSlot(i, { selesai: e.target.value })} />
                    <button type="button" className="btn btn-sm btn-link text-danger" onClick={() => hapusSlot(i)} aria-label={`Hapus jam ${i + 1}`}><i className="bi bi-trash"></i></button>
                  </div>
                ))}
              </div>

              {hasil && (
                <div className="mt-3">
                  <div className="d-flex flex-wrap gap-2 mb-2 small">
                    <span className="badge text-bg-success">{hasil.ringkasan.baru} baru</span>
                    {hasil.ringkasan.bentrok > 0 && <span className="badge text-bg-warning">{hasil.ringkasan.bentrok} bentrok</span>}
                    {hasil.ringkasan.sudah_ada > 0 && <span className="badge text-bg-secondary">{hasil.ringkasan.sudah_ada} sudah ada</span>}
                    <span className="badge text-bg-light border">{hasil.ringkasan.jp_paket} JP paket · rencana ATP {hasil.ringkasan.jp_rencana} JP</span>
                    {hasil.libur.length > 0 && <span className="badge text-bg-light border" title={hasil.libur.join("\n")}>{hasil.libur.length} tanggal libur dilewati</span>}
                  </div>
                  {hasil.tp_kurang.length > 0 && (
                    <div className="alert alert-warning small py-2">
                      <b>{hasil.tp_kurang.length} TP belum mendapat cukup jam</b> (jam mingguan kurang, atau minggu rencananya sudah lewat):
                      <ul className="mb-0 ps-3">{hasil.tp_kurang.slice(0, 5).map((t) => <li key={t.no}>TP {t.no}: {t.tp} — kurang {t.kurang_jp} JP</li>)}</ul>
                    </div>
                  )}
                  {hasil.sesi.length === 0 ? <div className="text-body-secondary small">Tidak ada sesi yang perlu dibuat dalam rentang ini.</div> : (
                    <div className="table-responsive" style={{ maxHeight: 360 }}>
                      <table className="table table-sm align-middle small mb-0">
                        <thead className="sticky-top bg-body">
                          <tr>
                            <th style={{ width: 32 }}><input type="checkbox" className="form-check-input" aria-label="Pilih semua sesi" checked={semuaPilihan.length > 0 && semuaPilihan.every((k) => pilih.has(k))} onChange={(e) => setPilih(new Set(e.target.checked ? semuaPilihan : []))} /></th>
                            <th>Tanggal</th><th>Jam</th><th>Minggu</th><th>TP / materi</th><th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {hasil.sesi.map((s) => (
                            <tr key={s.kunci} className={s.status === "SUDAH_ADA" ? "text-body-secondary" : ""}>
                              <td><input type="checkbox" className="form-check-input" aria-label={`Pilih sesi ${s.tanggal} ${s.mulai}`} disabled={!bolehPilih(s)} checked={pilih.has(s.kunci)} onChange={() => toggle(s.kunci)} /></td>
                              <td className="text-nowrap">{tglId(s.tanggal)}</td>
                              <td className="text-nowrap">{s.mulai}–{s.selesai} <span className="text-body-secondary">({s.jp} JP)</span></td>
                              <td className="text-nowrap">ke-{s.minggu_ke}</td>
                              <td>{s.tp ? <><b>TP {s.tp.no}</b> {s.tp.tp}{s.tp.materi ? <div className="text-body-secondary">{s.tp.materi}</div> : null}</> : <i className="text-body-secondary">{s.status === "SUDAH_ADA" ? "—" : "Tanpa TP (cadangan / asesmen)"}</i>}</td>
                              <td><span className={`badge ${STATUS[s.status].kelas}`}>{STATUS[s.status].label}</span>{s.keterangan && <div className="text-body-secondary">{s.keterangan}</div>}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="modal-footer border-0">
              <button type="button" className="btn btn-light" onClick={onClose} disabled={sibuk}>Tutup</button>
              <button type="button" className="btn btn-outline-primary" onClick={pratinjau} disabled={sibuk || !info?.atp || !slot.length}>
                {sibuk && !hasil ? <span className="spinner-border spinner-border-sm me-2"></span> : <i className="bi bi-eye me-1"></i>}{hasil ? "Susun ulang" : "Pratinjau paket"}
              </button>
              {hasil && (
                <button type="button" className="btn btn-primary fw-semibold" onClick={aktifkan} disabled={sibuk || !pilih.size}>
                  {sibuk ? <span className="spinner-border spinner-border-sm me-2"></span> : <i className="bi bi-check2-circle me-1"></i>}Aktifkan {pilih.size} sesi
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="modal-backdrop fade show"></div>
    </>
  );
}
