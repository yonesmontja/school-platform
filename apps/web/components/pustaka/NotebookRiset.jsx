"use client";
// Notebook AI Tahap B: notebook riset berisi beberapa dokumen Pustaka (mis. CP + panduan asesmen + buku guru).
// Tanya ke semua dokumen sekaligus (jawaban menunjuk bagian [B#] beserta dokumennya), catatan riset tersimpan dan bisa diubah,
// lalu Jadikan… soal (Bank Soal), ATP, modul ajar, atau peta tema tanpa salin-tempel. Notebook pribadi: hanya pembuatnya yang membuka.
import { useCallback, useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import { minta } from "@/components/banksoal/api";
import { AI_MODES, bacaAiMode, simpanAiMode } from "@/components/banksoal/konstanta";
import { bukaMenuAksi } from "@/components/dashboard/menuAksi";
import JadikanSoal from "./JadikanSoal";

export const MAKS_DOKUMEN = 8;
const SARAN = [
  "Apa saja yang dibahas dokumen-dokumen ini dan bagaimana kaitannya?",
  "Bagaimana asesmen yang disarankan untuk capaian ini?",
  "Langkah pembelajaran apa yang dianjurkan untuk siswa SD?",
];
const waktu = (t) => (t ? new Date(t).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
const salin = (teks) => navigator.clipboard?.writeText(teks).then(() => Swal.fire({ toast: true, position: "top-end", icon: "success", title: "Disalin", showConfirmButton: false, timer: 1200 }));

/** Teks jawaban dengan rujukan [B#] ditandai. */
function TeksRujukan({ teks }) {
  return <div className="small" style={{ whiteSpace: "pre-wrap" }}>{String(teks).split(/(\[B\d+\])/g).map((p, i) => (/^\[B\d+\]$/.test(p) ? <span key={i} className="badge text-bg-light border fw-normal mx-1">{p.slice(1, -1)}</span> : p))}</div>;
}

/** Formulir notebook baru / ubah dokumen. dokumen = daftar dokumen Pustaka yang terlihat di halaman. */
export function FormNotebook({ awal, dokumen, onTutup, onSelesai }) {
  const [judul, setJudul] = useState(awal?.judul || "");
  const [pilih, setPilih] = useState(() => new Set((awal?.dokumen || []).map((d) => d.id_dokumen)));
  const [cari, setCari] = useState("");
  const [proses, setProses] = useState(false);
  const bisa = useMemo(() => dokumen.filter((d) => d.status_teks === "TERBACA" || pilih.has(d.id_dokumen)), [dokumen, pilih]);
  const tampil = bisa.filter((d) => !cari || `${d.judul} ${d.mapel?.nama_mapel || ""}`.toLowerCase().includes(cari.toLowerCase()));
  const ganti = (id) => setPilih((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else if (n.size < MAKS_DOKUMEN) n.add(id); return n; });

  const kirim = async (e) => {
    e.preventDefault();
    if (!judul.trim() || !pilih.size) return;
    setProses(true);
    try {
      const body = { judul: judul.trim(), dokumen: [...pilih] };
      const r = awal ? await minta("PUT", `/notebook/${awal.id_notebook}`, body) : await minta("POST", "/notebook", body);
      onSelesai(r.data);
    } catch (err) { Swal.fire("Gagal menyimpan", err.message, "error"); }
    finally { setProses(false); }
  };

  return (
    <>
      <div className="modal d-block" tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="judulFormNotebook" style={{ zIndex: 1060 }}>
        <div className="modal-dialog modal-dialog-scrollable modal-lg">
          <form className="modal-content border-0 shadow" onSubmit={kirim}>
            <div className="modal-header">
              <h5 className="modal-title fw-bold" id="judulFormNotebook"><i className="bi bi-journal-plus text-primary me-2"></i>{awal ? "Ubah notebook" : "Notebook baru"}</h5>
              <button type="button" className="btn-close" onClick={onTutup} disabled={proses} aria-label="Tutup"></button>
            </div>
            <div className="modal-body">
              <label className="form-label small fw-semibold" htmlFor="nbJudul">Judul notebook</label>
              <input id="nbJudul" className="form-control mb-3" maxLength={200} value={judul} onChange={(e) => setJudul(e.target.value)} placeholder="mis. Pengukuran kelas 2: CP + panduan asesmen" required />
              <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
                <span className="small fw-semibold">Dokumen ({pilih.size}/{MAKS_DOKUMEN})</span>
                <input type="search" className="form-control form-control-sm ms-auto" style={{ maxWidth: 240 }} placeholder="Cari dokumen…" value={cari} onChange={(e) => setCari(e.target.value)} aria-label="Cari dokumen" />
              </div>
              <div className="list-group small" data-pilih-dokumen>
                {!tampil.length ? <div className="text-body-secondary py-3 text-center">Belum ada dokumen yang teksnya terbaca.</div> : tampil.map((d) => (
                  <label key={d.id_dokumen} className="list-group-item list-group-item-action d-flex gap-2 align-items-start">
                    <input type="checkbox" className="form-check-input mt-1" checked={pilih.has(d.id_dokumen)} onChange={() => ganti(d.id_dokumen)}
                      disabled={!pilih.has(d.id_dokumen) && pilih.size >= MAKS_DOKUMEN} aria-label={d.judul} />
                    <span className="min-w-0"><span className="fw-semibold">{d.judul}</span>
                      <span className="d-block text-body-secondary">{d.mapel?.nama_mapel || "Semua mapel"}{d.fase ? ` · Fase ${d.fase}` : ""}{d.status !== "AKTIF" ? " · belum aktif" : ""}</span></span>
                  </label>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline-secondary" onClick={onTutup} disabled={proses}>Batal</button>
              <button className="btn btn-primary" disabled={proses || !judul.trim() || !pilih.size}>{proses && <span className="spinner-border spinner-border-sm me-1"></span>}Simpan notebook</button>
            </div>
          </form>
        </div>
      </div>
      <div className="modal-backdrop show" style={{ zIndex: 1055 }}></div>
    </>
  );
}

/** Formulir catatan (baru atau ubah) di dalam notebook. */
function FormCatatan({ awal, onBatal, onSimpan }) {
  const [judul, setJudul] = useState(awal?.judul || "");
  const [isi, setIsi] = useState(awal?.isi || "");
  const [proses, setProses] = useState(false);
  const kirim = async (e) => {
    e.preventDefault();
    setProses(true);
    try { await onSimpan({ judul: judul.trim(), isi: isi.trim() }); } finally { setProses(false); }
  };
  return (
    <form className="border rounded p-2 mb-2 bg-body-tertiary" onSubmit={kirim} data-form-catatan>
      <input className="form-control form-control-sm mb-2" maxLength={300} value={judul} onChange={(e) => setJudul(e.target.value)} placeholder="Judul catatan" aria-label="Judul catatan" required />
      <textarea className="form-control form-control-sm mb-2" rows={6} maxLength={20000} value={isi} onChange={(e) => setIsi(e.target.value)} placeholder="Tulis catatan riset: temuan, kaitan antardokumen, rencana pembelajaran…" aria-label="Isi catatan" required />
      <div className="d-flex gap-2 justify-content-end">
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onBatal} disabled={proses}>Batal</button>
        <button className="btn btn-sm btn-primary" disabled={proses || !judul.trim() || !isi.trim()}>{proses && <span className="spinner-border spinner-border-sm me-1"></span>}Simpan catatan</button>
      </div>
    </form>
  );
}

/** Modal notebook riset beberapa dokumen. */
export default function NotebookRiset({ id, dokumen, onTutup, onBerubah }) {
  const [nb, setNb] = useState(null);
  const [mode, setMode] = useState(bacaAiMode);
  const [pertanyaan, setPertanyaan] = useState("");
  const [proses, setProses] = useState(false);
  const [ubahNb, setUbahNb] = useState(false);
  const [formCatatan, setFormCatatan] = useState(null); // "baru" | catatan
  const [soal, setSoal] = useState(null);

  const muat = useCallback(() => minta("GET", `/notebook/${id}`).then((r) => setNb(r.data)).catch((e) => Swal.fire("Gagal memuat", e.message, "error")), [id]);
  useEffect(() => { muat(); }, [muat]);
  useEffect(() => {
    const esc = (e) => e.key === "Escape" && !proses && !ubahNb && !formCatatan && !soal && onTutup();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onTutup, proses, ubahNb, formCatatan, soal]);

  const tanya = async (e) => {
    e?.preventDefault();
    const q = pertanyaan.trim();
    if (q.length < 5) return;
    simpanAiMode(mode); setProses(true);
    try {
      const r = await minta("POST", `/notebook/${id}/tanya`, { pertanyaan: q, ai_mode: mode });
      setNb((x) => ({ ...x, catatan: [r.data, ...x.catatan] })); setPertanyaan(""); onBerubah?.();
      if (r.cukup === false) Swal.fire({ toast: true, position: "top-end", icon: "info", title: "Dokumen notebook tidak cukup membahas pertanyaan ini.", showConfirmButton: false, timer: 4000 });
    } catch (err) { Swal.fire("AI belum berhasil", err.message, "warning"); }
    finally { setProses(false); }
  };
  const simpanCatatan = async (data) => {
    try {
      const c = formCatatan === "baru" ? null : formCatatan;
      const r = await minta(c ? "PUT" : "POST", `/notebook/${id}/catatan${c ? `/${c.id}` : ""}`, data);
      setNb((x) => ({ ...x, catatan: c ? x.catatan.map((y) => (y.id === c.id ? r.data : y)) : [r.data, ...x.catatan] }));
      setFormCatatan(null); onBerubah?.();
    } catch (err) { Swal.fire("Gagal menyimpan", err.message, "error"); }
  };
  const hapusCatatan = async (c) => {
    const ok = await Swal.fire({ title: "Hapus catatan ini?", icon: "warning", showCancelButton: true, confirmButtonText: "Hapus", cancelButtonText: "Batal", confirmButtonColor: "#dc3545" });
    if (!ok.isConfirmed) return;
    try { await minta("DELETE", `/notebook/${id}/catatan/${c.id}`); setNb((x) => ({ ...x, catatan: x.catatan.filter((y) => y.id !== c.id) })); onBerubah?.(); }
    catch (err) { Swal.fire("Gagal", err.message, "error"); }
  };
  const hapusNotebook = async () => {
    const ok = await Swal.fire({ title: `Hapus notebook "${nb.judul}"?`, text: "Semua catatannya ikut terhapus. Dokumen di Pustaka tidak berubah.", icon: "warning", showCancelButton: true, confirmButtonText: "Hapus", cancelButtonText: "Batal", confirmButtonColor: "#dc3545" });
    if (!ok.isConfirmed) return;
    try { await minta("DELETE", `/notebook/${id}`); onBerubah?.(); onTutup(); } catch (err) { Swal.fire("Gagal", err.message, "error"); }
  };
  const jadikan = (e, c) => bukaMenuAksi(e.currentTarget, [
    { label: "Soal di Bank Soal", ikon: "bi-patch-question", onClick: () => setSoal(c) },
    { label: "ATP", ikon: "bi-diagram-3", onClick: () => window.open(`/dashboard/perangkat-ajar?notebook=${c.id}`, "_blank", "noopener") },
    { label: "Modul ajar", ikon: "bi-journal-richtext", onClick: () => window.open(`/dashboard/perangkat-ajar?tab=modul&notebook=${c.id}`, "_blank", "noopener") },
    { label: "Peta tema", ikon: "bi-bezier2", onClick: () => window.open(`/dashboard/perangkat-ajar?tab=tema&notebook=${c.id}`, "_blank", "noopener") },
  ]);

  return (
    <>
      <div className="modal d-block" tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="judulNotebookRiset">
        <div className="modal-dialog modal-xl modal-fullscreen-lg-down modal-dialog-scrollable">
          <div className="modal-content" id="notebook-riset">
            <div className="modal-header">
              <div className="min-w-0">
                <h5 className="modal-title fw-bold text-truncate" id="judulNotebookRiset"><i className="bi bi-journals text-primary me-2"></i>{nb?.judul || "Notebook"}</h5>
                <div className="d-flex flex-wrap gap-1 mt-1" data-dokumen-notebook>
                  {nb?.dokumen?.map((d) => <span key={d.id_dokumen} className="badge text-bg-light border fw-normal text-truncate" style={{ maxWidth: 280 }}><i className="bi bi-file-earmark-text me-1"></i>{d.judul}</span>)}
                </div>
              </div>
              <div className="d-flex gap-1 ms-2 flex-shrink-0">
                <button className="btn btn-sm btn-outline-secondary" onClick={() => setUbahNb(true)} disabled={!nb || proses}><i className="bi bi-pencil-square me-1"></i>Ubah dokumen</button>
                <button className="btn btn-sm btn-outline-danger" onClick={hapusNotebook} disabled={!nb || proses} aria-label="Hapus notebook"><i className="bi bi-trash"></i></button>
                <button type="button" className="btn-close ms-1" onClick={onTutup} disabled={proses} aria-label="Tutup"></button>
              </div>
            </div>
            <div className="modal-body">
              {!nb ? <div className="text-center py-5"><span className="spinner-border spinner-border-sm"></span></div> : (
                <div className="row g-3">
                  <div className="col-lg-5">
                    <h6 className="fw-bold"><i className="bi bi-chat-square-text text-primary me-1"></i>Tanya semua dokumen</h6>
                    <form onSubmit={tanya}>
                      <textarea className="form-control form-control-sm mb-2" rows={3} maxLength={500} value={pertanyaan} onChange={(e) => setPertanyaan(e.target.value)}
                        placeholder="mis. Bagaimana CP pengukuran dinilai menurut panduan asesmen?" aria-label="Pertanyaan untuk notebook"
                        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.form.requestSubmit(); } }} />
                      <div className="d-flex flex-wrap gap-2 align-items-center">
                        <select className="form-select form-select-sm w-auto" value={mode} onChange={(e) => setMode(e.target.value)} aria-label="Penyedia AI">{AI_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select>
                        <button className="btn btn-sm btn-primary" disabled={proses || pertanyaan.trim().length < 5}>
                          {proses ? <><span className="spinner-border spinner-border-sm me-1"></span>Mencari di {nb.dokumen.length} dokumen…</> : <><i className="bi bi-send me-1"></i>Tanya</>}</button>
                      </div>
                    </form>
                    <div className="form-text mb-2">AI mencari bagian yang relevan di setiap dokumen. Jawaban menyebut nomor bagian dan dokumennya, lalu tersimpan sebagai catatan.</div>
                    <div className="d-flex flex-column gap-1 mb-3">
                      {SARAN.map((s) => <button key={s} type="button" className="btn btn-sm btn-light border text-start" onClick={() => setPertanyaan(s)} disabled={proses}><i className="bi bi-lightbulb me-1 text-warning"></i>{s}</button>)}
                    </div>
                    <div className="alert alert-light border small mb-0">
                      <b>Jadikan…</b> di tiap catatan mengirim catatan itu sebagai bahan AI ke <b>soal</b> (Bank Soal), <b>ATP</b>, <b>modul ajar</b>, atau <b>peta tema</b>. Hasilnya tetap draf untuk Anda periksa.
                    </div>
                  </div>

                  <div className="col-lg-7">
                    <div className="d-flex align-items-center mb-2">
                      <h6 className="fw-bold mb-0 me-auto"><i className="bi bi-stickies text-primary me-1"></i>Catatan riset <span className="badge text-bg-light border">{nb.catatan.length}</span></h6>
                      <button className="btn btn-sm btn-outline-primary" onClick={() => setFormCatatan("baru")} disabled={!!formCatatan}><i className="bi bi-plus-lg me-1"></i>Catatan baru</button>
                    </div>
                    {formCatatan === "baru" && <FormCatatan onBatal={() => setFormCatatan(null)} onSimpan={simpanCatatan} />}
                    {!nb.catatan.length && formCatatan !== "baru" && <div className="text-body-secondary small border rounded p-4 text-center">Belum ada catatan. Ajukan pertanyaan ke semua dokumen, atau tulis catatan sendiri.</div>}
                    <div className="d-flex flex-column gap-2">
                      {nb.catatan.map((c) => formCatatan?.id === c.id ? <FormCatatan key={c.id} awal={c} onBatal={() => setFormCatatan(null)} onSimpan={simpanCatatan} /> : (
                        <div key={c.id} className="border rounded p-2" data-catatan={c.id}>
                          <div className="d-flex align-items-start gap-2 mb-1">
                            <span className={`badge ${c.jenis === "TANYA" ? "text-bg-primary" : "text-bg-secondary"}`}>{c.jenis === "TANYA" ? "Jawaban AI" : "Catatan saya"}</span>
                            <span className="fw-semibold small me-auto">{c.judul}</span>
                            <span className="small text-body-secondary text-nowrap">{waktu(c.updated_at)}</span>
                          </div>
                          <TeksRujukan teks={c.isi} />
                          {c.rujukan?.length > 0 && (
                            <details className="small mt-1">
                              <summary className="text-body-secondary">{c.rujukan.length} bagian dokumen dirujuk</summary>
                              {c.rujukan.map((b) => (
                                <div key={b.no} className="border-start border-3 ps-2 my-1">
                                  <div className="fw-semibold">B{b.no} · {b.judul} <span className="text-body-secondary fw-normal">(bagian {b.bagian})</span></div>
                                  <div className="text-body-secondary" style={{ whiteSpace: "pre-wrap" }}>{b.teks.length > 500 ? `${b.teks.slice(0, 500)}…` : b.teks}</div>
                                </div>
                              ))}
                            </details>
                          )}
                          <div className="d-flex flex-wrap gap-1 justify-content-end mt-2">
                            <button className="btn btn-sm btn-outline-secondary" onClick={() => salin(`${c.judul}\n\n${c.isi}`)}><i className="bi bi-clipboard me-1"></i>Salin</button>
                            <button className="btn btn-sm btn-outline-secondary" onClick={() => setFormCatatan(c)} disabled={!!formCatatan}><i className="bi bi-pencil me-1"></i>Ubah</button>
                            <button className="btn btn-sm btn-outline-danger" onClick={() => hapusCatatan(c)} aria-label={`Hapus catatan ${c.judul}`}><i className="bi bi-trash"></i></button>
                            <button className="btn btn-sm btn-success" onClick={(e) => jadikan(e, c)} aria-haspopup="menu"><i className="bi bi-magic me-1"></i>Jadikan…</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="modal-backdrop show"></div>
      {ubahNb && nb && <FormNotebook awal={nb} dokumen={dokumen} onTutup={() => setUbahNb(false)} onSelesai={(d) => { setUbahNb(false); setNb(d); onBerubah?.(); }} />}
      {soal && <JadikanSoal riset={{ jenis: "CATATAN", pertanyaan: soal.judul }} catatan={soal} dokumen={{ judul: nb.judul, id_mapel: nb.dokumen.find((d) => d.id_mapel)?.id_mapel || "" }} onTutup={() => setSoal(null)} />}
    </>
  );
}

/** Kartu "Notebook riset" di halaman Pustaka Dokumen: daftar notebook milik akun ini + tombol notebook baru. */
export function DaftarNotebook({ dokumen }) {
  const [daftar, setDaftar] = useState(null);
  const [baru, setBaru] = useState(false);
  const [buka, setBuka] = useState(null);
  const muat = useCallback(() => minta("GET", "/notebook").then((r) => setDaftar(r.data)).catch(() => setDaftar(false)), []);
  useEffect(() => { muat(); }, [muat]);

  // Peninjau (lihat saja) tidak punya notebook: kartu disembunyikan
  if (daftar === false) return null;
  return (
    <div className="card shadow-sm mb-3" data-daftar-notebook>
      <div className="card-header d-flex flex-wrap align-items-center gap-2">
        <div className="me-auto min-w-0">
          <span className="fw-semibold"><i className="bi bi-journals text-primary me-1"></i>Notebook riset</span>
          <span className="small text-body-secondary ms-2">Gabungkan beberapa dokumen (mis. CP + panduan asesmen + buku guru), tanya sekaligus, simpan catatan, lalu jadikan soal atau perangkat ajar.</span>
        </div>
        <button className="btn btn-sm btn-primary" onClick={() => setBaru(true)}><i className="bi bi-journal-plus me-1"></i>Notebook baru</button>
      </div>
      <div className="card-body py-2">
        {!daftar ? <span className="spinner-border spinner-border-sm text-secondary"></span>
          : !daftar.length ? <div className="small text-body-secondary">Belum ada notebook. Notebook bersifat pribadi: hanya Anda yang melihat isinya.</div>
          : (
            <div className="d-flex flex-wrap gap-2">
              {daftar.map((n) => (
                <button key={n.id_notebook} type="button" className="btn btn-light border text-start" style={{ maxWidth: 320 }} onClick={() => setBuka(n.id_notebook)}>
                  <div className="fw-semibold text-truncate">{n.judul}</div>
                  <div className="small text-body-secondary">{n.dokumen.length} dokumen · {n.catatan_count} catatan · {waktu(n.updated_at)}</div>
                </button>
              ))}
            </div>
          )}
      </div>
      {baru && <FormNotebook dokumen={dokumen} onTutup={() => setBaru(false)} onSelesai={(n) => { setBaru(false); muat(); setBuka(n.id_notebook); }} />}
      {buka && <NotebookRiset id={buka} dokumen={dokumen} onTutup={() => { setBuka(null); muat(); }} onBerubah={muat} />}
    </div>
  );
}
