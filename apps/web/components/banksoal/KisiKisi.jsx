"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import jsPDF from "jspdf";
import { ATAS_ISI, gayaTabelResmi, kopPdf, muatSekolah, selesaikanPdf, teksPdf, ttdPdf } from "@/utils/pdfResmi";
import autoTable from "jspdf-autotable";
import { BENTUK, DIMENSI, KESULITAN, LEVEL, STATUS, labelBentuk } from "./konstanta";
import ModalDrafAI from "./ModalDrafAI";
import { minta } from "./api";

const barisBaru = () => ({ id_materi: "", id_indikator: "", bentuk: "PG", level_kognitif: "C2", tingkat_kesulitan: "SEDANG", dimensi: "T", jumlah: 2 });

/** Tab Kisi-kisi: daftar kisi-kisi guru, editor baris per TP, dan pembuatan soal per baris dengan AI. */
export default function KisiKisi({ referensi, onSoalBerubah }) {
  const [daftar, setDaftar] = useState([]);
  const [aktif, setAktif] = useState(null); // kisi yang sedang dibuka (dengan baris & soalnya)
  const [form, setForm] = useState(null);   // kisi yang sedang diedit
  const [drafBaris, setDrafBaris] = useState(null);
  const [memuat, setMemuat] = useState(true);

  const muat = useCallback(async () => {
    try { setDaftar((await minta("GET", "/kisi-kisi")).data); }
    catch (err) { Swal.fire("Gagal memuat", err.message, "error"); }
    finally { setMemuat(false); }
  }, []);
  useEffect(() => { muat(); }, [muat]);

  const buka = async (id) => {
    try { setAktif((await minta("GET", `/kisi-kisi/${id}`)).data); }
    catch (err) { Swal.fire("Gagal memuat", err.message, "error"); }
  };

  const ubah = (k) => setForm(k ? {
    id_kisi: k.id_kisi, judul: k.judul, id_mapel: k.id_mapel, id_kelas: k.id_kelas || "", catatan: k.catatan || "",
    baris: k.baris.map((b) => ({ id: b.id, id_materi: b.id_materi || "", id_indikator: b.id_indikator || "", bentuk: b.bentuk, level_kognitif: b.level_kognitif, tingkat_kesulitan: b.tingkat_kesulitan, dimensi: b.dimensi || "", jumlah: b.jumlah })),
  } : { judul: "", id_mapel: referensi.mapel[0]?.id_mapel || "", id_kelas: "", catatan: "", baris: [barisBaru()] });

  const simpan = async (e) => {
    e.preventDefault();
    try {
      const body = { ...form, id_kelas: form.id_kelas || null, baris: form.baris.map((b) => ({ ...b, id_materi: b.id_materi || null, id_indikator: b.id_indikator || null, dimensi: b.dimensi || null })) };
      const data = form.id_kisi ? await minta("PUT", `/kisi-kisi/${form.id_kisi}`, body) : await minta("POST", "/kisi-kisi", body);
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: data.message, showConfirmButton: false, timer: 2000 });
      setForm(null);
      await muat();
      buka(data.data.id_kisi);
    } catch (err) { Swal.fire("Belum bisa disimpan", err.message, "warning"); }
  };

  const hapus = async (k) => {
    const ok = await Swal.fire({ title: "Hapus kisi-kisi?", text: "Soal yang sudah dibuat tetap ada di bank soal.", icon: "warning", showCancelButton: true, confirmButtonText: "Hapus", cancelButtonText: "Batal", confirmButtonColor: "#dc3545" });
    if (!ok.isConfirmed) return;
    try { await minta("DELETE", `/kisi-kisi/${k.id_kisi}`); setAktif(null); muat(); }
    catch (err) { Swal.fire("Gagal", err.message, "error"); }
  };

  const unduhPdf = async (k) => {
    const sek = await muatSekolah();
    const doc = new jsPDF("landscape", "mm", "a4");
    const judul = `Kisi-kisi Soal: ${k.judul}`;
    const sub = `${k.mapel?.nama_mapel || ""}${k.kelas ? ` | Kelas ${k.kelas.nama_kelas}` : ""}`;
    kopPdf(doc, sek, { judul, sub });
    autoTable(doc, {
      ...gayaTabelResmi, startY: ATAS_ISI, styles: { ...gayaTabelResmi.styles, fontSize: 9 },
      head: [["No", "Materi", "Tujuan pembelajaran", "Bentuk", "Level", "Kesulitan", "Dimensi", "Jumlah", "Nomor soal"]],
      body: (() => {
        let no = 1;
        return k.baris.map((b, i) => {
          const nomor = b.jumlah > 1 ? `${no}-${no + b.jumlah - 1}` : `${no}`;
          no += b.jumlah;
          return [i + 1, b.materi?.nama_materi || "-", b.indikator?.deskripsi || "-", labelBentuk(b.bentuk), b.level_kognitif, b.tingkat_kesulitan, b.dimensi || "-", b.jumlah, nomor].map(teksPdf);
        });
      })(),
    });
    ttdPdf(doc, sek, doc.lastAutoTable.finalY + 12, { kanan: { jabatan: "Guru Mata Pelajaran", nama: k.pembuat?.name } });
    selesaikanPdf(doc, sek, { judul, sub });
    doc.save(`Kisi-kisi_${k.judul}.pdf`.replace(/[^\w.\-]+/g, "_"));
  };

  // Sebaran rencana soal per level kognitif dan dimensi STNKM, agar kisi-kisi seimbang
  const sebaran = useMemo(() => {
    const b = form?.baris || aktif?.baris || [];
    const total = b.reduce((a, x) => a + Number(x.jumlah || 0), 0);
    const hitung = (kunci, nilai) => b.filter((x) => x[kunci] === nilai).reduce((a, x) => a + Number(x.jumlah || 0), 0);
    return { total, level: LEVEL.map((l) => [l.value, hitung("level_kognitif", l.value)]), dimensi: DIMENSI.map((d) => [d.key, hitung("dimensi", d.key)]) };
  }, [form, aktif]);

  const RingkasSebaran = () => (
    <div className="d-flex flex-wrap gap-3 small mb-3">
      <span><b>{sebaran.total}</b> soal direncanakan</span>
      <span className="d-flex flex-wrap gap-1 align-items-center">Level: {sebaran.level.filter(([, n]) => n).map(([l, n]) => <span key={l} className="badge text-bg-light border">{l} {n}</span>)}</span>
      <span className="d-flex flex-wrap gap-1 align-items-center">STNKM: {sebaran.dimensi.filter(([, n]) => n).map(([d, n]) => {
        const w = DIMENSI.find((x) => x.key === d).warna;
        return <span key={d} className={`badge bg-${w}-subtle text-${w}-emphasis border`}>{d} {n}</span>;
      })}</span>
    </div>
  );

  // ===== Editor =====
  if (form) {
    const materiMapel = (referensi.materi || []).filter((m) => m.id_mapel === form.id_mapel && (!form.id_kelas || !m.id_kelas || m.id_kelas === form.id_kelas));
    const setB = (i, k, v) => setForm((x) => ({ ...x, baris: x.baris.map((b, j) => (j === i ? { ...b, [k]: v, ...(k === "id_materi" ? { id_indikator: "" } : {}) } : b)) }));
    return (
      <form className="card shadow-sm" onSubmit={simpan}>
        <div className="card-header"><h3 className="card-title fw-semibold mb-0"><i className="bi bi-grid-3x3 me-2"></i>{form.id_kisi ? "Ubah Kisi-kisi" : "Kisi-kisi Baru"}</h3></div>
        <div className="card-body">
          <div className="row g-2 mb-3">
            <div className="col-md-5"><label className="form-label small fw-semibold mb-1">Judul</label>
              <input className="form-control form-control-sm" required value={form.judul} onChange={(e) => setForm({ ...form, judul: e.target.value })} placeholder="mis. Ulangan Harian Pecahan" aria-label="Judul kisi-kisi" /></div>
            <div className="col-md-4"><label className="form-label small fw-semibold mb-1">Mata pelajaran</label>
              <select className="form-select form-select-sm" value={form.id_mapel} onChange={(e) => setForm({ ...form, id_mapel: e.target.value, baris: form.baris.map((b) => ({ ...b, id_materi: "", id_indikator: "" })) })}>
                {referensi.mapel.map((m) => <option key={m.id_mapel} value={m.id_mapel}>{m.nama_mapel}</option>)}
              </select></div>
            <div className="col-md-3"><label className="form-label small fw-semibold mb-1">Kelas</label>
              <select className="form-select form-select-sm" value={form.id_kelas} onChange={(e) => setForm({ ...form, id_kelas: e.target.value })}>
                <option value="">Semua kelas</option>
                {referensi.kelas.map((k) => <option key={k.id_kelas} value={k.id_kelas}>{k.nama_kelas}</option>)}
              </select></div>
          </div>
          <RingkasSebaran />
          <div className="table-responsive">
            <table className="table table-sm align-middle">
              <thead className="table-light"><tr><th>Materi</th><th>Tujuan pembelajaran</th><th>Bentuk</th><th>Level</th><th>Kesulitan</th><th>Dimensi</th><th style={{ width: 80 }}>Jumlah</th><th></th></tr></thead>
              <tbody>
                {form.baris.map((b, i) => {
                  const tp = materiMapel.find((m) => m.id_materi === b.id_materi)?.indikator || [];
                  return (
                    <tr key={i}>
                      <td style={{ minWidth: 160 }}><select className="form-select form-select-sm" value={b.id_materi} onChange={(e) => setB(i, "id_materi", e.target.value)} aria-label={`Materi baris ${i + 1}`}>
                        <option value="">—</option>{materiMapel.map((m) => <option key={m.id_materi} value={m.id_materi}>{m.nama_materi}</option>)}</select></td>
                      <td style={{ minWidth: 220 }}><select className="form-select form-select-sm" value={b.id_indikator} onChange={(e) => setB(i, "id_indikator", e.target.value)} disabled={!tp.length} aria-label={`TP baris ${i + 1}`}>
                        <option value="">{tp.length ? "—" : "Belum ada TP"}</option>{tp.map((t) => <option key={t.id_indikator} value={t.id_indikator}>{t.deskripsi}</option>)}</select></td>
                      <td><select className="form-select form-select-sm" value={b.bentuk} onChange={(e) => setB(i, "bentuk", e.target.value)} aria-label={`Bentuk baris ${i + 1}`}>
                        {BENTUK.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</select></td>
                      <td><select className="form-select form-select-sm" value={b.level_kognitif} onChange={(e) => setB(i, "level_kognitif", e.target.value)}>
                        {LEVEL.map((x) => <option key={x.value} value={x.value}>{x.value}</option>)}</select></td>
                      <td><select className="form-select form-select-sm" value={b.tingkat_kesulitan} onChange={(e) => setB(i, "tingkat_kesulitan", e.target.value)}>
                        {KESULITAN.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</select></td>
                      <td><select className="form-select form-select-sm" value={b.dimensi} onChange={(e) => setB(i, "dimensi", e.target.value)} title="Dimensi STNKM yang ditonjolkan">
                        <option value="">—</option>{DIMENSI.map((d) => <option key={d.key} value={d.key}>{d.key}</option>)}</select></td>
                      <td><input type="number" className="form-control form-control-sm" min={1} max={50} value={b.jumlah} onChange={(e) => setB(i, "jumlah", Number(e.target.value) || 1)} aria-label={`Jumlah baris ${i + 1}`} /></td>
                      <td><button type="button" className="btn btn-sm btn-outline-secondary" aria-label="Hapus baris" disabled={form.baris.length <= 1}
                        onClick={() => setForm((x) => ({ ...x, baris: x.baris.filter((_, j) => j !== i) }))}><i className="bi bi-x"></i></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => setForm((x) => ({ ...x, baris: [...x.baris, { ...barisBaru(), id_materi: x.baris.at(-1)?.id_materi || "" }] }))}>
            <i className="bi bi-plus-lg me-1"></i>Tambah baris</button>
          <div className="small text-muted mt-2"><i className="bi bi-info-circle me-1"></i>Satu baris = sekelompok soal untuk satu TP dengan bentuk, level kognitif, dan dimensi STNKM yang sama.</div>
        </div>
        <div className="card-footer d-flex gap-2 justify-content-end">
          <button type="button" className="btn btn-outline-secondary" onClick={() => setForm(null)}>Batal</button>
          <button type="submit" className="btn btn-primary fw-semibold"><i className="bi bi-floppy me-1"></i>Simpan kisi-kisi</button>
        </div>
      </form>
    );
  }

  // ===== Satu kisi-kisi =====
  if (aktif) {
    return (
      <div className="card shadow-sm">
        <div className="card-header d-flex flex-wrap align-items-center gap-2">
          <button className="btn btn-sm btn-link px-0 me-1" onClick={() => setAktif(null)} aria-label="Kembali ke daftar kisi-kisi"><i className="bi bi-arrow-left"></i></button>
          <h3 className="card-title fw-semibold mb-0 me-auto">{aktif.judul} <span className="text-muted fw-normal small">{aktif.mapel?.nama_mapel}{aktif.kelas && ` · ${aktif.kelas.nama_kelas}`}</span></h3>
          <button className="btn btn-sm btn-outline-secondary" onClick={() => unduhPdf(aktif)}><i className="bi bi-file-earmark-pdf me-1"></i>PDF</button>
          <button className="btn btn-sm btn-outline-primary" onClick={() => ubah(aktif)}><i className="bi bi-pencil me-1"></i>Ubah</button>
          <button className="btn btn-sm btn-outline-danger" onClick={() => hapus(aktif)} aria-label="Hapus kisi-kisi"><i className="bi bi-trash"></i></button>
        </div>
        <div className="card-body">
          <RingkasSebaran />
          <div className="table-responsive">
            <table className="table table-sm align-middle">
              <thead className="table-light"><tr><th>TP</th><th>Bentuk</th><th>Level</th><th>Dimensi</th><th>Soal</th><th></th></tr></thead>
              <tbody>
                {aktif.baris.map((b) => {
                  const kurang = b.jumlah - b.soal.length;
                  return (
                    <tr key={b.id}>
                      <td><div className="small fw-semibold">{b.indikator?.deskripsi || "-"}</div><div className="small text-muted">{b.materi?.nama_materi}</div></td>
                      <td className="small">{labelBentuk(b.bentuk)}</td>
                      <td className="small">{b.level_kognitif} · {b.tingkat_kesulitan.toLowerCase()}</td>
                      <td className="small">{b.dimensi || "-"}</td>
                      <td className="small">
                        <span className={kurang > 0 ? "text-warning-emphasis" : "text-success"}>{b.soal.length}/{b.jumlah}</span>
                        <span className="ms-1">{Object.entries(b.soal.reduce((a, s) => ({ ...a, [s.status]: (a[s.status] || 0) + 1 }), {})).map(([st, n]) => (
                          <span key={st} className={`badge text-bg-${STATUS[st].warna} ms-1 fw-normal`} title={STATUS[st].label}>{n}</span>
                        ))}</span>
                      </td>
                      <td className="text-end">
                        <button className="btn btn-sm btn-primary text-nowrap" onClick={() => setDrafBaris(b)} disabled={kurang <= 0} title={kurang <= 0 ? "Jumlah soal sudah terpenuhi" : ""}>
                          <i className="bi bi-magic me-1"></i>Buat dengan AI</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        {drafBaris && (
          <ModalDrafAI referensi={referensi} baris={drafBaris} kisi={aktif} onTutup={() => setDrafBaris(null)}
            onSelesai={() => { setDrafBaris(null); buka(aktif.id_kisi); onSoalBerubah?.(); }} />
        )}
      </div>
    );
  }

  // ===== Daftar =====
  return (
    <div className="card shadow-sm">
      <div className="card-header d-flex align-items-center">
        <h3 className="card-title fw-semibold mb-0 me-auto"><i className="bi bi-grid-3x3 me-2"></i>Kisi-kisi Soal</h3>
        <button className="btn btn-sm btn-primary" onClick={() => ubah(null)} disabled={!referensi.mapel.length}><i className="bi bi-plus-lg me-1"></i>Kisi-kisi baru</button>
      </div>
      <div className="card-body">
        {memuat ? <div className="text-muted small"><span className="spinner-border spinner-border-sm me-2"></span>Memuat…</div>
          : !daftar.length ? (
            <div className="text-center text-muted py-4">
              <i className="bi bi-grid-3x3 fs-1 d-block mb-2"></i>Belum ada kisi-kisi. Mulai dengan menentukan TP, bentuk soal, level kognitif, dan dimensi STNKM yang ingin diukur.
            </div>
          ) : (
            <div className="list-group">
              {daftar.map((k) => (
                <button key={k.id_kisi} type="button" className="list-group-item list-group-item-action d-flex flex-wrap align-items-center gap-2" onClick={() => buka(k.id_kisi)}>
                  <span className="fw-semibold me-auto">{k.judul}</span>
                  <span className="small text-muted">{k.mapel?.nama_mapel}{k.kelas && ` · ${k.kelas.nama_kelas}`} · {Number(k.jumlah_soal_rencana) || 0} soal{k.pembuat && ` · ${k.pembuat.name}`}</span>
                  <i className="bi bi-chevron-right text-muted"></i>
                </button>
              ))}
            </div>
          )}
      </div>
    </div>
  );
}
