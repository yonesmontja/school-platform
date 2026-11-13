"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Swal from "sweetalert2";
import { useAkses } from "@/app/lib/akses";
import { minta } from "@/components/banksoal/api";
import Gantt from "@/components/programajar/Gantt";
import { STATUS_TP, ganttPromes, ganttProta, matriksPromes, ringkasProta } from "@/components/programajar/program";
import { csvPromes, csvProta, excelPromes, excelProta, pdfPromes, pdfProta } from "@/components/programajar/ekspor";

const TAB = [
  { id: "promes", label: "Promes", sub: "Program Semester", icon: "bi-bar-chart-steps" },
  { id: "prota", label: "Prota", sub: "Program Tahunan", icon: "bi-calendar-range" },
  { id: "kalender", label: "Minggu Efektif", sub: "Kalender semester", icon: "bi-calendar-week" },
];
const tglId = (s) => new Date(`${s}T00:00`).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });

function Kartu({ ikon, warna, judul, nilai, sub, persen }) {
  return (
    <div className="col-6 col-xl">
      <div className="card pa-stat h-100">
        <div className="card-body d-flex gap-3 align-items-center">
          <span className="pa-stat-ikon" style={{ "--c": warna }}><i className={`bi ${ikon}`}></i></span>
          <div className="min-w-0 flex-grow-1">
            <div className="pa-stat-judul">{judul}</div>
            <div className="pa-stat-nilai">{nilai}</div>
            {persen !== undefined && <div className="progress mt-1" style={{ height: 4 }}><div className="progress-bar" style={{ width: `${persen}%`, background: warna }}></div></div>}
            {sub && <div className="small text-body-secondary text-truncate">{sub}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

function Ringkasan({ r }) {
  return (
    <div className="row g-3 mb-3">
      <Kartu ikon="bi-speedometer2" warna="#206bc4" judul="Ketercapaian JP" nilai={`${r.persen}%`} persen={r.persen} sub={`${r.jp_selesai} dari ${r.jp_rencana} JP rencana`} />
      <Kartu ikon="bi-check2-circle" warna="#2fb344" judul="TP tuntas" nilai={`${r.tp_tuntas} / ${r.tp_total}`} sub="alokasi JP terpenuhi" />
      <Kartu ikon="bi-exclamation-triangle" warna="#d63939" judul="TP terlambat" nilai={r.tp_terlambat} sub="rencana lewat, belum tuntas" />
      <Kartu ikon="bi-calendar-check" warna="#f59f00" judul="Sesi terlaksana" nilai={`${r.sesi_selesai} / ${r.sesi_total}`} sub="sesi jadwal (tanpa yang batal)" />
      <Kartu ikon="bi-calendar-week" warna="#ae3ec9" judul="Minggu efektif" nilai={`${r.minggu_efektif} / ${r.minggu_total}`} sub="minggu kalender" />
    </div>
  );
}

/** Matriks Promes klasik: TP × (bulan, minggu) berisi JP rencana; warna = realisasi. */
function MatriksPromes({ d }) {
  const m = matriksPromes(d);
  const grup = [];
  d.minggu.forEach((w) => { const g = grup[grup.length - 1]; if (g && g.nama === w.nama_bulan) g.n++; else grup.push({ nama: w.nama_bulan, n: 1 }); });
  return (
    <div className="table-responsive pa-matriks">
      <table className="table table-sm table-bordered align-middle mb-0">
        <thead>
          <tr><th rowSpan={2} className="text-center">No</th><th rowSpan={2} style={{ minWidth: 240 }}>Tujuan Pembelajaran</th><th rowSpan={2} className="text-center">JP</th>
            {grup.map((g, i) => <th key={i} colSpan={g.n} className="text-center">{g.nama}</th>)}<th rowSpan={2} className="text-center">Terlaksana</th></tr>
          <tr>{d.minggu.map((w) => <th key={w.mulai} className={`pa-wk${w.efektif ? "" : " te"}`} title={w.ditandai || w.libur.join(", ") || `Minggu efektif ke-${w.ke_efektif}`}>{w.ke_bulan}</th>)}</tr>
        </thead>
        <tbody>
          {m.map(({ b, sel }) => (
            <tr key={b.id}>
              <td className="text-center">{b.no}</td>
              <td><div className="pa-clamp2" title={b.tp}>{b.tp || b.materi}</div><small className="text-body-secondary">{b.materi}</small></td>
              <td className="text-center">{b.alokasi_jp}</td>
              {sel.map((c, i) => {
                const kls = !c.efektif ? "te" : c.realisasi ? "ok" : c.rencana && i < d.minggu_ini && b.status !== "TUNTAS" ? "tl" : c.rencana ? "rc" : "";
                return <td key={i} className={`pa-wk ${kls}`} title={c.realisasi ? `${c.realisasi} JP terlaksana` : c.rencana ? `${c.rencana} JP rencana` : ""}>{c.realisasi ? Math.round(c.realisasi * 10) / 10 : c.rencana || ""}</td>;
              })}
              <td className="text-center fw-semibold">{b.jp_selesai}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr><td colSpan={2} className="fw-semibold">Jumlah</td><td className="text-center fw-semibold">{d.ringkasan.jp_rencana}</td>
            {d.minggu.map((w, i) => <td key={i} className={`pa-wk${w.efektif ? "" : " te"}`}>{m.reduce((n, { sel }) => n + sel[i].rencana, 0) || ""}</td>)}
            <td className="text-center fw-semibold">{d.ringkasan.jp_selesai}</td></tr>
        </tfoot>
      </table>
    </div>
  );
}

function TabelMingguEfektif({ d }) {
  return (
    <div className="table-responsive">
      <table className="table table-sm table-vcenter mb-0">
        <thead><tr><th>Bulan</th><th className="text-center">Jumlah minggu</th><th className="text-center">Tidak efektif</th><th className="text-center">Efektif</th><th>Keterangan</th></tr></thead>
        <tbody>{d.bulan.map((b) => <tr key={b.bulan}><td className="fw-semibold">{b.nama}</td><td className="text-center">{b.jumlah_minggu}</td><td className="text-center">{b.tidak_efektif}</td><td className="text-center">{b.efektif}</td><td className="small text-body-secondary">{b.keterangan.join("; ") || "-"}</td></tr>)}</tbody>
        <tfoot><tr className="fw-semibold"><td>Jumlah</td><td className="text-center">{d.ringkasan.minggu_total}</td><td className="text-center">{d.ringkasan.minggu_total - d.ringkasan.minggu_efektif}</td><td className="text-center">{d.ringkasan.minggu_efektif}</td><td></td></tr></tfoot>
      </table>
    </div>
  );
}

/** Kalender semester: rentang tanggal & minggu tidak efektif (admin/kepala sekolah mengubah, lainnya melihat). */
function KalenderSemester({ d, periode, bolehUbah, onTersimpan }) {
  const [mulai, setMulai] = useState(periode.tanggal_mulai);
  const [selesai, setSelesai] = useState(periode.tanggal_selesai);
  const [tanda, setTanda] = useState(() => Object.fromEntries((periode.minggu_tidak_efektif || []).map((m) => [m.mulai, m.keterangan])));
  const [menyimpan, setMenyimpan] = useState(false);
  useEffect(() => {
    setMulai(periode.tanggal_mulai); setSelesai(periode.tanggal_selesai);
    setTanda(Object.fromEntries((periode.minggu_tidak_efektif || []).map((m) => [m.mulai, m.keterangan])));
  }, [periode]);

  const simpan = async () => {
    const kosong = Object.entries(tanda).find(([, k]) => !k.trim());
    if (kosong) return Swal.fire("Perhatian", "Isi keterangan setiap minggu tidak efektif (mis. MPLS, Asesmen Sumatif, Class meeting).", "warning");
    setMenyimpan(true);
    try {
      const r = await minta("PUT", `/program-ajar/kalender/${periode.id_periode}`, {
        tanggal_mulai: mulai, tanggal_selesai: selesai, minggu_tidak_efektif: Object.entries(tanda).map(([m, k]) => ({ mulai: m, keterangan: k })),
      });
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: r.message, showConfirmButton: false, timer: 2000 });
      onTersimpan();
    } catch (e) { Swal.fire("Gagal", e.message, "error"); } finally { setMenyimpan(false); }
  };

  return (
    <div className="row g-3">
      <div className="col-lg-5">
        <div className="card h-100">
          <div className="card-header"><h3 className="card-title"><i className="bi bi-calendar-range me-2"></i>Rentang semester {periode.semester} {periode.tahun_ajaran}</h3></div>
          <div className="card-body">
            {periode.rentang_bawaan && <div className="alert alert-info small py-2"><i className="bi bi-info-circle me-1"></i>Tanggal belum diatur; dipakai kalender pendidikan umum. {bolehUbah ? "Sesuaikan dengan kalender sekolah lalu simpan." : "Admin atau kepala sekolah dapat menyesuaikannya."}</div>}
            <div className="row g-2 mb-3">
              <div className="col-6"><label className="form-label small fw-semibold" htmlFor="kalMulai">Hari pertama</label><input id="kalMulai" type="date" className="form-control" value={mulai} disabled={!bolehUbah} onChange={(e) => setMulai(e.target.value)} /></div>
              <div className="col-6"><label className="form-label small fw-semibold" htmlFor="kalSelesai">Hari terakhir</label><input id="kalSelesai" type="date" className="form-control" value={selesai} disabled={!bolehUbah} onChange={(e) => setSelesai(e.target.value)} /></div>
            </div>
            <p className="small text-body-secondary mb-3">Minggu efektif = minggu dengan sedikitnya 3 hari sekolah (Senin–Sabtu, di luar <Link href="/dashboard/hari-libur">hari libur</Link>) dan tidak ditandai sebagai minggu tidak efektif. Nomor minggu di kolom &quot;Minggu&quot; ATP dihitung dari minggu efektif ini.</p>
            <TabelMingguEfektif d={d} />
            {bolehUbah && <button type="button" className="btn btn-primary mt-3" onClick={simpan} disabled={menyimpan}>{menyimpan ? <span className="spinner-border spinner-border-sm me-2"></span> : <i className="bi bi-check2 me-1"></i>}Simpan kalender semester</button>}
          </div>
        </div>
      </div>
      <div className="col-lg-7">
        <div className="card h-100">
          <div className="card-header"><h3 className="card-title"><i className="bi bi-calendar-week me-2"></i>Minggu dalam semester</h3></div>
          <div className="list-group list-group-flush pa-minggu-list">
            {d.minggu.map((w) => {
              const ditandai = tanda[w.mulai] !== undefined;
              return (
                <div key={w.mulai} className={`list-group-item d-flex flex-wrap align-items-center gap-2${w.efektif ? "" : " is-off"}`}>
                  <span className={`badge ${w.efektif ? "text-bg-primary" : "text-bg-secondary"} pa-minggu-no`}>{w.efektif ? `E${w.ke_efektif}` : "TE"}</span>
                  <div className="flex-grow-1 min-w-0">
                    <div className="fw-semibold small">{w.nama_bulan} minggu {w.ke_bulan} · {tglId(w.mulai)} – {tglId(w.selesai)}</div>
                    <div className="small text-body-secondary">{w.hari_sekolah} hari sekolah{w.libur.length ? ` · libur: ${w.libur.join(", ")}` : ""}</div>
                  </div>
                  {bolehUbah ? (
                    <div className="d-flex align-items-center gap-2">
                      {ditandai && <input type="text" className="form-control form-control-sm" style={{ width: 190 }} maxLength={120} placeholder="Keterangan (mis. Asesmen Sumatif)" value={tanda[w.mulai]} onChange={(e) => setTanda({ ...tanda, [w.mulai]: e.target.value })} aria-label={`Keterangan minggu ${w.mulai}`} />}
                      <div className="form-check form-switch m-0" title="Tandai minggu tidak efektif">
                        <input className="form-check-input" type="checkbox" checked={ditandai} id={`te-${w.mulai}`}
                          onChange={(e) => { const t = { ...tanda }; if (e.target.checked) t[w.mulai] = ""; else delete t[w.mulai]; setTanda(t); }} />
                        <label className="form-check-label small" htmlFor={`te-${w.mulai}`}>Tidak efektif</label>
                      </div>
                    </div>
                  ) : w.ditandai && <span className="small text-body-secondary">{w.ditandai}</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProgramAjar() {
  const akses = useAkses();
  const cari = useSearchParams();
  const [ref, setRef] = useState(null);
  const [tab, setTab] = useState(TAB.some((t) => t.id === cari.get("tab")) ? cari.get("tab") : "promes");
  const [mapel, setMapel] = useState(cari.get("mapel") || "");
  const [kelas, setKelas] = useState(cari.get("kelas") || "");
  const [idPeriode, setIdPeriode] = useState("");
  const [tahun, setTahun] = useState("");
  const [data, setData] = useState(null);
  const [memuat, setMemuat] = useState(false);
  const [galat, setGalat] = useState(null);
  const [muatUlang, setMuatUlang] = useState(0);
  const [tampil, setTampil] = useState("gantt"); // gantt | matriks

  useEffect(() => {
    minta("GET", "/program-ajar/referensi").then((r) => {
      setRef(r);
      const aktif = r.periode.find((p) => p.status_aktif === "AKTIF") || r.periode[0];
      setIdPeriode((x) => x || aktif?.id_periode || "");
      setTahun((x) => x || aktif?.tahun_ajaran || "");
      setMapel((x) => x || r.mapel_diampu?.[0] || r.subjects[0]?.id_mapel || "");
    }).catch((e) => setGalat(e.message));
  }, []);

  // Simpan pilihan di URL agar bisa dibagikan / dibuka dari detail sesi jadwal
  // (history.replaceState, bukan router.replace: tidak memicu navigasi/pemuatan ulang halaman)
  useEffect(() => {
    if (!ref) return;
    const q = new URLSearchParams({ tab, ...(mapel ? { mapel } : {}), ...(kelas ? { kelas } : {}) });
    const url = `/dashboard/program-ajar?${q}`;
    if (`${window.location.pathname}${window.location.search}` !== url) window.history.replaceState(window.history.state, "", url);
  }, [tab, mapel, kelas, ref]);

  const mode = tab === "prota" ? "prota" : "promes";
  const muat = useCallback(async () => {
    if (!mapel || (mode === "promes" && !idPeriode) || (mode === "prota" && !tahun)) return;
    setMemuat(true); setGalat(null);
    const q = new URLSearchParams({ id_mapel: mapel, ...(kelas ? { id_kelas: kelas } : {}), ...(mode === "promes" ? { id_periode: idPeriode } : { tahun_ajaran: tahun }) });
    try { setData({ mode, isi: await minta("GET", `/program-ajar/${mode}?${q}`) }); } catch (e) { setGalat(e.message); } finally { setMemuat(false); }
  }, [mapel, kelas, idPeriode, tahun, mode]);
  useEffect(() => { muat(); }, [muat, muatUlang]);

  const namaMapel = ref?.subjects.find((s) => s.id_mapel === mapel)?.nama_mapel || "";
  const namaKelas = ref?.classes.find((k) => k.id_kelas === kelas)?.nama_kelas || "";
  const periode = ref?.periode.find((p) => p.id_periode === idPeriode);
  const isi = data?.mode === mode ? data.isi : null;
  const gantt = useMemo(() => (!isi ? null : mode === "prota" ? ganttProta(isi) : ganttPromes(isi)), [isi, mode]);
  const ringkas = isi ? (mode === "prota" ? ringkasProta(isi) : isi.ringkasan) : null;
  const opsiEkspor = { mapel: namaMapel, kelas: namaKelas, sekolah: ref?.settings };
  const adaBaris = isi && (mode === "prota" ? isi.semester.some((d) => d.baris.length) : isi.baris.length);
  const lepas = isi ? (mode === "prota" ? isi.semester.reduce((n, d) => n + d.sesi_lepas.length, 0) : isi.sesi_lepas.length) : 0;

  const ekspor = (jenis) => {
    if (!isi) return;
    if (mode === "prota") ({ xlsx: excelProta, csv: csvProta, pdf: pdfProta })[jenis](isi, opsiEkspor);
    else ({ xlsx: excelPromes, csv: csvPromes, pdf: pdfPromes })[jenis](isi, opsiEkspor);
  };

  const mapelUrut = useMemo(() => {
    if (!ref) return [];
    const diampu = new Set(ref.mapel_diampu || []);
    return [...ref.subjects].sort((a, b) => (diampu.has(b.id_mapel) - diampu.has(a.id_mapel)) || a.nama_mapel.localeCompare(b.nama_mapel));
  }, [ref]);

  return (
    <div className="container-fluid mt-3 mb-5 program-ajar">
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
        <div>
          <div className="text-uppercase small fw-semibold text-body-secondary">Perencanaan pembelajaran</div>
          <h2 className="fw-bold mb-1">Prota &amp; Promes</h2>
          <p className="text-body-secondary small mb-0">Rencana dari ATP, realisasi dari jadwal. Status sesi berubah sendiri mengikuti jam, dan langsung tercermin di sini.</p>
        </div>
        {tab !== "kalender" && (
          <div className="dropdown">
            <button type="button" className="btn btn-primary dropdown-toggle" data-bs-toggle="dropdown" aria-expanded="false" disabled={!isi}><i className="bi bi-download me-1"></i>Ekspor</button>
            <ul className="dropdown-menu dropdown-menu-end">
              <li><button type="button" className="dropdown-item" onClick={() => ekspor("xlsx")}><i className="bi bi-file-earmark-excel text-success me-2"></i>Excel (.xlsx)</button></li>
              <li><button type="button" className="dropdown-item" onClick={() => ekspor("pdf")}><i className="bi bi-file-earmark-pdf text-danger me-2"></i>PDF resmi (kop & tanda tangan)</button></li>
              <li><button type="button" className="dropdown-item" onClick={() => ekspor("csv")}><i className="bi bi-filetype-csv text-primary me-2"></i>CSV</button></li>
            </ul>
          </div>
        )}
      </div>

      <div className="card mb-3">
        <div className="card-body py-2">
          <div className="row g-2 align-items-end">
            <div className="col-md-4 col-lg-3">
              <label className="form-label small fw-semibold mb-1" htmlFor="paMapel">Mata pelajaran</label>
              <select id="paMapel" className="form-select" value={mapel} onChange={(e) => setMapel(e.target.value)} disabled={!ref}>
                {mapelUrut.map((s) => <option key={s.id_mapel} value={s.id_mapel}>{s.nama_mapel}{ref?.mapel_diampu?.includes(s.id_mapel) ? " ★" : ""}</option>)}
              </select>
            </div>
            <div className="col-md-3 col-lg-2">
              <label className="form-label small fw-semibold mb-1" htmlFor="paKelas">Kelas</label>
              <select id="paKelas" className="form-select" value={kelas} onChange={(e) => setKelas(e.target.value)} disabled={!ref}>
                <option value="">Semua kelas</option>
                {ref?.classes.map((k) => <option key={k.id_kelas} value={k.id_kelas}>{k.nama_kelas}</option>)}
              </select>
            </div>
            <div className="col-md-3 col-lg-3">
              {mode === "prota" ? (
                <>
                  <label className="form-label small fw-semibold mb-1" htmlFor="paTahun">Tahun ajaran</label>
                  <select id="paTahun" className="form-select" value={tahun} onChange={(e) => setTahun(e.target.value)} disabled={!ref}>
                    {ref?.tahun_ajaran.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </>
              ) : (
                <>
                  <label className="form-label small fw-semibold mb-1" htmlFor="paPeriode">Semester</label>
                  <select id="paPeriode" className="form-select" value={idPeriode} onChange={(e) => setIdPeriode(e.target.value)} disabled={!ref}>
                    {ref?.periode.map((p) => <option key={p.id_periode} value={p.id_periode}>{p.semester} {p.tahun_ajaran}{p.status_aktif === "AKTIF" ? " (aktif)" : ""}</option>)}
                  </select>
                </>
              )}
            </div>
            <div className="col-lg-4 d-flex justify-content-lg-end">
              <div className="btn-group w-100 w-lg-auto" role="tablist" aria-label="Jenis program">
                {TAB.map((t) => (
                  <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`btn ${tab === t.id ? "btn-primary" : "btn-outline-secondary"}`} onClick={() => setTab(t.id)} title={t.sub}>
                    <i className={`bi ${t.icon} me-1`}></i>{t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {galat && <div className="alert alert-warning">{galat}</div>}
      {(!ref || (memuat && !isi)) && !galat && <div className="text-body-secondary small"><span className="spinner-border spinner-border-sm me-2"></span>Memuat…</div>}

      {isi && tab === "kalender" && periode && (
        <KalenderSemester d={isi} periode={periode} bolehUbah={akses.isAdmin || akses.isKepsek}
          onTersimpan={() => { minta("GET", "/program-ajar/referensi").then(setRef); setMuatUlang((n) => n + 1); }} />
      )}

      {isi && tab !== "kalender" && (
        <div className={memuat ? "opacity-50" : ""}>
          <Ringkasan r={ringkas} />

          {mode === "promes" && !isi.atp && (
            <div className="alert alert-warning d-flex flex-wrap align-items-center gap-2">
              <i className="bi bi-diagram-3 fs-5"></i>
              <div className="flex-grow-1">Belum ada ATP untuk <b>{namaMapel}</b>{namaKelas ? ` ${namaKelas}` : ""} pada semester ini. Promes disusun dari ATP (alokasi JP dan minggu).</div>
              <Link href="/dashboard/perangkat-ajar" className="btn btn-sm btn-warning">Susun ATP</Link>
            </div>
          )}
          {mode === "promes" && isi.atp && isi.atp.status !== "DISETUJUI" && (
            <div className="alert alert-info small py-2"><i className="bi bi-info-circle me-1"></i>Acuan: <b>{isi.atp.judul}</b> masih berstatus {isi.atp.status.toLowerCase()} (belum disetujui kepala sekolah).</div>
          )}
          {lepas > 0 && (
            <div className="alert alert-light border small py-2 d-flex align-items-center gap-2">
              <i className="bi bi-link-45deg fs-5 text-warning"></i>
              <span><b>{lepas} sesi</b> {namaMapel} belum tertaut ke TP mana pun, sehingga belum dihitung sebagai realisasi. Buka sesinya di <Link href="/dashboard/jadwal">Jadwal</Link>, lalu tautkan <b>ATP / TP</b>, indikator, modul ajar, atau materinya.</span>
            </div>
          )}

          <div className="card mb-3">
            <div className="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
              <div>
                <h3 className="card-title mb-0">{mode === "prota" ? `Program Tahunan ${isi.tahun_ajaran}` : `Program Semester ${isi.periode.semester} ${isi.periode.tahun_ajaran}`}</h3>
                <div className="small text-body-secondary">
                  {mode === "promes" ? `${tglId(isi.periode.tanggal_mulai)} – ${tglId(isi.periode.tanggal_selesai)}${isi.atp ? ` · acuan ${isi.atp.judul}` : ""}` : `${namaMapel}${namaKelas ? ` · ${namaKelas}` : ""} · rencana per bulan, Ganjil & Genap`}
                </div>
              </div>
              {mode === "promes" && (
                <div className="btn-group btn-group-sm">
                  <button type="button" className={`btn ${tampil === "gantt" ? "btn-primary" : "btn-outline-secondary"}`} onClick={() => setTampil("gantt")}><i className="bi bi-bar-chart-steps me-1"></i>Gantt</button>
                  <button type="button" className={`btn ${tampil === "matriks" ? "btn-primary" : "btn-outline-secondary"}`} onClick={() => setTampil("matriks")}><i className="bi bi-grid-3x3 me-1"></i>Tabel Promes</button>
                </div>
              )}
            </div>
            {adaBaris ? (
              mode === "promes" && tampil === "matriks"
                ? <MatriksPromes d={isi} />
                : <Gantt kolom={gantt.kolom} baris={gantt.baris} posisiKini={gantt.posisi} lebar={mode === "prota" ? 78 : 34} />
            ) : (
              <div className="card-body text-center text-body-secondary py-5">
                <i className="bi bi-bar-chart-steps fs-1 d-block mb-2 opacity-50"></i>
                Belum ada TP yang direncanakan untuk pilihan ini.
              </div>
            )}
          </div>

          <div className="d-flex flex-wrap gap-3 small text-body-secondary">
            {Object.entries(STATUS_TP).map(([k, s]) => <span key={k}><span className="gantt-status me-1" style={{ "--st": s.warna }}>{s.label}</span>{s.ket}</span>)}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Halaman() {
  return <Suspense fallback={null}><ProgramAjar /></Suspense>;
}
