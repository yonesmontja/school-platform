"use client";
// Rincian Laporan STNKM satu siswa: daftar hari penilaian (record harian) dan seluruh entri yang membentuk angka
// Hari & Entri di tabel Rekapitulasi. Filter (rentang minggu, mapel, sumber STNKM) dibawa dari halaman laporan,
// dan rumusnya sama (components/laporan/stnkmHitung.js), sehingga angkanya selalu cocok.
import { Fragment, Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Swal from "sweetalert2";
import * as XLSX from "xlsx";
import { generateProfessionalPDF } from "@/utils/pdfExport";
import { API_URL } from "@/app/lib/config";
import Pengisi, { teksPengisi } from "@/components/dashboard/Pengisi";
import {
  DIMENSI, DIMENSI_JURNAL, sumberValid, caraValid, labelSumber, pakaiDuaSumbu, konversiJurnal,
  parseYmd, toYmd, seninDari, tanggalMulaiDefault, rataGabungan, rataJurnal, normalisasi, saring, bangunHarian, rekapSiswa,
  kolomTampil, fmt, angkaEkspor,
} from "@/components/laporan/stnkmHitung";

const TEKS_TERTUTUP = "Catatan sensitif: hanya dapat dibaca guru penulis, wali kelas, dan pimpinan sekolah.";
const authHeader = () => ({ Accept: "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` });
const tglPanjang = (t) => parseYmd(t).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const tglPendek = (t) => parseYmd(t).toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const warnaSkor = (v) => (v > 0 ? "text-success" : v < 0 ? "text-danger" : "text-muted");
const nilaiKolom = (r, key) => (key === "rata" ? rataGabungan(r) : key === "rataJurnal" ? rataJurnal(r) : r[key]);
const narasiTeks = (e) => (e.sumber !== "JURNAL" ? "" : e.tersembunyi ? `(${TEKS_TERTUTUP})` : e.narasi || "");
const unduh = (blob, nama) => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nama;
  a.click();
  URL.revokeObjectURL(a.href);
};

export default function RincianSiswaStnkmPage() {
  return <Suspense fallback={null}><RincianSiswa /></Suspense>;
}

function RincianSiswa() {
  const params = useSearchParams();
  const q = {
    id_kelas: params.get("id_kelas") || "", id_periode: params.get("id_periode") || "", id_siswa: params.get("id_siswa") || "",
    mulai: params.get("mulai") || "", dari: +params.get("dari") || 1, sampai: +params.get("sampai") || 0, mapel: params.get("mapel") || "",
  };
  const sumber = sumberValid(params.get("sumber"));
  const cara = caraValid(params.get("cara"));

  const [data, setData] = useState(null);
  const [settings, setSettings] = useState(null);
  const [galat, setGalat] = useState(null);
  const [tab, setTab] = useState("HARI");
  const [terbuka, setTerbuka] = useState(() => new Set());
  const [narasiPenuh, setNarasiPenuh] = useState(() => new Set());

  useEffect(() => {
    if (!localStorage.getItem("token")) { window.location.href = "/login"; return; }
    if (!q.id_kelas || !q.id_periode || !q.id_siswa) { setGalat("Tautan rincian tidak lengkap. Buka dari tabel Rekapitulasi di Laporan STNKM."); return; }
    (async () => {
      try {
        const p = new URLSearchParams({ id_kelas: q.id_kelas, id_periode: q.id_periode, id_siswa: q.id_siswa });
        const [res, resS] = await Promise.all([
          fetch(`${API_URL}/laporan/stnkm/siswa?${p}`, { headers: authHeader() }),
          fetch(`${API_URL}/settings`, { headers: authHeader() }).catch(() => null),
        ]);
        if (res.status === 401) { window.location.href = "/login"; return; }
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.message || `Gagal memuat (HTTP ${res.status})`);
        setData(json);
        if (resS?.ok) setSettings(await resS.json().catch(() => null));
      } catch (e) { setGalat(e.message); }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const siswa = data?.students?.[0];
  const mulai = q.mulai || (data?.periode ? tanggalMulaiDefault(data.periode) : "");
  const senin = useMemo(() => (mulai ? seninDari(parseYmd(mulai)) : null), [mulai]);
  const basis = useMemo(() => (data && senin ? normalisasi(data, senin) : null), [data, senin]);
  const sampai = q.sampai || basis?.maxWk || 1;
  const { harian, entri } = useMemo(() => {
    if (!basis) return { harian: [], entri: [] };
    return bangunHarian(saring(basis, { dari: q.dari, sampai, mapel: q.mapel }), sumber, cara);
  }, [basis, q.dari, sampai, q.mapel, sumber, cara]); // eslint-disable-line react-hooks/exhaustive-deps
  const rekap = useMemo(() => rekapSiswa(harian), [harian]);
  const kolom = useMemo(() => kolomTampil(sumber, cara), [sumber, cara]);
  const duaSumbu = pakaiDuaSumbu(sumber, cara);
  const entriPerHari = useMemo(() => {
    const m = new Map();
    entri.forEach((e) => { if (!m.has(e.tanggal)) m.set(e.tanggal, []); m.get(e.tanggal).push(e); });
    return m;
  }, [entri]);

  const namaMapel = q.mapel ? data?.mapels?.find((m) => m.id_mapel === q.mapel)?.nama_mapel || q.mapel : null;
  const tglMinggu = (wk, akhir = false) => senin && toYmd(new Date(senin.getFullYear(), senin.getMonth(), senin.getDate() + (wk - 1) * 7 + (akhir ? 6 : 0)));
  const labelRentang = senin ? `Wk.${q.dari}–Wk.${sampai} (${parseYmd(tglMinggu(q.dari)).toLocaleDateString("id-ID", { day: "numeric", month: "short" })} – ${parseYmd(tglMinggu(sampai, true)).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })})` : "";
  const teksSumber = `STNKM ${labelSumber(sumber, cara)}`;
  const teksMapel = sumber === "JURNAL" ? "Jurnal (tanpa mapel)" : namaMapel || "Semua mapel";
  const tautanKembali = `/dashboard/laporan-stnkm?${new URLSearchParams({
    id_kelas: q.id_kelas, id_periode: q.id_periode, mulai, dari: q.dari, sampai, ...(q.mapel && { mapel: q.mapel }), sumber, ...(sumber === "LENGKAP" && { cara }),
  })}`;

  // Skor satu dimensi pada sebuah entri: nol berarti tidak dihitung; jurnal pada mode konversi ditampilkan beserta hasil konversinya
  const skorEntri = (e, key) => {
    const v = e[key];
    if (!v) return { teks: "–", redup: true };
    if (e.sumber === "JURNAL" && sumber === "LENGKAP" && cara === "KONVERSI") return { teks: `${fmt(v)} → ${fmt(konversiJurnal(v), 0)}`, nilai: v };
    return { teks: fmt(v), nilai: v };
  };
  const labelSumberEntri = (e) => (e.sumber === "NILAI" ? (e.tipe === "REMEDIAL" ? "Nilai remedial" : "Nilai") : "Jurnal");

  // --- EKSPOR ---
  const barisHari = () => harian.map((h, i) => ({
    No: i + 1, Tanggal: h.tanggal, Hari: parseYmd(h.tanggal).toLocaleDateString("id-ID", { weekday: "long" }), Minggu: `Wk.${h.wk}`,
    ...Object.fromEntries(kolom.map((c) => [c.ekspor || c.label, angkaEkspor(nilaiKolom(h, c.key))])),
    ...(duaSumbu ? Object.fromEntries(DIMENSI_JURNAL.map((d) => [d.label, angkaEkspor(h[d.key])])) : {}),
    "Jumlah Entri": h.entri,
  }));
  const barisEntri = ({ pdf = false } = {}) => entri.map((e, i) => ({
    No: i + 1, Tanggal: e.tanggal, Minggu: `Wk.${e.wk}`, Sumber: labelSumberEntri(e),
    Mapel: e.sumber === "NILAI" ? e.mapel || e.id_mapel : "-", Materi: e.sumber === "NILAI" ? e.materi || "-" : "-",
    Jenis: e.sumber === "NILAI" ? e.jenis || "-" : e.dampak === "BONUS" ? "Intervensi" : "Catatan",
    Nilai: e.sumber === "NILAI" ? e.nilai : "-",
    ...Object.fromEntries(DIMENSI.map((d) => [d.key, e[d.key] ? Number(fmt(e[d.key])) : "-"])),
    ...(sumber === "LENGKAP" && cara === "KONVERSI" ? Object.fromEntries(DIMENSI.map((d) => [`${d.key} (dipakai)`, e.sumbangan[d.key] !== undefined ? Number(fmt(e.sumbangan[d.key])) : "-"])) : {}),
    Metode: e.sumber === "NILAI" ? (e.metode === "MANUAL" ? "Manual" : "Otomatis") : "Skor jurnal",
    Pengisi: teksPengisi(e.pengisi),
    "Catatan / Narasi Jurnal": pdf && narasiTeks(e).length > 400 ? `${narasiTeks(e).slice(0, 399)}…` : narasiTeks(e) || "-",
  }));
  const namaFile = `Rincian_STNKM_${(siswa?.nama_siswa || "Siswa").replace(/[^\w]+/g, "_")}_${labelSumber(sumber, cara).replace(/[^\w]+/g, "_")}_${toYmd(new Date())}`;
  const judulEkspor = (jenis) => `Rincian ${jenis} STNKM · ${siswa?.nama_siswa || ""}${siswa?.nisn ? ` (NISN ${siswa.nisn})` : ""}`;
  const subEkspor = () => [data?.kelas?.nama_kelas, data?.periode ? `${data.periode.tahun_ajaran} (${data.periode.semester})` : null, labelRentang, teksMapel, teksSumber].filter(Boolean).join(" · ");
  const kosong = () => { Swal.fire("Kosong", "Tidak ada data untuk diekspor.", "info"); return true; };

  const eksporExcel = () => {
    if (!entri.length && kosong()) return;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
      { Keterangan: "Siswa", Isi: `${siswa?.nama_siswa || ""}${siswa?.nisn ? ` (NISN ${siswa.nisn})` : ""}` },
      { Keterangan: "Kelas / Periode", Isi: subEkspor() },
      ...kolom.map((c) => ({ Keterangan: c.nama, Isi: angkaEkspor(rekap[c.key]) })),
      { Keterangan: "Hari berdata", Isi: rekap.hari }, { Keterangan: "Jumlah entri", Isi: rekap.entri },
    ]), "Ringkasan");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(barisHari()), `Hari (${harian.length})`);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(barisEntri()), `Entri (${entri.length})`);
    XLSX.writeFile(wb, `${namaFile}.xlsx`);
  };
  const eksporCsv = () => {
    const rows = tab === "HARI" ? barisHari() : barisEntri();
    if (!rows.length && kosong()) return;
    const kepala = Object.keys(rows[0]);
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [kepala.map(esc).join(","), ...rows.map((r) => kepala.map((h) => esc(r[h])).join(","))].join("\r\n");
    unduh(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }), `${namaFile}_${tab === "HARI" ? "Hari" : "Entri"}.csv`);
  };
  const eksporPdf = async () => {
    const rows = tab === "HARI" ? barisHari() : barisEntri({ pdf: true });
    if (!rows.length && kosong()) return;
    const kolomNarasi = tab === "ENTRI" ? { [Object.keys(rows[0]).length - 1]: { cellWidth: 60 } } : {};
    await generateProfessionalPDF(rows, judulEkspor(tab === "HARI" ? `${rows.length} Hari` : `${rows.length} Entri`), settings, null,
      { sub: subEkspor(), columnStyles: kolomNarasi });
  };

  const toggle = (setFn, key) => setFn((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

  if (galat) {
    return (
      <div className="container-fluid mb-5">
        <div className="alert alert-danger mt-3"><i className="bi bi-exclamation-triangle me-2"></i>{galat}</div>
        <Link href="/dashboard/laporan-stnkm" className="btn btn-outline-secondary"><i className="bi bi-arrow-left me-1"></i>Kembali ke Laporan STNKM</Link>
      </div>
    );
  }
  if (!data || !basis) {
    return <div className="text-center py-5 text-muted"><div className="spinner-border text-primary mb-2"></div><div>Memuat rincian siswa...</div></div>;
  }

  return (
    <div className="container-fluid mb-5" data-rincian-stnkm>
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <div>
          <h3 className="fw-bold text-primary mb-0"><i className="bi bi-person-lines-fill me-2"></i>Rincian STNKM Siswa</h3>
          <small className="text-muted">Hari penilaian dan entri yang membentuk rekap siswa</small>
        </div>
        <ol className="breadcrumb mb-0 small">
          <li className="breadcrumb-item"><Link href="/dashboard">Dashboard</Link></li>
          <li className="breadcrumb-item"><Link href={tautanKembali}>Laporan STNKM</Link></li>
          <li className="breadcrumb-item active" aria-current="page">Rincian Siswa</li>
        </ol>
      </div>

      {/* RINGKASAN SISWA + FILTER YANG DIBAWA */}
      <div className="card card-outline card-primary shadow-sm mb-3">
        <div className="card-body">
          <div className="d-flex flex-wrap align-items-start gap-3">
            <div className="me-auto">
              <h4 className="fw-bold mb-0">{siswa?.nama_siswa}</h4>
              <div className="text-muted small">NISN {siswa?.nisn || siswa?.id_siswa} · {data.kelas?.nama_kelas} · {data.periode?.tahun_ajaran} ({data.periode?.semester})</div>
              <div className="d-flex flex-wrap gap-1 mt-2">
                <span className="badge bg-primary-subtle text-primary-emphasis border border-primary-subtle fw-normal"><i className="bi bi-layers me-1"></i>{teksSumber}</span>
                <span className="badge bg-body-secondary text-body-secondary border fw-normal"><i className="bi bi-calendar-range me-1"></i>{labelRentang}</span>
                <span className="badge bg-body-secondary text-body-secondary border fw-normal"><i className="bi bi-book me-1"></i>{teksMapel}</span>
              </div>
            </div>
            <Link href={tautanKembali} className="btn btn-outline-secondary btn-sm"><i className="bi bi-arrow-left me-1"></i>Kembali ke laporan</Link>
          </div>
          <div className="row g-2 mt-2 row-cols-3 row-cols-sm-4 row-cols-lg-6 row-cols-xxl-auto">
            {[...kolom.map((c) => ({ label: c.label, nama: c.nama, teks: fmt(rekap[c.key]), warna: warnaSkor(rekap[c.key]), kuat: c.kuat })),
              { label: "Hari", nama: "Hari berdata", teks: rekap.hari }, { label: "Entri", nama: "Jumlah entri", teks: rekap.entri }].map((t) => (
              <div key={t.label} className="col">
                <div className="border rounded text-center py-2 px-3 h-100" title={t.nama}>
                  <div className="small text-muted">{t.label}</div>
                  <div className={`fs-5 ${t.kuat ? "fw-bold" : "fw-semibold"} ${t.warna || ""}`}>{t.teks}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card card-outline card-secondary shadow-sm">
        <div className="card-header d-flex flex-wrap align-items-center gap-2">
          <ul className="nav nav-pills me-auto" role="tablist">
            <li className="nav-item" role="presentation">
              <button type="button" role="tab" aria-selected={tab === "HARI"} className={`nav-link ${tab === "HARI" ? "active" : ""}`} onClick={() => setTab("HARI")} data-tab-hari>
                <i className="bi bi-calendar-day me-1"></i>Hari <span className="badge text-bg-light border ms-1">{harian.length}</span>
              </button>
            </li>
            <li className="nav-item" role="presentation">
              <button type="button" role="tab" aria-selected={tab === "ENTRI"} className={`nav-link ${tab === "ENTRI" ? "active" : ""}`} onClick={() => setTab("ENTRI")} data-tab-entri>
                <i className="bi bi-list-ul me-1"></i>Entri <span className="badge text-bg-light border ms-1">{entri.length}</span>
              </button>
            </li>
          </ul>
          <div className="btn-group btn-group-sm">
            <button type="button" className="btn btn-outline-success" onClick={eksporExcel} title="Ringkasan, Hari, dan Entri (3 sheet)"><i className="bi bi-file-earmark-excel me-1"></i>Excel</button>
            <button type="button" className="btn btn-outline-secondary" onClick={eksporCsv} title={`Tab ${tab === "HARI" ? "Hari" : "Entri"}`}><i className="bi bi-filetype-csv me-1"></i>CSV</button>
            <button type="button" className="btn btn-outline-danger" onClick={eksporPdf} title={`Tab ${tab === "HARI" ? "Hari" : "Entri"}`}><i className="bi bi-file-earmark-pdf me-1"></i>PDF</button>
          </div>
        </div>
        <div className="card-body">
          {tab === "HARI" ? (
            <>
              <p className="small text-muted">Satu baris per hari penilaian: semua entri pada hari itu dirata-rata per dimensi (nilai nol/kosong tidak dihitung). Klik baris untuk melihat entrinya.</p>
              <div className="table-responsive">
                <table className="table table-hover table-sm align-middle small mb-0" data-tabel-hari>
                  <thead className="table-light">
                    <tr>
                      <th className="text-center">No</th><th>Tanggal</th><th className="text-center">Minggu</th>
                      {kolom.map((c) => <th key={c.key} className="text-center" title={c.nama}>{c.label}</th>)}
                      <th className="text-center">Entri</th><th aria-hidden="true"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {harian.length === 0 && <tr><td colSpan={kolom.length + 5} className="text-center text-muted py-4">Tidak ada hari berdata pada filter ini.</td></tr>}
                    {harian.map((h, i) => {
                      const buka = terbuka.has(h.tanggal);
                      return (
                        <Fragment key={h.tanggal}>
                          <tr role="button" tabIndex={0} aria-expanded={buka} onClick={() => toggle(setTerbuka, h.tanggal)}
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(setTerbuka, h.tanggal); } }}>
                            <td className="text-center text-muted">{i + 1}</td>
                            <td className="text-nowrap">{tglPanjang(h.tanggal)}</td>
                            <td className="text-center text-muted">Wk.{h.wk}</td>
                            {kolom.map((c) => { const v = nilaiKolom(h, c.key); return <td key={c.key} className={`text-center ${c.kuat ? "fw-bold" : ""} ${warnaSkor(v)}`}>{fmt(v)}</td>; })}
                            <td className="text-center"><span className="badge bg-body-secondary text-body-secondary border">{h.entri}</span></td>
                            <td className="text-end text-muted"><i className={`bi ${buka ? "bi-chevron-up" : "bi-chevron-down"}`}></i></td>
                          </tr>
                          {buka && (
                            <tr className="table-light">
                              <td></td>
                              <td colSpan={kolom.length + 4}>
                                <ul className="list-unstyled mb-0 py-1">
                                  {(entriPerHari.get(h.tanggal) || []).map((e) => (
                                    <li key={`${e.sumber}-${e.id}`} className="d-flex flex-wrap gap-2 align-items-baseline py-1 border-bottom">
                                      <span className={`badge fw-normal ${e.sumber === "NILAI" ? "text-bg-primary" : "text-bg-warning"}`}>{labelSumberEntri(e)}</span>
                                      <span className="fw-semibold">{e.sumber === "NILAI" ? `${e.mapel || ""} · ${e.materi || "-"} (${e.jenis || "-"})` : e.dampak === "BONUS" ? "Jurnal · Intervensi" : "Jurnal · Catatan"}</span>
                                      {e.sumber === "NILAI" && <span>Nilai <b>{fmt(e.nilai, 0)}</b></span>}
                                      <span className="text-muted">{DIMENSI.map((d) => `${d.key} ${skorEntri(e, d.key).teks}`).join(" · ")}</span>
                                    </li>
                                  ))}
                                </ul>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <>
              <p className="small text-muted">
                Setiap nilai dan jurnal yang dihitung pada filter ini. Skor bertanda “–” bernilai nol sehingga tidak dihitung.
                {sumber === "LENGKAP" && cara === "KONVERSI" && " Skor jurnal ditampilkan beserta hasil konversinya ke 0–100."}
              </p>
              <div className="table-responsive">
                <table className="table table-hover table-sm align-middle small mb-0" data-tabel-entri>
                  <thead className="table-light">
                    <tr>
                      <th className="text-center">No</th><th>Tanggal</th><th>Sumber</th><th>Mapel · Materi</th><th>Jenis</th>
                      <th className="text-center">Nilai</th>
                      {DIMENSI.map((d) => <th key={d.key} className="text-center" title={d.label}>{d.key}</th>)}
                      <th>Metode</th><th>Pengisi</th><th style={{ minWidth: 220 }}>Catatan / Narasi Jurnal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entri.length === 0 && <tr><td colSpan={14} className="text-center text-muted py-4">Tidak ada entri pada filter ini.</td></tr>}
                    {entri.map((e, i) => {
                      const kunci = `${e.sumber}-${e.id}`;
                      const narasi = narasiTeks(e);
                      const panjang = narasi.length > 160;
                      const penuh = narasiPenuh.has(kunci);
                      return (
                        <tr key={kunci}>
                          <td className="text-center text-muted">{i + 1}</td>
                          <td className="text-nowrap">{tglPendek(e.tanggal)}<div className="text-muted">Wk.{e.wk}</div></td>
                          <td><span className={`badge fw-normal ${e.sumber === "NILAI" ? "text-bg-primary" : "text-bg-warning"}`}>{labelSumberEntri(e)}</span></td>
                          <td>{e.sumber === "NILAI" ? <><div className="fw-semibold">{e.mapel || e.id_mapel}</div><div className="text-muted">{e.materi || "-"}</div></> : <span className="text-muted">–</span>}</td>
                          <td>{e.sumber === "NILAI" ? e.jenis || "-" : e.dampak === "BONUS" ? "Intervensi" : "Catatan"}</td>
                          <td className="text-center fw-semibold">{e.sumber === "NILAI" ? fmt(e.nilai, 0) : "–"}</td>
                          {DIMENSI.map((d) => { const s = skorEntri(e, d.key); return <td key={d.key} className={`text-center text-nowrap ${s.redup ? "text-muted opacity-50" : warnaSkor(s.nilai)}`}>{s.teks}</td>; })}
                          <td className="text-nowrap">{e.sumber === "NILAI" ? (e.metode === "MANUAL" ? "Manual" : "Otomatis") : "Skor jurnal"}</td>
                          <td><Pengisi {...e.pengisi} /></td>
                          <td style={{ whiteSpace: "pre-wrap" }}>
                            {e.sumber !== "JURNAL" ? <span className="text-muted">–</span>
                              : e.tersembunyi ? <span className="badge text-bg-secondary fw-normal text-wrap"><i className="bi bi-lock me-1"></i>{TEKS_TERTUTUP}</span>
                                : (
                                  <>
                                    {panjang && !penuh ? `${narasi.slice(0, 159)}…` : narasi || <span className="text-muted">–</span>}
                                    {panjang && (
                                      <button type="button" className="btn btn-link btn-sm p-0 ms-1 align-baseline" onClick={() => toggle(setNarasiPenuh, kunci)}>
                                        {penuh ? "ringkas" : "selengkapnya"}
                                      </button>
                                    )}
                                  </>
                                )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
